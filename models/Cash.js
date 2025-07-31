const mongoose = require("mongoose");

const cashSchema = new mongoose.Schema(
  {
    balance: { type: Number, required: true },
    bank: { type: String, required: true },
    currency: { type: String, required: true },
    ownerId: { type: String, required: true },
  },
  { timestamps: true }
);

const Cash = mongoose.model("Cash", cashSchema);

module.exports = Cash;
