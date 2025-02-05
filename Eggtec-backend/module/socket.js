const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./postgres");
const { errorLog, errorLogLocal } = require("./errorLog");
const { create } = require("domain");
const { emit } = require("process");

const getSocket = {
  4001: "Analysis", 
  4002: "Line1", 
  4003: "Line2",
  4004: "Interval",
  4005: "Cam1_setting",
  4006: "Cam2_setting"
};

const interval = 3000;

function createSocketServer(port) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  app.get("/", (req, res) => {
    res.send(`Socket.IO Server is running on port ${port}`);
  });

  // 클라이언트 연결 처리
  io.on("connection", (socket) => {
    socket.on("disconnect", () => {      
    });

    // message
    socket.on("message", async (msg) => {
      let data;
      let client;
      try{
        data = JSON.parse(msg);
      }catch(err){
        socket.emit("message", `${getSocket[port]} invalid json body: ${err.message}`);
        errorLog(`${getSocket[port]} socket`, 0, err.message);
        return;
      }
      
      try{
        client = await pool.connect();
      }catch(err){
        socket.emit("message", `${getSocket[port]} database error: ${err.message}`);
        errorLogLocal("socket.js", 1, err.message);
        return;
      }
      try{
        const {status, message} = data;
        // 에러 발생 시 DB 에 type, message 저장
        if(status < 0){
          const query = `
            INSERT INTO ERROR (type, message) 
            VALUES ($1, $2)
            RETURNING *;
          `;
          values = [getSocket[port], message];
    
          await client.query(query, values);
        }
        io.emit("message", JSON.stringify(data));
      }catch(err){
        console.error(err);
        errorLog(`${getSocket[port]} socket`, 0, err.message);
      } finally {
        if (client) client.release();
      }
    });
  });

  // 서버 실행
  server.listen(port, () => {
    console.log(`${getSocket[port]} server running on http://localhost:${port}`);
  });
}



function createIntervalSocketServer(port) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  let isInterval = false;
  let intervalId;

  app.get("/", (req, res) => {
    res.send(`Socket.IO Server is running on port ${port}`);
  });

  // 클라이언트 연결 처리
  io.on("connection", (socket) => {
    if(!isInterval){
      intervalId = setInterval(async () => {
        let client;
        try{
          client = await pool.connect();
        }catch(err){
          socket.emit("message", `${getSocket[port]} database error: ${err.message}`);
          errorLogLocal("socket.js", 1, err.message);
          return;
        }
        // 'all_total' tuple (first tuple)
        // lane(n): -1(null(NG)), 0(OK), 1(NG)
        const countLane = (result)=>{ // 쿼리 중복 부분
          let condition = "!="; // NG
          if(result==="OK") condition = "=";
          return `COALESCE(SUM(
            CASE WHEN lane1 ${condition} 0 THEN 1 ELSE 0 END +
            CASE WHEN lane2 ${condition} 0 THEN 1 ELSE 0 END +
            CASE WHEN lane3 ${condition} 0 THEN 1 ELSE 0 END +
            CASE WHEN lane4 ${condition} 0 THEN 1 ELSE 0 END +
            CASE WHEN lane5 ${condition} 0 THEN 1 ELSE 0 END +
            CASE WHEN lane6 ${condition} 0 THEN 1 ELSE 0 END
            ), 0)`;
        };
        const countLaneNQuery = (i)=>{ // 쿼리 중복 부분
          return `
            SELECT 
            ${i} lane_no,
              COALESCE(SUM(CASE WHEN lane${i} != 0 THEN 1 ELSE 0 END), 0) ng_count_today,
              COALESCE(SUM(CASE WHEN lane${i} = 0 THEN 1 ELSE 0 END), 0) ok_count_today,
              COALESCE(count(*), 0) total
            FROM 
              history
            WHERE
              DATE(created_t) = CURRENT_DATE
            ;
          `;
        };
        const totalQuery = `
          SELECT 
            'all_total' as lane_no,
            ${countLane("NG")} AS ng_count_today,
            ${countLane("OK")} AS ok_count_today,            
            ${countLane("NG")}+${countLane("OK")} as total
          FROM 
            history
          WHERE 
            DATE(created_t) = CURRENT_DATE;
        `;
        let emitMsg;
        try{
          const totalResult = await client.query(totalQuery);
          emitMsg = totalResult.rows;
          for(let i=1; i<=6; i++){
            const result = await client.query(countLaneNQuery(i));
            emitMsg = emitMsg.concat(result.rows);
          }
          client.release();
        } catch(err){
          errorLog(`${getSocket[port]} socket`, 0, err.message);
          return;
        }
        io.emit("message", JSON.stringify(emitMsg));
      }, interval);
      isInterval = true;
    }


    socket.on("disconnect", () => {      
    });

    // message
    socket.on("message", async (msg) => {
      let data;
      try{
        data = JSON.parse(msg);
        if (data.message === "stop") {
          clearInterval(intervalId);
          isInterval = false;
          return;
        }
      }catch(err){
        socket.emit("message", `${getSocket[port]} invalid json body: ${err.message}`);
        errorLog(`${getSocket[port]} socket`, 0, err.message);
        return;
      }
      
    });
  });

  // 서버 실행
  server.listen(port, () => {
    console.log(`${getSocket[port]} server running on http://localhost:${port}`);
  });
}

module.exports = {createSocketServer, createIntervalSocketServer};
