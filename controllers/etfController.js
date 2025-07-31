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
const handleBuyAsset = require("../utils/handleBuyAsset");
const handleSellAsset = require("../utils/handleSellAsset");
const reverseFifoSell = require("../utils/reverseFifoSell");

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
        fundName: matchingQuote.longName,
        currency: matchingQuote.currency,
        livePrice: matchingQuote.regularMarketPrice,
        live_value: matchingQuote.regularMarketPrice * trackedETF.heldUnits,
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
    heldUnits: 0,
    avgPrice: 0,
  });

  const combinedNewEtfData = {
    ...newTrackedEtf.toObject(),
    fundName: quote.longName,
    currency: quote.currency,
    livePrice: quote.regularMarketPrice,
    live_value: quote.regularMarketPrice * newTrackedEtf.heldUnits,
  };

  return res.status(201).json(combinedNewEtfData);
};

// PUT /api/etfs/:id
const updateTrackedETF = async (req, res) => {
  const { id } = req.params;
  const { targetAllocation, managementFee } = req.body;
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

  if (targetAllocation !== undefined)
    validations.targetAllocation = validateTargetAllocation(targetAllocation);
  if (managementFee !== undefined)
    validations.managementFee = validateManagementFee(managementFee);
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
  if (targetAllocation !== undefined)
    trackedETF.targetAllocation = targetAllocation;
  if (managementFee !== undefined) trackedETF.managementFee = managementFee;

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
        fundName: quote.longName || null,
        currency: quote.currency || null,
        livePrice: quote.regularMarketPrice || null,
        live_value:
          (quote.regularMarketPrice ?? 0) * updatedTrackedETF.heldUnits,
      };
    } else {
      console.warn(`No quote found for ${updatedTrackedETF.ticker}`);
      combinedResponse = {
        ...combinedResponse,
        fundName: null,
        currency: null,
        livePrice: null,
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
      fundName: null,
      currency: null,
      livePrice: null,
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
  if (trackedETF.heldUnits > 0) {
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
      const marketPrice = quote?.regularMarketPrice ?? null;

      const base = {
        ...txn,
        orderDate: txn.orderDate
          ? txn.orderDate.toISOString().split("T")[0]
          : null,
        orderValue: txn.units * txn.orderPrice,
      };

      // BUY transaction logic
      if (txn.action === "buy") {
        const withGains = {
          ...base,
          livePrice: marketPrice,
          live_value: marketPrice ? marketPrice * txn.units : null,
          capitalGains$: marketPrice ? marketPrice - txn.orderPrice : null,
          "capitalGains%": marketPrice
            ? ((marketPrice - txn.orderPrice) / txn.orderPrice) * 100
            : null,
        };

        // If remainingUnits is 0, strip out gain-related fields
        if (txn.remainingUnits === 0) {
          const {
            capitalGains$,
            "capitalGains%": capitalGainsPercent,
            capitalGains,
            ...cleaned
          } = withGains;
          return cleaned;
        }

        return withGains;
      }

      // For SELL transactions, remove sell-only irrelevant fields
      const {
        soldUnits,
        livePrice,
        live_value,
        capitalGains$,
        "capitalGains%": cgPercent,
        remainingUnits,
        ...cleanedTxn
      } = base;

      return cleanedTxn;
    });

    return res.status(200).json(formattedTransactions);
  } else {
    return res.status(200).json([]);
  }
};

