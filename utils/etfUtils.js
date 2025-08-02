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

async function fetchAndValidateETFQuote(tickers) {
  try {
    if (!Array.isArray(tickers) || tickers.length === 0) {
      throw new Error("tickers must not be an empty list");
    }

    const quotes = await yahooFinance.quote(tickers, {
      fields: ["longName", "regularMarketPrice", "currency", "quoteType"],
    });

    if (!quotes || quotes.length === 0) {
      throw new Error(`no quote data found for tickers: ${tickers.join(", ")}`);
    }

    const missingTickers = [];
    const nonEtfTickers = [];
    const validEtfQuotes = [];

    tickers.forEach((ticker) => {
      const quote = quotes.find(
        (q) => q?.symbol?.toUpperCase() === ticker.toUpperCase()
      );

      if (!quote) {
        missingTickers.push(ticker);
      } else if (quote.quoteType !== "ETF") {
        nonEtfTickers.push(ticker);
      } else {
        validEtfQuotes.push(quote);
      }
    });

    const errors = [];
    if (missingTickers.length) {
      errors.push(`no data found for: ${missingTickers.join(", ")}`);
    }
    if (nonEtfTickers.length) {
      errors.push(`${nonEtfTickers.join(", ")} not an ETF`);
    }

    if (errors.length > 0) {
      throw new Error(errors.join(" | "));
    }

    return validEtfQuotes;
  } catch (error) {
    throw new Error(`Failed to fetch ETF quotes, ${error.message}`);
  }
}

module.exports = {
  formatErrorResponse,
  normalizeTicker,
  fetchAndValidateETFQuote,
};
