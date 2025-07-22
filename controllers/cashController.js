const Cash = require("../models/Cash");

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

    // Basic Validation
    if (!bank || bank.trim() === "") {
      console.log("Validation Failed: Bank name is required.");
      return res
        .status(400)
        .json({ success: false, message: "Bank name is required!" });
    }
    if (typeof balance !== "number" || isNaN(balance)) {
      console.log("Validation Failed: Balance must be a valid number.");
      return res
        .status(400)
        .json({ success: false, message: "Balance must be a valid number!" });
    }
    if (!currency || currency.trim() === "") {
      console.log("Validation Failed: Currency is required.");
      return res
        .status(400)
        .json({ success: false, message: "Currency is required!" });
    }
    if (!auth0Id) {
      console.error(
        "ERROR: Owner ID (auth0Id) is missing for createCash! Token might be invalid or middleware not working."
      );
      return res.status(401).json({
        success: false,
        message: "Authentication error: User ID not available.",
      });
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

    console.log(`Attempting to update cash entry with ID: ${id}`);
    console.log("Received update data:", { bank, balance, currency });
    console.log("Auth0 ID for update authorization:", auth0Id);

    if (!auth0Id) {
      console.error(
        "Owner ID (auth0Id) is missing for update! Token might be invalid or middleware not working."
      );
      return res
        .status(401)
        .json({ message: "Authentication error: User ID not available." });
    }

    // Find the cash entry by ID
    let cashEntry = await Cash.findById(id);

    // Check if entry exists
    if (!cashEntry) {
      console.log(`Cash entry with ID: ${id} not found.`);
      return res.status(404).json({ message: "Cash entry not found" });
    }

    // Authorization check: Ensure the authenticated user owns this entry
    if (cashEntry.ownerId !== auth0Id) {
      console.warn(
        `Unauthorized attempt to update entry ${id} by user ${auth0Id}. Owner is ${cashEntry.ownerId}.`
      );
      return res
        .status(403)
        .json({ message: "Not authorized to update this cash entry" });
    }

    // Apply updates only if the field is provided in the request body
    if (bank !== undefined) cashEntry.bank = bank;
    if (balance !== undefined) cashEntry.balance = balance;
    if (currency !== undefined) cashEntry.currency = currency;

    // Validate updated fields (optional, Mongoose schema validation will also catch this on save)
    if (bank !== undefined && (!bank || bank.trim() === "")) {
      return res.status(400).json({ message: "Bank name cannot be empty!" });
    }
    if (
      balance !== undefined &&
      (typeof balance !== "number" || isNaN(balance))
    ) {
      return res
        .status(400)
        .json({ message: "Balance must be a valid number!" });
    }
    if (currency !== undefined && (!currency || currency.trim() === "")) {
      return res.status(400).json({ message: "Currency cannot be empty!" });
    }

    // Save the updated entry
    const updatedCash = await cashEntry.save();

    console.log("Cash entry updated successfully:", updatedCash);
    res.status(200).json(updatedCash);
  } catch (error) {
    console.error("Error in updateCash:", error);
    console.error("Error message:", error.message);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res
        .status(400)
        .json({ message: `Validation failed: ${messages.join(", ")}` });
    }
    res.status(500).json({ message: "Server error during cash update" });
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
