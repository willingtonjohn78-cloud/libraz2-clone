const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bookingsRouter = require("./routes/bookings");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const staticCandidates = [
  path.join(__dirname, "..", "front end"),
  path.join(__dirname, "..", "frontend"),
];
const staticDir = staticCandidates.find((candidate) => fs.existsSync(candidate));
if (!staticDir) {
  throw new Error("No frontend directory found. Expected 'front end' or 'frontend' at project root.");
}
app.use(express.static(staticDir));

app.use("/api/bookings", bookingsRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

