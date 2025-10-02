import { v4 as uuidv4 } from "uuid";
import { Op } from "sequelize";
import AuditLog from "../model/mysql/AuditLog.js";
import AuditSummary from "../model/mysql/AuditSummary.js";
import { masterSequelize } from "../config/mysql.js";

class AuditService {
  /**
   * Log an audit event
   * @param {Object} auditData - The audit data
   * @param {string} auditData.entityType - Type of entity (invoice, buyer, product, user)
   * @param {number} auditData.entityId - ID of the entity
   * @param {string} auditData.operation - Operation type (CREATE, UPDATE, DELETE)
   * @param {Object} auditData.user - User information
   * @param {Object} auditData.tenant - Tenant information
   * @param {Object} auditData.oldValues - Previous values (for UPDATE/DELETE)
   * @param {Object} auditData.newValues - New values (for CREATE/UPDATE)
   * @param {Object} auditData.request - Request information
   * @param {Object} auditData.additionalInfo - Additional context
   */
  async logAuditEvent(auditData) {
    try {
      const {
        entityType,
        entityId,
        operation,
        user = {},
        tenant = {},
        oldValues = null,
        newValues = null,
        request = {},
        additionalInfo = null,
      } = auditData;

      // Use provided changedFields or calculate if not provided
      let changedFields = auditData.changedFields;
      if (!changedFields && operation === "UPDATE" && oldValues && newValues) {
        changedFields = this.getChangedFields(oldValues, newValues);
      }
      
      // Debug logging
      console.log('🔍 AuditService Debug - Changed Fields:', JSON.stringify(changedFields, null, 2));
      console.log('🔍 AuditService Debug - Changed Fields Type:', typeof changedFields);
      console.log('🔍 AuditService Debug - Changed Fields Keys:', changedFields ? Object.keys(changedFields) : 'null');

      // Create audit log entry
      const auditLog = await AuditLog.create({
        entityType,
        entityId,
        operation,
        userId: user.id || user.userId || null,
        userEmail: user.email || null,
        userName: this.getUserDisplayName(user),
        userRole: user.role || null,
        tenantId: tenant.id || tenant.tenantId || null,
        tenantName: tenant.name || tenant.sellerBusinessName || null,
        oldValues: oldValues ? JSON.stringify(oldValues) : null,
        newValues: newValues ? JSON.stringify(newValues) : null,
        changedFields: changedFields ? JSON.stringify(changedFields) : null,
        ipAddress: request.ip || null,
        userAgent: request.userAgent || null,
        requestId: request.requestId || uuidv4(),
        additionalInfo: additionalInfo ? JSON.stringify(additionalInfo) : null,
      });
      
      // Debug logging after creation
      console.log('🔍 AuditService Debug - Created audit log ID:', auditLog.id);
      console.log('🔍 AuditService Debug - Stored changedFields:', auditLog.changedFields);

      // Update audit summary
      await this.updateAuditSummary({
        entityType,
        entityId,
        operation,
        user,
        tenant,
        newValues,
        additionalInfo,
      });

      return auditLog;
    } catch (error) {
      console.error("Error logging audit event:", error);
      // Don't throw error to avoid breaking the main operation
      return null;
    }
  }

