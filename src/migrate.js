const fs = require("fs");
const path = require("path");
const { getConnection } = require("./db");

async function run() {
  let sql = fs.readFileSync(
    path.join(__dirname, "..", "db", "init.sql"),
    "utf8"
  );

  // Remove all DELIMITER directives (client-side command, not valid SQL)
  sql = sql.replace(/DELIMITER\s+\S+/gi, "");

  // Replace $$ with semicolon
  sql = sql.replace(/\$\$/g, ";");

  // Strip 'IF NOT EXISTS' from CREATE INDEX statements only (MySQL 5.7 doesn't support it on indexes)
  // This regex is careful to only match "CREATE INDEX IF NOT EXISTS" pattern, not DROP
  sql = sql.replace(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+/gi, "CREATE INDEX ");

  // Remove double semicolons left from $$ replacement
  sql = sql.replace(/;;+/g, ";");

  // Clean up: remove multiple consecutive semicolons, leading/trailing whitespace
  const cleaned = sql.trim();
  if (!cleaned) return;

  const conn = await getConnection();
  try {
    // Execute the whole script in one go (pool configured with multipleStatements)
    await conn.query(cleaned);
    console.log("Migration finished successfully");
  } catch (err) {
    // Ignore "already exists" errors for objects on re-run (ER_PARSE_ERROR, ER_DUP_KEYNAME, ER_TRG_ALREADY_EXISTS)
    if (
      err.code === "ER_TRG_ALREADY_EXISTS" ||
      err.code === "ER_SP_ALREADY_EXISTS" ||
      err.code === "ER_EVENT_ALREADY_EXISTS" ||
      err.errno === 1304 ||
      err.errno === 1061
    ) {
      console.log(
        "Migration partial - some objects already exist (this is OK for idempotent re-runs)"
      );
    } else if (err.code === "ER_PARSE_ERROR") {
      // Try splitting by double semicolons to see if it helps
      console.log(
        "Parse error - this might be a syntax issue. Details:",
        err.sqlMessage
      );
      throw err;
    } else {
      throw err;
    }
  } finally {
    conn.release();
  }
}

if (require.main === module) {
  run().catch((err) => process.exit(1));
}

module.exports = run;
