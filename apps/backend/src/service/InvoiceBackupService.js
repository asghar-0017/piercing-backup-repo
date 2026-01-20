import { v4 as uuidv4 } from 'uuid';

/**
 * Invoice Backup Service
 * Handles all backup operations for invoice data including drafts, saved invoices, edits, and FBR interactions
 */
class InvoiceBackupService {
  /**
   * Create a backup of invoice data
   * @param {Object} params - Backup parameters
   * @param {Object} params.tenantDb - Tenant database connection
   * @param {Object} params.tenantModels - Tenant models
   * @param {Object} params.invoice - Invoice data to backup
   * @param {Array} params.invoiceItems - Invoice items data to backup
   * @param {string} params.backupType - Type of backup (DRAFT, SAVED, EDIT, POST, FBR_REQUEST, FBR_RESPONSE)
   * @param {string} params.backupReason - Reason for backup
   * @param {string} params.statusBefore - Status before the operation
   * @param {string} params.statusAfter - Status after the operation
   * @param {Object} params.user - User information
   * @param {Object} params.tenant - Tenant information
   * @param {Object} params.request - Request information
   * @param {Object} params.fbrRequestData - FBR request data (optional)
   * @param {Object} params.fbrResponseData - FBR response data (optional)
   * @param {Object} params.additionalInfo - Additional context information
   */
  async createBackup({
    tenantDb,
    tenantModels,
    invoice,
    invoiceItems = [],
    backupType,
    backupReason,
    statusBefore = null,
    statusAfter = null,
    user = {},
    tenant = {},
    request = {},
    fbrRequestData = null,
    fbrResponseData = null,
    additionalInfo = null
  }) {
    try {
      const { InvoiceBackup, InvoiceBackupSummary } = tenantModels;

      // Prepare invoice data for backup (remove sensitive fields if needed)
      const invoiceData = this.sanitizeInvoiceData(invoice);
      const invoiceItemsData = invoiceItems.map(item => this.sanitizeInvoiceItemData(item));

      // Create backup entry
      const backupData = {
        original_invoice_id: invoice.id,
        system_invoice_id: invoice.system_invoice_id,
        invoice_number: invoice.invoice_number,
        backup_type: backupType,
        backup_reason: backupReason,
        status_before: statusBefore,
        status_after: statusAfter,
        invoice_data: JSON.stringify(invoiceData),
        invoice_items_data: JSON.stringify(invoiceItemsData),
        fbr_request_data: fbrRequestData ? JSON.stringify(fbrRequestData) : null,
        fbr_response_data: fbrResponseData ? JSON.stringify(fbrResponseData) : null,
        fbr_invoice_number: fbrResponseData?.invoiceNumber || fbrRequestData?.invoiceNumber || null,
        user_id: user.id || user.userId || null,
        user_email: user.email || null,
        user_name: this.getUserDisplayName(user),
        user_role: user.role || null,
        tenant_id: tenant.id || tenant.tenantId || null,
        tenant_name: tenant.name || tenant.sellerBusinessName || null,
        ip_address: request.ip || null,
        user_agent: request.userAgent || null,
        request_id: request.requestId || uuidv4(),
        additional_info: additionalInfo ? JSON.stringify(additionalInfo) : null
      };

      // Create backup in transaction
      const result = await tenantDb.transaction(async (t) => {
        // Create the backup entry
        const backup = await InvoiceBackup.create(backupData, { transaction: t });

        // Update or create backup summary
        await this.updateBackupSummary({
          tenantModels,
          invoice,
          backupType,
          user,
          tenant,
          transaction: t
        });

        return backup;
      });

      console.log(`✅ Invoice backup created successfully:`, {
        backupId: result.id,
        originalInvoiceId: invoice.id,
        backupType,
        backupReason
      });

      return result;
    } catch (error) {
      console.error('❌ Error creating invoice backup:', error);
      throw error;
    }
  }

  /**
   * Create backup for draft invoice operations
   */
  async createDraftBackup({
    tenantDb,
    tenantModels,
    invoice,
    invoiceItems = [],
    isUpdate = false,
    user = {},
    tenant = {},
    request = {}
  }) {
    const backupReason = isUpdate
      ? `Draft invoice updated - ${invoice.invoice_number || invoice.system_invoice_id}`
      : `Draft invoice created - ${invoice.invoice_number || invoice.system_invoice_id}`;

    return this.createBackup({
      tenantDb,
      tenantModels,
      invoice,
      invoiceItems,
      backupType: 'DRAFT',
      backupReason,
      statusBefore: isUpdate ? 'draft' : null,
      statusAfter: 'draft',
      user,
      tenant,
      request
    });
  }

