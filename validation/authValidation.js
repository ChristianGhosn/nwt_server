const validateAuth = (input) => {
  if (!input) {
    console.error(
      "ERROR: Owner ID (auth0Id) is missing! Token might be invalid or middleware not working."
    );
    return "User ID not available!";
  }
};

module.exports = validateAuth;
