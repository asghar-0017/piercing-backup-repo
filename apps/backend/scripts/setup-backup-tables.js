#!/usr/bin/env node

/**
 * Simple setup script for Invoice Backup System Tables
 * This script creates the backup tables directly using Sequelize models
 */

import { createConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database configuration - use same config as the main app
const dbConfig = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'Jsab43#%87dgDJ49bf^9b',
  database: process.env.MYSQL_MASTER_DB || 'fbr_master'
};

async function setupBackupTables() {
  let connection;

  try {
    console.log('🚀 Starting Invoice Backup Tables Setup...');

    // Connect to database
    console.log('📡 Connecting to database...');
    connection = await createConnection(dbConfig);
    console.log('✅ Connected to database successfully');

    // Create invoice_backups table
    console.log('📄 Creating invoice_backups table...');
    const createInvoiceBackupsTable = `
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
    `;

    await connection.execute(createInvoiceBackupsTable);
    console.log('✅ invoice_backups table created successfully');

    // Create invoice_backup_summary table
    console.log('📄 Creating invoice_backup_summary table...');
    const createInvoiceBackupSummaryTable = `
      CREATE TABLE IF NOT EXISTS \`invoice_backup_summary\` (
        \`id\` int(11) NOT NULL AUTO_INCREMENT,
        \`original_invoice_id\` int(11) NOT NULL COMMENT 'ID of the original invoice',
        \`system_invoice_id\` varchar(20) DEFAULT NULL COMMENT 'System invoice ID for reference',
        \`current_invoice_number\` varchar(100) DEFAULT NULL COMMENT 'Current invoice number',
        \`current_status\` varchar(50) DEFAULT NULL COMMENT 'Current invoice status',
        \`total_backups\` int(11) DEFAULT 0 COMMENT 'Total number of backups for this invoice',
        \`draft_backups\` int(11) DEFAULT 0 COMMENT 'Number of draft backups',
        \`saved_backups\` int(11) DEFAULT 0 COMMENT 'Number of saved backups',
        \`edit_backups\` int(11) DEFAULT 0 COMMENT 'Number of edit backups',
        \`post_backups\` int(11) DEFAULT 0 COMMENT 'Number of post backups',
        \`fbr_request_backups\` int(11) DEFAULT 0 COMMENT 'Number of FBR request backups',
        \`fbr_response_backups\` int(11) DEFAULT 0 COMMENT 'Number of FBR response backups',
        \`first_backup_at\` timestamp NULL DEFAULT NULL COMMENT 'Timestamp of first backup',
        \`last_backup_at\` timestamp NULL DEFAULT NULL COMMENT 'Timestamp of last backup',
        \`created_by_user_id\` int(11) DEFAULT NULL COMMENT 'User who created the original invoice',
        \`created_by_email\` varchar(255) DEFAULT NULL COMMENT 'Email of creator',
        \`created_by_name\` varchar(255) DEFAULT NULL COMMENT 'Name of creator',
        \`tenant_id\` int(11) DEFAULT NULL COMMENT 'Tenant/Company ID',
        \`tenant_name\` varchar(255) DEFAULT NULL COMMENT 'Tenant/Company name',
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`unique_invoice_backup_summary\` (\`original_invoice_id\`),
        KEY \`idx_backup_summary_system_invoice\` (\`system_invoice_id\`),
        KEY \`idx_backup_summary_invoice_number\` (\`current_invoice_number\`),
        KEY \`idx_backup_summary_status\` (\`current_status\`),
        KEY \`idx_backup_summary_tenant\` (\`tenant_id\`),
        KEY \`idx_backup_summary_created_by\` (\`created_by_user_id\`),
        KEY \`idx_backup_summary_last_backup\` (\`last_backup_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Summary of invoice backups for quick reference'
    `;

    await connection.execute(createInvoiceBackupSummaryTable);
    console.log('✅ invoice_backup_summary table created successfully');

    // Verify tables were created
    console.log('🔍 Verifying backup tables...');

    const tables = [
      'invoice_backups',
      'invoice_backup_summary'
    ];

    for (const table of tables) {
      try {
        const [rows] = await connection.execute(`SHOW TABLES LIKE '${table}'`);
        if (rows.length > 0) {
          console.log(`   ✅ Table '${table}' exists`);
        } else {
          console.log(`   ❌ Table '${table}' not found`);
        }
      } catch (error) {
        console.error(`   ❌ Error checking table '${table}':`, error.message);
      }
    }

    console.log('🎉 Invoice Backup Tables setup completed successfully!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   • Backup tables created');
    console.log('   • System ready for invoice backups');
    console.log('');
    console.log('🔧 Next steps:');
    console.log('   1. Restart your backend server to load the new models');
    console.log('   2. The backup system will automatically start working');
    console.log('   3. Check logs for backup creation messages');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('📡 Database connection closed');
    }
  }
}

// Run the setup
setupBackupTables().catch(console.error);
