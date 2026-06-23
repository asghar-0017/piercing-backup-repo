import express from "express";
import { authenticateToken } from "../middleWare/authMiddleware.js";
import UserManagementService from "../service/UserManagementService.js";
import { formatResponse } from "../utils/formatResponse.js";

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * Get user's assigned companies
 * GET /api/user/companies
 */
router.get("/companies", async (req, res) => {
  try {
    // Check if user is admin or regular user
    if (req.userType === "admin") {
      // For admin users, get all companies
      const UserManagementService = (
        await import("../service/UserManagementService.js")
      ).default;
      const allTenants = await UserManagementService.getAllTenants();

      return res
        .status(200)
        .json(
          formatResponse(true, "Companies fetched successfully", allTenants)
        );
    } else if (req.userType === "user") {
      // For regular users, get only their assigned companies
      const user = await UserManagementService.getUserById(req.user.userId);

      if (
        !user ||
        !user.UserTenantAssignments ||
        user.UserTenantAssignments.length === 0
      ) {
        return res
          .status(403)
          .json(
            formatResponse(
              false,
              "No companies assigned to this user",
              null,
              403
            )
          );
      }

      // Format the companies for the frontend (matching admin endpoint format)
      const assignedCompanies = user.UserTenantAssignments.map(
        (assignment) => ({
          id: assignment.Tenant.id,
          tenant_id: assignment.Tenant.tenant_id,
          sellerNTNCNIC: assignment.Tenant.seller_ntn_cnic,
          sellerFullNTN: assignment.Tenant.seller_full_ntn,
          sellerBusinessName: assignment.Tenant.seller_business_name,
          sellerProvince: assignment.Tenant.seller_province,
          sellerAddress: assignment.Tenant.seller_address,
          is_active: Boolean(assignment.Tenant.is_active), // Convert MySQL boolean to JavaScript boolean
          database_name: assignment.Tenant.database_name,
          created_at: assignment.Tenant.created_at,
          sandboxTestToken: assignment.Tenant.sandboxTestToken,
          sandboxProductionToken: assignment.Tenant.sandboxProductionToken,
          telNo: assignment.Tenant.telNo,
          mobNo: assignment.Tenant.mobNo,
          strn: assignment.Tenant.strn,
          email: assignment.Tenant.email,
        })
      );
      console.log("assignedCompanies", assignedCompanies);

      return res
        .status(200)
        .json(
          formatResponse(
            true,
            "Assigned companies fetched successfully",
            assignedCompanies
          )
        );
    } else {
      return res
        .status(403)
        .json(formatResponse(false, "Access denied", null, 403));
    }
  } catch (error) {
    console.error("Error fetching user companies:", error);
    return res
      .status(500)
      .json(formatResponse(false, "Internal server error", null, 500));
  }
});

/**
 * Get tenant details by tenant ID (for assigned companies only)
 * GET /api/user/tenants/:tenantId
 */
router.get("/tenants/:tenantId", async (req, res) => {
  try {
    const { tenantId } = req.params;

    // For regular users, get only their assigned companies
    if (req.userType === "user") {
      const user = await UserManagementService.getUserById(req.user.userId);

      if (
        !user ||
        !user.UserTenantAssignments ||
        user.UserTenantAssignments.length === 0
      ) {
        return res
          .status(403)
          .json(
            formatResponse(
              false,
              "No companies assigned to this user",
              null,
              403
            )
          );
      }

      // Check if the requested tenant is in the user's assigned companies
      const assignedTenant = user.UserTenantAssignments.find(
        (assignment) => assignment.Tenant.tenant_id === tenantId
      );

      if (!assignedTenant) {
        return res
          .status(403)
          .json(
            formatResponse(false, "Access denied to this company", null, 403)
          );
      }

      // Return the tenant details
      const tenantData = {
        id: assignedTenant.Tenant.id,
        tenant_id: assignedTenant.Tenant.tenant_id,
        sellerNTNCNIC: assignedTenant.Tenant.seller_ntn_cnic,
        sellerFullNTN: assignedTenant.Tenant.seller_full_ntn,
        sellerBusinessName: assignedTenant.Tenant.seller_business_name,
        sellerProvince: assignedTenant.Tenant.seller_province,
        sellerAddress: assignedTenant.Tenant.seller_address,
        is_active: Boolean(assignedTenant.Tenant.is_active), // Convert MySQL boolean to JavaScript boolean
        database_name: assignedTenant.Tenant.database_name,
        created_at: assignedTenant.Tenant.created_at,
        sandboxTestToken: assignedTenant.Tenant.sandboxTestToken,
        sandboxProductionToken: assignedTenant.Tenant.sandboxProductionToken,
        telNo: assignedTenant.Tenant.telNo,
        mobNo: assignedTenant.Tenant.mobNo,
        strn: assignedTenant.Tenant.strn,
        email: assignedTenant.Tenant.email,
      };

      return res
        .status(200)
        .json(
          formatResponse(
            true,
            "Tenant details fetched successfully",
            tenantData
          )
        );
    } else {
      return res
        .status(403)
        .json(formatResponse(false, "Access denied", null, 403));
    }
  } catch (error) {
    console.error("Error fetching tenant details:", error);
    return res
      .status(500)
      .json(formatResponse(false, "Internal server error", null, 500));
  }
});

