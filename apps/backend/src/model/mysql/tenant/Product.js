import { DataTypes } from "sequelize";

export const createProductModel = (sequelize) => {
  return sequelize.define(
    "Product",
    {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      hsCode: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      uom: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      // Creator tracking
      created_by_user_id: {
        type: DataTypes.BIGINT,
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
      tableName: "products",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  // Hook to update related invoice items when product is updated
  Product.afterUpdate(async (product, options) => {
    console.log(`[Product Hook] ===== HOOK TRIGGERED for Product ID: ${product.id} =====`);
    
    try {
      // Access InvoiceItem model from sequelize instance
      const InvoiceItem = product.sequelize.models.InvoiceItem;
      
      if (!InvoiceItem) {
        console.warn('[Product Hook] InvoiceItem model not found in sequelize models');
        return;
      }
      
      const { Op } = product.sequelize.Sequelize;
      
      // Get old values - try multiple ways Sequelize might store them
      const oldValues = product._oldValuesForHook || 
                       product._previousDataValues || 
                       product.previousValues || 
                       {};
      const oldName = oldValues.name || product.name;
      const oldHsCode = oldValues.hsCode || product.hsCode;
      
      console.log(`[Product Hook] Old values - Name: "${oldName}", HS Code: "${oldHsCode}"`);
      console.log(`[Product Hook] New values - Name: "${product.name}", HS Code: "${product.hsCode}"`);
      
      // Build where clause to find invoice items by:
      // 1. product_id (for items with FK set)
      // 2. OLD hsCode (in case hsCode changed)
      // 3. NEW hsCode (for items that might have been updated)
      // 4. OLD name (in case name changed)
      // 5. NEW name (for items that might have been updated)
      const whereConditions = [];
      
      // Always try product_id first
      if (product.id) {
        whereConditions.push({ product_id: product.id });
      }
      
      // Add name and hsCode conditions (both old and new)
      if (oldName && String(oldName).trim()) {
        whereConditions.push({ name: String(oldName).trim() });
      }
      if (product.name && String(product.name).trim()) {
        whereConditions.push({ name: String(product.name).trim() });
      }
      if (oldHsCode && String(oldHsCode).trim()) {
        whereConditions.push({ hsCode: String(oldHsCode).trim() });
      }
      if (product.hsCode && String(product.hsCode).trim()) {
        whereConditions.push({ hsCode: String(product.hsCode).trim() });
      }
      
      console.log(`[Product Hook] Search conditions:`, JSON.stringify(whereConditions, null, 2));
      
      // Build find options - exclude deleted items
      const findOptions = {
        where: {
          [Op.and]: [
            { [Op.or]: whereConditions },
            { isDeleted: false }
          ],
        },
      };
      
      // Add transaction only if it exists
      if (options && options.transaction) {
        findOptions.transaction = options.transaction;
      }
      
      // Find all invoice items related to this product (using both old and new values)
      let relatedInvoiceItems = await InvoiceItem.findAll(findOptions);

      console.log(`[Product Hook] Found ${relatedInvoiceItems.length} invoice item(s) with initial search`);
      
      // If no items found, try searching by name/hsCode only (in case product_id isn't set)
      if (relatedInvoiceItems.length === 0) {
        console.log(`[Product Hook] No items found with product_id, trying search by name/hsCode only...`);
        
        const nameHsCodeConditions = [];
        if (oldName && String(oldName).trim()) {
          nameHsCodeConditions.push({ name: String(oldName).trim() });
        }
        if (product.name && String(product.name).trim()) {
          nameHsCodeConditions.push({ name: String(product.name).trim() });
        }
        if (oldHsCode && String(oldHsCode).trim()) {
          nameHsCodeConditions.push({ hsCode: String(oldHsCode).trim() });
        }
        if (product.hsCode && String(product.hsCode).trim()) {
          nameHsCodeConditions.push({ hsCode: String(product.hsCode).trim() });
        }
        
        if (nameHsCodeConditions.length > 0) {
          const fallbackFindOptions = {
            where: {
              [Op.and]: [
                { [Op.or]: nameHsCodeConditions },
                { isDeleted: false }
              ],
            },
          };
          
          if (options && options.transaction) {
            fallbackFindOptions.transaction = options.transaction;
          }
          
          relatedInvoiceItems = await InvoiceItem.findAll(fallbackFindOptions);
          console.log(`[Product Hook] Found ${relatedInvoiceItems.length} invoice item(s) with fallback search`);
        }
      }
      
      // Log sample items for debugging
      if (relatedInvoiceItems.length > 0) {
        console.log(`[Product Hook] Sample items:`, relatedInvoiceItems.slice(0, 3).map(item => ({
          id: item.id,
          invoice_id: item.invoice_id,
          product_id: item.product_id,
          name: item.name,
          hsCode: item.hsCode
        })));
      } else {
        console.log(`[Product Hook] ⚠️ WARNING: No invoice items found!`);
        console.log(`[Product Hook] Product - Name: "${product.name}", HS Code: "${product.hsCode}"`);
        console.log(`[Product Hook] Old - Name: "${oldName}", HS Code: "${oldHsCode}"`);
      }

      // Update product information in all related invoice items
      // Always try to update even if no items found (in case search criteria is wrong)
      if (relatedInvoiceItems.length > 0 || whereConditions.length > 0) {
        const updateData = {};
        
        // Always update with new values (don't check changed() because we want to sync all fields)
        updateData.name = product.name;
        if (product.description !== undefined) {
          updateData.productDescription = product.description;
        }
        if (product.hsCode !== undefined) {
          updateData.hsCode = product.hsCode;
        }
        if (product.uom !== undefined) {
          updateData.uoM = product.uom;
        }

        // Update all related invoice items
        if (Object.keys(updateData).length > 0) {
          // Use the same conditions that found the items for the update
          const updateWhere = {
            [Op.and]: [
              { [Op.or]: whereConditions },
              { isDeleted: false }
            ],
          };
          
          console.log(`[Product Hook] Executing update with where:`, JSON.stringify(updateWhere, null, 2));
          console.log(`[Product Hook] Update data:`, JSON.stringify(updateData, null, 2));
          
          // Build update options
          const updateOptions = {
            where: updateWhere,
          };
          
          // Add transaction only if it exists
          if (options && options.transaction) {
            updateOptions.transaction = options.transaction;
          }
          
          console.log(`[Product Hook] About to execute InvoiceItem.update()...`);
          
          try {
            const updateResult = await InvoiceItem.update(updateData, updateOptions);
            
            const rowsUpdated = Array.isArray(updateResult) ? updateResult[0] : updateResult;
            console.log(`[Product Hook] ✅ Update executed! Result:`, updateResult);
            console.log(`[Product Hook] ✅ Updated ${rowsUpdated} invoice item(s) for product ID ${product.id}`);
            
            // Verify the update by querying a sample
            if (rowsUpdated > 0) {
              const verifyOptions = {
                where: {
                  [Op.and]: [
                    { [Op.or]: whereConditions },
                    { isDeleted: false }
                  ],
                },
                limit: 3,
              };
              
              if (options && options.transaction) {
                verifyOptions.transaction = options.transaction;
              }
              
              const sampleItems = await InvoiceItem.findAll(verifyOptions);
              console.log(`[Product Hook] Verification - Sample updated items:`, sampleItems.map(item => ({
                id: item.id,
                name: item.name,
                hsCode: item.hsCode,
                uoM: item.uoM,
                product_id: item.product_id
              })));
            } else {
              console.log(`[Product Hook] ⚠️ WARNING: Update returned 0 rows!`);
              console.log(`[Product Hook] This might mean WHERE conditions didn't match any rows.`);
              console.log(`[Product Hook] WHERE clause:`, JSON.stringify(updateWhere, null, 2));
              console.log(`[Product Hook] Found ${relatedInvoiceItems.length} items but update affected 0 rows`);
            }
          } catch (updateError) {
            console.error(`[Product Hook] ❌ ERROR during InvoiceItem.update():`, updateError);
            console.error(`[Product Hook] Error details:`, {
              message: updateError.message,
              stack: updateError.stack,
              where: updateWhere,
              data: updateData
            });
            throw updateError; // Re-throw to see the error
          }
          
          // Also update product_id for invoice items that don't have it set yet
          const productIdUpdateConditions = [];
          if (oldHsCode && String(oldHsCode).trim()) {
            productIdUpdateConditions.push({ hsCode: String(oldHsCode).trim(), product_id: null });
          }
          if (product.hsCode && String(product.hsCode).trim()) {
            productIdUpdateConditions.push({ hsCode: String(product.hsCode).trim(), product_id: null });
          }
          if (oldName && String(oldName).trim()) {
            productIdUpdateConditions.push({ name: String(oldName).trim(), product_id: null });
          }
          if (product.name && String(product.name).trim()) {
            productIdUpdateConditions.push({ name: String(product.name).trim(), product_id: null });
          }
          
          if (productIdUpdateConditions.length > 0) {
            const productIdUpdateOptions = {
              where: {
                [Op.and]: [
                  { [Op.or]: productIdUpdateConditions },
                  { isDeleted: false }
                ],
              },
            };
            
            // Add transaction only if it exists
            if (options && options.transaction) {
              productIdUpdateOptions.transaction = options.transaction;
            }
            
            const productIdUpdateResult = await InvoiceItem.update(
              { product_id: product.id },
              productIdUpdateOptions
            );
            const productIdRowsUpdated = Array.isArray(productIdUpdateResult) ? productIdUpdateResult[0] : productIdUpdateResult;
            console.log(`[Product Hook] ✅ Updated product_id for ${productIdRowsUpdated} invoice item(s)`);
          }
          
          console.log(`[Product Hook] ✅ Successfully completed update for product ID ${product.id}`);
        } else {
          console.log(`[Product Hook] ⚠️ No update data to apply`);
        }
      } else {
        console.log(`[Product Hook] No invoice items found to update for product ID ${product.id}`);
      }
    } catch (error) {
      console.error('[Product Hook] Error updating related invoice items after product update:', error);
      console.error('[Product Hook] Error stack:', error.stack);
      // Don't throw error to prevent product update from failing
    }
  });

  return Product;
};
