import { DataTypes } from 'sequelize';

// This will be used as a factory function to create Buyer model for each tenant
export const createBuyerModel = (sequelize) => {
  const Buyer = sequelize.define('Buyer', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    buyerNTNCNIC: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true, // Add unique constraint to prevent duplicate NTN
      validate: {
        len: [0, 50]
      }
    },
    buyerBusinessName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        len: [0, 255]
      }
    },
    buyerProvince: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100]
      }
    },
    buyerAddress: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    buyerRegistrationType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100]
      }
    },
    buyerPhoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      validate: {
        len: [0, 20]
      }
    },
    // Creator tracking
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
    }
  }, {
    tableName: 'buyers',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // Index on buyerBusinessName for business name searches
      {
        name: 'idx_buyer_business_name',
        fields: ['buyerBusinessName']
      }
      // Note: buyerNTNCNIC already has unique constraint from column definition
      // Note: Composite indexes can be added later if needed for performance
    ]
  });

  return Buyer;
}; 