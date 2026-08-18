#!/usr/bin/env node

/**
 * Auto Schema Synchronization
 *
 * This script automatically runs schema checks and updates during application startup.
 * It's designed to run silently in the background without user interaction.
 *
 * Features:
 * - Runs automatically on application startup
 * - Silent operation with minimal logging
 * - Error handling that doesn't crash the application
 * - Can be integrated into Docker containers or deployment scripts
 * - Configurable via environment variables
 */

import { masterSequelize, createTenantConnection } from "./mysql.js";
import dotenv from "dotenv";

// Import models
import Tenant from "../model/mysql/Tenant.js";
import User from "../model/mysql/User.js";
import Role from "../model/mysql/Role.js";
import Permission from "../model/mysql/Permission.js";
import RolePermission from "../model/mysql/RolePermission.js";
import AuditLog from "../model/mysql/AuditLog.js";
import AuditPermission from "../model/mysql/AuditPermission.js";
import AuditSummary from "../model/mysql/AuditSummary.js";
import UserTenantAssignment from "../model/mysql/UserTenantAssignment.js";
import AdminUser from "../model/mysql/AdminUser.js";
import AdminSession from "../model/mysql/AdminSession.js";
import ResetCode from "../model/mysql/ResetCode.js";
import AutoPermissionsSetup from "./auto-permissions-setup.js";
import { createBuyerModel } from "../model/mysql/tenant/Buyer.js";
import { createProductModel } from "../model/mysql/tenant/Product.js";
import { createInvoiceModel } from "../model/mysql/tenant/Invoice.js";
import { createInvoiceItemModel } from "../model/mysql/tenant/InvoiceItem.js";
import { createInvoiceBackupModel } from "../model/mysql/tenant/InvoiceBackup.js";
import { createInvoiceBackupSummaryModel } from "../model/mysql/tenant/InvoiceBackupSummary.js";
import { createBillToShipToModel } from "../model/mysql/tenant/BillToShipTo.js";

dotenv.config();

class AutoSchemaSync {
  constructor() {
    this.silent = process.env.SCHEMA_SYNC_SILENT === "true";
    this.maxRetries = parseInt(process.env.SCHEMA_SYNC_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.SCHEMA_SYNC_RETRY_DELAY) || 5000;
    this.results = {
      tablesCreated: 0,
      columnsAdded: 0,
      permissionsCreated: 0,
      permissionsUpdated: 0,
      errors: [],
      warnings: [],
    };
  }

  log(message, level = "info") {
    if (!this.silent) {
      const timestamp = new Date().toISOString();
      const prefix = level === "error" ? "❌" : level === "warn" ? "⚠️" : "✅";
      console.log(`[${timestamp}] ${prefix} ${message}`);
    }
  }

