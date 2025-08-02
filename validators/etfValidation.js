const validateAction = (input) => {
  const errors = [];
  if (typeof input !== "string") {
    console.log("Validation Failed: Action is an invalid input.");
    errors.push("Action input is invalid");
    return errors;
  }

  if (!input || input.trim() === "") {
    console.log("Validation Failed: Action is required");
    errors.push("Action is required");
  }

  if (input !== "buy" && input !== "sell") {
    console.log("Validation Failed: Action must be buy or sell");
    errors.push("Action must be buy or sell");
  }
  return errors;
};

const validateTicker = (input) => {
  const errors = [];
  if (typeof input !== "string") {
    console.log("Validation Failed: Ticker is an invalid input.");
    errors.push("Ticker input is invalid");
    return errors;
  }

  if (!input || input.trim() === "") {
    console.log("Validation Failed: Ticker is required");
    errors.push("Ticker is required");
  }
  return errors;
};

const validateTargetAllocation = (input) => {
  const errors = [];
  if (typeof input !== "number" || isNaN(input)) {
    console.log("Validation Failed: Target allocation must be a valid number.");
    errors.push("Target allocation must be a valid number");
  }
  return errors;
};

const validateManagementFee = (input) => {
  const errors = [];
  if (typeof input !== "number" || isNaN(input)) {
    console.log("Validation Failed: Management fee must be a valid number.");
    errors.push("Management fee must be a valid number");
  }
  return errors;
};

const validateOrderDate = (input) => {
  const errors = [];
  if (typeof input !== "string") {
    console.log("Validation Failed: Order date is an invalid input.");
    errors.push("Order date input is invalid");
    return errors;
  }

  if (!input || input.trim() === "") {
    console.log("Validation Failed: Order date is required");
    errors.push("Order date is required");
  }

  const date = new Date(input);
  const now = new Date();

  if (isNaN(date.getTime())) {
    console.log("Validation Failed: Order date is not a valid date.");
    errors.push("Order date must be a valid date.");
    return errors;
  }

  if (date > now) {
    console.log("Validation Failed: Order date cannot be in the future.");
    errors.push("Order date cannot be in the future.");
  }

  return errors;
};

const validateUnits = (input) => {
  const errors = [];
  if (typeof input !== "number" || isNaN(input)) {
    console.log("Validation Failed: Units must be a valid number.");
    errors.push("Units must be a valid number");
  }
  if (input <= 0) {
    console.log("Validation Failed: Units must greater than 0.");
    errors.push("Units must greater than 0");
  }
  return errors;
};

const validateOrderPrice = (input) => {
  const errors = [];
  if (typeof input !== "number" || isNaN(input)) {
    console.log("Validation Failed: Order price must be a valid number.");
    errors.push("Order price must be a valid number");
  }
  return errors;
};

const validateBrokerage = (input) => {
  const errors = [];
  if (typeof input !== "number" || isNaN(input)) {
    console.log("Validation Failed: Brokerage fee must be a valid number.");
    errors.push("Brokerage fee must be a valid number");
  }
  return errors;
};

module.exports = {
  validateAction,
  validateTicker,
  validateTargetAllocation,
  validateManagementFee,
  validateOrderDate,
  validateUnits,
  validateOrderPrice,
  validateBrokerage,
};
