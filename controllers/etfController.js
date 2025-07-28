const yahooFinance = require("yahoo-finance2").default;
const { TrackedEtf, EtfTransaction } = require("../models/ETF");
const getAuthUserId = require("../utils/auth");
const verifyOwnership = require("../utils/authorize");
const aggregateValidationErrors = require("../utils/validation");
const {
  validateTicker,
  validateTargetAllocation,
  validateManagementFee,
  validateOrderDate,
  validateUnits,
  validateOrderPrice,
  validateBrokerage,
} = require("../validators/etfValidation");
const {
  formatErrorResponse,
  normalizeTicker,
  fetchAndValidateETFQuote,
} = require("../utils/etfUtils");

// GET /api/etfs
const getTrackedETFs = async (req, res) => {
  const auth0Id = getAuthUserId(req);

  // Find Tracked ETFs from Mongo
  const trackedETFs = await TrackedEtf.find({ ownerId: auth0Id }).lean();
  const trackedTickersArray = trackedETFs.map((etf) => etf.ticker);

  // Fetch market data for tracked ETFs
  const quoteData = await yahooFinance.quote(trackedTickersArray, {
    fields: ["longName", "regularMarketPrice", "currency"],
  });

  // Combine market data with tracked ETF objects
  const combinedETFsData = trackedETFs.map((trackedETF) => {
    const matchingQuote = quoteData.find(
      (quote) => quote.symbol === trackedETF.ticker
    );

    if (matchingQuote) {
      return {
        ...trackedETF,
        fund_name: matchingQuote.longName,
        currency: matchingQuote.currency,
        live_price: matchingQuote.regularMarketPrice,
        live_value: matchingQuote.regularMarketPrice * trackedETF.held_units,
      };
    } else {
      console.warn(`No quote data found for ticker: ${trackedETF.ticker}`);
      return trackedETF;
    }
  });

  return res.status(200).json(combinedETFsData);
};

// POST /api/etfs
const createTrackedETF = async (req, res) => {
  const { ticker } = req.body;
  const auth0Id = getAuthUserId(req);
  const capitalisedTicker = normalizeTicker(ticker);

  // Validate ticker
  const tickerError = validateTicker(capitalisedTicker);
  if (tickerError.length > 0)
    return res.status(400).json({ success: false, message: tickerError[0] });

  const existingEtf = await TrackedEtf.findOne({
    ticker: capitalisedTicker,
    ownerId: auth0Id,
  });

  // Check for duplicate tracked ETF
  if (existingEtf) {
    console.warn(
      `Attempted to create duplicate ETF for ${auth0Id}: ${capitalisedTicker}`
    );
    return formatErrorResponse(
      res,
      409,
      "ETF with this ticker already exists for this user.",
      { ticker: ["ETF with this ticker already exists."] }
    );
  }

  // Validate ETF and fetch market data
  let quote;
  try {
    quote = await fetchAndValidateETFQuote(capitalisedTicker);
  } catch (err) {
    return formatErrorResponse(res, 400, err.message, {
      ticker: [err.message],
    });
  }

  // Create new Tracked Etf object
  const newTrackedEtf = await TrackedEtf.create({
    ticker: capitalisedTicker,
    ownerId: auth0Id,
    held_units: 0,
    avg_price: 0,
  });

  const combinedNewEtfData = {
    ...newTrackedEtf.toObject(),
    fund_name: quote.longName,
    currency: quote.currency,
    live_price: quote.regularMarketPrice,
    live_value: quote.regularMarketPrice * newTrackedEtf.held_units,
  };

  return res.status(201).json(combinedNewEtfData);
};

