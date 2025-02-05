const express = require("express");
const router = express.Router();
const { errorLog } = require("../module/errorLog");  
const fs = require("fs");
const path = require("path");

const netDir = "../net";

router.get("/", async (req, res) => {
  try {
    const result = await req.client.query(`SELECT * FROM recipe ORDER BY idx`);

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

router.get("/model", async (req, res) => {
  try {
    if (req.client) req.client.release();
    const files = fs.readdirSync(netDir);
    const netFiles = files.filter((file) => file.includes(".net"));
    res.status(200).json(netFiles);
  } catch (error) {
    console.log(error)
    errorLog(`${req.method} ${req.originalUrl}`, 4, error.message);
    res.status(500).json({
      message: "fs error",
      error: error.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  const recipeId = parseInt(req.params.id, 10);
  try {
    const query = `SELECT * FROM recipe WHERE idx = $1`;
    const values = [recipeId];

    const result = await req.client.query(query, values);

    if (result.rows.length === 0) {
      // ID에 해당하는 데이터가 없는 경우
      return res.status(404).json({
        message: "해당 ID의 Recipe를 찾을 수 없습니다.",
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

router.post("/", async (req, res) => {
  const { idx, nickname, type, weight } = req.body;
  try {
    const query = `
        INSERT INTO recipe (idx, nickname, type, weight)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
    const values = [idx, nickname, type, weight.split(/[/\\:]/).at(-1)];

    const result = await req.client.query(query, values);

    res.status(201).json({
      message: "Recipe 등록 성공",
      recipe: result.rows[0],
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


router.patch("/:id", async (req, res) => {
  const idx = parseInt(req.params.id, 10);
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
    const values = [...Object.values(updates), idx];

    const query = `
        UPDATE recipe
        SET ${setClause}
        WHERE idx = $${values.length}
        RETURNING *;
      `;
    const result = await req.client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "해당 ID의 Recipe를 찾을 수 없음.",
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

router.delete("/:id", async (req, res) => {
  const recipeId = parseInt(req.params.id, 10);
  try {
    // DELETE 쿼리 실행
    const result = await req.client.query(
      `DELETE FROM recipe WHERE idx = $1 RETURNING *`,
      [recipeId]
    );

    // 삭제된 레코드가 없는 경우 처리
    if (result.rows.length === 0) {
      return res.status(404).json({
        message: "해당 ID의 Recipe를 찾을 수 없습니다.",
      });
    }
    // 성공적으로 삭제된 경우
    res.status(200).json({
      message: "Recipe 삭제 성공",
      deletedRecipe: result.rows[0],
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
