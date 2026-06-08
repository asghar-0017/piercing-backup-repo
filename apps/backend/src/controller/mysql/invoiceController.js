import fs from "fs";

import path from "path";

import QRCode from "qrcode";

import ejs from "ejs";

import puppeteer from "puppeteer";

import { Sequelize, Op } from "sequelize";

import PerformanceOptimizationService from "../../service/PerformanceOptimizationService.js";
import DatabaseOptimizationService from "../../service/DatabaseOptimizationService.js";
import MemoryManagementService from "../../service/MemoryManagementService.js";

import numberToWords from "number-to-words";

import TenantDatabaseService from "../../service/TenantDatabaseService.js";

import Tenant from "../../model/mysql/Tenant.js";

import hsCodeCacheService from "../../service/HSCodeCacheService.js";
import { logAuditEvent } from "../../middleWare/auditMiddleware.js";
import InvoiceBackupService from "../../service/InvoiceBackupService.js";
import {
  validateInvoiceData,
  submitInvoiceData,
} from "../../service/FBRService.js";
import AuditLog from "../../model/mysql/AuditLog.js";

import auditRoutes from "../../routes/auditRoutes.js";
import AppError from "../../utils/AppError.js";
import catchAsync from "../../utils/catchAsync.js";
import { generateUniqueSourceInvoiceNo } from "../../utils/invoiceHelper.js";

const { toWords } = numberToWords;

// Helper function to generate system invoice ID

