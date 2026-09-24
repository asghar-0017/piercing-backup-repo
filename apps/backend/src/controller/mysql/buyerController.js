// Buyer controller for multi-tenant MySQL system
// This controller uses req.tenantModels.Buyer from tenant middleware

import AuditLog from "../../model/mysql/AuditLog.js";

import { logAuditEvent } from "../../middleWare/auditMiddleware.js";

// Create new buyer
export const createBuyer = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const {
      buyerNTNCNIC,
      buyerBusinessName,
      buyerProvince,
      buyerAddress,
      buyerRegistrationType,
      buyerPhoneNumber,
    } = req.body;

    // Validate required fields
    if (!buyerProvince || !buyerRegistrationType) {
      return res.status(400).json({
        success: false,
        message: "Buyer province and registration type are required",
      });
    }

    // Validate NTN/CNIC length
    if (buyerNTNCNIC) {
      const trimmedNTNCNIC = buyerNTNCNIC.trim();
      if (trimmedNTNCNIC.length === 13) {
        // CNIC: exactly 13 digits
        if (!/^\d{13}$/.test(trimmedNTNCNIC)) {
          return res.status(400).json({
            success: false,
            message: "CNIC must contain exactly 13 digits.",
          });
        }
      } else if (trimmedNTNCNIC.length === 7) {
        // NTN: exactly 7 alphanumeric characters
        if (!/^[a-zA-Z0-9]{7}$/.test(trimmedNTNCNIC)) {
          return res.status(400).json({
            success: false,
            message: "NTN must contain exactly 7 alphanumeric characters.",
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "NTN must be 7 characters or CNIC must be 13 characters long.",
        });
      }
    }

    // Normalize province to uppercase for consistency
    const normalizeProvince = (province) => {
      const provinceMap = {
        Punjab: "PUNJAB",
        Sindh: "SINDH",
        "Khyber Pakhtunkhwa": "KHYBER PAKHTUNKHWA",
        Balochistan: "BALOCHISTAN",
        "Capital Territory": "CAPITAL TERRITORY",
        "Gilgit Baltistan": "GILGIT BALTISTAN",
        "Azad Jammu and Kashmir": "AZAD JAMMU AND KASHMIR",
        // Also handle any mixed case variations
        punjab: "PUNJAB",
        sindh: "SINDH",
        "khyber pakhtunkhwa": "KHYBER PAKHTUNKHWA",
        balochistan: "BALOCHISTAN",
        "capital territory": "CAPITAL TERRITORY",
        "gilgit baltistan": "GILGIT BALTISTAN",
        "azad jammu and kashmir": "AZAD JAMMU AND KASHMIR",
      };
      const trimmedProvince = province.trim();
      return provinceMap[trimmedProvince] || trimmedProvince.toUpperCase();
    };

    const normalizedProvince = normalizeProvince(buyerProvince);

    // Check if buyer with same ID already exists (if ID is provided)
    const buyerId = req.body.id || req.body.buyerId;
    if (buyerId) {
      const existingBuyer = await Buyer.findByPk(buyerId);
      if (existingBuyer) {
        return res.status(409).json({
          success: false,
          message: `Buyer with ID "${buyerId}" already exists.`,
        });
      }
    }

    // Create buyer
    const buyer = await Buyer.create({
      buyerNTNCNIC,
      buyerBusinessName,
      buyerProvince: normalizedProvince,
      buyerAddress,
      buyerRegistrationType,
      buyerPhoneNumber,
      created_by_user_id: req.user?.userId || req.user?.id || null,
      created_by_email: req.user?.email || null,
      created_by_name:
        (req.user?.firstName || req.user?.lastName)
          ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
          : (req.user?.role === "admin" ? `Admin (${req.user?.id || req.user?.userId})` : null),
    });

    // Log audit event for buyer creation
    await logAuditEvent(
      req,
      "buyer",
      buyer.id,
      "CREATE",
      null, // oldValues
      {
        id: buyer.id,
        buyerNTNCNIC: buyer.buyerNTNCNIC,
        buyerBusinessName: buyer.buyerBusinessName,
        buyerProvince: buyer.buyerProvince,
        buyerAddress: buyer.buyerAddress,
        buyerRegistrationType: buyer.buyerRegistrationType,
        buyerPhoneNumber: buyer.buyerPhoneNumber,
        created_by_user_id: buyer.created_by_user_id,
        created_by_email: buyer.created_by_email,
        created_by_name: buyer.created_by_name,
      }, // newValues
      {
        entityName: buyer.buyerBusinessName || buyer.buyerNTNCNIC,
      }
    );

    res.status(201).json({
      success: true,
      message: "Buyer created successfully",
      data: buyer,
    });
  } catch (error) {
    console.error("Error creating buyer:", error);

    // Handle specific database errors
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map((e) => e.message),
      });
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Buyer with this ID already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating buyer",
      error: error.message,
    });
  }
};

