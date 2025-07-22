require("dotenv").config();
const { auth } = require("express-oauth2-jwt-bearer");

const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_DOMAIN,
  tokenSigningAlg: "RS256",
});

module.exports = checkJwt;
