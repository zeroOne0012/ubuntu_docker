const pool = require("./postgres");
const fs = require('fs');
const path = require('path');

const errorCode = {
    0: "pool-connect failed",
    1: "query failed",
}

// DB connection error log (local)
function errorLogLocal(type, code, message) {
    const now = new Date();
    const formattedDate = now.toISOString().replace(/:/g, '-');
    const fileName = `${formattedDate}.txt`;

    const errorDir = path.resolve(__dirname, '../error');
    const filePath = path.join(errorDir, fileName);

    if (!fs.existsSync(errorDir)) {
        fs.mkdirSync(errorDir, { recursive: true });
    }
    const errorMsg = `${type} - ${errorCode[code]}: ${message}\n`;
    fs.writeFile(filePath, errorMsg, (err) => {
        if (err) { throw err; }
    });
}

async function errorLog(type, code, message) {
  let client;
  const query = `
    INSERT INTO error(type, message) VALUES($1, $2);
  `;
  try{
    client = await pool.connect();
  }catch(err){
    errorLogLocal("errorLog.js", 0, err.message);
    return;
  }
  const errorMsg = `${errorCode[code]}: ${message}`;
  try {
    await client.query(query, [type, errorMsg]);
  } catch (err) {
    errorLogLocal("errorLog.js", 1, err.message);
  } finally {
    if (client) client.release();
  }
}   

module.exports = {
  errorLog,
  errorLogLocal
};