// Get all buyers
export const getAllBuyers = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const { page = 1, limit = 10, search } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = {};

    // Add search functionality
    if (search) {
      whereClause[req.tenantDb.Sequelize.Op.or] = [
        { buyerNTNCNIC: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
        {
          buyerBusinessName: {
            [req.tenantDb.Sequelize.Op.like]: `%${search}%`,
          },
        },
        { buyerProvince: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Buyer.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["created_at", "DESC"]],
    });

    res.status(200).json({
      success: true,
      data: {
        buyers: rows,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_records: count,
          records_per_page: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error getting buyers:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving buyers",
      error: error.message,
    });
  }
};

// Get all buyers without pagination (for dropdowns)
export const getAllBuyersWithoutPagination = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const { search } = req.query;

    const whereClause = {};

    // Add search functionality
    if (search) {
      whereClause[req.tenantDb.Sequelize.Op.or] = [
        { buyerNTNCNIC: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
        {
          buyerBusinessName: {
            [req.tenantDb.Sequelize.Op.like]: `%${search}%`,
          },
        },
        { buyerProvince: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },
      ];
    }

    const buyers = await Buyer.findAll({
      where: whereClause,
      order: [["buyerBusinessName", "ASC"]],
    });

    res.status(200).json({
      success: true,
      data: {
        buyers: buyers,
        total_records: buyers.length,
      },
    });
  } catch (error) {
    console.error("Error getting all buyers:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving buyers",
      error: error.message,
    });
  }
};

// Get buyer by ID
export const getBuyerById = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const { id } = req.params;

    const buyer = await Buyer.findByPk(id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: buyer,
    });
  } catch (error) {
    console.error("Error getting buyer:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving buyer",
      error: error.message,
    });
  }
};

