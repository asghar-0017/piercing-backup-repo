import { createTenantConnection } from "../src/config/mysql.js";
import Tenant from "../src/model/mysql/Tenant.js";
import { masterSequelize } from "../src/config/mysql.js";

/**
 * Script to add database indexes to existing buyer tables
 * This will dramatically improve buyer existence check performance from O(n) to O(1)
 */
async function addBuyerIndexes() {
  try {
    console.log("🚀 Starting buyer table optimization...");
    
    // Get all active tenants
    const tenants = await Tenant.findAll({
      where: { is_active: true },
      attributes: ['tenant_id', 'database_name']
    });

    console.log(`📊 Found ${tenants.length} active tenants to optimize`);

    for (const tenant of tenants) {
      try {
        console.log(`\n🔧 Optimizing tenant: ${tenant.tenant_id} (${tenant.database_name})`);
        
        // Connect to tenant database
        const sequelize = createTenantConnection(tenant.database_name);
        
        // Test connection
        await sequelize.authenticate();
        console.log(`✅ Connected to ${tenant.database_name}`);

        // Add indexes to buyers table
        await addIndexesToBuyersTable(sequelize, tenant.database_name);
        
        await sequelize.close();
        console.log(`✅ Completed optimization for ${tenant.database_name}`);
        
      } catch (error) {
        console.error(`❌ Error optimizing tenant ${tenant.tenant_id}:`, error.message);
        continue; // Continue with next tenant
      }
    }

    console.log("\n🎉 Buyer table optimization completed for all tenants!");
    
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

async function addIndexesToBuyersTable(sequelize, databaseName) {
  try {
    // Check if indexes already exist
    const [existingIndexes] = await sequelize.query(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = ? 
      AND TABLE_NAME = 'buyers' 
      AND INDEX_NAME IN ('idx_buyer_ntn_cnic', 'idx_buyer_business_name', 'idx_buyer_province_ntn')
    `, {
      replacements: [databaseName],
      type: sequelize.QueryTypes.SELECT
    });

    const existingIndexNames = existingIndexes.map(idx => idx.INDEX_NAME);
    console.log(`📋 Existing indexes: ${existingIndexNames.length > 0 ? existingIndexNames.join(', ') : 'None'}`);

    // Add primary index on buyerNTNCNIC if it doesn't exist
    if (!existingIndexNames.includes('idx_buyer_ntn_cnic')) {
      console.log(`🔨 Adding primary index on buyerNTNCNIC...`);
      await sequelize.query(`
        CREATE INDEX idx_buyer_ntn_cnic ON buyers(buyerNTNCNIC)
      `);
      console.log(`✅ Added idx_buyer_ntn_cnic index`);
    } else {
      console.log(`✅ Index idx_buyer_ntn_cnic already exists`);
    }

    // Add index on buyerBusinessName if it doesn't exist
    if (!existingIndexNames.includes('idx_buyer_business_name')) {
      console.log(`🔨 Adding index on buyerBusinessName...`);
      await sequelize.query(`
        CREATE INDEX idx_buyer_business_name ON buyers(buyerBusinessName)
      `);
      console.log(`✅ Added idx_buyer_business_name index`);
    } else {
      console.log(`✅ Index idx_buyer_business_name already exists`);
    }

    // Add composite index for province-based queries if it doesn't exist
    if (!existingIndexNames.includes('idx_buyer_province_ntn')) {
      console.log(`🔨 Adding composite index on buyerProvince + buyerNTNCNIC...`);
      await sequelize.query(`
        CREATE INDEX idx_buyer_province_ntn ON buyers(buyerProvince, buyerNTNCNIC)
      `);
      console.log(`✅ Added idx_buyer_province_ntn index`);
    } else {
      console.log(`✅ Index idx_buyer_province_ntn already exists`);
    }

    // Analyze table to update statistics
    console.log(`📊 Analyzing table to update statistics...`);
    await sequelize.query(`ANALYZE TABLE buyers`);
    console.log(`✅ Table analysis completed`);

  } catch (error) {
    console.error(`❌ Error adding indexes to ${databaseName}:`, error.message);
    throw error;
  }
}

// Run the script
addBuyerIndexes()
  .then(() => {
    console.log("\n✨ All done! Buyer existence checks should now be lightning fast!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
