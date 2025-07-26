const yahooFinance = require("yahoo-finance2").default;
const { TrackedEtf } = require("../models/ETF");
const validateAuth = require("../validation/authValidation");
const { controllerError } = require("../controllerErrors");

// GET /api/etfs
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

// POST /api/etfs
const createTrackedETF = async (req, res) => {
  try {
    const { ticker } = req.body;
    const auth0Id = req.auth?.payload?.sub;

    const capitalisedTicker = ticker.toUpperCase();
    console.log(capitalisedTicker);

    console.log("--- POST /api/etf START ---");
    console.log("Received data for creation (req.body): ", {
      capitalisedTicker,
    });
    console.log("Auth0 ID for creation: ", auth0Id);

    const authError = validateAuth(auth0Id);
    if (authError) {
      return res.status(401).json({ success: false, message: authError });
    }

    const existingEtf = await TrackedEtf.findOne({
      ticker: capitalisedTicker,
      ownerId: auth0Id,
    });
    if (existingEtf) {
      console.warn(
        `Attempted to create duplicate ETF for ${auth0Id}: ${capitalisedTicker}`
      );
      return res.status(409).json({
        success: false,
        message: "ETF with this ticker already exists for this user.",
        errors: { ticker: ["ETF with this ticker already exists."] }, // Provide structured error for frontend validation
      });
    }

    // 1. Fetch live data for the newly created ETF from Yahoo Finance & check if it an ETF
    const quoteDataArray = await yahooFinance.quote([capitalisedTicker], {
      fields: ["longName", "regularMarketPrice", "currency"],
    });

    if (quoteDataArray[0].quoteType !== "ETF") {
      console.warn(`Ticker ${capitalisedTicker} not an ETF`);
      return res.status(400).json({
        success: false,
        message: `Ticker ${capitalisedTicker} not an ETF.`,
        errors: { ticker: [`${capitalisedTicker} not an ETF.`] },
      });
    }

    // 2. Create the TrackedEtf document in the database
    const newTrackedEtfDoc = await TrackedEtf.create({
      ticker: capitalisedTicker,
      ownerId: auth0Id,
      // Initialize other fields if necessary, e.g., held_units: 0, avg_price: 0
      held_units: 0, // Ensure initial units are 0 for a newly tracked ETF
      avg_price: 0,
    });

    console.log(
      "INFO: Tracked ETF entry created in DB: ",
      newTrackedEtfDoc.toObject()
    );

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
        `WARNING: No live quote data found for newly created ticker: ${capitalisedTicker}`
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

// PUT /api/etfs/:id
const updateTrackedETF = async (req, res) => {
  console.log("Updating tracked ETF");
};

// DELETE /api/etfs/:id
const deleteTrackedETF = async (req, res) => {
  try {
    console.log("Deleting tracked ETF");
    const { id } = req.params;
    const auth0Id = req.auth?.payload?.sub;

    console.log(`Attempting to delete tracked ETF with ID: ${id}`);
    console.log("Auth0 ID for delete authorization:", auth0Id);

    if (!auth0Id) {
      console.error(
        "Owner ID (auth0Id) is missing for delete! Token might be invalid or middleware not working."
      );
      return res
        .status(401)
        .json({ message: "Authentication error: User ID not available." });
    }

    // Find the tracked ETF by ID
    const trackedETF = await TrackedEtf.findById(id);

    // Check if tracked ETF exists
    if (!trackedETF) {
      console.log(`Tracked ETF with ID: ${id} not found for deletion.`);
      return res.status(404).json({ message: "Tracked ETF not found." });
    }

    // Check if held units it > 0
    if (trackedETF.held_units > 0) {
      console.log(
        `Tracked ETF, ${trackedETF.ticker} held units are greater than 0.`
      );
      return res.status(400).json({
        message: `Cannot delete ${trackedETF.ticker} because held units are greater than 0.`,
      });
    }

    // Authorization check: Ensure the authenticated user owns this entry
    if (trackedETF.ownerId !== auth0Id) {
      console.warn(
        `Unauthorized attempt to delete entry ${id} by user ${auth0Id}. Owner is ${trackedETF.ownerId}.`
      );
      return res
        .status(403)
        .json({ message: "Not authorized to delete this cash entry" });
    }

    await TrackedEtf.deleteOne({ _id: id });

    console.log(`Tracked ETF with ID: ${id} deleted successfully.`);
    res.status(200).json({ message: "Tracked ETF deleted successfully" });
  } catch (error) {
    console.error("Error in deleteTrackedETF:", error);
    console.error("Error message:", error.message);
    res
      .status(500)
      .json({ message: "Server error during tracked ETF deletion." });
  }
};

module.exports = {
  getTrackedETFs,
  createTrackedETF,
  updateTrackedETF,
  deleteTrackedETF,
};
