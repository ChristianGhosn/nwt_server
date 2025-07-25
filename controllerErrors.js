const controllerError = (error) => {
  console.error("Full Error Object:", error); // Log the entire error object
  console.error("Error Name:", error.name);
  console.error("Error Message:", error.message);

  if (
    error.name === "MongoServerError" ||
    error.name === "MongooseServerSelectionError"
  ) {
    console.error("MongoDB Server Error Details:", error.code, error.codeName);
    return {
      success: false,
      message: "Database connection or server error during creation.",
    };
  } else {
    return {
      success: false,
      message: "Server error during cash creation.",
    };
  }
};

module.exports = { controllerError };