/**
 * Update tenant details by tenant ID (for assigned companies only)
 * PUT /api/user/tenants/:tenantId
 */
router.put("/tenants/:tenantId", async (req, res) => {
  try {
    const { tenantId } = req.params;
    const updateData = req.body;

    // For regular users, update only their assigned companies
    if (req.userType === "user") {
      const user = await UserManagementService.getUserById(req.user.userId);

      if (
        !user ||
        !user.UserTenantAssignments ||
        user.UserTenantAssignments.length === 0
      ) {
        return res
          .status(403)
          .json(
            formatResponse(
              false,
              "No companies assigned to this user",
              null,
              403
            )
          );
      }

      // Check if the requested tenant is in the user's assigned companies
      const assignedTenant = user.UserTenantAssignments.find(
        (assignment) => assignment.Tenant.tenant_id === tenantId
      );

      if (!assignedTenant) {
        return res
          .status(403)
          .json(
            formatResponse(false, "Access denied to this company", null, 403)
          );
      }

      // Update the tenant using the UserManagementService
      const updatedTenant = await UserManagementService.updateTenant(
        assignedTenant.Tenant.id,
        updateData
      );

      return res
        .status(200)
        .json(
          formatResponse(true, "Tenant updated successfully", updatedTenant)
        );
    } else {
      return res
        .status(403)
        .json(formatResponse(false, "Access denied", null, 403));
    }
  } catch (error) {
    console.error("Error updating tenant:", error);
    return res
      .status(500)
      .json(formatResponse(false, "Internal server error", null, 500));
  }
});

/**
 * Get tenant statistics by tenant ID (for assigned companies only)
 * GET /api/user/tenants/:tenantId/stats
 */
router.get("/tenants/:tenantId/stats", async (req, res) => {
  try {
    const { tenantId } = req.params;

    // For regular users, get stats only for their assigned companies
    if (req.userType === "user") {
      const user = await UserManagementService.getUserById(req.user.userId);

      if (
        !user ||
        !user.UserTenantAssignments ||
        user.UserTenantAssignments.length === 0
      ) {
        return res
          .status(403)
          .json(
            formatResponse(
              false,
              "No companies assigned to this user",
              null,
              403
            )
          );
      }

      // Check if the requested tenant is in the user's assigned companies
      const assignedTenant = user.UserTenantAssignments.find(
        (assignment) => assignment.Tenant.tenant_id === tenantId
      );

      if (!assignedTenant) {
        return res
          .status(403)
          .json(
            formatResponse(false, "Access denied to this company", null, 403)
          );
      }

      // Get tenant statistics using the TenantDatabaseService
      const TenantDatabaseService = (
        await import("../service/TenantDatabaseService.js")
      ).default;

      const tenantDb = await TenantDatabaseService.getTenantDatabase(tenantId);
      const { models } = tenantDb;

      // Get counts - filter by user for non-admin users
      let buyerWhereClause = {};
      let invoiceWhereClause = {};
      
      if (req.user?.role !== "admin") {
        const userId = req.user?.userId || req.user?.id;
        if (userId) {
          buyerWhereClause.created_by_user_id = userId;
          invoiceWhereClause.created_by_user_id = userId;
        }
      }
      
      const buyerCount = await models.Buyer.count({ where: buyerWhereClause });
      const invoiceCount = await models.Invoice.count({ where: invoiceWhereClause });

      const stats = {
        buyerCount,
        invoiceCount,
      };

      return res
        .status(200)
        .json(
          formatResponse(true, "Tenant statistics fetched successfully", stats)
        );
    } else {
      return res
        .status(403)
        .json(formatResponse(false, "Access denied", null, 403));
    }
  } catch (error) {
    console.error("Error fetching tenant statistics:", error);
    return res
      .status(500)
      .json(formatResponse(false, "Internal server error", null, 500));
  }
});

export default router;
