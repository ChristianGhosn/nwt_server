async function handleBuyAsset({
  TrackedAssetModel,
  ticker,
  units,
  orderPrice,
  ownerId,
}) {
  if (!TrackedAssetModel || !ticker || !units || !orderPrice || !ownerId) {
    throw new Error("Missing required arguments to handleBuyTransaction");
  }

  let trackedAsset = await TrackedAssetModel.findOne({
    ticker,
    ownerId,
  });

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

  await trackedAsset.save();
  return trackedAsset;
}

module.exports = handleBuyAsset;
