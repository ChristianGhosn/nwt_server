async function applyFifoSell({
  model,
  ticker,
  units,
  ownerId,
  sellPrice,
  sellTransactionId,
}) {
  let unitsToSell = units;
  const matchedLots = [];
  const updatedBuyTransactionIds = [];

  const buyTransactions = await model
    .find({
      action: "buy",
      ticker,
      ownerId,
      remaining_units: { $gt: 0 },
    })
    .sort({ order_date: 1 });

  let totalCapitalGains = 0;

  for (const buy of buyTransactions) {
    if (unitsToSell === 0) break;

    const available = buy.remaining_units;
    const toDeduct = Math.min(available, unitsToSell);

    const gainPerUnit = sellPrice - buy.order_price;
    const gainTotal = gainPerUnit * toDeduct;
    totalCapitalGains += gainTotal;

    await model.findByIdAndUpdate(buy._id, {
      $inc: {
        remaining_units: -toDeduct,
        sold_units: toDeduct,
      },
      $push: {
        linked_sells: {
          sellTransactionId,
          matchedUnits: toDeduct,
          gainPerUnit,
          gainTotal,
        },
      },
    });

    matchedLots.push({
      buyTransactionId: buy._id,
      matchedUnits: toDeduct,
      buyPrice: buy.order_price,
      buyDate: buy.order_date,
      gainPerUnit,
      gainTotal,
    });

    unitsToSell -= toDeduct;
    updatedBuyTransactionIds.push(buy._id);
  }

  if (unitsToSell > 0) {
    throw new Error(
      "Not enough buy units available to match the sell order (FIFO)."
    );
  }

  // Update the sell transaction with linked buys
  await model.findByIdAndUpdate(sellTransactionId, {
    $set: {
      linked_buys: matchedLots.map((lot) => ({
        buyTransactionId: lot.buyTransactionId,
        matchedUnits: lot.matchedUnits,
        gainPerUnit: lot.gainPerUnit,
        gainTotal: lot.gainTotal,
      })),
      capital_gains: totalCapitalGains,
    },
  });

  // Fetch full updated buy transactions
  const updatedBuyTransactions = await model.find({
    _id: { $in: updatedBuyTransactionIds },
  });

  const updatedSellTransaction = await model.findById(sellTransactionId);

  return {
    updatedBuyTransactions,
    updatedSellTransaction,
  };
}

module.exports = applyFifoSell;
