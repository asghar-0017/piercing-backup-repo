import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function removeBuyerNtnUniqueIndexes() {
  let connection;
  try {
    console.log("🚀 Starting removal of UNIQUE index on buyerNTNCNIC...");

    const host = process.env.MYSQL_HOST || 'localhost';
    const port = parseInt(process.env.MYSQL_PORT || '3306');
    const user = process.env.MYSQL_USER || 'root';
    const password = process.env.MYSQL_PASSWORD || '';

    connection = await mysql.createConnection({
      host,
      port,
      user,
      password,
      multipleStatements: true
    });

    console.log(`✅ Connected to MySQL server at ${host}:${port}`);

    // Get all databases
    const [databases] = await connection.execute("SHOW DATABASES");
    const dbNames = databases
      .map(row => row.Database || row.database)
      .filter(name => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(name));

    console.log(`📋 Found ${dbNames.length} user database(s) to process:`, dbNames);

    for (const dbName of dbNames) {
      console.log(`\n🔍 Processing database: ${dbName}`);
      await connection.query(`USE \`${dbName}\``);

      // Check if buyers table exists
      const [tables] = await connection.execute("SHOW TABLES LIKE 'buyers'");
      if (tables.length === 0) {
        console.log(`   ℹ️ No 'buyers' table in ${dbName}`);
        continue;
      }

      // Check indexes on buyers table
      const [indexes] = await connection.execute("SHOW INDEX FROM buyers");
      
      // Find all unique indexes involving buyerNTNCNIC
      const uniqueNtnIndexes = indexes.filter(idx => 
        idx.Column_name === 'buyerNTNCNIC' && 
        idx.Non_unique === 0 && 
        idx.Key_name !== 'PRIMARY'
      );

      for (const idx of uniqueNtnIndexes) {
        console.log(`   🔨 Dropping UNIQUE index '${idx.Key_name}' on buyers table...`);
        try {
          await connection.execute(`DROP INDEX \`${idx.Key_name}\` ON buyers`);
          console.log(`   ✅ Dropped UNIQUE index '${idx.Key_name}'`);
        } catch (err) {
          console.log(`   ⚠️ Failed to drop index '${idx.Key_name}': ${err.message}`);
        }
      }

      // Re-fetch remaining indexes
      const [remainingIndexes] = await connection.execute("SHOW INDEX FROM buyers");
      const hasNtnIndex = remainingIndexes.some(idx => idx.Column_name === 'buyerNTNCNIC');

      if (!hasNtnIndex) {
        console.log(`   🔨 Creating NON-UNIQUE index 'idx_buyer_ntn_cnic' on buyers(buyerNTNCNIC)...`);
        try {
          await connection.execute("CREATE INDEX `idx_buyer_ntn_cnic` ON buyers(`buyerNTNCNIC`)");
          console.log(`   ✅ Created NON-UNIQUE index 'idx_buyer_ntn_cnic'`);
        } catch (err) {
          console.log(`   ⚠️ Could not create index: ${err.message}`);
        }
      } else {
        console.log(`   ✅ NON-UNIQUE index on buyerNTNCNIC is already active.`);
      }
    }

    console.log("\n🎉 Completed removing UNIQUE constraint from buyerNTNCNIC!");

  } catch (error) {
    console.error("❌ Error running index migration:", error);
  } finally {
    if (connection) {
      await connection.end();
      console.log("🔌 Closed MySQL connection");
    }
  }
}

removeBuyerNtnUniqueIndexes();