// Update buyer
export const updateBuyer = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const { id } = req.params;
    const {
      buyerNTNCNIC,
      buyerBusinessName,
      buyerProvince,
      buyerAddress,
      buyerRegistrationType,
      buyerPhoneNumber,
    } = req.body;

    const buyer = await Buyer.findByPk(id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Validate NTN/CNIC length
    if (buyerNTNCNIC) {
      const trimmedNTNCNIC = buyerNTNCNIC.trim();
      if (trimmedNTNCNIC.length === 13) {
        // CNIC: exactly 13 digits
        if (!/^\d{13}$/.test(trimmedNTNCNIC)) {
          return res.status(400).json({
            success: false,
            message: "CNIC must contain exactly 13 digits.",
          });
        }
      } else if (trimmedNTNCNIC.length === 7) {
        // NTN: exactly 7 alphanumeric characters
        if (!/^[a-zA-Z0-9]{7}$/.test(trimmedNTNCNIC)) {
          return res.status(400).json({
            success: false,
            message: "NTN must contain exactly 7 alphanumeric characters.",
          });
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "NTN must be 7 characters or CNIC must be 13 characters long.",
        });
      }
    }

    // (NTN uniqueness check removed - multiple buyers can share the same NTN/CNIC)

    // Normalize province to uppercase for consistency
    const normalizeProvince = (province) => {
      const provinceMap = {
        Punjab: "PUNJAB",
        Sindh: "SINDH",
        "Khyber Pakhtunkhwa": "KHYBER PAKHTUNKHWA",
        Balochistan: "BALOCHISTAN",
        "Capital Territory": "CAPITAL TERRITORY",
        "Gilgit Baltistan": "GILGIT BALTISTAN",
        "Azad Jammu and Kashmir": "AZAD JAMMU AND KASHMIR",
        // Also handle any mixed case variations
        punjab: "PUNJAB",
        sindh: "SINDH",
        "khyber pakhtunkhwa": "KHYBER PAKHTUNKHWA",
        balochistan: "BALOCHISTAN",
        "capital territory": "CAPITAL TERRITORY",
        "gilgit baltistan": "GILGIT BALTISTAN",
        "azad jammu and kashmir": "AZAD JAMMU AND KASHMIR",
      };
      const trimmedProvince = province.trim();
      return provinceMap[trimmedProvince] || trimmedProvince.toUpperCase();
    };

    const normalizedProvince = normalizeProvince(buyerProvince);

    // Check for related invoices, especially posted ones
    // Check by both buyer_id (for new invoices) and buyerNTNCNIC (for existing invoices)
    const { Invoice } = req.tenantModels;
    const { Op } = req.tenantDb.Sequelize;

    const relatedInvoices = await Invoice.findAll({
      where: {
        [Op.or]: [
          { buyer_id: buyer.id },
          { buyerNTNCNIC: buyer.buyerNTNCNIC }
        ],
      },
      attributes: ['id', 'invoice_number', 'status', 'fbr_invoice_number', 'buyer_id', 'buyerNTNCNIC'],
    });

    console.log(`[Buyer Update] Found ${relatedInvoices.length} related invoice(s) for buyer ID ${buyer.id}, NTN/CNIC: ${buyer.buyerNTNCNIC}`);

    const postedInvoices = relatedInvoices.filter(inv => inv.status === 'posted' || inv.fbr_invoice_number);

    console.log(`[Buyer Update] Found ${postedInvoices.length} posted invoice(s) for buyer ID ${buyer.id}`);
    const updatePostedInvoices = req.body.updatePostedInvoices === true || req.body.updatePostedInvoices === 'true';

    // If there are posted invoices and user hasn't confirmed, return confirmation request
    if (postedInvoices.length > 0 && !updatePostedInvoices) {
      return res.status(200).json({
        success: true,
        requiresConfirmation: true,
        message: `This buyer is associated with ${postedInvoices.length} posted invoice(s) that have been submitted to FBR. Updating this buyer will update all related invoices.`,
        postedInvoicesCount: postedInvoices.length,
        totalInvoicesCount: relatedInvoices.length,
        postedInvoices: postedInvoices.map(inv => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          fbr_invoice_number: inv.fbr_invoice_number,
        })),
        prompt: "Do you want to update all invoices including posted ones?",
        data: buyer, // Return current buyer data so modal doesn't break
      });
    }

    // Capture old values BEFORE update (for audit and hook reference)
    const oldValues = {
      id: buyer.id,
      buyerNTNCNIC: buyer.buyerNTNCNIC,
      buyerBusinessName: buyer.buyerBusinessName,
      buyerProvince: buyer.buyerProvince,
      buyerAddress: buyer.buyerAddress,
      buyerRegistrationType: buyer.buyerRegistrationType,
      buyerPhoneNumber: buyer.buyerPhoneNumber,
    };

    // Store old values on the instance so hook can access them
    buyer._oldValuesForHook = oldValues;

    // Update buyer - this will trigger the afterUpdate hook
    await buyer.update({
      buyerNTNCNIC,
      buyerBusinessName,
      buyerProvince: normalizedProvince,
      buyerAddress,
      buyerRegistrationType,
      buyerPhoneNumber,
    }, {
      returning: true, // Ensure we get the updated instance
      individualHooks: true, // Ensure hooks are triggered
    });

    // Log audit event for buyer update
    await logAuditEvent(
      req,
      "buyer",
      buyer.id,
      "UPDATE",
      oldValues, // oldValues
      {
        id: buyer.id,
        buyerNTNCNIC: buyer.buyerNTNCNIC,
        buyerBusinessName: buyer.buyerBusinessName,
        buyerProvince: buyer.buyerProvince,
        buyerAddress: buyer.buyerAddress,
        buyerRegistrationType: buyer.buyerRegistrationType,
        buyerPhoneNumber: buyer.buyerPhoneNumber,
      }, // newValues
      {
        entityName: buyer.buyerBusinessName || buyer.buyerNTNCNIC,
      }
    );

    // Reload buyer to get updated values
    await buyer.reload();

    res.status(200).json({
      success: true,
      message: `Buyer updated successfully. ${relatedInvoices.length > 0 ? `${relatedInvoices.length} related invoice(s) ${postedInvoices.length > 0 ? '(including ' + postedInvoices.length + ' posted)' : ''} will be updated automatically.` : ''}`,
      data: buyer,
      updatedInvoicesCount: relatedInvoices.length,
      postedInvoicesCount: postedInvoices.length,
    });
  } catch (error) {
    console.error("Error updating buyer:", error);

    // Handle specific database errors
    if (error.name === "SequelizeValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: error.errors.map((e) => e.message),
      });
    }

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "Buyer with this ID already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error updating buyer",
      error: error.message,
    });
  }
};

