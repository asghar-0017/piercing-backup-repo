import { DataTypes } from "sequelize";
import { masterSequelize } from "../../config/mysql.js";

const AuditLog = masterSequelize.define(
  "AuditLog",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: "entity_type",
      comment: "Type of entity: invoice, buyer, product, user",
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "entity_id",
      comment: "ID of the affected entity",
    },
    operation: {
      type: DataTypes.ENUM("CREATE", "UPDATE", "DELETE", "SAVE_DRAFT", "SAVE_AND_VALIDATE", "SUBMIT_TO_FBR", "BULK_CREATE"),
      allowNull: false,
      comment: "Type of operation performed",
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "user_id",
      comment: "ID of user who performed the operation",
    },
    userEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "user_email",
      comment: "Email of user who performed the operation",
    },
    userName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "user_name",
      comment: "Full name of user who performed the operation",
    },
    userRole: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "user_role",
      comment: "Role of user who performed the operation",
    },
    tenantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "tenant_id",
      comment: "Tenant/Company ID where operation was performed",
    },
    tenantName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "tenant_name",
      comment: "Tenant/Company name",
    },
    oldValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "old_values",
      comment: "Previous values before update/delete (JSON format)",
    },
    newValues: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "new_values",
      comment: "New values after create/update (JSON format)",
    },
    changedFields: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "changed_fields",
      comment: "List of fields that were changed (for updates)",
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: "ip_address",
      comment: "IP address of the user",
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "user_agent",
      comment: "User agent string from the request",
    },
    requestId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "request_id",
      comment: "Unique request identifier for tracking",
    },
    additionalInfo: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "additional_info",
      comment: "Additional context information",
    },
  },
  {
    tableName: "audit_logs",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false, // Audit logs are never updated
    indexes: [
      {
        fields: ["entity_type", "entity_id"],
        name: "idx_audit_entity",
      },
      {
        fields: ["user_id"],
        name: "idx_audit_user",
      },
      {
        fields: ["operation"],
        name: "idx_audit_operation",
      },
      {
        fields: ["tenant_id"],
        name: "idx_audit_tenant",
      },
      {
        fields: ["created_at"],
        name: "idx_audit_created_at",
      },
      {
        fields: ["user_email"],
        name: "idx_audit_user_email",
      },
      {
        fields: ["entity_type", "operation"],
        name: "idx_audit_entity_operation",
      },
      {
        fields: ["entity_type", "entity_id", "created_at"],
        name: "idx_audit_logs_composite",
      },
      {
        fields: ["user_id", "tenant_id", "created_at"],
        name: "idx_audit_logs_user_tenant",
      },
    ],
  }
);

export default AuditLog;
