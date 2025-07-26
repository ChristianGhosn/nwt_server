const Cash = require("../models/Cash");
const getAuthUserId = require("../utils/auth");
const verifyOwnership = require("../utils/authorize");
const aggregateValidationErrors = require("../utils/validation");
const {
  validateBank,
  validateBalance,
  validateCurrency,
} = require("../validators/cashValidation");

// GET /api/cash
const getCash = async (req, res) => {
  const auth0Id = getAuthUserId(req);

  console.log("--- GET /api/cash START ---");
  console.log("Auth0 ID for fetching cash entries:", auth0Id);

  // Find cash entries belonging to the authenticated user
  const entries = await Cash.find({ ownerId: auth0Id });

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
};

// POST /api/cash
const createCash = async (req, res) => {
  const { balance, bank, currency } = req.body;
  const auth0Id = getAuthUserId(req);

  console.log("--- POST /api/cash START ---");
  console.log("Received data for creation (req.body):", {
    balance,
    bank,
    currency,
  });
  console.log("Auth0 ID for creation:", auth0Id);

  // Perform Validation
  const { hasErrors, structuredErrors, flatMessage } =
    aggregateValidationErrors({
      bank: validateBank(bank),
      balance: validateBalance(balance),
      currency: validateCurrency(currency),
    });

  if (hasErrors) {
    return res
      .status(400)
      .json({ success: false, message: flatMessage, errors: structuredErrors });
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
};

// PUT /api/cash/:id
const updateCash = async (req, res) => {
  const { id } = req.params; // Get the ID from the URL parameters
  const { bank, balance, currency } = req.body; // Get updated data from request body
  const auth0Id = getAuthUserId(req);

  console.log(`--- PUT /api/cash/${id} START ---`);
  console.log("Received update data:", { bank, balance, currency });
  console.log("Auth0 ID for update authorization:", auth0Id);

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
  verifyOwnership(cashEntry, auth0Id, "cash entry");

  // --- Perform Validation for provided fields ---
  const validations = {};

  if (bank !== undefined) validations.bank = validateBank(bank);
  if (balance !== undefined) validations.balance = validateBalance(balance);
  if (currency !== undefined) validations.currency = validateCurrency(currency);

  const { hasErrors, structuredErrors, flatMessage } =
    aggregateValidationErrors(validations);

  if (hasErrors) {
    return res.status(400).json({
      success: false,
      message: flatMessage,
      errors: structuredErrors,
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
};

// DELETE /api/cash/:id
const deleteCash = async (req, res) => {
  const { id } = req.params; // Get the ID from the URL parameters
  const auth0Id = getAuthUserId(req);

  console.log(`Attempting to delete cash entry with ID: ${id}`);
  console.log("Auth0 ID for delete authorization:", auth0Id);

  // Find the cash entry by ID
  const cashEntry = await Cash.findById(id);

  // Check if entry exists
  if (!cashEntry) {
    console.log(`Cash entry with ID: ${id} not found for deletion.`);
    return res.status(404).json({ message: "Cash entry not found" });
  }

  // Authorization check: Ensure the authenticated user owns this entry
  verifyOwnership(cashEntry, auth0Id, "cash entry");

  // Delete the entry
  await Cash.deleteOne({ _id: id }); // Use deleteOne with the _id query

  console.log(`Cash entry with ID: ${id} deleted successfully.`);
  res.status(200).json({ message: "Cash entry deleted successfully" }); // 200 OK with success message
};

module.exports = { getCash, createCash, updateCash, deleteCash };
