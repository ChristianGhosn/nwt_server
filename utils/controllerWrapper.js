module.exports = function asyncHandler(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      console.error("Controller Error:", error);
      const { controllerError } = require("../controllerErrors");
      const err = controllerError(error);
      res.status(err.status || 500).json(err);
    }
  };
};
