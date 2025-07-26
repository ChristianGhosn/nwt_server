const yahooFinance = require("yahoo-finance2").default;
const { TrackedEtf } = require("../models/ETF");
const getAuthUserId = require("../utils/auth");
const verifyOwnership = require("../utils/authorize");
const aggregateValidationErrors = require("../utils/validation");
const {
  validateTicker,
  validateTargetAllocation,
  validateManagementFee,
} = require("../validators/etfValidation");

// GET /api/etfs
const getTrackedETFs = async (req, res) => {
  const auth0Id = getAuthUserId(req);

  console.log("--- GET /api/etfs START ---");
  console.log("Auth0 ID for fetching cash entries:", auth0Id);

  const trackedETFs = await TrackedEtf.find({ ownerId: auth0Id }).lean();
  const trackedTickersArray = trackedETFs.map((etf) => etf.ticker);

  const quoteData = await yahooFinance.quote(trackedTickersArray, {
    fields: ["longName", "regularMarketPrice", "currency"],
  });

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

  console.log(
    `SUCCESS: Fetched ${combinedETFsData.length} ETFs for user ${auth0Id}.`
  );

  console.log("--- GET /api/etfs END ---");

  return res.status(200).json(combinedETFsData);
};

// POST /api/etfs
const createTrackedETF = async (req, res) => {
  const { ticker } = req.body;
  const auth0Id = getAuthUserId(req);

  // Validate ticker
  const tickerError = validateTicker(ticker);
  if (tickerError.length > 0)
    return res.status(400).json({ success: false, message: tickerError[0] });

  const capitalisedTicker = ticker.toUpperCase();

  console.log("--- POST /api/etf START ---");
  console.log("Received data for creation (req.body): ", {
    capitalisedTicker,
  });
  console.log("Auth0 ID for creation: ", auth0Id);

  const existingEtf = await TrackedEtf.findOne({
    ticker: capitalisedTicker,
    ownerId: auth0Id,
  });
  if (existingEtf) {
    console.warn(
      `Attempted to create duplicate ETF for ${auth0Id}: ${capitalisedTicker}`
    );
    return res.status(409).json({
      success: false,
      message: "ETF with this ticker already exists for this user.",
      errors: { ticker: ["ETF with this ticker already exists."] }, // Provide structured error for frontend validation
    });
  }

  // 1. Fetch live data for the newly created ETF from Yahoo Finance & check if it an ETF
  const quoteDataArray = await yahooFinance.quote([capitalisedTicker], {
    fields: ["longName", "regularMarketPrice", "currency"],
  });

  if (quoteDataArray[0].quoteType !== "ETF") {
    console.warn(`Ticker ${capitalisedTicker} not an ETF`);
    return res.status(400).json({
      success: false,
      message: `Ticker ${capitalisedTicker} not an ETF.`,
      errors: { ticker: [`${capitalisedTicker} not an ETF.`] },
    });
  }

  // 2. Create the TrackedEtf document in the database
  const newTrackedEtfDoc = await TrackedEtf.create({
    ticker: capitalisedTicker,
    ownerId: auth0Id,
    // Initialize other fields if necessary, e.g., held_units: 0, avg_price: 0
    held_units: 0, // Ensure initial units are 0 for a newly tracked ETF
    avg_price: 0,
  });

  console.log(
    "INFO: Tracked ETF entry created in DB: ",
    newTrackedEtfDoc.toObject()
  );

  let combinedNewEtfData = newTrackedEtfDoc.toObject(); // Convert Mongoose doc to plain object

  // 3. Combine the newly created TrackedEtf document's data with the live data
  if (quoteDataArray && quoteDataArray.length > 0) {
    const matchingQuote = quoteDataArray[0]; // Since we queried for a single ticker
    combinedNewEtfData = {
      ...combinedNewEtfData,
      fund_name: matchingQuote.longName,
      currency: matchingQuote.currency,
      live_price: matchingQuote.regularMarketPrice,
      // Calculate live_value for a newly tracked ETF (held_units should be 0)
      live_value:
        matchingQuote.regularMarketPrice * combinedNewEtfData.held_units,
    };
    console.log("INFO: Live data fetched and combined for new ETF.");
  } else {
    console.warn(
      `WARNING: No live quote data found for newly created ticker: ${capitalisedTicker}`
    );
    // If no quote data, still return the basic tracked ETF data
    combinedNewEtfData = {
      ...combinedNewEtfData,
      fund_name: null, // Or 'N/A'
      currency: null, // Or 'N/A'
      live_price: null, // Or 0
      live_value: 0,
    };
  }

  console.log("SUCCESS: Tracked ETF entry created: ", combinedNewEtfData);
  console.log("--- POST /api/etf END ---");

  res.status(201).json(combinedNewEtfData);
};

// PUT /api/etfs/:id
const updateTrackedETF = async (req, res) => {
  const { id } = req.params;
  const { target_allocation, management_fee } = req.body;
  const auth0Id = getAuthUserId(req);

  console.log(`--- PUT /api/etfs/${id} START ---`);
  console.log("Received update data:", { target_allocation, management_fee });
  console.log("Auth0 ID for update authorization:", auth0Id);

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

  console.log("Tracked ETF updated successfully:", combinedResponse);
  console.log(`--- PUT /api/etfs/${id} END ---`);
  res.status(200).json(combinedResponse);
};

// DELETE /api/etfs/:id
const deleteTrackedETF = async (req, res) => {
  console.log("Deleting tracked ETF");
  const { id } = req.params;
  const auth0Id = getAuthUserId(req);

  console.log(`Attempting to delete tracked ETF with ID: ${id}`);
  console.log("Auth0 ID for delete authorization:", auth0Id);

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

  console.log(`Tracked ETF with ID: ${id} deleted successfully.`);
  res.status(200).json({ message: "Tracked ETF deleted successfully" });
};

module.exports = {
  getTrackedETFs,
  createTrackedETF,
  updateTrackedETF,
  deleteTrackedETF,
};
