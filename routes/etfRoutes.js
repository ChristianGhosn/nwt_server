const express = require("express");
const {
  getTrackedETFs,
  createTrackedETF,
  deleteTrackedETF,
  updateTrackedETF,
  getETFsTransactions,
  createETFTransaction,
  deleteETFTransaction,
} = require("../controllers/etfController");
const asyncHandler = require("../utils/controllerWrapper");
const checkJwt = require("../middleware/auth");

const router = express.Router();

router.use(checkJwt);

// Public routes
router
  .route("/")
  .get(asyncHandler(getTrackedETFs))
  .post(asyncHandler(createTrackedETF));

router
  .route("/:id")
  .put(asyncHandler(updateTrackedETF))
  .delete(asyncHandler(deleteTrackedETF));

router
  .route("/transactions")
  .get(asyncHandler(getETFsTransactions))
  .post(asyncHandler(createETFTransaction));

router.route("/transactions/:id").delete(asyncHandler(deleteETFTransaction));

module.exports = router;
