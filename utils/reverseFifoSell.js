async function reverseFifoSell({ model, sellTransaction }) {
  const linkedBuys = sellTransaction.linkedBuys || [];

  const updatedBuyTransactions = [];

  for (const lot of linkedBuys) {
    const { buyTransactionId, matchedUnits } = lot;

    const buy = await model.findById(buyTransactionId);
    if (!buy) continue;

    const remainingUnitsBefore = buy.remainingUnits;

    // Remove the matching linkedSells entry
    buy.linkedSells = (buy.linkedSells || []).filter(
      (sell) =>
        sell.sell_transaction_id.toString() !== sellTransaction._id.toString()
    );

    buy.remainingUnits += matchedUnits;
    buy.soldUnits -= matchedUnits;

    await buy.save();
    updatedBuyTransactions.push({ ...buy.toObject(), remainingUnitsBefore });
  }

  return updatedBuyTransactions;
}

module.exports = reverseFifoSell;
