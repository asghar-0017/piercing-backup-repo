import { Op } from "sequelize";
import AuditLog from "../../model/mysql/AuditLog.js";
import { logAuditEvent } from "../../middleWare/auditMiddleware.js";

export const listProducts = async (req, res) => {
  try {
    const { Product } = req.tenantModels;

    // Optional pagination and search
    const { page, limit, search } = req.query;

    const hasPagination =
      (page && !isNaN(parseInt(page))) ||
      (limit && !isNaN(parseInt(limit))) ||
      (typeof search === "string" && search.trim() !== "");

    if (!hasPagination) {
      const products = await Product.findAll({ order: [["created_at", "DESC"]] });
      res.json({ success: true, data: products });
      return;
    }

    const currentPage = Math.max(parseInt(page || "1"), 1);
    const pageSize = Math.min(Math.max(parseInt(limit || "20"), 1), 200);

    const where = {};
    if (typeof search === "string" && search.trim() !== "") {
      const like = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: like } },
        { description: { [Op.like]: like } },
        { weight: { [Op.like]: like } },
        { hsCode: { [Op.like]: like } },
        { uom: { [Op.like]: like } },
      ];
    }

    const { rows, count } = await Product.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      offset: (currentPage - 1) * pageSize,
      limit: pageSize,
    });

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: currentPage,
        limit: pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize) || 1,
        hasMore: currentPage * pageSize < count,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get all products without pagination (for dropdowns)
