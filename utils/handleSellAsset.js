const applyFifoSell = require("./applyFifoSell");

async function handleSellAsset({
  TrackedAssetModel,
  TransactionModel,
  ticker,
  units,
  orderPrice,
  sellTransactionId,
  ownerId,
  session,
  quote,
  sellTransaction,
}) {
  if (
    !TrackedAssetModel ||
    !TransactionModel ||
    !ticker ||
    !units ||
    !ownerId
  ) {
    throw new Error("Missing required arguments to handleSellAsset");
  }

  const trackedAsset = await TrackedAssetModel.findOne(
    { ticker, ownerId },
    null,
    { session }
  );

  if (!trackedAsset) {
    throw new Error(
      `Cannot sell ${ticker}. You do not currently track this asset.`
    );
  }

  const heldUnits = trackedAsset.heldUnits;

  if (units > heldUnits) {
    throw new Error(
      `Cannot sell ${units} units of ${ticker}. You only hold ${heldUnits} units.`
    );
  }

  const [earliestBuy] = await TransactionModel.find(
    {
      ticker,
      ownerId,
      action: "buy",
      remainingUnits: { $gt: 0 },
    },
    null,
    { session, sort: { orderDate: 1 }, limit: 1 }
  );

  if (earliestBuy && sellTransaction[0].orderDate < earliestBuy.orderDate) {
    throw new Error(
      `Sell date ${
        sellTransaction[0].orderDate.toISOString().split("T")[0]
      } is before earliest buy date, (${
        earliestBuy.orderDate.toISOString().split("T")[0]
      }), with remaining units. Please correct the transaction date.`
    );
  }

  // Update tracked asset's units
  trackedAsset.heldUnits -= units;

  if (trackedAsset.heldUnits === 0) {
    trackedAsset.avgPrice = 0;
  }

  await trackedAsset.save({ session });

  // Apply FIFO to deduct from buy transactions
  const { updatedSellTransaction, updatedBuyTransactions } =
    await applyFifoSell({
      model: TransactionModel,
      ticker,
      units,
      ownerId,
      sellPrice: orderPrice,
      sellTransactionId,
      session,
    });

  // Apply live data enhancements if quote is provided
  const enhancedBuyTxns = updatedBuyTransactions.map((txn) => {
    const base = txn.toObject();

    if (base.remainingUnits === 0) {
      delete base.capitalGains;
    }

    if (!quote) return base;

    const livePrice = quote.regularMarketPrice;
    const shouldIncludeGains = base.remainingUnits !== 0;

    return {
      ...base,
      ...(shouldIncludeGains && {
        livePrice,
        liveValue: livePrice * base.units,
        capitalGains$: livePrice - base.orderPrice,
        "capitalGains%":
          ((livePrice - base.orderPrice) / base.orderPrice) * 100,
      }),
    };
  });

  // Only pick relevant sell fields
  const baseSell = updatedSellTransaction.toObject();
  const processedSellTxn = {
    _id: baseSell._id,
    ticker: baseSell.ticker,
    orderDate: baseSell.orderDate,
    orderPrice: baseSell.orderPrice,
    units: baseSell.units,
    brokerage: baseSell.brokerage,
    action: baseSell.action,
    capitalGains: baseSell.capitalGains,
    orderValue: baseSell.units * baseSell.orderPrice,
  };

  return {
    trackedAsset,
    updatedTransactions: [...enhancedBuyTxns, processedSellTxn],
  };
}

module.exports = handleSellAsset;
