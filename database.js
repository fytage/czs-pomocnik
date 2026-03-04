import mysql from "mysql2/promise";
import 'dotenv/config';

const DB_CONFIG = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    // These are good settings for a pool
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// Create the pool once and export it
export const db = mysql.createPool(DB_CONFIG);

// Optional: Add a check to see if the connection is successful
db.getConnection()
  .then(connection => {
    console.log('Uspesne jsem navazal spojeni s databazi.');
    connection.release();
  })
  .catch(err => {
    console.error("Failed to create the database pool:", err);
  });