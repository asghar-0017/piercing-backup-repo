import {
  testMasterConnection,
  initializeMasterDatabase,
} from "../config/mysql.js";
import TenantDatabaseService from "../service/TenantDatabaseService.js";
import AdminUser from "../model/mysql/AdminUser.js";
import AdminSession from "../model/mysql/AdminSession.js";
import Tenant from "../model/mysql/Tenant.js";

const mysqlConnector = async (dbConfig, logger) => {
  try {
    // Test master database connection
    const isConnected = await testMasterConnection();
    if (!isConnected) {
      throw new Error("Failed to connect to master database");
    }

    // Initialize master database tables
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
      where: { email: "habibsugar@inpl.com" },
    });

    if (!adminExists) {
      const bcrypt = await import("bcryptjs");
      const hashedPassword = await bcrypt.hash("r_habibsugarpasJK76^h", 10);

      await AdminUser.create({
        email: "habibsugar@inpl.com",
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