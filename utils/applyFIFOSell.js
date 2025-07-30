async function applyFifoSell({ model, ticker, units, ownerId }) {
  let unitsToSell = units;
  const matchedLots = [];

  const buyTransactions = await model
    .find({
      action: "buy",
      ticker,
      ownerId,
      remaining_units: { $gt: 0 },
    })
    .sort({ order_date: 1 });

  for (const buy of buyTransactions) {
    if (unitsToSell === 0) break;

    const available = buy.remaining_units;
    const toDeduct = Math.min(available, unitsToSell);

    await model.findByIdAndUpdate(buy._id, {
      $inc: { remaining_units: -toDeduct },
    });

    matchedLots.push({
      buyTransactionId: buy._id,
      matchedUnits: toDeduct,
      buyPrice: buy.order_price,
      buyDate: buy.order_date,
    });

    unitsToSell -= toDeduct;

    if (unitsToSell > 0) {
      throw new Error(
        "Not enough buy units available to match the sell order (FIFO)."
      );
    }
  }
  return matchedLots;
}
