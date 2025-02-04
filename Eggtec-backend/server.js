const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const {createSocketServer, createIntervalSocketServer} = require("./module/socket");
const dbConnector = require("./middleware/dbConnector");

// API Router Dir.
const recipeRouter = require("./router/recipe");
const settingRouter = require("./router/setting");
const historyRouter = require("./router/history");

const app = express();

app.use(express.json());
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(cors("*"));
app.use(dbConnector);

app.get("/", (req, res) => {
  res.send("NodeJS Server is Running");
});

app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.protocol}://${req.get('host')}${req.originalUrl}`);
  next();
});

app.use("/apis/recipe", recipeRouter);
app.use("/apis/setting", settingRouter);
app.use("/apis/history", historyRouter);




app.listen(3001, () => {
  console.log("Server is running : http:/localhost:3001");
});

const ports = {
  standardModePort: [4001, 4002, 4003, 4004, 4005], 
  intervalModePort: [4006]
};

// 0: 일반적 메시지 송수신 웹소켓서버, 1: interval 기반 메시지 전달 웹소켓서버
ports.standardModePort.forEach(port => createSocketServer(port, 0));
ports.intervalModePort.forEach(port => createIntervalSocketServer(port, 1));
