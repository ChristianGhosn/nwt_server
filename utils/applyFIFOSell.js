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
      remainingUnits: { $gt: 0 },
    })
    .sort({ orderDate: 1 });

  let totalCapitalGains = 0;

  for (const buy of buyTransactions) {
    if (unitsToSell === 0) break;

    const available = buy.remainingUnits;
    const toDeduct = Math.min(available, unitsToSell);

    const gainPerUnit = sellPrice - buy.orderPrice;
    const gainTotal = gainPerUnit * toDeduct;
    totalCapitalGains += gainTotal;

    await model.findByIdAndUpdate(buy._id, {
      $inc: {
        remainingUnits: -toDeduct,
        soldUnits: toDeduct,
      },
      $push: {
        linkedSells: {
          sell_transaction_id: sellTransactionId,
          matchedUnits: toDeduct,
          gainPerUnit: gainPerUnit,
          gainTotal: gainTotal,
        },
      },
    });

    matchedLots.push({
      buyTransactionId: buy._id,
      matchedUnits: toDeduct,
      buy_price: buy.orderPrice,
      buy_date: buy.orderDate,
      gainPerUnit: gainPerUnit,
      gainTotal: gainTotal,
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
      linkedBuys: matchedLots.map((lot) => ({
        buyTransactionId: lot.buyTransactionId,
        matchedUnits: lot.matchedUnits,
        gainPerUnit: lot.gainPerUnit,
        gainTotal: lot.gainTotal,
      })),
      capitalGains: totalCapitalGains,
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
