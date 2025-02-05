const pool = require("./postgres");
const fs = require('fs');
const path = require('path');

const errorCode = {
    0: "pool-connect failed",
    1: "query failed",
    2: "server error",
    3: "invalid value",
    4: "fs error",
    5: "nothing selected",
    6: "csv-save failed"
}

// DB connection error log (local)
function errorLogLocal(type, code, message) {
  const now = new Date();
  const formattedDate = now.toISOString().replace(/T/, ' ').replace(/\..+/, '');
  
  const errorDir = path.resolve(__dirname, '../error');
  const logFilePath = path.join(errorDir, 'log.txt');

  const errorMsg = `[${formattedDate}] ${type} - ${errorCode[code]}: ${message}\n`;

  if (!fs.existsSync(errorDir)) {
      fs.mkdirSync(errorDir, { recursive: true });
  }
  fs.appendFile(logFilePath, errorMsg, (err) => {
      if (err) {
          console.error('Failed to write to log file:', err);
      }
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
  // console.log("TEST");
}   

module.exports = {
  errorLog,
  errorLogLocal
};