  /**
   * Create backup for saved invoice operations
   */
  async createSavedBackup({
    tenantDb,
    tenantModels,
    invoice,
    invoiceItems = [],
    isUpdate = false,
    user = {},
    tenant = {},
    request = {}
  }) {
    const backupReason = isUpdate
      ? `Saved invoice updated - ${invoice.invoice_number || invoice.system_invoice_id}`
      : `Invoice saved and validated - ${invoice.invoice_number || invoice.system_invoice_id}`;

    return this.createBackup({
      tenantDb,
      tenantModels,
      invoice,
      invoiceItems,
      backupType: 'SAVED',
      backupReason,
      statusBefore: isUpdate ? 'saved' : 'draft',
      statusAfter: 'saved',
      user,
      tenant,
      request
    });
  }

  /**
   * Create backup for invoice edit operations
   */
  async createEditBackup({
    tenantDb,
    tenantModels,
    oldInvoice,
    newInvoice,
    oldInvoiceItems = [],
    newInvoiceItems = [],
    user = {},
    tenant = {},
    request = {}
  }) {
    const backupReason = `Invoice edited - ${oldInvoice.invoice_number || oldInvoice.system_invoice_id}`;

    return this.createBackup({
      tenantDb,
      tenantModels,
      invoice: oldInvoice, // Backup the old version
      invoiceItems: oldInvoiceItems,
      backupType: 'EDIT',
      backupReason,
      statusBefore: oldInvoice.status,
      statusAfter: newInvoice.status,
      user,
      tenant,
      request,
      additionalInfo: {
        editType: 'UPDATE',
        newInvoiceData: this.sanitizeInvoiceData(newInvoice),
        newInvoiceItemsData: newInvoiceItems.map(item => this.sanitizeInvoiceItemData(item))
      }
    });
  }

  /**
   * Create backup for posted invoice operations
   */
  async createPostBackup({
    tenantDb,
    tenantModels,
    invoice,
    invoiceItems = [],
    user = {},
    tenant = {},
    request = {},
    fbrRequestData = null,
    fbrResponseData = null
  }) {
    const backupReason = `Invoice posted - ${invoice.invoice_number || invoice.system_invoice_id}`;

    return this.createBackup({
      tenantDb,
      tenantModels,
      invoice,
      invoiceItems,
      backupType: 'POST',
      backupReason,
      statusBefore: invoice.status,
      statusAfter: 'posted',
      user,
      tenant,
      request,
      fbrRequestData,
      fbrResponseData
    });
  }

  /**
   * Create backup for FBR request data
   */
  async createFbrRequestBackup({
    tenantDb,
    tenantModels,
    invoice,
    fbrRequestData,
    user = {},
    tenant = {},
    request = {}
  }) {
    const backupReason = `FBR request sent - ${invoice.invoice_number || invoice.system_invoice_id}`;

    return this.createBackup({
      tenantDb,
      tenantModels,
      invoice,
      backupType: 'FBR_REQUEST',
      backupReason,
      statusBefore: invoice.status,
      statusAfter: invoice.status,
      user,
      tenant,
      request,
      fbrRequestData
    });
  }

  /**
   * Create backup for FBR response data
   */
  async createFbrResponseBackup({
    tenantDb,
    tenantModels,
    invoice,
    fbrResponseData,
    user = {},
    tenant = {},
    request = {}
  }) {
    const backupReason = `FBR response received - ${invoice.invoice_number || invoice.system_invoice_id}`;

    return this.createBackup({
      tenantDb,
      tenantModels,
      invoice,
      backupType: 'FBR_RESPONSE',
      backupReason,
      statusBefore: invoice.status,
      statusAfter: invoice.status,
      user,
      tenant,
      request,
      fbrResponseData
    });
  }

  /**
   * Create backup for FBR submission (Request & Response)
   */
  async createFbrSubmissionBackup({
    tenantDb,
    tenantModels,
    invoice,
    fbrRequestData,
    fbrResponseData,
    user = {},
    tenant = {},
    request = {}
  }) {
    const backupReason = `FBR submission - ${invoice.invoice_number || invoice.system_invoice_id}`;

    return this.createBackup({
      tenantDb,
      tenantModels,
      invoice,
      backupType: 'FBR_RESPONSE',
      backupReason,
      statusBefore: invoice.status,
      statusAfter: invoice.status,
      user,
      tenant,
      request,
      fbrRequestData,
      fbrResponseData
    });
  }

