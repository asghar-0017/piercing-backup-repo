import AuditService from "../../service/AuditService.js";
import { formatResponse } from "../../utils/formatResponse.js";

/**
 * Get audit logs with filtering and pagination
 */
export const getAuditLogs = async (req, res) => {
  try {
    const {
      entityType,
      entityId,
      operation,
      userId,
      userEmail,
      tenantId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50,
      sortBy = "created_at",
      sortOrder = "DESC",
    } = req.query;

    const filters = {
      entityType,
      entityId: entityId ? parseInt(entityId) : undefined,
      operation,
      userId: userId ? parseInt(userId) : undefined,
      userEmail,
      tenantId: tenantId ? parseInt(tenantId) : undefined,
      startDate,
      endDate,
      search,
    };

    const pagination = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Max 100 per page
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
    };

    const result = await AuditService.getAuditLogs(filters, pagination);

    return res.status(200).json(
      formatResponse(true, "Audit logs fetched successfully", {
        logs: result.logs,
        pagination: result.pagination,
      }, 200)
    );
  } catch (error) {
    console.error("Error in getAuditLogs:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to fetch audit logs", null, 500, error.message)
    );
  }
};

/**
 * Get audit summary with filtering and pagination
 */
export const getAuditSummary = async (req, res) => {
  try {
    const {
      entityType,
      tenantId,
      isDeleted,
      createdByUserId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50,
      sortBy = "last_modified_at",
      sortOrder = "DESC",
    } = req.query;

    const filters = {
      entityType,
      tenantId: tenantId ? parseInt(tenantId) : undefined,
      isDeleted: isDeleted !== undefined ? isDeleted === "true" : undefined,
      createdByUserId: createdByUserId ? parseInt(createdByUserId) : undefined,
      startDate,
      endDate,
      search,
    };

    const pagination = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100), // Max 100 per page
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
    };

    const result = await AuditService.getAuditSummary(filters, pagination);

    return res.status(200).json(
      formatResponse(true, "Audit summary fetched successfully", {
        summaries: result.summaries,
        pagination: result.pagination,
      }, 200)
    );
  } catch (error) {
    console.error("Error in getAuditSummary:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to fetch audit summary", null, 500, error.message)
    );
  }
};

/**
 * Get audit logs for a specific entity
 */
export const getEntityAuditLogs = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!entityType || !entityId) {
      return res.status(400).json(
        formatResponse(false, "Entity type and entity ID are required", null, 400)
      );
    }

    const logs = await AuditService.getEntityAuditLogs(entityType, parseInt(entityId));

    return res.status(200).json(
      formatResponse(true, "Entity audit logs fetched successfully", { logs }, 200)
    );
  } catch (error) {
    console.error("Error in getEntityAuditLogs:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to fetch entity audit logs", null, 500, error.message)
    );
  }
};

/**
 * Get complete edit history for a specific entity with timeline view
 */
export const getEntityEditHistory = async (req, res) => {
  try {
    const { entityType, entityId } = req.params;

    if (!entityType || !entityId) {
      return res.status(400).json(
        formatResponse(false, "Entity type and entity ID are required", null, 400)
      );
    }

    const history = await AuditService.getEntityEditHistory(entityType, parseInt(entityId));

    return res.status(200).json(
      formatResponse(true, "Entity edit history fetched successfully", { history }, 200)
    );
  } catch (error) {
    console.error("Error in getEntityEditHistory:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to fetch entity edit history", null, 500, error.message)
    );
  }
};

/**
 * Get audit statistics
 */
export const getAuditStatistics = async (req, res) => {
  try {
    const { tenantId, startDate, endDate } = req.query;

    const filters = {
      tenantId: tenantId ? parseInt(tenantId) : undefined,
      startDate,
      endDate,
    };

    const statistics = await AuditService.getAuditStatistics(filters);

    return res.status(200).json(
      formatResponse(true, "Audit statistics fetched successfully", statistics, 200)
    );
  } catch (error) {
    console.error("Error in getAuditStatistics:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to fetch audit statistics", null, 500, error.message)
    );
  }
};

/**
 * Get audit logs by user
 */
export const getAuditLogsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      entityType,
      operation,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    if (!userId) {
      return res.status(400).json(
        formatResponse(false, "User ID is required", null, 400)
      );
    }

    const filters = {
      userId: parseInt(userId),
      entityType,
      operation,
      startDate,
      endDate,
    };

    const pagination = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      sortBy: "created_at",
      sortOrder: "DESC",
    };

    const result = await AuditService.getAuditLogs(filters, pagination);

    return res.status(200).json(
      formatResponse(true, "User audit logs fetched successfully", {
        logs: result.logs,
        pagination: result.pagination,
      }, 200)
    );
  } catch (error) {
    console.error("Error in getAuditLogsByUser:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to fetch user audit logs", null, 500, error.message)
    );
  }
};

/**
 * Get audit logs by tenant
 */
export const getAuditLogsByTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const {
      entityType,
      operation,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    if (!tenantId) {
      return res.status(400).json(
        formatResponse(false, "Tenant ID is required", null, 400)
      );
    }

    const filters = {
      tenantId: parseInt(tenantId),
      entityType,
      operation,
      startDate,
      endDate,
    };

    const pagination = {
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 100),
      sortBy: "created_at",
      sortOrder: "DESC",
    };

    const result = await AuditService.getAuditLogs(filters, pagination);

    return res.status(200).json(
      formatResponse(true, "Tenant audit logs fetched successfully", {
        logs: result.logs,
        pagination: result.pagination,
      }, 200)
    );
  } catch (error) {
    console.error("Error in getAuditLogsByTenant:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to fetch tenant audit logs", null, 500, error.message)
    );
  }
};

/**
 * Export audit logs (CSV format)
 */
export const exportAuditLogs = async (req, res) => {
  try {
    const {
      entityType,
      operation,
      userId,
      tenantId,
      startDate,
      endDate,
      format = "csv",
    } = req.query;

    const filters = {
      entityType,
      operation,
      userId: userId ? parseInt(userId) : undefined,
      tenantId: tenantId ? parseInt(tenantId) : undefined,
      startDate,
      endDate,
    };

    // Get all matching logs (no pagination for export)
    const result = await AuditService.getAuditLogs(filters, { page: 1, limit: 10000 });

    if (format === "csv") {
      // Generate CSV
      const csvHeaders = [
        "ID",
        "Entity Type",
        "Entity ID",
        "Operation",
        "User Name",
        "User Email",
        "User Role",
        "Tenant Name",
        "IP Address",
        "Created At",
      ];

      const csvRows = result.logs.map((log) => [
        log.id,
        log.entityType,
        log.entityId,
        log.operation,
        log.userName || "",
        log.userEmail || "",
        log.userRole || "",
        log.tenantName || "",
        log.ipAddress || "",
        log.created_at,
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map((row) => row.map((field) => `"${field}"`).join(","))
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit_logs_${new Date().toISOString().split("T")[0]}.csv"`);
      return res.send(csvContent);
    } else {
      // Return JSON
      return res.status(200).json(
        formatResponse(true, "Audit logs exported successfully", {
          logs: result.logs,
          total: result.pagination.total,
        }, 200)
      );
    }
  } catch (error) {
    console.error("Error in exportAuditLogs:", error);
    return res.status(500).json(
      formatResponse(false, "Failed to export audit logs", null, 500, error.message)
    );
  }
};
