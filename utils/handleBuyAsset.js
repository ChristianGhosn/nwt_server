async function handleBuyAsset({
  TrackedAssetModel,
  ticker,
  units,
  orderPrice,
  ownerId,
  session,
  quote,
}) {
  if (!TrackedAssetModel || !ticker || !units || !orderPrice || !ownerId) {
    throw new Error("Missing required arguments to handleBuyTransaction");
  }

  let trackedAsset = await TrackedAssetModel.findOne(
    { ticker, ownerId },
    null,
    { session }
  );

  if (!trackedAsset) {
    // First-time buy — create new tracked asset
    trackedAsset = new TrackedAssetModel({
      ticker,
      heldUnits: units,
      avgPrice: orderPrice,
      ownerId,
    });
  } else {
    // Update existing tracked asset
    const oldHeldUnits = trackedAsset.heldUnits;
    const oldAvgPrice = trackedAsset.avgPrice;

    const totalCostOld = oldHeldUnits * oldAvgPrice;
    const totalCostNew = units * orderPrice;
    const totalUnits = oldHeldUnits + units;

    trackedAsset.heldUnits = totalUnits;
    trackedAsset.avgPrice = (totalCostOld + totalCostNew) / totalUnits;
  }

  await trackedAsset.save({ session });

  let updatedTransaction = null;

  if (quote) {
    const livePrice = quote.regularMarketPrice;
    updatedTransaction = {
      livePrice,
      liveValue: livePrice * units,
      capitalGains$: livePrice - orderPrice,
      "capitalGains%": ((livePrice - orderPrice) / orderPrice) * 100,
    };
  }

  return { trackedAsset, updatedTransaction };
}

module.exports = handleBuyAsset;