// Delete buyer
export const deleteBuyer = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const { id } = req.params;

    const buyer = await Buyer.findByPk(id);

    if (!buyer) {
      return res.status(404).json({
        success: false,
        message: "Buyer not found",
      });
    }

    // Capture buyer data before deletion for audit
    const buyerData = {
      id: buyer.id,
      buyerNTNCNIC: buyer.buyerNTNCNIC,
      buyerBusinessName: buyer.buyerBusinessName,
      buyerProvince: buyer.buyerProvince,
      buyerAddress: buyer.buyerAddress,
      buyerRegistrationType: buyer.buyerRegistrationType,
      created_by_user_id: buyer.created_by_user_id,
      created_by_email: buyer.created_by_email,
      created_by_name: buyer.created_by_name,
    };

    await buyer.destroy();

    // Log audit event for buyer deletion
    await logAuditEvent(
      req,
      "buyer",
      buyerData.id,
      "DELETE",
      buyerData, // oldValues
      null, // newValues
      {
        entityName: buyerData.buyerBusinessName || buyerData.buyerNTNCNIC,
      }
    );

    res.status(200).json({
      success: true,
      message: "Buyer deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting buyer:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting buyer",
      error: error.message,
    });
  }
};

// Get buyers by province
export const getBuyersByProvince = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const { province } = req.params;

    const buyers = await Buyer.findAll({
      where: { buyerProvince: province },
      order: [["buyerBusinessName", "ASC"]],
    });

    res.status(200).json({
      success: true,
      data: buyers,
    });
  } catch (error) {
    console.error("Error getting buyers by province:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving buyers by province",
      error: error.message,
    });
  }
};

