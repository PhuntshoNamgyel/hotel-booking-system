const { Pool } = require('pg');

// Connects using DATABASE_URL from this service's .env file.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { pool };
