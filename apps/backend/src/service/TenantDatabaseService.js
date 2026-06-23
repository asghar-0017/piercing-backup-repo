import { createTenantConnection } from "../config/mysql.js";
import { createBuyerModel } from "../model/mysql/tenant/Buyer.js";
import { createInvoiceModel } from "../model/mysql/tenant/Invoice.js";
import { createInvoiceItemModel } from "../model/mysql/tenant/InvoiceItem.js";
import { createProductModel } from "../model/mysql/tenant/Product.js";
import { createInvoiceBackupModel } from "../model/mysql/tenant/InvoiceBackup.js";
import { createInvoiceBackupSummaryModel } from "../model/mysql/tenant/InvoiceBackupSummary.js";
import { createBillToShipToModel } from "../model/mysql/tenant/BillToShipTo.js";
import Tenant from "../model/mysql/Tenant.js";
import { masterSequelize } from "../config/mysql.js";

class TenantDatabaseService {
  constructor() {
    this.tenantConnections = new Map();
    this.tenantModels = new Map();
  }

  // Create a new tenant database
  async createTenantDatabase(tenantData) {
    try {
      const {
        sellerNTNCNIC,
        sellerFullNTN,
        sellerBusinessName,
        sellerProvince,
        sellerAddress,
        databaseName,
        sandboxTestToken,
        sandboxProductionToken,
      } = tenantData;
      console.log("Creating tenant database with data:", tenantData);

      // Generate unique tenant ID
      const tenantId = `tenant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log("Connecting to MySQL server to create database...");

      // Create database connection without specifying database (to create it)
      const tempSequelize = new (await import("sequelize")).Sequelize({
        host: process.env.MYSQL_HOST,
        port: process.env.MYSQL_PORT,
        username: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        dialect: "mysql",
        logging: false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },
        dialectOptions: {
          connectTimeout: 10000,
        },
      });

      // Test connection first
      await tempSequelize.authenticate();
      console.log("✅ Successfully connected to MySQL server");

      // Create the database
      console.log(`Creating database: ${databaseName}`);
      await tempSequelize.query(
        `CREATE DATABASE IF NOT EXISTS \`${databaseName}\``
      );
      console.log(`✅ Database ${databaseName} created successfully`);

      // Grant privileges to the user for the new database
      console.log(`Granting privileges for database: ${databaseName}`);
      await tempSequelize.query(
        `GRANT ALL PRIVILEGES ON \`${databaseName}\`.* TO '${process.env.MYSQL_USER}'@'%'`
      );
      await tempSequelize.query(`FLUSH PRIVILEGES`);
      console.log(`✅ Privileges granted for database: ${databaseName}`);

      await tempSequelize.close();

      // Create tenant record in master database
      const tenant = await Tenant.create({
        tenant_id: tenantId,
        seller_ntn_cnic: sellerNTNCNIC,
        seller_full_ntn: sellerFullNTN,
        seller_business_name: sellerBusinessName,
        seller_province: sellerProvince,
        seller_address: sellerAddress,
        database_name: databaseName,
        sandboxTestToken: sandboxTestToken,
        sandboxProductionToken: sandboxProductionToken,
        is_active: true,
      });

      // Initialize tenant database with tables
      await this.initializeTenantDatabase(databaseName);

      return {
        success: true,
        tenant,
        databaseName,
      };
    } catch (error) {
      console.error("❌ Error creating tenant database:", error);

      // Log more specific error information
      if (error.parent) {
        console.error("❌ Connection error details:", {
          code: error.parent.code,
          errno: error.parent.errno,
          sqlMessage: error.parent.sqlMessage,
          sqlState: error.parent.sqlState,
        });
      }

      // Provide more specific error messages
      if (error.name === "SequelizeConnectionRefusedError") {
        throw new Error(
          `Failed to connect to MySQL server. Please check if MySQL is running and the connection parameters are correct. Error: ${error.message}`
        );
      } else if (error.name === "SequelizeAccessDeniedError") {
        throw new Error(
          `Access denied to MySQL server. Please check username and password. Error: ${error.message}`
        );
      } else if (error.name === "SequelizeHostNotFoundError") {
        throw new Error(
          `MySQL host not found. Please check the host configuration. Error: ${error.message}`
        );
      }

      throw error;
    }
  }

  // Initialize tenant database with all required tables
  async initializeTenantDatabase(databaseName) {
    try {
      console.log(`Initializing tenant database: ${databaseName}`);

      const sequelize = createTenantConnection(databaseName);

      // Test connection to the specific database
      await sequelize.authenticate();
      console.log(
        `✅ Successfully connected to tenant database: ${databaseName}`
      );

      // Create models for this tenant
      const Buyer = createBuyerModel(sequelize);
      const Invoice = createInvoiceModel(sequelize);
      const InvoiceItem = createInvoiceItemModel(sequelize);
      const Product = createProductModel(sequelize);
      const InvoiceBackup = createInvoiceBackupModel(sequelize);
      const InvoiceBackupSummary = createInvoiceBackupSummaryModel(sequelize);
      const BillToShipTo = createBillToShipToModel(sequelize);

      // Define associations
      Invoice.hasMany(InvoiceItem, { foreignKey: "invoice_id" });
      InvoiceItem.belongsTo(Invoice, { foreignKey: "invoice_id" });
      
      // Buyer-Invoice associations
      Buyer.hasMany(Invoice, { foreignKey: "buyer_id" });
      Invoice.belongsTo(Buyer, { foreignKey: "buyer_id" });
      
      // Product-InvoiceItem associations
      Product.hasMany(InvoiceItem, { foreignKey: "product_id" });
      InvoiceItem.belongsTo(Product, { foreignKey: "product_id" });
      
      // Backup associations
      Invoice.hasMany(InvoiceBackup, { foreignKey: "original_invoice_id" });
      InvoiceBackup.belongsTo(Invoice, { foreignKey: "original_invoice_id" });
      Invoice.hasOne(InvoiceBackupSummary, { foreignKey: "original_invoice_id" });
      InvoiceBackupSummary.belongsTo(Invoice, { foreignKey: "original_invoice_id" });

      // BillToShipTo-Invoice associations
      BillToShipTo.hasMany(Invoice, { as: "BillToInvoices", foreignKey: "bill_to_id" });
      Invoice.belongsTo(BillToShipTo, { as: "BillTo", foreignKey: "bill_to_id" });
      BillToShipTo.hasMany(Invoice, { as: "ShipToInvoices", foreignKey: "ship_to_id" });
      Invoice.belongsTo(BillToShipTo, { as: "ShipTo", foreignKey: "ship_to_id" });

      // Sync all models to create tables
      console.log(`Creating tables in database: ${databaseName}`);
      await sequelize.sync({ alter: true });
      console.log(
        `✅ Tables created successfully in database: ${databaseName}`
      );

      // Store connection and models
      this.tenantConnections.set(databaseName, sequelize);
      this.tenantModels.set(databaseName, {
        Buyer,
        Invoice,
        InvoiceItem,
        Product,
        InvoiceBackup,
        InvoiceBackupSummary,
        BillToShipTo,
      });

      console.log(
        `✅ Tenant database ${databaseName} initialized successfully`
      );
      return true;
    } catch (error) {
      console.error(
        `❌ Error initializing tenant database ${databaseName}:`,
        error
      );

      // Log more specific error information
      if (error.parent) {
        console.error(
          `❌ Database initialization error details for ${databaseName}:`,
          {
            code: error.parent.code,
            errno: error.parent.errno,
            sqlMessage: error.parent.sqlMessage,
            sqlState: error.parent.sqlState,
          }
        );
      }

      throw error;
    }
  }

  // Get tenant database connection and models
  async getTenantDatabase(tenantId) {
    try {
      // Find tenant in master database
      const tenant = await Tenant.findOne({
        where: {
          tenant_id: tenantId,
          is_active: true,
        },
      });

      if (!tenant) {
        throw new Error("Tenant not found or inactive");
      }

      const databaseName = tenant.database_name;

      // Check if connection already exists
      if (this.tenantConnections.has(databaseName)) {
        return {
          tenant,
          sequelize: this.tenantConnections.get(databaseName),
          models: this.tenantModels.get(databaseName),
        };
      }

      // Create new connection
      const sequelize = createTenantConnection(databaseName);

      // Test the connection
      try {
        await sequelize.authenticate();
      } catch (error) {
        throw new Error(
          `Failed to connect to tenant database: ${error.message}`
        );
      }

      // Create models
      const Buyer = createBuyerModel(sequelize);
      const Invoice = createInvoiceModel(sequelize);
      const InvoiceItem = createInvoiceItemModel(sequelize);
      const Product = createProductModel(sequelize);
      const InvoiceBackup = createInvoiceBackupModel(sequelize);
      const InvoiceBackupSummary = createInvoiceBackupSummaryModel(sequelize);
      const BillToShipTo = createBillToShipToModel(sequelize);

      // Define associations
      Invoice.hasMany(InvoiceItem, { foreignKey: "invoice_id" });
      InvoiceItem.belongsTo(Invoice, { foreignKey: "invoice_id" });
      
      // Buyer-Invoice associations
      Buyer.hasMany(Invoice, { foreignKey: "buyer_id" });
      Invoice.belongsTo(Buyer, { foreignKey: "buyer_id" });
      
      // Product-InvoiceItem associations
      Product.hasMany(InvoiceItem, { foreignKey: "product_id" });
      InvoiceItem.belongsTo(Product, { foreignKey: "product_id" });
      
      // Backup associations
      Invoice.hasMany(InvoiceBackup, { foreignKey: "original_invoice_id" });
      InvoiceBackup.belongsTo(Invoice, { foreignKey: "original_invoice_id" });
      Invoice.hasOne(InvoiceBackupSummary, { foreignKey: "original_invoice_id" });
      InvoiceBackupSummary.belongsTo(Invoice, { foreignKey: "original_invoice_id" });

      // BillToShipTo-Invoice associations
      BillToShipTo.hasMany(Invoice, { as: "BillToInvoices", foreignKey: "bill_to_id" });
      Invoice.belongsTo(BillToShipTo, { as: "BillTo", foreignKey: "bill_to_id" });
      BillToShipTo.hasMany(Invoice, { as: "ShipToInvoices", foreignKey: "ship_to_id" });
      Invoice.belongsTo(BillToShipTo, { as: "ShipTo", foreignKey: "ship_to_id" });

      // Store connection and models
      this.tenantConnections.set(databaseName, sequelize);
      this.tenantModels.set(databaseName, {
        Buyer,
        Invoice,
        InvoiceItem,
        Product,
        InvoiceBackup,
        InvoiceBackupSummary,
        BillToShipTo,
      });

      return {
        tenant,
        sequelize,
        models: {
          Buyer,
          Invoice,
          InvoiceItem,
          Product,
          InvoiceBackup,
          InvoiceBackupSummary,
          BillToShipTo,
        },
      };
    } catch (error) {
      console.error("Error getting tenant database:", error);
      throw error;
    }
  }

  // Get tenant database by database name
  async getTenantDatabaseByName(databaseName) {
    try {
      // Find tenant in master database
      const tenant = await Tenant.findOne({
        where: {
          database_name: databaseName,
          is_active: true,
        },
      });

      if (!tenant) {
        throw new Error("Tenant not found or inactive");
      }

      return await this.getTenantDatabase(tenant.tenant_id);
    } catch (error) {
      console.error("Error getting tenant database by name:", error);
      throw error;
    }
  }

  // List all active tenants
  async getAllTenants() {
    try {
      const tenants = await Tenant.findAll({
        where: { is_active: true },
        attributes: [
          "id",
          "tenant_id",
          "seller_ntn_cnic",
          "seller_full_ntn",
          "seller_business_name",
          "seller_province",
          "seller_address",
          "is_active",
          "database_name",
          "created_at",
          "sandbox_test_token",
          "sandbox_production_token",
          "tel_no",
          "mob_no",
          "strn",
          "email",
        ],
        raw: true,
      });
      console.log("Fetched tenants:", tenants);
      // Map the underscore fields to camelCase for frontend compatibility
      const mappedTenants = tenants.map((tenant) => ({
        id: tenant.id,
        tenant_id: tenant.tenant_id,
        sellerNTNCNIC: tenant.seller_ntn_cnic,
        sellerFullNTN: tenant.seller_full_ntn,
        sellerBusinessName: tenant.seller_business_name,
        sellerProvince: tenant.seller_province,
        sellerAddress: tenant.seller_address,
        telNo: tenant.tel_no,
        mobNo: tenant.mob_no,
        strn: tenant.strn,
        email: tenant.email,
        is_active: Boolean(tenant.is_active), // Convert MySQL boolean to JavaScript boolean
        database_name: tenant.database_name,
        created_at: tenant.created_at,
        sandboxTestToken: tenant.sandbox_test_token,
        sandboxProductionToken: tenant.sandbox_production_token,
      }));

      console.log("Mapped tenants:", mappedTenants);

      return mappedTenants;
    } catch (error) {
      console.error("Error getting all tenants:", error);
      throw error;
    }
  }

  // Get tenant by seller NTN/CNIC
  async getTenantBySellerId(sellerNtnCnic) {
    try {
      const tenant = await Tenant.findOne({
        where: {
          seller_ntn_cnic: sellerNtnCnic,
          is_active: true,
        },
      });

      if (!tenant) {
        throw new Error("Tenant not found or inactive");
      }

      return tenant;
    } catch (error) {
      console.error("Error getting tenant by seller ID:", error);
      throw error;
    }
  }

  // Find invoice across all tenant databases
  async findInvoiceAcrossTenants(invoiceNumber) {
    try {
      // Get all active tenants
      const tenants = await this.getAllTenants();

      for (const tenant of tenants) {
        try {
          const tenantDb = await this.getTenantDatabase(tenant.tenant_id);
          const { Invoice } = tenantDb.models;

          const invoice = await Invoice.findOne({
            where: { invoice_number: invoiceNumber },
          });

          if (invoice) {
            return {
              invoice,
              tenantDb,
              tenant,
            };
          }
        } catch (error) {
          console.error(`Error searching tenant ${tenant.tenant_id}:`, error);
          // Continue searching other tenants
          continue;
        }
      }

      return null; // Invoice not found in any tenant
    } catch (error) {
      console.error("Error finding invoice across tenants:", error);
      throw error;
    }
  }

  // Close all tenant connections
  async closeAllConnections() {
    try {
      for (const [databaseName, sequelize] of this.tenantConnections) {
        await sequelize.close();
        console.log(`✅ Closed connection for ${databaseName}`);
      }

      this.tenantConnections.clear();
      this.tenantModels.clear();
    } catch (error) {
      console.error("Error closing tenant connections:", error);
      throw error;
    }
  }
}

export default new TenantDatabaseService();
