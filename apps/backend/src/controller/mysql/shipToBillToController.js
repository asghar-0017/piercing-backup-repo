import { logAuditEvent } from "../../middleWare/auditMiddleware.js";

// --- SHIP TO CRUD ---

export const createShipTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { name, address, contactPerson, contactNo, cnic, ntn } = req.body;

    if (!name || !address) {
      return res.status(400).json({
        success: false,
        message: "Name and address are required.",
      });
    }

    const record = await BillToShipTo.create({
      type: "SHIP_TO",
      name,
      address,
      contactPerson,
      contactNo,
      cnic,
      ntn,
    });

    try {
      await logAuditEvent(req, "ship_to", record.id, "CREATE", null, record.toJSON(), {
        entityName: record.name,
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }

    return res.status(201).json({
      success: true,
      message: "Ship To record created successfully.",
      data: record,
    });
  } catch (error) {
    console.error("Error creating Ship To:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating Ship To record.",
      error: error.message,
    });
  }
};

export const getAllShipTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { page = 1, limit = 10, search } = req.query;

    const limitVal = limit === "All" ? null : parseInt(limit);
    const offsetVal = limit === "All" ? null : (parseInt(page) - 1) * limitVal;
    
    const whereClause = { type: "SHIP_TO" };

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      const Op = req.tenantDb.Sequelize.Op;
      whereClause[Op.or] = [
        { name: { [Op.like]: term } },
        { address: { [Op.like]: term } },
        { contactPerson: { [Op.like]: term } },
        { contactNo: { [Op.like]: term } },
        { cnic: { [Op.like]: term } },
        { ntn: { [Op.like]: term } },
      ];
    }

    const findOptions = {
      where: whereClause,
      order: [["created_at", "DESC"]],
    };

    if (limitVal !== null) {
      findOptions.limit = limitVal;
      findOptions.offset = offsetVal;
    }

    const { count, rows } = await BillToShipTo.findAndCountAll(findOptions);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: limitVal ? {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limitVal),
        total_records: count,
        records_per_page: limitVal,
      } : {
        total_records: count,
      },
    });
  } catch (error) {
    console.error("Error fetching Ship To records:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving Ship To records.",
      error: error.message,
    });
  }
};

export const updateShipTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { id } = req.params;
    const { name, address, contactPerson, contactNo, cnic, ntn } = req.body;

    const record = await BillToShipTo.findOne({ where: { id, type: "SHIP_TO" } });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Ship To record not found.",
      });
    }

    const oldValues = record.toJSON();

    await record.update({
      name,
      address,
      contactPerson,
      contactNo,
      cnic,
      ntn,
    });

    try {
      await logAuditEvent(req, "ship_to", record.id, "UPDATE", oldValues, record.toJSON(), {
        entityName: record.name,
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }

    return res.status(200).json({
      success: true,
      message: "Ship To record updated successfully.",
      data: record,
    });
  } catch (error) {
    console.error("Error updating Ship To:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating Ship To record.",
      error: error.message,
    });
  }
};

export const deleteShipTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { id } = req.params;

    const record = await BillToShipTo.findOne({ where: { id, type: "SHIP_TO" } });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Ship To record not found.",
      });
    }

    const oldValues = record.toJSON();
    await record.destroy();

    try {
      await logAuditEvent(req, "ship_to", oldValues.id, "DELETE", oldValues, null, {
        entityName: oldValues.name,
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }

    return res.status(200).json({
      success: true,
      message: "Ship To record deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting Ship To:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting Ship To record.",
      error: error.message,
    });
  }
};

// --- BILL TO CRUD ---

export const createBillTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { name, address, refNo, ntn, strn } = req.body;

    if (!name || !address) {
      return res.status(400).json({
        success: false,
        message: "Name and address are required.",
      });
    }

    const record = await BillToShipTo.create({
      type: "BILL_TO",
      name,
      address,
      refNo,
      ntn,
      strn,
    });

    try {
      await logAuditEvent(req, "bill_to", record.id, "CREATE", null, record.toJSON(), {
        entityName: record.name,
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }

    return res.status(201).json({
      success: true,
      message: "Bill To record created successfully.",
      data: record,
    });
  } catch (error) {
    console.error("Error creating Bill To:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating Bill To record.",
      error: error.message,
    });
  }
};

export const getAllBillTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { page = 1, limit = 10, search } = req.query;

    const limitVal = limit === "All" ? null : parseInt(limit);
    const offsetVal = limit === "All" ? null : (parseInt(page) - 1) * limitVal;

    const whereClause = { type: "BILL_TO" };

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      const Op = req.tenantDb.Sequelize.Op;
      whereClause[Op.or] = [
        { name: { [Op.like]: term } },
        { address: { [Op.like]: term } },
        { refNo: { [Op.like]: term } },
        { ntn: { [Op.like]: term } },
        { strn: { [Op.like]: term } },
      ];
    }

    const findOptions = {
      where: whereClause,
      order: [["created_at", "DESC"]],
    };

    if (limitVal !== null) {
      findOptions.limit = limitVal;
      findOptions.offset = offsetVal;
    }

    const { count, rows } = await BillToShipTo.findAndCountAll(findOptions);

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: limitVal ? {
        current_page: parseInt(page),
        total_pages: Math.ceil(count / limitVal),
        total_records: count,
        records_per_page: limitVal,
      } : {
        total_records: count,
      },
    });
  } catch (error) {
    console.error("Error fetching Bill To records:", error);
    return res.status(500).json({
      success: false,
      message: "Error retrieving Bill To records.",
      error: error.message,
    });
  }
};

export const updateBillTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { id } = req.params;
    const { name, address, refNo, ntn, strn } = req.body;

    const record = await BillToShipTo.findOne({ where: { id, type: "BILL_TO" } });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Bill To record not found.",
      });
    }

    const oldValues = record.toJSON();

    await record.update({
      name,
      address,
      refNo,
      ntn,
      strn,
    });

    try {
      await logAuditEvent(req, "bill_to", record.id, "UPDATE", oldValues, record.toJSON(), {
        entityName: record.name,
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }

    return res.status(200).json({
      success: true,
      message: "Bill To record updated successfully.",
      data: record,
    });
  } catch (error) {
    console.error("Error updating Bill To:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating Bill To record.",
      error: error.message,
    });
  }
};

export const deleteBillTo = async (req, res) => {
  try {
    const { BillToShipTo } = req.tenantModels;
    const { id } = req.params;

    const record = await BillToShipTo.findOne({ where: { id, type: "BILL_TO" } });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Bill To record not found.",
      });
    }

    const oldValues = record.toJSON();
    await record.destroy();

    try {
      await logAuditEvent(req, "bill_to", oldValues.id, "DELETE", oldValues, null, {
        entityName: oldValues.name,
      });
    } catch (e) {
      console.error("Audit log error:", e);
    }

    return res.status(200).json({
      success: true,
      message: "Bill To record deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting Bill To:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting Bill To record.",
      error: error.message,
    });
  }
};