// Bulk create buyers - ULTRA OPTIMIZED VERSION
export const bulkCreateBuyers = async (req, res) => {
  const startTime = process.hrtime.bigint();

  try {
    const { Buyer } = req.tenantModels;
    const { buyers } = req.body;

    if (!Array.isArray(buyers) || buyers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Buyers array is required and must not be empty",
      });
    }

    const results = {
      created: [],
      errors: [],
      total: buyers.length,
    };

    // PHASE 1: Pre-validation (in memory - fastest)
    const validBuyers = [];
    const validationErrors = [];

    // Batch validation for maximum speed
    buyers.forEach((buyerData, index) => {
      const rowErrors = [];

      // Quick validation checks
      if (!buyerData.buyerProvince || !buyerData.buyerProvince.trim()) {
        rowErrors.push("Province is required");
      }

      if (
        !buyerData.buyerRegistrationType ||
        !buyerData.buyerRegistrationType.trim()
      ) {
        rowErrors.push("Registration Type is required");
      }

      // Province validation with Set for O(1) lookup
      const validProvinces = new Set([
        "Balochistan",
        "BALOCHISTAN",
        "balochistan",
        "Azad Jammu and Kashmir",
        "AZAD JAMMU AND KASHMIR",
        "azad jammu and kashmir",
        "Capital Territory",
        "CAPITAL TERRITORY",
        "capital territory",
        "Punjab",
        "PUNJAB",
        "punjab",
        "Khyber Pakhtunkhwa",
        "KHYBER PAKHTUNKHWA",
        "khyber pakhtunkhwa",
        "Gilgit Baltistan",
        "GILGIT BALTISTAN",
        "gilgit baltistan",
        "Sindh",
        "SINDH",
        "sindh",
      ]);

      if (
        buyerData.buyerProvince &&
        !validProvinces.has(buyerData.buyerProvince.trim())
      ) {
        rowErrors.push("Invalid province");
      }

      // Registration type validation
      const validTypes = new Set(["Registered", "Unregistered"]);
      if (
        buyerData.buyerRegistrationType &&
        !validTypes.has(buyerData.buyerRegistrationType.trim())
      ) {
        rowErrors.push(
          'Registration Type must be "Registered" or "Unregistered"'
        );
      }

      // NTN/CNIC format validation
      if (buyerData.buyerNTNCNIC && buyerData.buyerNTNCNIC.trim()) {
        const ntnCnic = buyerData.buyerNTNCNIC.trim();
        if (ntnCnic.length < 7 || ntnCnic.length > 15) {
          rowErrors.push("NTN/CNIC should be between 7-15 characters");
        }
      }

      if (rowErrors.length > 0) {
        validationErrors.push({
          index,
          row: index + 1,
          error: rowErrors.join(", "),
        });
      } else {
        validBuyers.push({
          ...buyerData,
          index,
          normalizedProvince: normalizeProvince(buyerData.buyerProvince),
        });
      }
    });

    // PHASE 2: Batch duplicate checking by ID (if IDs are provided)
    const buyerIdValues = validBuyers
      .map((buyer) => buyer.id || buyer.buyerId)
      .filter((id) => id !== undefined && id !== null && id !== "");

    let existingBuyers = [];
    if (buyerIdValues.length > 0) {
      existingBuyers = await Buyer.findAll({
        where: { id: buyerIdValues },
        attributes: ["id"],
        raw: true,
        benchmark: false,
        logging: false,
      });
    }

    const existingIdSet = new Set(existingBuyers.map((b) => String(b.id)));

    // Filter out existing buyers and duplicate IDs within batch
    const finalBuyers = [];
    const seenIDs = new Set();

    validBuyers.forEach((buyer) => {
      const ntnCnic = buyer.buyerNTNCNIC?.trim();
      const rawId = buyer.id || buyer.buyerId;
      const bId = rawId !== undefined && rawId !== null && rawId !== "" ? String(rawId) : null;

      if (bId) {
        if (existingIdSet.has(bId)) {
          results.errors.push({
            index: buyer.index,
            row: buyer.index + 1,
            error: `Buyer with ID "${bId}" already exists in database`,
          });
          return;
        }

        if (seenIDs.has(bId)) {
          results.errors.push({
            index: buyer.index,
            row: buyer.index + 1,
            error: `Duplicate Buyer ID "${bId}" found in upload file`,
          });
          return;
        }

        seenIDs.add(bId);
      }

      finalBuyers.push({
        ...(bId ? { id: bId } : {}),
        buyerNTNCNIC: ntnCnic || null,
        buyerBusinessName: buyer.buyerBusinessName?.trim() || null,
        buyerProvince: buyer.normalizedProvince,
        buyerAddress: buyer.buyerAddress?.trim() || null,
        buyerRegistrationType: buyer.buyerRegistrationType.trim(),
        buyerPhoneNumber: buyer.buyerPhoneNumber?.trim() || null,
        created_by_user_id: req.user?.userId || req.user?.id || null,
        created_by_email: req.user?.email || null,
        created_by_name:
          (req.user?.firstName || req.user?.lastName)
            ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
            : (req.user?.role === "admin" ? `Admin (${req.user?.id || req.user?.userId})` : null),
      });
    });

    // PHASE 3: Ultra-fast bulk insert with chunking
    if (finalBuyers.length > 0) {
      const chunkSize = 2000;
      const chunks = Math.ceil(finalBuyers.length / chunkSize);

      console.log(`Processing ${finalBuyers.length} buyers in ${chunks} chunks...`);

      // Reuse user validation for all chunks
      const userId = req.user?.userId || req.user?.id || null;
      let validatedUserId = null;

      if (userId) {
        try {
          const { default: User } = await import("../../model/mysql/User.js");
          const userExists = await User.findByPk(userId, {
            attributes: ['id'],
            raw: true,
          });
          if (userExists) validatedUserId = userId;
        } catch (e) { console.warn("User validation failed", e); }
      }

      for (let i = 0; i < chunks; i++) {
        const chunkData = finalBuyers.slice(i * chunkSize, (i + 1) * chunkSize);

        // Use bulkCreate with optimized settings
        const createdChunk = await Buyer.bulkCreate(chunkData, {
          validate: false,
          ignoreDuplicates: true,
          benchmark: false,
          logging: false,
          returning: true,
        });

        results.created.push(...createdChunk);

        // Log individual audit events for this chunk
        if (createdChunk.length > 0) {
          try {
            const auditEntries = createdChunk.map((buyer) => ({
              entityType: "buyer",
              entityId: buyer.id,
              operation: "CREATE",
              userId: validatedUserId,
              userEmail: req.user?.email || null,
              userName:
                req.user?.firstName || req.user?.lastName
                  ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
                  : req.user?.userName || req.user?.email || "Unknown",
              userRole: req.user?.role || null,
              tenantId: req.tenant?.id || req.tenant?.tenantId || null,
              tenantName:
                req.tenant?.seller_business_name || req.tenant?.name || null,
              oldValues: null,
              newValues: JSON.stringify(buyer),
              ipAddress: req.ip || req.connection?.remoteAddress,
              userAgent: req.get ? req.get("User-Agent") : null,
              requestId: req.headers?.["x-request-id"] || `bulk_buyer_${Date.now()}_${i}`,
              created_at: new Date(),
              additionalInfo: JSON.stringify({
                source: "bulk_upload",
                chunk: i + 1
              }),
            }));

            await AuditLog.bulkCreate(auditEntries);
          } catch (auditError) {
            console.error(`⚠️ Failed to log audits for buyer chunk ${i + 1}:`, auditError);
          }
        }
      }
    }

    // Add validation errors
    results.errors.push(...validationErrors);

    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.log(
      `🎉 ULTRA-OPTIMIZED bulk upload completed in ${totalTime.toFixed(2)}ms!`
    );
    console.log(
      `📊 Results: ${results.created.length} created, ${results.errors.length} errors`
    );

    res.status(200).json({
      success: true,
      message: `Ultra-optimized bulk upload completed in ${totalTime.toFixed(2)}ms. ${results.created.length} buyers created, ${results.errors.length} errors.`,
      data: {
        created: results.created,
        errors: results.errors,
        summary: {
          total: results.total,
          successful: results.created.length,
          failed: results.errors.length,
          processingTime: totalTime.toFixed(2) + "ms",
        },
      },
    });
  } catch (error) {
    console.error("Error in ultra-optimized bulk create buyers:", error);
    res.status(500).json({
      success: false,
      message: "Error processing ultra-optimized bulk buyer upload",
      error: error.message,
    });
  }
};

