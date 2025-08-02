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
const formatTransactionDates = require("../utils/formatTransactionDates");

// GET /api/etfs
const getTrackedETFs = async (req, res) => {
  const auth0Id = getAuthUserId(req);

  // Find Tracked ETFs from Mongo
  const trackedETFs = await TrackedEtf.find({ ownerId: auth0Id }).lean();

  // Extract tickers for Yahoo Finance
  const trackedTickersArray = trackedETFs.map((etf) => etf.ticker);
  let fetchedData = [];

  try {
    fetchedData = await fetchAndValidateETFQuote(trackedTickersArray);
  } catch (error) {
    throw new Error(error.message);
  }

  // Combine market data with tracked ETF objects
  const combinedETFsData = trackedETFs.map((trackedETF) => {
    const matchingQuote = fetchedData.find(
      (quote) => quote.symbol === trackedETF.ticker
    );

    if (matchingQuote) {
      return {
        ...trackedETF,
        fundName: matchingQuote.longName,
        currency: matchingQuote.currency,
        livePrice: matchingQuote.regularMarketPrice,
        liveValue: matchingQuote.regularMarketPrice * trackedETF.heldUnits,
      };
    } else {
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
    quote = await fetchAndValidateETFQuote([capitalisedTicker]);
  } catch (error) {
    throw new Error(error.message);
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
    fundName: quote?.longName,
    currency: quote?.currency,
    livePrice: quote?.regularMarketPrice,
    liveValue: quote?.regularMarketPrice * newTrackedEtf.heldUnits,
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
  let quoteDataArray = [];
  try {
    quoteDataArray = await fetchAndValidateETFQuote([updatedTrackedETF.ticker]);
  } catch (error) {
    throw new Error(error.message);
  }

  const quote = quoteDataArray?.[0];
  if (quote) {
    combinedResponse = {
      ...combinedResponse,
      fundName: quote.longName || null,
      currency: quote.currency || null,
      livePrice: quote.regularMarketPrice || null,
      liveValue: (quote.regularMarketPrice ?? 0) * updatedTrackedETF.heldUnits,
    };
  } else {
    combinedResponse = {
      ...combinedResponse,
      fundName: null,
      currency: null,
      livePrice: null,
      liveValue: 0,
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

  verifyOwnership(trackedETF, auth0Id, "tracked ETF");

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
        orderValue: txn.units * txn.orderPrice,
      };

      // BUY transaction logic
      if (txn.action === "buy") {
        const withGains = {
          ...base,
          livePrice: marketPrice,
          liveValue: marketPrice ? marketPrice * txn.units : null,
          capitalGains$: marketPrice ? marketPrice - txn.orderPrice : null,
          "capitalGains%": marketPrice
            ? ((marketPrice - txn.orderPrice) / txn.orderPrice) * 100
            : null,
        };

        // If remainingUnits is 0, strip out gain-related fields
        if (txn.remainingUnits === 0) {
          const {
            livePrice,
            liveValue,
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
        liveValue,
        capitalGains$,
        "capitalGains%": cgPercent,
        remainingUnits,
        ...cleanedTxn
      } = base;

      return cleanedTxn;
    });

    return res.status(200).json(formatTransactionDates(formattedTransactions));
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

  const session = await EtfTransaction.startSession();

  try {
    session.startTransaction();

    // Validate ETF
    const [quote] = await fetchAndValidateETFQuote([capitalisedTicker]);

    // Create ETF Transaction
    const etfTransaction = await EtfTransaction.create(
      [
        {
          action,
          ticker: capitalisedTicker,
          orderDate,
          units,
          orderPrice,
          brokerage,
          ownerId: auth0Id,
        },
      ],
      { session }
    );

    const transactionObject = etfTransaction[0].toObject();

    let trackedEtf = null;
    let updatedTransactions = [];

    if (action === "buy") {
      const { trackedAsset, updatedTransaction } = await handleBuyAsset({
        TrackedAssetModel: TrackedEtf,
        ticker: capitalisedTicker,
        units,
        orderPrice,
        ownerId: auth0Id,
        session,
        quote,
      });

      trackedEtf = trackedAsset;

      updatedTransactions = [
        {
          ...transactionObject,
          ...(updatedTransaction || {}),
        },
      ];
    }
    if (action === "sell") {
      const { trackedAsset, updatedTransactions: rawTransactions } =
        await handleSellAsset({
          TrackedAssetModel: TrackedEtf,
          TransactionModel: EtfTransaction,
          ticker: capitalisedTicker,
          units,
          orderPrice,
          sellTransactionId: transactionObject._id,
          ownerId: auth0Id,
          session,
          quote,
          sellTransaction: etfTransaction,
        });

      trackedEtf = trackedAsset;

      updatedTransactions = rawTransactions;
    }

    // Prepare trackedEtf for response
    const finalTrackedEtf = {
      ...trackedEtf.toObject(),
      fundName: quote.longName,
      currency: quote.currency,
      livePrice: quote.regularMarketPrice,
      liveValue: quote.regularMarketPrice * trackedEtf.heldUnits,
    };

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      transactions: formatTransactionDates(updatedTransactions),
      trackedEtf: finalTrackedEtf,
    });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    await session.endSession();

    return formatErrorResponse(res, 400, err.message, {
      ticker: [err.message],
    });
  }
};

// DELETE /api/etfs/transactions/:id
const deleteETFTransaction = async (req, res) => {
  const { id } = req.params;
  const auth0Id = getAuthUserId(req);

  const session = await EtfTransaction.startSession();

  let finalTrackedEtf;
  let updatedEtfTransactions = [];

  try {
    await session.withTransaction(async () => {
      // Find transaction to delete
      const etfTransactionToDelete = await EtfTransaction.findOne(
        { _id: id, ownerId: auth0Id },
        null,
        { session }
      );

      if (!etfTransactionToDelete) {
        throw new Error("ETF transaction not found or unauthorised");
      }

      // Find tracked ETF
      const trackedEtf = await TrackedEtf.findOne(
        { ticker: etfTransactionToDelete.ticker, ownerId: auth0Id },
        null,
        { session }
      );

      if (!trackedEtf) {
        throw new Error("Data inconsistency: tracked ETF not found.");
      }

      // Prepare container for capital gains enriched transactions
      let updatedWithCapitalGains = [];

      if (etfTransactionToDelete.action === "buy") {
        if (
          etfTransactionToDelete.linkedSells &&
          etfTransactionToDelete.linkedSells.length > 0
        ) {
          throw new Error(
            "Cannot delete buy transaction that has linked sell transactions."
          );
        }

        const newHeldUnits =
          trackedEtf.heldUnits - etfTransactionToDelete.units;
        if (newHeldUnits < 0) {
          throw new Error(
            "Cannot delete transaction: it would lead to negative held units."
          );
        }

        const totalValueBefore = trackedEtf.heldUnits * trackedEtf.avgPrice;
        const removedValue =
          etfTransactionToDelete.units * etfTransactionToDelete.orderPrice;
        const newTotalValue = totalValueBefore - removedValue;

        trackedEtf.heldUnits = newHeldUnits;
        trackedEtf.avgPrice =
          newHeldUnits > 0 ? newTotalValue / newHeldUnits : 0;
      }

      if (etfTransactionToDelete.action === "sell") {
        updatedEtfTransactions = await reverseFifoSell({
          model: EtfTransaction,
          sellTransaction: etfTransactionToDelete,
          session,
        });

        trackedEtf.heldUnits += etfTransactionToDelete.units;

        const [latestQuoteData] = await fetchAndValidateETFQuote([
          trackedEtf.ticker,
        ]);
        const livePrice = latestQuoteData?.regularMarketPrice || 0;

        for (const tx of updatedEtfTransactions) {
          if (
            typeof tx.remainingUnitsBefore === "number" &&
            tx.remainingUnitsBefore === 0 &&
            tx.remainingUnits > 0
          ) {
            const capitalGainValue = livePrice - tx.orderPrice;
            const capitalGainDollar = capitalGainValue * tx.remainingUnits;
            const capitalGainPercent =
              tx.orderPrice > 0 ? (capitalGainValue / tx.orderPrice) * 100 : 0;

            updatedWithCapitalGains.push({
              ...tx,
              livePrice,
              liveValue: livePrice * tx.remainingUnits,
              capitalGains$: capitalGainDollar,
              "capitalGains%": capitalGainPercent,
            });
          }
        }

        // Replace updatedEtfTransactions with enriched data
        updatedEtfTransactions = updatedWithCapitalGains;
      }

      await trackedEtf.save({ session });

      await EtfTransaction.deleteOne({ _id: id }, { session });

      const [latestQuoteData] = await fetchAndValidateETFQuote([
        trackedEtf.ticker,
      ]);

      finalTrackedEtf = {
        ...trackedEtf.toObject(),
        fundName: latestQuoteData?.longName || null,
        currency: latestQuoteData?.currency || null,
        livePrice: latestQuoteData?.regularMarketPrice || null,
        liveValue:
          (latestQuoteData?.regularMarketPrice || 0) * trackedEtf.heldUnits,
      };
    });

    await session.endSession();

    return res.status(200).json({
      success: true,
      message: "ETF transaction deleted successfully.",
      deletedTransactionId: id,
      trackedEtf: finalTrackedEtf,
      updatedEtfTransactions: formatTransactionDates(updatedEtfTransactions),
    });
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    await session.endSession();

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
