#!/usr/bin/env node

/**
 * Database Schema Checker and Auto-Creator
 * 
 * This script checks the database for missing tables, columns, and indexes
 * defined in the Sequelize models and automatically creates them.
 * 
 * Features:
 * - Checks master database tables and columns
 * - Checks tenant-specific database schemas
 * - Creates missing tables with proper structure
 * - Adds missing columns with correct data types
 * - Creates missing indexes
 * - Handles foreign key constraints
 * - Supports both master and tenant databases
 * 
 * Usage:
 * node check-and-create-missing-schema.js [--tenant-only] [--master-only] [--dry-run]
 */

import { masterSequelize, createTenantConnection } from '../src/config/mysql.js';
import { testMasterConnection } from '../src/config/mysql.js';
import dotenv from 'dotenv';

// Import all models
import Tenant from '../src/model/mysql/Tenant.js';
import User from '../src/model/mysql/User.js';
import Role from '../src/model/mysql/Role.js';
import Permission from '../src/model/mysql/Permission.js';
import RolePermission from '../src/model/mysql/RolePermission.js';
import AuditLog from '../src/model/mysql/AuditLog.js';
import AuditPermission from '../src/model/mysql/AuditPermission.js';

// Import tenant models
import { createBuyerModel } from '../src/model/mysql/tenant/Buyer.js';
import { createProductModel } from '../src/model/mysql/tenant/Product.js';
import { createInvoiceModel } from '../src/model/mysql/tenant/Invoice.js';
import { createInvoiceItemModel } from '../src/model/mysql/tenant/InvoiceItem.js';

dotenv.config();

class DatabaseSchemaChecker {
  constructor() {
    this.masterModels = {
      tenants: Tenant,
      users: User,
      roles: Role,
      permissions: Permission,
      role_permissions: RolePermission,
      audit_logs: AuditLog,
      audit_permissions: AuditPermission
    };
    
    this.tenantModels = {
      buyers: createBuyerModel,
      products: createProductModel,
      invoices: createInvoiceModel,
      invoice_items: createInvoiceItemModel
    };
    
    this.missingTables = [];
    this.missingColumns = [];
    this.missingIndexes = [];
    this.createdTables = [];
    this.createdColumns = [];
    this.createdIndexes = [];
  }

  /**
   * Convert Sequelize DataType to MySQL column definition
   */
  getMySQLColumnDefinition(attribute) {
    const { type, allowNull, defaultValue, field, unique, primaryKey, autoIncrement, comment } = attribute;
    
    let columnDef = '';
    
    // Handle different Sequelize data types
    if (type.constructor.name === 'STRING') {
      const length = type.options?.length || 255;
      columnDef = `VARCHAR(${length})`;
    } else if (type.constructor.name === 'TEXT') {
      columnDef = 'TEXT';
    } else if (type.constructor.name === 'INTEGER') {
      columnDef = 'INT';
    } else if (type.constructor.name === 'BOOLEAN') {
      columnDef = 'BOOLEAN';
    } else if (type.constructor.name === 'DATE') {
      columnDef = 'DATETIME';
    } else if (type.constructor.name === 'DECIMAL') {
      const precision = type.options?.precision || 10;
      const scale = type.options?.scale || 2;
      columnDef = `DECIMAL(${precision}, ${scale})`;
    } else if (type.constructor.name === 'JSON') {
      columnDef = 'JSON';
    } else if (type.constructor.name === 'ENUM') {
      const values = type.options?.values || [];
      columnDef = `ENUM('${values.join("', '")}')`;
    } else {
      columnDef = 'TEXT'; // fallback
    }
    
    // Add constraints
    if (primaryKey) {
      columnDef += ' PRIMARY KEY';
    }
    if (autoIncrement) {
      columnDef += ' AUTO_INCREMENT';
    }
    if (!allowNull && !primaryKey) {
      columnDef += ' NOT NULL';
    }
    if (unique && !primaryKey) {
      columnDef += ' UNIQUE';
    }
    if (defaultValue !== undefined) {
      if (typeof defaultValue === 'string') {
        columnDef += ` DEFAULT '${defaultValue}'`;
      } else if (typeof defaultValue === 'boolean') {
        columnDef += ` DEFAULT ${defaultValue ? 1 : 0}`;
      } else {
        columnDef += ` DEFAULT ${defaultValue}`;
      }
    }
    if (comment) {
      columnDef += ` COMMENT '${comment}'`;
    }
    
    return columnDef;
  }

