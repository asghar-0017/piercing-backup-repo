import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function fixDatabaseIndexes() {
  let connection;
  
  try {
    console.log('🔧 Fixing database indexes...');
    
    // Create connection using environment variables
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'Jsab43#%87dgDJ49bf^9b',
      database: process.env.MYSQL_MASTER_DB || 'fbr_master'
    });

    console.log('✅ Connected to master database');

    // Fix tenants table - remove excess indexes
    console.log('🔨 Fixing tenants table...');
    
    try {
      // Get all indexes on tenants table
      const [indexes] = await connection.execute(`
        SELECT INDEX_NAME 
        FROM INFORMATION_SCHEMA.STATISTICS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'tenants'
        AND INDEX_NAME != 'PRIMARY'
      `, [process.env.MYSQL_MASTER_DB || 'fbr_master']);

      console.log(`Found ${indexes.length} indexes on tenants table`);

      // Drop all non-primary indexes
      for (const { INDEX_NAME } of indexes) {
        try {
          await connection.execute(`DROP INDEX \`${INDEX_NAME}\` ON tenants`);
          console.log(`✅ Dropped index: ${INDEX_NAME}`);
        } catch (error) {
          console.log(`⚠️  Could not drop index ${INDEX_NAME}: ${error.message}`);
        }
      }

      // Recreate only essential indexes
      await connection.execute(`CREATE UNIQUE INDEX idx_tenant_id ON tenants(tenant_id)`);
      console.log('✅ Created essential index: idx_tenant_id');

    } catch (error) {
      console.log(`⚠️  Error fixing tenants table: ${error.message}`);
    }

    // Fix tenant databases
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

        // Use the database
        await connection.execute(`USE \`${dbName}\``);

        // Clean up buyers table indexes
        console.log(`🔨 Cleaning up buyers table indexes in ${dbName}...`);
        
        try {
          // Get all indexes on buyers table
          const [indexes] = await connection.execute(`
            SELECT INDEX_NAME 
            FROM INFORMATION_SCHEMA.STATISTICS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'buyers'
            AND INDEX_NAME != 'PRIMARY'
          `, [dbName]);

          console.log(`Found ${indexes.length} indexes on buyers table`);

          // Drop all non-primary indexes
          for (const { INDEX_NAME } of indexes) {
            try {
              await connection.execute(`DROP INDEX \`${INDEX_NAME}\` ON buyers`);
              console.log(`✅ Dropped index: ${INDEX_NAME}`);
            } catch (error) {
              console.log(`⚠️  Could not drop index ${INDEX_NAME}: ${error.message}`);
            }
          }

          // Recreate only essential indexes
          await connection.execute(`CREATE UNIQUE INDEX idx_buyer_ntn_cnic ON buyers(buyerNTNCNIC)`);
          await connection.execute(`CREATE INDEX idx_buyer_business_name ON buyers(buyerBusinessName)`);
          console.log('✅ Created essential indexes on buyers table');

        } catch (error) {
          console.log(`⚠️  Error fixing buyers table in ${dbName}: ${error.message}`);
        }

        console.log(`✅ Successfully processed ${dbName}`);
        
      } catch (error) {
        console.error(`❌ Error processing ${dbName}:`, error.message);
        // Continue with next database
      }
    }

    console.log('\n🎉 Database index cleanup completed!');
    
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
fixDatabaseIndexes();