import express from "express";
import {
  getAuditLogs,
  getAuditSummary,
  getEntityAuditLogs,
  getEntityEditHistory,
  getAuditStatistics,
  getAuditLogsByUser,
  getAuditLogsByTenant,
  exportAuditLogs,
} from "../controller/mysql/auditController.js";
import { authenticateToken } from "../middleWare/authMiddleware.js";
import { requirePermission } from "../middleWare/permissionMiddleware.js";

const router = express.Router();

// All audit routes require authentication and specific permissions
router.use(authenticateToken);

// Get audit logs with filtering and pagination
router.get("/logs", requirePermission("audit.view"), getAuditLogs);

// Get audit summary with filtering and pagination
router.get("/summary", requirePermission("audit.summary"), getAuditSummary);

// Get audit statistics
router.get("/statistics", requirePermission("audit.view"), getAuditStatistics);

// Get audit logs for a specific entity
router.get("/entity/:entityType/:entityId", requirePermission("audit.view"), getEntityAuditLogs);

// Get complete edit history for a specific entity with timeline view
router.get("/entity/:entityType/:entityId/history", requirePermission("audit.view"), getEntityEditHistory);

// Get audit logs by user
router.get("/user/:userId", requirePermission("audit.view"), getAuditLogsByUser);

// Get audit logs by tenant
router.get("/tenant/:tenantId", requirePermission("audit.view"), getAuditLogsByTenant);

// Export audit logs
router.get("/export", requirePermission("audit.export"), exportAuditLogs);

export default router;
