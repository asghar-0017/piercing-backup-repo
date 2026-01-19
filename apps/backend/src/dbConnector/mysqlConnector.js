import {
  testMasterConnection,
  initializeMasterDatabase,
} from "../config/mysql.js";
import TenantDatabaseService from "../service/TenantDatabaseService.js";
import AdminUser from "../model/mysql/AdminUser.js";
import AdminSession from "../model/mysql/AdminSession.js";
import Tenant from "../model/mysql/Tenant.js";
import AutoSchemaSync from "../config/auto-schema-sync.js";

const mysqlConnector = async (dbConfig, logger) => {
  try {
    // Test master database connection
    const isConnected = await testMasterConnection();
    if (!isConnected) {
      throw new Error("Failed to connect to master database");
    }

    // Run automatic schema synchronization
    // if (process.env.AUTO_SCHEMA_SYNC !== 'false') {
    //   logger.info("🔄 Running automatic schema synchronization...");
    //   try {
    //     const schemaSync = new AutoSchemaSync();
    //     schemaSync.silent = process.env.SCHEMA_SYNC_SILENT === 'true';
    //     const result = await schemaSync.run({ keepConnectionOpen: true });
        
    //     if (result.success) {
    //       logger.info("✅ Schema synchronization completed successfully");
    //     } else {
    //       logger.info("⚠️ Schema synchronization had issues, but continuing...");
    //       if (result.error) {
    //         logger.error(`Schema sync error: ${result.error}`);
    //       }
    //     }
    //   } catch (error) {
    //     logger.error(`Schema sync failed: ${error.message}`);
    //     // Don't exit - let the application continue
    //   }
    // }

    // Initialize master database tables (fallback for any missed tables)
    await initializeMasterDatabase();
    logger.info("✅ Master database initialized successfully");

    // Initialize admin user if not exists
    await initializeAdminUser();

    logger.info("✅ MySQL multi-tenant database system ready");
    return true;
  } catch (error) {
    logger.error(`❌ Error connecting to MySQL: ${error.message}`);
    process.exit(1);
  }
};

// Initialize default admin user
const initializeAdminUser = async () => {
  try {
    const adminExists = await AdminUser.findOne({
      where: { email: "login@inpl.com" },
    });

    if (!adminExists) {
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash("login@123", 10);
      
      await AdminUser.create({
        email: "login@inpl.com",
        password: hashedPassword,
        is_verify: true,
        role: "admin",
      });

      console.log("✅ Default admin user created");
    }
  } catch (error) {
    console.error("Error initializing admin user:", error);
  }
};
// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await TenantDatabaseService.closeAllConnections();
    console.log("✅ MySQL connections closed gracefully");
  } catch (error) {
    console.error("Error during graceful shutdown:", error);
  }
};

// Handle process termination
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

export default mysqlConnector;