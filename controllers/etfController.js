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
  validateAction,
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
  const etfTransactions = await EtfTransaction.find({
    ownerId: auth0Id,
  }).lean();

  if (etfTransactions.length > 0) {
    const tickers = [...new Set(etfTransactions.map((t) => t.ticker))];
    const quotes = await yahooFinance.quote(tickers);

    const quoteMap = Array.isArray(quotes)
      ? quotes.reduce((acc, q) => {
          acc[q.symbol] = q;
          return acc;
        }, {})
      : { [quotes.symbol]: quotes };

    const formattedTransactions = etfTransactions.map((txn) => {
      const quote = quoteMap[txn.ticker];
      const livePrice = quote?.regularMarketPrice ?? null;

      return {
        ...txn,
        order_date: txn.order_date
          ? txn.order_date.toISOString().split("T")[0]
          : null,
        live_price: livePrice,
        live_value: livePrice ? livePrice * txn.units : null,
        order_value: txn.units * txn.order_price,
        capital_gains_$: livePrice ? livePrice - txn.order_price : null,
        "capital_gains_%": livePrice
          ? ((livePrice - txn.order_price) / txn.order_price) * 100
          : null,
      };
    });

    return res.status(200).json(formattedTransactions);
  } else {
    return res.status(200).json([]);
  }
};

