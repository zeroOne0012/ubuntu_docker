const express = require("express");
const router = express.Router();
const Json2csvParser = require("json2csv").Parser;
const fs = require("fs");
const path = require('path');
const { errorLog } = require("../module/errorLog");  

function getUniqueFilePath(basePath, filePath) {
  let filepath = `${basePath}${filePath}.csv`;
  let count = 1;

  // 파일이 존재하면 (1), (2) 추가
  while (fs.existsSync(filepath)) {
      filepath = `${basePath}${filePath} (${count}).csv`;
      count++;
  }

  return filepath;
}

function saveFile(basePath, filePath, csv) {
  if (!fs.existsSync(basePath)) {
    fs.mkdirSync(basePath, { recursive: true });
  }
  const filepath = getUniqueFilePath(basePath, filePath);

  return new Promise((resolve, reject) => {
    // 파일 저장
    fs.writeFile(filepath, csv, (error) => {
        if (error) {
            return reject(`File Save Error`);
        }
        resolve(filepath); 
    });
  });
}

function getFormattedDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // 월 (0부터 시작하므로 +1 필요)
  const day = String(now.getDate()).padStart(2, '0'); // 일

  return `${year}${month}${day}`;
}

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
                (SUM(CASE WHEN lane1 != 0 THEN 1 ELSE 0 END +
                     CASE WHEN lane2 != 0 THEN 1 ELSE 0 END +
                     CASE WHEN lane3 != 0 THEN 1 ELSE 0 END +
                     CASE WHEN lane4 != 0 THEN 1 ELSE 0 END +
                     CASE WHEN lane5 != 0 THEN 1 ELSE 0 END +
                     CASE WHEN lane6 != 0 THEN 1 ELSE 0 END)::decimal 
                / NULLIF(COUNT(*), 0)) / 6 * 100, 2
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
          COALESCE(SUM(CASE WHEN lane1 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane2 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane3 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane4 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane5 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane6 != 0 THEN 1 ELSE 0 END), 0) AS ng_count
      FROM 
          history
      WHERE 
          recipe_no = $1
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
                    COALESCE(SUM(CASE WHEN lane1 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane2 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane3 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane4 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane5 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane6 != 0 THEN 1 ELSE 0 END), 0) AS ng_count
      FROM 
          history h
      INNER JOIN 
          latest_dates ld
      ON 
          h.recipe_no = ld.recipe_no AND h.created_t::date = ld.last_date
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
            COALESCE(SUM(CASE WHEN h.lane1 != 0 THEN 1 ELSE 0 END +
            CASE WHEN h.lane2 != 0 THEN 1 ELSE 0 END +
            CASE WHEN h.lane3 != 0 THEN 1 ELSE 0 END +
            CASE WHEN h.lane4 != 0 THEN 1 ELSE 0 END +
            CASE WHEN h.lane5 != 0 THEN 1 ELSE 0 END +
            CASE WHEN h.lane6 != 0 THEN 1 ELSE 0 END), 0) AS ng_total_count
    FROM 
        (SELECT DISTINCT idx FROM recipe) r
    LEFT JOIN 
        history h 
    ON r.idx = h.recipe_no 
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
  let { start_date, end_date, path } = req.body;
  let andClause, result;
  let filepath;
  const basePath = `${path}csv/`
  try {
    let query, values;
    if (!start_date || !end_date){
      andClause = "true";
      values = [id];
      filepath = `${getFormattedDate()}_recipe${id}`;
    }else{
      andClause = `(created_t::date BETWEEN $2::date + INTERVAL '1 day' AND $3::date + INTERVAL '1 day')`;
      values = [id, start_date, end_date];
      let st = start_date.split("-").join("")
      let end = end_date.split("-").join("")
      filepath = `${st}_${end}_recipe${id}`;
    };
    query = `
        SELECT 
            recipe_no,
            created_t::date AS date, 
            COALESCE(SUM(CASE WHEN lane1 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane2 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane3 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane4 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane5 != 0 THEN 1 ELSE 0 END +
              CASE WHEN lane6 != 0 THEN 1 ELSE 0 END), 0) AS ng_count
        FROM 
            history
        WHERE 
            recipe_no = $1
            AND ${andClause}
        GROUP BY 
            recipe_no, created_t::date
        ORDER BY 
            date;
    `;
    result = await req.client.query(query, values);
  } catch (error) {
    errorLog(`${req.method} ${req.originalUrl}`, 1, error.message);
    return res.status(400).json({
      message: "Invalid Request",
      error: error.message,
    });
  } finally {
    if (req.client) req.client.release(); 
  }

  try{
    const jsonData = JSON.parse(JSON.stringify(result.rows));
    const json2csvParser = new Json2csvParser({ header: true });
    const csv = json2csvParser.parse(jsonData);
    try {
      const file = await saveFile(basePath, filepath, csv);
      res.status(200).json({ message: file });
    } catch (error) {
      errorLog(`${req.method} ${req.originalUrl}`, 6, error.message);
      res.status(500).json({ message: error });
    }
    
  } catch (error) {
    errorLog(`${req.method} ${req.originalUrl}`, 6, error.message);
    res.status(404).json({
      message: "Invalid Request",
      error: "Empty query result"
    });
  }
});


router.post("/", async (req, res) => {
  const { recipe_no, item_no, lane1, lane2, lane3, lane4, lane5, lane6, created_t } = req.body;
  try {
    const query = `
        INSERT INTO history(recipe_no, item_no, lane1, lane2, lane3, lane4, lane5, lane6, created_t)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
    `;
    const values = [recipe_no, item_no, lane1, lane2, lane3, lane4, lane5, lane6, created_t];

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
