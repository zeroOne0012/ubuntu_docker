const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const pool = require("./postgres");
const { errorLog, errorLogLocal } = require("./errorLog");

const getSocket = {
  4001: "CAM1", 
  4002: "CAM2", 
  4003: "Encorder"
};

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

    // message
    socket.on("message", async (msg) => {
      let data;
      let client;
      try{
        data = JSON.parse(msg);
      }catch(err){
        socket.emit("message", `${getSocket[port]} invalid json body: ${err.message}`);
        return;
      }

      try{
        client = await pool.connect();
      }catch(err){
        errorLogLocal("socket.js", 1, err.message);
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
        errorLog(`getSocket[port] socket`, 0, err.message);
      }finally {
        if (client) client.release();
      }
    });
  });

  // 서버 실행
  server.listen(port, () => {
    console.log(`${getSocket[port]} server running on http://localhost:${port}`);
  });
}

module.exports = createSocketServer;
