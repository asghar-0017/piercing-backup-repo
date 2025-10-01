import express from "express";
import * as buyerController from "../controller/mysql/buyerController.js";
import * as productController from "../controller/mysql/productController.js";
import { identifyTenant } from "../middleWare/tenantMiddleware.js";
import { authenticateToken } from "../middleWare/authMiddleware.js";
import { requirePermission, requireAnyPermission } from "../middleWare/permissionMiddleware.js";

const router = express.Router();

// All buyer routes require authentication and tenant identification
router.use(authenticateToken);
router.use(identifyTenant);

// Buyer management routes (tenant-specific)
router.post("/buyers", requirePermission("buyer.create"), buyerController.createBuyer);
router.post("/buyers/bulk", requirePermission("buyer_uploader"), buyerController.bulkCreateBuyers);
router.post("/buyers/check-existing", requirePermission("buyer.view"), buyerController.checkExistingBuyers);
router.post("/buyers/bulk-fbr-check", requirePermission("buyer.view"), buyerController.bulkCheckFBRRegistration);
router.get("/buyers/all", requirePermission("buyer.view"), buyerController.getAllBuyersWithoutPagination);
router.get("/buyers", requirePermission("buyer.view"), buyerController.getAllBuyers);
router.get("/buyers/:id", requirePermission("buyer.view"), buyerController.getBuyerById);
router.put("/buyers/:id", requirePermission("buyer.update"), buyerController.updateBuyer);
router.delete("/buyers/:id", requirePermission("buyer.delete"), buyerController.deleteBuyer);
router.get("/buyers/province/:province", requirePermission("buyer.view"), buyerController.getBuyersByProvince);

// Product routes (tenant-specific)
router.get("/products", requirePermission("product.view"), productController.listProducts);
router.get("/products/all", requirePermission("product.view"), productController.getAllProductsWithoutPagination);
router.post("/products", requirePermission("product.create"), productController.createProduct);
router.get("/products/:id", requirePermission("product.view"), productController.getProductById);
router.put("/products/:id", requirePermission("product.update"), productController.updateProduct);
router.delete("/products/:id", requirePermission("Delete Product"), productController.deleteProduct);
router.post(
  "/products/check-existing",
  requirePermission("product.view"),
  productController.checkExistingProducts
);
router.post("/products/bulk", requirePermission("product_uploader"), productController.bulkCreateProducts);

export default router;
