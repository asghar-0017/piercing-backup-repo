import { DataTypes } from "sequelize";

// This will be used as a factory function to create InvoiceItem model for each tenant
export const createInvoiceItemModel = (sequelize) => {
  return sequelize.define(
    "InvoiceItem",
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      invoice_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: "invoices",
          key: "id",
        },
      },
      invoiceItemNo: {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: "",
      },
      product_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: {
          model: "products",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      hsCode: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      productDescription: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      rate: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      uoM: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      quantity: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      unitPrice: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      itemCode: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      units: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      courierCharges: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      totalValues: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      valueSalesExcludingST: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      fixedNotifiedValueOrRetailPrice: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      salesTaxApplicable: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      salesTaxWithheldAtSource: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      extraTax: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      furtherTax: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      sroScheduleNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      fedPayable: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      advanceIncomeTax: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      discount: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      saleType: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      sroItemSerialNo: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      billOfLadingUoM: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      qtyForInternal: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      vat18: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      vat25: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      vatAmount: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      vat18Amount: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      vat25Amount: {
        type: DataTypes.DECIMAL(20, 2),
        allowNull: true,
      },
      isDeleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: "invoice_items",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: false,
    }
  );
};
