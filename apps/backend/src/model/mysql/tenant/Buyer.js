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

  // Hook to update related invoices when buyer is updated
  Buyer.afterUpdate(async (buyer, options) => {
    try {
      // Access Invoice model from sequelize instance
      const Invoice = buyer.sequelize.models.Invoice;
      
      if (!Invoice) {
        console.warn('Invoice model not found in sequelize models');
        return;
      }
      
      // Get old values - try multiple ways Sequelize might store them
      const oldValues = buyer._oldValuesForHook || 
                       buyer._previousDataValues || 
                       buyer.previousValues || 
                       {};
      const oldBuyerNTNCNIC = oldValues.buyerNTNCNIC || buyer.buyerNTNCNIC;
      
      console.log(`[Buyer Hook] Old NTN/CNIC: ${oldBuyerNTNCNIC}, New NTN/CNIC: ${buyer.buyerNTNCNIC}`);
      
      // Find all invoices related to this buyer
      // Check by both buyer_id (for new invoices) and buyerNTNCNIC (both old and new for existing invoices)
      const { Op } = buyer.sequelize.Sequelize;
      const whereConditions = [
        { buyer_id: buyer.id }
      ];
      
      if (oldBuyerNTNCNIC) whereConditions.push({ buyerNTNCNIC: oldBuyerNTNCNIC });
      if (buyer.buyerNTNCNIC) whereConditions.push({ buyerNTNCNIC: buyer.buyerNTNCNIC });
      
      const relatedInvoices = await Invoice.findAll({
        where: {
          [Op.or]: whereConditions,
        },
        transaction: options.transaction,
      });
      
      console.log(`[Buyer Hook] Found ${relatedInvoices.length} invoice(s) to update for buyer ID ${buyer.id}`);

      // Update buyer information in all related invoices
      if (relatedInvoices.length > 0) {
        const updateData = {};
        
        // Only update fields that changed
        if (buyer.changed('buyerNTNCNIC')) {
          updateData.buyerNTNCNIC = buyer.buyerNTNCNIC;
        }
        if (buyer.changed('buyerBusinessName')) {
          updateData.buyerBusinessName = buyer.buyerBusinessName;
        }
        if (buyer.changed('buyerProvince')) {
          updateData.buyerProvince = buyer.buyerProvince;
        }
        if (buyer.changed('buyerAddress')) {
          updateData.buyerAddress = buyer.buyerAddress;
        }
        if (buyer.changed('buyerRegistrationType')) {
          updateData.buyerRegistrationType = buyer.buyerRegistrationType;
        }

        // Update all related invoices if any buyer data changed
        // Update invoices by both buyer_id and buyerNTNCNIC (old and new) to cover all cases
        if (Object.keys(updateData).length > 0) {
          const updateWhere = {
            [Op.or]: whereConditions,
          };
          
          const updateResult = await Invoice.update(updateData, {
            where: updateWhere,
            transaction: options.transaction,
          });
          
          console.log(`[Buyer Hook] Updated ${updateResult[0]} invoice(s) for buyer ID ${buyer.id}`);
          
          // Also update buyer_id for invoices that don't have it set yet (using both old and new NTN/CNIC)
          await Invoice.update(
            { buyer_id: buyer.id },
            {
              where: {
                [Op.or]: [
                  ...(oldBuyerNTNCNIC ? [{ buyerNTNCNIC: oldBuyerNTNCNIC, buyer_id: null }] : []),
                  ...(buyer.buyerNTNCNIC ? [{ buyerNTNCNIC: buyer.buyerNTNCNIC, buyer_id: null }] : [])
                ],
              },
              transaction: options.transaction,
            }
          );
          
          console.log(`[Buyer Hook] Successfully updated invoices for buyer ID ${buyer.id}`);
        }
      }
    } catch (error) {
      console.error('Error updating related invoices after buyer update:', error);
      // Don't throw error to prevent buyer update from failing
    }
  });

  return Buyer;
}; 