  async sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async retryOperation(operation, operationName, retries = this.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === retries) {
          this.log(
            `Failed ${operationName} after ${retries} attempts: ${error.message}`,
            "error",
          );
          this.results.errors.push(`${operationName}: ${error.message}`);
          throw error;
        } else {
          this.log(
            `Attempt ${attempt} failed for ${operationName}, retrying in ${this.retryDelay}ms...`,
            "warn",
          );
          await this.sleep(this.retryDelay);
        }
      }
    }
  }

  async checkDatabaseConnection() {
    try {
      await masterSequelize.authenticate();
      this.log("Database connection established");
      return true;
    } catch (error) {
      this.log(`Database connection failed: ${error.message}`, "error");
      return false;
    }
  }

  getMasterModels(sequelize = masterSequelize) {
    return [
      { name: "Tenant", model: Tenant },
      { name: "User", model: User },
      { name: "Role", model: Role },
      { name: "Permission", model: Permission },
      { name: "RolePermission", model: RolePermission },
      { name: "AuditLog", model: AuditLog },
      { name: "AuditPermission", model: AuditPermission },
      { name: "AuditSummary", model: AuditSummary },
      { name: "UserTenantAssignment", model: UserTenantAssignment },
      { name: "AdminUser", model: AdminUser },
      { name: "AdminSession", model: AdminSession },
      { name: "ResetCode", model: ResetCode },
      { name: "Buyer", model: createBuyerModel(sequelize) },
      { name: "Product", model: createProductModel(sequelize) },
      { name: "Invoice", model: createInvoiceModel(sequelize) },
      { name: "InvoiceItem", model: createInvoiceItemModel(sequelize) },
      {
        name: "InvoiceBackup",
        model: createInvoiceBackupModel(sequelize),
      },
      {
        name: "InvoiceBackupSummary",
        model: createInvoiceBackupSummaryModel(sequelize),
      },
      {
        name: "BillToShipTo",
        model: createBillToShipToModel(sequelize),
      },
    ];
  }

  getTenantModels(sequelize) {
    return [
      { name: "Buyer", model: createBuyerModel(sequelize) },
      { name: "Product", model: createProductModel(sequelize) },
      { name: "Invoice", model: createInvoiceModel(sequelize) },
      { name: "InvoiceItem", model: createInvoiceItemModel(sequelize) },
      {
        name: "InvoiceBackup",
        model: createInvoiceBackupModel(sequelize),
      },
      {
        name: "InvoiceBackupSummary",
        model: createInvoiceBackupSummaryModel(sequelize),
      },
      {
        name: "BillToShipTo",
        model: createBillToShipToModel(sequelize),
      },
    ];
  }

  getMySQLColumnType(attribute) {
    const { type, allowNull, defaultValue } = attribute;
    const typeName = type?.constructor?.name || type?.key || "";

    let sqlType;
    switch (typeName) {
      case "STRING":
        sqlType = `VARCHAR(${type.options?.length || 255})`;
        break;
      case "TEXT":
        sqlType = "TEXT";
        break;
      case "INTEGER":
        sqlType = "INT";
        break;
      case "BIGINT":
        sqlType = "BIGINT";
        break;
      case "BOOLEAN":
        sqlType = "TINYINT(1)";
        break;
      case "DATE":
        sqlType = "DATETIME";
        break;
      case "DECIMAL":
        sqlType = `DECIMAL(${type.options?.precision || 10}, ${type.options?.scale || 2})`;
        break;
      case "JSON":
        sqlType = "JSON";
        break;
      case "ENUM":
        sqlType = `ENUM('${(type.options?.values || []).join("','")}')`;
        break;
      default:
        sqlType = type?.key === "BIGINT" ? "BIGINT" : "TEXT";
    }

    let resolvedDefault = defaultValue;
    if (
      resolvedDefault !== undefined &&
      resolvedDefault !== null &&
      typeof resolvedDefault === "object"
    ) {
      resolvedDefault = null;
    }
    if (typeof resolvedDefault === "boolean") {
      resolvedDefault = resolvedDefault ? 1 : 0;
    }

    return {
      sqlType,
      allowNull: allowNull !== false,
      defaultValue: resolvedDefault ?? null,
    };
  }

  async syncModels(sequelize, models, databaseType) {
    for (const { name, model } of models) {
      try {
        await this.retryOperation(
          () => model.sync({ force: false, alter: true }),
          `Sync ${databaseType} table ${name}`,
        );
        this.results.tablesCreated++;
        this.log(`${databaseType} table synchronized: ${model.getTableName()}`);
      } catch (error) {
        this.log(
          `Failed to sync ${databaseType} table ${name}: ${error.message}`,
          "error",
        );
      }
    }
  }

  async ensureModelColumns(sequelize, models, databaseType) {
    for (const { model } of models) {
      const tableName = model.getTableName();
      const tableExists = await this.tableExists(sequelize, tableName);
      if (!tableExists) continue;

      for (const [fieldName, attribute] of Object.entries(
        model.rawAttributes,
      )) {
        if (attribute.primaryKey) continue;

        const columnName = attribute.field || fieldName;
        try {
          const columnExists = await this.columnExists(
            sequelize,
            tableName,
            columnName,
          );
          if (columnExists) continue;

          const { sqlType, allowNull, defaultValue } =
            this.getMySQLColumnType(attribute);
          await this.addMissingColumn(
            sequelize,
            tableName,
            columnName,
            sqlType,
            allowNull,
            defaultValue,
          );
          this.results.columnsAdded++;
          this.log(`Added column: ${tableName}.${columnName} (${databaseType})`);
        } catch (error) {
          if (!error.message.includes("Duplicate column name")) {
            this.log(
              `Error adding column ${tableName}.${columnName}: ${error.message}`,
              "warn",
            );
          }
        }
      }

      const options = model.options;
      if (options.timestamps) {
        const timestampColumns = [];
        const createdAt = options.createdAt;
        const updatedAt = options.updatedAt;

        if (createdAt && createdAt !== true && createdAt !== false) {
          timestampColumns.push(createdAt);
        }
        if (updatedAt && updatedAt !== true && updatedAt !== false) {
          timestampColumns.push(updatedAt);
        }

        for (const columnName of timestampColumns) {
          if (model.rawAttributes[columnName]) continue;
          try {
            const columnExists = await this.columnExists(
              sequelize,
              tableName,
              columnName,
            );
            if (columnExists) continue;

            await sequelize.query(
              `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
            );
            this.results.columnsAdded++;
            this.log(
              `Added timestamp column: ${tableName}.${columnName} (${databaseType})`,
            );
          } catch (error) {
            if (!error.message.includes("Duplicate column name")) {
              this.log(
                `Error adding timestamp ${tableName}.${columnName}: ${error.message}`,
                "warn",
              );
            }
          }
        }
      }
    }
  }

  async applySchemaPatches(sequelize, databaseType) {
    const patches = [
      {
        table: "buyers",
        column: "buyerCity",
        type: "VARCHAR(100)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "quantity",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "unitPrice",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "totalValues",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "valueSalesExcludingST",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "fixedNotifiedValueOrRetailPrice",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "salesTaxApplicable",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "salesTaxWithheldAtSource",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "extraTax",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "furtherTax",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "fedPayable",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "advanceIncomeTax",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "discount",
        type: "DECIMAL(20,2)",
        isUpdate: true,
      },
      {
        table: "invoice_items",
        column: "itemCode",
        type: "VARCHAR(255)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "units",
        type: "VARCHAR(50)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "courierCharges",
        type: "DECIMAL(20,2)",
        allowNull: true,
      },
      {
        table: "invoice_backups",
        column: "user_role",
        type: "VARCHAR(50)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "vat18",
        type: "TINYINT(1)",
        allowNull: false,
        defaultValue: 0,
      },
      {
        table: "invoice_items",
        column: "vat25",
        type: "TINYINT(1)",
        allowNull: false,
        defaultValue: 0,
      },
      {
        table: "invoice_items",
        column: "vatAmount",
        type: "DECIMAL(20,2)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "vat18Amount",
        type: "DECIMAL(20,2)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "vat25Amount",
        type: "DECIMAL(20,2)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "qtyForInternal",
        type: "DECIMAL(20,2)",
        allowNull: true,
      },
      {
        table: "invoice_items",
        column: "uoMForInternal",
        type: "VARCHAR(50)",
        allowNull: true,
      },
    ];

    for (const {
      table,
      column,
      type,
      allowNull = true,
      isUpdate = false,
      defaultValue = null,
    } of patches) {
      try {
        const tableExists = await this.tableExists(sequelize, table);
        if (!tableExists) continue;

        const columnExists = await this.columnExists(sequelize, table, column);
        if (!columnExists) {
          await this.addMissingColumn(
            sequelize,
            table,
            column,
            type,
            allowNull,
            defaultValue,
          );
          this.results.columnsAdded++;
          this.log(`Added patch column: ${table}.${column} (${databaseType})`);
        } else if (isUpdate) {
          await this.updateColumnType(sequelize, table, column, type);
          this.log(
            `Updated column type: ${table}.${column} to ${type} (${databaseType})`,
          );
        }
      } catch (error) {
        if (!error.message.includes("Duplicate column name")) {
          this.log(
            `Error applying patch ${table}.${column}: ${error.message}`,
            "warn",
          );
        }
      }
    }
  }

  async syncMasterDatabase() {
    this.log("Synchronizing master database schema...");

    const models = this.getMasterModels();
    await this.syncModels(masterSequelize, models, "master");
    await this.ensureModelColumns(masterSequelize, models, "master");
    await this.applySchemaPatches(masterSequelize, "master");
  }

  async tableExists(sequelize, tableName) {
    try {
      const [results] = await sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.tables 
         WHERE table_schema = DATABASE() AND table_name = ?`,
        { replacements: [tableName] },
      );
      return results[0].count > 0;
    } catch (error) {
      return false;
    }
  }

  async columnExists(sequelize, tableName, columnName) {
    try {
      const [results] = await sequelize.query(
        `SELECT COUNT(*) as count FROM information_schema.columns 
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        { replacements: [tableName, columnName] },
      );
      return results[0].count > 0;
    } catch (error) {
      return false;
    }
  }

  async addMissingColumn(
    sequelize,
    tableName,
    columnName,
    columnType,
    allowNull = true,
    defaultValue = null,
  ) {
    let sql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnType}`;

    if (!allowNull) {
      sql += " NOT NULL";
    }

    if (defaultValue !== null) {
      if (typeof defaultValue === "string") {
        sql += ` DEFAULT '${defaultValue}'`;
      } else {
        sql += ` DEFAULT ${defaultValue}`;
      }
    }

    await sequelize.query(sql);
  }

  async updateColumnType(sequelize, tableName, columnName, newType) {
    try {
      // Check current column type
      const [results] = await sequelize.query(
        `SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE 
         FROM information_schema.columns 
         WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        { replacements: [tableName, columnName] },
      );

      if (results.length === 0) {
        this.log(`Column ${tableName}.${columnName} not found`, "warn");
        return;
      }

      const currentColumn = results[0];
      const currentType = currentColumn.DATA_TYPE;
      const currentPrecision = currentColumn.NUMERIC_PRECISION;
      const currentScale = currentColumn.NUMERIC_SCALE;

      // Only update if the type is different
      if (currentType === "decimal" && newType.includes("DECIMAL")) {
        const newPrecision = newType.match(/DECIMAL\((\d+),(\d+)\)/);
        if (newPrecision) {
          const [, newPrecisionValue, newScaleValue] = newPrecision;
          if (
            parseInt(newPrecisionValue) > parseInt(currentPrecision) ||
            parseInt(newScaleValue) > parseInt(currentScale)
          ) {
            const sql = `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${newType}`;
            await sequelize.query(sql);
            this.log(
              `Updated ${tableName}.${columnName} from DECIMAL(${currentPrecision},${currentScale}) to ${newType}`,
            );
          }
        }
      }
    } catch (error) {
      this.log(
        `Error updating column type ${tableName}.${columnName}: ${error.message}`,
        "warn",
      );
    }
  }

  async syncTenantDatabases() {
    try {
      const tenants = await Tenant.findAll({
        where: { is_active: true },
        attributes: ["id", "database_name", "seller_business_name"],
      });

      if (tenants.length === 0) {
        this.log("No active tenants found");
        return;
      }

      this.log(`Found ${tenants.length} active tenants`);

      for (const tenant of tenants) {
        try {
          const tenantSequelize = createTenantConnection(tenant.database_name);
          await this.retryOperation(
            () => tenantSequelize.authenticate(),
            `Connect to tenant ${tenant.database_name}`,
          );

          const tenantLabel = `tenant: ${tenant.seller_business_name}`;
          const tenantModels = this.getTenantModels(tenantSequelize);

          await this.syncModels(tenantSequelize, tenantModels, tenantLabel);
          await this.ensureModelColumns(
            tenantSequelize,
            tenantModels,
            tenantLabel,
          );
          await this.applySchemaPatches(tenantSequelize, tenantLabel);

          // Ensure backup tables exist in tenant databases
          await this.ensureBackupTablesExist(tenantSequelize, tenantLabel);

          // Fix invoice_backups nullable constraint if needed
          await this.fixInvoiceBackupNullableConstraint(
            tenantSequelize,
            tenantLabel,
          );

          // Fix invoice_backup_summary nullable constraint if needed
          await this.fixInvoiceBackupSummaryNullableConstraint(
            tenantSequelize,
            tenantLabel,
          );

          await tenantSequelize.close();
        } catch (error) {
          this.log(
            `Failed to sync tenant ${tenant.database_name}: ${error.message}`,
            "warn",
          );
          this.results.warnings.push(
            `Tenant ${tenant.database_name}: ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.log(`Error getting tenants: ${error.message}`, "warn");
      this.results.warnings.push(`Get tenants: ${error.message}`);
    }
  }

  /**
   * Ensure backup tables exist in tenant databases
   */
  async ensureBackupTablesExist(sequelize, databaseType) {
    const backupTables = [
      {
        name: "invoice_backups",
        sql: `
          CREATE TABLE IF NOT EXISTS \`invoice_backups\` (
            \`id\` int(11) NOT NULL AUTO_INCREMENT,
            \`original_invoice_id\` int(11) DEFAULT NULL COMMENT 'ID of the original invoice',
            \`system_invoice_id\` varchar(255) DEFAULT NULL COMMENT 'System invoice ID for reference',
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
            \`tenant_id\` int(11) DEFAULT NULL COMMENT 'Tenant/Company ID',
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
        `,
      },
      {
        name: "invoice_backup_summary",
        sql: `
          CREATE TABLE IF NOT EXISTS \`invoice_backup_summary\` (
            \`id\` int(11) NOT NULL AUTO_INCREMENT,
            \`original_invoice_id\` int(11) DEFAULT NULL COMMENT 'ID of the original invoice',
            \`latest_backup_id\` int(11) DEFAULT NULL COMMENT 'ID of the latest backup entry',
            \`total_backups\` int(11) NOT NULL DEFAULT 0 COMMENT 'Total number of backups for this invoice',
            \`last_backup_type\` enum('DRAFT','SAVED','EDIT','POST','FBR_REQUEST','FBR_RESPONSE') DEFAULT NULL COMMENT 'Type of the last backup operation',
            \`first_backup_at\` datetime DEFAULT NULL COMMENT 'Timestamp of the first backup',
            \`last_backup_at\` datetime DEFAULT NULL COMMENT 'Timestamp of the last backup',
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
        `,
      },
    ];

    for (const table of backupTables) {
      try {
        const tableExists = await this.tableExists(sequelize, table.name);
        if (!tableExists) {
          await sequelize.query(table.sql);
          this.log(`Created backup table: ${table.name} (${databaseType})`);
          this.results.tablesCreated++;
        }
      } catch (error) {
        if (!error.message.includes("already exists")) {
          this.log(
            `Error creating backup table ${table.name}: ${error.message}`,
            "warn",
          );
        }
      }
    }
  }

  /**
   * Fix invoice_backups table to allow NULL for original_invoice_id
   * This is needed for FBR submissions that don't have a linked invoice yet
   */
  async fixInvoiceBackupNullableConstraint(sequelize, databaseType) {
    try {
      const tableExists = await this.tableExists(sequelize, 'invoice_backups');
      if (!tableExists) {
        this.log(`Table invoice_backups does not exist in ${databaseType}, skipping nullable fix`, 'warn');
        return;
      }

      // Check if the column exists and if it's NOT NULL
      const [results] = await sequelize.query(
        `SELECT IS_NULLABLE, COLUMN_TYPE 
         FROM information_schema.columns 
         WHERE table_schema = DATABASE() 
         AND table_name = 'invoice_backups' 
         AND column_name = 'original_invoice_id'`,
      );

      if (results.length === 0) {
        this.log(`Column original_invoice_id not found in invoice_backups (${databaseType})`, 'warn');
        return;
      }

      const columnInfo = results[0];
      if (columnInfo.IS_NULLABLE === 'NO') {
        // Column is NOT NULL, need to fix it
        const sql = `ALTER TABLE \`invoice_backups\` 
                     MODIFY COLUMN \`original_invoice_id\` INT NULL 
                     COMMENT 'ID of the original invoice'`;

        await sequelize.query(sql);
        this.log(`✅ Fixed invoice_backups.original_invoice_id to allow NULL (${databaseType})`);
        this.results.columnsAdded++; // Increment counter for tracking
      } else {
        this.log(`Column invoice_backups.original_invoice_id already allows NULL (${databaseType})`);
      }
    } catch (error) {
      this.log(
        `Error fixing invoice_backups nullable constraint: ${error.message}`,
        'warn',
      );
      this.results.warnings.push(
        `Fix invoice_backups nullable (${databaseType}): ${error.message}`,
      );
    }
  }

  /**
   * Fix invoice_backup_summary table to allow NULL for original_invoice_id
   * This is needed for FBR submissions that don't have a linked invoice yet
   */
  async fixInvoiceBackupSummaryNullableConstraint(sequelize, databaseType) {
    try {
      const tableExists = await this.tableExists(sequelize, 'invoice_backup_summary');
      if (!tableExists) {
        this.log(`Table invoice_backup_summary does not exist in ${databaseType}, skipping nullable fix`, 'warn');
        return;
      }

      // Check if the column exists and if it's NOT NULL
      const [results] = await sequelize.query(
        `SELECT IS_NULLABLE, COLUMN_TYPE 
         FROM information_schema.columns 
         WHERE table_schema = DATABASE() 
         AND table_name = 'invoice_backup_summary' 
         AND column_name = 'original_invoice_id'`,
      );

      if (results.length === 0) {
        this.log(`Column original_invoice_id not found in invoice_backup_summary (${databaseType})`, 'warn');
        return;
      }

      const columnInfo = results[0];
      if (columnInfo.IS_NULLABLE === 'NO') {
        // Column is NOT NULL, need to fix it
        const sql = `ALTER TABLE \`invoice_backup_summary\` 
                     MODIFY COLUMN \`original_invoice_id\` INT NULL 
                     COMMENT 'ID of the original invoice'`;

        await sequelize.query(sql);
        this.log(`✅ Fixed invoice_backup_summary.original_invoice_id to allow NULL (${databaseType})`);
        this.results.columnsAdded++; // Increment counter for tracking
      } else {
        this.log(`Column invoice_backup_summary.original_invoice_id already allows NULL (${databaseType})`);
      }

      // Also remove the UNIQUE constraint if it exists
      const [indexResults] = await sequelize.query(
        `SELECT CONSTRAINT_NAME 
         FROM information_schema.TABLE_CONSTRAINTS 
         WHERE table_schema = DATABASE() 
         AND table_name = 'invoice_backup_summary' 
         AND CONSTRAINT_TYPE = 'UNIQUE' 
         AND CONSTRAINT_NAME LIKE '%original_invoice%'`,
      );

      if (indexResults.length > 0) {
        for (const index of indexResults) {
          const dropSql = `ALTER TABLE \`invoice_backup_summary\` DROP INDEX \`${index.CONSTRAINT_NAME}\``;
          await sequelize.query(dropSql);
          this.log(`✅ Removed UNIQUE constraint ${index.CONSTRAINT_NAME} from invoice_backup_summary (${databaseType})`);
        }
      }
    } catch (error) {
      this.log(
        `Error fixing invoice_backup_summary nullable constraint: ${error.message}`,
        'warn',
      );
      this.results.warnings.push(
        `Fix invoice_backup_summary nullable (${databaseType}): ${error.message}`,
      );
    }
  }

  /**
   * Setup permissions and roles
   */
  async setupPermissionsAndRoles() {
    try {
      this.log("Setting up permissions and roles...");

      const permissionsSetup = new AutoPermissionsSetup();
      permissionsSetup.silent = this.silent;

      const result = await permissionsSetup.run();

      if (result.success) {
        this.results.permissionsCreated += result.results.permissionsCreated;
        this.results.permissionsUpdated += result.results.permissionsUpdated;
        this.results.errors.push(...result.results.errors);
        this.log("Permissions and roles setup completed successfully");
      } else {
        this.log(`Permissions setup failed: ${result.error}`, "error");
        this.results.errors.push(`Permissions setup: ${result.error}`);
      }
    } catch (error) {
      this.log(`Error setting up permissions: ${error.message}`, "error");
      this.results.errors.push(`Permissions setup: ${error.message}`);
    }
  }

  async run(options = {}) {
    const { keepConnectionOpen = false } = options;
    const startTime = Date.now();

    try {
      this.log("Starting automatic schema synchronization...");

      // Check database connection
      const connected = await this.checkDatabaseConnection();
      if (!connected) {
        throw new Error("Cannot connect to database");
      }

      // Sync master database
      await this.syncMasterDatabase();

      // Sync tenant databases
      await this.syncTenantDatabases();

      // Setup permissions and roles
      await this.setupPermissionsAndRoles();

      const duration = Date.now() - startTime;
      this.log(`Schema synchronization completed in ${duration}ms`);

      // Log summary
      if (!this.silent) {
        console.log(`\n📊 Schema Sync Summary:`);
        console.log(`   Tables synchronized: ${this.results.tablesCreated}`);
        console.log(`   Columns added: ${this.results.columnsAdded}`);
        console.log(
          `   Permissions created: ${this.results.permissionsCreated}`,
        );
        console.log(
          `   Permissions updated: ${this.results.permissionsUpdated}`,
        );
        if (this.results.warnings.length > 0) {
          console.log(`   Warnings: ${this.results.warnings.length}`);
        }
        if (this.results.errors.length > 0) {
          console.log(`   Errors: ${this.results.errors.length}`);
        }
      }

      return {
        success: true,
        duration,
        results: this.results,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(
        `Schema synchronization failed after ${duration}ms: ${error.message}`,
        "error",
      );

      return {
        success: false,
        duration,
        error: error.message,
        results: this.results,
      };
    } finally {
      // Only close connection if not keeping it open for the application
      if (!keepConnectionOpen) {
        try {
          await masterSequelize.close();
        } catch (error) {
          // Ignore connection close errors
        }
      }
    }
  }
}

// Export for use in other modules
export default AutoSchemaSync;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const sync = new AutoSchemaSync();
  sync
    .run()
    .then((result) => {
      if (result.success) {
        process.exit(0);
      } else {
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error("Fatal error:", error);
      process.exit(1);
    });
}