const generateSystemInvoiceId = async (Invoice) => {
  try {
    // Get the highest existing system invoice ID for this tenant

    const lastInvoice = await Invoice.findOne({
      where: {
        system_invoice_id: {
          [Invoice.sequelize.Sequelize.Op.like]: "INV-%",
        },
      },

      order: [
        [Invoice.sequelize.Sequelize.literal("CAST(SUBSTRING(system_invoice_id, 5) AS UNSIGNED)"), "DESC"]
      ],

      attributes: ["system_invoice_id"],
    });

    let nextNumber = 1;

    if (lastInvoice && lastInvoice.system_invoice_id) {
      // Extract the number from the last invoice ID (e.g., "INV-0005" -> 5)

      const match = lastInvoice.system_invoice_id.match(/INV-(\d+)/);

      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    // Format as INV-0001, INV-0002, etc.

    return `INV-${nextNumber.toString().padStart(4, "0")}`;
  } catch (error) {
    console.error("Error generating system invoice ID:", error);

    // Fallback to timestamp-based ID if there's an error

    return `INV-${Date.now().toString()}`;
  }
};

// Helper function to generate short 6-digit IDs for draft and saved invoices

const generateShortInvoiceId = async (Invoice, prefix) => {
  try {
    // Use a more robust approach to handle concurrent requests
    // First, try to get the current max number
    const lastInvoice = await Invoice.findOne({
      where: {
        invoice_number: {
          [Invoice.sequelize.Sequelize.Op.like]: `${prefix}_%`,
        },
      },
      order: [["invoice_number", "DESC"]],
      attributes: ["invoice_number"],
    });

    let nextNumber = 1;

    if (lastInvoice && lastInvoice.invoice_number) {
      // Extract the number from the last invoice ID (e.g., "SAVED_000011" -> 11)
      const match = lastInvoice.invoice_number.match(
        new RegExp(`${prefix}_(\\d+)`),
      );

      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    // Generate the new invoice ID with 6-digit padding
    const newInvoiceId = `${prefix}_${nextNumber.toString().padStart(6, "0")}`;

    // Check if this ID already exists (race condition protection)
    const existingInvoice = await Invoice.findOne({
      where: {
        invoice_number: newInvoiceId,
      },
      attributes: ["id"],
    });

    if (existingInvoice) {
      // If it exists, increment and try again
      nextNumber += 1;
      const retryInvoiceId = `${prefix}_${nextNumber.toString().padStart(6, "0")}`;
      return retryInvoiceId;
    }

    return newInvoiceId;
  } catch (error) {
    console.error(`Error generating short ${prefix} invoice ID:`, error);

    // Fallback to timestamp-based ID if database query fails
    const timestamp = Date.now().toString();
    return `${prefix}_${timestamp}`;
  }
};

// Helper to check if companyInvoiceRefNo already exists (supports excluding current record on update)
const checkCompanyInvoiceRefNoUniqueness = async (Invoice, companyInvoiceRefNo, excludeId = null) => {
  if (!companyInvoiceRefNo || !String(companyInvoiceRefNo).trim()) return null;
  const where = {
    companyInvoiceRefNo: String(companyInvoiceRefNo).trim(),
    isDeleted: { [Invoice.sequelize.Sequelize.Op.not]: true },
  };
  if (excludeId) {
    where.id = { [Invoice.sequelize.Sequelize.Op.ne]: excludeId };
  }
  const existing = await Invoice.findOne({ where, attributes: ["id", "companyInvoiceRefNo"] });
  return existing || null;
};

export const createInvoice = catchAsync(async (req, res, next) => {
  const { Invoice, InvoiceItem, Buyer } = req.tenantModels;

  const {
    invoice_number,

    invoiceType,

    invoiceDate,

    sellerNTNCNIC,

    sellerFullNTN,

    sellerBusinessName,

    sellerProvince,

    sellerAddress,

    sellerCity,

    buyerNTNCNIC,

    buyerBusinessName,

    buyerProvince,

    buyerAddress,

    buyerRegistrationType,

    invoiceRefNo,

    companyInvoiceRefNo,

    internalInvoiceNo,

    transctypeId,

    items,

    status = "posted",

    fbr_invoice_number = null,
    idToDelete = null,
    sourceInvoiceNo,
  } = req.body;

  // Debug: Log internal invoice number
  console.log("🔍 Backend Debug: Internal Invoice No:", {
    internalInvoiceNo: internalInvoiceNo,
    hasValue: !!internalInvoiceNo,
    trimmedValue: internalInvoiceNo?.trim(),
    reqBodyKeys: Object.keys(req.body),
  });

  // Use fbr_invoice_number as invoice_number if invoice_number is not provided

  const finalInvoiceNumber = invoice_number || fbr_invoice_number;

  // Debug: Log the received items data

  console.log("Received items data:", JSON.stringify(items, null, 2));

  // Enforce allowed statuses only

  const allowedStatuses = ["draft", "posted"];

  if (!allowedStatuses.includes(status)) {
    return next(
      new AppError("Invalid status. Allowed: 'draft', or 'posted'", 400),
    );
  }

  // Check if invoice number already exists (only if provided)

  let existingInvoice = null;

  if (finalInvoiceNumber) {
    existingInvoice = await Invoice.findOne({
      where: { invoice_number: finalInvoiceNumber },
    });
  }

  if (existingInvoice) {
    return next(new AppError("Invoice with this number already exists", 409));
  }

  // Auto-create/validate buyer before creating invoice
  let buyerId = null;
  try {
    if (buyerNTNCNIC && String(buyerNTNCNIC).trim()) {
      const existingBuyer = await Buyer.findOne({
        where: { buyerNTNCNIC: String(buyerNTNCNIC).trim() },
      });
      if (existingBuyer) {
        buyerId = existingBuyer.id;
        if (
          buyerBusinessName &&
          String(buyerBusinessName).trim() &&
          String(existingBuyer.buyerBusinessName || "")
            .trim()
            .toLowerCase() !== String(buyerBusinessName).trim().toLowerCase()
        ) {
          return next(new AppError("This Buyer already exists", 409));
        }
      } else {
        const newBuyer = await Buyer.create({
          buyerNTNCNIC: String(buyerNTNCNIC).trim(),
          buyerBusinessName: buyerBusinessName || null,
          buyerProvince: buyerProvince || "",
          buyerAddress: buyerAddress || null,
          buyerRegistrationType: buyerRegistrationType || "Unregistered",
          created_by_user_id: req.user?.userId || req.user?.id || null,
          created_by_email: req.user?.email || null,
          created_by_name:
            req.user?.firstName || req.user?.lastName
              ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
              : req.user?.role === "admin"
                ? "Admin"
                : null,
        });
        buyerId = newBuyer.id;
      }
    }
  } catch (e) {
    console.error("Buyer check/create error:", e);
    return next(
      new AppError(`Error validating/creating buyer: ${e.message}`, 500),
    );
  }

  // Server-side FBR registration mismatch check
  try {
    if (
      buyerNTNCNIC &&
      String(buyerNTNCNIC).trim() &&
      buyerRegistrationType &&
      String(buyerRegistrationType).trim()
    ) {
      const selectedType = String(buyerRegistrationType).trim().toLowerCase();
      if (selectedType === "unregistered") {
        const axios = (await import("axios")).default;
        const upstream = await axios.post(
          "https://buyercheckapi.inplsoftwares.online/checkbuyer.php",
          {
            token: "89983e4a-c009-3f9b-bcd6-a605c3086709",
            registrationNo: String(buyerNTNCNIC).trim(),
          },
          { headers: { "Content-Type": "application/json" }, timeout: 10000 },
        );
        const data = upstream.data;
        let derived = "Unregistered";
        if (data && typeof data.REGISTRATION_TYPE === "string") {
          derived =
            data.REGISTRATION_TYPE.toLowerCase() === "registered"
              ? "Registered"
              : "Unregistered";
        } else {
          let isRegistered = false;
          if (typeof data === "boolean") {
            isRegistered = data === true;
          } else if (data) {
            isRegistered =
              data.isRegistered === true ||
              data.registered === true ||
              (typeof data.status === "string" &&
                data.status.toLowerCase() === "registered") ||
              (typeof data.registrationType === "string" &&
                data.registrationType.toLowerCase() === "registered");
          }
          derived = isRegistered ? "Registered" : "Unregistered";
        }
        if (derived === "Registered") {
          return next(
            new AppError(
              "Buyer Registration Type is not correct (FBR: Registered)",
              400,
            ),
          );
        }
      }
    }
  } catch (fbrErr) {
    console.error("FBR registration check failed:", fbrErr);
    // If the upstream fails, proceed rather than hard-blocking; comment next line to block on failure
    // return res.status(502).json({ success: false, message: "FBR registration check failed", error: fbrErr.message });
  }

  // Create invoice with transaction
  let preservedSourceInvoiceNo = null;

  const result = await req.tenantDb.transaction(async (t) => {
    // If idToDelete is provided, hard delete that invoice (e.g., a draft/saved being converted to posted)
    if (idToDelete) {
      console.log(
        `🗑️ Hard deleting reference invoice #${idToDelete} during new invoice creation`,
      );

      const invoiceToDelete = await Invoice.findByPk(idToDelete, {
        transaction: t,
      });
      if (invoiceToDelete) {
        // Preserve the sourceInvoiceNo before deleting
        preservedSourceInvoiceNo = invoiceToDelete.sourceInvoiceNo;

        // Hard delete items from database
        await InvoiceItem.destroy({
          where: { invoice_id: idToDelete },
          transaction: t,
        });

        // Hard delete invoice from database
        await invoiceToDelete.destroy({ transaction: t });

        console.log(`✅ Successfully hard-deleted invoice #${idToDelete} and its items from database`);
      }
    }

    // Generate system invoice ID

    const systemInvoiceId = await generateSystemInvoiceId(Invoice);

    // Create invoice with posted status

    const invoice = await Invoice.create(
      {
        invoice_number: finalInvoiceNumber,

        system_invoice_id: systemInvoiceId,

        invoiceType,

        invoiceDate,

        sellerNTNCNIC,

        sellerFullNTN,

        sellerBusinessName,

        sellerProvince,

        sellerAddress,

        sellerCity,

        buyerNTNCNIC,

        buyerBusinessName,

        buyerProvince,

        buyerAddress,

        buyerRegistrationType,

        buyer_id: buyerId, // Set foreign key to buyer

        invoiceRefNo,

        companyInvoiceRefNo,

        internal_invoice_no: internalInvoiceNo,

        transctypeId,

        status: "posted", // Always set as posted when using createInvoice

        fbr_invoice_number,
        sourceInvoiceNo: companyInvoiceRefNo || sourceInvoiceNo || preservedSourceInvoiceNo,
        created_by_user_id: req.user?.userId || req.user?.id || null,
        created_by_email: req.user?.email || null,
        created_by_name:
          req.user?.firstName || req.user?.lastName
            ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
            : req.user?.role === "admin"
              ? `Admin (${req.user?.id || "Unknown"})`
              : null,
      },

      { transaction: t },
    );

    // Create invoice items if provided

    if (items && Array.isArray(items) && items.length > 0) {
      const invoiceItems = items.map((item) => {
        // Debug: Log the incoming item data
        console.log("🔍 Backend Debug: Incoming item data:", {
          productName: item.productName,
          name: item.name,
          item_productName: item.item_productName,
          hsCode: item.hsCode,
        });

        // Helper function to convert empty strings to null

        const cleanValue = (value) => {
          if (
            value === "" ||
            value === "N/A" ||
            value === null ||
            value === undefined
          ) {
            return null;
          }

          return value;
        };

        // Helper function to convert numeric strings to numbers

        const cleanNumericValue = (value) => {
          const cleaned = cleanValue(value);

          if (cleaned === null) return null;

          const num = parseFloat(cleaned);

          return isNaN(num) ? null : num;
        };

        // Helper function to clean hsCode with length validation
        const cleanHsCode = (value) => {
          const cleaned = cleanValue(value);
          if (cleaned === null) return null;

          const stringValue = String(cleaned);

          // Extract HS code from description if it contains a dash separator
          // Format: "8432.1010 - NUCLEAR REACTOR, BOILERS, MACHINERY AN"
          let hsCode = stringValue;
          if (stringValue.includes(" - ")) {
            hsCode = stringValue.split(" - ")[0].trim();
          }

          // Truncate to 50 characters to match database field length
          return hsCode.substring(0, 50);
        };

        const mappedItem = {
          invoice_id: invoice.id,

          hsCode: cleanHsCode(item.hsCode),

          name: cleanValue(item.productName || item.name),

          productDescription: cleanValue(item.productDescription),

          rate: cleanValue(item.rate),

          uoM: cleanValue(item.uoM),

          quantity: cleanNumericValue(item.quantity),

          unitPrice: cleanNumericValue(item.unitPrice),

          totalValues: cleanNumericValue(item.totalValues),

          valueSalesExcludingST: cleanNumericValue(item.valueSalesExcludingST),

          fixedNotifiedValueOrRetailPrice: cleanNumericValue(
            item.fixedNotifiedValueOrRetailPrice,
          ),

          salesTaxApplicable: cleanNumericValue(item.salesTaxApplicable),

          salesTaxWithheldAtSource: cleanNumericValue(
            item.salesTaxWithheldAtSource,
          ),

          furtherTax: cleanNumericValue(item.furtherTax),

          sroScheduleNo: cleanValue(item.sroScheduleNo),

          fedPayable: cleanNumericValue(item.fedPayable),

          advanceIncomeTax: cleanNumericValue(item.advanceIncomeTax),

          discount: cleanNumericValue(item.discount),

          saleType: cleanValue(item.saleType),

          sroItemSerialNo: cleanValue(item.sroItemSerialNo),
          invoiceItemNo: cleanValue(item.invoiceItemNo) || "",
        };

        // Only include extraTax when it's a positive value (> 0)

        const extraTaxValue = cleanNumericValue(item.extraTax);

        if (extraTaxValue !== null && Number(extraTaxValue) > 0) {
          mappedItem.extraTax = extraTaxValue;
        }

        // Debug: Log the mapped item
        console.log("🔍 Backend Debug: Product name mapping details:", {
          originalProductName: item.productName,
          originalName: item.name,
          finalName: mappedItem.name,
          cleanValueResult: cleanValue(item.productName || item.name),
        });

        console.log(
          "Mapped invoice item:",

          JSON.stringify(mappedItem, null, 2),
        );

        return mappedItem;
      });

      console.log(
        "About to create invoice items:",

        JSON.stringify(invoiceItems, null, 2),
      );

      // Debug: Check each item before insertion
      invoiceItems.forEach((item, index) => {
        console.log(`🔍 Backend Debug: Item ${index} before insertion:`, {
          name: item.name,
          productName: item.productName,
          hsCode: item.hsCode,
        });
      });

      const createdItems = await InvoiceItem.bulkCreate(invoiceItems, {
        transaction: t,
      });

      console.log(
        "🔍 Backend Debug: Items created successfully:",
        createdItems.length,
      );

      // Debug: Check what was actually inserted
      if (createdItems && createdItems.length > 0) {
        console.log("🔍 Backend Debug: First created item:", {
          id: createdItems[0].id,
          name: createdItems[0].name,
          hsCode: createdItems[0].hsCode,
        });
      }
    }

    return invoice;
  });

  // Create backup for posted invoice (direct creation)
  try {
    // Fetch the invoice items for backup
    const invoiceItems = await req.tenantModels.InvoiceItem.findAll({
      where: { invoice_id: result.id },
    });

    await InvoiceBackupService.createPostBackup({
      tenantDb: req.tenantDb,
      tenantModels: req.tenantModels,
      invoice: result,
      invoiceItems: invoiceItems,
      user: req.user,
      tenant: req.tenant,
      request: {
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get ? req.get("User-Agent") : null,
        requestId: req.headers?.["x-request-id"] || null,
      },
    });
  } catch (backupError) {
    console.error("❌ Error creating post backup:", backupError);
    // Don't fail the main operation if backup fails
  }

  // Determine operation type: SUBMIT_TO_FBR if posted with FBR invoice number, otherwise CREATE
  const operation =
    result.status === "posted" && result.fbr_invoice_number
      ? "SUBMIT_TO_FBR"
      : "CREATE";

  // Fetch invoice items for audit log if not already available
  let invoiceItemsForAudit = items;
  if (!invoiceItemsForAudit || invoiceItemsForAudit.length === 0) {
    const fetchedItems = await req.tenantModels.InvoiceItem.findAll({
      where: { invoice_id: result.id },
    });
    invoiceItemsForAudit = fetchedItems.map((item) => ({
      id: item.id,
      name: item.name,
      hsCode: item.hsCode,
      productDescription: item.productDescription,
      quantity: item.quantity,
      rate: item.rate,
      uoM: item.uoM,
      unitPrice: item.unitPrice,
      totalValues: item.totalValues,
      valueSalesExcludingST: item.valueSalesExcludingST,
      fixedNotifiedValueOrRetailPrice: item.fixedNotifiedValueOrRetailPrice,
      salesTaxApplicable: item.salesTaxApplicable,
      salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
      extraTax: item.extraTax,
      furtherTax: item.furtherTax,
      sroScheduleNo: item.sroScheduleNo,
      fedPayable: item.fedPayable,
      advanceIncomeTax: item.advanceIncomeTax,
      discount: item.discount,
      saleType: item.saleType,
      sroItemSerialNo: item.sroItemSerialNo,
      billOfLadingUoM: item.billOfLadingUoM,
    }));
  }

  // Log audit event for invoice creation or FBR submission
  await logAuditEvent(
    req,
    "invoice",
    result.id,
    operation,
    null, // oldValues
    {
      // Basic Invoice Information
      invoice_id: result.id,
      invoice_number: result.invoice_number,
      system_invoice_id: result.system_invoice_id,
      status: result.status,
      fbr_invoice_number: result.fbr_invoice_number,
      invoiceType: result.invoiceType,
      invoiceDate: result.invoiceDate,
      invoiceRefNo: result.invoiceRefNo,
      companyInvoiceRefNo: result.companyInvoiceRefNo,
      internal_invoice_no: result.internal_invoice_no,
      transctypeId: result.transctypeId,

      // Complete Seller Information
      sellerNTNCNIC: result.sellerNTNCNIC,
      sellerFullNTN: result.sellerFullNTN,
      sellerBusinessName: result.sellerBusinessName,
      sellerProvince: result.sellerProvince,
      sellerAddress: result.sellerAddress,
      sellerCity: result.sellerCity,

      // Complete Buyer Information
      buyerNTNCNIC: result.buyerNTNCNIC,
      buyerBusinessName: result.buyerBusinessName,
      buyerProvince: result.buyerProvince,
      buyerAddress: result.buyerAddress,
      buyerRegistrationType: result.buyerRegistrationType,

      // Financial Information
      totalAmount: result.totalAmount,

      // Complete Invoice Items with All Details
      invoice_items: invoiceItemsForAudit
        ? invoiceItemsForAudit.map((item) => ({
            id: item.id,
            product_name: item.name,
            hsCode: item.hsCode,
            productDescription: item.productDescription,
            quantity: item.quantity,
            rate: item.rate,
            uoM: item.uoM,
            unitPrice: item.unitPrice,
            totalValues: item.totalValues,
            valueSalesExcludingST: item.valueSalesExcludingST,
            fixedNotifiedValueOrRetailPrice:
              item.fixedNotifiedValueOrRetailPrice,
            salesTaxApplicable: item.salesTaxApplicable,
            salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
            extraTax: item.extraTax,
            furtherTax: item.furtherTax,
            sroScheduleNo: item.sroScheduleNo,
            fedPayable: item.fedPayable,
            advanceIncomeTax: item.advanceIncomeTax,
            discount: item.discount,
            saleType: item.saleType,
            sroItemSerialNo: item.sroItemSerialNo,
            billOfLadingUoM: item.billOfLadingUoM,
          }))
        : [],
    }, // newValues
    {
      entityName: result.invoice_number || result.system_invoice_id,
      itemsCount: invoiceItemsForAudit ? invoiceItemsForAudit.length : 0,
      fbrInvoiceNumber: result.fbr_invoice_number,
      isFbrSubmission: operation === "SUBMIT_TO_FBR",
    },
  );

  res.status(200).json({
    success: true,

    message: "Invoice created successfully with FBR invoice number",

    data: {
      invoice_id: result.id,

      invoice_number: result.invoice_number,

      system_invoice_id: result.system_invoice_id,

      status: result.status,

      fbr_invoice_number: result.fbr_invoice_number,
    },
  });
});

// Save invoice as draft

export const saveInvoice = catchAsync(async (req, res, next) => {
  const { Invoice, InvoiceItem } = req.tenantModels;

  const {
    id,

    invoiceType,

    invoiceDate,

    sellerNTNCNIC,

    sellerFullNTN,

    sellerBusinessName,

    sellerProvince,

    sellerAddress,

    sellerCity,

    buyerNTNCNIC,

    buyerBusinessName,

    buyerProvince,

    buyerAddress,

    buyerRegistrationType,

    invoiceRefNo,

    companyInvoiceRefNo,

    internalInvoiceNo,

    transctypeId,

    items,
    sourceInvoiceNo,
  } = req.body;

  // Check companyInvoiceRefNo uniqueness before saving draft
  if (companyInvoiceRefNo && String(companyInvoiceRefNo).trim()) {
    const duplicateRef = await checkCompanyInvoiceRefNoUniqueness(
      Invoice,
      companyInvoiceRefNo,
      id || null, // exclude current record when updating
    );
    if (duplicateRef) {
      return next(
        new AppError("This Company Invoice Reference Number already exists.", 409),
      );
    }
  }

  // Create or update draft invoice in a transaction

  const result = await req.tenantDb.transaction(async (t) => {
    let invoice = null;

    if (id) {
      invoice = await Invoice.findByPk(id, { transaction: t });

      if (!invoice) {
        throw new AppError("Invoice not found", 404);
      }

      if (invoice.status !== "draft" && invoice.status !== "saved") {
        throw new AppError("Only draft or saved invoices can be updated", 400);
      }

      // Generate appropriate invoice number based on current status
      let updatedInvoiceNumber = invoice.invoice_number;

      // If changing from SAVED to DRAFT, generate new DRAFT number
      if (
        invoice.invoice_number &&
        invoice.invoice_number.startsWith("SAVED_")
      ) {
        updatedInvoiceNumber = await generateShortInvoiceId(Invoice, "DRAFT");
      }
      // If changing from DRAFT to DRAFT, keep the same DRAFT number
      else if (
        invoice.invoice_number &&
        invoice.invoice_number.startsWith("DRAFT_")
      ) {
        updatedInvoiceNumber = invoice.invoice_number; // Keep existing DRAFT number
      }
      // If no invoice number or other format, generate new DRAFT number
      else {
        updatedInvoiceNumber = await generateShortInvoiceId(Invoice, "DRAFT");
      }

      // Update invoice header

      await invoice.update(
        {
          invoice_number: updatedInvoiceNumber,

          invoiceType,

          invoiceDate,

          sellerNTNCNIC,

          sellerFullNTN,

          sellerBusinessName,

          sellerProvince,

          sellerAddress,

          sellerCity,

          buyerNTNCNIC,

          buyerBusinessName,

          buyerProvince,

          buyerAddress,

          buyerRegistrationType,

          invoiceRefNo,

          companyInvoiceRefNo,

          internal_invoice_no: internalInvoiceNo,

          transctypeId,

          status: "draft",

          fbr_invoice_number: null,
          sourceInvoiceNo: companyInvoiceRefNo || sourceInvoiceNo || invoice.sourceInvoiceNo,
        },

        { transaction: t },
      );

      // Replace items

      await InvoiceItem.destroy({
        where: { invoice_id: invoice.id },

        transaction: t,
      });
    } else {
      // Generate a temporary invoice number for draft

      const tempInvoiceNumber = await generateShortInvoiceId(
        Invoice,

        "DRAFT",
      );

      // Generate system invoice ID

      const systemInvoiceId = await generateSystemInvoiceId(Invoice);

      invoice = await Invoice.create(
        {
          invoice_number: tempInvoiceNumber,

          system_invoice_id: systemInvoiceId,

          invoiceType,

          invoiceDate,

          sellerNTNCNIC,

          sellerFullNTN,

          sellerBusinessName,

          sellerProvince,

          sellerAddress,

          sellerCity,

          buyerNTNCNIC,

          buyerBusinessName,

          buyerProvince,

          buyerAddress,

          buyerRegistrationType,

          invoiceRefNo,

          companyInvoiceRefNo,

          internal_invoice_no: internalInvoiceNo,

          transctypeId,

          status: "draft",

          fbr_invoice_number: null,
          sourceInvoiceNo: companyInvoiceRefNo || sourceInvoiceNo,
          created_by_user_id: req.user?.userId || req.user?.id || null,
          created_by_email: req.user?.email || null,
          created_by_name:
            req.user?.firstName || req.user?.lastName
              ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
              : req.user?.role === "admin"
                ? `Admin (${req.user?.id || "Unknown"})`
                : null,
        },

        { transaction: t },
      );
    }

    // Create invoice items if provided

    if (items && Array.isArray(items) && items.length > 0) {
      const invoiceItems = items.map((item) => {
        const cleanValue = (value) => {
          if (
            value === "" ||
            value === "N/A" ||
            value === null ||
            value === undefined
          ) {
            return null;
          }

          return value;
        };

        const cleanNumericValue = (value) => {
          const cleaned = cleanValue(value);

          if (cleaned === null) return null;

          const num = parseFloat(cleaned);

          return isNaN(num) ? null : num;
        };

        // Helper function to clean hsCode with length validation
        const cleanHsCode = (value) => {
          const cleaned = cleanValue(value);
          if (cleaned === null) return null;

          const stringValue = String(cleaned);

          // Extract HS code from description if it contains a dash separator
          // Format: "8432.1010 - NUCLEAR REACTOR, BOILERS, MACHINERY AN"
          let hsCode = stringValue;
          if (stringValue.includes(" - ")) {
            hsCode = stringValue.split(" - ")[0].trim();
          }

          // Truncate to 50 characters to match database field length
          return hsCode.substring(0, 50);
        };

        const mappedItem = {
          invoice_id: invoice.id,

          hsCode: cleanHsCode(item.hsCode),

          name: cleanValue(item.productName || item.name),

          productDescription: cleanValue(item.productDescription),

          rate: cleanValue(item.rate),

          uoM: cleanValue(item.uoM),

          quantity: cleanNumericValue(item.quantity),

          unitPrice: cleanNumericValue(item.unitPrice),

          totalValues: cleanNumericValue(item.totalValues),

          valueSalesExcludingST: cleanNumericValue(item.valueSalesExcludingST),

          fixedNotifiedValueOrRetailPrice: cleanNumericValue(
            item.fixedNotifiedValueOrRetailPrice,
          ),

          salesTaxApplicable: cleanNumericValue(item.salesTaxApplicable),

          salesTaxWithheldAtSource: cleanNumericValue(
            item.salesTaxWithheldAtSource,
          ),

          furtherTax: cleanNumericValue(item.furtherTax),

          sroScheduleNo: cleanValue(item.sroScheduleNo),

          fedPayable: cleanNumericValue(item.fedPayable),

          advanceIncomeTax: cleanNumericValue(item.advanceIncomeTax),

          discount: cleanNumericValue(item.discount),

          saleType: cleanValue(item.saleType),

          sroItemSerialNo: cleanValue(item.sroItemSerialNo),
          invoiceItemNo: cleanValue(item.invoiceItemNo) || "",
        };

        // Only include extraTax when it's a positive value (> 0)

        const extraTaxValue = cleanNumericValue(item.extraTax);

        if (extraTaxValue !== null && Number(extraTaxValue) > 0) {
          mappedItem.extraTax = extraTaxValue;
        }

        return mappedItem;
      });

      await InvoiceItem.bulkCreate(invoiceItems, { transaction: t });
    }

    return invoice;
  });

  // Create backup for draft invoice
  try {
    // Fetch the invoice items for backup
    const invoiceItems = await req.tenantModels.InvoiceItem.findAll({
      where: { invoice_id: result.id },
    });

    await InvoiceBackupService.createDraftBackup({
      tenantDb: req.tenantDb,
      tenantModels: req.tenantModels,
      invoice: result,
      invoiceItems: invoiceItems,
      isUpdate: !!id,
      user: req.user,
      tenant: req.tenant,
      request: {
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get ? req.get("User-Agent") : null,
        requestId: req.headers?.["x-request-id"] || null,
      },
    });
  } catch (backupError) {
    console.error("❌ Error creating draft backup:", backupError);
    // Don't fail the main operation if backup fails
  }

  // Log audit event for invoice save (draft)
  await logAuditEvent(
    req,
    "invoice",
    result.id,
    "SAVE_DRAFT",
    null, // oldValues (null for new draft)
    {
      // Basic Invoice Information
      invoice_id: result.id,
      invoice_number: result.invoice_number,
      system_invoice_id: result.system_invoice_id,
      status: result.status,
      fbr_invoice_number: result.fbr_invoice_number,
      invoiceType: result.invoiceType,
      invoiceDate: result.invoiceDate,
      invoiceRefNo: result.invoiceRefNo,
      companyInvoiceRefNo: result.companyInvoiceRefNo,
      internal_invoice_no: result.internal_invoice_no,
      transctypeId: result.transctypeId,

      // Complete Seller Information
      sellerNTNCNIC: result.sellerNTNCNIC,
      sellerFullNTN: result.sellerFullNTN,
      sellerBusinessName: result.sellerBusinessName,
      sellerProvince: result.sellerProvince,
      sellerAddress: result.sellerAddress,
      sellerCity: result.sellerCity,

      // Complete Buyer Information
      buyerNTNCNIC: result.buyerNTNCNIC,
      buyerBusinessName: result.buyerBusinessName,
      buyerProvince: result.buyerProvince,
      buyerAddress: result.buyerAddress,
      buyerRegistrationType: result.buyerRegistrationType,

      // Financial Information
      totalAmount: result.totalAmount,

      // Complete Invoice Items with All Details
      invoice_items: items
        ? items.map((item) => ({
            id: item.id,
            product_name: item.name,
            hsCode: item.hsCode,
            productDescription: item.productDescription,
            quantity: item.quantity,
            rate: item.rate,
            uoM: item.uoM,
            unitPrice: item.unitPrice,
            totalValues: item.totalValues,
            valueSalesExcludingST: item.valueSalesExcludingST,
            fixedNotifiedValueOrRetailPrice:
              item.fixedNotifiedValueOrRetailPrice,
            salesTaxApplicable: item.salesTaxApplicable,
            salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
            extraTax: item.extraTax,
            furtherTax: item.furtherTax,
            sroScheduleNo: item.sroScheduleNo,
            fedPayable: item.fedPayable,
            advanceIncomeTax: item.advanceIncomeTax,
            discount: item.discount,
            saleType: item.saleType,
            sroItemSerialNo: item.sroItemSerialNo,
            billOfLadingUoM: item.billOfLadingUoM,
          }))
        : [],
    }, // newValues
    {
      entityName: result.invoice_number || result.system_invoice_id,
      endpoint: req.originalUrl,
      method: req.method,
      itemsCount: items ? items.length : 0,
    },
  );

  res.status(201).json({
    success: true,

    message: "Invoice saved as draft successfully",

    data: {
      id: result.id,
      invoice_id: result.id,

      invoice_number: result.invoice_number,

      system_invoice_id: result.system_invoice_id,

      status: result.status,

      sourceInvoiceNo: result.sourceInvoiceNo,
    },
  });
});

// Save and validate invoice

export const saveAndValidateInvoice = catchAsync(async (req, res, next) => {
  const { Invoice, InvoiceItem } = req.tenantModels;

  const {
    id,

    invoiceType,

    invoiceDate,

    sellerNTNCNIC,

    sellerFullNTN,

    sellerBusinessName,

    sellerProvince,

    sellerAddress,

    sellerCity,

    buyerNTNCNIC,

    buyerBusinessName,

    buyerProvince,

    buyerAddress,

    buyerRegistrationType,

    invoiceRefNo,

    companyInvoiceRefNo,

    internalInvoiceNo,

    transctypeId,

    items,
    sourceInvoiceNo,
  } = req.body;

  // Generate appropriate invoice number based on whether it's a new invoice or update
  let tempInvoiceNumber;

  if (id) {
    // For updates, we'll determine the invoice number based on current status
    tempInvoiceNumber = null; // Will be set in the update logic
  } else {
    // For new invoices, generate a SAVED invoice number
    tempInvoiceNumber = await generateShortInvoiceId(Invoice, "SAVED");
  }

  // Validate the data first (basic validation)

  const validationErrors = [];

  // Validate seller fields

  if (
    !sellerNTNCNIC ||
    !sellerBusinessName ||
    !sellerProvince ||
    !sellerAddress
  ) {
    validationErrors.push("Seller information is incomplete");
  }

  // Validate buyer fields

  if (!buyerNTNCNIC || !buyerBusinessName || !buyerProvince || !buyerAddress) {
    validationErrors.push("Buyer information is incomplete");
  }

  // Validate items

  if (!items || items.length === 0) {
    validationErrors.push("At least one item is required");
  } else {
    items.forEach((item, index) => {
      if (!item.hsCode || !item.rate || !item.uoM) {
        validationErrors.push(`Item ${index + 1} has incomplete information`);
      }
    });
  }

  if (validationErrors.length > 0) {
    return next(
      new AppError(`Validation failed: ${validationErrors.join(", ")}`, 400),
    );
  }

  // Check companyInvoiceRefNo uniqueness before save-and-validate
  if (companyInvoiceRefNo && String(companyInvoiceRefNo).trim()) {
    const duplicateRef = await checkCompanyInvoiceRefNoUniqueness(
      Invoice,
      companyInvoiceRefNo,
      id || null,
    );
    if (duplicateRef) {
      return next(
        new AppError("This Company Invoice Reference Number already exists.", 409),
      );
    }
  }

  // Save as saved - upsert behavior like saveInvoice

  const result = await req.tenantDb.transaction(async (t) => {
    let invoice = null;

    if (id) {
      invoice = await Invoice.findByPk(id, { transaction: t });

      if (!invoice) {
        throw new AppError("Invoice not found", 404);
      }

      if (invoice.status !== "draft" && invoice.status !== "saved") {
        throw new AppError("Only draft or saved invoices can be updated", 400);
      }

      // Generate appropriate invoice number for SAVED status
      let updatedInvoiceNumber = invoice.invoice_number;

      // If changing from DRAFT to SAVED, generate new SAVED number
      if (
        invoice.invoice_number &&
        invoice.invoice_number.startsWith("DRAFT_")
      ) {
        updatedInvoiceNumber = await generateShortInvoiceId(Invoice, "SAVED");
      }
      // If already SAVED, keep the same SAVED number
      else if (
        invoice.invoice_number &&
        invoice.invoice_number.startsWith("SAVED_")
      ) {
        updatedInvoiceNumber = invoice.invoice_number; // Keep existing SAVED number
      }
      // If no invoice number or other format, generate new SAVED number
      else {
        updatedInvoiceNumber = await generateShortInvoiceId(Invoice, "SAVED");
      }

      await invoice.update(
        {
          invoice_number: updatedInvoiceNumber,

          invoiceType,

          invoiceDate,

          sellerNTNCNIC,

          sellerFullNTN,

          sellerBusinessName,

          sellerProvince,

          sellerAddress,

          sellerCity,

          buyerNTNCNIC,

          buyerBusinessName,

          buyerProvince,

          buyerAddress,

          buyerRegistrationType,

          invoiceRefNo,

          companyInvoiceRefNo,

          internal_invoice_no: internalInvoiceNo,

          transctypeId,

          status: "saved",

          fbr_invoice_number: null,
          sourceInvoiceNo: companyInvoiceRefNo || sourceInvoiceNo || invoice.sourceInvoiceNo,
          created_by_user_id: req.user?.userId || req.user?.id || null,
          created_by_email: req.user?.email || null,
          created_by_name:
            req.user?.firstName || req.user?.lastName
              ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
              : req.user?.role === "admin"
                ? `Admin (${req.user?.id || "Unknown"})`
                : null,
        },

        { transaction: t },
      );

      await InvoiceItem.destroy({
        where: { invoice_id: invoice.id },

        transaction: t,
      });
    } else {
      // Generate system invoice ID

      const systemInvoiceId = await generateSystemInvoiceId(Invoice);

      invoice = await Invoice.create(
        {
          invoice_number: tempInvoiceNumber,

          system_invoice_id: systemInvoiceId,

          invoiceType,

          invoiceDate,

          sellerNTNCNIC,

          sellerFullNTN,

          sellerBusinessName,

          sellerProvince,

          sellerAddress,

          sellerCity,

          buyerNTNCNIC,

          buyerBusinessName,

          buyerProvince,

          buyerAddress,

          buyerRegistrationType,

          invoiceRefNo,

          companyInvoiceRefNo,

          internal_invoice_no: internalInvoiceNo,

          transctypeId,

          status: "saved",

          fbr_invoice_number: null,
          sourceInvoiceNo: companyInvoiceRefNo || sourceInvoiceNo,
          created_by_user_id: req.user?.userId || req.user?.id || null,
          created_by_email: req.user?.email || null,
          created_by_name:
            req.user?.firstName || req.user?.lastName
              ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
              : req.user?.role === "admin"
                ? `Admin (${req.user?.id || "Unknown"})`
                : null,
        },

        { transaction: t },
      );
    }

    if (items && Array.isArray(items) && items.length > 0) {
      const invoiceItems = items.map((item) => {
        const cleanValue = (value) => {
          if (
            value === "" ||
            value === "N/A" ||
            value === null ||
            value === undefined
          ) {
            return null;
          }

          return value;
        };

        const cleanNumericValue = (value) => {
          const cleaned = cleanValue(value);

          if (cleaned === null) return null;

          const num = parseFloat(cleaned);

          return isNaN(num) ? null : num;
        };

        // Helper function to clean hsCode with length validation
        const cleanHsCode = (value) => {
          const cleaned = cleanValue(value);
          if (cleaned === null) return null;

          const stringValue = String(cleaned);

          // Extract HS code from description if it contains a dash separator
          // Format: "8432.1010 - NUCLEAR REACTOR, BOILERS, MACHINERY AN"
          let hsCode = stringValue;
          if (stringValue.includes(" - ")) {
            hsCode = stringValue.split(" - ")[0].trim();
          }

          // Truncate to 50 characters to match database field length
          return hsCode.substring(0, 50);
        };

        const mappedItem = {
          invoice_id: invoice.id,

          hsCode: cleanHsCode(item.hsCode),

          name: cleanValue(item.productName || item.name),

          productDescription: cleanValue(item.productDescription),

          rate: cleanValue(item.rate),

          uoM: cleanValue(item.uoM),

          quantity: cleanNumericValue(item.quantity),

          unitPrice: cleanNumericValue(item.unitPrice),

          totalValues: cleanNumericValue(item.totalValues),

          valueSalesExcludingST: cleanNumericValue(item.valueSalesExcludingST),

          fixedNotifiedValueOrRetailPrice: cleanNumericValue(
            item.fixedNotifiedValueOrRetailPrice,
          ),

          salesTaxApplicable: cleanNumericValue(item.salesTaxApplicable),

          salesTaxWithheldAtSource: cleanNumericValue(
            item.salesTaxWithheldAtSource,
          ),

          furtherTax: cleanNumericValue(item.furtherTax),

          sroScheduleNo: cleanValue(item.sroScheduleNo),

          fedPayable: cleanNumericValue(item.fedPayable),

          advanceIncomeTax: cleanNumericValue(item.advanceIncomeTax),

          discount: cleanNumericValue(item.discount),

          saleType: cleanValue(item.saleType),

          sroItemSerialNo: cleanValue(item.sroItemSerialNo),
          invoiceItemNo: cleanValue(item.invoiceItemNo) || "",
        };

        // Only include extraTax when it's a positive value (> 0)

        const extraTaxValue = cleanNumericValue(item.extraTax);

        if (extraTaxValue !== null && Number(extraTaxValue) > 0) {
          mappedItem.extraTax = extraTaxValue;
        }

        return mappedItem;
      });

      await InvoiceItem.bulkCreate(invoiceItems, { transaction: t });
    }

    return invoice;
  });

  // Create backup for saved invoice
  try {
    // Fetch the invoice items for backup
    const invoiceItems = await req.tenantModels.InvoiceItem.findAll({
      where: { invoice_id: result.id },
    });

    await InvoiceBackupService.createSavedBackup({
      tenantDb: req.tenantDb,
      tenantModels: req.tenantModels,
      invoice: result,
      invoiceItems: invoiceItems,
      isUpdate: !!id,
      user: req.user,
      tenant: req.tenant,
      request: {
        ip: req.ip || req.connection?.remoteAddress,
        userAgent: req.get ? req.get("User-Agent") : null,
        requestId: req.headers?.["x-request-id"] || null,
      },
    });
  } catch (backupError) {
    console.error("❌ Error creating saved backup:", backupError);
    // Don't fail the main operation if backup fails
  }

  // Log audit event for invoice save and validate
  await logAuditEvent(
    req,
    "invoice",
    result.id,
    "SAVE_AND_VALIDATE",
    null, // oldValues (null for new invoice)
    {
      // Basic Invoice Information
      invoice_id: result.id,
      invoice_number: result.invoice_number,
      system_invoice_id: result.system_invoice_id,
      status: result.status,
      fbr_invoice_number: result.fbr_invoice_number,
      invoiceType: result.invoiceType,
      invoiceDate: result.invoiceDate,
      invoiceRefNo: result.invoiceRefNo,
      companyInvoiceRefNo: result.companyInvoiceRefNo,
      internal_invoice_no: result.internal_invoice_no,
      transctypeId: result.transctypeId,

      // Complete Seller Information
      sellerNTNCNIC: result.sellerNTNCNIC,
      sellerFullNTN: result.sellerFullNTN,
      sellerBusinessName: result.sellerBusinessName,
      sellerProvince: result.sellerProvince,
      sellerAddress: result.sellerAddress,
      sellerCity: result.sellerCity,

      // Complete Buyer Information
      buyerNTNCNIC: result.buyerNTNCNIC,
      buyerBusinessName: result.buyerBusinessName,
      buyerProvince: result.buyerProvince,
      buyerAddress: result.buyerAddress,
      buyerRegistrationType: result.buyerRegistrationType,

      // Financial Information
      totalAmount: result.totalAmount,

      // Complete Invoice Items with All Details
      invoice_items: items
        ? items.map((item) => ({
            id: item.id,
            product_name: item.name,
            hsCode: item.hsCode,
            productDescription: item.productDescription,
            quantity: item.quantity,
            rate: item.rate,
            uoM: item.uoM,
            unitPrice: item.unitPrice,
            totalValues: item.totalValues,
            valueSalesExcludingST: item.valueSalesExcludingST,
            fixedNotifiedValueOrRetailPrice:
              item.fixedNotifiedValueOrRetailPrice,
            salesTaxApplicable: item.salesTaxApplicable,
            salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
            extraTax: item.extraTax,
            furtherTax: item.furtherTax,
            sroScheduleNo: item.sroScheduleNo,
            fedPayable: item.fedPayable,
            advanceIncomeTax: item.advanceIncomeTax,
            discount: item.discount,
            saleType: item.saleType,
            sroItemSerialNo: item.sroItemSerialNo,
            billOfLadingUoM: item.billOfLadingUoM,
          }))
        : [],
    }, // newValues
    {
      entityName: result.invoice_number || result.system_invoice_id,
      endpoint: req.originalUrl,
      method: req.method,
      itemsCount: items ? items.length : 0,
    },
  );

  res.status(201).json({
    success: true,

    message: "Invoice saved successfully",

    data: {
      id: result.id,
      invoice_id: result.id,

      invoice_number: result.invoice_number,

      system_invoice_id: result.system_invoice_id,

      status: result.status,

      sourceInvoiceNo: result.sourceInvoiceNo,
    },
  });
});

// Get all invoices

export const getAllInvoices = async (req, res) => {
  try {
    const { Invoice, InvoiceItem } = req.tenantModels;

    const {
      page = 1,
      limit = 10,
      search,
      start_date,
      end_date,
      sale_type,
      status,
      buyer_id,
      buyer_ids,
      product_ids,
      sort_by = "created_at",
      sort_order = "DESC",
    } = req.query;

    // Ensure numeric pagination params
    const pageNumber = parseInt(page, 10) || 1;
    const limitNumber = parseInt(limit, 10) || 10;
    const offset = limitNumber >= 999999 ? 0 : (pageNumber - 1) * limitNumber;

    const whereClause = { isDeleted: false };

    // Regular users can see ALL company invoices as requested
    console.log(
      "Invoice visibility - showing all non-deleted data for the tenant",
    );

    // Add search functionality

    if (search) {
      whereClause[req.tenantDb.Sequelize.Op.or] = [
        { invoice_number: { [req.tenantDb.Sequelize.Op.like]: `%${search}%` } },

        {
          fbr_invoice_number: {
            [req.tenantDb.Sequelize.Op.like]: `%${search}%`,
          },
        },

        {
          companyInvoiceRefNo: {
            [req.tenantDb.Sequelize.Op.like]: `%${search}%`,
          },
        },

        {
          buyerBusinessName: {
            [req.tenantDb.Sequelize.Op.like]: `%${search}%`,
          },
        },

        {
          sellerBusinessName: {
            [req.tenantDb.Sequelize.Op.like]: `%${search}%`,
          },
        },
      ];
    }

    // Add sale type filter

    if (sale_type && sale_type !== "All") {
      whereClause.invoiceType = sale_type;
    }

    // Add status filter - show all invoices by default

    if (status && status !== "All") {
      whereClause.status = status;
    }

    // Add buyer filter - filter by buyer NTN/CNIC
    if (buyer_id || buyer_ids) {
      try {
        let buyerIds = [];
        if (buyer_ids) {
          buyerIds = buyer_ids
            .split(",")
            .map((id) => parseInt(id.trim()))
            .filter((id) => !isNaN(id));
        } else if (buyer_id) {
          buyerIds = [parseInt(buyer_id)].filter((id) => !isNaN(id));
        }
        console.log("Filtering by buyer_ids:", buyerIds);

        // First get the buyers' NTN/CNIC from the buyer IDs
        const { Buyer } = req.tenantModels;
        const buyers = await Buyer.findAll({
          where: {
            id: {
              [req.tenantDb.Sequelize.Op.in]: buyerIds,
            },
          },
        });

        console.log(
          "Found buyers:",
          buyers.map((buyer) => ({
            id: buyer.id,
            buyerBusinessName: buyer.buyerBusinessName,
            buyerNTNCNIC: buyer.buyerNTNCNIC,
          })),
        );

        if (buyers.length > 0) {
          const buyerNTNCNICs = buyers
            .filter((buyer) => buyer.buyerNTNCNIC)
            .map((buyer) => buyer.buyerNTNCNIC);

          console.log("Buyer NTN/CNICs found:", buyerNTNCNICs);

          if (buyerNTNCNICs.length > 0) {
            whereClause.buyerNTNCNIC = {
              [req.tenantDb.Sequelize.Op.in]: buyerNTNCNICs,
            };
            console.log("Filtering invoices by buyerNTNCNICs:", buyerNTNCNICs);
          } else {
            console.log(
              "No valid NTN/CNIC found for buyers, returning empty results",
            );
            whereClause.id = -1; // This will return no results
          }
        } else {
          console.log(
            "No buyers found for IDs:",
            buyerIds,
            "returning empty results",
          );
          whereClause.id = -1; // This will return no results
        }
      } catch (error) {
        console.error("Error fetching buyers for filter:", error);
        // If there's an error, return empty results
        whereClause.id = -1; // This will return no results
      }
    }

    // Add product filter - use subquery approach to avoid WHERE clause issues
    if (product_ids) {
      try {
        const productIds = product_ids
          .split(",")
          .map((id) => parseInt(id.trim()))
          .filter((id) => !isNaN(id));
        console.log("Filtering by product_ids:", productIds);

        if (productIds.length > 0) {
          // First get the product names/HS codes from the product IDs
          const { Product } = req.tenantModels;
          const products = await Product.findAll({
            where: {
              id: {
                [req.tenantDb.Sequelize.Op.in]: productIds,
              },
            },
          });

          console.log(
            "🔍 Found products for filter:",
            products.map((p) => ({ id: p.id, name: p.name, hsCode: p.hsCode })),
          );

          if (products.length > 0) {
            const productNames = products.map((p) => p.name).filter(Boolean);
            const productHsCodes = products
              .map((p) => p.hsCode)
              .filter(Boolean);

            console.log("🔍 Product names found:", productNames);
            console.log("🔍 Product HS codes found:", productHsCodes);

            // Debug: Let's also check what invoice items exist for these HS codes
            if (productHsCodes.length > 0) {
              try {
                const { InvoiceItem } = req.tenantModels;

                // First, let's see all invoice items in the date range
                const allItemsInDateRange = await InvoiceItem.findAll({
                  include: [
                    {
                      model: req.tenantModels.Invoice,
                      where: {
                        [req.tenantDb.Sequelize.Op.or]: [
                          // Handle YYYY-MM-DD format
                          {
                            invoiceDate: {
                              [req.tenantDb.Sequelize.Op.between]: [
                                start_date,
                                end_date,
                              ],
                            },
                          },
                          // Handle DD-MM-YYYY format (convert and compare)
                          {
                            invoiceDate: {
                              [req.tenantDb.Sequelize.Op.and]: [
                                req.tenantDb.Sequelize.where(
                                  req.tenantDb.Sequelize.fn(
                                    "STR_TO_DATE",
                                    req.tenantDb.Sequelize.col("invoiceDate"),
                                    "%d-%m-%Y",
                                  ),
                                  {
                                    [req.tenantDb.Sequelize.Op.between]: [
                                      start_date,
                                      end_date,
                                    ],
                                  },
                                ),
                              ],
                            },
                          },
                        ],
                      },
                      attributes: ["id", "invoiceDate"],
                    },
                  ],
                  attributes: [
                    "id",
                    "invoice_id",
                    "name",
                    "hsCode",
                    "productDescription",
                  ],
                  limit: 20,
                });
                console.log(
                  "🔍 All invoice items in date range:",
                  allItemsInDateRange.map((item) => ({
                    id: item.id,
                    invoice_id: item.invoice_id,
                    name: item.name,
                    hsCode: item.hsCode,
                    productDescription: item.productDescription,
                    invoice_date: item.Invoice?.invoiceDate,
                  })),
                );

                // Now check for specific HS codes
                const sampleItems = await InvoiceItem.findAll({
                  where: {
                    hsCode: {
                      [req.tenantDb.Sequelize.Op.in]: productHsCodes,
                    },
                  },
                  attributes: [
                    "id",
                    "invoice_id",
                    "name",
                    "hsCode",
                    "productDescription",
                  ],
                  limit: 10,
                });
                console.log(
                  "🔍 Sample invoice items with matching HS codes:",
                  sampleItems.map((item) => ({
                    id: item.id,
                    invoice_id: item.invoice_id,
                    name: item.name,
                    hsCode: item.hsCode,
                    productDescription: item.productDescription,
                  })),
                );
              } catch (error) {
                console.log("🔍 Error checking sample items:", error.message);
              }
            }

            // Use a different approach - get invoice IDs that have matching products first
            if (productNames.length > 0 || productHsCodes.length > 0) {
              try {
                // First, find all invoice IDs that have items matching our products
                const { InvoiceItem } = req.tenantModels;

                // Debug: Check if we can find any invoice items at all
                const totalItems = await InvoiceItem.count();
                console.log("Total invoice items in database:", totalItems);

                // Debug: Check a sample item to see what columns exist
                const sampleItem = await InvoiceItem.findOne({
                  attributes: [
                    "id",
                    "invoice_id",
                    "name",
                    "hsCode",
                    "productDescription",
                  ],
                });
                console.log(
                  "Sample invoice item:",
                  sampleItem ? sampleItem.toJSON() : "No items found",
                );

                // Debug: Try to find items with the specific HS code we're looking for
                const testHsCode = productHsCodes[0];
                if (testHsCode) {
                  try {
                    const testItems = await InvoiceItem.findAll({
                      where: {
                        hsCode: testHsCode,
                      },
                      limit: 5,
                    });
                    console.log(
                      `Test items with HS code ${testHsCode}:`,
                      testItems.map((item) => ({
                        id: item.id,
                        invoice_id: item.invoice_id,
                        name: item.name,
                        hsCode: item.hsCode,
                        productDescription: item.productDescription,
                      })),
                    );
                  } catch (error) {
                    console.log(
                      `Error searching for HS code ${testHsCode}:`,
                      error.message,
                    );

                    // Try with raw SQL to see what columns exist
                    try {
                      const [results] = await req.tenantDb.query(
                        "DESCRIBE invoice_items",
                      );
                      console.log(
                        "Available columns in invoice_items:",
                        results.map((col) => col.Field),
                      );
                    } catch (descError) {
                      console.log("Error describing table:", descError.message);
                    }
                  }
                }

                const invoiceItemConditions = [];

                // Prioritize exact product name matching first
                if (productNames.length > 0) {
                  // Use exact matching for product names first
                  const nameConditions = [];
                  productNames.forEach((productName) => {
                    // Clean the product name for better matching
                    const cleanProductName = productName.trim();
                    if (cleanProductName) {
                      nameConditions.push({
                        [req.tenantDb.Sequelize.Op.or]: [
                          {
                            name: {
                              [req.tenantDb.Sequelize.Op.eq]: cleanProductName,
                            },
                          },
                          {
                            productDescription: {
                              [req.tenantDb.Sequelize.Op.eq]: cleanProductName,
                            },
                          },
                        ],
                      });
                    }
                  });

                  invoiceItemConditions.push({
                    [req.tenantDb.Sequelize.Op.or]: nameConditions,
                  });
                }

                // Add HS code matching as secondary criteria (only if no exact name matches)
                if (productHsCodes.length > 0 && productNames.length === 0) {
                  // Use partial matching for HS codes only if no product names specified
                  const hsCodeConditions = [];
                  productHsCodes.forEach((hsCode) => {
                    // Clean the HS code for better matching
                    const cleanHsCode = hsCode.trim();
                    if (cleanHsCode) {
                      hsCodeConditions.push({
                        hsCode: {
                          [req.tenantDb.Sequelize.Op.like]: `%${cleanHsCode}%`,
                        },
                      });
                    }
                  });

                  invoiceItemConditions.push({
                    [req.tenantDb.Sequelize.Op.or]: hsCodeConditions,
                  });
                }

                console.log("🔍 Product Filter Debug Info:");
                console.log(
                  "🔍 Product names we are searching for:",
                  productNames,
                );
                console.log(
                  "🔍 HS codes we are searching for:",
                  productHsCodes,
                );
                console.log(
                  "🔍 Invoice item search conditions:",
                  JSON.stringify(invoiceItemConditions, null, 2),
                );

                // Debug: Show what products were selected from the frontend
                console.log(
                  "🔍 Selected products from frontend:",
                  products.map((p) => ({
                    id: p.id,
                    name: p.name,
                    hsCode: p.hsCode,
                  })),
                );

                // Try to find matching items with the conditions
                let matchingItems = [];

                if (invoiceItemConditions.length > 0) {
                  matchingItems = await InvoiceItem.findAll({
                    where: {
                      [req.tenantDb.Sequelize.Op.or]: invoiceItemConditions,
                    },
                    attributes: [
                      "invoice_id",
                      "name",
                      "hsCode",
                      "productDescription",
                    ],
                    group: [
                      "invoice_id",
                      "name",
                      "hsCode",
                      "productDescription",
                    ],
                  });
                }

                console.log(
                  "🔍 Initial matching items found:",
                  matchingItems.length,
                );

                // If no items found with exact name search, try word boundary matching
                if (matchingItems.length === 0 && productNames.length > 0) {
                  console.log(
                    "🔍 No items found with exact name search, trying word boundary matching...",
                  );

                  const nameConditions = [];
                  productNames.forEach((productName) => {
                    const cleanProductName = productName.trim();
                    if (cleanProductName) {
                      // Use word boundary matching to avoid partial matches
                      nameConditions.push({
                        [req.tenantDb.Sequelize.Op.or]: [
                          {
                            name: {
                              [req.tenantDb.Sequelize.Op.regexp]:
                                `\\b${cleanProductName}\\b`,
                            },
                          },
                          {
                            productDescription: {
                              [req.tenantDb.Sequelize.Op.regexp]:
                                `\\b${cleanProductName}\\b`,
                            },
                          },
                        ],
                      });
                    }
                  });

                  if (nameConditions.length > 0) {
                    try {
                      matchingItems = await InvoiceItem.findAll({
                        where: {
                          [req.tenantDb.Sequelize.Op.or]: nameConditions,
                        },
                        attributes: [
                          "invoice_id",
                          "name",
                          "hsCode",
                          "productDescription",
                        ],
                        group: [
                          "invoice_id",
                          "name",
                          "hsCode",
                          "productDescription",
                        ],
                      });
                      console.log(
                        "🔍 Word boundary search found:",
                        matchingItems.length,
                        "items",
                      );
                    } catch (error) {
                      console.log(
                        "🔍 Word boundary search failed, trying partial matching as fallback...",
                      );
                      // Fallback to partial matching if regex fails
                      const partialConditions = [];
                      productNames.forEach((productName) => {
                        const cleanProductName = productName.trim();
                        if (cleanProductName) {
                          partialConditions.push({
                            [req.tenantDb.Sequelize.Op.or]: [
                              {
                                name: {
                                  [req.tenantDb.Sequelize.Op.like]:
                                    `%${cleanProductName}%`,
                                },
                              },
                              {
                                productDescription: {
                                  [req.tenantDb.Sequelize.Op.like]:
                                    `%${cleanProductName}%`,
                                },
                              },
                            ],
                          });
                        }
                      });

                      if (partialConditions.length > 0) {
                        matchingItems = await InvoiceItem.findAll({
                          where: {
                            [req.tenantDb.Sequelize.Op.or]: partialConditions,
                          },
                          attributes: [
                            "invoice_id",
                            "name",
                            "hsCode",
                            "productDescription",
                          ],
                          group: [
                            "invoice_id",
                            "name",
                            "hsCode",
                            "productDescription",
                          ],
                        });
                        console.log(
                          "🔍 Partial name search found:",
                          matchingItems.length,
                          "items",
                        );
                      }
                    }
                  }
                }

                // Only try HS code search if no product names were specified
                if (
                  matchingItems.length === 0 &&
                  productHsCodes.length > 0 &&
                  productNames.length === 0
                ) {
                  console.log(
                    "🔍 No product names specified, trying HS code only search...",
                  );

                  const hsCodeConditions = [];
                  productHsCodes.forEach((hsCode) => {
                    const cleanHsCode = hsCode.trim();
                    if (cleanHsCode) {
                      hsCodeConditions.push({
                        hsCode: {
                          [req.tenantDb.Sequelize.Op.eq]: cleanHsCode,
                        },
                      });
                    }
                  });

                  if (hsCodeConditions.length > 0) {
                    matchingItems = await InvoiceItem.findAll({
                      where: {
                        [req.tenantDb.Sequelize.Op.or]: hsCodeConditions,
                      },
                      attributes: [
                        "invoice_id",
                        "name",
                        "hsCode",
                        "productDescription",
                      ],
                      group: [
                        "invoice_id",
                        "name",
                        "hsCode",
                        "productDescription",
                      ],
                    });
                    console.log(
                      "🔍 HS code only search found:",
                      matchingItems.length,
                      "items",
                    );
                  }
                }

                console.log(
                  "🔍 Final matching items found:",
                  matchingItems.length,
                );
                console.log(
                  "🔍 Sample matching items:",
                  matchingItems.slice(0, 5).map((item) => ({
                    invoice_id: item.invoice_id,
                    name: item.name,
                    hsCode: item.hsCode,
                    productDescription: item.productDescription,
                  })),
                );

                // Debug: Show all matching items to understand what's being returned
                console.log(
                  "🔍 All matching items details:",
                  matchingItems.map((item) => ({
                    invoice_id: item.invoice_id,
                    name: item.name,
                    hsCode: item.hsCode,
                    productDescription: item.productDescription,
                    matches_search:
                      productNames.includes(item.name) ||
                      productNames.includes(item.productDescription),
                  })),
                );

                const matchingInvoiceIds = matchingItems.map(
                  (item) => item.invoice_id,
                );
                console.log(
                  "🔍 Found matching invoice IDs:",
                  matchingInvoiceIds,
                );

                if (matchingInvoiceIds.length > 0) {
                  whereClause.id = {
                    [req.tenantDb.Sequelize.Op.in]: matchingInvoiceIds,
                  };
                  console.log(
                    "🔍 Filtering invoices by matching invoice IDs:",
                    matchingInvoiceIds.length,
                    "invoices",
                  );
                } else {
                  console.log(
                    "🔍 No matching invoice items found, returning empty results",
                  );
                  whereClause.id = -1; // This will return no results
                }
              } catch (error) {
                console.error("Error finding matching invoice items:", error);
                whereClause.id = -1; // This will return no results
              }
            } else {
              console.log(
                "No valid product names or HS codes found, returning empty results",
              );
              whereClause.id = -1; // This will return no results
            }
          } else {
            console.log(
              "No products found for IDs:",
              productIds,
              "returning empty results",
            );
            whereClause.id = -1; // This will return no results
          }
        } else {
          console.log("No valid product IDs found, returning empty results");
          whereClause.id = -1; // This will return no results
        }
      } catch (error) {
        console.error("Error processing product filter:", error);
        whereClause.id = -1; // This will return no results
      }
    }

    whereClause.isDeleted = false;

    // Add date range filter

    if (start_date && end_date) {
      // Since invoiceDate is stored as STRING in database, we need to handle string comparison
      // Convert the date strings to proper format for comparison
      const startDateStr = start_date; // Already in YYYY-MM-DD format from frontend
      const endDateStr = end_date; // Already in YYYY-MM-DD format from frontend

      console.log("Invoice List Date Range Filter:", {
        start_date,
        end_date,
        startDateStr,
        endDateStr,
      });

      // Filter by invoiceDate using string comparison since it's stored as STRING
      // This handles both YYYY-MM-DD and DD-MM-YYYY formats that might be in the database
      whereClause[req.tenantDb.Sequelize.Op.or] = [
        // Handle YYYY-MM-DD format
        {
          invoiceDate: {
            [req.tenantDb.Sequelize.Op.between]: [startDateStr, endDateStr],
          },
        },
        // Handle DD-MM-YYYY format (convert and compare)
        {
          invoiceDate: {
            [req.tenantDb.Sequelize.Op.and]: [
              // Convert DD-MM-YYYY to YYYY-MM-DD for comparison
              req.tenantDb.Sequelize.where(
                req.tenantDb.Sequelize.fn(
                  "STR_TO_DATE",
                  req.tenantDb.Sequelize.col("invoiceDate"),
                  "%d-%m-%Y",
                ),
                {
                  [req.tenantDb.Sequelize.Op.between]: [
                    startDateStr,
                    endDateStr,
                  ],
                },
              ),
            ],
          },
        },
      ];
    }

    console.log("🔍 Final whereClause:", JSON.stringify(whereClause, null, 2));

    // Debug: Check total invoices in database
    const totalInvoices = await Invoice.count();
    console.log("🔍 Total invoices in database:", totalInvoices);

    // Debug: Check invoices without any filters to see what we have
    const allInvoices = await Invoice.findAll({
      limit: 5,
      attributes: ["id", "invoiceDate", "buyerBusinessName", "status"],
      order: [["created_at", "DESC"]],
    });
    console.log(
      "🔍 Sample invoices in database:",
      allInvoices.map((inv) => ({
        id: inv.id,
        invoiceDate: inv.invoiceDate,
        buyerBusinessName: inv.buyerBusinessName,
        status: inv.status,
      })),
    );

    // Debug: Check invoices without any filters
    const sampleInvoices = await Invoice.findAll({
      limit: 5,
      attributes: [
        "id",
        "invoiceDate",
        "buyerNTNCNIC",
        "buyerBusinessName",
        "created_by_user_id",
        "created_by_email",
      ],
      order: [["created_at", "DESC"]],
    });
    console.log(
      "Sample invoices in database:",
      sampleInvoices.map((inv) => ({
        id: inv.id,
        invoiceDate: inv.invoiceDate,
        buyerNTNCNIC: inv.buyerNTNCNIC,
        buyerBusinessName: inv.buyerBusinessName,
        created_by_user_id: inv.created_by_user_id,
        created_by_email: inv.created_by_email,
      })),
    );

    // Debug: Check invoices in date range without buyer filter
    if (start_date && end_date) {
      const startDateStr = start_date;
      const endDateStr = end_date;

      const dateRangeInvoices = await Invoice.findAll({
        where: {
          [req.tenantDb.Sequelize.Op.or]: [
            // Handle YYYY-MM-DD format
            {
              invoiceDate: {
                [req.tenantDb.Sequelize.Op.between]: [startDateStr, endDateStr],
              },
            },
            // Handle DD-MM-YYYY format (convert and compare)
            {
              invoiceDate: {
                [req.tenantDb.Sequelize.Op.and]: [
                  req.tenantDb.Sequelize.where(
                    req.tenantDb.Sequelize.fn(
                      "STR_TO_DATE",
                      req.tenantDb.Sequelize.col("invoiceDate"),
                      "%d-%m-%Y",
                    ),
                    {
                      [req.tenantDb.Sequelize.Op.between]: [
                        startDateStr,
                        endDateStr,
                      ],
                    },
                  ),
                ],
              },
            },
          ],
        },
        limit: 5,
        attributes: ["id", "invoiceDate", "buyerNTNCNIC", "buyerBusinessName"],
        order: [["created_at", "DESC"]],
      });
      console.log(
        "Invoices in date range (no buyer filter):",
        dateRangeInvoices.map((inv) => ({
          id: inv.id,
          invoiceDate: inv.invoiceDate,
          buyerNTNCNIC: inv.buyerNTNCNIC,
          buyerBusinessName: inv.buyerBusinessName,
        })),
      );
    }

    const { count, rows } = await Invoice.findAndCountAll({
      where: whereClause,
      logging: console.log,

      include: [
        {
          model: InvoiceItem,
          as: "InvoiceItems",
          required: false,
        },
      ],

      // Fix incorrect counts and pagination when using includes
      distinct: true,

      ...(limitNumber < 999999 && { limit: limitNumber }),
      ...(limitNumber < 999999 && { offset: offset }),

      order: [
        [sort_by, sort_order.toUpperCase()],
        ["created_at", "DESC"], // Secondary sort for consistent ordering
      ],
    });

    // Transform the data to match frontend expectations

    const transformedInvoices = rows.map((invoice) => {
      const plainInvoice = invoice.get({ plain: true });

      plainInvoice.items = plainInvoice.InvoiceItems || []; // 👈 normalize for EJS

      // Use FBR invoice number if available, otherwise use the original invoice number

      const displayInvoiceNumber =
        plainInvoice.fbr_invoice_number || plainInvoice.invoice_number;

      // Debug logging for invoice numbers

      console.log("Invoice display logic:", {
        id: plainInvoice.id,

        original_invoice_number: plainInvoice.invoice_number,

        fbr_invoice_number: plainInvoice.fbr_invoice_number,

        display_invoice_number: displayInvoiceNumber,

        status: plainInvoice.status,
      });

      return {
        id: plainInvoice.id,

        invoiceNumber: displayInvoiceNumber,

        systemInvoiceId: plainInvoice.system_invoice_id,

        invoiceType: plainInvoice.invoiceType,

        invoiceDate: plainInvoice.invoiceDate,

        sellerNTNCNIC: plainInvoice.sellerNTNCNIC,

        sellerFullNTN:
          req.tenant?.seller_full_ntn || plainInvoice.sellerFullNTN,

        sellerBusinessName: plainInvoice.sellerBusinessName,

        sellerProvince: plainInvoice.sellerProvince,

        sellerAddress: plainInvoice.sellerAddress,

        sellerCity: plainInvoice.sellerCity,

        buyerNTNCNIC: plainInvoice.buyerNTNCNIC,

        buyerBusinessName: plainInvoice.buyerBusinessName,

        buyerProvince: plainInvoice.buyerProvince,

        buyerAddress: plainInvoice.buyerAddress,

        buyerRegistrationType: plainInvoice.buyerRegistrationType,

        invoiceRefNo: plainInvoice.invoiceRefNo,

        transctypeId: plainInvoice.transctypeId,

        status: plainInvoice.status,

        companyInvoiceRefNo: plainInvoice.companyInvoiceRefNo,

        sourceInvoiceNo: plainInvoice.sourceInvoiceNo,

        fbr_invoice_number: plainInvoice.fbr_invoice_number,

        items: (plainInvoice.InvoiceItems || []).map((item) => ({
          ...item,

          retailPrice:
            item.fixedNotifiedValueOrRetailPrice || item.retailPrice || "0",
        })),

        created_at: plainInvoice.created_at,

        updated_at: plainInvoice.updated_at,
        ...(req.user?.role === "admin"
          ? {
              created_by_user_id: plainInvoice.created_by_user_id,
              created_by_email: plainInvoice.created_by_email,
              created_by_name: plainInvoice.created_by_name,
            }
          : {}),
      };
    });

    console.log("Query results - count:", count, "invoices found");
    console.log(
      "Sample invoice buyerNTNCNIC values:",
      transformedInvoices.slice(0, 3).map((inv) => ({
        id: inv.id,
        buyerNTNCNIC: inv.buyerNTNCNIC,
        buyerBusinessName: inv.buyerBusinessName,
      })),
    );

    // Debug: Check if there are any invoices with the buyer NTN/CNIC values
    if (
      whereClause.buyerNTNCNIC &&
      whereClause.buyerNTNCNIC[req.tenantDb.Sequelize.Op.in]
    ) {
      const matchingInvoices = await Invoice.findAll({
        where: {
          buyerNTNCNIC: whereClause.buyerNTNCNIC[req.tenantDb.Sequelize.Op.in],
        },
        attributes: ["id", "buyerNTNCNIC", "buyerBusinessName", "invoiceDate"],
        limit: 5,
      });
      console.log(
        "Invoices matching buyer NTN/CNIC filter:",
        matchingInvoices.map((inv) => ({
          id: inv.id,
          buyerNTNCNIC: inv.buyerNTNCNIC,
          buyerBusinessName: inv.buyerBusinessName,
          invoiceDate: inv.invoiceDate,
        })),
      );
    }

    res.status(200).json({
      success: true,

      data: {
        invoices: transformedInvoices,

        pagination: {
          current_page: limitNumber >= 999999 ? 1 : pageNumber,
          total_pages:
            limitNumber >= 999999 ? 1 : Math.ceil(count / limitNumber),
          total_records: count,
          records_per_page: limitNumber >= 999999 ? count : limitNumber,
        },
      },
    });
  } catch (error) {
    console.error("Error getting invoices:", error);

    res.status(500).json({
      success: false,

      message: "Error retrieving invoices",

      error: error.message,
    });
  }
};

// Get invoice by ID with items

export const getInvoiceById = async (req, res) => {
  try {
    const { Invoice, InvoiceItem } = req.tenantModels;

    const { id } = req.params;

    const invoice = await Invoice.findByPk(id, {
      include: [
        {
          model: InvoiceItem,
          as: "InvoiceItems",
          required: false,
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,

        message: "Invoice not found",
      });
    }

    // Transform the data to match frontend expectations

    const plainInvoice = invoice.get({ plain: true });

    plainInvoice.items = plainInvoice.InvoiceItems || []; // 👈 normalize for EJS

    const transformedInvoice = {
      id: plainInvoice.id,

      invoiceNumber: plainInvoice.invoice_number,

      systemInvoiceId: plainInvoice.system_invoice_id,

      invoiceType: plainInvoice.invoiceType,

      invoiceDate: plainInvoice.invoiceDate,

      sellerNTNCNIC: plainInvoice.sellerNTNCNIC,

      sellerFullNTN: req.tenant?.seller_full_ntn || plainInvoice.sellerFullNTN,

      sellerBusinessName: plainInvoice.sellerBusinessName,

      sellerProvince: plainInvoice.sellerProvince,

      sellerAddress: plainInvoice.sellerAddress,

      sellerCity: plainInvoice.sellerCity,

      buyerNTNCNIC: plainInvoice.buyerNTNCNIC,

      buyerBusinessName: plainInvoice.buyerBusinessName,

      buyerProvince: plainInvoice.buyerProvince,

      buyerAddress: plainInvoice.buyerAddress,

      buyerRegistrationType: plainInvoice.buyerRegistrationType,

      invoiceRefNo: plainInvoice.invoiceRefNo,

      transctypeId: plainInvoice.transctypeId,

      status: plainInvoice.status,

      companyInvoiceRefNo: plainInvoice.companyInvoiceRefNo,

      sourceInvoiceNo: plainInvoice.sourceInvoiceNo,

      fbr_invoice_number: plainInvoice.fbr_invoice_number,

      items: (plainInvoice.InvoiceItems || []).map((item) => ({
        ...item,

        retailPrice:
          item.fixedNotifiedValueOrRetailPrice || item.retailPrice || "0",
      })),

      created_at: plainInvoice.created_at,

      updated_at: plainInvoice.updated_at,
    };

    res.status(200).json({
      success: true,

      data: transformedInvoice,
    });
  } catch (error) {
    console.error("Error getting invoice:", error);

    res.status(500).json({
      success: false,

      message: "Error retrieving invoice",

      error: error.message,
    });
  }
};

// Get invoice by invoice number

export const getInvoiceByNumber = async (req, res) => {
  try {
    const { Invoice, InvoiceItem } = req.tenantModels;

    const { invoiceNumber } = req.params;

    const invoice = await Invoice.findOne({
      where: { invoice_number: invoiceNumber },

      include: [
        {
          model: InvoiceItem,
          as: "InvoiceItems",
          where: { isDeleted: false },
          required: false,
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,

        message: "Invoice not found",
      });
    }

    // Transform the data to match frontend expectations

    const plainInvoice = invoice.get({ plain: true });

    const transformedInvoice = {
      ...plainInvoice,

      sellerCity: plainInvoice.sellerCity,

      items: (plainInvoice.InvoiceItems || []).map((item) => ({
        ...item,

        retailPrice:
          item.fixedNotifiedValueOrRetailPrice || item.retailPrice || "0",
      })),
    };

    res.status(200).json({
      success: true,

      data: transformedInvoice,
    });
  } catch (error) {
    console.error("Error getting invoice by number:", error);

    res.status(500).json({
      success: false,

      message: "Error retrieving invoice",

      error: error.message,
    });
  }
};

// Print invoice

export const printInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    // Find invoice across all tenant databases

    const result = await TenantDatabaseService.findInvoiceAcrossTenants(id);

    if (!result) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const { invoice, tenantDb, tenant } = result;

    const { InvoiceItem } = tenantDb.models;

    // Fetch invoice with items using the already found invoice

    const invoiceWithItems = await invoice.constructor.findOne({
      where: { id: invoice.id },

      include: [{ model: InvoiceItem, as: "InvoiceItems" }],
    });

    if (!invoiceWithItems) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Base64 encode logos

    const fbrLogoBase64 = fs

      .readFileSync(path.join(process.cwd(), "public", "fbr_logo.png"))

      .toString("base64");

    const companyLogoBase64 = fs

      .readFileSync(path.join(process.cwd(), "public", "fbr-logo-1.png"))

      .toString("base64");

    const pakistanGumLogoBase64 = fs

      .readFileSync(
        path.join(process.cwd(), "public", "images", "Pakprogressive.png"),
      )

      .toString("base64");

    // Prepare paths

    const pdfFileName = `${invoiceWithItems.invoice_number}.pdf`;

    const invoiceDir = path.join(process.cwd(), "public", "invoices");

    const pdfPath = path.join(invoiceDir, pdfFileName);

    // Ensure output directory exists

    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    // Generate QR code

    const qrUrl = invoiceWithItems.invoice_number;

    const qrData = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: "M",

      width: 96,
    });

    const plainInvoice = invoiceWithItems.get({ plain: true });

    plainInvoice.items = plainInvoice.InvoiceItems || []; // 👈 normalize for EJS

    // Format date to dd-mm-yyyy (timezone-safe)
    const formatDate = (dateString) => {
      if (!dateString) return "N/A";
      try {
        // Pure date saved as YYYY-MM-DD? Avoid timezone shift
        const pure = /^\d{4}-\d{2}-\d{2}$/.exec(dateString);
        if (pure) {
          const [y, m, d] = dateString.split("-");
          return `${d}-${m}-${y}`;
        }

        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "N/A";

        const day = String(date.getUTCDate()).padStart(2, "0");
        const month = String(date.getUTCMonth() + 1).padStart(2, "0");
        const year = date.getUTCFullYear();

        return `${day}-${month}-${year}`;
      } catch (error) {
        return "N/A";
      }
    };

    // Format the invoice date

    plainInvoice.invoiceDate = formatDate(plainInvoice.invoiceDate);

    // Ensure latest seller details from master tenant record are used
    if (tenant) {
      // When coming from findInvoiceAcrossTenants, tenant fields are camelCase
      plainInvoice.sellerBusinessName =
        tenant.sellerBusinessName || plainInvoice.sellerBusinessName;
      plainInvoice.sellerAddress =
        tenant.sellerAddress || plainInvoice.sellerAddress;
      plainInvoice.sellerProvince =
        tenant.sellerProvince || plainInvoice.sellerProvince;
      plainInvoice.sellerFullNTN =
        tenant.sellerFullNTN || plainInvoice.sellerFullNTN;
      // Some templates read underscore variant
      plainInvoice.seller_full_ntn =
        tenant.sellerFullNTN || plainInvoice.seller_full_ntn;
    }

    // Render EJS HTML

    const html = await ejs.renderFile(
      path.join(process.cwd(), "src", "views", "invoiceTemplate.ejs"),

      {
        invoice: plainInvoice,

        qrData,

        fbrLogoBase64,

        companyLogoBase64,

        pakistanGumLogoBase64,

        showFbrLogo: invoiceWithItems.status === "posted", // Only show FBR logo for posted invoices

        showQRCode: invoiceWithItems.status === "posted", // Only show QR code for posted invoices

        convertToWords: (amount) => {
          if (!amount || isNaN(amount)) return "Zero Rupees Only";

          const rupees = Math.floor(amount);

          const paisa = Math.round((amount - rupees) * 100);

          let result = "";

          if (rupees > 0) {
            const rupeesWords = toWords(rupees);

            result =
              rupeesWords.replace(/,/g, "").charAt(0).toUpperCase() +
              rupeesWords.replace(/,/g, "").slice(1) +
              " Rupees";
          }

          if (paisa > 0) {
            if (result) result += " and ";

            const paisaWords = toWords(paisa);

            result +=
              paisaWords.replace(/,/g, "").charAt(0).toLowerCase() +
              paisaWords.replace(/,/g, "").slice(1) +
              " Paisa";
          }

          if (!result) result = "Zero Rupees";

          result += " Only";

          return result;
        },
      },
    );

    // Generate PDF using Puppeteer

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "networkidle0" });

    await page.pdf({ path: pdfPath, format: "A4", printBackground: true });

    await browser.close();

    // Stream PDF to browser

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader("Content-Disposition", `inline; filename=${pdfFileName}`);

    fs.createReadStream(pdfPath).pipe(res);
  } catch (error) {
    console.error("PDF generation failed:", error);

    res.status(500).json({
      message: "Error generating invoice",

      error: error.message,
    });
  }
};

