import { DataTypes } from "sequelize";

export const createBillToShipToModel = (sequelize) => {
  return sequelize.define(
    "BillToShipTo",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      type: {
        type: DataTypes.ENUM("SHIP_TO", "BILL_TO"),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      contactPerson: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "contact_person",
      },
      contactNo: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "contact_no",
      },
      cnic: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      ntn: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      refNo: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "ref_no",
      },
      strn: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
    },
    {
      tableName: "bill_to_ship_to_records",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );
};
