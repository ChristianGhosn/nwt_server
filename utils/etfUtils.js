const yahooFinance = require("yahoo-finance2").default;

function formatErrorResponse(res, status, message, structuredErrors = {}) {
  return res.status(status).json({
    success: false,
    message,
    errors: structuredErrors,
  });
}

function normalizeTicker(ticker) {
  return ticker?.toUpperCase();
}

async function fetchAndValidateETFQuote(ticker) {
  try {
    const quoteDataArray = await yahooFinance.quote([ticker], {
      fields: ["longName", "regularMarketPrice", "currency"],
    });

    if (!quoteDataArray || quoteDataArray.length === 0 || !quoteDataArray[0]) {
      throw new Error(`No data found for ticker: ${ticker}`);
    }

    if (quoteDataArray.length > 1) {
      throw new Error(
        `Multiple results found for ticker: ${ticker}. Please provide a more specific ticker that matches only one ETF.`
      );
    }

    const quote = quoteDataArray[0];

    if (quote.quoteType !== "ETF") {
      throw new Error(`${ticker} not an ETF`);
    }

    return quote;
  } catch (error) {
    throw new Error("Invalid ticker");
  }
}

module.exports = {
  formatErrorResponse,
  normalizeTicker,
  fetchAndValidateETFQuote,
};