// Update invoice

export const updateInvoice = async (req, res) => {
  try {
    const { Invoice } = req.tenantModels;

    const { id } = req.params;

    const updateData = req.body;

    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,

        message: "Invoice not found",
      });
    }

    // Get old invoice items for backup
    const oldInvoiceItems = await req.tenantModels.InvoiceItem.findAll({
      where: { invoice_id: invoice.id },
    });

    // Store old values for audit BEFORE updating
    const oldValues = {
      // Basic Invoice Information
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      system_invoice_id: invoice.system_invoice_id,
      status: invoice.status,
      fbr_invoice_number: invoice.fbr_invoice_number,
      invoiceType: invoice.invoiceType,
      invoiceDate: invoice.invoiceDate,
      invoiceRefNo: invoice.invoiceRefNo,
      companyInvoiceRefNo: invoice.companyInvoiceRefNo,
      internal_invoice_no: invoice.internal_invoice_no,
      transctypeId: invoice.transctypeId,

      // Complete Seller Information
      sellerNTNCNIC: invoice.sellerNTNCNIC,
      sellerFullNTN: invoice.sellerFullNTN,
      sellerBusinessName: invoice.sellerBusinessName,
      sellerProvince: invoice.sellerProvince,
      sellerAddress: invoice.sellerAddress,
      sellerCity: invoice.sellerCity,

      // Complete Buyer Information
      buyerNTNCNIC: invoice.buyerNTNCNIC,
      buyerBusinessName: invoice.buyerBusinessName,
      buyerProvince: invoice.buyerProvince,
      buyerAddress: invoice.buyerAddress,
      buyerRegistrationType: invoice.buyerRegistrationType,

      // Financial Information
      totalAmount: invoice.totalAmount,

      // Complete Invoice Items with All Details
      invoice_items: oldInvoiceItems.map((item) => ({
        id: item.id,
        product_name: item.name,
        hsCode: item.hsCode,
        productDescription: item.productDescription,
        quantity: item.quantity,
        rate: item.rate,
        uoM: item.uoM,
        unitPrice: item.unitPrice,
        totalValues: item.totalValues,
        valueSalesExcludingST: item.valueSalesExcludingST,
        fixedNotifiedValueOrRetailPrice: item.fixedNotifiedValueOrRetailPrice,
        salesTaxApplicable: item.salesTaxApplicable,
        salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
        extraTax: item.extraTax,
        furtherTax: item.furtherTax,
        sroScheduleNo: item.sroScheduleNo,
        fedPayable: item.fedPayable,
        advanceIncomeTax: item.advanceIncomeTax,
        discount: item.discount,
        saleType: item.saleType,
        sroItemSerialNo: item.sroItemSerialNo,
        billOfLadingUoM: item.billOfLadingUoM,
      })),
    };

    // Ensure invoice has a sourceInvoiceNo, if not already present
    if (!invoice.sourceInvoiceNo && !updateData.sourceInvoiceNo) {
      updateData.sourceInvoiceNo = await generateUniqueSourceInvoiceNo(Invoice);
    }

    // Update the invoice
    await invoice.update(updateData);

    // Reload the invoice to get the updated values
    await invoice.reload();

    // Get updated invoice items for backup
    const newInvoiceItems = await req.tenantModels.InvoiceItem.findAll({
      where: { invoice_id: invoice.id },
    });

    // Prepare new values for audit
    const newValues = {
      // Basic Invoice Information
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      system_invoice_id: invoice.system_invoice_id,
      status: invoice.status,
      fbr_invoice_number: invoice.fbr_invoice_number,
      invoiceType: invoice.invoiceType,
      invoiceDate: invoice.invoiceDate,
      invoiceRefNo: invoice.invoiceRefNo,
      companyInvoiceRefNo: invoice.companyInvoiceRefNo,
      internal_invoice_no: invoice.internal_invoice_no,
      transctypeId: invoice.transctypeId,

      // Complete Seller Information
      sellerNTNCNIC: invoice.sellerNTNCNIC,
      sellerFullNTN: invoice.sellerFullNTN,
      sellerBusinessName: invoice.sellerBusinessName,
      sellerProvince: invoice.sellerProvince,
      sellerAddress: invoice.sellerAddress,
      sellerCity: invoice.sellerCity,

      // Complete Buyer Information
      buyerNTNCNIC: invoice.buyerNTNCNIC,
      buyerBusinessName: invoice.buyerBusinessName,
      buyerProvince: invoice.buyerProvince,
      buyerAddress: invoice.buyerAddress,
      buyerRegistrationType: invoice.buyerRegistrationType,

      // Financial Information
      totalAmount: invoice.totalAmount,

      // Complete Invoice Items with All Details
      invoice_items: newInvoiceItems.map((item) => ({
        id: item.id,
        product_name: item.name,
        hsCode: item.hsCode,
        productDescription: item.productDescription,
        quantity: item.quantity,
        rate: item.rate,
        uoM: item.uoM,
        unitPrice: item.unitPrice,
        totalValues: item.totalValues,
        valueSalesExcludingST: item.valueSalesExcludingST,
        fixedNotifiedValueOrRetailPrice: item.fixedNotifiedValueOrRetailPrice,
        salesTaxApplicable: item.salesTaxApplicable,
        salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
        extraTax: item.extraTax,
        furtherTax: item.furtherTax,
        sroScheduleNo: item.sroScheduleNo,
        fedPayable: item.fedPayable,
        advanceIncomeTax: item.advanceIncomeTax,
        discount: item.discount,
        saleType: item.saleType,
        sroItemSerialNo: item.sroItemSerialNo,
        billOfLadingUoM: item.billOfLadingUoM,
      })),
    };

    // Create backup for invoice edit
    try {
      await InvoiceBackupService.createEditBackup({
        tenantDb: req.tenantDb,
        tenantModels: req.tenantModels,
        oldInvoice: { ...oldValues, id: invoice.id },
        newInvoice: invoice,
        oldInvoiceItems: oldInvoiceItems,
        newInvoiceItems: newInvoiceItems,
        user: req.user,
        tenant: req.tenant,
        request: {
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get ? req.get("User-Agent") : null,
          requestId: req.headers?.["x-request-id"] || null,
        },
      });
    } catch (backupError) {
      console.error("❌ Error creating edit backup:", backupError);
      // Don't fail the main operation if backup fails
    }

    // Log audit event for invoice update
    await logAuditEvent(
      req,
      "invoice",
      invoice.id,
      "UPDATE",
      oldValues, // oldValues (before update)
      newValues, // newValues (after update)
      {
        entityName: invoice.invoice_number || invoice.system_invoice_id,
        endpoint: req.originalUrl,
        method: req.method,
      },
    );

    res.status(200).json({
      success: true,

      message: "Invoice updated successfully",

      data: invoice,
    });
  } catch (error) {
    console.error("Error updating invoice:", error);

    res.status(500).json({
      success: false,

      message: "Error updating invoice",

      error: error.message,
    });
  }
};

// Delete invoice

