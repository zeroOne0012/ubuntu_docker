const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const createSocketServer = require("./module/socket");
const dbConnector = require("./middleware/dbConnector");

const createTables = require("./module/initDb");
createTables();

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

app.use("/apis/recipe", recipeRouter);
app.use("/apis/setting", settingRouter);
app.use("/apis/history", historyRouter);

app.listen(3001, () => {
  console.log("Server is Running : http:/localhost:3001");
});

const ports = [4001, 4002, 4003];

ports.forEach((port) => {
  createSocketServer(port);
});
