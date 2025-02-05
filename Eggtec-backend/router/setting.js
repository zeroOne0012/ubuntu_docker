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

router.get("/initialize", async (req,res)=>{
  let query;
  try{
    query = `
    select idx, type, weight from recipe where "selected"=true;
    `;
    const result_selected = await req.client.query(query);
    if(result_selected.rows.length!==1){
      
      console.log("11");
      errorLog(`${req.method} ${req.originalUrl}`, 5, error.message);
      console.log("22");
      return res.status(500).json({
        message: "nothing selected"
      });
    }
    const exposureTime = `exp_${(result_selected.rows[0].type).toLowerCase()}`;
    
    query = `
    select output_cnt, ${exposureTime} exposure, y1,y2,y3,y4 from setting;
    `;
    const result = await req.client.query(query);

    res.status(200).json({
      RECIPE_IDX : result_selected.rows[0].idx,
      RECIPE_NET : result_selected.rows[0].weight,
      CAM1 : [result.rows[0].y1, result.rows[0].y2],
      CAM2 : [result.rows[0].y3, result.rows[0].y4],
      EXPOSURE : result.rows[0].exposure,
      COUNTER : result.rows[0].output_cnt
    });    
  }  catch (error) {
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
