import AuditService from "../service/AuditService.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Audit middleware factory that creates audit middleware for specific entity types
 * @param {Object} config - Configuration object
 * @param {string} config.entityType - Type of entity (invoice, buyer, product, user)
 * @param {string} config.entityIdParam - Parameter name for entity ID (default: 'id')
 * @param {Function} config.getEntityName - Function to get entity name from request/response
 * @param {Function} config.shouldAudit - Function to determine if request should be audited
 * @param {Object} config.operationMapping - Mapping of HTTP methods to operations
 */
export const createAuditMiddleware = (config) => {
  const {
    entityType,
    entityIdParam = "id",
    getEntityName = null,
    shouldAudit = () => true,
    operationMapping = {
      POST: "CREATE",
      PUT: "UPDATE",
      PATCH: "UPDATE",
      DELETE: "DELETE",
    },
  } = config;

  return async (req, res, next) => {
    // Skip if audit is disabled for this request
    if (!shouldAudit(req)) {
      return next();
    }

    const operation = operationMapping[req.method];
    if (!operation) {
      return next();
    }

    // Store original response methods
    const originalSend = res.send;
    const originalJson = res.json;

    // Variables to store request/response data
    let requestBody = null;
    let responseData = null;
    let entityId = null;
    let oldValues = null;
    let newValues = null;

    // Capture request body
    if (req.body && Object.keys(req.body).length > 0) {
      requestBody = { ...req.body };
    }

    // For UPDATE and DELETE operations, capture old values
    if (operation === "UPDATE" || operation === "DELETE") {
      entityId = req.params[entityIdParam];
      if (entityId) {
        try {
          // Get old values from the entity (this will be implemented per controller)
          oldValues = await getOldValues(req, entityId);
        } catch (error) {
          console.warn("Could not fetch old values for audit:", error.message);
        }
      }
    }

    // Override response methods to capture response data
    res.send = function (data) {
      responseData = data;
      return originalSend.call(this, data);
    };

    res.json = function (data) {
      responseData = data;
      return originalJson.call(this, data);
    };

    // Store the audit function to be called after response
    res.on("finish", async () => {
      try {
        // Only audit successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // Extract entity ID from response or params
          if (!entityId) {
            if (responseData && responseData.data && responseData.data.id) {
              entityId = responseData.data.id;
            } else if (responseData && responseData.id) {
              entityId = responseData.id;
            } else {
              entityId = req.params[entityIdParam];
            }
          }

          // Prepare new values
          if (operation === "CREATE" || operation === "UPDATE") {
            newValues = responseData && responseData.data ? responseData.data : requestBody;
          }

          // Get entity name
          let entityName = null;
          if (getEntityName) {
            entityName = getEntityName(req, responseData);
          }

          // Prepare audit data
          const auditData = {
            entityType,
            entityId: entityId ? parseInt(entityId) : null,
            operation,
            user: {
              id: req.user?.id || req.user?.userId,
              email: req.user?.email,
              firstName: req.user?.firstName,
              lastName: req.user?.lastName,
              role: req.user?.role,
            },
            tenant: {
              id: req.tenant?.id || req.tenant?.tenantId,
              name: req.tenant?.sellerBusinessName,
            },
            oldValues,
            newValues,
            request: {
              ip: req.ip || req.connection.remoteAddress,
              userAgent: req.get("User-Agent"),
              requestId: req.headers["x-request-id"] || uuidv4(),
            },
            additionalInfo: {
              entityName,
              endpoint: req.originalUrl,
              method: req.method,
              statusCode: res.statusCode,
            },
          };

          // Log the audit event
          await AuditService.logAuditEvent(auditData);
        }
      } catch (error) {
        console.error("Error in audit middleware:", error);
        // Don't throw error to avoid breaking the response
      }
    });

    next();
  };
};

/**
 * Helper function to get old values for UPDATE/DELETE operations
 * This should be implemented per entity type
 */
const getOldValues = async (req, entityId) => {
  // This will be implemented by each controller
  // For now, return null - controllers will handle this
  return null;
};

/**
 * Predefined audit middlewares for common entity types
 */

// Invoice audit middleware
export const invoiceAuditMiddleware = createAuditMiddleware({
  entityType: "invoice",
  entityIdParam: "id",
  getEntityName: (req, responseData) => {
    if (responseData && responseData.data) {
      return responseData.data.invoice_number || responseData.data.system_invoice_id;
    }
    return null;
  },
  shouldAudit: (req) => {
    // Audit all invoice operations
    return true;
  },
});

