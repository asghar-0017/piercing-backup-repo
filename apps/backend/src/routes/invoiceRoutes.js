import express from "express";
import * as invoiceController from "../controller/mysql/invoiceController.js";
import { identifyTenant } from "../middleWare/tenantMiddleware.js";
import { authenticateToken } from "../middleWare/authMiddleware.js";
import { requirePermission, requireAnyPermission } from "../middleWare/permissionMiddleware.js";

const router = express.Router();

// ✅ Public route — NO middleware
router.get("/print-invoice/:id", invoiceController.printInvoice);

// ✅ Apply middleware only for protected routes
router.use(authenticateToken, identifyTenant);

// ✅ Protected routes
router.post("/invoices", requirePermission("invoice.create"), invoiceController.createInvoice);
router.post("/invoices/save", requirePermission("invoice_save"), invoiceController.saveInvoice);
router.post(
  "/invoices/save-validate",requirePermission("invoice_validate"),
  invoiceController.saveAndValidateInvoice
);

// Standard routes (fallback)
router.post("/invoices/bulk", requirePermission("invoice_uploader"), invoiceController.bulkCreateInvoices);
router.post(
  "/invoices/check-existing",
  requirePermission("invoice.view"),
  invoiceController.checkExistingInvoices
);

router.get("/invoices", requirePermission("invoice.view"), invoiceController.getAllInvoices);
router.get(
  "/invoices/number/:invoiceNumber",
  requirePermission("invoice.view"),
  invoiceController.getInvoiceByNumber
);
router.get("/invoices/stats/summary", requirePermission("invoice.view"), invoiceController.getInvoiceStats);
router.get("/dashboard/summary", requirePermission("dashboard.view"), invoiceController.getDashboardSummary);

// Download invoice template (tenant-specific) - MUST come before dynamic :id route
router.get(
  "/invoices/template.xlsx",
  requirePermission("invoice.template"),
  invoiceController.downloadInvoiceTemplateExcel
);


// Place specific routes before dynamic ones to avoid shadowing
router.get("/invoices/:id", requirePermission("invoice.view"), invoiceController.getInvoiceById);
router.put("/invoices/:id", requirePermission("invoice.edit"), invoiceController.updateInvoice);
router.delete("/invoices/:id", requirePermission("invoice.delete"), invoiceController.deleteInvoice);
router.post("/invoices/:id/submit", requirePermission("invoice.submit"), invoiceController.submitSavedInvoice);

// Get document types from FBR
router.get(
  "/document-types",
  authenticateToken,
  identifyTenant,
  invoiceController.getDocumentTypesController
);

// Get provinces from FBR
router.get(
  "/provinces",
  authenticateToken,
  identifyTenant,
  invoiceController.getProvincesController
);

// Validate invoice data with FBR
router.post(
  "/validate-invoice",
  authenticateToken,
  identifyTenant,
  invoiceController.validateInvoiceDataController
);

// Submit invoice data to FBR
router.post(
  "/submit-invoice",
  authenticateToken,
  identifyTenant,
  invoiceController.submitInvoiceDataController
);

export default router;

// 👇 Export the public route separately
export const publicInvoiceRoutes = express.Router();
publicInvoiceRoutes.get("/print-invoice/:id", invoiceController.printInvoice);
publicInvoiceRoutes.post("/bulk-print-invoices", invoiceController.bulkPrintInvoices);
