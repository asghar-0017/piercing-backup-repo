import { DataTypes } from "sequelize";
import { masterSequelize } from "../../config/mysql.js";

const Tenant = masterSequelize.define(
  "Tenant",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    tenant_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    seller_ntn_cnic: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: "seller_ntn_cnic",
    },
    seller_full_ntn: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: "seller_full_ntn",
    },
    seller_business_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "seller_business_name",
    },
    seller_province: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: "seller_province",
    },
    seller_address: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "seller_address",
    },
    database_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    sandboxTestToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "sandbox_test_token",
    },
    sandboxProductionToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "sandbox_production_token",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "tenants",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Tenant;