export const deleteInvoice = async (req, res) => {
  try {
    const { Invoice, InvoiceItem } = req.tenantModels;

    const { id } = req.params;

    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,

        message: "Invoice not found",
      });
    }

    // Get invoice items before deletion
    const invoiceItems = await InvoiceItem.findAll({
      where: { invoice_id: invoice.id },
    });

    // Store old values for audit before deletion
    const oldValues = {
      // Basic Invoice Information
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      system_invoice_id: invoice.system_invoice_id,
      status: invoice.status,
      fbr_invoice_number: invoice.fbr_invoice_number,
      invoiceType: invoice.invoiceType,
      invoiceDate: invoice.invoiceDate,
      invoiceRefNo: invoice.invoiceRefNo,
      companyInvoiceRefNo: invoice.companyInvoiceRefNo,
      internal_invoice_no: invoice.internal_invoice_no,
      transctypeId: invoice.transctypeId,

      // Complete Seller Information
      sellerNTNCNIC: invoice.sellerNTNCNIC,
      sellerFullNTN: invoice.sellerFullNTN,
      sellerBusinessName: invoice.sellerBusinessName,
      sellerProvince: invoice.sellerProvince,
      sellerAddress: invoice.sellerAddress,
      sellerCity: invoice.sellerCity,

      // Complete Buyer Information
      buyerNTNCNIC: invoice.buyerNTNCNIC,
      buyerBusinessName: invoice.buyerBusinessName,
      buyerProvince: invoice.buyerProvince,
      buyerAddress: invoice.buyerAddress,
      buyerRegistrationType: invoice.buyerRegistrationType,

      // Financial Information
      totalAmount: invoice.totalAmount,

      // Complete Invoice Items with All Details
      invoice_items: invoiceItems.map((item) => ({
        id: item.id,
        product_name: item.name,
        hsCode: item.hsCode,
        productDescription: item.productDescription,
        quantity: item.quantity,
        rate: item.rate,
        uoM: item.uoM,
        unitPrice: item.unitPrice,
        totalValues: item.totalValues,
        valueSalesExcludingST: item.valueSalesExcludingST,
        fixedNotifiedValueOrRetailPrice: item.fixedNotifiedValueOrRetailPrice,
        salesTaxApplicable: item.salesTaxApplicable,
        salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
        extraTax: item.extraTax,
        furtherTax: item.furtherTax,
        sroScheduleNo: item.sroScheduleNo,
        fedPayable: item.fedPayable,
        advanceIncomeTax: item.advanceIncomeTax,
        discount: item.discount,
        saleType: item.saleType,
        sroItemSerialNo: item.sroItemSerialNo,
        billOfLadingUoM: item.billOfLadingUoM,
      })),
    };

    // Soft delete invoice items
    await req.tenantModels.InvoiceItem.update(
      { isDeleted: true },
      {
        where: { invoice_id: invoice.id },
      },
    );

    // Soft delete the invoice
    await invoice.update({ isDeleted: true });

    // Check if this is an automatic deletion during FBR submission
    // This happens when a saved invoice is deleted right after submitting to FBR
    let isAutomaticDeletion = false;
    try {
      // Only check for automatic deletion if invoice status is "saved" or "draft"
      if (invoice.status === "saved" || invoice.status === "draft") {
        // Check if there's a recent SUBMIT_TO_FBR operation by the same user within the last 2 minutes
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        const userId = req.user?.id || req.user?.userId;

        console.log(
          `🔍 Checking for automatic deletion - Invoice #${invoice.id}, Status: ${invoice.status}, User ID: ${userId}`,
        );

        if (userId) {
          const recentFbrSubmission = await AuditLog.findOne({
            where: {
              entityType: "invoice",
              operation: "SUBMIT_TO_FBR",
              userId: userId,
              created_at: {
                [Op.gte]: twoMinutesAgo,
              },
            },
            order: [["created_at", "DESC"]],
          });

          // If there's a recent FBR submission, this is likely an automatic deletion
          if (recentFbrSubmission) {
            isAutomaticDeletion = true;
            console.log(
              `✅ Marking invoice #${invoice.id} deletion as automatic - recent FBR submission found (ID: ${recentFbrSubmission.id}, created: ${recentFbrSubmission.created_at})`,
            );
          } else {
            console.log(
              `❌ Invoice #${invoice.id} deletion is NOT automatic - no recent FBR submission found`,
            );
          }
        } else {
          console.log(
            `⚠️ Cannot check for automatic deletion - no user ID available`,
          );
        }
      } else {
        console.log(
          `ℹ️ Invoice #${invoice.id} deletion is NOT automatic - status is "${invoice.status}" (not "saved" or "draft")`,
        );
      }
    } catch (checkError) {
      console.error("❌ Error checking for automatic deletion:", checkError);
      // Continue with normal deletion logging if check fails
    }

    // Log audit event for invoice deletion
    await logAuditEvent(
      req,
      "invoice",
      invoice.id,
      "DELETE",
      oldValues, // oldValues
      null, // newValues (null for deletion)
      {
        entityName: invoice.invoice_number || invoice.system_invoice_id,
        endpoint: req.originalUrl,
        method: req.method,
        isAutomaticDeletion: isAutomaticDeletion,
        deletedInvoiceStatus: invoice.status,
      },
    );

    res.status(200).json({
      success: true,

      message: "Invoice deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);

    res.status(500).json({
      success: false,

      message: "Error deleting invoice",

      error: error.message,
    });
  }
};

export const recoverInvoice = async (req, res) => {
  try {
    const { Invoice, InvoiceItem } = req.tenantModels;

    const { id } = req.params;

    const invoice = await Invoice.findByPk(id);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    if (!invoice.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Invoice is not deleted",
      });
    }

    await req.tenantDb.transaction(async (t) => {
      await InvoiceItem.update(
        { isDeleted: false },
        {
          where: { invoice_id: invoice.id },
          transaction: t,
        },
      );

      await invoice.update(
        { isDeleted: false },
        {
          transaction: t,
        },
      );
    });

    try {
      await AuditLog.destroy({
        where: {
          entityType: "invoice",
          entityId: invoice.id,
          operation: "DELETE",
        },
      });
    } catch (auditError) {
      console.error(
        "Error deleting DELETE audit logs during invoice recovery:",
        auditError,
      );
    }

    const invoiceItems = await InvoiceItem.findAll({
      where: { invoice_id: invoice.id, isDeleted: false },
    });

    const newValues = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      system_invoice_id: invoice.system_invoice_id,
      status: invoice.status,
      fbr_invoice_number: invoice.fbr_invoice_number,
      invoiceType: invoice.invoiceType,
      invoiceDate: invoice.invoiceDate,
      invoiceRefNo: invoice.invoiceRefNo,
      companyInvoiceRefNo: invoice.companyInvoiceRefNo,
      internal_invoice_no: invoice.internal_invoice_no,
      transctypeId: invoice.transctypeId,
      sellerNTNCNIC: invoice.sellerNTNCNIC,
      sellerFullNTN: invoice.sellerFullNTN,
      sellerBusinessName: invoice.sellerBusinessName,
      sellerProvince: invoice.sellerProvince,
      sellerAddress: invoice.sellerAddress,
      sellerCity: invoice.sellerCity,
      buyerNTNCNIC: invoice.buyerNTNCNIC,
      buyerBusinessName: invoice.buyerBusinessName,
      buyerProvince: invoice.buyerProvince,
      buyerAddress: invoice.buyerAddress,
      buyerRegistrationType: invoice.buyerRegistrationType,
      totalAmount: invoice.totalAmount,
      invoice_items: invoiceItems.map((item) => ({
        id: item.id,
        product_name: item.name,
        hsCode: item.hsCode,
        productDescription: item.productDescription,
        quantity: item.quantity,
        rate: item.rate,
        uoM: item.uoM,
        unitPrice: item.unitPrice,
        totalValues: item.totalValues,
        valueSalesExcludingST: item.valueSalesExcludingST,
        fixedNotifiedValueOrRetailPrice: item.fixedNotifiedValueOrRetailPrice,
        salesTaxApplicable: item.salesTaxApplicable,
        salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
        extraTax: item.extraTax,
        furtherTax: item.furtherTax,
        sroScheduleNo: item.sroScheduleNo,
        fedPayable: item.fedPayable,
        advanceIncomeTax: item.advanceIncomeTax,
        discount: item.discount,
        saleType: item.saleType,
        sroItemSerialNo: item.sroItemSerialNo,
        billOfLadingUoM: item.billOfLadingUoM,
      })),
    };

    await logAuditEvent(
      req,
      "invoice",
      invoice.id,
      "RECOVER",
      null,
      newValues,
      {
        entityName: invoice.invoice_number || invoice.system_invoice_id,
        endpoint: req.originalUrl,
        method: req.method,
      },
    );

    res.status(200).json({
      success: true,
      message: "Invoice recovered successfully",
    });
  } catch (error) {
    console.error("Error recovering invoice:", error);

    res.status(500).json({
      success: false,
      message: "Error recovering invoice",
      error: error.message,
    });
  }
};

// Get invoice statistics

export const getInvoiceStats = async (req, res) => {
  try {
    const { Invoice } = req.tenantModels;

    const { start_date, end_date } = req.query;

    const whereClause = {};

    if (start_date && end_date) {
      const startDateStr = start_date;
      const endDateStr = end_date;

      // Filter by invoiceDate using string comparison since it's stored as STRING
      // This handles both YYYY-MM-DD and DD-MM-YYYY formats that might be in the database
      whereClause[req.tenantDb.Sequelize.Op.or] = [
        // Handle YYYY-MM-DD format
        {
          invoiceDate: {
            [req.tenantDb.Sequelize.Op.between]: [startDateStr, endDateStr],
          },
        },
        // Handle DD-MM-YYYY format (convert and compare)
        {
          invoiceDate: {
            [req.tenantDb.Sequelize.Op.and]: [
              // Convert DD-MM-YYYY to YYYY-MM-DD for comparison
              req.tenantDb.Sequelize.where(
                req.tenantDb.Sequelize.fn(
                  "STR_TO_DATE",
                  req.tenantDb.Sequelize.col("invoiceDate"),
                  "%d-%m-%Y",
                ),
                {
                  [req.tenantDb.Sequelize.Op.between]: [
                    startDateStr,
                    endDateStr,
                  ],
                },
              ),
            ],
          },
        },
      ];
    }

    // Add user filter for non-admin users
    if (req.userType === "user" && req.user?.role !== "admin") {
      const userId = req.user?.userId || req.user?.id;
      if (userId) {
        whereClause.created_by_user_id = userId;
      }
    }

    const totalInvoices = await Invoice.count({ where: whereClause });

    const totalAmount = await Invoice.sum("totalValues", {
      where: whereClause,
    });

    // Get invoices by month

    const monthlyStats = await Invoice.findAll({
      attributes: [
        [
          req.tenantDb.Sequelize.fn(
            "DATE_FORMAT",

            req.tenantDb.Sequelize.col("created_at"),

            "%Y-%m",
          ),

          "month",
        ],

        [
          req.tenantDb.Sequelize.fn("COUNT", req.tenantDb.Sequelize.col("id")),

          "count",
        ],

        [
          req.tenantDb.Sequelize.fn(
            "SUM",

            req.tenantDb.Sequelize.col("totalValues"),
          ),

          "total_amount",
        ],
      ],

      where: whereClause,

      group: [
        req.tenantDb.Sequelize.fn(
          "DATE_FORMAT",

          req.tenantDb.Sequelize.col("created_at"),

          "%Y-%m",
        ),
      ],

      order: [
        [
          req.tenantDb.Sequelize.fn(
            "DATE_FORMAT",

            Sequelize.col("created_at"),

            "%Y-%m",
          ),

          "DESC",
        ],
      ],
    });

    res.status(200).json({
      success: true,

      data: {
        total_invoices: totalInvoices,

        total_amount: totalAmount || 0,

        monthly_stats: monthlyStats,
      },
    });
  } catch (error) {
    console.error("Error getting invoice stats:", error);

    res.status(500).json({
      success: false,

      message: "Error retrieving invoice statistics",

      error: error.message,
    });
  }
};

// Submit saved invoice to FBR

export const submitSavedInvoice = async (req, res) => {
  try {
    const { Invoice, InvoiceItem } = req.tenantModels;

    const { id } = req.params;

    // Find the invoice

    const invoice = await Invoice.findByPk(id, {
      include: [
        {
          model: InvoiceItem,

          as: "InvoiceItems",
        },
      ],
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,

        message: "Invoice not found",
      });
    }

    if (invoice.status !== "draft") {
      return res.status(400).json({
        success: false,

        message: "Only draft invoices can be posted to FBR",
      });
    }

    // Check if transctypeId is provided

    if (!invoice.transctypeId) {
      return res.status(400).json({
        success: false,

        message:
          "Transaction Type ID is required. Please select a transaction type before submitting to FBR.",
      });
    }

    // Helper functions for data cleaning

    const cleanValue = (value) => {
      if (value === null || value === undefined || value === "") return null;

      return String(value).trim();
    };

    const cleanNumericValue = (value) => {
      const cleaned = cleanValue(value);

      if (cleaned === null) return null;

      const num = parseFloat(cleaned);

      return isNaN(num) ? null : num;
    };

    // Prepare data for FBR submission

    const fbrData = {
      invoiceType: cleanValue(invoice.invoiceType),

      invoiceDate: cleanValue(invoice.invoiceDate),

      sellerNTNCNIC: cleanValue(invoice.sellerNTNCNIC),

      sellerBusinessName: cleanValue(invoice.sellerBusinessName),

      sellerProvince: cleanValue(invoice.sellerProvince),

      sellerAddress: cleanValue(invoice.sellerAddress),

      buyerNTNCNIC: cleanValue(invoice.buyerNTNCNIC),

      buyerBusinessName: cleanValue(invoice.buyerBusinessName),

      buyerProvince: cleanValue(invoice.buyerProvince),

      buyerAddress: cleanValue(invoice.buyerAddress)
        ? cleanValue(invoice.buyerAddress).replace(/\n/g, " ")
        : cleanValue(invoice.buyerAddress),

      buyerRegistrationType: cleanValue(invoice.buyerRegistrationType),

      invoiceRefNo: cleanValue(invoice.invoiceRefNo),

      // FBR expects camelCase key: transctypeId

      transctypeId: cleanValue(invoice.transctypeId),

      items: invoice.InvoiceItems.map((item) => {
        // Handle RS. rate format for FBR submission

        let processedRate = cleanValue(item.rate);

        console.log(
          `Processing rate for item ${item.id}: Original="${item.rate}", Cleaned="${processedRate}"`,
        );

        if (
          processedRate &&
          (processedRate.includes("RS.") ||
            processedRate.includes("rs.") ||
            processedRate.includes("Rs."))
        ) {
          // For RS. format, we need to convert it to a format FBR accepts

          // Extract the numeric value and set it as a standard rate

          const numericValue =
            parseFloat(processedRate.replace(/RS\./i, "").trim()) || 0;

          // Check the sales type to determine the appropriate rate

          const saleType = cleanValue(item.saleType) || "";

          if (saleType.includes("Reduced Rate")) {
            processedRate = 12; // Use reduced rate for FBR
          } else if (
            saleType.includes("zero-rate") ||
            saleType.includes("Zero")
          ) {
            processedRate = 0; // Use zero rate for FBR
          } else {
            processedRate = 17; // Use standard rate for FBR
          }

          console.log(
            `RS. rate detected and converted: "${item.rate}" -> "${processedRate}" (using ${saleType} rate for FBR, fixed amount: ${numericValue})`,
          );
        }

        const baseItem = {
          hsCode: cleanValue(item.hsCode).substring(0, 50),

          productDescription: cleanValue(item.productDescription)
            ? cleanValue(item.productDescription).replace(/\n/g, " ")
            : cleanValue(item.productDescription),

          rate: processedRate,

          uoM: cleanValue(item.uoM),

          quantity: cleanNumericValue(item.quantity),

          unitPrice: cleanNumericValue(item.unitPrice),

          totalValues: cleanNumericValue(item.totalValues),

          valueSalesExcludingST: cleanNumericValue(item.valueSalesExcludingST),

          fixedNotifiedValueOrRetailPrice: cleanNumericValue(
            item.fixedNotifiedValueOrRetailPrice,
          ),

          salesTaxApplicable: cleanNumericValue(item.salesTaxApplicable),

          salesTaxWithheldAtSource: cleanNumericValue(
            item.salesTaxWithheldAtSource,
          ),

          furtherTax: cleanNumericValue(item.furtherTax),

          sroScheduleNo: cleanValue(item.sroScheduleNo),

          fedPayable: cleanNumericValue(item.fedPayable),

          discount: cleanNumericValue(item.discount),

          saleType: cleanValue(item.saleType),

          sroItemSerialNo: cleanValue(item.sroItemSerialNo),
          invoiceItemNo: cleanValue(item.invoiceItemNo) || "",
        };

        // Only include extraTax when it's a positive value (> 0) and not applicable for reduced/exempt

        const extraTaxValue = cleanNumericValue(item.extraTax);

        const isReduced =
          (cleanValue(item.saleType) || "").trim() === "Goods at Reduced Rate";

        const rateValue = cleanValue(item.rate) || "";

        const isExempt =
          typeof rateValue === "string" && rateValue.toLowerCase() === "exempt";

        if (
          extraTaxValue !== null &&
          Number(extraTaxValue) > 0 &&
          !isReduced &&
          !isExempt
        ) {
          baseItem.extraTax = extraTaxValue;
        }

        return baseItem;
      }),
    };

    // Debug: Log the cleaned data being sent to FBR

    console.log(
      "Cleaned FBR data being sent:",

      JSON.stringify(fbrData, null, 2),
    );

    // Additional debug: Log rate processing summary

    console.log("Rate processing summary:");

    fbrData.items.forEach((item, index) => {
      console.log(
        `  Item ${index + 1}: rate="${item.rate}", salesTaxApplicable="${item.salesTaxApplicable}", saleType="${item.saleType}"`,
      );
    });

    // Get tenant FBR token from the tenant middleware

    if (!req.tenant || !req.tenant.sandboxTestToken) {
      return res.status(400).json({
        success: false,

        message: "FBR token not found for this tenant",
      });
    }

    // Import FBR API functions

    const { postData } = await import("../../service/FBRService.js");

    // Backup creation moved to after response to include both request and response data

    // Submit directly to FBR (skipping validation)

    const postRes = await postData(
      "di_data/v1/di/postinvoicedata_sb",

      fbrData,

      "sandbox",

      req.tenant.sandboxTestToken,
    );

    console.log("FBR Response:", JSON.stringify(postRes.data, null, 2));

    console.log("FBR Response Type:", typeof postRes.data);

    // Create backup for FBR submission (Request + Response)
    try {
      await InvoiceBackupService.createFbrSubmissionBackup({
        tenantDb: req.tenantDb,
        tenantModels: req.tenantModels,
        invoice: invoice,
        fbrRequestData: fbrData,
        fbrResponseData: postRes.data,
        user: req.user,
        tenant: req.tenant,
        request: {
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get ? req.get("User-Agent") : null,
          requestId: req.headers?.["x-request-id"] || null,
        },
      });
    } catch (backupError) {
      console.error("❌ Error creating FBR response backup:", backupError);
      // Don't fail the main operation if backup fails
    }

    const dataSizeInfo = Array.isArray(postRes.data)
      ? postRes.data.length
      : typeof postRes.data === "object" && postRes.data !== null
        ? Object.keys(postRes.data).length
        : typeof postRes.data === "string"
          ? postRes.data.length
          : 0;

    console.log("FBR Response Data Size:", dataSizeInfo);

    // Handle different FBR response structures

    let isSuccess = false;

    let fbrInvoiceNumber = null;

    let errorDetails = null;

    if (postRes.status === 200) {
      // Check for validationResponse structure (old format)

      if (postRes.data && postRes.data.validationResponse) {
        const validation = postRes.data.validationResponse;

        isSuccess = validation.statusCode === "00";

        fbrInvoiceNumber = postRes.data.invoiceNumber;

        console.log("FBR Response - validationResponse format:", {
          statusCode: validation.statusCode,

          isSuccess,

          fbrInvoiceNumber,
        });

        if (!isSuccess) {
          errorDetails = validation;
        }
      }

      // Check for direct response structure (new format)
      else if (
        postRes.data &&
        (postRes.data.invoiceNumber || postRes.data.success)
      ) {
        isSuccess = true;

        fbrInvoiceNumber = postRes.data.invoiceNumber;

        console.log("FBR Response - direct format:", {
          isSuccess,

          fbrInvoiceNumber,

          success: postRes.data.success,
        });
      }

      // Check for error response structure
      else if (postRes.data && postRes.data.error) {
        isSuccess = false;

        errorDetails = postRes.data;

        console.log("FBR Response - error format:", postRes.data.error);
      }

      // Check for empty response - this might be a successful submission
      else if (!postRes.data || postRes.data === "") {
        console.log(
          "FBR returned empty response with 200 status - treating as successful submission",
        );

        isSuccess = true;

        // For empty responses, we'll use the original invoice number as FBR invoice number

        fbrInvoiceNumber = req.body.invoice_number || `FBR_${Date.now()}`;

        console.log(
          "Using original invoice number as FBR invoice number:",

          fbrInvoiceNumber,
        );
      }

      // If response is unexpected, treat as success if status is 200
      else {
        isSuccess = true;

        console.log(
          "FBR returned 200 status with unexpected response structure, treating as success",
        );

        console.log("Unexpected response structure:", postRes.data);
      }
    } else {
      console.log("FBR returned non-200 status:", postRes.status);
    }

    if (!isSuccess) {
      const details = errorDetails || {
        raw: postRes.data ?? null,

        note: "Unexpected FBR response structure",

        status: postRes.status,
      };

      const collectErrorMessages = (det) => {
        const messages = [];

        if (det && typeof det === "object") {
          if (det.error) messages.push(det.error);

          if (Array.isArray(det.invoiceStatuses)) {
            det.invoiceStatuses.forEach((s) => {
              if (s?.error) messages.push(`Item ${s.itemSNo}: ${s.error}`);
            });
          }

          if (det.validationResponse) {
            const v = det.validationResponse;

            if (v?.error) messages.push(v.error);

            if (Array.isArray(v?.invoiceStatuses)) {
              v.invoiceStatuses.forEach((s) => {
                if (s?.error) messages.push(`Item ${s.itemSNo}: ${s.error}`);
              });
            }
          }
        }

        return messages.filter(Boolean);
      };

      const errorMessages = collectErrorMessages(details);

      const message = errorMessages.length
        ? `FBR submission failed: ${errorMessages.join("; ")}`
        : "FBR submission failed";

      return res.status(400).json({
        success: false,

        message,

        code:
          details?.statusCode ||
          details?.errorCode ||
          details?.validationResponse?.statusCode,

        details,
      });
    }

    // Ensure we have a valid FBR invoice number before updating

    if (!fbrInvoiceNumber || fbrInvoiceNumber.trim() === "") {
      console.log("FBR invoice number validation failed:", {
        fbrInvoiceNumber,

        type: typeof fbrInvoiceNumber,

        length: fbrInvoiceNumber ? fbrInvoiceNumber.length : 0,
      });

      return res.status(400).json({
        success: false,

        message: "FBR submission failed: No invoice number received from FBR",

        details: errorDetails || {
          raw: postRes.data ?? null,

          note: "No invoice number in FBR response",

          status: postRes.status,
        },
      });
    }

    // Update invoice status to 'posted' and replace draft number with FBR number when successfully submitted to FBR

    // This ensures that posted invoices show the official FBR invoice number instead of the draft number

    const updateData = {
      status: "posted",

      fbr_invoice_number: fbrInvoiceNumber,
    };

    // Create backup for posted invoice
    try {
      await InvoiceBackupService.createPostBackup({
        tenantDb: req.tenantDb,
        tenantModels: req.tenantModels,
        invoice: invoice,
        invoiceItems: invoiceItems,
        user: req.user,
        tenant: req.tenant,
        request: {
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get ? req.get("User-Agent") : null,
          requestId: req.headers?.["x-request-id"] || null,
        },
      });
    } catch (backupError) {
      console.error("❌ Error creating post backup:", backupError);
      // Don't fail the main operation if backup fails
    }

    // Only update invoice_number if we have a valid FBR invoice number

    if (fbrInvoiceNumber) {
      updateData.fbr_invoice_number = fbrInvoiceNumber;
    }

    console.log("Updating invoice with data:", updateData);

    console.log("FBR Response received:", {
      invoiceNumber: postRes.data.invoiceNumber,

      validationResponse: postRes.data.validationResponse,

      statusCode: postRes.data.validationResponse?.statusCode,
    });

    await invoice.update(updateData);

    // Verify the update was successful

    const updatedInvoice = await Invoice.findByPk(invoice.id);

    console.log("Invoice updated successfully:", {
      id: updatedInvoice.id,

      original_invoice_number: updatedInvoice.invoice_number,

      fbr_invoice_number: updatedInvoice.fbr_invoice_number,

      status: updatedInvoice.status,
    });

    // Log audit event for invoice submission to FBR
    await logAuditEvent(
      req,
      "invoice",
      invoice.id,
      "SUBMIT_TO_FBR",
      {
        // Basic Invoice Information
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        system_invoice_id: invoice.system_invoice_id,
        status: invoice.status,
        fbr_invoice_number: invoice.fbr_invoice_number,
        invoiceType: invoice.invoiceType,
        invoiceDate: invoice.invoiceDate,
        invoiceRefNo: invoice.invoiceRefNo,
        companyInvoiceRefNo: invoice.companyInvoiceRefNo,
        internal_invoice_no: invoice.internal_invoice_no,
        transctypeId: invoice.transctypeId,

        // Complete Seller Information
        sellerNTNCNIC: invoice.sellerNTNCNIC,
        sellerFullNTN: invoice.sellerFullNTN,
        sellerBusinessName: invoice.sellerBusinessName,
        sellerProvince: invoice.sellerProvince,
        sellerAddress: invoice.sellerAddress,
        sellerCity: invoice.sellerCity,

        // Complete Buyer Information
        buyerNTNCNIC: invoice.buyerNTNCNIC,
        buyerBusinessName: invoice.buyerBusinessName,
        buyerProvince: invoice.buyerProvince,
        buyerAddress: invoice.buyerAddress,
        buyerRegistrationType: invoice.buyerRegistrationType,

        // Financial Information
        totalAmount: invoice.totalAmount,

        // Complete Invoice Items with All Details
        invoice_items: invoice.InvoiceItems
          ? invoice.InvoiceItems.map((item) => ({
              id: item.id,
              product_name: item.name,
              hsCode: item.hsCode,
              productDescription: item.productDescription,
              quantity: item.quantity,
              rate: item.rate,
              uoM: item.uoM,
              unitPrice: item.unitPrice,
              totalValues: item.totalValues,
              valueSalesExcludingST: item.valueSalesExcludingST,
              fixedNotifiedValueOrRetailPrice:
                item.fixedNotifiedValueOrRetailPrice,
              salesTaxApplicable: item.salesTaxApplicable,
              salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
              extraTax: item.extraTax,
              furtherTax: item.furtherTax,
              sroScheduleNo: item.sroScheduleNo,
              fedPayable: item.fedPayable,
              advanceIncomeTax: item.advanceIncomeTax,
              discount: item.discount,
              saleType: item.saleType,
              sroItemSerialNo: item.sroItemSerialNo,
              billOfLadingUoM: item.billOfLadingUoM,
            }))
          : [],
      }, // oldValues (before submission)
      {
        // Basic Invoice Information
        invoice_id: updatedInvoice.id,
        invoice_number: updatedInvoice.invoice_number,
        system_invoice_id: updatedInvoice.system_invoice_id,
        status: updatedInvoice.status,
        fbr_invoice_number: updatedInvoice.fbr_invoice_number,
        invoiceType: updatedInvoice.invoiceType,
        invoiceDate: updatedInvoice.invoiceDate,
        invoiceRefNo: updatedInvoice.invoiceRefNo,
        companyInvoiceRefNo: updatedInvoice.companyInvoiceRefNo,
        internal_invoice_no: updatedInvoice.internal_invoice_no,
        transctypeId: updatedInvoice.transctypeId,

        // Complete Seller Information
        sellerNTNCNIC: updatedInvoice.sellerNTNCNIC,
        sellerFullNTN: updatedInvoice.sellerFullNTN,
        sellerBusinessName: updatedInvoice.sellerBusinessName,
        sellerProvince: updatedInvoice.sellerProvince,
        sellerAddress: updatedInvoice.sellerAddress,
        sellerCity: updatedInvoice.sellerCity,

        // Complete Buyer Information
        buyerNTNCNIC: updatedInvoice.buyerNTNCNIC,
        buyerBusinessName: updatedInvoice.buyerBusinessName,
        buyerProvince: updatedInvoice.buyerProvince,
        buyerAddress: updatedInvoice.buyerAddress,
        buyerRegistrationType: updatedInvoice.buyerRegistrationType,

        // Financial Information
        totalAmount: updatedInvoice.totalAmount,
        fbrValidation: isSuccess ? "success" : "failed",

        // Complete Invoice Items with All Details
        invoice_items: invoice.InvoiceItems
          ? invoice.InvoiceItems.map((item) => ({
              id: item.id,
              product_name: item.name,
              hsCode: item.hsCode,
              productDescription: item.productDescription,
              quantity: item.quantity,
              rate: item.rate,
              uoM: item.uoM,
              unitPrice: item.unitPrice,
              totalValues: item.totalValues,
              valueSalesExcludingST: item.valueSalesExcludingST,
              fixedNotifiedValueOrRetailPrice:
                item.fixedNotifiedValueOrRetailPrice,
              salesTaxApplicable: item.salesTaxApplicable,
              salesTaxWithheldAtSource: item.salesTaxWithheldAtSource,
              extraTax: item.extraTax,
              furtherTax: item.furtherTax,
              sroScheduleNo: item.sroScheduleNo,
              fedPayable: item.fedPayable,
              advanceIncomeTax: item.advanceIncomeTax,
              discount: item.discount,
              saleType: item.saleType,
              sroItemSerialNo: item.sroItemSerialNo,
              billOfLadingUoM: item.billOfLadingUoM,
            }))
          : [],
      }, // newValues (after submission)
      {
        entityName:
          updatedInvoice.invoice_number || updatedInvoice.system_invoice_id,
        endpoint: req.originalUrl,
        method: req.method,
        fbrInvoiceNumber: fbrInvoiceNumber,
        fbrValidation: isSuccess ? "success" : "failed",
      },
    );

    res.status(200).json({
      success: true,

      message: "Invoice posted successfully to FBR",

      data: {
        invoice_id: invoice.id,

        fbr_invoice_number: fbrInvoiceNumber,

        status: "posted",
      },
    });
  } catch (error) {
    console.error("Error submitting invoice to FBR:", error);

    res.status(500).json({
      success: false,

      message: "Error submitting invoice to FBR",

      error: error.message,
    });
  }
};

