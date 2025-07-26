const express = require("express");
const {
  getTrackedETFs,
  createTrackedETF,
  deleteTrackedETF,
  updateTrackedETF,
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

module.exports = router;