// POST /api/etfs/transactions
const createETFTransaction = async (req, res) => {
  const { action, ticker, orderDate, units, orderPrice, brokerage } = req.body;
  const auth0Id = getAuthUserId(req);
  const capitalisedTicker = normalizeTicker(ticker);

  // Perform Validation
  const { hasErrors, structuredErrors, flatMessage } =
    aggregateValidationErrors({
      action: validateAction(action),
      ticker: validateTicker(capitalisedTicker),
      orderDate: validateOrderDate(orderDate),
      units: validateUnits(units),
      orderPrice: validateOrderPrice(orderPrice),
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
    const etfTransaction = await EtfTransaction.create({
      action,
      ticker: capitalisedTicker,
      orderDate,
      units,
      orderPrice,
      brokerage,
      ownerId: auth0Id,
    });

    let trackedEtf = null;

    let updatedTransactions = [];

    if (action === "buy") {
      const transactionObject = etfTransaction.toObject();

      updatedTransactions = [
        {
          ...transactionObject,
          livePrice: quote.regularMarketPrice,
          live_value: quote.regularMarketPrice * units,
          capitalGains$: quote.regularMarketPrice - orderPrice,
          "capitalGains%":
            ((quote.regularMarketPrice - orderPrice) / orderPrice) * 100,
        },
      ];

      trackedEtf = await handleBuyAsset({
        TrackedAssetModel: TrackedEtf,
        ticker: capitalisedTicker,
        units,
        orderPrice,
        ownerId: auth0Id,
      });
    } else if (action === "sell") {
      const { updatedBuyTransactions, updatedSellTransaction, trackedAsset } =
        await handleSellAsset({
          TrackedAssetModel: TrackedEtf,
          TransactionModel: EtfTransaction,
          ticker: capitalisedTicker,
          units,
          orderPrice,
          sellTransactionId: etfTransaction._id,
          ownerId: auth0Id,
        });

      trackedEtf = trackedAsset;

      updatedTransactions = [
        ...updatedBuyTransactions,
        updatedSellTransaction,
      ].map((txn) => {
        const base = txn.toObject();

        const isSell = base.action === "sell";

        if (isSell) {
          // Only return relevant fields for sell transactions
          const {
            _id,
            ticker,
            orderDate,
            orderPrice,
            units,
            brokerage,
            action,
            capitalGains,
          } = base;

          return {
            _id,
            ticker,
            orderDate,
            orderPrice,
            units,
            brokerage,
            action,
            capitalGains,
          };
        }

        // For buy transactions, include all detailed computed fields
        return {
          ...base,
          livePrice: quote.regularMarketPrice,
          live_value: quote.regularMarketPrice * base.units,
          capitalGains$: quote.regularMarketPrice - base.orderPrice,
          "capitalGains%":
            ((quote.regularMarketPrice - base.orderPrice) / base.orderPrice) *
            100,
        };
      });

      // Prepare trackedEtf for response
      const finalTrackedEtf = {
        ...trackedEtf.toObject(),
        fundName: quote.longName,
        currency: quote.currency,
        livePrice: quote.regularMarketPrice,
        live_value: quote.regularMarketPrice * trackedEtf.heldUnits,
      };

      return res.status(200).json({
        transactions: updatedTransactions,
        trackedEtf: finalTrackedEtf,
      });
    }
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

    if (!trackedEtf) {
      // This scenario implies a data inconsistency
      console.warn(
        `TrackedEtf not found for ticker ${etfTransactionToDelete.ticker} and owner ${auth0Id} during transaction deletion.`
      );
    }

    let updatedEtfTransactions = [];

    if (etfTransactionToDelete.action === "buy") {
      // Check if the buy has linked sells
      if (
        etfTransactionToDelete.linkedSells &&
        etfTransactionToDelete.linkedSells.length > 0
      ) {
        return formatErrorResponse(
          res,
          400,
          "Cannot delete buy transaction that has linked sell transactions."
        );
      }

      // Safe to delete: reverse effect on trackedEtf
      const newHeldUnits = trackedEtf.heldUnits - etfTransactionToDelete.units;

      if (newHeldUnits < 0) {
        return formatErrorResponse(
          res,
          400,
          "Cannot delete transaction: it would lead to negative held units."
        );
      }

      const totalValueBefore = trackedEtf.heldUnits * trackedEtf.avgPrice;
      const removedValue =
        etfTransactionToDelete.units * etfTransactionToDelete.orderPrice;
      const newTotalValue = totalValueBefore - removedValue;

      trackedEtf.heldUnits = newHeldUnits;
      trackedEtf.avgPrice = newHeldUnits > 0 ? newTotalValue / newHeldUnits : 0;
    } else if (etfTransactionToDelete.action === "sell") {
      // Undo the FIFO effect: Restore units to each linked buy
      updatedEtfTransactions = await reverseFifoSell({
        model: EtfTransaction,
        sellTransaction: etfTransactionToDelete,
      });

      // Update trackedEtf
      trackedEtf.heldUnits += etfTransactionToDelete.units;
    }

    // Save tracked ETF
    await trackedEtf.save();

    // Delete the transaction
    await EtfTransaction.deleteOne({ _id: id });

    // Prepare updated quote data for tracked ETF
    const latestQuoteData = await yahooFinance.quote(trackedEtf.ticker, {
      fields: ["longName", "regularMarketPrice", "currency"],
    });

    const finalTrackedEtf = {
      ...trackedEtf.toObject(),
      fundName: latestQuoteData?.longName || null,
      currency: latestQuoteData?.currency || null,
      livePrice: latestQuoteData?.regularMarketPrice || null,
      live_value:
        (latestQuoteData?.regularMarketPrice || 0) * trackedEtf.heldUnits,
    };

    return res.status(200).json({
      success: true,
      message: "ETF transaction deleted successfully.",
      deletedTransactionId: id,
      trackedEtf: finalTrackedEtf,
      updatedEtfTransactions,
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
