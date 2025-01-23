const { Pool } = require("pg");

const pool = new Pool({
  user: "handalab",
  password: "handalab",
  host: "localhost",
  database: "eggtec",
  port: 5432,
  idleTimeoutMillis: 3000,
  connectionTimeoutMillis: 30000,
  max: 10,
});

module.exports = pool;
