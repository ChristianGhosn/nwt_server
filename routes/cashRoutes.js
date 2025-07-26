const express = require("express");
const {
  getCash,
  createCash,
  updateCash,
  deleteCash,
} = require("../controllers/cashController");
const asyncHandler = require("../utils/controllerWrapper");
const checkJwt = require("../middleware/auth");

const router = express.Router();

router.use(checkJwt);

// Routes for /api/cash
router
  .route("/")
  .get(asyncHandler(getCash)) // GET /api/cash - Fetch all cash entries for the authenticated user
  .post(asyncHandler(createCash)); // POST /api/cash - Create a new cash entry for the authenticated user

// Routes for /api/cash/:id
router
  .route("/:id")
  .put(asyncHandler(updateCash)) // PUT /api/cash/:id - Update a specific cash entry by ID
  .delete(asyncHandler(deleteCash)); // DELETE /api/cash/:id - Delete a specific cash entry by ID

module.exports = router;
