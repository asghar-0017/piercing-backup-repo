import { DataTypes } from "sequelize";

// This will be used as a factory function to create InvoiceBackupSummary model for each tenant
export const createInvoiceBackupSummaryModel = (sequelize) => {
  return sequelize.define(
    "InvoiceBackupSummary",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      original_invoice_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: false,
        comment: 'ID of the original invoice',
      },
      latest_backup_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID of the latest backup entry',
      },
      total_backups: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total number of backups for this invoice',
      },
      last_backup_type: {
        type: DataTypes.ENUM('DRAFT', 'SAVED', 'EDIT', 'POST', 'FBR_REQUEST', 'FBR_RESPONSE'),
        allowNull: true,
        comment: 'Type of the last backup operation',
      },
      first_backup_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp of first backup',
      },
      last_backup_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Timestamp of last backup',
      },
      created_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID of user who created the first backup',
      },
      created_by_email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Email of user who created the first backup',
      },
      created_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Full name of user who created the first backup',
      },
      last_modified_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'ID of user who performed the last backup',
      },
      last_modified_by_email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Email of user who performed the last backup',
      },
      last_modified_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Full name of user who performed the last backup',
      },
      invoice_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Invoice number of the original invoice',
      },
      system_invoice_id: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'System invoice ID of the original invoice',
      },
      fbr_invoice_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'FBR invoice number of the original invoice',
      },
      tenant_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Tenant/Company ID',
      },
      tenant_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Tenant/Company name',
      },
    },
    {
      tableName: "invoice_backup_summary",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );
};
