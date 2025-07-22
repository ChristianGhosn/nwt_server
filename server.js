const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

connectDB();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
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
  console.log(`Server running on http://localhost:${PORT}`);
});
