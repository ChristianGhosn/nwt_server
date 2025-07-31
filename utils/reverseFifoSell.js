async function reverseFifoSell({ model, sellTransaction }) {
  const linkedBuys = sellTransaction.linkedBuys || [];

  const updatedBuyTransactions = [];

  for (const lot of linkedBuys) {
    const { buyTransactionId, matchedUnits, sell_transaction_id } = lot;

    const buy = await model.findById(buyTransactionId);
    if (!buy) continue;

    // Remove the matching linkedSells entry
    buy.linkedSells = (buy.linkedSells || []).filter(
      (sell) =>
        sell.sell_transaction_id.toString() !== sellTransaction._id.toString()
    );

    buy.remainingUnits += matchedUnits;
    buy.soldUnits -= matchedUnits;

    await buy.save();
    updatedBuyTransactions.push(buy);
  }

  return updatedBuyTransactions;
}

module.exports = reverseFifoSell;
