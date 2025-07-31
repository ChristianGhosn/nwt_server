const mongoose = require("mongoose");

const trackedEtfSchema = new mongoose.Schema(
  {
    ticker: { type: String, required: true },
    heldUnits: { type: Number, default: 0 },
    avgPrice: { type: Number, default: 0 },
    currentAllocation: { type: Number, default: 0 },
    targetAllocation: { type: Number, default: 0 },
    managementFee: { type: Number, default: 0 },
    ownerId: { type: String, required: true },
  },
  { timestamps: true }
);

const etfTransactionSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: ["buy", "sell"],
    },
    ticker: { type: String, required: true },
    orderDate: { type: Date, default: Date.now },
    units: { type: Number, required: true },
    orderPrice: { type: Number, required: true },
    brokerage: { type: Number, default: 0 },
    soldUnits: { type: Number, default: 0 },
    orderValue: { type: Number, default: 0 },
    remainingUnits: { type: Number, default: 0 },
    capitalGains: { type: Number, default: 0 },
    ownerId: { type: String, required: true },
    linkedBuys: [
      {
        buyTransactionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "EtfTransaction",
        },
        matchedUnits: Number,
        gainPerUnit: Number,
        gainTotal: Number,
      },
    ],
    linkedSells: [
      {
        sell_transaction_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "EtfTransaction",
        },
        matchedUnits: Number,
        gainPerUnit: Number,
        gainTotal: Number,
      },
    ],
  },
  { timestamps: true }
);

// PRESAVE HOOK FOR ORDER VALUE, REMAINING BALANCE & remainingUnits (buy transaction)
etfTransactionSchema.pre("save", function (next) {
  if (this.isModified("units") || this.isModified("orderPrice") || this.isNew) {
    this.orderValue = Math.abs(this.units * this.orderPrice);
  }

  // Only set remainingUnits on creation for "buy" transactions
  if (this.isNew && this.action === "buy") {
    this.remainingUnits = this.units;
  }

  next();
});

const TrackedEtf = mongoose.model("TrackedEtf", trackedEtfSchema);
const EtfTransaction = mongoose.model("EtfTransaction", etfTransactionSchema);

module.exports = { TrackedEtf, EtfTransaction };
