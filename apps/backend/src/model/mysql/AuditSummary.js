import { DataTypes } from "sequelize";
import { masterSequelize } from "../../config/mysql.js";

const AuditSummary = masterSequelize.define(
  "AuditSummary",
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
    },
    entityId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "entity_id",
    },
    entityName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "entity_name",
      comment: "Human-readable name of the entity",
    },
    totalOperations: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: "total_operations",
      comment: "Total number of operations on this entity",
    },
    createdByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "created_by_user_id",
    },
    createdByEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "created_by_email",
    },
    createdByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "created_by_name",
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "created_at",
    },
    lastModifiedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "last_modified_by_user_id",
    },
    lastModifiedByEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "last_modified_by_email",
    },
    lastModifiedByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "last_modified_by_name",
    },
    lastModifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_modified_at",
    },
    tenantId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "tenant_id",
    },
    tenantName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "tenant_name",
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_deleted",
      comment: "Whether the entity has been deleted",
    },
    deletedByUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "deleted_by_user_id",
    },
    deletedByEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "deleted_by_email",
    },
    deletedByName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "deleted_by_name",
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "deleted_at",
    },
  },
  {
    tableName: "audit_summary",
    timestamps: true,
    createdAt: false,
    updatedAt: "updated_at",
    indexes: [
      {
        unique: true,
        fields: ["entity_type", "entity_id"],
        name: "unique_entity",
      },
      {
        fields: ["entity_type"],
        name: "idx_summary_entity_type",
      },
      {
        fields: ["tenant_id"],
        name: "idx_summary_tenant",
      },
      {
        fields: ["created_by_user_id"],
        name: "idx_summary_created_by",
      },
      {
        fields: ["last_modified_by_user_id"],
        name: "idx_summary_last_modified",
      },
      {
        fields: ["is_deleted"],
        name: "idx_summary_deleted",
      },
      {
        fields: ["entity_type", "tenant_id", "last_modified_at"],
        name: "idx_audit_summary_entity_tenant",
      },
    ],
  }
);

export default AuditSummary;
