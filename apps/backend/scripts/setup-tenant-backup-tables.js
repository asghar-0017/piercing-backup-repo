#!/usr/bin/env node

/**
 * Setup Tenant Backup Tables Script
 * This script creates backup tables in all tenant databases
 */

import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database configuration
const masterDbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'Jsab43#%87dgDJ49bf^9b',
  database: process.env.MYSQL_MASTER_DB || 'fbr_master'
};

async function setupTenantBackupTables() {
  let masterConnection;

  try {
    console.log('🚀 Setting up backup tables for all tenant databases...');

    // Connect to master database
    console.log('📡 Connecting to master database...');
    masterConnection = await createConnection(masterDbConfig);
    console.log('✅ Connected to master database successfully');

    // Get all tenant databases
    console.log('🔍 Fetching tenant databases...');
    const [tenants] = await masterConnection.execute(`
      SELECT id, database_name, seller_business_name 
      FROM tenants 
      WHERE database_name IS NOT NULL 
      ORDER BY id
    `);

    console.log(`📊 Found ${tenants.length} tenant databases to process`);

    if (tenants.length === 0) {
      console.log('⚠️  No tenant databases found. Exiting.');
      return;
    }

    // Process each tenant database
    for (const tenant of tenants) {
      console.log(`\n🏢 Processing tenant: ${tenant.seller_business_name} (${tenant.database_name})`);

      try {
        // Connect to tenant database
        const tenantDbConfig = {
          ...masterDbConfig,
          database: tenant.database_name
        };

        const tenantConnection = await createConnection(tenantDbConfig);
        console.log(`   📡 Connected to tenant database: ${tenant.database_name}`);

        // Check if backup tables already exist
        const [existingTables] = await tenantConnection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME IN ('invoice_backups', 'invoice_backup_summary')
        `, [tenant.database_name]);

        if (existingTables.length >= 2) {
          console.log(`   ✅ Backup tables already exist in ${tenant.database_name}`);
          await tenantConnection.end();
          continue;
        }

        // Create invoice_backups table
        console.log(`   📄 Creating invoice_backups table in ${tenant.database_name}...`);
        await tenantConnection.execute(`
          CREATE TABLE IF NOT EXISTS \`invoice_backups\` (
            \`id\` int(11) NOT NULL AUTO_INCREMENT,
            \`original_invoice_id\` int(11) NOT NULL COMMENT 'ID of the original invoice',
            \`system_invoice_id\` varchar(20) DEFAULT NULL COMMENT 'System invoice ID for reference',
            \`invoice_number\` varchar(100) DEFAULT NULL COMMENT 'Invoice number at time of backup',
            \`backup_type\` enum('DRAFT','SAVED','EDIT','POST','FBR_REQUEST','FBR_RESPONSE') NOT NULL COMMENT 'Type of backup operation',
            \`backup_reason\` varchar(255) DEFAULT NULL COMMENT 'Reason for backup',
            \`status_before\` varchar(50) DEFAULT NULL COMMENT 'Invoice status before the operation',
            \`status_after\` varchar(50) DEFAULT NULL COMMENT 'Invoice status after the operation',
            \`invoice_data\` JSON NOT NULL COMMENT 'Complete invoice data at time of backup',
            \`invoice_items_data\` JSON DEFAULT NULL COMMENT 'Complete invoice items data at time of backup',
            \`fbr_request_data\` JSON DEFAULT NULL COMMENT 'FBR API request data',
            \`fbr_response_data\` JSON DEFAULT NULL COMMENT 'FBR API response data',
            \`fbr_invoice_number\` varchar(100) DEFAULT NULL COMMENT 'FBR invoice number if available',
            \`user_id\` int(11) DEFAULT NULL COMMENT 'ID of user who performed the operation',
            \`user_email\` varchar(255) DEFAULT NULL COMMENT 'Email of user who performed the operation',
            \`user_name\` varchar(255) DEFAULT NULL COMMENT 'Full name of user who performed the operation',
            \`user_role\` varchar(50) DEFAULT NULL COMMENT 'Role of user who performed the operation',
            \`tenant_id\` int(11) DEFAULT NULL COMMENT 'Tenant/Company ID where operation was performed',
            \`tenant_name\` varchar(255) DEFAULT NULL COMMENT 'Tenant/Company name',
            \`ip_address\` varchar(45) DEFAULT NULL COMMENT 'IP address of the user',
            \`user_agent\` text DEFAULT NULL COMMENT 'User agent string from the request',
            \`request_id\` varchar(100) DEFAULT NULL COMMENT 'Unique request identifier for tracking',
            \`additional_info\` JSON DEFAULT NULL COMMENT 'Additional context information',
            \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            KEY \`idx_backup_original_invoice\` (\`original_invoice_id\`),
            KEY \`idx_backup_system_invoice\` (\`system_invoice_id\`),
            KEY \`idx_backup_type\` (\`backup_type\`),
            KEY \`idx_backup_user\` (\`user_id\`),
            KEY \`idx_backup_tenant\` (\`tenant_id\`),
            KEY \`idx_backup_created_at\` (\`created_at\`),
            KEY \`idx_backup_invoice_number\` (\`invoice_number\`),
            KEY \`idx_backup_status_change\` (\`status_before\`, \`status_after\`),
            KEY \`idx_backup_fbr_invoice\` (\`fbr_invoice_number\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Invoice backup system for tracking all invoice data changes'
        `);
        console.log(`   ✅ invoice_backups table created in ${tenant.database_name}`);

        // Create invoice_backup_summary table
        console.log(`   📄 Creating invoice_backup_summary table in ${tenant.database_name}...`);
        await tenantConnection.execute(`
          CREATE TABLE IF NOT EXISTS \`invoice_backup_summary\` (
            \`id\` int(11) NOT NULL AUTO_INCREMENT,
            \`original_invoice_id\` int(11) NOT NULL COMMENT 'ID of the original invoice',
            \`latest_backup_id\` int(11) DEFAULT NULL COMMENT 'ID of the latest backup entry',
            \`total_backups\` int(11) NOT NULL DEFAULT 0 COMMENT 'Total number of backups for this invoice',
            \`first_backup_at\` datetime DEFAULT NULL COMMENT 'Timestamp of the first backup',
            \`last_backup_at\` datetime DEFAULT NULL COMMENT 'Timestamp of the last backup',
            \`last_backup_type\` enum('DRAFT','SAVED','EDIT','POST','FBR_REQUEST','FBR_RESPONSE') DEFAULT NULL COMMENT 'Type of the last backup operation',
            \`created_by_user_id\` int(11) DEFAULT NULL COMMENT 'ID of user who created the first backup',
            \`created_by_email\` varchar(255) DEFAULT NULL COMMENT 'Email of user who created the first backup',
            \`created_by_name\` varchar(255) DEFAULT NULL COMMENT 'Full name of user who created the first backup',
            \`last_modified_by_user_id\` int(11) DEFAULT NULL COMMENT 'ID of user who performed the last backup',
            \`last_modified_by_email\` varchar(255) DEFAULT NULL COMMENT 'Email of user who performed the last backup',
            \`last_modified_by_name\` varchar(255) DEFAULT NULL COMMENT 'Full name of user who performed the last backup',
            \`tenant_id\` int(11) DEFAULT NULL COMMENT 'Tenant/Company ID',
            \`tenant_name\` varchar(255) DEFAULT NULL COMMENT 'Tenant/Company name',
            \`invoice_number\` varchar(100) DEFAULT NULL COMMENT 'Invoice number of the original invoice',
            \`system_invoice_id\` varchar(20) DEFAULT NULL COMMENT 'System invoice ID of the original invoice',
            \`fbr_invoice_number\` varchar(100) DEFAULT NULL COMMENT 'FBR invoice number of the original invoice',
            \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
            \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (\`id\`),
            UNIQUE KEY \`idx_backup_summary_original_invoice_unique\` (\`original_invoice_id\`),
            KEY \`idx_backup_summary_type\` (\`last_backup_type\`),
            KEY \`idx_backup_summary_last_backup\` (\`last_backup_at\`)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Summary of invoice backups for quick reference'
        `);
        console.log(`   ✅ invoice_backup_summary table created in ${tenant.database_name}`);

        // Verify tables were created
        const [tables] = await tenantConnection.execute(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME IN ('invoice_backups', 'invoice_backup_summary')
        `, [tenant.database_name]);

        console.log(`   📊 Created ${tables.length} backup tables in ${tenant.database_name}`);

        // Close tenant connection
        await tenantConnection.end();
        console.log(`   📡 Disconnected from ${tenant.database_name}`);

      } catch (error) {
        console.log(`   ❌ Error processing tenant ${tenant.database_name}: ${error.message}`);
      }
    }

    console.log('\n🎉 Tenant backup tables setup completed!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   • Backup tables created in all tenant databases');
    console.log('   • Each tenant now has invoice_backups and invoice_backup_summary tables');
    console.log('   • The backup system should now work properly');
    console.log('');
    console.log('🔧 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Test creating/updating invoices');
    console.log('   3. Check that backups are being created successfully');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    if (masterConnection) {
      await masterConnection.end();
      console.log('📡 Master database connection closed');
    }
  }
}

// Run the setup
setupTenantBackupTables().catch(console.error);
