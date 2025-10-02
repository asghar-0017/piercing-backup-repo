import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function addBuyerPhoneNumber() {
  let connection;
  
  try {
    console.log('🔧 Adding phone number column to buyers table...');
    
    // Create connection using environment variables
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'Jsab43#%87dgDJ49bf^9b',
      database: process.env.MYSQL_MASTER_DB || 'westbury_master'
    });

    console.log('✅ Connected to database');

    // Get all tenant databases
    const [tenantDbs] = await connection.execute(`
      SELECT SCHEMA_NAME 
      FROM INFORMATION_SCHEMA.SCHEMATA 
      WHERE SCHEMA_NAME LIKE '%tenant%' OR SCHEMA_NAME LIKE 'Innovative%'
      ORDER BY SCHEMA_NAME
    `);

    console.log(`📊 Found ${tenantDbs.length} tenant databases`);

    for (const { SCHEMA_NAME: dbName } of tenantDbs) {
      try {
        console.log(`\n🔧 Processing database: ${dbName}`);
        
        // Check if buyers table exists
        const [tables] = await connection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'buyers'
        `, [dbName]);

        if (tables.length === 0) {
          console.log(`⏭️  No buyers table in ${dbName}, skipping...`);
          continue;
        }

        // Check if phone number column already exists
        const [columns] = await connection.execute(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME = 'buyers' 
          AND COLUMN_NAME = 'buyerPhoneNumber'
        `, [dbName]);

        if (columns.length > 0) {
          console.log(`✅ Phone number column already exists in ${dbName}`);
          continue;
        }

        // Use the database
        await connection.execute(`USE \`${dbName}\``);

        // Add phone number column
        console.log(`🔨 Adding phone number column to ${dbName}...`);
        await connection.execute(`
          ALTER TABLE buyers 
          ADD COLUMN buyerPhoneNumber VARCHAR(20) NULL AFTER buyerRegistrationType
        `);

        // Add index for better performance
        console.log(`🔨 Adding phone number index to ${dbName}...`);
        await connection.execute(`
          CREATE INDEX idx_buyer_phone ON buyers (buyerPhoneNumber)
        `);

        // Update existing records to have empty strings instead of NULL for consistency
        console.log(`🔨 Updating existing records in ${dbName}...`);
        await connection.execute(`
          UPDATE buyers SET buyerPhoneNumber = '' WHERE buyerPhoneNumber IS NULL
        `);

        console.log(`✅ Successfully added phone number column to ${dbName}`);
        
      } catch (error) {
        console.error(`❌ Error processing ${dbName}:`, error.message);
        // Continue with next database
      }
    }

    console.log('\n🎉 Phone number column addition completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Run the script
addBuyerPhoneNumber();