// Helper function for province normalization
const normalizeProvince = (province) => {
  const provinceMap = {
    Punjab: "PUNJAB",
    Sindh: "SINDH",
    "Khyber Pakhtunkhwa": "KHYBER PAKHTUNKHWA",
    Balochistan: "BALOCHISTAN",
    "Capital Territory": "CAPITAL TERRITORY",
    "Gilgit Baltistan": "GILGIT BALTISTAN",
    "Azad Jammu and Kashmir": "AZAD JAMMU AND KASHMIR",
    punjab: "PUNJAB",
    sindh: "SINDH",
    "khyber pakhtunkhwa": "KHYBER PAKHTUNKHWA",
    balochistan: "BALOCHISTAN",
    "capital territory": "CAPITAL TERRITORY",
    "gilgit baltistan": "GILGIT BALTISTAN",
    "azad jammu and kashmir": "AZAD JAMMU AND KASHMIR",
  };
  const trimmedProvince = province.trim();
  return provinceMap[trimmedProvince] || trimmedProvince.toUpperCase();
};

// Check existing buyers for preview
export const checkExistingBuyers = async (req, res) => {
  try {
    const { Buyer } = req.tenantModels;
    const { buyers } = req.body;

    if (!Array.isArray(buyers) || buyers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Buyers array is required and must not be empty",
      });
    }

    // No limit on the number of buyers that can be checked at once
    // Users can now check unlimited buyers

    const results = {
      existing: [],
      new: [],
      total: buyers.length,
    };

    // Extract all ID values for batch checking
    const buyerIdValues = buyers
      .map((buyer, index) => ({
        id: buyer.id || buyer.buyerId,
        index,
        buyerData: buyer,
      }))
      .filter((item) => item.id !== undefined && item.id !== null && item.id !== "");

    if (buyerIdValues.length > 0) {
      const existingBuyers = await Buyer.findAll({
        where: {
          id: buyerIdValues.map((item) => item.id),
        },
        attributes: ["id", "buyerNTNCNIC", "buyerBusinessName"],
        raw: true,
        benchmark: false,
        logging: false,
      });

      const existingIdSet = new Set(
        existingBuyers.map((buyer) => String(buyer.id))
      );

      // Categorize buyers
      buyers.forEach((buyer, index) => {
        const rawId = buyer.id || buyer.buyerId;
        const bId = rawId !== undefined && rawId !== null && rawId !== "" ? String(rawId) : null;

        if (bId && existingIdSet.has(bId)) {
          const existingBuyer = existingBuyers.find(
            (b) => String(b.id) === bId
          );
          results.existing.push({
            index,
            row: index + 1,
            buyerData: buyer,
            existingBuyer: {
              id: existingBuyer.id,
              buyerNTNCNIC: existingBuyer.buyerNTNCNIC,
              buyerBusinessName: existingBuyer.buyerBusinessName,
            },
          });
        } else {
          results.new.push({
            index,
            row: index + 1,
            buyerData: buyer,
          });
        }
      });
    } else {
      // If no buyer IDs provided (new buyers), all are considered new
      buyers.forEach((buyer, index) => {
        results.new.push({
          index,
          row: index + 1,
          buyerData: buyer,
        });
      });
    }

    res.status(200).json({
      success: true,
      data: {
        existing: results.existing,
        new: results.new,
        summary: {
          total: results.total,
          existing: results.existing.length,
          new: results.new.length,
        },
      },
    });
  } catch (error) {
    console.error("Error checking existing buyers:", error);
    res.status(500).json({
      success: false,
      message: "Error checking existing buyers",
      error: error.message,
    });
  }
};

