const Cash = require("../models/Cash");
const {
  validateBank,
  validateBalance,
  validateCurrency,
} = require("../validation/cashValidation");
const validateAuth = require("../validation/authValidation");

// GET /api/cash
const getCash = async (req, res) => {
  try {
    const auth0Id = req.auth?.payload?.sub; // Get ownerId from authenticated user

    console.log("--- GET /api/cash START ---");
    console.log("Auth0 ID for fetching cash entries:", auth0Id);

    if (!auth0Id) {
      console.error(
        "ERROR: Owner ID (auth0Id) is missing for getCash! Token might be invalid or middleware not working."
      );
      return res.status(401).json({
        success: false,
        message: "Authentication error: User ID not available.",
      });
    }

    // Find cash entries belonging to the authenticated user
    const entries = await Cash.find({ ownerId: auth0Id }); // Sort by creation date, newest first

    // Calculate total balance for the frontend
    const totalBalance = entries.reduce(
      (acc, doc) => acc + parseFloat(doc.balance || 0),
      0
    );

    console.log(
      `SUCCESS: Fetched ${entries.length} cash entries for user ${auth0Id}.`
    );
    console.log("--- GET /api/cash END ---");

    // Respond with both entries and total balance
    res.status(200).json({
      success: true, // Indicate success explicitly
      message: "Cash entries fetched successfully",
      entries: entries,
      total: {
        balance: Number(totalBalance.toFixed(2)),
        currency: "AUD", // Assuming default currency for total, adjust if needed
        bank: "Total Balance",
        _id: 0, // A unique ID for the total row in frontend
      },
    });
  } catch (error) {
    console.error("--- ERROR IN GET /api/cash CONTROLLER ---");
    console.error("Full Error Object:", error); // Log the entire error object
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);

    // Differentiate between Mongoose/MongoDB errors and others
    if (
      error.name === "MongoServerError" ||
      error.name === "MongooseServerSelectionError"
    ) {
      console.error(
        "MongoDB Server Error Details:",
        error.code,
        error.codeName
      );
      return res.status(500).json({
        success: false,
        message: "Database connection or server error while fetching data.",
      });
    } else {
      return res
        .status(500)
        .json({ success: false, message: "Server error fetching cash data." });
    }
  }
};

// POST /api/cash
const createCash = async (req, res) => {
  try {
    const { balance, bank, currency } = req.body;
    const auth0Id = req.auth?.payload?.sub; // Get ownerId from authenticated user

    console.log("--- POST /api/cash START ---");
    console.log("Received data for creation (req.body):", {
      balance,
      bank,
      currency,
    });
    console.log("Auth0 ID for creation:", auth0Id);

    // Perform Validation
    const authError = validateAuth(auth0Id);
    if (authError) {
      return res.status(401).json({ success: false, message: authError });
    }

    const bankErrors = validateBank(bank);
    const balanceErrors = validateBalance(balance);
    const currencyErrors = validateCurrency(currency);

    // Collect all validation errors
    const errors = [];

    if (bankErrors.length > 0) {
      errors.push({ bank: bankErrors });
    }
    if (balanceErrors.length > 0) {
      errors.push({ balance: balanceErrors });
    }
    if (currencyErrors.length > 0) {
      errors.push({ currency: currencyErrors });
    }

    // If there are any validation errors, send a 400 Bad Request response
    if (errors.length > 0) {
      generalMessage = [
        ...bankErrors,
        ...balanceErrors,
        ...currencyErrors,
      ].join(", ");
      console.log("Validation Failed: ", generalMessage);
      return res
        .status(400)
        .json({ success: false, message: generalMessage, errors });
    }

    // Create cash
    const cash = await Cash.create({
      bank,
      balance,
      currency,
      ownerId: auth0Id,
    });

    console.log("SUCCESS: Cash entry created:", cash);
    console.log("--- POST /api/cash END ---");

    res.status(201).json(cash); // Use 201 Created for successful resource creation
  } catch (error) {
    console.error("--- ERROR IN POST /api/cash CONTROLLER ---");
    console.error("Full Error Object:", error); // Log the entire error object
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);

    // Differentiate between Mongoose Validation errors and others
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      console.error("Mongoose Validation Error Details:", messages);
      return res.status(400).json({
        success: false,
        message: `Validation failed: ${messages.join(", ")}`,
      });
    } else if (
      error.name === "MongoServerError" ||
      error.name === "MongooseServerSelectionError"
    ) {
      console.error(
        "MongoDB Server Error Details:",
        error.code,
        error.codeName
      );
      return res.status(500).json({
        success: false,
        message: "Database connection or server error during creation.",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Server error during cash creation.",
      });
    }
  }
};

