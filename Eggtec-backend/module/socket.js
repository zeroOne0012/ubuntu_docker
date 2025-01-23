const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./postgres");
const { errorLog, errorLogLocal } = require("./errorLog");
const { create } = require("domain");

const getSocket = {
  4001: "CAM1", 
  4002: "CAM2", 
  4003: "Encorder",
  4004: "CAM1 IMAGE",
  4005: "CAM2 IMAGE",
  4006: "Interval"
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
        const totalQuery = `
          SELECT 
            'all_total' as lane_no,
            COALESCE(SUM(CASE WHEN result = 'NG' THEN 1 ELSE 0 END),0) AS ng_count_today,
            COALESCE(SUM(CASE WHEN result = 'OK' THEN 1 ELSE 0 END),0) AS ok_count_today,
            (COALESCE(SUM(CASE WHEN result = 'NG' THEN 1 ELSE 0 END),0)+COALESCE(SUM(CASE WHEN result = 'OK' THEN 1 ELSE 0 END),0)) as total
          FROM 
            history
          WHERE 
            DATE(created_t) = CURRENT_DATE
        `;
        const query = `
          SELECT 
            h.lane_no, 
            COALESCE(SUM(CASE WHEN result = 'NG' THEN 1 ELSE 0 END),0) AS ng_count_today,
            COALESCE(SUM(CASE WHEN result = 'OK' THEN 1 ELSE 0 END),0) AS ok_count_today,
            (COALESCE(SUM(CASE WHEN result = 'NG' THEN 1 ELSE 0 END),0)+COALESCE(SUM(CASE WHEN result = 'OK' THEN 1 ELSE 0 END),0)) as total
          FROM 
            (select distinct lane_no from history) h
          left join
            history
          on
            h.lane_no = history.lane_no
            and DATE(created_t) = CURRENT_DATE
          GROUP BY 
            h.lane_no
          ORDER BY 
            h.lane_no
          ;
        `;
        let result, totalResult;
        try{
          result = await client.query(query);
          totalResult = await client.query(totalQuery);
          client.release();
        } catch(err){
          errorLog(`${getSocket[port]} socket`, 0, err.message);
          return;
        }
        io.emit("message", JSON.stringify((totalResult.rows).concat(result.rows)));
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