// Bulk check FBR registration status for multiple buyers - ULTRA OPTIMIZED VERSION
export const bulkCheckFBRRegistration = async (req, res) => {
  const startTime = process.hrtime.bigint();

  try {
    const { buyers } = req.body;

    if (!Array.isArray(buyers) || buyers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Buyers array is required and must not be empty",
      });
    }

    console.log(
      `🚀 Starting ULTRA-OPTIMIZED FBR registration check for ${buyers.length} buyers...`
    );

    // Filter out buyers without NTN/CNIC
    const buyersWithNTN = buyers.filter(
      (buyer) => buyer.buyerNTNCNIC && buyer.buyerNTNCNIC.trim()
    );

    if (buyersWithNTN.length === 0) {
      console.log(
        "⚠️ No buyers with NTN/CNIC found, returning all as Unregistered"
      );
      const results = buyers.map((buyer) => ({
        ...buyer,
        buyerRegistrationType: "Unregistered",
      }));

      return res.status(200).json({
        success: true,
        data: {
          results,
          summary: {
            total: buyers.length,
            checked: 0,
            registered: 0,
            unregistered: buyers.length,
            processingTime: "0ms",
          },
        },
      });
    }

    // Process in moderate batches with controlled concurrency to avoid upstream throttling
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < buyersWithNTN.length; i += batchSize) {
      batches.push(buyersWithNTN.slice(i, i + batchSize));
    }

    console.log(
      `📦 Processing ${batches.length} batches of ${batchSize} buyers each...`
    );

    const results = [];
    const errors = [];

    // Concurrency-limited mapper
    const mapWithConcurrency = async (items, limit, iterator) => {
      const resultsLocal = new Array(items.length);
      let index = 0;
      const run = async () => {
        while (true) {
          const current = index++;
          if (current >= items.length) break;
          resultsLocal[current] = await iterator(items[current], current);
        }
      };
      const workers = Array.from({ length: Math.min(limit, items.length) }, run);
      await Promise.all(workers);
      return resultsLocal;
    };

    // Process batches sequentially to be gentle on the upstream service
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      try {
        console.log(
          `🔍 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} buyers) with limited concurrency...`
        );

        const batchResults = await mapWithConcurrency(batch, 10, async (buyer) => {
          try {
            const registrationType = await checkFBRRegistrationAPI(
              buyer.buyerNTNCNIC
            );
            return { ...buyer, buyerRegistrationType: registrationType };
          } catch (error) {
            console.error(`Error checking FBR for ${buyer.buyerNTNCNIC}:`, error);
            return { ...buyer, buyerRegistrationType: "Unregistered" };
          }
        });

        results.push(...batchResults);
        console.log(
          `✅ Batch ${batchIndex + 1} completed: ${batchResults.length} buyers processed`
        );
      } catch (batchError) {
        console.error(`❌ Batch ${batchIndex + 1} failed:`, batchError);
        errors.push(batchError);
        results.push(
          ...batch.map((buyer) => ({ ...buyer, buyerRegistrationType: "Unregistered" }))
        );
      }
    }

    // Add buyers without NTN/CNIC with default "Unregistered" status
    const buyersWithoutNTN = buyers.filter(
      (buyer) => !buyer.buyerNTNCNIC || !buyer.buyerNTNCNIC.trim()
    );

    const buyersWithoutNTNResults = buyersWithoutNTN.map((buyer) => ({
      ...buyer,
      buyerRegistrationType: "Unregistered",
    }));

    const finalResults = [...results, ...buyersWithoutNTNResults];

    const registeredCount = finalResults.filter(
      (buyer) => buyer.buyerRegistrationType === "Registered"
    ).length;

    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.log(
      `🎉 ULTRA-OPTIMIZED FBR registration check completed in ${totalTime.toFixed(2)}ms: ${registeredCount} registered, ${finalResults.length - registeredCount} unregistered`
    );

    res.status(200).json({
      success: true,
      data: {
        results: finalResults,
        summary: {
          total: buyers.length,
          checked: buyersWithNTN.length,
          registered: registeredCount,
          unregistered: finalResults.length - registeredCount,
          errors: errors.length,
          processingTime: totalTime.toFixed(2) + "ms",
        },
      },
    });
  } catch (error) {
    console.error(
      "Error in ultra-optimized bulk FBR registration check:",
      error
    );
    res.status(500).json({
      success: false,
      message: "Error processing ultra-optimized bulk FBR registration check",
      error: error.message,
    });
  }
};