// Bulk create invoices with items (draft status) - CHUNKED OPTIMIZED VERSION
export const bulkCreateInvoices = async (req, res) => {
  const startTime = process.hrtime.bigint();

  try {
    const { Invoice, InvoiceItem, Buyer } = req.tenantModels;
    const sequelize = req.tenantDb;
    const { invoices, chunkSize = 500 } = req.body; // Default chunk size of 500

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invoices array is required and must not be empty",
      });
    }

    console.log(
      `🚀 Starting chunked bulk upload for ${invoices.length} grouped invoices (chunk size: ${chunkSize})...`,
    );

    // Debug: Log tenant information
    console.log(`🔍 Debug: Tenant information:`, {
      hasTenant: !!req.tenant,
      tenantKeys: req.tenant ? Object.keys(req.tenant) : [],
      seller_business_name: req.tenant?.seller_business_name,
      seller_province: req.tenant?.seller_province,
      seller_address: req.tenant?.seller_address,
    });

    // Optimize database for bulk operations - do this before any database operations
    try {
      await DatabaseOptimizationService.optimizeForBulkOperations(sequelize, {
        pool: {
          max: 50, // Increased pool size for bulk operations
          min: 20,
          acquire: 120000, // Increased timeout for bulk operations
          idle: 60000,
        },
      });

      console.log("✅ Database optimized for bulk operations");
    } catch (optimizationError) {
      console.warn(
        "⚠️ Database optimization failed, continuing without optimization:",
        optimizationError.message,
      );
    }
    console.log("🔍 Debug: Backend received:", {
      totalInvoices: invoices.length,
      sampleInvoice: invoices[0]
        ? {
            invoiceType: invoices[0].invoiceType,
            invoiceDate: invoices[0].invoiceDate,
            companyInvoiceRefNo: invoices[0].companyInvoiceRefNo,
            internalInvoiceNo: invoices[0].internalInvoiceNo,
            buyerBusinessName: invoices[0].buyerBusinessName,
            itemsCount: invoices[0].items?.length || 0,
          }
        : null,
      sampleInternalInvoiceNo: invoices[0]?.internalInvoiceNo,
      hasInternalInvoiceNo: !!invoices[0]?.internalInvoiceNo,
      internalInvoiceNoType: typeof invoices[0]?.internalInvoiceNo,
    });

    // PHASE 1: Data Preparation & Validation (Parallel)
    const validationStart = process.hrtime.bigint();

    // Extract unique buyer NTN/CNIC for batch validation
    const uniqueBuyerNTNs = [
      ...new Set(
        invoices
          .map((inv) => inv.buyerNTNCNIC)
          .filter((ntn) => ntn && ntn.trim()),
      ),
    ];

    // Batch fetch existing buyers to avoid individual queries
    console.log(`🔍 DEBUG: About to query buyers with NTNs:`, uniqueBuyerNTNs);
    const existingBuyers =
      uniqueBuyerNTNs.length > 0
        ? await Buyer.findAll({
            where: { buyerNTNCNIC: uniqueBuyerNTNs },
            attributes: [
              "buyerNTNCNIC",
              "buyerBusinessName",
              "buyerProvince",
              "buyerAddress",
              "buyerRegistrationType",
            ],
          })
        : [];

    // DEBUG: Also check total buyers in database
    const totalBuyersInDb = await Buyer.count();
    console.log(`🔍 DEBUG: Total buyers in database: ${totalBuyersInDb}`);

    // Create lookup maps for O(1) access
    const existingBuyerMap = new Map(
      existingBuyers.map((buyer) => [buyer.buyerNTNCNIC, buyer]),
    );

    console.log(
      `🔍 Found ${existingBuyers.length} existing buyers in database`,
    );
    console.log(
      `🔍 Buyer NTNs in database:`,
      existingBuyers.map((b) => b.buyerNTNCNIC),
    );
    console.log(`🔍 Buyer NTNs from CSV:`, uniqueBuyerNTNs);
    console.log(`🔍 DEBUG: uniqueBuyerNTNs length: ${uniqueBuyerNTNs.length}`);
    console.log(`🔍 DEBUG: uniqueBuyerNTNs values:`, uniqueBuyerNTNs);
    console.log(`🔍 DEBUG: existingBuyerMap size: ${existingBuyerMap.size}`);
    console.log(
      `🔍 DEBUG: existingBuyerMap keys:`,
      Array.from(existingBuyerMap.keys()),
    );

    // Extract unique product names for batch validation
    const uniqueProductNames = [
      ...new Set(
        invoices
          .flatMap((inv) => inv.items || [])
          .map(
            (item) =>
              item.item_productName?.trim() ||
              item.name?.trim() ||
              item.productName?.trim(),
          )
          .filter((name) => name && name.trim()),
      ),
    ];

    console.log(
      `🔍 Found ${uniqueProductNames.length} unique product names to validate`,
    );

    // Batch fetch existing products to avoid individual queries
    const { Product } = req.tenantModels;
    const existingProducts =
      uniqueProductNames.length > 0
        ? await Product.findAll({
            where: {
              name: {
                [Product.sequelize.Sequelize.Op.in]: uniqueProductNames,
              },
            },
            attributes: ["id", "name", "description", "hsCode", "uom"],
          })
        : [];

    // Create lookup maps for O(1) access - case insensitive
    const existingProductMap = new Map();
    existingProducts.forEach((product) => {
      // Add both exact case and lowercase versions for flexible matching
      existingProductMap.set(product.name.toLowerCase().trim(), product);
      existingProductMap.set(product.name.trim(), product);
    });

    console.log(
      `🔍 Found ${existingProducts.length} existing products in database`,
    );
    console.log(
      `🔍 Product names in database:`,
      existingProducts.map((p) => p.name),
    );
    console.log(`🔍 Product names from CSV:`, uniqueProductNames);

    // Safety check: Ensure we have products to validate against
    if (uniqueProductNames.length > 0 && existingProducts.length === 0) {
      console.log(
        `⚠️ WARNING: No products found in database but CSV has product names!`,
      );
      console.log(`⚠️ This will cause all product validations to fail.`);
    }

    // Determine starting system invoice number for bulk to match form logic (INV-0001, INV-0002, ...)
    let nextSystemIdNumber = 1;
    try {
      const lastInvoiceForSystemId = await Invoice.findOne({
        where: {
          system_invoice_id: {
            [Invoice.sequelize.Sequelize.Op.like]: "INV-%",
          },
        },
          order: [
        [Invoice.sequelize.Sequelize.literal("CAST(SUBSTRING(system_invoice_id, 5) AS UNSIGNED)"), "DESC"]
      ],
        attributes: ["system_invoice_id"],
      });

      if (
        lastInvoiceForSystemId &&
        lastInvoiceForSystemId.system_invoice_id &&
        typeof lastInvoiceForSystemId.system_invoice_id === "string"
      ) {
        const match =
          lastInvoiceForSystemId.system_invoice_id.match(/INV-(\d+)/);
        if (match) {
          nextSystemIdNumber = parseInt(match[1], 10) + 1;
        }
      }
    } catch (e) {
      // If anything goes wrong, keep nextSystemIdNumber at 1
    }

    // PHASE 2: Batch Data Processing
    const processingStart = process.hrtime.bigint();

    const invoiceBatches = [];
    const invoiceItemBatches = [];
    const errors = [];
    const warnings = [];
    const usedSystemIds = new Set(); // Track used system invoice IDs to ensure uniqueness

    console.log(`📊 Processing ${invoices.length} grouped invoices...`);

    // Process all grouped invoices in memory (no database calls yet)
    console.log(`🔍 DEBUG: Starting to process ${invoices.length} invoices`);

    // FIRST PASS: Validate ALL invoices before creating ANY
    console.log(
      `🔍 FIRST PASS: Validating all ${invoices.length} invoices before processing any`,
    );

    // Batch-fetch existing companyInvoiceRefNo values from DB for fast lookup
    const csvRefNos = invoices
      .map((inv) => String(inv.companyInvoiceRefNo || "").trim())
      .filter(Boolean);
    const existingRefNoSet = new Set();
    if (csvRefNos.length > 0) {
      const existingRefs = await Invoice.findAll({
        where: {
          companyInvoiceRefNo: { [Invoice.sequelize.Sequelize.Op.in]: csvRefNos },
          isDeleted: { [Invoice.sequelize.Sequelize.Op.not]: true },
        },
        attributes: ["companyInvoiceRefNo"],
      });
      existingRefs.forEach((r) => existingRefNoSet.add(String(r.companyInvoiceRefNo).trim()));
      console.log(`🔍 Found ${existingRefNoSet.size} duplicate companyInvoiceRefNo(s) already in DB`);
    }

    // Track within-CSV duplicates
    const seenRefNosInCsv = new Map(); // refNo -> first invoice index

    const validationErrors = [];

    for (let i = 0; i < invoices.length; i++) {
      const invoiceData = invoices[i];
      console.log(
        `🔍 DEBUG: Validating invoice ${i + 1}/${invoices.length} with buyerNTNCNIC: "${invoiceData.buyerNTNCNIC}"`,
      );

      // Progress indicator for large files
      if (i % 100 === 0 && i > 0) {
        console.log(`📈 Validated ${i}/${invoices.length} invoices...`);
      }

      try {
        // Check companyInvoiceRefNo uniqueness (DB + within-CSV)
        const refNo = String(invoiceData.companyInvoiceRefNo || "").trim();
        if (refNo) {
          if (existingRefNoSet.has(refNo)) {
            validationErrors.push({
              index: i,
              row: i + 1,
              error: `Duplicate Company Invoice Reference Number found in system: "${refNo}"`,
            });
            continue;
          }
          if (seenRefNosInCsv.has(refNo)) {
            validationErrors.push({
              index: i,
              row: i + 1,
              error: `Duplicate Company Invoice Reference Number found in this file (first seen at row ${seenRefNosInCsv.get(refNo) + 1}): "${refNo}"`,
            });
            continue;
          }
          seenRefNosInCsv.set(refNo, i);
        }

        // Quick validation for invoice-level data
        if (
          !String(invoiceData.invoiceType || "").trim() ||
          !String(invoiceData.invoiceDate || "").trim() ||
          !String(invoiceData.buyerNTNCNIC || "").trim()
        ) {
          // Check which specific fields are missing and provide detailed error messages
          const missingFields = [];
          if (!String(invoiceData.invoiceType || "").trim()) {
            missingFields.push("Invoice Type");
          }
          if (!String(invoiceData.invoiceDate || "").trim()) {
            missingFields.push("Invoice Date");
          }
          if (!String(invoiceData.buyerNTNCNIC || "").trim()) {
            missingFields.push("Buyer NTN/CNIC");
          }

          validationErrors.push({
            index: i,
            row: i + 1,
            error: `Missing required fields: ${missingFields.join(", ")}`,
          });
          continue;
        }

        // Additional validation to filter out empty rows with default values
        // But allow invoices with internal invoice numbers even if other fields seem empty
        const hasInternalInvoiceNo = invoiceData.internalInvoiceNo?.trim();
        const hasEmptyData =
          (!hasInternalInvoiceNo &&
            invoiceData.buyerBusinessName?.trim() === "Unknown Buyer") ||
          (!hasInternalInvoiceNo &&
            invoiceData.companyInvoiceRefNo?.trim() === `row_${i + 1}`) ||
          !invoiceData.items ||
          !Array.isArray(invoiceData.items) ||
          invoiceData.items.length === 0 ||
          (invoiceData.items &&
            invoiceData.items.every(
              (item) =>
                (!item.item_productName ||
                  item.item_productName.trim() === "") &&
                (!item.name || item.name.trim() === "") &&
                (!item.productName || item.productName.trim() === "") &&
                (!item.item_quantity ||
                  item.item_quantity === "0" ||
                  item.item_quantity === 0) &&
                (!item.item_unitPrice ||
                  item.item_unitPrice === "0" ||
                  item.item_unitPrice === 0) &&
                (!item.item_totalValues ||
                  item.item_totalValues === "0" ||
                  item.item_totalValues === 0),
            ));

        if (hasEmptyData) {
          console.log(`🚫 Skipping empty row ${i + 1}:`, {
            buyerBusinessName: invoiceData.buyerBusinessName,
            companyInvoiceRefNo: invoiceData.companyInvoiceRefNo,
            itemsCount: invoiceData.items?.length || 0,
            hasProductData: invoiceData.items?.some(
              (item) =>
                item.item_productName?.trim() ||
                item.name?.trim() ||
                item.productName?.trim(),
            ),
          });
          continue; // Skip this invoice without adding to errors
        }

        // Validate invoice type
        if (
          !["Sale Invoice", "Debit Note"].includes(
            String(invoiceData.invoiceType || "").trim(),
          )
        ) {
          validationErrors.push({
            index: i,
            row: i + 1,
            error: 'Invoice type must be "Sale Invoice" or "Debit Note"',
          });
          continue;
        }

        // Validate date format - handle both Excel serial dates and YYYY-MM-DD format
        const dateValue = String(invoiceData.invoiceDate || "").trim();
        if (!dateValue) {
          validationErrors.push({
            index: i,
            row: i + 1,
            error: "Invoice date is required",
          });
          continue;
        }

        // Check if it's an Excel serial date (numeric)
        if (/^\d+$/.test(dateValue)) {
          // Convert Excel serial date to YYYY-MM-DD format
          const excelDate = parseInt(dateValue);
          const date = new Date((excelDate - 25569) * 86400 * 1000);
          if (isNaN(date.getTime())) {
            validationErrors.push({
              index: i,
              row: i + 1,
              error: "Invalid Excel date format",
            });
            continue;
          }
          // Update the invoice data with converted date
          invoiceData.invoiceDate = date.toISOString().split("T")[0];
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          validationErrors.push({
            index: i,
            row: i + 1,
            error:
              "Invoice date must be in YYYY-MM-DD format or Excel serial date",
          });
          continue;
        }

        // Province validation removed - will be set from existing buyer data

        // Validate items array
        if (
          !Array.isArray(invoiceData.items) ||
          invoiceData.items.length === 0
        ) {
          validationErrors.push({
            index: i,
            row: i + 1,
            error: "Invoice must have at least one item",
          });
          continue;
        }

        // Debug: Log invoice structure
        console.log(`🔍 Debug: Invoice ${i + 1} structure:`, {
          hasItems: !!invoiceData.items,
          itemsLength: invoiceData.items?.length,
          itemsType: typeof invoiceData.items,
          isArray: Array.isArray(invoiceData.items),
          firstItem: invoiceData.items?.[0],
        });

        let hasErrorInThisInvoice = false;

        // Handle buyer validation - only check if buyer exists by NTN
        if (String(invoiceData.buyerNTNCNIC || "").trim()) {
          const ntnTrimmed = String(invoiceData.buyerNTNCNIC || "").trim();

          console.log(`🔍 Validating buyer NTN: "${ntnTrimmed}"`);
          console.log(
            `🔍 Available buyers in map:`,
            Array.from(existingBuyerMap.keys()),
          );
          console.log(`🔍 DEBUG: Looking for buyer with NTN: "${ntnTrimmed}"`);
          console.log(
            `🔍 DEBUG: existingBuyerMap.has("${ntnTrimmed}"): ${existingBuyerMap.has(ntnTrimmed)}`,
          );

          const existingBuyer = existingBuyerMap.get(ntnTrimmed);

          if (!existingBuyer) {
            console.log(
              `❌ Buyer with NTN "${ntnTrimmed}" NOT FOUND in system`,
            );
            console.log(
              `🔍 DEBUG: Validation error for invoice ${i + 1} due to missing buyer`,
            );
            // Buyer with this NTN doesn't exist in our system
            validationErrors.push({
              index: i,
              row: i + 1,
              error: `Incorrect NTN (Buyer NTN "${ntnTrimmed}" does not exist)`,
            });
            hasErrorInThisInvoice = true;
          } else {
            console.log(`✅ Buyer with NTN "${ntnTrimmed}" found in system:`, {
              businessName: existingBuyer.buyerBusinessName,
              province: existingBuyer.buyerProvince,
              address: existingBuyer.buyerAddress,
            });

            // Use existing buyer data instead of CSV data
            invoiceData.buyerBusinessName = existingBuyer.buyerBusinessName;
            invoiceData.buyerProvince = existingBuyer.buyerProvince;
            invoiceData.buyerAddress = existingBuyer.buyerAddress;
            invoiceData.buyerRegistrationType =
              existingBuyer.buyerRegistrationType;
          }
        } else {
          // NTN is required for invoice processing
          console.log(
            `🔍 DEBUG: Validation error for invoice ${i + 1} due to missing buyer NTN`,
          );
          validationErrors.push({
            index: i,
            row: i + 1,
            error: "Buyer NTN is required for invoice processing",
          });
          hasErrorInThisInvoice = true;
        }

        // Pre-validate all products for this invoice before creating invoice record
        console.log(
          `🔍 Pre-validating products for invoice ${i + 1} with ${invoiceData.items.length} items`,
        );
        let validItemsCount = 0;
        let hasAnyProductName = false;

        for (let j = 0; j < invoiceData.items.length; j++) {
          const itemData = invoiceData.items[j];

          // Get product name from various possible fields
          const productName =
            itemData.item_productName?.trim() ||
            itemData.name?.trim() ||
            itemData.productName?.trim();

          // Check if any product name exists (even if invalid)
          if (productName) {
            hasAnyProductName = true;
          }

          // Only skip if we have absolutely no product information
          if (!productName) {
            console.log(
              `⚠️ Skipping item ${j + 1} in invoice ${i + 1}: No product name`,
            );
            continue;
          }

          // Validate product exists in system
          console.log(`🔍 Validating product: "${productName}"`);
          const existingProduct = existingProductMap.get(
            productName.toLowerCase().trim(),
          );
          if (!existingProduct) {
            console.log(`❌ Product "${productName}" NOT FOUND in system`);
            validationErrors.push({
              index: i,
              row: i + 1,
              error: `Incorrect Product Name (Product "${productName}" does not exist)`,
            });
            hasErrorInThisInvoice = true;
            continue;
          }

          console.log(`✅ Product "${productName}" found in system`);
          validItemsCount++;
        }

        // Check if any product names are missing
        if (!hasAnyProductName) {
          console.log(
            `⚠️ Validation error for invoice ${i + 1}: No product names found`,
          );
          validationErrors.push({
            index: i,
            row: i + 1,
            error: `Product Name is required for invoice (Row ${i + 1})`,
          });
          hasErrorInThisInvoice = true;
        }

        // If no valid products found, add validation error
        if (validItemsCount === 0 && hasAnyProductName) {
          console.log(
            `⚠️ Validation error for invoice ${i + 1}: No valid products found`,
          );
          validationErrors.push({
            index: i,
            row: i + 1,
            error: `No valid products found for invoice (Row ${i + 1})`,
          });
          hasErrorInThisInvoice = true;
        }

        if (hasErrorInThisInvoice) {
          continue;
        }

        // FIRST PASS: Only validate, don't process items or create invoice records
        console.log(
          `✅ Invoice ${i + 1} validation passed - will be processed in second pass`,
        );
      } catch (error) {
        console.error(`Error processing invoice ${i}:`, error);
        validationErrors.push({
          index: i,
          row: i + 1,
          error: `Processing error: ${error.message}`,
        });
      }
    }

    // Check if there are any validation errors - if so, fail completely
    if (validationErrors.length > 0) {
      console.log(
        `❌ VALIDATION FAILED: Found ${validationErrors.length} validation errors. Rejecting ALL invoices.`,
      );
      console.log(`🔍 Validation errors:`, validationErrors);

      return res.status(400).json({
        success: false,
        message: `Validation failed. ${validationErrors.length} invoice(s) have errors. No invoices will be created.`,
        data: {
          created: [],
          errors: validationErrors,
          warnings: warnings,
          summary: {
            total: invoices.length,
            successful: 0,
            failed: validationErrors.length,
            warnings: warnings.length,
          },
        },
      });
    }

    console.log(
      `✅ VALIDATION PASSED: All ${invoices.length} invoices are valid. Proceeding with creation.`,
    );

    // SECOND PASS: Process valid invoices (only if validation passed)
    console.log(
      `🔍 SECOND PASS: Processing ${invoices.length} validated invoices`,
    );
    const excludeSourceInvoiceNoSet = new Set();
    for (let i = 0; i < invoices.length; i++) {
      const invoiceData = invoices[i];
      console.log(
        `🔍 DEBUG: Processing validated invoice ${i + 1}/${invoices.length} with buyerNTNCNIC: "${invoiceData.buyerNTNCNIC}"`,
      );

      // Progress indicator for large files
      if (i % 100 === 0 && i > 0) {
        console.log(`📈 Processed ${i}/${invoices.length} invoices...`);
      }

      try {
        // Quick validation for invoice-level data
        if (
          !String(invoiceData.invoiceType || "").trim() ||
          !String(invoiceData.invoiceDate || "").trim() ||
          !String(invoiceData.buyerNTNCNIC || "").trim()
        ) {
          console.log(`⚠️ Skipping invoice ${i + 1}: Missing required fields`);
          errors.push({
            index: i,
            row: i + 1,
            error:
              "Invoice missing required fields (invoiceType, invoiceDate, buyerNTNCNIC)",
          });
          continue;
        }

        // Check if invoice has items
        if (
          !invoiceData.items ||
          !Array.isArray(invoiceData.items) ||
          invoiceData.items.length === 0
        ) {
          console.log(`⚠️ Skipping invoice ${i + 1}: No items found`);
          errors.push({
            index: i,
            row: i + 1,
            error: "Invoice must have at least one item",
          });
          continue;
        }

        // Debug: Log invoice structure
        console.log(`🔍 Debug: Invoice ${i + 1} structure:`, {
          hasItems: !!invoiceData.items,
          itemsLength: invoiceData.items?.length,
          itemsType: typeof invoiceData.items,
          isArray: Array.isArray(invoiceData.items),
          firstItem: invoiceData.items?.[0],
        });

        // Get buyer data (already validated in first pass)
        const ntnTrimmed = String(invoiceData.buyerNTNCNIC || "").trim();
        const existingBuyer = existingBuyerMap.get(ntnTrimmed);

        console.log(`✅ Processing validated buyer: "${ntnTrimmed}"`);

        // Use existing buyer data instead of CSV data
        invoiceData.buyerBusinessName = existingBuyer.buyerBusinessName;
        invoiceData.buyerProvince = existingBuyer.buyerProvince;
        invoiceData.buyerAddress = existingBuyer.buyerAddress;
        invoiceData.buyerRegistrationType = existingBuyer.buyerRegistrationType;

        // Generate system invoice ID matching form logic (sequential INV-XXXX)
        let systemInvoiceId = `INV-${String(nextSystemIdNumber).padStart(4, "0")}`;
        // Ensure uniqueness within this batch (extra safety)
        while (usedSystemIds.has(systemInvoiceId)) {
          nextSystemIdNumber += 1;
          systemInvoiceId = `INV-${String(nextSystemIdNumber).padStart(4, "0")}`;
        }
        usedSystemIds.add(systemInvoiceId);
        nextSystemIdNumber += 1;

        // Debug: Log company invoice ref number for bulk create
        console.log(
          `🔍 Backend Debug: Invoice ${i + 1} Company Invoice Ref No:`,
          {
            companyInvoiceRefNo: invoiceData.companyInvoiceRefNo,
            hasValue: !!invoiceData.companyInvoiceRefNo,
            trimmedValue: invoiceData.companyInvoiceRefNo?.trim(),
          },
        );

        const sourceInvoiceNo = invoiceData.sourceInvoiceNo || invoiceData.companyInvoiceRefNo;

        // Prepare invoice data for batch insert
        const invoiceRecord = {
          invoice_number: `DRAFT_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
          system_invoice_id: systemInvoiceId,
          invoiceType: String(invoiceData.invoiceType || "").trim(),
          invoiceDate: String(invoiceData.invoiceDate || "").trim(),
          sellerNTNCNIC: String(invoiceData.sellerNTNCNIC || "").trim() || null,
          sellerFullNTN: String(invoiceData.sellerFullNTN || "").trim() || null,
          sellerBusinessName: req.tenant?.seller_business_name || "",
          sellerProvince: req.tenant?.seller_province || "",
          sellerAddress: req.tenant?.seller_address || null,
          buyerNTNCNIC: String(invoiceData.buyerNTNCNIC || "").trim() || null,
          buyerBusinessName:
            String(invoiceData.buyerBusinessName || "").trim() || null,
          buyerProvince: String(invoiceData.buyerProvince || "").trim() || null,
          buyerAddress: String(invoiceData.buyerAddress || "").trim() || null,
          buyerRegistrationType:
            String(invoiceData.buyerRegistrationType || "").trim() || null,
          invoiceRefNo: String(invoiceData.invoiceRefNo || "").trim() || null,
          companyInvoiceRefNo:
            String(invoiceData.companyInvoiceRefNo || "").trim() || null,
          internal_invoice_no:
            String(invoiceData.internalInvoiceNo || "").trim() || null,
          transctypeId: null, // Will be set from items
          status: "draft",
          fbr_invoice_number: null,
          sourceInvoiceNo: sourceInvoiceNo,
          created_by_user_id: req.user?.userId || req.user?.id || null,
          created_by_email: req.user?.email || null,
          created_by_name:
            req.user?.firstName || req.user?.lastName
              ? `${req.user?.firstName ?? ""}${req.user?.lastName ? ` ${req.user.lastName}` : ""}`.trim()
              : req.user?.role === "admin"
                ? `Admin (${req.user?.id || "Unknown"})`
                : null,
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Debug: Log the complete invoice record
        console.log(`🔍 Debug: Complete invoice record ${i + 1}:`, {
          invoice_number: invoiceRecord.invoice_number,
          system_invoice_id: invoiceRecord.system_invoice_id,
          sellerBusinessName: invoiceRecord.sellerBusinessName,
          sellerProvince: invoiceRecord.sellerProvince,
          buyerBusinessName: invoiceRecord.buyerBusinessName,
          buyerProvince: invoiceRecord.buyerProvince,
          hasCreatedAt: !!invoiceRecord.created_at,
          hasUpdatedAt: !!invoiceRecord.updated_at,
          created_at: invoiceRecord.created_at,
          updated_at: invoiceRecord.updated_at,
        });

        // Only add to invoiceBatches AFTER all validations pass
        console.log(
          `🔍 DEBUG: Adding invoice ${i + 1} to batch - buyerNTNCNIC: "${invoiceData.buyerNTNCNIC}"`,
        );
        invoiceBatches.push(invoiceRecord);

        // Debug: Log the invoice record being added
        console.log(`🔍 Debug: Invoice record ${i + 1}:`, {
          hasCreatedAt: !!invoiceRecord.created_at,
          hasUpdatedAt: !!invoiceRecord.updated_at,
          created_at: invoiceRecord.created_at,
          updated_at: invoiceRecord.updated_at,
          invoice_number: invoiceRecord.invoice_number,
          system_invoice_id: invoiceRecord.system_invoice_id,
        });

        // Process items for this invoice (products already validated above)
        console.log(
          `🔍 Debug: Processing invoice ${i + 1} with ${invoiceData.items.length} items`,
        );

        let itemsProcessed = 0;
        for (let j = 0; j < invoiceData.items.length; j++) {
          const itemData = invoiceData.items[j];

          try {
            // Get product name from various possible fields
            const productName =
              String(itemData.item_productName || "").trim() ||
              String(itemData.name || "").trim() ||
              String(itemData.productName || "").trim();

            // Only skip if we have absolutely no product information
            if (!productName) {
              console.log(
                `⚠️ Skipping item ${j + 1} in invoice ${i + 1}: No product name`,
              );
              continue;
            }

            // Get existing product (already validated above)
            const existingProduct = existingProductMap.get(
              productName.toLowerCase().trim(),
            );
            if (!existingProduct) {
              // This should not happen since we pre-validated, but just in case
              console.log(
                `❌ Product "${productName}" NOT FOUND in system (unexpected)`,
              );
              continue;
            }

            console.log(`✅ Processing product "${productName}":`, {
              id: existingProduct.id,
              name: existingProduct.name,
              hsCode: existingProduct.hsCode,
              uom: existingProduct.uom,
            });

            // Validate required item fields - be more lenient and provide defaults
            const hsCode =
              String(itemData.item_hsCode || "").trim() ||
              existingProduct.hsCode ||
              "000000";
            const rate = String(itemData.item_rate || "").trim() || "17";

            // Debug: Log raw item data
            console.log(`🔍 Debug: Raw item ${j + 1} data:`, {
              item_hsCode: itemData.item_hsCode,
              item_rate: itemData.item_rate,
              item_productName: itemData.item_productName,
              name: itemData.name,
              productName: itemData.productName,
              hasHsCode: !!itemData.item_hsCode,
              hasRate: !!itemData.item_rate,
              hsCodeTrimmed: String(itemData.item_hsCode || "").trim(),
              rateTrimmed: String(itemData.item_rate || "").trim(),
              finalHsCode: hsCode,
              finalRate: rate,
            });

            // Debug: Log item data before mapping
            console.log("🔍 Bulk Upload Debug: Item data:", {
              item_productName: itemData.item_productName,
              name: itemData.name,
              productName: itemData.productName,
            });

            // Prepare item data for batch insert
            // IMPORTANT: This creates InvoiceItem records, NOT Product records
            // Products must already exist in the system - no product creation here
            const itemRecord = {
              invoice_id: null, // Will be set after invoice creation
              hsCode: hsCode,
              name: existingProduct.name, // Use the exact product name from database
              productDescription:
                String(itemData.item_productDescription || "").trim() ||
                existingProduct.description ||
                null,
              rate: rate,
              uoM:
                String(itemData.item_uoM || "").trim() ||
                existingProduct.uom ||
                null,
              quantity: parseFloat(itemData.item_quantity) || 0,
              unitPrice: parseFloat(itemData.item_unitPrice) || 0,
              totalValues: parseFloat(itemData.item_totalValues) || 0,
              valueSalesExcludingST:
                parseFloat(itemData.item_valueSalesExcludingST) || 0,
              // Force fixedNotifiedValueOrRetailPrice to 0 for Excel uploads
              fixedNotifiedValueOrRetailPrice: 0,
              salesTaxApplicable:
                parseFloat(itemData.item_salesTaxApplicable) || 0,
              salesTaxWithheldAtSource:
                parseFloat(itemData.item_salesTaxWithheldAtSource) || 0,
              extraTax:
                typeof itemData.item_extraTax === "string"
                  ? itemData.item_extraTax.trim()
                  : itemData.item_extraTax,
              furtherTax: parseFloat(itemData.item_furtherTax) || 0,
              sroScheduleNo: itemData.item_sroScheduleNo?.trim() || null,
              fedPayable: parseFloat(itemData.item_fedPayable) || 0,
              advanceIncomeTax: parseFloat(itemData.item_advanceIncomeTax) || 0,
              discount: parseFloat(itemData.item_discount) || 0,
              saleType:
                itemData.item_saleType?.trim() ||
                "Goods at standard rate (default)",
              sroItemSerialNo: itemData.item_sroItemSerialNo?.trim() || null,
              transctypeId: itemData.transctypeId?.trim() || null,
              created_at: new Date(),
              updated_at: new Date(),
            };

            // Debug: Log the final item record
            console.log("🔍 Bulk Upload Debug: Final item record:", {
              name: itemRecord.name,
              hsCode: itemRecord.hsCode,
              productDescription: itemRecord.productDescription,
            });

            invoiceItemBatches.push({
              ...itemRecord,
              _invoiceIndex: i, // Track which invoice this item belongs to
            });

            itemsProcessed++;
            console.log(
              `✅ Successfully processed item ${j + 1} for invoice ${i + 1}`,
            );
          } catch (itemError) {
            console.error(
              `❌ Error processing item ${j + 1} in invoice ${i + 1}:`,
              itemError,
            );
            console.error(`❌ Item data that failed:`, itemData);
            errors.push({
              index: i,
              row: i + 1,
              error: `Item processing error: ${itemError.message}`,
            });
          }
        }

        console.log(
          `📊 Invoice ${i + 1}: Processed ${itemsProcessed}/${invoiceData.items.length} items`,
        );

        // Debug: Log the total items processed so far
        console.log(
          `🔍 Debug: Total invoiceItemBatches after invoice ${i + 1}: ${invoiceItemBatches.length}`,
        );
        if (invoiceItemBatches.length > 0) {
          console.log(`🔍 Debug: Sample item:`, {
            _invoiceIndex:
              invoiceItemBatches[invoiceItemBatches.length - 1]._invoiceIndex,
            name: invoiceItemBatches[invoiceItemBatches.length - 1].name,
            hsCode: invoiceItemBatches[invoiceItemBatches.length - 1].hsCode,
          });
        }
      } catch (error) {
        console.error(`Error processing invoice ${i}:`, error);
        errors.push({
          index: i,
          row: i + 1,
          error: `Processing error: ${error.message}`,
        });
      }
    }

    console.log(
      `📈 Processed ${invoices.length}/${invoices.length} grouped invoices...`,
    );
    const processingTime =
      Number(process.hrtime.bigint() - processingStart) / 1000000;
    console.log(
      `⚡ Data processing completed in ${processingTime.toFixed(2)}ms`,
    );

    // Debug: Log what we have after processing
    console.log(
      `🔍 Debug: After processing - invoiceBatches: ${invoiceBatches.length}, invoiceItemBatches: ${invoiceItemBatches.length}, errors: ${errors.length}`,
    );

    if (invoiceBatches.length === 0) {
      console.log(
        `⚠️ No invoices to process after validation. Errors:`,
        errors,
      );
      return res.status(400).json({
        success: false,
        message: "No valid invoices found after validation",
        data: {
          created: [],
          errors: errors,
          warnings: warnings,
          summary: {
            total: invoices.length,
            successful: 0,
            failed: errors.length,
            warnings: warnings.length,
          },
        },
      });
    }

    // PHASE 3: Chunked Database Operations
    const dbStart = process.hrtime.bigint();

    // Split data into chunks for processing
    const invoiceChunks = [];
    const itemChunks = [];

    for (let i = 0; i < invoiceBatches.length; i += chunkSize) {
      const chunk = invoiceBatches.slice(i, i + chunkSize);
      console.log(
        `🔍 Debug: Creating chunk ${invoiceChunks.length + 1} with ${chunk.length} invoices`,
      );
      console.log(`🔍 Debug: First invoice in chunk:`, {
        hasCreatedAt: !!chunk[0]?.created_at,
        hasUpdatedAt: !!chunk[0]?.updated_at,
        invoiceKeys: chunk[0] ? Object.keys(chunk[0]) : [],
      });
      invoiceChunks.push(chunk);
    }

    for (let i = 0; i < invoiceItemBatches.length; i += chunkSize * 10) {
      // Items are typically 10x more than invoices
      itemChunks.push(invoiceItemBatches.slice(i, i + chunkSize * 10));
    }

    console.log(
      `📦 Processing ${invoiceChunks.length} chunks of invoices and ${itemChunks.length} chunks of items`,
    );
    console.log(
      `🔍 Debug: Total items to process: ${invoiceItemBatches.length}`,
    );
    console.log(`🔍 Debug: Item chunks created: ${itemChunks.length}`);
    if (itemChunks.length > 0) {
      console.log(`🔍 Debug: First item chunk size: ${itemChunks[0].length}`);
    }

    // Validate data lengths before database operations
    console.log("🔍 Validating data lengths...");
    let maxSystemIdLength = 0;
    let maxInvoiceNumberLength = 0;

    for (let i = 0; i < invoiceBatches.length; i++) {
      const invoice = invoiceBatches[i];

      // Debug: Log invoice validation
      console.log(`🔍 Debug: Validating invoice ${i + 1}:`, {
        hasCreatedAt: !!invoice.created_at,
        hasUpdatedAt: !!invoice.updated_at,
        system_invoice_id: invoice.system_invoice_id,
        invoice_number: invoice.invoice_number,
        buyerBusinessName: invoice.buyerBusinessName,
        buyerProvince: invoice.buyerProvince,
      });

      // Track maximum lengths for debugging
      maxSystemIdLength = Math.max(
        maxSystemIdLength,
        invoice.system_invoice_id.length,
      );
      maxInvoiceNumberLength = Math.max(
        maxInvoiceNumberLength,
        invoice.invoice_number.length,
      );

      // Check system_invoice_id length (max 20 chars)
      if (invoice.system_invoice_id.length > 20) {
        throw new Error(
          `system_invoice_id too long at row ${i + 1}: "${invoice.system_invoice_id}" (${invoice.system_invoice_id.length} chars, max 20)`,
        );
      }

      // Check invoice_number length (max 100 chars)
      if (invoice.invoice_number.length > 100) {
        throw new Error(
          `invoice_number too long at row ${i + 1}: "${invoice.invoice_number}" (${invoice.invoice_number.length} chars, max 100)`,
        );
      }

      // Check other string fields
      if (invoice.buyerBusinessName && invoice.buyerBusinessName.length > 255) {
        throw new Error(
          `buyerBusinessName too long at row ${i + 1}: ${invoice.buyerBusinessName.length} chars, max 255`,
        );
      }

      if (invoice.buyerProvince && invoice.buyerProvince.length > 100) {
        throw new Error(
          `buyerProvince too long at row ${i + 1}: ${invoice.buyerProvince.length} chars, max 100`,
        );
      }
    }

    console.log(
      `✅ Validation passed - Max lengths: system_invoice_id=${maxSystemIdLength}, invoice_number=${maxInvoiceNumberLength}`,
    );

    // Process chunks with memory management
    const processId = `bulk_upload_${Date.now()}`;
    MemoryManagementService.registerProcess(processId, {
      totalInvoices: invoices.length,
      totalChunks: invoiceChunks.length,
      chunkSize: chunkSize,
    });

    // SIMPLIFIED: Process all invoices in a single transaction like regular uploads
    // SIMPLIFIED & OPTIMIZED: Process in chunks within a single transaction
    console.log(`🚀 Processing ${invoiceBatches.length} invoices in chunks...`);

    const allCreatedInvoices = await sequelize.transaction(async (t) => {
      // No buyer creation - only use existing buyers
      // No product creation - only use existing products

      let allCreated = [];

      // Process invoices in chunks
      for (let i = 0; i < invoiceChunks.length; i++) {
        const chunk = invoiceChunks[i];
        console.log(
          `🔄 Processing chunk ${i + 1}/${invoiceChunks.length} with ${chunk.length} invoices...`,
        );

        // Ensure timestamps are set
        const now = new Date();
        const validInvoices = chunk.map((invoice) => ({
          ...invoice,
          created_at: invoice.created_at || now,
          updated_at: invoice.updated_at || now,
        }));

        try {
          const createdChunk = await Invoice.bulkCreate(validInvoices, {
            transaction: t,
            validate: false,
            ignoreDuplicates: true,
            returning: true,
          });

          allCreated = allCreated.concat(createdChunk);

          // Process items for this chunk
          // We need to map the original indices to the created invoices
          // Since we process in order, we can calculate the offset
          const offset = i * chunkSize;

          // Find items that belong to invoices in this current chunk
          // invoiceItemBatches has _invoiceIndex which refers to the index in the original invoiceBatches array
          // The current chunk covers indices from `offset` to `offset + chunk.length - 1`
          const minIndex = offset;
          const maxIndex = offset + chunk.length;

          const chunkItemBatches = invoiceItemBatches.filter(
            (item) =>
              item._invoiceIndex >= minIndex && item._invoiceIndex < maxIndex,
          );

          if (chunkItemBatches.length > 0) {
            console.log(
              `  Items for chunk ${i + 1}: ${chunkItemBatches.length}`,
            );

            const itemsWithInvoiceIds = chunkItemBatches
              .map((item) => {
                // The createdChunk array corresponds to indices 0 to chunk.length-1 relative to this loop
                // item._invoiceIndex - minIndex gives us the index in createdChunk
                const localIndex = item._invoiceIndex - minIndex;
                const invoice = createdChunk[localIndex];

                if (!invoice) return null;

                const itemRecord = {
                  ...item,
                  invoice_id: invoice.id,
                };
                delete itemRecord._invoiceIndex;
                return itemRecord;
              })
              .filter((item) => item !== null);

            // Bulk create items for this chunk (further chunking items if too many)
            const itemSubChunkSize = 2000;
            for (
              let j = 0;
              j < itemsWithInvoiceIds.length;
              j += itemSubChunkSize
            ) {
              const itemSubChunk = itemsWithInvoiceIds.slice(
                j,
                j + itemSubChunkSize,
              );
              await InvoiceItem.bulkCreate(itemSubChunk, {
                transaction: t,
                validate: false,
                ignoreDuplicates: true,
              });
            }
          }

          // Log audit for this chunk immediately to free memory/progress
          if (createdChunk.length > 0) {
            const userId = req.user?.userId || req.user?.id || null;
            let validatedUserId = null;

            if (userId) {
              // We can cache this lookup outside the loop if we want, but doing it per chunk is acceptable overhead
              const { default: User } = await import(
                "../../model/mysql/User.js"
              );
              const userExists = await User.findByPk(userId, {
                attributes: ["id"],
                raw: true,
              });
              if (userExists) validatedUserId = userId;
            }

            const auditEntries = createdChunk.map((invoice) => ({
              entityType: "invoice",
              entityId: invoice.id,
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
              newValues: JSON.stringify(invoice),
              ipAddress: req.ip || req.connection?.remoteAddress,
              userAgent: req.get ? req.get("User-Agent") : null,
              requestId:
                req.headers?.["x-request-id"] ||
                `bulk_${Date.now()}_chunk_${i}`,
              created_at: new Date(),
              additionalInfo: JSON.stringify({
                source: "bulk_upload",
                processId,
                bulkBatchId: processId,
                chunk: i + 1,
              }),
            }));

            await AuditLog.bulkCreate(auditEntries);
          }
        } catch (chunkError) {
          console.error(`❌ Error in chunk ${i + 1}:`, chunkError);
          throw chunkError;
        }
      }

      return allCreated;
    });

    // Process results (now it's a single array of invoices, not batches)
    const totalInvoicesCreated = allCreatedInvoices
      ? allCreatedInvoices.length
      : 0;

    MemoryManagementService.completeProcess(processId);

    // Database settings are automatically restored when connection is released
    console.log("✅ Database operations completed successfully");

    const dbTime = Number(process.hrtime.bigint() - dbStart) / 1000000;
    console.log(`⚡ Database operations completed in ${dbTime.toFixed(2)}ms`);

    // PHASE 4: Response Preparation
    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;

    // Record performance metrics
    PerformanceOptimizationService.recordPerformanceMetric(
      "bulk_upload",
      totalTime,
      {
        invoiceCount: allCreatedInvoices.length,
        chunkCount: invoiceChunks.length,
        chunkSize: chunkSize,
        errorCount: errors.length,
        warningCount: warnings.length,
      },
    );

    console.log(`🎉 Bulk upload completed in ${totalTime.toFixed(2)}ms!`);
    console.log(
      `📊 Summary: ${totalInvoicesCreated} invoices created, ${errors.length} errors, ${warnings.length} warnings`,
    );

    // Log detailed error information
    if (errors.length > 0) {
      console.log(`❌ Detailed errors:`);
      errors.forEach((error, index) => {
        console.log(`  ${index + 1}. Row ${error.row}: ${error.error}`);
      });
    }

    // Get memory usage statistics
    const memoryUsage = MemoryManagementService.getMemoryUsage();
    console.log(
      `💾 Memory usage: ${memoryUsage.heapUsed}MB heap, ${memoryUsage.activeProcesses} active processes`,
    );

    // Log audit event for bulk invoice creation
    if (allCreatedInvoices && allCreatedInvoices.length > 0) {
      // Create individual audit logs for each invoice (for history tracking)
      try {
        // Validate user ID exists before creating audit logs
        const userId = req.user?.userId || req.user?.id || null;
        let validatedUserId = null;

        if (userId) {
          // Check if user exists in database
          const { default: User } = await import("../../model/mysql/User.js");
          const userExists = await User.findByPk(userId, {
            attributes: ["id"],
            raw: true,
          });

          if (userExists) {
            validatedUserId = userId;
          } else {
            console.warn(
              `⚠️ User ID ${userId} does not exist in database, setting to null`,
            );
          }
        }

        const auditEntries = allCreatedInvoices.map((invoice) => ({
          entityType: "invoice",
          entityId: invoice.id,
          operation: "CREATE",
          userId: validatedUserId, // Use validated user ID (null if doesn't exist)
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
          newValues: JSON.stringify(invoice),
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.get ? req.get("User-Agent") : null,
          requestId: req.headers?.["x-request-id"] || `bulk_${Date.now()}`,
          created_at: new Date(),
          additionalInfo: JSON.stringify({
            source: "bulk_upload",
            processId,
            bulkBatchId: processId,
          }),
        }));

        await AuditLog.bulkCreate(auditEntries);
        console.log(
          `✅ Individual audit logs created for ${allCreatedInvoices.length} invoices`,
        );
      } catch (individualAuditError) {
        console.error(
          "⚠️ Failed to log individual audit events:",
          individualAuditError,
        );
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk upload completed in ${totalTime.toFixed(2)}ms! ${totalInvoicesCreated} grouped invoices created as drafts.`,
      data: {
        created: allCreatedInvoices,
        errors: errors,
        warnings: warnings,
        summary: {
          total: invoices.length,
          successful: totalInvoicesCreated,
          failed: errors.length,
          warnings: warnings.length,
          processingTimeMs: processingTime.toFixed(2),
          databaseTimeMs: dbTime.toFixed(2),
          totalTimeMs: totalTime.toFixed(2),
        },
        performance: {
          invoicesPerSecond: (
            totalInvoicesCreated /
            (totalTime / 1000)
          ).toFixed(2),
          averageTimePerInvoice: (totalTime / totalInvoicesCreated).toFixed(4),
        },
        memory: {
          heapUsedMB: memoryUsage.heapUsed,
          heapTotalMB: memoryUsage.heapTotal,
          activeProcesses: memoryUsage.activeProcesses,
        },
      },
    });
  } catch (error) {
    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.error(
      `❌ Bulk upload failed after ${totalTime.toFixed(2)}ms:`,
      error,
    );

    res.status(500).json({
      success: false,
      message: `Bulk upload failed after ${totalTime.toFixed(2)}ms`,
      error: error.message,
      performance: {
        timeToFailure: totalTime.toFixed(2),
      },
    });
  }
};

