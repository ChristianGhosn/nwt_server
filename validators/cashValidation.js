const validateBank = (input) => {
  const errors = [];
  if (typeof input !== "string") {
    console.log("Validation Failed: Bank name is invalid.");
    errors.push("Bank name input is invalid");
    return errors;
  }

  if (!input || input.trim() === "") {
    console.log("Validation Failed: Bank name is required.");
    errors.push("Bank name is required");
  }
  return errors;
};

const validateBalance = (input) => {
  const errors = [];
  if (typeof input !== "number" || isNaN(input)) {
    console.log("Validation Failed: Balance must be a valid number.");
    errors.push("Balance must be a valid number");
  }
  return errors;
};

const validateCurrency = (input) => {
  const errors = [];
  if (typeof input !== "string") {
    console.log("Validation Failed: Currency is invalid.");
    errors.push("Currency is invalid");
    return errors;
  }

  if (!input || input.trim() === "") {
    console.log("Validation Failed: Currency is required or invalid.");
    errors.push("Currency is required or invalid");
  }

  if (input.length !== 3) {
    console.log("Validation Failed: Currency is not 3 characters.");
    errors.push("Currency is not 3 characters");
  }
  return errors;
};

module.exports = { validateBank, validateBalance, validateCurrency };
