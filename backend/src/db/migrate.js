import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const run = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('Running schema.sql against DATABASE_URL...');
  await pool.query(sql);
  console.log('✔ Schema applied successfully.');
  await pool.end();
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