// Buyer audit middleware
export const buyerAuditMiddleware = createAuditMiddleware({
  entityType: "buyer",
  entityIdParam: "id",
  getEntityName: (req, responseData) => {
    if (responseData && responseData.data) {
      return responseData.data.buyerBusinessName || responseData.data.buyerNTNCNIC;
    }
    return null;
  },
  shouldAudit: (req) => {
    // Audit all buyer operations
    return true;
  },
});

// Product audit middleware
export const productAuditMiddleware = createAuditMiddleware({
  entityType: "product",
  entityIdParam: "id",
  getEntityName: (req, responseData) => {
    if (responseData && responseData.data) {
      return responseData.data.name;
    }
    return null;
  },
  shouldAudit: (req) => {
    // Audit all product operations
    return true;
  },
});

// User audit middleware
export const userAuditMiddleware = createAuditMiddleware({
  entityType: "user",
  entityIdParam: "id",
  getEntityName: (req, responseData) => {
    if (responseData && responseData.data) {
      return responseData.data.email || `${responseData.data.firstName || ""} ${responseData.data.lastName || ""}`.trim();
    }
    return null;
  },
  shouldAudit: (req) => {
    // Audit all user management operations
    return true;
  },
});

/**
 * Manual audit logging function for controllers
 * Use this when you need more control over what gets audited
 */
export const logAuditEvent = async (req, entityType, entityId, operation, oldValues = null, newValues = null, additionalInfo = null) => {
  try {
    // Calculate changed fields for UPDATE operations
    let changedFields = null;
    if (operation === "UPDATE" && oldValues && newValues) {
      changedFields = {};
      const allKeys = new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})]);

      for (const key of allKeys) {
        const oldVal = oldValues?.[key];
        const newVal = newValues?.[key];

        // Convert undefined to null for proper JSON serialization
        const normalizedOldVal = oldVal === undefined ? null : oldVal;
        const normalizedNewVal = newVal === undefined ? null : newVal;

        // Only include if values are actually different
        if (normalizedOldVal !== normalizedNewVal) {
          changedFields[key] = {
            old: normalizedOldVal,
            new: normalizedNewVal,
          };
        }
      }

      // Debug logging
      console.log('🔍 Audit Debug - Changed Fields:', JSON.stringify(changedFields, null, 2));
      console.log('🔍 Audit Debug - Old Values:', JSON.stringify(oldValues, null, 2));
      console.log('🔍 Audit Debug - New Values:', JSON.stringify(newValues, null, 2));

      // If no fields actually changed, don't log an update event
      if (Object.keys(changedFields).length === 0) {
        console.log('🔍 Audit Debug - No changes detected, skipping audit log');
        return;
      }
    }

    const auditData = {
      entityType,
      entityId: entityId ? parseInt(entityId) : null,
      operation,
      user: {
        id: req.user?.id || req.user?.userId,
        email: req.user?.email,
        firstName: req.user?.firstName,
        lastName: req.user?.lastName,
        role: req.user?.role,
      },
      tenant: {
        id: entityType === "invoice" ? null : (req.tenant?.id || req.tenant?.tenantId),
        name: entityType === "invoice" ? null : (req.tenant?.seller_business_name || req.tenant?.name || req.tenant?.sellerBusinessName),
      },
      oldValues,
      newValues,
      changedFields,
      request: {
        ip: req.ip || req.connection?.remoteAddress || null,
        userAgent: (req.get ? req.get("User-Agent") : null) || null,
        requestId: req.headers?.["x-request-id"] || uuidv4(),
      },
      additionalInfo: {
        endpoint: req.originalUrl,
        method: req.method,
        ...additionalInfo,
      },
    };

    await AuditService.logAuditEvent(auditData);
  } catch (error) {
    console.error("Error logging manual audit event:", error);
  }
};

/**
 * Middleware to add request ID to all requests
 */
export const requestIdMiddleware = (req, res, next) => {
  if (!req.headers["x-request-id"]) {
    req.headers["x-request-id"] = uuidv4();
  }
  res.setHeader("X-Request-ID", req.headers["x-request-id"]);
  next();
};