// Check existing invoices for preview

// Lightweight endpoint: check if a single companyInvoiceRefNo already exists
export const checkCompanyRef = catchAsync(async (req, res, next) => {
  const { Invoice } = req.tenantModels;
  const { companyInvoiceRefNo, excludeId } = req.body;

  if (!companyInvoiceRefNo || !String(companyInvoiceRefNo).trim()) {
    return res.status(200).json({ exists: false });
  }

  const existing = await checkCompanyInvoiceRefNoUniqueness(
    Invoice,
    String(companyInvoiceRefNo).trim(),
    excludeId || null,
  );

  return res.status(200).json({ exists: !!existing });
});

export const checkExistingInvoices = async (req, res) => {
  try {
    const { Invoice } = req.tenantModels;

    const { invoices } = req.body;

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return res.status(400).json({
        success: false,

        message: "Invoices array is required and must not be empty",
      });
    }

    // Disabled duplicate check as per user request to allow uploading same invoices
    const existing = [];
    const newInvoices = invoices.map((inv, idx) => ({
      row: idx + 1,
      invoiceData: inv,
    }));

    return res.status(200).json({
      success: true,
      data: {
        existing: [],
        new: newInvoices,
      },
    });
  } catch (error) {
    console.error("Error checking existing invoices:", error);

    res.status(500).json({
      success: false,

      message: "Error checking existing invoices",

      error: error.message,
    });
  }
};

// Dashboard summary with monthly overview and recent invoices

export const getDashboardSummary = async (req, res) => {
  try {
    const { Invoice, InvoiceItem } = req.tenantModels;

    const sequelize = req.tenantDb;

    const { Sequelize } = sequelize;

    const { Op } = Sequelize;

    // Handle date range filter
    let whereDateRange = {};

    if (req.query.start_date && req.query.end_date) {
      // Use provided date range
      const startDateStr = req.query.start_date; // Already in YYYY-MM-DD format
      const endDateStr = req.query.end_date; // Already in YYYY-MM-DD format

      console.log("Dashboard Date Range Filter:", {
        start_date: req.query.start_date,
        end_date: req.query.end_date,
        startDateStr,
        endDateStr,
      });

      // Filter by invoiceDate using string comparison since it's stored as STRING
      // This handles both YYYY-MM-DD and DD-MM-YYYY formats that might be in the database
      whereDateRange = {
        [Op.and]: [
          {
            [Op.or]: [{ isDeleted: false }, { isDeleted: null }],
          },
          {
            [Op.or]: [
              // Handle YYYY-MM-DD format
              {
                invoiceDate: {
                  [Op.between]: [startDateStr, endDateStr],
                },
              },
              // Handle DD-MM-YYYY format (convert and compare)
              {
                invoiceDate: {
                  [Op.and]: [
                    // Convert DD-MM-YYYY to YYYY-MM-DD for comparison
                    sequelize.where(
                      sequelize.fn(
                        "STR_TO_DATE",
                        sequelize.col("invoiceDate"),
                        "%d-%m-%Y",
                      ),
                      {
                        [Op.between]: [startDateStr, endDateStr],
                      },
                    ),
                  ],
                },
              },
            ],
          },
        ],
      };
    } else {
      // Default to last 12 months if no date range specified
      const endDate = new Date();
      const startDate = new Date(
        new Date(endDate).setMonth(endDate.getMonth() - 11, 1),
      );

      whereDateRange = {
        [Op.or]: [{ isDeleted: false }, { isDeleted: null }],
        created_at: { [Op.between]: [startDate, endDate] },
      };
    }

    // Regular users can see ALL company dashboard data as requested
    console.log(
      "Dashboard visibility - showing all non-deleted metrics for the tenant",
    );

    // Key metrics

    const [totalCreated, totalDrafts, totalSaved, totalPosted, totalAmount] =
      await Promise.all([
        Invoice.count({ where: whereDateRange, logging: console.log }),

        Invoice.count({ where: { ...whereDateRange, status: "draft" } }),

        Invoice.count({ where: { ...whereDateRange, status: "saved" } }),

        Invoice.count({
          where: {
            ...whereDateRange,
            status: { [Op.in]: ["posted", "submitted", "validated"] },
          },
        }),

        // For InvoiceItem sum, we need to join with Invoice to filter by invoiceDate
        InvoiceItem.sum("totalValues", {
          where: {
            [Op.or]: [{ isDeleted: false }, { isDeleted: null }],
          },
          include: [
            {
              model: Invoice,
              where: whereDateRange,
              attributes: [],
            },
          ],
        }).then((v) => v || 0),
      ]);

    // Monthly overview: counts by month for posted and saved

    const monthlyRows = await Invoice.findAll({
      attributes: [
        [
          Sequelize.fn("DATE_FORMAT", Sequelize.col("invoiceDate"), "%Y-%m"),

          "month",
        ],

        [
          Sequelize.literal(
            "SUM(CASE WHEN status IN ('posted', 'submitted') THEN 1 ELSE 0 END)",
          ),

          "posted",
        ],

        [
          Sequelize.literal(
            "SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END)",
          ),

          "draft",
        ],

        [Sequelize.fn("COUNT", Sequelize.col("id")), "total"],
      ],

      where: whereDateRange,

      group: [
        Sequelize.fn("DATE_FORMAT", Sequelize.col("invoiceDate"), "%Y-%m"),
      ],

      order: [
        [
          Sequelize.fn("DATE_FORMAT", Sequelize.col("invoiceDate"), "%Y-%m"),

          "ASC",
        ],
      ],
    });

    const monthlyOverview = monthlyRows.map((row) => {
      const plain = row.get({ plain: true });

      return {
        month: plain.month,

        posted: Number(plain.posted || 0),

        draft: Number(plain.draft || 0),

        total: Number(plain.total || 0),
      };
    });

    // Recent invoices with aggregated amount

    const recentInvoicesRaw = await Invoice.findAll({
      attributes: [
        "id",

        ["invoice_number", "invoiceNumber"],

        "status",

        "invoiceDate",

        [
          Sequelize.fn("SUM", Sequelize.col("InvoiceItems.totalValues")),

          "amount",
        ],
      ],

      include: [{ model: InvoiceItem, as: "InvoiceItems", attributes: [] }],

      where: whereDateRange,

      group: ["Invoice.id"],

      order: [["created_at", "DESC"]],

      limit: 10,

      subQuery: false,
    });

    const recentInvoices = recentInvoicesRaw.map((row) => {
      const plain = row.get({ plain: true });

      return {
        id: plain.id,

        invoiceNumber: plain.invoiceNumber,

        date: plain.invoiceDate,

        amount: Number(plain.amount || 0),

        status: plain.status,

        postedToFBR: plain.status === "posted" || plain.status === "submitted",
      };
    });

    res.status(200).json({
      success: true,

      data: {
        metrics: {
          total_invoices_created: totalCreated,

          total_invoices_draft: totalDrafts,

          total_invoices_saved: totalSaved,

          total_posted_to_fbr: totalPosted,

          total_invoice_amount: Number(totalAmount || 0),
        },

        monthly_overview: monthlyOverview,

        recent_invoices: recentInvoices,
      },
    });
  } catch (error) {
    console.error("Error getting dashboard summary:", error);

    res.status(500).json({
      success: false,

      message: "Error retrieving dashboard summary",

      error: error.message,
    });
  }
};

// Get document types from FBR

export const getDocumentTypesController = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const { environment = "sandbox" } = req.query;

    // Get token from request headers

    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,

        message: "Authorization token required",
      });
    }

    console.log(
      `Fetching document types for tenant: ${tenantId}, environment: ${environment}`,
    );

    // Get tenant data to check FBR credentials

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({
        success: false,

        message: "Tenant not found",
      });
    }

    // Check if tenant has FBR credentials

    if (!tenant.sandboxProductionToken) {
      return res.status(400).json({
        success: false,

        message: "FBR credentials not found for this tenant",
      });
    }

    // Call FBR service to get document types

    const documentTypes = await getDocumentTypes(environment, token);

    res.json({
      success: true,

      message: "Document types fetched successfully",

      data: documentTypes,
    });
  } catch (error) {
    console.error("Error fetching document types:", error);

    // Handle specific error cases

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,

        message: "FBR authentication failed. Please check your credentials.",
      });
    } else if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,

        message: "Document types API endpoint not found.",
      });
    } else if (error.response?.status === 500) {
      return res.status(503).json({
        success: false,

        message:
          error.response?.data?.error ||
          error.response?.data?.message ||
          "FBR system is temporarily unavailable. Please try again later.",

        data: error.response?.data,
      });
    } else if (error.code === "ECONNABORTED") {
      return res.status(408).json({
        success: false,

        message: "Request timeout. FBR system may be slow. Please try again.",
      });
    } else if (error.code === "ERR_NETWORK") {
      return res.status(503).json({
        success: false,

        message: "Network error. Please check your connection and try again.",
      });
    } else {
      return res.status(500).json({
        success: false,

        message:
          error.message || "Unable to fetch document types from FBR API.",
      });
    }
  }
};

// Get provinces from FBR

export const getProvincesController = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const { environment = "sandbox" } = req.query;

    // Get token from request headers

    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,

        message: "Authorization token required",
      });
    }

    console.log(
      `Fetching provinces for tenant: ${tenantId}, environment: ${environment}`,
    );

    // Get tenant data to check FBR credentials

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({
        success: false,

        message: "Tenant not found",
      });
    }

    // Check if tenant has FBR credentials

    if (!tenant.sandboxProductionToken) {
      return res.status(400).json({
        success: false,

        message: "FBR credentials not found for this tenant",
      });
    }

    // Call FBR service to get provinces

    const provinces = await getProvinces(environment, token);

    res.json({
      success: true,

      message: "Provinces fetched successfully",

      data: provinces,
    });
  } catch (error) {
    console.error("Error fetching provinces:", error);

    // Handle specific error cases

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,

        message: "FBR authentication failed. Please check your credentials.",
      });
    } else if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,

        message: "Provinces API endpoint not found.",
      });
    } else if (error.response?.status === 500) {
      return res.status(503).json({
        success: false,

        message:
          error.response?.data?.error ||
          error.response?.data?.message ||
          "FBR system is temporarily unavailable. Please try again later.",

        data: error.response?.data,
      });
    } else if (error.code === "ECONNABORTED") {
      return res.status(408).json({
        success: false,

        message: "Request timeout. FBR system may be slow. Please try again.",
      });
    } else if (error.code === "ERR_NETWORK") {
      return res.status(503).json({
        success: false,

        message: "Network error. Please check your connection and try again.",
      });
    } else {
      return res.status(500).json({
        success: false,

        message: error.message || "Unable to fetch provinces from FBR API.",
      });
    }
  }
};

// Validate invoice data with FBR