  /**
   * Update backup summary for an invoice
   */
  async updateBackupSummary({
    tenantModels,
    invoice,
    backupType,
    user = {},
    tenant = {},
    transaction = null
  }) {
    try {
      const { InvoiceBackupSummary } = tenantModels;

      // Skip summary creation if invoice.id is null (e.g., FBR submissions without linked invoice)
      if (!invoice.id) {
        console.log('⚠️ Skipping backup summary creation: invoice.id is null');
        return null;
      }

      // Get current summary or create new one
      let summary = await InvoiceBackupSummary.findOne({
        where: { original_invoice_id: invoice.id },
        transaction
      });

      if (!summary) {
        // Create new summary
        summary = await InvoiceBackupSummary.create({
          original_invoice_id: invoice.id,
          system_invoice_id: invoice.system_invoice_id,
          total_backups: 1,
          first_backup_at: new Date(),
          last_backup_at: new Date(),
          last_backup_type: backupType,
          created_by_user_id: user.id || user.userId || null,
          created_by_email: user.email || null,
          created_by_name: this.getUserDisplayName(user),
          last_modified_by_user_id: user.id || user.userId || null,
          last_modified_by_email: user.email || null,
          last_modified_by_name: this.getUserDisplayName(user),
          tenant_id: tenant.id || tenant.tenantId || null,
          tenant_name: tenant.name || tenant.sellerBusinessName || null,
          invoice_number: invoice.invoice_number,
          fbr_invoice_number: invoice.fbr_invoice_number || null
        }, { transaction });
      } else {
        // Update existing summary
        const updateData = {
          total_backups: summary.total_backups + 1,
          last_backup_at: new Date(),
          last_backup_type: backupType,
          last_modified_by_user_id: user.id || user.userId || null,
          last_modified_by_email: user.email || null,
          last_modified_by_name: this.getUserDisplayName(user),
          invoice_number: invoice.invoice_number,
          fbr_invoice_number: invoice.fbr_invoice_number || null
        };

        await summary.update(updateData, { transaction });
      }

      return summary;
    } catch (error) {
      console.error('❌ Error updating backup summary:', error);
      throw error;
    }
  }

  /**
   * Get backup history for an invoice
   */
  async getInvoiceBackupHistory({
    tenantModels,
    invoiceId,
    limit = 50,
    offset = 0,
    backupType = null
  }) {
    try {
      const { InvoiceBackup } = tenantModels;

      const whereClause = { original_invoice_id: invoiceId };
      if (backupType) {
        whereClause.backup_type = backupType;
      }

      const backups = await InvoiceBackup.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      return backups;
    } catch (error) {
      console.error('❌ Error getting invoice backup history:', error);
      throw error;
    }
  }

  /**
   * Get backup summary for an invoice
   */
  async getInvoiceBackupSummary({
    tenantModels,
    invoiceId
  }) {
    try {
      const { InvoiceBackupSummary } = tenantModels;

      const summary = await InvoiceBackupSummary.findOne({
        where: { original_invoice_id: invoiceId }
      });

      return summary;
    } catch (error) {
      console.error('❌ Error getting invoice backup summary:', error);
      throw error;
    }
  }

  /**
   * Sanitize invoice data for backup (remove sensitive fields)
   */
  sanitizeInvoiceData(invoice) {
    if (!invoice) return null;

    const sanitized = { ...invoice };

    // Remove sensitive fields if any
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.secret;

    // Convert to plain object if it's a Sequelize instance
    if (sanitized.dataValues) {
      return sanitized.dataValues;
    }

    return sanitized;
  }

  /**
   * Sanitize invoice item data for backup
   */
  sanitizeInvoiceItemData(item) {
    if (!item) return null;

    const sanitized = { ...item };

    // Convert to plain object if it's a Sequelize instance
    if (sanitized.dataValues) {
      return sanitized.dataValues;
    }

    return sanitized;
  }

  /**
   * Get user display name
   */
  getUserDisplayName(user) {
    if (!user) return null;

    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }

    if (user.name) {
      return user.name;
    }

    if (user.email) {
      return user.email;
    }

    if (user.role === 'admin') {
      return `Admin (${user.id || user.userId || 'Unknown'})`;
    }

    return `User (${user.id || user.userId || 'Unknown'})`;
  }
}

export default new InvoiceBackupService();
