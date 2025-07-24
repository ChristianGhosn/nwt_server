const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

connectDB();

const app = express();
const PORT = process.env.PORT || 5050;

const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN : [];

const corsOptions = {
  origin: (origin, callback) => {
    // If the origin is in our allowed list, or if it's not present (e.g., for direct API calls,
    // or same-origin requests during development within the same server), allow the request.
    // Note: The "#" in your GitHub Pages URL is a client-side fragment and is NOT part of the origin sent to the server.
    // So, we allow "https://christianghosn.github.io"
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: true, // Important if you're using cookies or authorization headers across origins
  optionsSuccessStatus: 200, // Some legacy browsers (IE11, various SmartTVs) might need this
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
const etfRoutes = require("./routes/etfRoutes.js");
const cashRoutes = require("./routes/cashRoutes.js");
app.use("/api/cash", cashRoutes);
app.use("/api/etfs", etfRoutes);

// Root
app.get("/", (req, res) => {
  res.send("API Running");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