export const validateInvoiceDataController = catchAsync(
  async (req, res, next) => {
    const { environment = "production" } = req.query;
    const invoiceData = req.body;

    // Basic Input Validation
    const validationErrors = [];
    if (!invoiceData.sellerNTNCNIC || !invoiceData.sellerBusinessName) {
      validationErrors.push(
        "Seller Information (NTN/CNIC, Business Name) is missing",
      );
    }
    if (!invoiceData.buyerNTNCNIC) {
      validationErrors.push("Buyer NTN/CNIC is missing");
    }
    if (
      !invoiceData.items ||
      !Array.isArray(invoiceData.items) ||
      invoiceData.items.length === 0
    ) {
      validationErrors.push("At least one item is required");
    } else {
      // Validate individual items
      invoiceData.items.forEach((item, index) => {
        if (!item.hsCode)
          validationErrors.push(`Item ${index + 1}: HS Code is missing`);
        if (!item.rate)
          validationErrors.push(`Item ${index + 1}: Rate is missing`);
        if (!item.uoM)
          validationErrors.push(`Item ${index + 1}: UoM is missing`);
      });
    }

    if (validationErrors.length > 0) {
      return next(
        new AppError(`Validation failed: ${validationErrors.join("; ")}`, 400),
      );
    }

    // Get tenant from middleware (set by identifyTenant)
    const tenant = req.tenant;

    if (!tenant) {
      return next(new AppError("Tenant not found", 404));
    }

    console.log(
      `Validating invoice data for tenant: ${tenant.tenant_id}, environment: ${environment}`,
    );

    // Check if tenant has FBR credentials
    const fbrToken =
      environment === "production"
        ? tenant.sandboxProductionToken
        : tenant.sandboxTestToken || tenant.sandboxProductionToken;

    if (!fbrToken) {
      return next(
        new AppError("FBR credentials not found for this tenant", 400),
      );
    }

    // Call FBR service to validate invoice data
    try {
      const validationResult = await validateInvoiceData(
        invoiceData,
        environment,
        fbrToken,
      );

      res.status(200).json({
        success: true,
        message: "Invoice data validated successfully",
        data: validationResult,
      });
    } catch (error) {
      console.error("Error validating invoice data:", error);
      // Handle specific error cases from FBR Service
      if (error.response?.status === 401) {
        return next(
          new AppError(
            "FBR authentication failed. Please check your credentials.",
            401,
          ),
        );
      } else if (error.response?.status === 400) {
        // Pass through FBR validation errors
        const fbrError =
          error.response?.data?.error ||
          error.response?.data?.message ||
          "Invalid invoice data provided.";
        const appError = new AppError(fbrError, 400);
        // Attach data if available for frontend to parse
        if (error.response?.data) {
          appError.data = error.response.data;
        }
        return next(appError);
      } else if (error.response?.status === 500) {
        return next(
          new AppError(
            "FBR system is temporarily unavailable. Please try again later.",
            503,
          ),
        );
      } else if (error.code === "ECONNABORTED") {
        return next(
          new AppError(
            "Request timeout. FBR system may be slow. Please try again.",
            408,
          ),
        );
      } else if (error.code === "ERR_NETWORK") {
        return next(
          new AppError(
            "Network error. Please check your connection and try again.",
            503,
          ),
        );
      } else {
        return next(error);
      }
    }
  },
);

// Submit invoice data to FBR

export const submitInvoiceDataController = async (req, res) => {
  try {
    const { environment = "production" } = req.query;

    const invoiceData = req.body;

    // Get tenant from middleware (set by identifyTenant)
    const tenant = req.tenant;

    if (!tenant) {
      return res.status(404).json({
        success: false,

        message: "Tenant not found",
      });
    }

    console.log(
      `Submitting invoice data for tenant: ${tenant.tenant_id}, environment: ${environment}`,
    );

    // Check if tenant has FBR credentials
    const fbrToken =
      environment === "production"
        ? tenant.sandboxProductionToken
        : tenant.sandboxTestToken || tenant.sandboxProductionToken;

    if (!fbrToken) {
      return res.status(400).json({
        success: false,

        message: "FBR credentials not found for this tenant",
      });
    }

    // Call FBR service to submit invoice data

    // Call FBR service to submit invoice data
    const submissionResult = await submitInvoiceData(
      invoiceData,
      environment,
      fbrToken,
    );
    console.log("Submission result:", submissionResult);

    // Create backup for FBR submission (Request + Response)
    try {
      // Try to find the invoice to link it properly
      let invoiceBackup = null;
      if (req.tenantModels && req.tenantModels.Invoice) {
        const { Invoice } = req.tenantModels;
        const invoiceNum =
          invoiceData.invoiceNumber || invoiceData.invoice_number;
        if (invoiceNum) {
          invoiceBackup = await Invoice.findOne({
            where: { invoice_number: invoiceNum },
          });
        }
      }

      const mockInvoice = {
        id: invoiceBackup ? invoiceBackup.id : null, // Use null if no invoice found
        invoice_number:
          invoiceData.invoiceNumber || invoiceData.invoice_number || "UNKNOWN",
        system_invoice_id: invoiceBackup
          ? invoiceBackup.system_invoice_id
          : null,
        status: invoiceBackup ? invoiceBackup.status : "unknown",
        ...invoiceData,
      };

      if (invoiceBackup) {
        // If we found the real invoice, use its data as base
        Object.assign(mockInvoice, invoiceBackup.toJSON());
      }

      await InvoiceBackupService.createFbrSubmissionBackup({
        tenantDb: req.tenantDb,
        tenantModels: req.tenantModels,
        invoice: mockInvoice,
        fbrRequestData: invoiceData,
        fbrResponseData: submissionResult,
        invoiceItems: invoiceData.items,
        user: req.user,
        tenant: req.tenant,
        request: {
          ip: req.ip || req.connection?.remoteAddress,
          userAgent: req.get ? req.get("User-Agent") : null,
          requestId: req.headers?.["x-request-id"] || null,
        },
      });
    } catch (backupError) {
      console.error(
        "❌ Error creating FBR backup in submitInvoiceDataController:",
        backupError,
      );
    }

    res.json({
      success: true,

      message: "Invoice data submitted successfully",

      data: submissionResult,
    });
  } catch (error) {
    console.error("Error submitting invoice data:", error);

    // Handle specific error cases

    if (error.response?.status === 401) {
      return res.status(401).json({
        success: false,

        message: "FBR authentication failed. Please check your credentials.",
      });
    } else if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,

        message: "Invalid invoice data provided.",

        data: error.response?.data,
      });
    } else if (error.response?.status === 500) {
      return res.status(503).json({
        success: false,

        message:
          error.response?.data?.error ||
          error.response?.data?.message ||
          "FBR system is temporarily unavailable. Please try again later.",

        data: error.response?.data,
      });
    } else if (error.code === "ECONNABORTED") {
      return res.status(408).json({
        success: false,

        message: "Request timeout. FBR system may be slow. Please try again.",
      });
    } else if (error.code === "ERR_NETWORK") {
      return res.status(503).json({
        success: false,

        message: "Network error. Please check your connection and try again.",
      });
    } else {
      return res.status(500).json({
        success: false,

        message: error.message || "Unable to submit invoice data to FBR API.",
      });
    }
  }
};

