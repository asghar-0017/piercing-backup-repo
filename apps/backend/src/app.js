import express from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import ejs from "ejs";

// Import MySQL connector instead of MongoDB
import mysqlConnector from "./dbConnector/mysqlConnector.js";

// Import new MySQL routes
import authRoutes from "./routes/authRoutes.js";
import tenantAuthRoutes from "./routes/tenantAuthRoutes.js";
import userAuthRoutes from "./routes/userAuthRoutes.js";
import userManagementRoutes from "./routes/userManagementRoutes.js";
import userCompanyRoutes from "./routes/userCompanyRoutes.js";
import roleManagementRoutes from "./routes/roleManagementRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import { requestIdMiddleware } from "./middleWare/auditMiddleware.js";

import tenantRoutes from "./routes/tenantRoutes.js";
import buyerRoutes from "./routes/buyerRoutes.js";
import invoiceRoutes, { publicInvoiceRoutes } from "./routes/invoiceRoutes.js";
import invoiceBackupRoutes from "./routes/invoiceBackupRoutes.js";
import hsCodeRoutes from "./routes/hsCodeRoutes.js";
import performanceRoutes from "./routes/performanceRoutes.js";

dotenv.config();

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configure EJS as view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "dist")));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Add request ID middleware for audit tracking
app.use(requestIdMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://gw.fbr.gov.pk",
          "http://localhost:5150",
        ],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https:"],
      },
    },
  })
);
app.use(
  cors({
    origin: [
      "http://localhost:5174",
      "http://localhost:5150",
      "http://localhost:5150",
      "https://fbrtestcase.inplsoftwares.online",
      "*",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Tenant-ID"],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);

app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/invoices",
  express.static(path.join(process.cwd(), "public/invoices"))
);
// MySQL Routes
app.use("/api/auth", authRoutes);
app.use("/api/tenant-auth", tenantAuthRoutes);
app.use("/api/user-auth", userAuthRoutes);
app.use("/api/user-management", userManagementRoutes);
app.use("/api/role-management", roleManagementRoutes);
app.use("/api/user", userCompanyRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/admin", tenantRoutes);
app.use("/api/tenant/:tenantId", buyerRoutes);
app.use("/api/tenant/:tenantId", invoiceRoutes);
app.use("/api/tenant/:tenantId", invoiceBackupRoutes);

// Performance monitoring routes
app.use("/api/tenant/:tenantId/performance", performanceRoutes);

// HS Code Routes (with caching)
app.use("/api", hsCodeRoutes);

// Public Invoice Routes
app.use("/api", publicInvoiceRoutes);

// Lightweight proxy to bypass browser CORS for buyer registration check
app.post("/api/buyer-check", async (req, res) => {
  try {
    const { registrationNo } = req.body || {};
    if (!registrationNo) {
      return res.status(400).json({ error: "registrationNo is required" });
    }

    const axios = (await import("axios")).default;
    const upstream = await axios.post(
      "https://buyercheckapi.inplsoftwares.online/checkbuyer.php",
      {
        token: "89983e4a-c009-3f9b-bcd6-a605c3086709",
        registrationNo,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    return res.status(200).json(upstream.data);
  } catch (err) {
    const status = err?.response?.status || 500;
    const data = err?.response?.data || { error: "Upstream request failed" };
    console.error("/api/buyer-check proxy error:", status, data);
    return res.status(status).json({ error: data?.error || "Proxy error" });
  }
});

// Catch-all route for SPA - must be last
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

export const logger = {
  info: (msg) => console.log(`INFO: ${msg}`),
  error: (msg) => console.error(`ERROR: ${msg}`),
};

const startServer = async () => {
  try {
    // Initialize MySQL instead of MongoDB
    await mysqlConnector({}, logger);
    console.log("✅ Connected to MySQL multi-tenant database system");

    // Start the server first
    const port = process.env.PORT || 5150;
    const server = app.listen(port, () => {
      console.log("🚀 Server is running on port", port);
      console.log("📋 MySQL Multi-Tenant System Ready!");
      console.log("🔗 API Endpoints:");
    });
  } catch (error) {
    console.log("❌ Error starting server", error);
    process.exit(1);
  }
};

export default startServer;
