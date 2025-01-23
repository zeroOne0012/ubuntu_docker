const express = require("express");
const router = express.Router();
const { errorLog } = require("../module/errorLog");  


router.get("/", async (req, res) => {
  try {
    const result = await req.client.query(`SELECT * FROM setting`);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    errorLog(`${req.method} ${req.originalUrl}`, 1, error.message);
    res.status(500).json({
      message: "Query Failed",
      error: error.message,
    });
  } finally {
    if (req.client) req.client.release(); 
  }
});


router.patch("/", async (req, res) => {
  const updates = req.body;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      message: "수정할 데이터가 없음.",
    });
  }

  try {
    // SQL의 SET 절 생성
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(", ");

    // 업데이트할 값 배열
    const values = [...Object.values(updates), 1];

    const query = `
        UPDATE setting
        SET ${setClause}
        WHERE idx = $${values.length}
        RETURNING *;
      `;
    const result = await req.client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "해당 ID의 setting을 찾을 수 없음.",
      });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    errorLog(`${req.method} ${req.originalUrl}`, 1, error.message);
    res.status(400).json({
      message: "Invalid Request",
      error: error.message,
    });
  } finally {
    if (req.client) req.client.release(); 
  }
});

module.exports = router;
