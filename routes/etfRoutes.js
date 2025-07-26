const express = require("express");
const {
  getTrackedETFs,
  createTrackedETF,
  deleteTrackedETF,
} = require("../controllers/etfController");
const checkJwt = require("../middleware/auth");

const router = express.Router();

router.use(checkJwt);

// Public routes
router.route("/").get(getTrackedETFs).post(createTrackedETF);

router.route("/:id").delete(deleteTrackedETF);

module.exports = router;