export const downloadInvoiceTemplateExcel = async (req, res) => {
  const processId = `excel_template_${Date.now()}`;
  const startTime = process.hrtime.bigint();

  try {
    // Register process for memory tracking
    const { default: MemoryManagementService } = await import(
      "../../service/MemoryManagementService.js"
    );
    MemoryManagementService.registerProcess(processId, {
      type: "excel_template_generation",
      tenantId: req.tenant?.tenant_id,
    });

    // Dynamically import exceljs to avoid loading cost if unused
    const ExcelJS = (await import("exceljs")).default;
    const { fetchData } = await import("../../service/FBRService.js");

    // Force garbage collection before starting
    if (global.gc) {
      global.gc();
    }

    // Check initial memory usage
    const initialMemory = MemoryManagementService.getMemoryUsage();
    console.log(
      `🚀 Starting Excel template generation - Initial memory: ${initialMemory.heapUsed}MB`,
    );

    // Set memory limit warning threshold (1GB)
    const MEMORY_LIMIT_MB = 1024;
    if (initialMemory.heapUsed > MEMORY_LIMIT_MB) {
      console.warn(
        `⚠️ High initial memory usage detected: ${initialMemory.heapUsed}MB. Forcing cleanup...`,
      );
      MemoryManagementService.forceCleanup();
      if (global.gc) {
        global.gc();
      }
    }

    // Token is optional for template generation; prefer sandbox, then production

    const token =
      req.tenant?.sandboxTestToken ||
      req.tenant?.sandboxProductionToken ||
      null;

    // Fetch provinces to map seller province to code (optional)

    let provinceMap = {};

    let provinceCode = undefined;

    try {
      if (token) {
        const provinces = await fetchData("pdi/v1/provinces", "sandbox", token);

        provinceMap = Array.isArray(provinces)
          ? provinces.reduce((acc, p) => {
              const desc =
                p.stateProvinceDesc || p.STATEPROVINCEDESC || p.desc || "";

              const code =
                p.stateProvinceCode || p.STATEPROVINCECODE || p.code || "";

              if (desc && code) acc[desc.toUpperCase()] = code;

              return acc;
            }, {})
          : {};

        const tenantProvince = (
          req.tenant?.seller_province || ""
        ).toUpperCase();

        provinceCode = provinceMap[tenantProvince];
      }
    } catch (e) {
      provinceMap = {};

      provinceCode = undefined;
    }

    // Fallback: if provinces couldn't be fetched, seed with a default set for dropdowns

    if (!provinceMap || Object.keys(provinceMap).length === 0) {
      const defaultProvinceNames = [
        "BALOCHISTAN",

        "AZAD JAMMU AND KASHMIR",

        "CAPITAL TERRITORY",

        "PUNJAB",

        "KHYBER PAKHTUNKHWA",

        "GILGIT BALTISTAN",

        "SINDH",
      ];

      provinceMap = defaultProvinceNames.reduce((acc, name) => {
        // We don't have province codes without FBR API; use name as placeholder

        acc[name] = name;

        return acc;
      }, {});

      // provinceCode remains undefined; rate fetching will gracefully skip
    }

    // Fetch transaction types (optional). If not available, use a safe placeholder

    let transactionTypes = [];

    try {
      if (token) {
        const transTypesRaw = await fetchData(
          "pdi/v1/transtypecode",

          "sandbox",

          token,
        );

        const mappedTypes = (Array.isArray(transTypesRaw) ? transTypesRaw : [])

          .map((t) => {
            // Support various possible key casings/aliases from FBR API

            const id =
              t.transTypeId ||
              t.TRANSTYPEID ||
              t.tranTypeId ||
              t.id ||
              t.transactionTypeId ||
              t.transaction_type_id ||
              t.transactionTypeID ||
              t.transactioN_TYPE_ID ||
              t.TRANSACTION_TYPE_ID;

            const desc =
              t.transTypeDesc ||
              t.TRANSTYPEDESC ||
              t.transactionDesc ||
              t.desc ||
              t.description ||
              t.transactioN_DESC ||
              t.TRANSACTION_DESC;

            return id ? { id: String(id), desc: desc || String(id) } : null;
          })

          .filter(Boolean);

        // Deduplicate by id to avoid conflicting lists/named references

        const uniqueById = new Map();

        for (const tt of mappedTypes) {
          if (!uniqueById.has(tt.id)) uniqueById.set(tt.id, tt);
        }

        transactionTypes = Array.from(uniqueById.values());
      }
    } catch (e) {
      transactionTypes = [];
    }

    if (transactionTypes.length === 0) {
      transactionTypes = [{ id: "0", desc: "Select" }];
    }

    // Ensure all hardcoded transaction types are included for comprehensive rate coverage
    // This ensures that all rates from the API and hardcoded data are available in the Excel dropdown
    try {
      const { TRANSACTION_TYPE_RATES } = await import(
        "../../../frontend/src/utils/hardcodedRates.js"
      );
      const hardcodedTransactionTypeIds = Object.keys(TRANSACTION_TYPE_RATES);

      // Add any missing transaction types from hardcoded data
      hardcodedTransactionTypeIds.forEach((typeId) => {
        const existingType = transactionTypes.find((tt) => tt.id === typeId);
        if (!existingType) {
          // Add the missing transaction type with a generic description
          transactionTypes.push({
            id: typeId,
            desc: `Transaction Type ${typeId}`,
          });
        }
      });

      console.log(
        `Added ${hardcodedTransactionTypeIds.length} hardcoded transaction types to ensure comprehensive rate coverage`,
      );
    } catch (fallbackError) {
      console.warn(
        "Could not load hardcoded transaction types:",
        fallbackError,
      );
    }

    // Fetch rates per transaction type; aggregate across province codes if needed

    // Also keep id+desc mapping to enable SRO lookup by rate id

    const ratesByType = {};

    const rateIdDescPairsByType = {};

    if (token) {
      const formatFbrShortDate = (d = new Date()) => {
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const day = String(d.getDate()).padStart(2, "0");
        return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
      };

      const saleTypeToRateDate = formatFbrShortDate();

      const candidateProvinceCodes = [];

      if (provinceCode) {
        candidateProvinceCodes.push(provinceCode);
      } else if (provinceMap && Object.keys(provinceMap).length > 0) {
        const uniqueCodes = new Set(
          Object.values(provinceMap)

            .map((v) => (v == null ? null : String(v)))

            .filter((v) => v && v.length > 0),
        );

        candidateProvinceCodes.push(...uniqueCodes);
      }

      for (const tt of transactionTypes) {
        const aggregated = new Set();

        if (candidateProvinceCodes.length === 0) {
          // No province codes available; we'll try a fallback call without province below
        }

        for (const code of candidateProvinceCodes) {
          try {
            const ratesRaw = await fetchData(
              `pdi/v2/SaleTypeToRate?date=${saleTypeToRateDate}&transTypeId=${encodeURIComponent(
                tt.id,
              )}&originationSupplier=${encodeURIComponent(code)}`,

              "sandbox",

              token,
            );

            const parsedRates = (Array.isArray(ratesRaw) ? ratesRaw : [])

              .map((r) => {
                const rateDesc =
                  r.ratE_DESC ||
                  r.raTE_DESC ||
                  r.rateDesc ||
                  r.RATE_DESC ||
                  r.rATEDESC ||
                  r.desc ||
                  null;

                const rateId =
                  r.ratE_ID ||
                  r.raTE_ID ||
                  r.rateId ||
                  r.RATE_ID ||
                  r.id ||
                  null;

                return rateDesc
                  ? {
                      id: rateId ? String(rateId) : null,

                      desc: String(rateDesc).trim(),
                    }
                  : null;
              })

              .filter(Boolean);

            // Add ALL rates from this API call to the aggregated set
            parsedRates.forEach((rate) => {
              if (rate && rate.desc) {
                aggregated.add(rate.desc);
              }
            });

            // Store id+desc pairs per type

            if (!rateIdDescPairsByType[tt.id])
              rateIdDescPairsByType[tt.id] = new Map();

            for (const pr of parsedRates) {
              if (!rateIdDescPairsByType[tt.id].has(pr.desc) && pr.id) {
                rateIdDescPairsByType[tt.id].set(pr.desc, pr.id);
              }
            }
          } catch (e) {
            // Try next province code
          }
        }

        // Fallback: if still empty, try without province filter (broad fetch)

        if (aggregated.size === 0) {
          try {
            const ratesRawNoProv = await fetchData(
              `pdi/v2/SaleTypeToRate?date=${saleTypeToRateDate}&transTypeId=${encodeURIComponent(
                tt.id,
              )}`,

              "sandbox",

              token,
            );

            const parsedRatesNoProv = (
              Array.isArray(ratesRawNoProv) ? ratesRawNoProv : []
            )

              .map((r) => {
                const rateDesc =
                  r.ratE_DESC ||
                  r.raTE_DESC ||
                  r.rateDesc ||
                  r.RATE_DESC ||
                  r.rATEDESC ||
                  r.desc ||
                  null;

                const rateId =
                  r.ratE_ID ||
                  r.raTE_ID ||
                  r.rateId ||
                  r.RATE_ID ||
                  r.id ||
                  null;

                return rateDesc
                  ? {
                      id: rateId ? String(rateId) : null,

                      desc: String(rateDesc).trim(),
                    }
                  : null;
              })

              .filter(Boolean);

            // Add ALL rates from this fallback API call to the aggregated set
            parsedRatesNoProv.forEach((rate) => {
              if (rate && rate.desc) {
                aggregated.add(rate.desc);
              }
            });

            if (!rateIdDescPairsByType[tt.id])
              rateIdDescPairsByType[tt.id] = new Map();

            for (const pr of parsedRatesNoProv) {
              if (!rateIdDescPairsByType[tt.id].has(pr.desc) && pr.id) {
                rateIdDescPairsByType[tt.id].set(pr.desc, pr.id);
              }
            }
          } catch (e) {
            // ignore
          }
        }

        ratesByType[tt.id] = Array.from(aggregated);

        // If no rates found from API, try to include hardcoded rates as fallback
        if (ratesByType[tt.id].length === 0) {
          try {
            // Import hardcoded rates as fallback
            const { TRANSACTION_TYPE_RATES } = await import(
              "../../../frontend/src/utils/hardcodedRates.js"
            );
            const hardcodedRates = TRANSACTION_TYPE_RATES[tt.id];
            if (hardcodedRates && Array.isArray(hardcodedRates)) {
              const hardcodedRateDescs = hardcodedRates
                .map((rate) => rate.ratE_DESC)
                .filter(Boolean);
              ratesByType[tt.id] = hardcodedRateDescs;

              // Also add to rate mapping
              if (!rateIdDescPairsByType[tt.id]) {
                rateIdDescPairsByType[tt.id] = new Map();
              }
              hardcodedRates.forEach((rate) => {
                if (rate.ratE_DESC && rate.ratE_ID) {
                  rateIdDescPairsByType[tt.id].set(
                    rate.ratE_DESC,
                    String(rate.ratE_ID),
                  );
                }
              });
            }
          } catch (fallbackError) {
            console.warn(
              `Could not load hardcoded rates for transaction type ${tt.id}:`,
              fallbackError,
            );
          }
        }
      }
    } else {
      // Provide fallback rates for all transaction types if we cannot fetch from API
      try {
        // Import hardcoded rates as comprehensive fallback
        const { TRANSACTION_TYPE_RATES } = await import(
          "../../../frontend/src/utils/hardcodedRates.js"
        );

        for (const tt of transactionTypes) {
          const hardcodedRates = TRANSACTION_TYPE_RATES[tt.id];
          if (hardcodedRates && Array.isArray(hardcodedRates)) {
            const hardcodedRateDescs = hardcodedRates
              .map((rate) => rate.ratE_DESC)
              .filter(Boolean);
            ratesByType[tt.id] = hardcodedRateDescs;

            // Also add to rate mapping
            rateIdDescPairsByType[tt.id] = new Map();
            hardcodedRates.forEach((rate) => {
              if (rate.ratE_DESC && rate.ratE_ID) {
                rateIdDescPairsByType[tt.id].set(
                  rate.ratE_DESC,
                  String(rate.ratE_ID),
                );
              }
            });
          } else {
            ratesByType[tt.id] = [];
            rateIdDescPairsByType[tt.id] = new Map();
          }
        }
      } catch (fallbackError) {
        console.warn(
          "Could not load hardcoded rates as fallback:",
          fallbackError,
        );

        // Final fallback: empty rates
        for (const tt of transactionTypes) {
          ratesByType[tt.id] = [];
          rateIdDescPairsByType[tt.id] = new Map();
        }
      }
    }

    // Build unified map of rate desc -> rate id (best-effort across all transaction types)

    const rateDescToId = new Map();

    for (const tt of transactionTypes) {
      const pairs = rateIdDescPairsByType[tt.id] || new Map();

      for (const [desc, id] of pairs.entries()) {
        if (desc && id && !rateDescToId.has(desc)) rateDescToId.set(desc, id);
      }
    }

    // Ensure common rates (18.5% and 25%) have proper rate IDs
    if (!rateDescToId.has("18.5%")) {
      rateDescToId.set("18.5%", "430"); // Using rate ID from transaction type 18
    }
    if (!rateDescToId.has("25%")) {
      rateDescToId.set("25%", "746"); // Using rate ID from transaction type 23
    }

    // Fetch SRO schedules for all available rate IDs and create comprehensive SRO list
    // IMPORTANT: Always include rate_id=133 plus all other rate IDs
    const sroByRateId = {};
    const allUniqueSROs = new Set(); // Track all unique SRO Schedule Numbers

    if (token) {
      // Start with rate_id=133 as a priority, then add all other rate IDs
      const uniqueRateIds = new Set();

      // ALWAYS include rate_id=133 first (priority)
      uniqueRateIds.add("133");
      console.log("✅ Rate ID 133 explicitly included as priority");

      // Add all other rate IDs from rateDescToId if available
      if (rateDescToId && rateDescToId.size > 0) {
        const otherRateIds = Array.from(rateDescToId.values());
        otherRateIds.forEach((id) => uniqueRateIds.add(String(id)));
        console.log(
          `Added ${otherRateIds.length} additional rate IDs from rateDescToId`,
        );
      }

      // Add some common rate IDs as fallback to ensure comprehensive coverage
      const commonRateIds = ["134", "135", "136", "137", "138", "139", "140"];
      commonRateIds.forEach((id) => uniqueRateIds.add(id));
      console.log("Added common rate IDs as fallback");

      console.log(
        `Fetching SRO Schedule data for ${uniqueRateIds.size} rate IDs...`,
      );
      console.log(
        "All Rate IDs to fetch:",
        Array.from(uniqueRateIds).slice(0, 15),
      );

      let successfulFetches = 0;
      let failedFetches = 0;

      const formatSroScheduleDate = (d = new Date()) => {
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const day = String(d.getDate()).padStart(2, "0");
        return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
      };

      const sroScheduleDate = formatSroScheduleDate();

      for (const rateId of uniqueRateIds) {
        try {
          console.log(`Fetching SRO Schedule data for rate_id=${rateId}...`);

          // Fetch SRO Schedule data for each rate ID
          const sroRaw = await fetchData(
            `pdi/v1/SroSchedule?rate_id=${rateId}&date=${sroScheduleDate}&origination_supplier_csv=1`,
            "sandbox",
            token,
          );

          console.log(`SRO Schedule API response for rate_id=${rateId}:`, {
            isArray: Array.isArray(sroRaw),
            length: Array.isArray(sroRaw) ? sroRaw.length : "N/A",
            sample:
              Array.isArray(sroRaw) && sroRaw.length > 0
                ? sroRaw[0]
                : "No data",
          });

          const items = (Array.isArray(sroRaw) ? sroRaw : [])
            .map((s) => {
              // Extract srO_DESC from the API response
              const sroDesc = s.srO_DESC || s.SRO_DESC || s.desc || null;
              const sroId = s.srO_ID || s.SRO_ID || s.id || null;

              return sroDesc && sroId
                ? { id: String(sroId), desc: String(sroDesc).trim() }
                : null;
            })
            .filter(Boolean);

          console.log(
            `Found ${items.length} SRO Schedule items for rate_id=${rateId}`,
          );

          // Create a map for this rate ID
          const aggregated = new Map(); // desc -> id

          for (const it of items) {
            if (!aggregated.has(it.desc)) {
              aggregated.set(it.desc, it.id);
            }

            // Add all SRO descriptions to the comprehensive set
            if (it.desc) {
              allUniqueSROs.add(it.desc);
            }
          }

          sroByRateId[rateId] = aggregated; // Map(desc -> id)
          successfulFetches++;

          // Special logging for rate_id=133
          if (rateId === "133") {
            console.log(
              `✅ SUCCESS: Rate ID 133 fetched ${items.length} SRO Schedule items`,
            );
            console.log(
              "Rate ID 133 SRO Descriptions:",
              Array.from(aggregated.keys()).slice(0, 5),
            );
          }
        } catch (e) {
          console.error(
            `Failed to fetch SRO Schedule data for rate_id=${rateId}:`,
            e.message,
          );
          sroByRateId[rateId] = new Map(); // Empty map for failed fetches
          failedFetches++;

          // Special error logging for rate_id=133
          if (rateId === "133") {
            console.error(
              "❌ CRITICAL: Failed to fetch rate_id=133 SRO Schedule data!",
            );
          }
        }
      }

      console.log(
        `SRO Schedule Fetch Summary: ${successfulFetches} successful, ${failedFetches} failed`,
      );
      console.log(
        `Collected ${allUniqueSROs.size} unique SRO Schedule Numbers from API across all rate IDs`,
      );

      // Verify rate_id=133 was successfully fetched
      if (sroByRateId["133"] && sroByRateId["133"].size > 0) {
        console.log(
          `✅ CONFIRMED: Rate ID 133 has ${sroByRateId["133"].size} SRO Schedule items`,
        );
      } else {
        console.warn("⚠️ WARNING: Rate ID 133 has no SRO Schedule items!");
      }

      // Log sample SRO descriptions
      console.log(
        "Sample SRO Descriptions from all rate IDs:",
        Array.from(allUniqueSROs).slice(0, 10),
      );
    } else {
      console.log("No token available for SRO Schedule fetching");
    }

    // Add fallback SRO Schedule data for comprehensive coverage
    const fallbackSROData = [
      "EIGHTH SCHEDULE Table 1",
      "EIGHTH SCHEDULE Table 2",
      "587(I)/2017",
      "327(I)/2008",
      "FIFTH SCHEDULE",
      "SECTION 49",
      "Section 4(b)",
      "1579(1)/2021",
      "321(I)/2022",
      "1450(I)/2021",
      "1604(I)/2021",
      "88(I)/2022",
      "01(I)/2022",
      "NINTH SCHEDULE",
      "297(I)/2023-Table-I",
      "297(I)/2023-Table-II",
      "FIFTH SCHEDULE",
      "ICTO",
      "ICTO TABLE II",
      "ICTO TABLE I",
      "6th Schd Table I",
      "6th Schd Table II",
      "6th Schd Table III",
      "Eighth Schedule Table 1",
      "NINTH SCHEDULE",
      "6th Schd Table III",
    ];

    // Add fallback SRO Schedule data to comprehensive set
    fallbackSROData.forEach((sro) => {
      allUniqueSROs.add(sro);
    });

    // Create comprehensive SRO Schedule list for dropdown (prepend "N/A")
    const comprehensiveSROList = Array.from(allUniqueSROs).sort();
    if (!comprehensiveSROList.includes("N/A")) {
      comprehensiveSROList.unshift("N/A");
    }

    console.log(
      `Total unique SRO Schedule Numbers available: ${comprehensiveSROList.length}`,
    );
    console.log(
      `SRO Schedule Numbers: ${comprehensiveSROList.slice(0, 10).join(", ")}${comprehensiveSROList.length > 10 ? "..." : ""}`,
    );

    // Build comprehensive SRO Item list from the main SRO Item API
    const allUniqueSROItems = new Set(); // Track all unique SRO Item Numbers

    if (token) {
      try {
        console.log("Fetching all SRO Items from /pdi/v1/sroitemcode...");

        // Fetch all SRO Items from the main API endpoint
        const sroItemsRaw = await fetchData(
          "pdi/v1/sroitemcode",
          "sandbox",
          token,
        );

        console.log(`SRO Item API response:`, {
          isArray: Array.isArray(sroItemsRaw),
          length: Array.isArray(sroItemsRaw) ? sroItemsRaw.length : "N/A",
          sample:
            Array.isArray(sroItemsRaw) && sroItemsRaw.length > 0
              ? sroItemsRaw[0]
              : "No data",
        });

        if (Array.isArray(sroItemsRaw)) {
          const items = sroItemsRaw
            .map((item) => {
              // Extract SRO Item description from various possible field names
              const desc =
                item.srO_ITEM_DESC ||
                item.SRO_ITEM_DESC ||
                item.sro_item_desc ||
                item.SRO_ITEM_DESCRIPTION ||
                item.sroItemDesc ||
                item.sroItemDescription ||
                item.desc ||
                item.description ||
                item.item_desc ||
                item.ITEM_DESC ||
                null;
              return desc ? String(desc).trim() : null;
            })
            .filter(Boolean);

          console.log(`Found ${items.length} SRO Item items from API`);

          // Add all SRO Item descriptions to the comprehensive set
          items.forEach((item) => {
            if (item && item.trim() !== "") {
              allUniqueSROItems.add(item);
            }
          });

          console.log(
            `✅ SUCCESS: Fetched ${allUniqueSROItems.size} unique SRO Item descriptions from API`,
          );
          console.log(
            "Sample SRO Item Descriptions:",
            Array.from(allUniqueSROItems).slice(0, 15),
          );
          console.log(
            "All SRO Item Descriptions count:",
            allUniqueSROItems.size,
          );
        } else {
          console.warn(
            "SRO Item API returned non-array response:",
            sroItemsRaw,
          );
        }

        // Force garbage collection after processing large SRO Items data
        if (global.gc) {
          global.gc();
        }
      } catch (e) {
        console.error(
          `Failed to fetch SRO Item data from /pdi/v1/sroitemcode:`,
          e.message,
        );
      }
    } else {
      console.log("No token available for SRO Item fetching");
    }

    // No fallback data - use only API data for SRO Items

    // Create comprehensive SRO Item list for dropdown (prepend "N/A")
    const comprehensiveSROItemList = Array.from(allUniqueSROItems).sort();
    if (!comprehensiveSROItemList.includes("N/A")) {
      comprehensiveSROItemList.unshift("N/A");
    }

    console.log(
      `Total unique SRO Item Numbers available: ${comprehensiveSROItemList.length}`,
    );
    console.log(
      `SRO Item Numbers: ${comprehensiveSROItemList.slice(0, 15).join(", ")}${comprehensiveSROItemList.length > 15 ? "..." : ""}`,
    );

    // Log if we have SRO Items from API or if the list is empty
    if (comprehensiveSROItemList.length <= 1) {
      // Only "N/A"
      console.warn(
        '⚠️ WARNING: No SRO Items found from API. Only "N/A" option available.',
      );
    } else {
      console.log(
        `✅ SUCCESS: ${comprehensiveSROItemList.length - 1} SRO Items will be available in Excel dropdown (excluding "N/A")`,
      );
    }

    // Force garbage collection after processing SRO Items
    if (global.gc) {
      global.gc();
    }

    // Check memory usage after SRO Items processing
    const memoryAfterSRO = MemoryManagementService.getMemoryUsage();
    console.log(
      `📊 Memory after SRO Items processing: ${memoryAfterSRO.heapUsed}MB`,
    );

    if (memoryAfterSRO.heapUsed > MEMORY_LIMIT_MB) {
      console.warn(
        `⚠️ Memory usage high after SRO Items: ${memoryAfterSRO.heapUsed}MB. Forcing cleanup...`,
      );
      MemoryManagementService.forceCleanup();
      if (global.gc) {
        global.gc();
      }
    }

    // Fetch UoM data for HS Codes and create comprehensive UoM list

    const uomByHsCode = {};
    const allUniqueUoMs = new Set(); // Track all unique UoM values

    if (token) {
      try {
        // Get HS Codes first

        const hsCodes = await hsCodeCacheService.getHSCodes(
          "sandbox",

          token,

          false,
        );

        if (hsCodes && Array.isArray(hsCodes) && hsCodes.length > 0) {
          // Increase limit to get more comprehensive UoM coverage
          const limitedHsCodes = hsCodes.slice(0, 500); // Increased from 100 to 500

          console.log(
            `Fetching UoM data for ${limitedHsCodes.length} HS Codes...`,
          );

          // Fetch UoM for each HS Code

          for (const hsCode of limitedHsCodes) {
            const hsCodeValue =
              hsCode.hS_CODE || hsCode.hs_code || hsCode.code || "";

            if (hsCodeValue) {
              try {
                const uomResponse = await fetchData(
                  `pdi/v2/HS_UOM?hs_code=${hsCodeValue}&annexure_id=3`,

                  "sandbox",

                  token,
                );

                if (uomResponse && Array.isArray(uomResponse)) {
                  const processedUoMs = uomResponse

                    .map((uom) => ({
                      uoM_ID: uom.uoM_ID || uom.uom_id || uom.id || "",

                      description: uom.description || uom.desc || "",
                    }))

                    .filter(
                      (uom) => uom.description && uom.description.trim() !== "",
                    );

                  uomByHsCode[hsCodeValue] = processedUoMs;

                  // Add all UoM descriptions to the comprehensive set
                  processedUoMs.forEach((uom) => {
                    if (uom.description) {
                      allUniqueUoMs.add(uom.description);
                    }
                  });
                }
              } catch (uomError) {
                // Skip this HS Code if UoM fetch fails

                console.log(
                  `Failed to fetch UoM for HS Code ${hsCodeValue}:`,

                  uomError.message,
                );
              }
            }
          }

          console.log(
            `Collected ${allUniqueUoMs.size} unique UoM values from API`,
          );
        }
      } catch (error) {
        console.error("Error fetching UoM data:", error);

        // Continue with fallback UoM data
      }
    }

    // Hardcoded UoM options from API response (same as Product template)
    const hardcodedUomOptions = [
      { uoM_ID: 3, description: "MT" },
      { uoM_ID: 4, description: "Bill of lading" },
      { uoM_ID: 5, description: "SET" },
      { uoM_ID: 6, description: "KWH" },
      { uoM_ID: 8, description: "40KG" },
      { uoM_ID: 9, description: "Liter" },
      { uoM_ID: 11, description: "SqY" },
      { uoM_ID: 12, description: "Bag" },
      { uoM_ID: 13, description: "KG" },
      { uoM_ID: 46, description: "MMBTU" },
      { uoM_ID: 48, description: "Meter" },
      { uoM_ID: 50, description: "Pcs" },
      { uoM_ID: 53, description: "Carat" },
      { uoM_ID: 55, description: "Cubic Metre" },
      { uoM_ID: 57, description: "Dozen" },
      { uoM_ID: 59, description: "Gram" },
      { uoM_ID: 61, description: "Gallon" },
      { uoM_ID: 63, description: "Kilogram" },
      { uoM_ID: 65, description: "Pound" },
      { uoM_ID: 67, description: "Timber Logs" },
      { uoM_ID: 69, description: "Numbers, pieces, units" },
      { uoM_ID: 71, description: "Packs" },
      { uoM_ID: 73, description: "Pair" },
      { uoM_ID: 75, description: "Square Foot" },
      { uoM_ID: 77, description: "Square Metre" },
      { uoM_ID: 79, description: "Thousand Unit" },
      { uoM_ID: 81, description: "Mega Watt" },
      { uoM_ID: 83, description: "Foot" },
      { uoM_ID: 85, description: "Barrels" },
      { uoM_ID: 87, description: "NO" },
      { uoM_ID: 118, description: "Meter" },
      { uoM_ID: 110, description: "KWH" },
      { uoM_ID: 112, description: "Packs" },
      { uoM_ID: 114, description: "Meter" },
      { uoM_ID: 116, description: "Liter" },
      { uoM_ID: 117, description: "Bag" },
      { uoM_ID: 98, description: "MMBTU" },
      { uoM_ID: 99, description: "Numbers, pieces, units" },
      { uoM_ID: 100, description: "Square Foot" },
      { uoM_ID: 101, description: "Thousand Unit" },
      { uoM_ID: 102, description: "Barrels" },
      { uoM_ID: 88, description: "Others" },
      { uoM_ID: 96, description: "1000 kWh" },
    ];

    // Fallback UoM data using hardcoded options
    const fallbackUomData = {
      "0101.10.00": hardcodedUomOptions,
      "0101.90.00": hardcodedUomOptions,
      "0102.10.00": hardcodedUomOptions,
      "0102.90.00": hardcodedUomOptions,
      "0103.10.00": hardcodedUomOptions,
      "0103.91.00": hardcodedUomOptions,
      "0103.92.00": hardcodedUomOptions,
      "0104.10.00": hardcodedUomOptions,
      "0104.20.00": hardcodedUomOptions,
      "0105.11.00": hardcodedUomOptions,
      "0105.12.00": hardcodedUomOptions,
      // Add more common HS codes as needed
      default: hardcodedUomOptions,
    };

    // Merge API UoM data with fallback data

    const allUomData = { ...fallbackUomData, ...uomByHsCode };

    // Add all fallback UoM values to the comprehensive set
    Object.values(fallbackUomData).forEach((uomList) => {
      if (Array.isArray(uomList)) {
        uomList.forEach((uom) => {
          if (uom.description) {
            allUniqueUoMs.add(uom.description);
          }
        });
      }
    });

    // Create comprehensive UoM list for dropdown
    const comprehensiveUoMList = Array.from(allUniqueUoMs).sort();

    console.log(
      `Total unique UoM values available: ${comprehensiveUoMList.length}`,
    );
    console.log(`UoM values: ${comprehensiveUoMList.join(", ")}`);

    // Build Excel workbook

    const wb = new ExcelJS.Workbook();

    wb.creator = "FBR Sandbox System";

    wb.created = new Date();

    const template = wb.addWorksheet("Template", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // Force garbage collection after creating workbook
    if (global.gc) {
      global.gc();
    }

    // Lists sheet removed - no longer generating dropdown data in Excel template

    // Define expected columns (in the same order as CSV uploader expects)
    // Add buyer columns as requested

    const columns = [
      "invoiceType",
      "invoiceDate",
      "invoiceRefNo",
      "companyInvoiceRefNo",
      // Buyer details (only NTN/CNIC kept)
      "buyerNTNCNIC",
      // Transaction and item details
      "transctypeId",
      "item_rate",
      "item_sroScheduleNo",
      "item_sroItemSerialNo",
      "item_saleType",
      "item_uoM",
      "item_productName",
      "item_valueSalesExcludingST",
      "item_quantity",
      "item_unitPrice",
      "item_salesTaxApplicable",
      "item_salesTaxWithheldAtSource",
      "item_extraTax",
      "item_furtherTax",
      "item_fedPayable",
      "item_advanceIncomeTax",
      "item_discount",
      "item_totalValues",
    ];

    // Map internal keys to user-friendly display labels for header row
    const displayLabelMap = {
      invoiceType: "Invoice Type",
      invoiceDate: "Invoice Date",
      invoiceRefNo: "DN Invoice Ref No",
      companyInvoiceRefNo: "Company Invoice Ref No",
      buyerNTNCNIC: "Buyer NTN/CNIC",
      transctypeId: "Transaction Type",
      item_rate: "Rate",
      item_sroScheduleNo: "SRO Schedule No",
      item_sroItemSerialNo: "SRO Item No",
      item_saleType: "Sale Type",
      item_uoM: "Unit Of Measurement",
      item_productName: "Product Name",
      item_valueSalesExcludingST: "Value Sales (Excl ST)",
      item_quantity: "Quantity",
      item_unitPrice: "Unit Cost",
      item_salesTaxApplicable: "Sales Tax Applicable",
      item_salesTaxWithheldAtSource: "ST Withheld at Source",
      item_extraTax: "Extra Tax",
      item_furtherTax: "Further Tax",
      item_fedPayable: "FED Payable",
      item_advanceIncomeTax: "Advance Income Tax",
      item_discount: "Discount",
      item_totalValues: "Total Values",
    };

    const displayHeaders = columns.map((c) => displayLabelMap[c] || c);

    template.addRow(displayHeaders);

    template.getRow(1).font = { bold: true };

    // Buyer-specific formatting: Treat NTN/CNIC as text and readable
    const buyerNtnIdx = columns.indexOf("buyerNTNCNIC") + 1;
    if (buyerNtnIdx > 0) {
      const col = template.getColumn(buyerNtnIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // Rate formatting: Treat as text to preserve rate format (e.g., "17%", "Exempt")
    const rateIdx = columns.indexOf("item_rate") + 1;
    if (rateIdx > 0) {
      const col = template.getColumn(rateIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // SRO Schedule No formatting: Treat as text to preserve format
    const sroScheduleIdx = columns.indexOf("item_sroScheduleNo") + 1;
    if (sroScheduleIdx > 0) {
      const col = template.getColumn(sroScheduleIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // UoM formatting: Treat as text to preserve unit format
    const uoMIdx = columns.indexOf("item_uoM") + 1;
    if (uoMIdx > 0) {
      const col = template.getColumn(uoMIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // SRO Item Serial No formatting: Treat as text to preserve format
    const sroItemIdx = columns.indexOf("item_sroItemSerialNo") + 1;
    if (sroItemIdx > 0) {
      const col = template.getColumn(sroItemIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // Sale Type formatting: Treat as text to preserve format
    const saleTypeIdx = columns.indexOf("item_saleType") + 1;
    if (saleTypeIdx > 0) {
      const col = template.getColumn(saleTypeIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // Transaction Type formatting: Treat as text to preserve format
    const transTypeIdx = columns.indexOf("transctypeId") + 1;
    if (transTypeIdx > 0) {
      const col = template.getColumn(transTypeIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // Invoice Reference Number formatting: Treat as text to preserve format
    const invoiceRefIdx = columns.indexOf("invoiceRefNo") + 1;
    if (invoiceRefIdx > 0) {
      const col = template.getColumn(invoiceRefIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }

    // Company Invoice Reference Number formatting: Treat as text to preserve format
    const companyInvoiceRefIdx = columns.indexOf("companyInvoiceRefNo") + 1;
    if (companyInvoiceRefIdx > 0) {
      const col = template.getColumn(companyInvoiceRefIdx);
      col.numFmt = "@";
      col.alignment = { horizontal: "left" };
      if (!col.width || col.width < 18) col.width = 20;
    }
    // Lists sheet content removed - no longer generating dropdown data in Excel template

    // Simplified approach - only essential hidden columns for dropdowns
    const typeListCol = columns.length + 1;
    const provinceListCol = typeListCol + 1;
    const ttCombinedCol = provinceListCol + 1;
    const allUoMCol = ttCombinedCol + 1;
    const allRatesCol = allUoMCol + 1;
    const allSROCol = allRatesCol + 1;
    const allSROItemCol = allSROCol + 1;

    const writeHiddenList = (colIndex, values, isSROItems = false) => {
      const startRow = 2; // keep row 1 for headers on Template

      template.getColumn(colIndex).hidden = true;

      if (!Array.isArray(values) || values.length === 0) {
        template.getCell(startRow, colIndex).value = "";
        return { startRow, endRow: startRow };
      }

      // For SRO Items, don't limit the values to get all available items
      // For other lists, limit to first 100 values to avoid Excel performance issues
      const limitedValues = isSROItems ? values : values.slice(0, 100);

      limitedValues.forEach((val, idx) => {
        template.getCell(startRow + idx, colIndex).value = val;
      });

      return { startRow, endRow: startRow + limitedValues.length - 1 };
    };

    const invoiceTypeValues = ["Sale Invoice", "Debit Note"];

    const provincesValues = Object.keys(provinceMap);

    const transTypeCombinedValues = transactionTypes.map(
      (tt) => `${tt.id} - ${tt.desc}`,
    );

    const typeListRange = writeHiddenList(typeListCol, invoiceTypeValues);

    const provinceListRange = writeHiddenList(provinceListCol, provincesValues);

    const ttCombinedRange = writeHiddenList(
      ttCombinedCol,

      transTypeCombinedValues,
    );

    // Simplified HS Code handling - no hidden list needed
    // Users can input their own HS codes directly

    // Simplified UoM handling - use comprehensive list directly

    // Write comprehensive UoM list for dropdown
    const allUoMRange = writeHiddenList(allUoMCol, comprehensiveUoMList);

    // Create a unified list of all unique rates across all transaction types

    const allRatesSet = new Set();

    for (const tt of transactionTypes) {
      const rates = ratesByType[tt.id] || [];

      rates.forEach((rate) => allRatesSet.add(rate));
    }

    // Ensure common rates (18.5% and 25%) are always included
    allRatesSet.add("18.5%");
    allRatesSet.add("25%");

    const allRates = Array.from(allRatesSet);

    // Log the rates being included in the Excel template for debugging
    console.log("Excel Template - Transaction Types:", transactionTypes.length);
    console.log("Excel Template - Total Unique Rates:", allRates.length);
    console.log("Excel Template - Rates by Transaction Type:");
    for (const tt of transactionTypes) {
      const rates = ratesByType[tt.id] || [];
      console.log(
        `  Transaction Type ${tt.id} (${tt.desc}): ${rates.length} rates`,
      );
      if (rates.length > 0) {
        console.log(`    Rates: ${rates.join(", ")}`);
      }
    }

    const allRatesRange = writeHiddenList(allRatesCol, allRates);

    // Write comprehensive SRO Schedule list for dropdown
    const allSRORange = writeHiddenList(allSROCol, comprehensiveSROList);

    // Write comprehensive SRO Item list for dropdown (no limit for SRO Items)
    const allSROItemRange = writeHiddenList(
      allSROItemCol,
      comprehensiveSROItemList,
      true, // isSROItems = true to get all items
    );

    // Simplified rate mapping - no complex mapping needed

    // Simplified approach - no complex hidden columns needed

    // Simplified approach - no complex formula generation needed

    // Helper: get column letter by index (1-based)

    const getColLetter = (i) => {
      let s = "";

      let n = i;

      while (n > 0) {
        const m = (n - 1) % 26;

        s = String.fromCharCode(65 + m) + s;

        n = Math.floor((n - 1) / 26);
      }

      return s;
    };

    const headerIndex = (name) => columns.indexOf(name) + 1; // 1-based

    // Simplified data validations for first 100 rows only
    const maxRows = 101; // including header

    for (let r = 2; r <= maxRows; r++) {
      // invoiceType dropdown
      template.getCell(r, headerIndex("invoiceType")).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`"${invoiceTypeValues.join(",")}"`],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid value",
        error: "Select a value from the dropdown list.",
      };

      // transctypeId dropdown
      template.getCell(r, headerIndex("transctypeId")).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [
          `$${getColLetter(ttCombinedCol)}$${ttCombinedRange.startRow}:$${getColLetter(ttCombinedCol)}$${ttCombinedRange.endRow}`,
        ],
        showErrorMessage: true,
      };

      // item_rate dropdown
      template.getCell(r, headerIndex("item_rate")).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [
          `$${getColLetter(allRatesCol)}$${allRatesRange.startRow}:$${getColLetter(allRatesCol)}$${allRatesRange.endRow}`,
        ],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Rate",
        error: "Select a valid rate from the dropdown list.",
      };

      // item_sroScheduleNo dropdown
      template.getCell(r, headerIndex("item_sroScheduleNo")).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [
          `$${getColLetter(allSROCol)}$${allSRORange.startRow}:$${getColLetter(allSROCol)}$${allSRORange.endRow}`,
        ],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid SRO Schedule",
        error: "Select a valid SRO Schedule from the dropdown list.",
      };

      // item_sroItemSerialNo dropdown
      template.getCell(r, headerIndex("item_sroItemSerialNo")).dataValidation =
        {
          type: "list",
          allowBlank: true,
          formulae: [
            `$${getColLetter(allSROItemCol)}$${allSROItemRange.startRow}:$${getColLetter(allSROItemCol)}$${allSROItemRange.endRow}`,
          ],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Invalid SRO Item",
          error: "Select a valid SRO Item from the dropdown list.",
        };

      // item_uoM dropdown
      template.getCell(r, headerIndex("item_uoM")).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [
          `$${getColLetter(allUoMCol)}$${allUoMRange.startRow}:$${getColLetter(allUoMCol)}$${allUoMRange.endRow}`,
        ],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid UoM",
        error: "Select a valid Unit of Measurement from the dropdown list.",
      };

      // Simple numeric validations
      template.getCell(r, headerIndex("item_quantity")).dataValidation = {
        type: "decimal",
        operator: "greaterThan",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Quantity",
        error: "Quantity must be a positive number.",
      };

      template.getCell(
        r,
        headerIndex("item_valueSalesExcludingST"),
      ).dataValidation = {
        type: "decimal",
        operator: "greaterThan",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Value (Excl. ST)",
        error: "Value (Excl. ST) must be a positive number.",
      };

      template.getCell(r, headerIndex("item_discount")).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Discount",
        error: "Discount must be a positive number (amount).",
      };

      template.getCell(r, headerIndex("item_extraTax")).dataValidation = {
        type: "decimal",
        operator: "greaterThanOrEqual",
        formulae: [0],
        allowBlank: true,
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Invalid Extra Tax",
        error: "Extra Tax must be a positive number.",
      };

      template.getCell(r, headerIndex("item_advanceIncomeTax")).dataValidation =
        {
          type: "decimal",
          operator: "greaterThanOrEqual",
          formulae: [0],
          allowBlank: true,
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "Invalid Advance Income Tax",
          error: "Advance Income Tax must be a positive number.",
        };

      // Auto-populate Sales Type based on Transaction Type selection
      const transctypeColLetter = getColLetter(headerIndex("transctypeId"));

      template.getCell(r, headerIndex("item_saleType")).value = {
        formula: `IF($${transctypeColLetter}${r}="","",TRIM(MID($${transctypeColLetter}${r},FIND(" - ",$${transctypeColLetter}${r})+3,LEN($${transctypeColLetter}${r}))))`,
      };

      // Add automatic calculations
      const qtyColLetter = getColLetter(headerIndex("item_quantity"));
      const retailColLetter = getColLetter(
        headerIndex("item_valueSalesExcludingST"),
      );
      const rateColLetter = getColLetter(headerIndex("item_rate"));
      const vsColLetter = getColLetter(
        headerIndex("item_valueSalesExcludingST"),
      );
      const staColLetter = getColLetter(headerIndex("item_salesTaxApplicable"));
      const fedColLetter = getColLetter(headerIndex("item_fedPayable"));
      const stwColLetter = getColLetter(
        headerIndex("item_salesTaxWithheldAtSource"),
      );
      const ftrColLetter = getColLetter(headerIndex("item_furtherTax"));
      const extColLetter = getColLetter(headerIndex("item_extraTax"));
      const aitColLetter = getColLetter(headerIndex("item_advanceIncomeTax"));
      const dscColLetter = getColLetter(headerIndex("item_discount"));

      // Auto-calculate Unit Price = Value Sales (Excl. ST) ÷ Quantity
      template.getCell(r, headerIndex("item_unitPrice")).value = {
        formula: `IF(OR($${retailColLetter}${r}="",$${qtyColLetter}${r}=""),"",IFERROR($${retailColLetter}${r}/$${qtyColLetter}${r},0))`,
      };

      // Auto-calculate Sales Tax Applicable = Value Sales (Excl. ST) × (Rate ÷ 100)
      template.getCell(r, headerIndex("item_salesTaxApplicable")).value = {
        formula: `IF($${retailColLetter}${r}="","",
IF($${rateColLetter}${r}="","",
IF(ISNUMBER(SEARCH("exempt",LOWER($${rateColLetter}${r}))),0,
$${retailColLetter}${r}*(VALUE(SUBSTITUTE($${rateColLetter}${r},"%",""))/100))))`,
      };

      // Auto-calculate Total Values = (Value Excl. ST + Sales Tax + FED + ST W/H + Further Tax + Extra Tax + Advance Income Tax) minus Discount Amount
      template.getCell(r, headerIndex("item_totalValues")).value = {
        formula: `IF($${retailColLetter}${r}="","",
SUM($${vsColLetter}${r},$${staColLetter}${r},$${fedColLetter}${r},$${stwColLetter}${r},$${ftrColLetter}${r},$${extColLetter}${r},$${aitColLetter}${r})-
IF($${dscColLetter}${r}="",0,VALUE($${dscColLetter}${r})))`,
      };
    }

    // Summary totals removed (no auto-calculation)

    const summaryRow = maxRows + 1;

    // Optionally keep a label to indicate end of grid
    template.getCell(summaryRow, 1).value = "";

    // Add instructions row

    const instructionsRow = summaryRow + 2;

    template.getCell(instructionsRow, 1).value = "INSTRUCTIONS:";

    template.getCell(instructionsRow, 1).font = {
      bold: true,

      color: { argb: "FF0000FF" },
    };

    const instructions = [
      "1. This Excel template includes automatic calculations and dropdown validations.",
      "2. Fill in the required fields: Invoice Type, Invoice Date, Company Invoice Ref No, Buyer NTN/CNIC.",
      "3. Select Transaction Type from the dropdown list - Sales Type will auto-populate.",
      "4. Enter Product Name, HS Code, Quantity, and Value Sales (Excl. ST).",
      "5. Select Rate, SRO Schedule No, SRO Item No, and UoM from dropdown lists.",
      "6. Unit Price auto-calculates as Value Sales (Excl. ST) ÷ Quantity.",
      "7. Sales Tax Applicable auto-calculates: Value Sales (Excl. ST) × (Rate ÷ 100).",
      "8. Total Values auto-calculates: (Value Excl. ST + Sales Tax + FED + ST W/H + Further Tax + Extra Tax) minus Discount.",
      "9. Extra Tax, Further Tax, FED Payable, and Discount are optional fields.",
      "10. All dropdown lists contain values from the FBR API system.",
      "11. For best results, save the file as .xlsx format before uploading.",
    ];

    instructions.forEach((instruction, idx) => {
      template.getCell(instructionsRow + idx + 1, 1).value = instruction;

      template.getCell(instructionsRow + idx + 1, 1).font = {
        color: { argb: "FF0000FF" },
      };
    });

    // Removed blue background styling for previously calculated fields

    // Autofit columns roughly

    displayHeaders.forEach((c, idx) => {
      const col = template.getColumn(idx + 1);

      col.width = Math.min(Math.max(c.length + 2, 14), 40);
    });

    // No named ranges required; validations use explicit ranges

    res.setHeader(
      "Content-Type",

      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    res.setHeader(
      "Content-Disposition",

      'attachment; filename="invoice_template.xlsx"',
    );

    const arrayBuffer = await wb.xlsx.writeBuffer();

    // Force garbage collection after Excel generation
    if (global.gc) {
      global.gc();
    }

    const nodeBuffer = Buffer.from(arrayBuffer);

    // Complete the process and log performance metrics
    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    MemoryManagementService.completeProcess(processId);

    const memoryUsage = MemoryManagementService.getMemoryUsage();
    console.log(
      `✅ Excel template generated successfully in ${totalTime.toFixed(2)}ms`,
    );
    console.log(
      `💾 Memory usage: ${memoryUsage.heapUsed}MB heap, ${memoryUsage.activeProcesses} active processes`,
    );

    res.status(200).send(nodeBuffer);
  } catch (error) {
    const totalTime = Number(process.hrtime.bigint() - startTime) / 1000000;
    console.error(
      `❌ Excel template generation failed after ${totalTime.toFixed(2)}ms:`,
      error,
    );

    // Complete the process even on error
    MemoryManagementService.completeProcess(processId);

    // Force garbage collection on error
    if (global.gc) {
      global.gc();
    }

    return res.status(500).json({
      success: false,
      message: "Failed to generate Excel template",
      error: error.message,
      performance: {
        timeToFailure: totalTime.toFixed(2),
      },
    });
  } finally {
    // Force cleanup of any remaining resources
    if (global.gc) {
      global.gc();
    }
  }
};

export const bulkPrintInvoices = async (req, res) => {
  try {
    const { invoiceNumbers, tenantId } = req.body;

    if (
      !invoiceNumbers ||
      !Array.isArray(invoiceNumbers) ||
      invoiceNumbers.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invoice numbers array is required",
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    // Get tenant database connection
    const tenantDb = await TenantDatabaseService.getTenantDatabase(tenantId);
    if (!tenantDb) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const { Invoice, InvoiceItem } = tenantDb.models;

    // Find all invoices in the tenant database
    const invoices = [];

    for (const invoiceNumber of invoiceNumbers) {
      const invoice = await Invoice.findOne({
        where: { invoice_number: invoiceNumber },
        include: [{ model: InvoiceItem, as: "InvoiceItems" }],
      });

      if (invoice) {
        invoices.push(invoice);
      }
    }

    if (invoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No invoices found",
      });
    }

    // Base64 encode logos
    const fbrLogoBase64 = fs
      .readFileSync(path.join(process.cwd(), "public", "fbr_logo.png"))
      .toString("base64");

    const companyLogoBase64 = fs
      .readFileSync(path.join(process.cwd(), "public", "fbr-logo-1.png"))
      .toString("base64");

    const pakistanGumLogoBase64 = fs
      .readFileSync(
        path.join(process.cwd(), "public", "images", "Pakprogressive.png"),
      )
      .toString("base64");

    // Prepare paths
    const pdfFileName = `bulk_invoices_${Date.now()}.pdf`;
    const invoiceDir = path.join(process.cwd(), "public", "invoices");
    const pdfPath = path.join(invoiceDir, pdfFileName);

    // Ensure output directory exists
    if (!fs.existsSync(invoiceDir)) {
      fs.mkdirSync(invoiceDir, { recursive: true });
    }

    // Get tenant information for seller details
    const tenant = await Tenant.findOne({ where: { tenant_id: tenantId } });
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    // Format date helper function
    const formatDate = (dateString) => {
      if (!dateString) return "N/A";
      try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "N/A";
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      } catch (error) {
        return "N/A";
      }
    };

    // Generate QR codes for each invoice and process data like single print
    const invoicesWithQR = await Promise.all(
      invoices.map(async (invoice) => {
        const qrData = await QRCode.toDataURL(invoice.invoice_number, {
          errorCorrectionLevel: "M",
          width: 96,
        });

        const plainInvoice = invoice.get({ plain: true });
        plainInvoice.items = plainInvoice.InvoiceItems || [];

        // Format the invoice date
        plainInvoice.invoiceDate = formatDate(plainInvoice.invoiceDate);

        // Use tenant context for seller details (same as single print)
        plainInvoice.sellerBusinessName =
          tenant.sellerBusinessName ||
          tenant.seller_business_name ||
          plainInvoice.sellerBusinessName;
        plainInvoice.sellerAddress =
          tenant.sellerAddress ||
          tenant.seller_address ||
          plainInvoice.sellerAddress;
        plainInvoice.sellerProvince =
          tenant.sellerProvince ||
          tenant.seller_province ||
          plainInvoice.sellerProvince;
        plainInvoice.sellerFullNTN =
          tenant.sellerFullNTN ||
          tenant.seller_full_ntn ||
          plainInvoice.sellerFullNTN;
        plainInvoice.sellerCity =
          tenant.sellerCity || tenant.seller_city || plainInvoice.sellerCity;
        plainInvoice.seller_full_ntn =
          tenant.sellerFullNTN ||
          tenant.seller_full_ntn ||
          plainInvoice.seller_full_ntn;

        return {
          ...plainInvoice,
          qrData,
        };
      }),
    );

    // Render EJS HTML for bulk invoices
    const html = await ejs.renderFile(
      path.join(process.cwd(), "src", "views", "bulkInvoiceTemplate.ejs"),
      {
        invoices: invoicesWithQR,
        fbrLogoBase64,
        companyLogoBase64,
        pakistanGumLogoBase64,
        convertToWords: (amount) => {
          if (!amount || isNaN(amount)) return "Zero Rupees Only";

          const rupees = Math.floor(amount);
          const paisa = Math.round((amount - rupees) * 100);

          let result = "";

          if (rupees > 0) {
            const rupeesWords = toWords(rupees);
            result =
              rupeesWords.replace(/,/g, "").charAt(0).toUpperCase() +
              rupeesWords.replace(/,/g, "").slice(1) +
              " Rupees";
          }

          if (paisa > 0) {
            if (result) result += " and ";
            const paisaWords = toWords(paisa);
            result +=
              paisaWords.replace(/,/g, "").charAt(0).toLowerCase() +
              paisaWords.replace(/,/g, "").slice(1) +
              " Paisa";
          }

          if (!result) result = "Zero Rupees";
          result += " Only";

          return result;
        },
      },
    );

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      },
    });

    await browser.close();

    // Stream PDF to browser
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${pdfFileName}`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (error) {
    console.error("Bulk PDF generation failed:", error);
    res.status(500).json({
      success: false,
      message: "Error generating bulk invoice PDF",
      error: error.message,
    });
  }
};
