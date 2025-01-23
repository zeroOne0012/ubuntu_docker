const express = require("express");
const router = express.Router();
const Json2csvParser = require("json2csv").Parser;
const fs = require("fs");
const { errorLog } = require("../module/errorLog");  

router.get("/summary", async (req, res) => {
  try {
    const query = `
    WITH latest_dates AS (
        SELECT 
            recipe_no,
            MAX(created_t::date) AS latest_date
        FROM 
            history
        GROUP BY 
            recipe_no
    ),
    latest_data AS (
        SELECT 
            h.*
        FROM 
            history h
        INNER JOIN 
            latest_dates ld
        ON 
            h.recipe_no = ld.recipe_no
            AND h.created_t::date = ld.latest_date
    ),
    result_stats AS (
        SELECT 
            recipe_no,
            ROUND(
                (SUM(CASE WHEN result = 'NG' THEN 1 ELSE 0 END)::decimal 
                / NULLIF(COUNT(*), 0)) * 100, 2
            ) AS ng_percentage
        FROM 
            latest_data
        GROUP BY 
            recipe_no
    )
    SELECT 
        r.idx AS recipe_no,  -- recipe_no 대신 idx 사용
        r.nickname,
        r.type,
        r.weight,
        COALESCE(rs.ng_percentage, 0) AS ng_percentage
    FROM 
        recipe r
    LEFT JOIN 
        result_stats rs
    ON 
        r.idx = rs.recipe_no
    ORDER BY
       recipe_no;
    `;
    // SQL 쿼리 실행
    const result = await req.client.query(query);

    // 결과를 클라이언트에 JSON 형식으로 응답
    res.status(200).json(result.rows);
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

// GET 역할
router.post("/summary/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  let { start_date, end_date } = req.body;
  let andClause;
  try {
    let query, values;
    if (!start_date || !end_date){
      andClause = "true";
      values = [id];
    }else{
      andClause = `(created_t::date BETWEEN $2::date + INTERVAL '1 day' AND $3::date + INTERVAL '1 day')`;
      values = [id, start_date, end_date];
    }
    query = `
      SELECT 
          recipe_no,
          created_t::date AS date, 
          COUNT(*) AS ng_count
      FROM 
          history
      WHERE 
          result = 'NG' AND recipe_no = $1
          AND ${andClause}
      GROUP BY 
          recipe_no, created_t::date
      ORDER BY 
          date;
    `;
    
    const result = await req.client.query(query, values);

    const formattedData = result.rows.map((row) => ({
      ...row,
      date: row.date.toISOString().split("T")[0], // 날짜만 유지
    }));

    res.status(200).json(formattedData);
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

router.get("/last", async (req, res) => {
  try {
    const query = `
    WITH latest_dates AS (
      SELECT 
          recipe_no, 
          MAX(created_t::date) AS last_date
      FROM 
          history
      GROUP BY 
          recipe_no
    ),
    hourly_series AS (
      SELECT 
          ld.recipe_no,
          ld.last_date,
          generate_series(
              ld.last_date, 
              ld.last_date + INTERVAL '1 day' - INTERVAL '1 hour', 
              '1 hour'
          ) AS hour_bucket
      FROM 
          latest_dates ld
    ),
    filtered_data AS (
      SELECT 
          h.recipe_no,
          DATE_TRUNC('hour', h.created_t) AS hour_bucket,
          COUNT(*) AS ng_count
      FROM 
          history h
      INNER JOIN 
          latest_dates ld
      ON 
          h.recipe_no = ld.recipe_no AND h.created_t::date = ld.last_date
      WHERE 
          h.result = 'NG'
      GROUP BY 
          h.recipe_no, DATE_TRUNC('hour', h.created_t)
    ),
    final_data AS (
      SELECT 
          hs.recipe_no,
          hs.last_date::date AS last_date,
          hs.hour_bucket,
          COALESCE(fd.ng_count, 0) AS ng_count
      FROM 
          hourly_series hs
      LEFT JOIN 
          filtered_data fd
      ON 
          hs.recipe_no = fd.recipe_no AND hs.hour_bucket = fd.hour_bucket
    )
    SELECT 
        recipe_no,
        last_date,
        JSON_AGG(
          ng_count ORDER BY hour_bucket
        ) AS ng_count
    FROM 
        final_data
    GROUP BY 
        recipe_no, last_date
    ORDER BY 
        recipe_no;
  `;
    const result = await req.client.query(query);

    // 날짜만 추출하는 처리
    const formattedData = result.rows.map((row) => ({
      ...row,
      last_date: row.last_date.toISOString().split("T")[0], // 날짜만 유지
    }));

    res.status(200).json(formattedData);
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

router.get("/total", async (req, res) => {
  try {
    const query = `
    SELECT 
        r.idx AS recipe_no, 
        COALESCE(COUNT(h.result), 0) AS ng_total_count
    FROM 
        (SELECT DISTINCT idx FROM recipe) r
    LEFT JOIN 
        history h 
    ON r.idx = h.recipe_no 
        AND h.result = 'NG'
    GROUP BY 
        r.idx
    ORDER BY 
        r.idx;

    `;

    const result = await req.client.query(query);

    res.status(200).json(result.rows);
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

router.post("/csv/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  let { start_date, end_date } = req.body;
  let andClause;
  try {
    let query, values;
    if (!start_date || !end_date){
      andClause = "true";
      values = [id];
    }else{
      andClause = `(created_t::date BETWEEN $2::date + INTERVAL '1 day' AND $3::date + INTERVAL '1 day')`;
      values = [id, start_date, end_date];
    }
    query = `
        SELECT 
            recipe_no,
            created_t::date AS date, 
            COUNT(*) AS ng_count
        FROM 
            history
        WHERE 
            result = 'NG' AND recipe_no = $1
            AND ${andClause}
        GROUP BY 
            recipe_no, created_t::date
        ORDER BY 
            date;
    `;
    const result = await req.client.query(query, values);
    const jsonData = JSON.parse(JSON.stringify(result.rows));

    const json2csvParser = new Json2csvParser({ header: true });
    const csv = json2csvParser.parse(jsonData);

    fs.writeFile(`${Date.now()}_${id}`, csv, function (error) {
      if (error) throw error;
    });

    res.status(200).json(result.rows);
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


router.post("/", async (req, res) => {
  const { recipe_no, lane_no, item_no, result, created_t } = req.body;
  try {
    const query = `
        INSERT INTO history(recipe_no, lane_no, item_no, result, created_t)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;
    const values = [recipe_no, lane_no, item_no, result, created_t];

    const query_result = await req.client.query(query, values);

    res.status(201).json({
      message: "History 등록 성공",
      history: query_result.rows[0],
    });
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

router.delete("/:id", async (req, res) => {
  const historyId = parseInt(req.params.id, 10);
  try {
    const query = `
        DELETE FROM history
        WHERE idx = $1
        RETURNING *;
    `;
    const result = await req.client.query(query, [historyId]);

    if (result.rows.length===0){
      return res.status(404).json({
        message: "해당 ID의 History를 찾을 수 없습니다."
      });
    }

    res.status(200).json({
      message: "History 삭제 성공",
      deletedHistory: result.rows[0],
    });
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