  /**
   * Check if a table exists in the database
   */
  async checkTableExists(sequelize, tableName) {
    try {
      const [results] = await sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = ?`,
        { replacements: [tableName] }
      );
      return results[0].count > 0;
    } catch (error) {
      console.error(`Error checking table ${tableName}:`, error.message);
      return false;
    }
  }

  /**
   * Check if a column exists in a table
   */
  async checkColumnExists(sequelize, tableName, columnName) {
    try {
      const [results] = await sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        { replacements: [tableName, columnName] }
      );
      return results[0].count > 0;
    } catch (error) {
      console.error(`Error checking column ${tableName}.${columnName}:`, error.message);
      return false;
    }
  }

  /**
   * Check if an index exists
   */
  async checkIndexExists(sequelize, tableName, indexName) {
    try {
      const [results] = await sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.statistics 
         WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
        { replacements: [tableName, indexName] }
      );
      return results[0].count > 0;
    } catch (error) {
      console.error(`Error checking index ${tableName}.${indexName}:`, error.message);
      return false;
    }
  }

  /**
   * Create a table based on Sequelize model definition
   */
  async createTable(sequelize, modelName, model) {
    try {
      const tableName = model.getTableName();
      const attributes = model.rawAttributes;
      const options = model.options;
      
      let createTableSQL = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n`;
      
      const columnDefinitions = [];
      const indexes = [];
      const foreignKeys = [];
      
      // Process each attribute
      for (const [fieldName, attribute] of Object.entries(attributes)) {
        const columnName = attribute.field || fieldName;
        const columnDef = this.getMySQLColumnDefinition(attribute);
        columnDefinitions.push(`  \`${columnName}\` ${columnDef}`);
        
        // Handle foreign key references
        if (attribute.references) {
          foreignKeys.push({
            column: columnName,
            references: attribute.references
          });
        }
      }
      
      // Add timestamps if enabled
      if (options.timestamps) {
        const createdAt = options.createdAt || 'created_at';
        const updatedAt = options.updatedAt || 'updated_at';
        
        if (!attributes[createdAt]) {
          columnDefinitions.push(`  \`${createdAt}\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        }
        if (!attributes[updatedAt] && updatedAt !== false) {
          columnDefinitions.push(`  \`${updatedAt}\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
        }
      }
      
      createTableSQL += columnDefinitions.join(',\n');
      
      // Add primary key if not already defined
      const hasPrimaryKey = Object.values(attributes).some(attr => attr.primaryKey);
      if (!hasPrimaryKey) {
        createTableSQL += ',\n  PRIMARY KEY (`id`)';
      }
      
      // Add foreign key constraints
      for (const fk of foreignKeys) {
        const constraintName = `fk_${tableName}_${fk.column}`;
        createTableSQL += `,\n  CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${fk.column}\`) REFERENCES \`${fk.references.model}\` (\`${fk.references.key}\`) ON DELETE SET NULL`;
      }
      
      createTableSQL += '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;';
      
      await sequelize.query(createTableSQL);
      console.log(`✅ Created table: ${tableName}`);
      this.createdTables.push(tableName);
      
      // Create indexes
      if (options.indexes) {
        for (const index of options.indexes) {
          await this.createIndex(sequelize, tableName, index);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Error creating table ${modelName}:`, error.message);
      return false;
    }
  }

  /**
   * Create an index
   */
  async createIndex(sequelize, tableName, indexOptions) {
    try {
      const indexName = indexOptions.name || `idx_${tableName}_${indexOptions.fields.join('_')}`;
      const fields = indexOptions.fields.map(field => `\`${field}\``).join(', ');
      const unique = indexOptions.unique ? 'UNIQUE ' : '';
      
      const createIndexSQL = `CREATE ${unique}INDEX IF NOT EXISTS \`${indexName}\` ON \`${tableName}\` (${fields})`;
      
      await sequelize.query(createIndexSQL);
      console.log(`✅ Created index: ${indexName} on ${tableName}`);
      this.createdIndexes.push(`${tableName}.${indexName}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error creating index on ${tableName}:`, error.message);
      return false;
    }
  }

  /**
   * Add a missing column to an existing table
   */
  async addColumn(sequelize, tableName, fieldName, attribute) {
    try {
      const columnName = attribute.field || fieldName;
      const columnDef = this.getMySQLColumnDefinition(attribute);
      
      // Remove PRIMARY KEY and AUTO_INCREMENT from ALTER TABLE statement
      let alterColumnDef = columnDef.replace(' PRIMARY KEY', '').replace(' AUTO_INCREMENT', '');
      
      const alterTableSQL = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${alterColumnDef}`;
      
      await sequelize.query(alterTableSQL);
      console.log(`✅ Added column: ${tableName}.${columnName}`);
      this.createdColumns.push(`${tableName}.${columnName}`);
      
      return true;
    } catch (error) {
      console.error(`❌ Error adding column ${tableName}.${fieldName}:`, error.message);
      return false;
    }
  }

  /**
   * Check and create missing schema for master database
   */
  async checkMasterDatabase(dryRun = false) {
    console.log('\n🔍 Checking Master Database Schema...\n');
    
    for (const [modelName, model] of Object.entries(this.masterModels)) {
      const tableName = model.getTableName();
      
      // Check if table exists
      const tableExists = await this.checkTableExists(masterSequelize, tableName);
      
      if (!tableExists) {
        console.log(`⚠️  Missing table: ${tableName}`);
        this.missingTables.push(tableName);
        
        if (!dryRun) {
          await this.createTable(masterSequelize, modelName, model);
        }
      } else {
        console.log(`✅ Table exists: ${tableName}`);
        
        // Check columns
        const attributes = model.rawAttributes;
        for (const [fieldName, attribute] of Object.entries(attributes)) {
          const columnName = attribute.field || fieldName;
          const columnExists = await this.checkColumnExists(masterSequelize, tableName, columnName);
          
          if (!columnExists) {
            console.log(`⚠️  Missing column: ${tableName}.${columnName}`);
            this.missingColumns.push(`${tableName}.${columnName}`);
            
            if (!dryRun) {
              await this.addColumn(masterSequelize, tableName, fieldName, attribute);
            }
          }
        }
        
        // Check indexes
        if (model.options.indexes) {
          for (const index of model.options.indexes) {
            const indexName = index.name || `idx_${tableName}_${index.fields.join('_')}`;
            const indexExists = await this.checkIndexExists(masterSequelize, tableName, indexName);
            
            if (!indexExists) {
              console.log(`⚠️  Missing index: ${tableName}.${indexName}`);
              this.missingIndexes.push(`${tableName}.${indexName}`);
              
              if (!dryRun) {
                await this.createIndex(masterSequelize, tableName, index);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Check and create missing schema for tenant databases
   */
  async checkTenantDatabases(dryRun = false) {
    console.log('\n🔍 Checking Tenant Database Schemas...\n');
    
    try {
      // Get all tenants
      const tenants = await Tenant.findAll({
        where: { is_active: true },
        attributes: ['id', 'database_name', 'seller_business_name']
      });
      
      if (tenants.length === 0) {
        console.log('⚠️  No active tenants found');
        return;
      }
      
      for (const tenant of tenants) {
        console.log(`\n📋 Checking tenant: ${tenant.seller_business_name} (${tenant.database_name})`);
        
        try {
          const tenantSequelize = createTenantConnection(tenant.database_name);
          await tenantSequelize.authenticate();
          
          for (const [modelName, modelFactory] of Object.entries(this.tenantModels)) {
            const model = modelFactory(tenantSequelize);
            const tableName = model.getTableName();
            
            // Check if table exists
            const tableExists = await this.checkTableExists(tenantSequelize, tableName);
            
            if (!tableExists) {
              console.log(`⚠️  Missing table: ${tableName}`);
              this.missingTables.push(`${tenant.database_name}.${tableName}`);
              
              if (!dryRun) {
                await this.createTable(tenantSequelize, modelName, model);
              }
            } else {
              console.log(`✅ Table exists: ${tableName}`);
              
              // Check columns
              const attributes = model.rawAttributes;
              for (const [fieldName, attribute] of Object.entries(attributes)) {
                const columnName = attribute.field || fieldName;
                const columnExists = await this.checkColumnExists(tenantSequelize, tableName, columnName);
                
                if (!columnExists) {
                  console.log(`⚠️  Missing column: ${tableName}.${columnName}`);
                  this.missingColumns.push(`${tenant.database_name}.${tableName}.${columnName}`);
                  
                  if (!dryRun) {
                    await this.addColumn(tenantSequelize, tableName, fieldName, attribute);
                  }
                }
              }
              
              // Check indexes
              if (model.options.indexes) {
                for (const index of model.options.indexes) {
                  const indexName = index.name || `idx_${tableName}_${index.fields.join('_')}`;
                  const indexExists = await this.checkIndexExists(tenantSequelize, tableName, indexName);
                  
                  if (!indexExists) {
                    console.log(`⚠️  Missing index: ${tableName}.${indexName}`);
                    this.missingIndexes.push(`${tenant.database_name}.${tableName}.${indexName}`);
                    
                    if (!dryRun) {
                      await this.createIndex(tenantSequelize, tableName, index);
                    }
                  }
                }
              }
            }
          }
          
          await tenantSequelize.close();
        } catch (error) {
          console.error(`❌ Error checking tenant ${tenant.database_name}:`, error.message);
        }
      }
    } catch (error) {
      console.error('❌ Error getting tenants:', error.message);
    }
  }

  /**
   * Print summary of findings and actions
   */
  printSummary(dryRun = false) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SCHEMA CHECK SUMMARY');
    console.log('='.repeat(60));
    
    if (this.missingTables.length > 0) {
      console.log(`\n⚠️  Missing Tables (${this.missingTables.length}):`);
      this.missingTables.forEach(table => console.log(`   - ${table}`));
    }
    
    if (this.missingColumns.length > 0) {
      console.log(`\n⚠️  Missing Columns (${this.missingColumns.length}):`);
      this.missingColumns.forEach(column => console.log(`   - ${column}`));
    }
    
    if (this.missingIndexes.length > 0) {
      console.log(`\n⚠️  Missing Indexes (${this.missingIndexes.length}):`);
      this.missingIndexes.forEach(index => console.log(`   - ${index}`));
    }
    
    if (dryRun) {
      console.log('\n🔍 This was a dry run. No changes were made.');
      console.log('Run without --dry-run to apply changes.');
    } else {
      if (this.createdTables.length > 0) {
        console.log(`\n✅ Created Tables (${this.createdTables.length}):`);
        this.createdTables.forEach(table => console.log(`   - ${table}`));
      }
      
      if (this.createdColumns.length > 0) {
        console.log(`\n✅ Created Columns (${this.createdColumns.length}):`);
        this.createdColumns.forEach(column => console.log(`   - ${column}`));
      }
      
      if (this.createdIndexes.length > 0) {
        console.log(`\n✅ Created Indexes (${this.createdIndexes.length}):`);
        this.createdIndexes.forEach(index => console.log(`   - ${index}`));
      }
      
      if (this.createdTables.length === 0 && this.createdColumns.length === 0 && this.createdIndexes.length === 0) {
        console.log('\n🎉 No missing schema elements found! Database is up to date.');
      }
    }
    
    console.log('\n' + '='.repeat(60));
  }

  /**
   * Main execution method
   */
  async run(options = {}) {
    const { tenantOnly = false, masterOnly = false, dryRun = false } = options;
    
    console.log('🚀 Database Schema Checker and Auto-Creator');
    console.log('='.repeat(50));
    
    if (dryRun) {
      console.log('🔍 Running in DRY RUN mode - no changes will be made');
    }
    
    // Test master database connection
    const connected = await testMasterConnection();
    if (!connected) {
      console.error('❌ Cannot connect to master database. Exiting.');
      process.exit(1);
    }
    
    try {
      if (!tenantOnly) {
        await this.checkMasterDatabase(dryRun);
      }
      
      if (!masterOnly) {
        await this.checkTenantDatabases(dryRun);
      }
      
      this.printSummary(dryRun);
      
    } catch (error) {
      console.error('❌ Error during schema check:', error);
      process.exit(1);
    } finally {
      await masterSequelize.close();
    }
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    tenantOnly: args.includes('--tenant-only'),
    masterOnly: args.includes('--master-only'),
    dryRun: args.includes('--dry-run')
  };
  
  const checker = new DatabaseSchemaChecker();
  await checker.run(options);
}

// Run if called directly
import { fileURLToPath } from 'url';
const isDirectRun = process.argv[1] && (
  fileURLToPath(import.meta.url).replace(/\\/g, '/').toLowerCase() === 
  process.argv[1].replace(/\\/g, '/').toLowerCase()
);

if (isDirectRun) {
  main().catch(console.error);
}

export default DatabaseSchemaChecker;
