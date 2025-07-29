const mongoose = require("mongoose");

const trackedEtfSchema = new mongoose.Schema(
  {
    ticker: {
      type: String,
      required: true,
    },
    held_units: {
      type: Number,
      default: 0,
    },
    avg_price: {
      type: Number,
      default: 0,
    },
    current_allocation: {
      type: Number,
      default: 0,
    },
    target_allocation: {
      type: Number,
      default: 0,
    },
    management_fee: {
      type: Number,
      default: 0,
    },
    ownerId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

const etfTransactionSchema = new mongoose.Schema(
  {
    ticker: {
      type: String,
      required: true,
    },
    order_date: {
      type: Date,
      default: Date.now,
    },
    units: {
      type: Number,
      required: true,
    },
    order_price: {
      type: Number,
      required: true,
    },
    brokerage: {
      type: Number,
      default: 0,
    },
    order_value: {
      type: Number,
      required: true,
    },
    ownerId: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

// PRESAVE HOOK FOR ORDER VALUE & REMAINING BALANCE
etfTransactionSchema.pre("save", function (next) {
  if (
    this.isModified("units") ||
    this.isModified("order_price") ||
    this.isNew
  ) {
    this.order_value = Math.abs(this.units * this.order_price);
  }
  next();
});

const TrackedEtf = mongoose.model("TrackedEtf", trackedEtfSchema);
const EtfTransaction = mongoose.model("EtfTransaction", etfTransactionSchema);

module.exports = { TrackedEtf, EtfTransaction };
