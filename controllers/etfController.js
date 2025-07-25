const yahooFinance = require("yahoo-finance2").default;
const { TrackedEtf } = require("../models/ETF");
const validateAuth = require("../validation/authValidation");
const { controllerError } = require("../controllerErrors");

const getTrackedETFs = async (req, res) => {
  try {
    const auth0Id = req.auth?.payload?.sub;

    console.log("--- GET /api/etfs START ---");
    console.log("Auth0 ID for fetching cash entries:", auth0Id);

    if (!auth0Id) {
      console.error(
        "ERROR: Owner ID (auth0Id) is missing for getTrackedETFs! Token might be invalid or middleware not working."
      );
      return res.status(401).json({
        success: false,
        message: "Authentication error: User ID not available.",
      });
    }

    const trackedETFs = await TrackedEtf.find({ ownerId: auth0Id }).lean();
    const trackedTickersArray = trackedETFs.map((etf) => etf.ticker);

    const quoteData = await yahooFinance.quote(trackedTickersArray, {
      fields: ["longName", "regularMarketPrice", "currency"],
    });

    const combinedETFsData = trackedETFs.map((trackedETF) => {
      const matchingQuote = quoteData.find(
        (quote) => quote.symbol === trackedETF.ticker
      );

      if (matchingQuote) {
        return {
          ...trackedETF,
          fund_name: matchingQuote.longName,
          currency: matchingQuote.currency,
          live_price: matchingQuote.regularMarketPrice,
          live_value: matchingQuote.regularMarketPrice * trackedETF.held_units,
        };
      } else {
        console.warn(`No quote data found for ticker: ${trackedETF.ticker}`);
        return trackedETF;
      }
    });

    console.log(
      `SUCCESS: Fetched ${combinedETFsData.length} ETFs for user ${auth0Id}.`
    );

    console.log("--- GET /api/etfs END ---");

    return res.status(200).json(combinedETFsData);
  } catch (error) {
    console.error("--- ERROR IN GET /api/etfs CONTROLLER ---");
    const err = controllerError(error);
    return res.status(500).json(err);
  }
};

const createTrackedETF = async (req, res) => {
  try {
    const { ticker } = req.body;
    const auth0Id = req.auth?.payload?.sub;

    console.log("--- POST /api/etf START ---");
    console.log("Received data for creation (req.body): ", {
      ticker,
    });
    console.log("Auth0 ID for creation: ", auth0Id);

    const authError = validateAuth(auth0Id);
    if (authError) {
      return res.status(401).json({ success: false, message: authError });
    }

    const existingEtf = await TrackedEtf.findOne({ ticker, ownerId: auth0Id });
    if (existingEtf) {
      console.warn(
        `Attempted to create duplicate ETF for ${auth0Id}: ${ticker}`
      );
      return res.status(409).json({
        success: false,
        message: "ETF with this ticker already exists for this user.",
        errors: { ticker: ["ETF with this ticker already exists."] }, // Provide structured error for frontend validation
      });
    }

    // 1. Create the TrackedEtf document in the database
    const newTrackedEtfDoc = await TrackedEtf.create({
      ticker,
      ownerId: auth0Id,
      // Initialize other fields if necessary, e.g., held_units: 0, avg_price: 0
      held_units: 0, // Ensure initial units are 0 for a newly tracked ETF
      avg_price: 0,
    });

    console.log(
      "INFO: Tracked ETF entry created in DB: ",
      newTrackedEtfDoc.toObject()
    );

    // 2. Fetch live data for the newly created ETF from Yahoo Finance
    const quoteDataArray = await yahooFinance.quote([ticker], {
      fields: ["longName", "regularMarketPrice", "currency"],
    });

    let combinedNewEtfData = newTrackedEtfDoc.toObject(); // Convert Mongoose doc to plain object

    // 3. Combine the newly created TrackedEtf document's data with the live data
    if (quoteDataArray && quoteDataArray.length > 0) {
      const matchingQuote = quoteDataArray[0]; // Since we queried for a single ticker
      combinedNewEtfData = {
        ...combinedNewEtfData,
        fund_name: matchingQuote.longName,
        currency: matchingQuote.currency,
        live_price: matchingQuote.regularMarketPrice,
        // Calculate live_value for a newly tracked ETF (held_units should be 0)
        live_value:
          matchingQuote.regularMarketPrice * combinedNewEtfData.held_units,
      };
      console.log("INFO: Live data fetched and combined for new ETF.");
    } else {
      console.warn(
        `WARNING: No live quote data found for newly created ticker: ${ticker}`
      );
      // If no quote data, still return the basic tracked ETF data
      combinedNewEtfData = {
        ...combinedNewEtfData,
        fund_name: null, // Or 'N/A'
        currency: null, // Or 'N/A'
        live_price: null, // Or 0
        live_value: 0,
      };
    }

    console.log("SUCCESS: Tracked ETF entry created: ", combinedNewEtfData);
    console.log("--- POST /api/etf END ---");

    res.status(201).json(combinedNewEtfData);
  } catch (error) {
    console.error("--- ERROR IN POST /api/cash CONTROLLER ---");
    const err = controllerError(error);
    return res.status(500).json(err);
  }
};

const updateTrackedETF = async (req, res) => {
  console.log("Updating tracked ETF");
};

const deleteTrackedETF = async (req, res) => {
  console.log("Deleting tracked ETF");
};

module.exports = {
  getTrackedETFs,
  createTrackedETF,
  updateTrackedETF,
  deleteTrackedETF,
};
