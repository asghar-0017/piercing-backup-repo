import TenantDatabaseService from "../../service/TenantDatabaseService.js";
import Tenant from "../../model/mysql/Tenant.js";

// Create new tenant (seller registration)
export const createTenant = async (req, res) => {
  try {
    const {
      sellerNTNCNIC,
      sellerFullNTN,
      sellerBusinessName,
      sellerProvince,
      sellerAddress,
      databaseName,
      sandboxTestToken,
      sandboxProductionToken,
    } = req.body;

    // Validate required fields
    if (!sellerNTNCNIC || !sellerBusinessName) {
      return res.status(400).json({
        success: false,
        message: "Seller NTN/CNIC and business name are required",
      });
    }

    // Check if tenant already exists
    const existingTenant = await Tenant.findOne({
      where: { seller_ntn_cnic: sellerNTNCNIC },
    });

    if (existingTenant) {
      return res.status(409).json({
        success: false,
        message: "Seller with this NTN/CNIC already exists",
      });
    }

    // Generate unique database name if not provided
    let finalDatabaseName = databaseName;
    if (!finalDatabaseName) {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 6);
      finalDatabaseName = `tenant_${sellerNTNCNIC.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}_${randomSuffix}`;
    }

    console.log("Creating tenant with database name:", finalDatabaseName);

    // Create tenant database
    const result = await TenantDatabaseService.createTenantDatabase({
      sellerNTNCNIC,
      sellerFullNTN,
      sellerBusinessName,
      sellerProvince,
      sellerAddress,
      databaseName: finalDatabaseName,
      sandboxTestToken,
      sandboxProductionToken,
    });

    res.status(201).json({
      success: true,
      message: "Tenant created successfully",
      data: {
        tenant_id: result.tenant.tenant_id,
        sellerNTNCNIC: result.tenant.seller_ntn_cnic,
        sellerFullNTN: result.tenant.seller_full_ntn,
        sellerBusinessName: result.tenant.seller_business_name,
        database_name: result.databaseName,
        sandbox_test_token: result.tenant.sandboxTestToken,
        sandbox_production_token: result.tenant.sandboxProductionToken,
      },
    });
  } catch (error) {
    console.error("Error creating tenant:", error);

    // Handle specific database errors
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        message: "A tenant with this information already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating tenant",
      error: error.message,
    });
  }
};

// Get all tenants
export const getAllTenants = async (req, res) => {
  try {
    const tenants = await TenantDatabaseService.getAllTenants();

    res.status(200).json({
      success: true,
      data: tenants,
    });
  } catch (error) {
    console.error("Error getting tenants:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving tenants",
      error: error.message,
    });
  }
};

// Get tenant by ID
export const getTenantById = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findOne({
      where: { tenant_id: tenantId },
      attributes: [
        "id",
        "tenant_id",
        "seller_ntn_cnic",
        "seller_full_ntn",
        "seller_business_name",
        "seller_province",
        "seller_address",
        "is_active",
        "database_name",
        "created_at",
        "sandbox_test_token",
        "sandbox_production_token",
        "tel_no",
        "mob_no",
        "strn",
        "email",
      ],
      raw: true,
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    // Map the underscore fields to camelCase for frontend compatibility
    const mappedTenant = {
      id: tenant.id,
      tenant_id: tenant.tenant_id,
      sellerNTNCNIC: tenant.seller_ntn_cnic,
      sellerFullNTN: tenant.seller_full_ntn,
      sellerBusinessName: tenant.seller_business_name,
      sellerProvince: tenant.seller_province,
      sellerAddress: tenant.seller_address,
      is_active: tenant.is_active,
      database_name: tenant.database_name,
      created_at: tenant.created_at,
      sandboxTestToken: tenant.sandbox_test_token,
      sandboxProductionToken: tenant.sandbox_production_token,
      telNo: tenant.tel_no,
      mobNo: tenant.mob_no,
      strn: tenant.strn,
      email: tenant.email,
    };

    res.status(200).json({
      success: true,
      data: mappedTenant,
    });
  } catch (error) {
    console.error("Error getting tenant:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving tenant",
      error: error.message,
    });
  }
};

// Update tenant
export const updateTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const {
      sellerBusinessName,
      sellerProvince,
      sellerAddress,
      sellerFullNTN,
      telNo,
      tel_no,
      mobNo,
      mob_no,
      strn,
      email,
    } = req.body;

    const tenant = await Tenant.findOne({
      where: { tenant_id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    await tenant.update({
      seller_business_name: sellerBusinessName,
      seller_province: sellerProvince,
      seller_address: sellerAddress,
      ...(sellerFullNTN !== undefined && { seller_full_ntn: sellerFullNTN }),
      ...((telNo !== undefined || tel_no !== undefined) && { telNo: telNo !== undefined ? telNo : tel_no }),
      ...((mobNo !== undefined || mob_no !== undefined) && { mobNo: mobNo !== undefined ? mobNo : mob_no }),
      ...(strn !== undefined && { strn }),
      ...(email !== undefined && { email }),
    });

    // Map fields to camelCase for consistency with frontend
    const mapped = {
      id: tenant.id,
      tenant_id: tenant.tenant_id,
      sellerNTNCNIC: tenant.seller_ntn_cnic,
      sellerFullNTN: tenant.seller_full_ntn,
      sellerBusinessName: tenant.seller_business_name,
      sellerProvince: tenant.seller_province,
      sellerAddress: tenant.seller_address,
      database_name: tenant.database_name,
      sandboxTestToken: tenant.sandbox_test_token,
      sandboxProductionToken: tenant.sandbox_production_token,
      is_active: tenant.is_active,
      created_at: tenant.created_at,
      telNo: tenant.telNo,
      mobNo: tenant.mobNo,
      strn: tenant.strn,
      email: tenant.email,
    };

    res.status(200).json({
      success: true,
      message: "Tenant updated successfully",
      data: mapped,
    });
  } catch (error) {
    console.error("Error updating tenant:", error);
    res.status(500).json({
      success: false,
      message: "Error updating tenant",
      error: error.message,
    });
  }
};

// Deactivate tenant
export const deactivateTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenant.findOne({
      where: { tenant_id: tenantId },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    await tenant.update({ is_active: false });

    res.status(200).json({
      success: true,
      message: "Tenant deactivated successfully",
    });
  } catch (error) {
    console.error("Error deactivating tenant:", error);
    res.status(500).json({
      success: false,
      message: "Error deactivating tenant",
      error: error.message,
    });
  }
};

// Get tenant statistics
export const getTenantStats = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenantDb = await TenantDatabaseService.getTenantDatabase(tenantId);
    const { models } = tenantDb;

    // Get counts
    const buyerCount = await models.Buyer.count();
    const invoiceCount = await models.Invoice.count();

    res.status(200).json({
      success: true,
      data: {
        tenant_id: tenantId,
        buyer_count: buyerCount,
        invoice_count: invoiceCount,
      },
    });
  } catch (error) {
    console.error("Error getting tenant stats:", error);
    res.status(500).json({
      success: false,
      message: "Error retrieving tenant statistics",
      error: error.message,
    });
  }
};
