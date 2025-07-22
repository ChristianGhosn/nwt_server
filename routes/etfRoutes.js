const express = require("express");
const { getETFs } = require("../controllers/etfController");

const router = express.Router();

// Public routes
router.get("/", getETFs);

module.exports = router;
