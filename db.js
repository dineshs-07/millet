const mysql = require('mysql2');
require('dotenv').config();

// ✅ Create a promise-based connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 100,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// ✅ Optional: Test DB connection on startup
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  } else {
    console.log('✅ Connected to MySQL Database');
    connection.release(); // ✅ Release the connection after test
  }
});

// ✅ Export promise wrapper
module.exports = pool.promise();
