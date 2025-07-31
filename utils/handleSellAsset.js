const applyFifoSell = require("./applyFifoSell");

async function handleSellAsset({
  TrackedAssetModel,
  TransactionModel,
  ticker,
  units,
  orderPrice,
  sellTransactionId,
  ownerId,
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

  const trackedAsset = await TrackedAssetModel.findOne({ ticker, ownerId });

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

  // Update tracked asset's units
  trackedAsset.heldUnits -= units;

  if (trackedAsset.heldUnits === 0) {
    trackedAsset.avgPrice = 0;
  }

  await trackedAsset.save();

  // Apply FIFO to deduct from buy transactions
  const { updatedSellTransaction, updatedBuyTransactions } =
    await applyFifoSell({
      model: TransactionModel,
      ticker,
      units,
      ownerId,
      sellPrice: orderPrice,
      sellTransactionId,
    });

  return {
    trackedAsset,
    updatedSellTransaction,
    updatedBuyTransactions,
  };
}

module.exports = handleSellAsset;