// POST /api/etfs/transactions
const createETFTransaction = async (req, res) => {
  const { action, ticker, order_date, units, order_price, brokerage } =
    req.body;
  const auth0Id = getAuthUserId(req);
  const capitalisedTicker = normalizeTicker(ticker);

  // Perform Validation
  const { hasErrors, structuredErrors, flatMessage } =
    aggregateValidationErrors({
      action: validateAction(action),
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
  try {
    // Validate ETF
    const quote = await fetchAndValidateETFQuote(capitalisedTicker);

    // Create ETF Transaction
    const etfTransaction = new EtfTransaction({
      action,
      ticker: capitalisedTicker,
      order_date,
      units,
      order_price,
      brokerage,
      order_value: units * order_price,
      ownerId: auth0Id,
    });

    const transactionObject = etfTransaction.toObject();

    // Prepare the combined ETF transaction object for the response
    const combinedEtfTransaction = {
      ...transactionObject,
      live_price: quote.regularMarketPrice,
      live_value: quote.regularMarketPrice * units,
      capital_gains_$: quote.regularMarketPrice - order_price,
      "capital_gains_%":
        ((quote.regularMarketPrice - order_price) / order_price) * 100,
    };

    // Fetch trackedETF entry from Mongo
    let trackedEtf = await TrackedEtf.findOne({
      ticker: capitalisedTicker,
      ownerId: auth0Id,
    });

    if (!trackedEtf) {
      // If no tracked ETF exists for this ticker and owner, create a new one if its a buy order
      if (action === "buy") {
        trackedEtf = new TrackedEtf({
          ticker: capitalisedTicker,
          held_units: units,
          avg_price: order_price,
          ownerId: auth0Id,
        });

        await trackedEtf.save();
      } else if (action === "sell") {
        // If it's a sell order for an ETF that isn't currently tracked, return an error
        throw new Error(
          `Cannot sell ${capitalisedTicker}. You do not currently track this ETF.`
        );
      }
    } else {
      // If a tracked ETF already exists, update its held_units and avg_price
      const oldHeldUnits = trackedEtf.held_units;
      const oldAvgPrice = trackedEtf.avg_price;

      if (action === "buy") {
        // Update units
        trackedEtf.held_units += units;

        // Update avg price
        const totalCostOld = oldHeldUnits * oldAvgPrice;
        const totalCostNew = units * order_price;
        const totalUnitsOldAndNew = oldHeldUnits + units;

        trackedEtf.avg_price =
          (totalCostOld + totalCostNew) / totalUnitsOldAndNew;
      } else if (action === "sell") {
        // If the held units go below 0, return an error
        if (units > oldHeldUnits) {
          throw new Error(
            `Cannot sell ${units} units of ${capitalisedTicker}. You only hold ${oldHeldUnits} units.`
          );
        }

        // Update units
        trackedEtf.held_units -= units;

        // If total units become 0 after a sale, set avg_price to 0
        if (trackedEtf.held_units === 0) trackedEtf.avg_price = 0;
      }

      // Save trackEtf data
      await trackedEtf.save();
    }

    // Prepare trackedEtf for response
    const finalTrackedEtf = {
      ...trackedEtf.toObject(),
      fund_name: quote.longName,
      currency: quote.currency,
      live_price: quote.regularMarketPrice,
      live_value: quote.regularMarketPrice * trackedEtf.held_units,
    };

    return res.status(200).json({
      etfTransaction: combinedEtfTransaction,
      trackedEtf: finalTrackedEtf,
    });
  } catch (err) {
    return formatErrorResponse(res, 400, err.message, {
      ticker: [err.message],
    });
  }
};

// DELETE /api/etfs/transactions/:id
const deleteETFTransaction = async (req, res) => {
  const { id } = req.params;
  const auth0Id = getAuthUserId(req);

  try {
    // 1. Find the transaction to be deleted and verify ownership
    const etfTransactionToDelete = await EtfTransaction.findOne({
      _id: id,
      ownerId: auth0Id,
    });

    if (!etfTransactionToDelete) {
      return formatErrorResponse(
        res,
        404,
        "ETF transaction not found or unauthorised."
      );
    }

    // 2. Find the corresponding TrackedEtf
    let trackedEtf = await TrackedEtf.findOne({
      ticker: etfTransactionToDelete.ticker,
      ownerId: auth0Id,
    });

    let finalTrackedEtf = null;

    if (!trackedEtf) {
      // This scenario implies a data inconsistency
      console.warn(
        `TrackedEtf not found for ticker ${etfTransactionToDelete.ticker} and owner ${auth0Id} during transaction deletion.`
      );
    } else {
      // 3. Reverse the effect of the transaction on the trackedEtf
      const oldHeldUnits = trackedEtf.held_units;
      const oldAvgPrice = trackedEtf.avg_price;
      const transactionUnits = etfTransactionToDelete.units;
      const transactionOrderPrice = etfTransactionToDelete.order_price;

      if (transactionUnits > 0) {
        // This was a BUY transaction, so we need to subtract units and recalculate avg_price
        const newHeldUnits = oldHeldUnits - transactionUnits;

        if (newHeldUnits < 0) {
          // This indicates an inconsistency: trying to delete a buy that would result in negative units.
          // This could happen if subsequent sells were recorded that shouldn't have been possible.
          console.warn(
            `Deleting buy transaction would make held_units negative for ${trackedEtf.ticker}. Held ${oldHeldUnits}, Deleting: ${transactionUnits}. Reverting held units to original.`
          );
          trackedEtf.held_units = oldHeldUnits;
          throw new Error(
            "Cannot delete transaction: it would lead to negative held units."
          );
        } else {
          trackedEtf.held_units = newHeldUnits;
          // Recalculate average price
          const totalValueBeforeTransaction = oldHeldUnits * oldAvgPrice;
          const valueToRemove = transactionUnits * transactionOrderPrice;
          const newTotalValue = totalValueBeforeTransaction - valueToRemove;

          trackedEtf.avg_price =
            newHeldUnits > 0 ? newTotalValue / newHeldUnits : 0;
        }
      } else if (transactionUnits < 0) {
        // This was a SELL transaction, so we need to add units back (units are negative, so subtract a negative)
        trackedEtf.held_units -= transactionUnits; // Adds the absolute value of units
        // Average price remains unchanged for sell transactions
      }

      // Save the updated trackedEtf
      await trackedEtf.save();

      // 4. Prepare the trackedEtf object to be consistent with getTrackedETFs
      // Fetch additional live data for the updated trackedEtf
      const latestQuoteData = await yahooFinance.quote(trackedEtf.ticker, {
        fields: ["longName", "regularMarketPrice", "currency"],
      });

      const matchingQuote = latestQuoteData; // For a single ticker, the result is directly the quote object

      if (matchingQuote) {
        finalTrackedEtf = {
          ...trackedEtf.toObject(), // Convert Mongoose document to plain JavaScript object
          fund_name: matchingQuote.longName,
          currency: matchingQuote.currency,
          live_price: matchingQuote.regularMarketPrice,
          live_value: matchingQuote.regularMarketPrice * trackedEtf.held_units,
        };
      } else {
        console.warn(
          `No live quote data found for updated tracked ETF: ${trackedEtf.ticker}`
        );
        finalTrackedEtf = trackedEtf.toObject(); // Fallback to just the saved data
      }
    }

    // 5. Delete the ETF transaction
    await EtfTransaction.deleteOne({ _id: id });

    // 6. Return success response
    return res.status(200).json({
      success: true,
      message: "ETF transaction deleted successfully.",
      deletedTransactionId: id,
      trackedEtf: finalTrackedEtf,
    });
  } catch (err) {
    return formatErrorResponse(
      res,
      500,
      "Failed to delete ETF transaction.",
      err
    );
  }
};

module.exports = {
  getTrackedETFs,
  createTrackedETF,
  updateTrackedETF,
  deleteTrackedETF,
  getETFsTransactions,
  createETFTransaction,
  deleteETFTransaction,
};
