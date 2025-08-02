const controllerError = (error) => {
  console.error("Full Error Object:", error); // Log the entire error object
  console.error("Error Name:", error.name);
  console.error("Error Message:", error.message);

  if (error.name === "ValidationError") {
    const messages = Object.values(error.errors).map((val) => val.message);
    console.error("Mongoose Validation Error Details:", messages);
    return {
      success: false,
      message: `Database validation failed: ${messages.join(", ")}`,
      status: 400,
    };
  } else if (
    error.name === "MongoServerError" ||
    error.name === "MongooseServerSelectionError"
  ) {
    console.error("MongoDB Server Error Details:", error.code, error.codeName);
    return {
      success: false,
      message: "Database connection or server error.",
      status: 500,
    };
  } else {
    return {
      success: false,
      message: error.message || "Server error.",
      status: 500,
    };
  }
};

module.exports = { controllerError };
