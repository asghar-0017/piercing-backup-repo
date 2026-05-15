import { DataTypes } from "sequelize";

// This will be used as a factory function to create InvoiceBackup model for each tenant
export const createInvoiceBackupModel = (sequelize) => {
  return sequelize.define(
    "InvoiceBackup",
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      original_invoice_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: 'ID of the original invoice',
      },
      system_invoice_id: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'System invoice ID for reference',
      },
      invoice_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Invoice number at time of backup',
      },
      backup_type: {
        type: DataTypes.ENUM(
          'DRAFT',
          'SAVED',
          'EDIT',
          'POST',
          'FBR_REQUEST',
          'FBR_RESPONSE'
        ),
        allowNull: false,
        comment: 'Type of backup operation',
      },
      backup_reason: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Reason for backup',
      },
      status_before: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Invoice status before the operation',
      },
      status_after: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Invoice status after the operation',
      },
      invoice_data: {
        type: DataTypes.JSON,
        allowNull: false,
        comment: 'Complete invoice data at time of backup',
      },
      invoice_items_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Complete invoice items data at time of backup',
      },
      fbr_request_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'FBR API request data',
      },
      fbr_response_data: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'FBR API response data',
      },
      fbr_invoice_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'FBR invoice number if available',
      },
      user_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: 'ID of user who performed the operation',
      },
      user_email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Email of user who performed the operation',
      },
      user_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Full name of user who performed the operation',
      },
      user_role: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: 'Role of user who performed the operation',
      },
      tenant_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: 'Tenant/Company ID where operation was performed',
      },
      tenant_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Tenant/Company name',
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'IP address of the user',
      },
      user_agent: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'User agent string from the request',
      },
      request_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Unique request identifier for tracking',
      },
      additional_info: {
        type: DataTypes.JSON,
        allowNull: true,
        comment: 'Additional context information',
      },
    },
    {
      tableName: "invoice_backups",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );
};
