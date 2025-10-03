import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config({ path: './.env' });

// Master database configuration
export const masterConfig = {
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  username: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD || 'Jsab43#%87dgDJ49bf^9b',
  database: process.env.MYSQL_MASTER_DB,
  dialect: "mysql",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 20, // Increased from 5 for better concurrency
    min: 5, // Increased from 0 for faster response
    acquire: 15000, // Reduced from 30000 for faster connection acquisition
    idle: 5000, // Reduced from 10000 for better resource management
    evict: 1000, // Check for dead connections every 1 second
  },
  dialectOptions: {
    charset: "utf8mb4",
    // Performance optimizations
    connectTimeout: 10000, // 10 seconds connection timeout
    // Connection optimizations
    multipleStatements: true, // Allow multiple statements in one query
    dateStrings: true, // Handle dates as strings for better performance
    // Buffer optimizations
    bigNumberStrings: true, // Handle big numbers as strings
    supportBigNumbers: true, // Support big numbers
    // SSL and compression
    ssl: false, // Disable SSL for local development (enable in production)
    compress: true, // Enable compression
  },
  define: {
    timestamps: true,
    underscored: false,
    freezeTableName: true,
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
    // Performance optimizations
    hooks: false, // Disable hooks for better performance
    validate: false, // Disable validation for better performance
  },
  // Query optimization
  benchmark: process.env.NODE_ENV === "development", // Show query execution time in development
  isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED, // Better performance isolation level
};

// Master database connection
export const masterSequelize = new Sequelize(masterConfig);

// Function to create tenant database connection
export const createTenantConnection = (databaseName) => {
  return new Sequelize({
    host: process.env.MYSQL_HOST,
    port: process.env.MYSQL_PORT,
    username: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: databaseName,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: {
      max: 20, // Increased from 5 for better concurrency
      min: 5, // Increased from 0 for faster response
      acquire: 15000, // Reduced from 30000 for faster connection acquisition
      idle: 5000, // Reduced from 10000 for better resource management
      evict: 1000, // Check for dead connections every 1 second
    },
    dialectOptions: {
      charset: "utf8mb4",
      // Performance optimizations
      connectTimeout: 10000, // 10 seconds connection timeout
      // Connection optimizations
      multipleStatements: true, // Allow multiple statements in one query
      dateStrings: true, // Handle dates as strings for better performance
      // Buffer optimizations
      bigNumberStrings: true, // Handle big numbers as strings
      supportBigNumbers: true, // Support big numbers
      // SSL and compression
      ssl: false, // Disable SSL for local development (enable in production)
      compress: true, // Enable compression
    },
    define: {
      timestamps: true,
      underscored: false,
      freezeTableName: true,
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
      // Performance optimizations
      hooks: false, // Disable hooks for better performance
      validate: false, // Disable validation for better performance
    },
    // Query optimization
    benchmark: process.env.NODE_ENV === "development", // Show query execution time in development
    isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED, // Better performance isolation level
  });
};

// Test master database connection
export const testMasterConnection = async () => {
  try {
    await masterSequelize.authenticate();
    console.log("✅ Master database connection established successfully.");
    return true;
  } catch (error) {
    console.error("❌ Unable to connect to master database:", error);
    return false;
  }
};

// Initialize master database
export const initializeMasterDatabase = async () => {
  try {
    // Use alter: true to create missing tables and columns
    await masterSequelize.sync({ alter: true });
    console.log("✅ Master database synchronized successfully.");
    return true;
  } catch (error) {
    console.error("❌ Error synchronizing master database:", error);
    return false;
  }
};
