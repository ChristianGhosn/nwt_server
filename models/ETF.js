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

// Post-save hook to update held_units in trackedETFs
etfTransactionSchema.post("save", async function (doc) {
  try {
    const { ticker, units, order_price, ownerId } = doc;
    let trackedEtf = await TrackedEtf.findOne({ ticker, ownerId });

    if (!trackedEtf) {
      // Create a new tracked ETF entry if it doesn't exist
      // This path only makes sense if it's a purchase (units > 0)
      if (units > 0) {
        trackedEtf = new TrackedEtf({
          ticker,
          held_units: units,
          avg_price: order_price,
        });
        await trackedEtf.save();
        console.log(
          `Created new TrackedEtf for ${ticker} with ${trackedEtf.held_units} units.`
        );
      } else {
        console.log(
          `Attempted to sell ${Math.abs(
            units
          )} units of ${ticker}, but it's not a tracked ETF.`
        );
      }
    } else {
      // Update existing tracked ETF
      const oldHeldUnits = trackedEtf.held_units;
      const oldAvgPrice = trackedEtf.avg_price;

      trackedEtf.held_units += units;

      // Ensure held_units doesn't go negative if selling more than held
      if (trackedEtf.held_units < 0) {
        console.log(
          `Warning: Held units for ${ticker} went negative (${trackedEtf.held_units}) after transaction.`
        );
        trackedEtf.held_units = oldHeldUnits;
      }

      if (units > 0) {
        const totalCostOld = oldHeldUnits * oldAvgPrice;
        const totalCostNew = units * order_price;
        const totalUnitsOldAndNew = oldHeldUnits + units;

        if (totalUnitsOldAndNew > 0) {
          trackedEtf.avg_price =
            (totalCostOld + totalCostNew) / totalUnitsOldAndNew;
        } else {
          trackedEtf.avg_price = order_price;
        }
      }
    }

    await trackedEtf.save();
    console.log(
      `Updated TrackedEtf for ${ticker}. Held: ${trackedEtf.held_units}, Avg Price: ${trackedEtf.avg_price}`
    );
  } catch (error) {
    console.error(`Error in post-save hook for ${doc.ticker}:`, error);
  }
});

const TrackedEtf = mongoose.model("TrackedEtf", trackedEtfSchema);
const EtfTransaction = mongoose.model("EtfTransaction", etfTransactionSchema);

module.exports = { TrackedEtf, EtfTransaction };