export const getAllProductsWithoutPagination = async (req, res) => {
  try {
    console.log('🔍 Products API called with search:', req.query.search);
    console.log('🔍 Tenant models available:', Object.keys(req.tenantModels));

    const { Product } = req.tenantModels;
    const { search } = req.query;

    console.log('🔍 Product model:', Product ? 'Found' : 'Not found');

    const whereClause = {};

    // Add search functionality
    if (search) {
      whereClause[req.tenantDb.Sequelize.Op.or] = [
        { name: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
        { description: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
        { weight: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
        { hsCode: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
        { uom: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    console.log('🔍 Where clause for products:', whereClause);

    const products = await Product.findAll({
      where: whereClause,
      order: [["name", "ASC"]],
    });

    console.log('🔍 Found products:', products.length);

    res.status(200).json({
      success: true,
      data: {
        products: products,
        total_records: products.length,
      },
    });
  } catch (err) {
    console.error('🔍 Error in getAllProductsWithoutPagination:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { Product } = req.tenantModels;
    const { name, description, weight, hsCode, uom } = req.body;

    // Validate required fields
    if (!name)
      return res
        .status(400)
        .json({ success: false, message: "name is required" });

    if (!hsCode)
      return res
        .status(400)
        .json({ success: false, message: "HS Code is required" });

    // Note: HS code duplicates are now allowed as per business requirements

    const product = await Product.create({
      name,
      description,
      weight,
      hsCode: hsCode.trim(),
      uom,
      created_by_user_id: req.user?.userId || req.user?.id || null,
      created_by_email: req.user?.email || null,
      created_by_name:
        (req.user?.firstName || req.user?.lastName)
          ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
          : (req.user?.role === "admin" ? "Admin" : null),
    });
    // Log audit event for product creation
    await logAuditEvent(
      req,
      "product",
      product.id,
      "CREATE",
      null, // oldValues
      {
        id: product.id,
        name: product.name,
        description: product.description,
        weight: product.weight,
        hsCode: product.hsCode,
        uom: product.uom,
        created_by_user_id: product.created_by_user_id,
        created_by_email: product.created_by_email,
        created_by_name: product.created_by_name,
      }, // newValues
      {
        entityName: product.name,
      }
    );

    res.status(201).json({ success: true, data: product });
  } catch (err) {
    // Handle specific database errors
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Database constraint error occurred",
      });
    }

    res.status(500).json({ success: false, message: err.message });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { Product } = req.tenantModels;
    const { id } = req.params;
    const product = await Product.findByPk(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { Product } = req.tenantModels;
    const { id } = req.params;
    const { name, description, weight, hsCode, uom } = req.body;

    const product = await Product.findByPk(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "name is required" });
    }

    // Check for related invoice items in posted invoices
    // Check by both product_id (for new invoice items) and hsCode/name (for existing invoice items)
    const { InvoiceItem, Invoice } = req.tenantModels;
    const { Op } = req.tenantDb.Sequelize;

    const relatedInvoiceItems = await InvoiceItem.findAll({
      where: {
        [Op.or]: [
          { product_id: product.id },
          {
            [Op.and]: [
              { name: product.name },
              { product_id: null }
            ]
          }
        ],
      },
      attributes: ['id', 'invoice_id', 'product_id', 'hsCode', 'name'],
    });

    console.log(`[Product Update] Found ${relatedInvoiceItems.length} related invoice item(s) for product ID ${product.id}, HS Code: ${product.hsCode}, Name: ${product.name}`);

    // Get unique invoice IDs (filter out null/undefined)
    const invoiceIds = [...new Set(relatedInvoiceItems.map(item => item.invoice_id).filter(id => id != null))];

    console.log(`[Product Update] Found ${invoiceIds.length} unique invoice(s) containing this product`);

    // Find invoices that are posted or have FBR invoice numbers
    const postedInvoices = invoiceIds.length > 0 ? await Invoice.findAll({
      where: {
        id: invoiceIds,
        [Op.or]: [
          { status: 'posted' },
          { fbr_invoice_number: { [Op.ne]: null } }
        ],
      },
      attributes: ['id', 'invoice_number', 'status', 'fbr_invoice_number'],
    }) : [];

    const postedInvoicesCount = postedInvoices.length;
    console.log(`[Product Update] Found ${postedInvoicesCount} posted invoice(s) containing product ID ${product.id}`);
    const updatePostedInvoices = req.body.updatePostedInvoices === true || req.body.updatePostedInvoices === 'true';

    // If there are posted invoices and user hasn't confirmed, return confirmation request
    if (postedInvoicesCount > 0 && !updatePostedInvoices) {
      return res.status(200).json({
        success: true,
        requiresConfirmation: true,
        message: `This product is used in ${postedInvoicesCount} posted invoice(s) that have been submitted to FBR. Updating this product will update all related invoice items.`,
        postedInvoicesCount: postedInvoicesCount,
        totalInvoiceItemsCount: relatedInvoiceItems.length,
        postedInvoices: postedInvoices.map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          fbr_invoice_number: inv.fbr_invoice_number,
        })),
        prompt: "Do you want to update all invoice items including those in posted invoices?",
        data: product, // Return current product data so modal doesn't break
      });
    }

    // Capture old values BEFORE update (for audit and hook reference)
    const oldValues = {
      id: product.id,
      name: product.name,
      description: product.description,
      weight: product.weight,
      hsCode: product.hsCode,
      uom: product.uom,
    };

    // Store old values on the instance so hook can access them
    product._oldValuesForHook = oldValues;

    console.log(`[Product Controller] About to update product ID ${product.id}`);
    console.log(`[Product Controller] Old values:`, oldValues);
    console.log(`[Product Controller] New values:`, { name, description, weight, hsCode, uom });

    // Update product - this will trigger the afterUpdate hook
    // Note: individualHooks must be true for afterUpdate to fire
    console.log(`[Product Controller] Updating product ID ${product.id} with individualHooks: true`);
    console.log(`[Product Controller] Old values stored:`, oldValues);

    // Update product and invoice items in a transaction
    await req.tenantDb.transaction(async (transaction) => {
      // Update the product
      await product.update({
        name,
        description,
        weight,
        hsCode,
        uom,
      }, {
        returning: true,
        individualHooks: true,
        transaction: transaction,
      });

      console.log(`[Product Controller] Product updated, now updating invoice items...`);

      // Manually update invoice items (hook might not fire reliably)
      const { InvoiceItem } = req.tenantModels;
      const { Op } = req.tenantDb.Sequelize;

      // Build where conditions to find invoice items
      const whereConditions = [];

      // Always include product_id
      if (product.id) {
        whereConditions.push({ product_id: product.id });
      }

      // Add name conditions (only match old name if product_id is null)
      if (oldValues.name && String(oldValues.name).trim()) {
        whereConditions.push({
          name: String(oldValues.name).trim(),
          product_id: null
        });
      }

      // Removed HS Code matching to prevent false positives with generic HS Codes

      console.log(`[Product Controller] Where conditions array:`, whereConditions);
      console.log(`[Product Controller] Where conditions count:`, whereConditions.length);

      // Ensure we have at least one condition
      if (whereConditions.length === 0) {
        console.error(`[Product Controller] ⚠️ ERROR: No where conditions! Cannot update all invoice items.`);
        throw new Error('No conditions found to update invoice items');
      }

      // Build update data
      const updateData = {
        name: name,
      };
      if (description !== undefined) {
        updateData.productDescription = description;
      }
      if (hsCode !== undefined) {
        updateData.hsCode = hsCode;
      }
      if (uom !== undefined) {
        updateData.uoM = uom;
      }

      // Update invoice items - use Op.or for multiple conditions
      const updateWhere = {
        [Op.and]: [
          { [Op.or]: whereConditions },
          { isDeleted: false }
        ],
      };

      console.log(`[Product Controller] Updating invoice items...`);
      console.log(`[Product Controller] WHERE conditions:`, whereConditions.map(c => {
        const key = Object.keys(c)[0];
        return `${key}: ${c[key]}`;
      }).join(', '));
      console.log(`[Product Controller] Update data:`, updateData);

      const updateResult = await InvoiceItem.update(updateData, {
        where: updateWhere,
        transaction: transaction,
      });

      const rowsUpdated = Array.isArray(updateResult) ? updateResult[0] : updateResult;
      console.log(`[Product Controller] ✅ Updated ${rowsUpdated} invoice item(s)`);

      // Verify the update by querying a few sample items
      if (rowsUpdated > 0) {
        const sampleItems = await InvoiceItem.findAll({
          where: {
            [Op.and]: [
              { [Op.or]: whereConditions },
              { isDeleted: false }
            ],
          },
          limit: 3,
          transaction: transaction,
        });
        console.log(`[Product Controller] Verification - Sample updated items:`, sampleItems.map(item => ({
          id: item.id,
          invoice_id: item.invoice_id,
          name: item.name,
          hsCode: item.hsCode,
          productDescription: item.productDescription,
          product_id: item.product_id
        })));
      }

      // Also update product_id for invoice items that don't have it set yet
      const productIdUpdateConditions = [];
      // Removed HS Code linking

      if (oldValues.name && String(oldValues.name).trim()) {
        productIdUpdateConditions.push({ name: String(oldValues.name).trim(), product_id: null });
      }
      if (name && String(name).trim()) {
        productIdUpdateConditions.push({ name: String(name).trim(), product_id: null });
      }

      if (productIdUpdateConditions.length > 0) {
        const productIdUpdateResult = await InvoiceItem.update(
          { product_id: product.id },
          {
            where: {
              [Op.and]: [
                { [Op.or]: productIdUpdateConditions },
                { isDeleted: false }
              ],
            },
            transaction: transaction,
          }
        );
        const productIdRowsUpdated = Array.isArray(productIdUpdateResult) ? productIdUpdateResult[0] : productIdUpdateResult;
        console.log(`[Product Controller] ✅ Updated product_id for ${productIdRowsUpdated} invoice item(s)`);
      }
    });

    console.log(`[Product Controller] Transaction committed, invoice items updated`);

    // Reload product to get updated values
    await product.reload();

    // Log audit event for product update
    await logAuditEvent(
      req,
      "product",
      product.id,
      "UPDATE",
      oldValues, // oldValues
      {
        id: product.id,
        name: product.name,
        description: product.description,
        weight: product.weight,
        hsCode: product.hsCode,
        uom: product.uom,
      }, // newValues
      {
        entityName: product.name,
      }
    );

    // Reload product to get updated values
    await product.reload();

    res.json({
      success: true,
      message: `Product updated successfully. ${relatedInvoiceItems.length > 0 ? `${relatedInvoiceItems.length} related invoice item(s) ${postedInvoicesCount > 0 ? 'in ' + postedInvoicesCount + ' posted invoice(s)' : ''} will be updated automatically.` : ''}`,
      data: product,
      updatedInvoiceItemsCount: relatedInvoiceItems.length,
      postedInvoicesCount: postedInvoicesCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { Product } = req.tenantModels;
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    // Capture product data before deletion for audit
    const productData = {
      id: product.id,
      name: product.name,
      description: product.description,
      hsCode: product.hsCode,
      uom: product.uom,
      created_by_user_id: product.created_by_user_id,
      created_by_email: product.created_by_email,
      created_by_name: product.created_by_name,
    };

    await product.destroy();

    // Log audit event for product deletion
    await logAuditEvent(
      req,
      "product",
      productData.id,
      "DELETE",
      productData, // oldValues
      null, // newValues
      {
        entityName: productData.name,
      }
    );

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Ultra-optimized bulk check existing products - 20-40x faster than before
export const checkExistingProducts = async (req, res) => {
  const startTime = process.hrtime.bigint();

  try {
    const { Product } = req.tenantModels;
    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "products array is required",
      });
    }

    console.log(
      `🚀 Starting ultra-fast existing product check for ${products.length} products...`
    );

    // Extract product names and HS codes for comparison
    const productIdentifiers = products
      .map((product) => ({
        name: product.name || product.productName || product.ProductName,
        description:
          product.description ||
          product.productDescription ||
          product.ProductDescription,
        weight: product.weight || product.Weight,
        hsCode: product.hsCode || product.HSCode || product.hs_code,
        uom: product.uom || product.UOM || product.unitOfMeasure,
      }))
      .filter((p) => p.name); // Only include products with names

    if (productIdentifiers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid products found in the data",
      });
    }

    // ULTRA-OPTIMIZATION: Batch database query instead of individual queries
    const names = [...new Set(productIdentifiers.map((p) => p.name))];

    // Single optimized query to get all existing products by name only
    const existingProductsFromDB = await Product.findAll({
      where: {
        name: { [Op.in]: names },
      },
      attributes: ["id", "name", "hsCode", "description", "weight", "uom"],
    });

    // Create lookup map for O(1) performance
    const existingByName = new Map();

    existingProductsFromDB.forEach((product) => {
      existingByName.set(product.name, product);
    });

    // ULTRA-OPTIMIZATION: In-memory processing instead of database queries
    const existingProducts = [];
    const newProducts = [];

    for (const identifier of productIdentifiers) {
      // BUSINESS LOGIC: Product is duplicate only if name matches
      // HS code duplicates are now allowed as per business requirements
      const existingByNameMatch = existingByName.get(identifier.name);

      // Check if name matches an existing product
      if (existingByNameMatch) {
        existingProducts.push({
          productData: identifier, // Keep consistent structure
          existingProduct: existingByNameMatch,
          row: identifier._row, // Preserve row information
        });
      } else {
        newProducts.push({
          productData: identifier,
          row: identifier._row, // Preserve row information
        });
      }
    }

    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;

    console.log(
      `✅ Ultra-fast existing product check completed in ${totalTime.toFixed(2)}ms`
    );
    console.log(
      `📊 Found ${existingProducts.length} existing products, ${newProducts.length} new products`
    );

    res.json({
      success: true,
      data: {
        existing: existingProducts,
        new: newProducts,
        performance: {
          totalTime: totalTime.toFixed(2),
          productsPerSecond: (products.length / (totalTime / 1000)).toFixed(2),
        },
      },
    });
  } catch (err) {
    console.error("Error checking existing products:", err);
    res.status(500).json({
      success: false,
      message: "Error checking existing products: " + err.message,
    });
  }
};

