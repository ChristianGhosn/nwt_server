function formatTransactionDates(transactions) {
  return transactions.map((tx) => ({
    ...tx,
    orderDate: new Date(tx.orderDate).toISOString().split("T")[0], // 'YYYY-MM-DD'
  }));
}

module.exports = formatTransactionDates;
