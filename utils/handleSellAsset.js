const applyFifoSell = require("./applyFifoSell");

async function handleSellAsset({
  TrackedAssetModel,
  TransactionModel,
  ticker,
  units,
  order_price,
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

  const heldUnits = trackedAsset.held_units;

  if (units > heldUnits) {
    throw new Error(
      `Cannot sell ${units} units of ${ticker}. You only hold ${heldUnits} units.`
    );
  }

  // Update tracked asset's units
  trackedAsset.held_units -= units;

  if (trackedAsset.held_units === 0) {
    trackedAsset.avg_price = 0;
  }

  await trackedAsset.save();

  console.log("Preparing to applyFifoSell");

  // Apply FIFO to deduct from buy transactions
  const matchedLots = await applyFifoSell({
    model: TransactionModel,
    ticker,
    units,
    ownerId,
    sellPrice: order_price,
  });

  return {
    trackedAsset,
    matchedLots,
  };
}

module.exports = handleSellAsset;
