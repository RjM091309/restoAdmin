const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env.local') });
require('dotenv').config(); // Load .env variables

const pool = mysql.createPool({
	host: process.env.DB_HOST,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	port: process.env.DB_PORT,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

// log connection success on startup
(async () => {
	try {
		const connection = await pool.getConnection();
		console.log(`✅ Connected to MySQL at ${process.env.DB_HOST}:${process.env.DB_PORT} - DB: ${process.env.DB_NAME}`);
		connection.release();
	} catch (err) {
		console.error('❌ MySQL connection failed:', err.message);
	}
})();

module.exports = pool;