  /**
   * Get changed fields between old and new values
   */
  getChangedFields(oldValues, newValues) {
    const changed = {};
    const allKeys = new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})]);

    for (const key of allKeys) {
      const oldVal = oldValues?.[key];
      const newVal = newValues?.[key];
      
      // Convert undefined to null for proper JSON serialization
      const normalizedOldVal = oldVal === undefined ? null : oldVal;
      const normalizedNewVal = newVal === undefined ? null : newVal;
      
      // Only include if values are actually different
      if (normalizedOldVal !== normalizedNewVal) {
        changed[key] = {
          old: normalizedOldVal,
          new: normalizedNewVal,
        };
      }
    }

    return Object.keys(changed).length > 0 ? changed : null;
  }

  /**
   * Get user display name
   */
  getUserDisplayName(user) {
    // Check for full name first
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    
    // Check for name field
    if (user.name) {
      return user.name;
    }
    
    // Check for userName field
    if (user.userName) {
      return user.userName;
    }
    
    // Check for email
    if (user.email) {
      return user.email;
    }
    
    // Check for role-based naming
    if (user.role === "admin") {
      return `Admin (${user.id || user.userId || "Unknown"})`;
    }
    
    // If we have an ID but no name, return a generic identifier
    if (user.id || user.userId) {
      return `User #${user.id || user.userId}`;
    }
    
    // Last resort - return "Unknown" instead of null
    return "Unknown";
  }

  /**
   * Update audit summary for an entity
   */
  async updateAuditSummary({ entityType, entityId, operation, user, tenant, newValues, additionalInfo }) {
    try {
      const transaction = await masterSequelize.transaction();

      try {
        // Find existing summary or create new one
        let summary = await AuditSummary.findOne({
          where: { entityType, entityId },
          transaction,
        });

        const userDisplayName = this.getUserDisplayName(user);
        const now = new Date();

        if (!summary) {
          // Create new summary
          summary = await AuditSummary.create(
            {
              entityType,
              entityId,
              entityName: this.getEntityName(entityType, newValues, additionalInfo),
              totalOperations: 1,
              createdByUserId: user.id || user.userId || null,
              createdByEmail: user.email || null,
              createdByName: userDisplayName,
              createdAt: now,
              lastModifiedByUserId: user.id || user.userId || null,
              lastModifiedByEmail: user.email || null,
              lastModifiedByName: userDisplayName,
              lastModifiedAt: now,
              tenantId: tenant.id || tenant.tenantId || null,
              tenantName: tenant.name || tenant.sellerBusinessName || null,
              isDeleted: operation === "DELETE",
              deletedByUserId: operation === "DELETE" ? (user.id || user.userId || null) : null,
              deletedByEmail: operation === "DELETE" ? (user.email || null) : null,
              deletedByName: operation === "DELETE" ? userDisplayName : null,
              deletedAt: operation === "DELETE" ? now : null,
            },
            { transaction }
          );
        } else {
          // Update existing summary
          const updateData = {
            totalOperations: summary.totalOperations + 1,
            lastModifiedByUserId: user.id || user.userId || null,
            lastModifiedByEmail: user.email || null,
            lastModifiedByName: userDisplayName,
            lastModifiedAt: now,
          };

          // Update entity name if it's a CREATE operation or if name changed
          if (operation === "CREATE" || this.shouldUpdateEntityName(entityType, newValues, summary.entityName)) {
            updateData.entityName = this.getEntityName(entityType, newValues, additionalInfo);
          }

          // Handle deletion
          if (operation === "DELETE") {
            updateData.isDeleted = true;
            updateData.deletedByUserId = user.id || user.userId || null;
            updateData.deletedByEmail = user.email || null;
            updateData.deletedByName = userDisplayName;
            updateData.deletedAt = now;
          }

          await summary.update(updateData, { transaction });
        }

        await transaction.commit();
        return summary;
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      console.error("Error updating audit summary:", error);
      return null;
    }
  }

  /**
   * Get entity name for display
   */
  getEntityName(entityType, newValues, additionalInfo) {
    if (!newValues) return null;

    switch (entityType) {
      case "invoice":
        return newValues.invoice_number || newValues.system_invoice_id || `Invoice ${newValues.id}`;
      case "buyer":
        return newValues.buyerBusinessName || newValues.buyerNTNCNIC || `Buyer ${newValues.id}`;
      case "product":
        return newValues.name || `Product ${newValues.id}`;
      case "user":
        return newValues.email || `${newValues.firstName || ""} ${newValues.lastName || ""}`.trim() || `User ${newValues.id}`;
      default:
        return `${entityType} ${newValues.id}`;
    }
  }

  /**
   * Check if entity name should be updated
   */
  shouldUpdateEntityName(entityType, newValues, currentName) {
    if (!newValues || !currentName) return false;

    const newName = this.getEntityName(entityType, newValues);
    return newName && newName !== currentName;
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getAuditLogs(filters = {}, pagination = {}) {
    try {
      console.log('🔍 AuditService Debug - getAuditLogs called with filters:', filters);
      console.log('🔍 AuditService Debug - getAuditLogs called with pagination:', pagination);
      
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
      } = filters;

      const { page = 1, limit = 50, sortBy = "created_at", sortOrder = "DESC" } = pagination;

      const where = {};
      const include = [];

      // Apply filters
      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;
      if (operation) where.operation = operation;
      if (userId) where.userId = userId;
      if (userEmail) where.userEmail = userEmail;
      if (tenantId) where.tenantId = tenantId;

      // Date range filter
      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at[Op.gte] = new Date(startDate);
        if (endDate) where.created_at[Op.lte] = new Date(endDate);
      }

      // Search filter (searches in user name, email, and additional info)
      if (search) {
        where[Op.or] = [
          { userName: { [Op.like]: `%${search}%` } },
          { userEmail: { [Op.like]: `%${search}%` } },
          { additionalInfo: { [Op.like]: `%${search}%` } },
        ];
      }

      console.log('🔍 AuditService Debug - Final where clause:', JSON.stringify(where, null, 2));
      const offset = (page - 1) * limit;

      const { rows, count } = await AuditLog.findAndCountAll({
        where,
        include,
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset,
      });

      console.log('🔍 AuditService Debug - Query result count:', count);
      console.log('🔍 AuditService Debug - Retrieved logs count:', rows.length);

      // Debug logging for retrieved logs
      if (rows.length > 0) {
        console.log('🔍 AuditService Debug - First log changedFields:', rows[0].changedFields);
        console.log('🔍 AuditService Debug - First log changedFields type:', typeof rows[0].changedFields);
      }

      return {
        logs: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / limit),
          hasMore: page * limit < count,
        },
      };
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      throw error;
    }
  }

  /**
   * Get audit summary with filtering and pagination
   */
  async getAuditSummary(filters = {}, pagination = {}) {
    try {
      const {
        entityType,
        tenantId,
        isDeleted,
        createdByUserId,
        startDate,
        endDate,
        search,
      } = filters;

      const { page = 1, limit = 50, sortBy = "last_modified_at", sortOrder = "DESC" } = pagination;

      const where = {};

      // Apply filters
      if (entityType) where.entityType = entityType;
      if (tenantId) where.tenantId = tenantId;
      if (isDeleted !== undefined) where.isDeleted = isDeleted;
      if (createdByUserId) where.createdByUserId = createdByUserId;

      // Date range filter
      if (startDate || endDate) {
        where.last_modified_at = {};
        if (startDate) where.last_modified_at[Op.gte] = new Date(startDate);
        if (endDate) where.last_modified_at[Op.lte] = new Date(endDate);
      }

      // Search filter
      if (search) {
        where[Op.or] = [
          { entityName: { [Op.like]: `%${search}%` } },
          { createdByName: { [Op.like]: `%${search}%` } },
          { lastModifiedByName: { [Op.like]: `%${search}%` } },
        ];
      }

      const offset = (page - 1) * limit;

      const { rows, count } = await AuditSummary.findAndCountAll({
        where,
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset,
      });

      return {
        summaries: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          totalPages: Math.ceil(count / limit),
          hasMore: page * limit < count,
        },
      };
    } catch (error) {
      console.error("Error fetching audit summary:", error);
      throw error;
    }
  }

  /**
   * Get audit logs for a specific entity
   */
  async getEntityAuditLogs(entityType, entityId) {
    try {
      const logs = await AuditLog.findAll({
        where: { entityType, entityId },
        order: [["created_at", "DESC"]],
      });

      return logs;
    } catch (error) {
      console.error("Error fetching entity audit logs:", error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(filters = {}) {
    try {
      console.log('🔍 AuditService Debug - Getting audit statistics with filters:', filters);
      const { tenantId, startDate, endDate } = filters;

      const where = {};
      if (tenantId) where.tenantId = tenantId;
      if (startDate || endDate) {
        where.created_at = {};
        if (startDate) where.created_at[Op.gte] = new Date(startDate);
        if (endDate) where.created_at[Op.lte] = new Date(endDate);
      }
      
      console.log('🔍 AuditService Debug - Where clause:', where);

      const [
        totalOperations,
        operationsByType,
        operationsByEntity,
        operationsByUser,
        recentActivity,
      ] = await Promise.all([
        // Total operations
        AuditLog.count({ where }),
        // Operations by type
        AuditLog.findAll({
          attributes: [
            "operation",
            [masterSequelize.fn("COUNT", masterSequelize.col("id")), "count"],
          ],
          where,
          group: ["operation"],
          raw: true,
        }),
        // Operations by entity type
        AuditLog.findAll({
          attributes: [
            "entityType",
            [masterSequelize.fn("COUNT", masterSequelize.col("id")), "count"],
          ],
          where,
          group: ["entityType"],
          raw: true,
        }),
        // Top users by operations
        AuditLog.findAll({
          attributes: [
            "userName",
            "userEmail",
            [masterSequelize.fn("COUNT", masterSequelize.col("id")), "count"],
          ],
          where,
          group: ["userName", "userEmail"],
          order: [[masterSequelize.fn("COUNT", masterSequelize.col("id")), "DESC"]],
          limit: 10,
          raw: true,
        }),
        // Recent activity (last 24 hours)
        AuditLog.count({
          where: {
            ...where,
            created_at: {
              [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

      const result = {
        totalOperations,
        operationsByType: operationsByType.reduce((acc, item) => {
          acc[item.operation] = parseInt(item.count);
          return acc;
        }, {}),
        operationsByEntity: operationsByEntity.reduce((acc, item) => {
          acc[item.entityType] = parseInt(item.count);
          return acc;
        }, {}),
        topUsers: operationsByUser.map((item) => ({
          userName: item.userName,
          userEmail: item.userEmail,
          count: parseInt(item.count),
        })),
        recentActivity,
      };
      
      console.log('🔍 AuditService Debug - Statistics result:', result);
      return result;
    } catch (error) {
      console.error("Error fetching audit statistics:", error);
      throw error;
    }
  }

  /**
   * Get complete edit history for a specific entity with timeline view
   */
  async getEntityEditHistory(entityType, entityId) {
    try {
      console.log(`🔍 AuditService Debug - Getting edit history for ${entityType} #${entityId}`);
      
      // Get all audit logs for this entity, ordered by creation time
      const logs = await AuditLog.findAll({
        where: { 
          entityType, 
          entityId 
        },
        order: [["created_at", "ASC"]], // Chronological order
      });

      if (logs.length === 0) {
        return {
          entityType,
          entityId,
          entityName: null,
          timeline: [],
          summary: {
            totalOperations: 0,
            createdBy: null,
            lastModifiedBy: null,
            firstCreated: null,
            lastModified: null,
            isDeleted: false
          }
        };
      }

      // Build timeline with state progression
      const timeline = [];
      let currentState = null;
      let previousState = null;

      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const logData = log.toJSON();
        
        // Parse JSON fields
        let oldValues = null;
        let newValues = null;
        let changedFields = null;

        try {
          oldValues = logData.oldValues ? JSON.parse(logData.oldValues) : null;
          newValues = logData.newValues ? JSON.parse(logData.newValues) : null;
          changedFields = logData.changedFields ? JSON.parse(logData.changedFields) : null;
        } catch (parseError) {
          console.warn(`Error parsing JSON for log ${log.id}:`, parseError);
        }

        // Determine entity name from the first CREATE or first available data
        let entityName = null;
        if (log.operation === 'CREATE' && newValues) {
          entityName = this.extractEntityName(newValues, entityType);
        } else if (currentState) {
          entityName = this.extractEntityName(currentState, entityType);
        }

        // Build timeline entry
        const timelineEntry = {
          id: log.id,
          operation: log.operation,
          user: {
            id: log.userId,
            name: log.userName,
            email: log.userEmail,
            role: log.userRole
          },
          timestamp: log.created_at,
          oldValues: oldValues,
          newValues: newValues,
          changedFields: changedFields,
          ipAddress: log.ipAddress,
          tenant: {
            id: log.tenantId,
            name: log.tenantName
          },
          additionalInfo: log.additionalInfo ? JSON.parse(log.additionalInfo) : null
        };

        // Update current state based on operation
        if (log.operation === 'CREATE') {
          currentState = newValues;
          previousState = null;
        } else if (log.operation === 'UPDATE') {
          previousState = currentState;
          currentState = newValues;
        } else if (log.operation === 'DELETE') {
          previousState = currentState;
          currentState = null;
        }

        timelineEntry.currentState = currentState;
        timelineEntry.previousState = previousState;

        timeline.push(timelineEntry);
      }

      // Build summary
      const firstLog = logs[0];
      const lastLog = logs[logs.length - 1];
      const createLog = logs.find(log => log.operation === 'CREATE');
      const lastUpdateLog = logs.filter(log => log.operation === 'UPDATE').pop();
      const deleteLog = logs.find(log => log.operation === 'DELETE');

      const summary = {
        totalOperations: logs.length,
        createdBy: createLog ? {
          id: createLog.userId,
          name: createLog.userName,
          email: createLog.userEmail,
          role: createLog.userRole
        } : null,
        lastModifiedBy: lastUpdateLog ? {
          id: lastUpdateLog.userId,
          name: lastUpdateLog.userName,
          email: lastUpdateLog.userEmail,
          role: lastUpdateLog.userRole
        } : (createLog ? {
          id: createLog.userId,
          name: createLog.userName,
          email: createLog.userEmail,
          role: createLog.userRole
        } : null),
        firstCreated: firstLog.created_at,
        lastModified: lastLog.created_at,
        isDeleted: !!deleteLog,
        entityName: this.extractEntityName(currentState, entityType)
      };

      return {
        entityType,
        entityId,
        entityName: summary.entityName,
        timeline,
        summary,
        currentState,
        isDeleted: summary.isDeleted
      };

    } catch (error) {
      console.error("Error getting entity edit history:", error);
      throw error;
    }
  }

  /**
   * Extract entity name from data based on entity type
   */
  extractEntityName(data, entityType) {
    if (!data) return null;

    switch (entityType) {
      case 'invoice':
        return data.invoice_number || data.system_invoice_id || data.fbr_invoice_number || `Invoice #${data.id}`;
      case 'buyer':
        return data.buyerBusinessName || data.businessName || data.name || `Buyer #${data.id}`;
      case 'product':
        return data.product_name || data.name || data.productName || `Product #${data.id}`;
      case 'user':
        return data.userName || data.name || data.email || `User #${data.id}`;
      default:
        return data.name || data.title || `${entityType} #${data.id}`;
    }
  }
}

export default new AuditService();