// PUT /api/cash/:id
const updateCash = async (req, res) => {
  try {
    const { id } = req.params; // Get the ID from the URL parameters
    const { bank, balance, currency } = req.body; // Get updated data from request body
    const auth0Id = req.auth?.payload?.sub; // Get ownerId from authenticated user

    console.log(`--- PUT /api/cash/${id} START ---`);
    console.log("Received update data:", { bank, balance, currency });
    console.log("Auth0 ID for update authorization:", auth0Id);

    // --- Authentication Check ---
    const authError = validateAuth(auth0Id);
    if (authError) {
      return res.status(401).json({ success: false, message: authError });
    }

    // Find the cash entry by ID
    let cashEntry = await Cash.findById(id);

    // Check if entry exists
    if (!cashEntry) {
      console.log(`Cash entry with ID: ${id} not found.`);
      return res
        .status(404)
        .json({ success: false, message: "Cash entry not found" });
    }

    // Authorization check: Ensure the authenticated user owns this entry
    if (cashEntry.ownerId !== auth0Id) {
      console.warn(
        `Unauthorized attempt to update entry ${id} by user ${auth0Id}. Owner is ${cashEntry.ownerId}.`
      );
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this cash entry",
      });
    }

    // --- Perform Validation for provided fields ---
    // Only validate fields if they are explicitly sent in the request body
    const structuredValidationErrors = [];
    const flatErrorMessages = []; // To construct a general message

    if (bank !== undefined) {
      const errors = validateBank(bank);
      if (errors.length > 0) {
        structuredValidationErrors.push({ bank: errors });
        flatErrorMessages.push(...errors);
      }
    }
    if (balance !== undefined) {
      const errors = validateBalance(balance);
      if (errors.length > 0) {
        structuredValidationErrors.push({ balance: errors });
        flatErrorMessages.push(...errors);
      }
    }
    if (currency !== undefined) {
      const errors = validateCurrency(currency);
      if (errors.length > 0) {
        structuredValidationErrors.push({ currency: errors });
        flatErrorMessages.push(...errors);
      }
    }

    // If there are any validation errors, send a 400 Bad Request response
    if (structuredValidationErrors.length > 0) {
      console.log("Validation Failed (Update):", structuredValidationErrors);
      return res.status(400).json({
        success: false,
        message: `Validation failed: ${flatErrorMessages.join(", ")}`, // General message for toast
        errors: structuredValidationErrors, // Structured errors (useful for debugging, less so for simple toast)
      });
    }

    // Apply updates only if the field is provided in the request body
    if (bank !== undefined) cashEntry.bank = bank;
    if (balance !== undefined) cashEntry.balance = balance;
    if (currency !== undefined) cashEntry.currency = currency;

    // Save the updated entry
    const updatedCash = await cashEntry.save(); // Mongoose schema validation will also run here

    console.log("Cash entry updated successfully:", updatedCash);
    console.log(`--- PUT /api/cash/${id} END ---`);
    res.status(200).json(updatedCash);
  } catch (error) {
    console.error("--- ERROR IN PUT /api/cash/:id CONTROLLER ---");
    console.error("Full Error Object:", error);
    console.error("Error Name:", error.name);
    console.error("Error Message:", error.message);

    if (error.name === "ValidationError") {
      // This catches Mongoose schema validation errors (e.g., if a field required by schema is missing)
      const messages = Object.values(error.errors).map((val) => val.message);
      console.error("Mongoose Validation Error Details:", messages);
      return res.status(400).json({
        success: false,
        message: `Database validation failed: ${messages.join(", ")}`,
      });
    } else if (
      error.name === "MongoServerError" ||
      error.name === "MongooseServerSelectionError"
    ) {
      console.error(
        "MongoDB Server Error Details:",
        error.code,
        error.codeName
      );
      return res.status(500).json({
        success: false,
        message: "Database connection or server error during update.",
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Server error during cash update.",
      });
    }
  }
};

// DELETE /api/cash/:id
const deleteCash = async (req, res) => {
  try {
    const { id } = req.params; // Get the ID from the URL parameters
    const auth0Id = req.auth?.payload?.sub; // Get ownerId from authenticated user

    console.log(`Attempting to delete cash entry with ID: ${id}`);
    console.log("Auth0 ID for delete authorization:", auth0Id);

    if (!auth0Id) {
      console.error(
        "Owner ID (auth0Id) is missing for delete! Token might be invalid or middleware not working."
      );
      return res
        .status(401)
        .json({ message: "Authentication error: User ID not available." });
    }

    // Find the cash entry by ID
    const cashEntry = await Cash.findById(id);

    // Check if entry exists
    if (!cashEntry) {
      console.log(`Cash entry with ID: ${id} not found for deletion.`);
      return res.status(404).json({ message: "Cash entry not found" });
    }

    // Authorization check: Ensure the authenticated user owns this entry
    if (cashEntry.ownerId !== auth0Id) {
      console.warn(
        `Unauthorized attempt to delete entry ${id} by user ${auth0Id}. Owner is ${cashEntry.ownerId}.`
      );
      return res
        .status(403)
        .json({ message: "Not authorized to delete this cash entry" });
    }

    // Delete the entry
    await Cash.deleteOne({ _id: id }); // Use deleteOne with the _id query

    console.log(`Cash entry with ID: ${id} deleted successfully.`);
    res.status(200).json({ message: "Cash entry deleted successfully" }); // 200 OK with success message
  } catch (error) {
    console.error("Error in deleteCash:", error);
    console.error("Error message:", error.message);
    res.status(500).json({ message: "Server error during cash deletion" });
  }
};

module.exports = { getCash, createCash, updateCash, deleteCash };
