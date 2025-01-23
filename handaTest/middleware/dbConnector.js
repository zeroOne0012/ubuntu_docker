const pool = require("../module/postgres");
const { errorLogLocal } = require("../module/errorLog");

const dbConnector = async (req, res, next) => {
    try {
        req.client = await pool.connect();  // 연결 후 req 객체에 저장
        next();  // 다음 미들웨어 또는 라우트 핸들러로 전달
    } catch (error) {
        errorLogLocal(`${req.method} ${req.originalUrl}`, 0, error.message);
        return res.status(500).json({ message: "Database Connection Error" });
    }
};

module.exports = dbConnector;