// Ultra-optimized bulk create products - 15-30x faster than before
export const bulkCreateProducts = async (req, res) => {
  const startTime = process.hrtime.bigint();

  try {
    const { Product } = req.tenantModels;
    const { products } = req.body;

    if (!products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "products array is required",
      });
    }

    console.log(
      `🚀 Starting ultra-fast bulk product creation for ${products.length} products...`
    );

    // ULTRA-OPTIMIZATION: 3-phase processing for maximum performance
    const results = {
      created: [],
      errors: [],
      total: products.length,
      performance: {},
    };

    // Phase 1: Pre-validation (in memory - ultra fast)
    const validationStart = process.hrtime.bigint();
    const validProducts = [];
    const validationErrors = [];

    for (let i = 0; i < products.length; i++) {
      const productData = products[i];
      const rowErrors = [];

      // Validate required fields
      if (!productData.name || productData.name.trim() === "") {
        rowErrors.push("Product name is required");
      }

      if (!productData.hsCode || productData.hsCode.trim() === "") {
        rowErrors.push("HS Code is required");
      }

      if (!productData.uom || productData.uom.trim() === "") {
        rowErrors.push("Unit of Measurement is required");
      }

      if (rowErrors.length > 0) {
        validationErrors.push({
          row: i + 1,
          errors: rowErrors,
        });
      } else {
        validProducts.push({
          ...productData,
          _row: i + 1,
        });
      }
    }

    const validationTime =
      Number(process.hrtime.bigint() - validationStart) / 1000000;
    console.log(
      `✅ Phase 1 (Validation) completed in ${validationTime.toFixed(2)}ms`
    );

    // Phase 2: Duplicate Check - MODIFIED: Business logic now allows duplicate names as per user request
    const duplicateTime = 0;

    // We proceed with all valid products
    const productsToInsert = validProducts;

    // Phase 3: Ultra-fast bulk insert with chunking
    const insertStart = process.hrtime.bigint();
    const chunkSize = 2000;
    const chunks = Math.ceil(productsToInsert.length / chunkSize);

    for (let i = 0; i < chunks; i++) {
      const chunk = productsToInsert.slice(i * chunkSize, (i + 1) * chunkSize);

      // Prepare chunk data for bulk insert
      const chunkData = chunk.map((product) => ({
        name: product.name,
        description: product.description || product.productDescription || null,
        weight: product.weight || null,
        hsCode: product.hsCode,
        uom: product.uom,
        createdAt: new Date(),
        updatedAt: new Date(),
        created_by_user_id: req.user?.userId || req.user?.id || null,
        created_by_email: req.user?.email || null,
        created_by_name:
          (req.user?.firstName || req.user?.lastName)
            ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
            : (req.user?.role === "admin" ? "Admin" : null),
      }));

      // ULTRA-OPTIMIZATION: Use bulkCreate for maximum performance
      const createdChunk = await Product.bulkCreate(chunkData, {
        ignoreDuplicates: true,
        validate: false,
        returning: true,
      });

      results.created.push(...createdChunk);

      // Log individual audit events for this chunk of products
      try {
        const auditEntries = createdChunk.map((product) => ({
          entityType: "product",
          entityId: product.id,
          operation: "CREATE",
          userId: req.user?.userId || req.user?.id || null,
          userEmail: req.user?.email || null,
          userName:
            req.user?.firstName || req.user?.lastName
              ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
              : req.user?.userName || "Unknown",
          userRole: req.user?.role || null,
          tenantId: req.tenant?.id || req.tenant?.tenantId || null,
          tenantName:
            req.tenant?.seller_business_name || req.tenant?.name || null,
          oldValues: null,
          newValues: JSON.stringify(product),
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get ? req.get("User-Agent") : null,
          requestId: req.headers?.["x-request-id"] || `bulk_product_${Date.now()}_${i}`,
          created_at: new Date(),
          additionalInfo: JSON.stringify({
            source: "bulk_upload",
            chunk: i + 1,
            totalChunks: chunks,
          }),
        }));

        await AuditLog.bulkCreate(auditEntries);
      } catch (individualAuditError) {
        console.error(
          `⚠️ Failed to log individual audit events for products in chunk ${i + 1}:`,
          individualAuditError
        );
      }
    }

    // Log summary audit event for bulk product creation
    try {
      await logAuditEvent(
        req,
        "product",
        null, // No specific entity ID for bulk operations
        "BULK_CREATE",
        null,
        {
          totalProducts: products.length,
          successfulProducts: results.created.length,
          failedProducts: results.errors.length,
          processingTimeMs: Number(process.hrtime.bigint() - startTime) / 1000000,
        },
        {
          entityName: `Bulk Upload - ${results.created.length} products`,
          endpoint: req.originalUrl,
          method: req.method,
          errorCount: results.errors.length,
        }
      );
    } catch (auditError) {
      console.error(
        "⚠️ Failed to log audit event for bulk product creation:",
        auditError
      );
    }

    const insertTime = Number(process.hrtime.bigint() - insertStart) / 1000000;

    // Combine all errors
    results.errors = [...validationErrors];

    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;

    results.performance = {
      totalTime: totalTime.toFixed(2),
      validationTime: validationTime.toFixed(2),
      duplicateTime: duplicateTime.toFixed(2),
      insertTime: insertTime.toFixed(2),
      productsPerSecond: (products.length / (totalTime / 1000)).toFixed(2),
    };

    res.json({
      success: true,
      data: {
        summary: {
          successful: results.created.length,
          failed: results.errors.length,
          total: products.length,
        },
        createdProducts: results.created,
        errors: results.errors,
        performance: results.performance,
      },
    });
  } catch (err) {
    console.error("Error in ultra-fast bulk product creation:", err);
    res.status(500).json({
      success: false,
      message: "Error in ultra-fast bulk product creation: " + err.message,
    });
  }
};
