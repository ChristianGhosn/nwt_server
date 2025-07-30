async function handleBuyAsset({
  TrackedAssetModel,
  ticker,
  units,
  order_price,
  ownerId,
}) {
  if (!TrackedAssetModel || !ticker || !units || !order_price || !ownerId) {
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
      held_units: units,
      avg_price: order_price,
      ownerId,
    });
  } else {
    // Update existing tracked asset
    const oldHeldUnits = trackedAsset.held_units;
    const oldAvgPrice = trackedAsset.avg_price;

    const totalCostOld = oldHeldUnits * oldAvgPrice;
    const totalCostNew = units * order_price;
    const totalUnits = oldHeldUnits + units;

    trackedAsset.held_units = totalUnits;
    trackedAsset.avg_price = (totalCostOld + totalCostNew) / totalUnits;
  }

  await trackedAsset.save();
  return trackedAsset;
}

module.exports = handleBuyAsset;
