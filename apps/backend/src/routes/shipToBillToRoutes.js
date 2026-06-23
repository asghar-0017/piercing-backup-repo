import express from "express";
import * as controller from "../controller/mysql/shipToBillToController.js";
import { identifyTenant } from "../middleWare/tenantMiddleware.js";
import { authenticateToken } from "../middleWare/authMiddleware.js";
import { requirePermission } from "../middleWare/permissionMiddleware.js";

const router = express.Router();

// Apply auth & tenant middleware to all routes
router.use(authenticateToken);
router.use(identifyTenant);

// --- SHIP TO ROUTES ---
router.post("/ship-to", requirePermission("buyer.create"), controller.createShipTo);
router.get("/ship-to", requirePermission("buyer.view"), controller.getAllShipTo);
router.put("/ship-to/:id", requirePermission("buyer.update"), controller.updateShipTo);
router.delete("/ship-to/:id", requirePermission("buyer.delete"), controller.deleteShipTo);

// --- BILL TO ROUTES ---
router.post("/bill-to", requirePermission("buyer.create"), controller.createBillTo);
router.get("/bill-to", requirePermission("buyer.view"), controller.getAllBillTo);
router.put("/bill-to/:id", requirePermission("buyer.update"), controller.updateBillTo);
router.delete("/bill-to/:id", requirePermission("buyer.delete"), controller.deleteBillTo);

export default router;
