const dotenv = require("dotenv");
dotenv.config();

const app = require("./app");
const migrate = require("./migrate");
const matchingEngine = require("./matchingEngine");
const db = require("./db");

// Prefer `APP_PORT` for the HTTP server to avoid collisions with DB `PORT` env.
const PORT = parseInt(process.env.APP_PORT || process.env.PORT || '4000', 10);

async function start() {
  // Check DB connectivity before running DB-dependent components
  let dbAvailable = false;
  try {
    const conn = await db.getConnection();
    await conn.ping();
    conn.release();
    dbAvailable = true;
    console.log(
      "Database reachable. Proceeding with migrations and background workers."
    );
  } catch (err) {
    console.warn("Database not reachable:", err.message);
    console.warn(
      "Server will start without running migrations or background workers."
    );
  }

  if (dbAvailable) {
    try {
      console.log("Running DB migration...");
      await migrate();
    } catch (err) {
      console.warn(
        "Migration failed or partially executed; ensure DB already initialized if intended.",
        err.message
      );
    }

    // Start matching engine only when DB is available
    try {
      matchingEngine.start();
    } catch (err) {
      console.error("Failed to start matching engine:", err.message);
    }
  }

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

start().catch((err) => {
  console.error("Failed to start app", err);
  process.exit(1);
});