// PUT /api/etfs/:id
const updateTrackedETF = async (req, res) => {
  const { id } = req.params;
  const { target_allocation, management_fee } = req.body;
  const auth0Id = getAuthUserId(req);

  // Find the tracked ETF by ID
  let trackedETF = await TrackedEtf.findById(id);

  // Check if entry exists
  if (!trackedETF) {
    console.log(`Tracked ETF with ID: ${id} not found`);
    return res
      .status(404)
      .json({ success: false, message: "Tracked ETF not found" });
  }

  // Authorization check: Ensure the authenticated user owns this entry
  verifyOwnership(trackedETF, auth0Id, "tracked ETF");

  // --- Perform Validation for provided fields ---
  const validations = {};

  if (target_allocation !== undefined)
    validations.target_allocation = validateTargetAllocation(target_allocation);
  if (management_fee !== undefined)
    validations.management_fee = validateManagementFee(management_fee);
  const { hasErrors, structuredErrors, flatMessage } =
    aggregateValidationErrors(validations);

  if (hasErrors) {
    return res.status(400).json({
      success: false,
      message: flatMessage,
      errors: structuredErrors,
    });
  }

  // Apply updates only if the field is provided in the request body
  if (target_allocation !== undefined)
    trackedETF.target_allocation = target_allocation;
  if (management_fee !== undefined) trackedETF.management_fee = management_fee;

  // Save updated entry
  const updatedTrackedETF = await trackedETF.save();
  let combinedResponse = updatedTrackedETF.toObject();

  // Fetch live quote data
  try {
    const quoteDataArray = await yahooFinance.quote(
      [updatedTrackedETF.ticker],
      {
        fields: ["longName", "regularMarketPrice", "currency"],
      }
    );

    const quote = quoteDataArray?.[0];
    if (quote) {
      combinedResponse = {
        ...combinedResponse,
        fund_name: quote.longName || null,
        currency: quote.currency || null,
        live_price: quote.regularMarketPrice || null,
        live_value:
          (quote.regularMarketPrice ?? 0) * updatedTrackedETF.held_units,
      };
    } else {
      console.warn(`No quote found for ${updatedTrackedETF.ticker}`);
      combinedResponse = {
        ...combinedResponse,
        fund_name: null,
        currency: null,
        live_price: null,
        live_value: 0,
      };
    }
  } catch (error) {
    console.error(
      `Failed to fetch quote for ${updatedTrackedETF.ticker}:`,
      error
    );
    combinedResponse = {
      ...combinedResponse,
      fund_name: null,
      currency: null,
      live_price: null,
      live_value: 0,
    };
  }

  res.status(200).json(combinedResponse);
};

// DELETE /api/etfs/:id
const deleteTrackedETF = async (req, res) => {
  const { id } = req.params;
  const auth0Id = getAuthUserId(req);

  // Find the tracked ETF by ID
  const trackedETF = await TrackedEtf.findById(id);

  // Check if tracked ETF exists
  if (!trackedETF) {
    console.log(`Tracked ETF with ID: ${id} not found for deletion.`);
    return res.status(404).json({ message: "Tracked ETF not found." });
  }

  // Check if held units it > 0
  if (trackedETF.held_units > 0) {
    console.log(
      `Tracked ETF, ${trackedETF.ticker} held units are greater than 0.`
    );
    return res.status(400).json({
      message: `Cannot delete ${trackedETF.ticker} because held units are greater than 0.`,
    });
  }

  // Authorization check: Ensure the authenticated user owns this entry
  if (trackedETF.ownerId !== auth0Id) {
    console.warn(
      `Unauthorized attempt to delete entry ${id} by user ${auth0Id}. Owner is ${trackedETF.ownerId}.`
    );
    return res
      .status(403)
      .json({ message: "Not authorized to delete this cash entry" });
  }

  await TrackedEtf.deleteOne({ _id: id });

  res.status(200).json({ message: "Tracked ETF deleted successfully" });
};

// GET /api/etfs/transactions
const getETFsTransactions = async (req, res) => {
  const auth0Id = getAuthUserId(req);

  // Fetch ETF transactions from Mongo
  const etfTransactions = await EtfTransaction.find({ ownerId: auth0Id });

  // Return ETF transactions
  return res.status(200).json(etfTransactions);
};

// POST /api/etfs/transactions
const createETFTransaction = async (req, res) => {
  const { ticker, order_date, units, order_price, brokerage } = req.body;
  const auth0Id = getAuthUserId(req);
  const capitalisedTicker = normalizeTicker(ticker);

  // Perform Validation
  const { hasErrors, structuredErrors, flatMessage } =
    aggregateValidationErrors({
      ticker: validateTicker(capitalisedTicker),
      order_date: validateOrderDate(order_date),
      units: validateUnits(units),
      order_price: validateOrderPrice(order_price),
      brokerage: validateBrokerage(brokerage),
    });

  if (hasErrors) {
    return res
      .status(400)
      .json({ success: false, message: flatMessage, errors: structuredErrors });
  }

  // Validate ETF
  try {
    await fetchAndValidateETFQuote(capitalisedTicker);
  } catch (err) {
    return formatErrorResponse(res, 400, err.message, {
      ticker: [err.message],
    });
  }

  // Create ETF Transaction
  const etfTransaction = await EtfTransaction.create({
    ticker: capitalisedTicker,
    order_date,
    units,
    order_price,
    brokerage,
    order_value: units * order_price,
    ownerId: auth0Id,
  });

  // Return object
  return res.status(200).json(etfTransaction);
};

// PUT /api/etfs/transactions/:id
const updateETFTransaction = async (req, res) => {
  console.log("Updating ETF Transaction");
};

// DELETE /api/etfs/transactions/:id
const deleteETFTransaction = async (req, res) => {
  console.log("Deleting ETF Transaction");
};

module.exports = {
  getTrackedETFs,
  createTrackedETF,
  updateTrackedETF,
  deleteTrackedETF,
  getETFsTransactions,
  createETFTransaction,
  updateETFTransaction,
  deleteETFTransaction,
};