// Helper function to check FBR registration status with retry logic
const checkFBRRegistrationAPI = async (registrationNo) => {
  if (!registrationNo || !registrationNo.trim()) {
    return "Unregistered";
  }

  const maxRetries = 2;
  const timeout = 12000; // 12 seconds timeout to reduce upstream timeouts
  const FBR_API_URL =
    "https://buyercheckapi.inplsoftwares.online/checkbuyer.php";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use axios with token (same as public proxy) and timeout
      const axios = (await import("axios")).default;
      const { data } = await axios.post(
        FBR_API_URL,
        {
          token: "89983e4a-c009-3f9b-bcd6-a605c3086709",
          registrationNo: registrationNo.trim(),
        },
        { headers: { "Content-Type": "application/json" }, timeout }
      );

      let derivedRegistrationType = "";
      if (data && typeof data.REGISTRATION_TYPE === "string") {
        derivedRegistrationType =
          data.REGISTRATION_TYPE.toLowerCase() === "registered"
            ? "Registered"
            : "Unregistered";
      } else {
        let isRegistered = false;
        if (typeof data === "boolean") {
          isRegistered = data;
        } else if (data) {
          isRegistered =
            data.isRegistered === true ||
            data.registered === true ||
            (typeof data.status === "string" &&
              data.status.toLowerCase() === "registered") ||
            (typeof data.registrationType === "string" &&
              data.registrationType.toLowerCase() === "registered");
        }
        derivedRegistrationType = isRegistered ? "Registered" : "Unregistered";
      }

      return derivedRegistrationType;
    } catch (error) {
      console.error(
        `Error checking FBR registration for ${registrationNo} (attempt ${attempt}/${maxRetries}):`,
        error
      );

      // If upstream returns 400 (invalid NTN/CNIC), don't retry further
      if (error?.response?.status === 400) {
        return "Unregistered";
      }

      if (attempt === maxRetries) {
        // Return "Unregistered" as default if all retries fail
        return "Unregistered";
      }

      // Wait before retry (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
};
