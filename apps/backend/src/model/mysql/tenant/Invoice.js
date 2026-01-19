import { DataTypes } from "sequelize";

// This will be used as a factory function to create Invoice model for each tenant
export const createInvoiceModel = (sequelize) => {
  return sequelize.define(
    "Invoice",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      invoice_number: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      invoiceType: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      invoiceDate: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      sellerNTNCNIC: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      sellerFullNTN: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      sellerBusinessName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      sellerProvince: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      sellerAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      sellerCity: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      buyerNTNCNIC: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      buyerBusinessName: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      buyerProvince: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      buyerAddress: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      buyerRegistrationType: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      buyer_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "buyers",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      invoiceRefNo: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      companyInvoiceRefNo: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      internal_invoice_no: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      transctypeId: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM(
          "draft",
          "saved",
          "validated",
          "submitted",
          "posted"
        ),
        allowNull: false,
        defaultValue: "draft",
      },
      fbr_invoice_number: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      system_invoice_id: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
      },
      // Track which user created the invoice (from user management)
      created_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      created_by_email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      created_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: "invoices",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );
};
