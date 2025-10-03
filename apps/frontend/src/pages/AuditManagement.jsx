import React, { useState, useEffect } from "react";

const AuditManagement = () => {
  const [activeTab, setActiveTab] = useState("logs");
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSummary, setAuditSummary] = useState([]);
  const [statistics, setStatistics] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState({ type: "", id: "" });
  const [entityHistory, setEntityHistory] = useState(null);
  const [showEntityHistory, setShowEntityHistory] = useState(false);
  const [filters, setFilters] = useState({
    entityType: "",
    entityId: "",
    operation: "",
    tenantId: "",
    startDate: "",
    endDate: "",
    search: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Fetch audit logs
  const fetchAuditLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== "")),
      });

      console.log('🔍 Frontend Debug - Fetching audit logs with params:', queryParams.toString());
      console.log('🔍 Frontend Debug - Current filters:', filters);

      const response = await fetch(`/api/audit/logs?${queryParams}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const result = await response.json();
      console.log('🔍 Frontend Debug - Audit logs response:', result);
      
      if (result.success) {
        setAuditLogs(result.data.logs);
        setPagination(result.data.pagination);
      } else {
        setError(result.message);
        console.error('🔍 Frontend Debug - Audit logs API error:', result.message);
      }
    } catch (err) {
      setError("Failed to fetch audit logs");
      console.error("Error fetching audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch entity history
  const fetchEntityHistory = async (entityType, entityId) => {
    console.log(`🔍 Frontend Debug - Fetching entity history for ${entityType} #${entityId}`);
    console.log(`🔍 Frontend Debug - Current filters:`, filters);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/audit/entity/${entityType}/${entityId}/history`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const result = await response.json();
      console.log(`🔍 Frontend Debug - Entity history response:`, result);
      
      if (result.success) {
        setEntityHistory(result.data.history);
        setShowEntityHistory(true);
        console.log(`🔍 Frontend Debug - Entity history set:`, result.data.history);
      } else {
        setError(result.message);
        console.error(`🔍 Frontend Debug - Entity history error:`, result.message);
      }
    } catch (err) {
      setError("Failed to fetch entity history");
      console.error("Error fetching entity history:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch audit summary
  const fetchAuditSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== "")),
      });

      const response = await fetch(`/api/audit/summary?${queryParams}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const result = await response.json();
      if (result.success) {
        setAuditSummary(result.data.summaries);
        setPagination(result.data.pagination);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError("Failed to fetch audit summary");
      console.error("Error fetching audit summary:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch statistics
  const fetchStatistics = async () => {
    try {
      console.log('🔍 Frontend Debug - Fetching statistics...');
      const response = await fetch("/api/audit/statistics", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      const result = await response.json();
      console.log('🔍 Frontend Debug - Statistics response:', result);
      
      if (result.success) {
        setStatistics(result.data);
        console.log('🔍 Frontend Debug - Statistics set:', result.data);
      } else {
        console.error('🔍 Frontend Debug - Statistics API error:', result.message);
      }
    } catch (err) {
      console.error("Error fetching statistics:", err);
    }
  };

  useEffect(() => {
    // Always fetch statistics for the summary cards
    fetchStatistics();
    
    if (activeTab === "logs") {
      if (filters.entityId && filters.entityType) {
        // If specific entity is selected, fetch its history
        fetchEntityHistory(filters.entityType, filters.entityId);
      } else {
        // Otherwise fetch regular audit logs
        fetchAuditLogs();
      }
    } else if (activeTab === "summary") {
      fetchAuditSummary();
    } else if (activeTab === "statistics") {
      fetchStatistics();
    }
  }, [activeTab, pagination.page, filters]);

  const handleFilterChange = (key, value) => {
    console.log(`🔍 Frontend Debug - Filter change: ${key} = ${value}`);
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      console.log(`🔍 Frontend Debug - New filters:`, newFilters);
      return newFilters;
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const exportAuditLogs = async () => {
    try {
      const queryParams = new URLSearchParams({
        format: "csv",
        ...Object.fromEntries(Object.entries(filters).filter(([_, v]) => v !== "")),
      });

      const response = await fetch(`/api/audit/export?${queryParams}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_logs_${new Date().toISOString().split("T")[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      console.error("Error exporting audit logs:", err);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getOperationColor = (operation) => {
    switch (operation) {
      case "CREATE": return "text-green-600 bg-green-100";
      case "UPDATE": return "text-blue-600 bg-blue-100";
      case "DELETE": return "text-red-600 bg-red-100";
      case "SAVE_DRAFT": return "text-yellow-600 bg-yellow-100";
      case "SAVE_AND_VALIDATE": return "text-purple-600 bg-purple-100";
      case "SUBMIT_TO_FBR": return "text-indigo-600 bg-indigo-100";
      case "BULK_CREATE": return "text-orange-600 bg-orange-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const getEntityTypeColor = (entityType) => {
    switch (entityType) {
      case "invoice": return "text-purple-600 bg-purple-100";
      case "buyer": return "text-orange-600 bg-orange-100";
      case "product": return "text-indigo-600 bg-indigo-100";
      case "user": return "text-pink-600 bg-pink-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  // Show detailed audit information
  const showAuditDetails = (log) => {
    setSelectedLog(log);
    setShowDetailsModal(true);
  };

  // Close details modal
  const closeDetailsModal = () => {
    setSelectedLog(null);
    setShowDetailsModal(false);
  };

  // View entity history
  const viewEntityHistory = (entityType, entityId) => {
    setFilters(prev => ({ ...prev, entityType, entityId }));
    fetchEntityHistory(entityType, entityId);
  };

  // Clear entity selection
  const clearEntitySelection = () => {
    setFilters(prev => ({ ...prev, entityType: "", entityId: "" }));
    setShowEntityHistory(false);
    setEntityHistory(null);
  };

  // Close entity history view
  const closeEntityHistory = () => {
    setShowEntityHistory(false);
    setEntityHistory(null);
  };

  // Helper function to render seller information
  const renderSellerInfo = (data) => {
    if (!data) return null;
    
    return (
      <div className="bg-blue-50 p-3 sm:p-4 rounded-lg mb-4">
        <h4 className="text-sm sm:text-md font-semibold text-blue-900 mb-3">Seller Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700">Business Name:</span>
            <span className="ml-2 text-gray-900">{data.sellerBusinessName || 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">NTN/CNIC:</span>
            <span className="ml-2 text-gray-900">{data.sellerNTNCNIC || 'N/A'}</span>
          </div>
          {data.sellerFullNTN && (
            <div>
              <span className="font-medium text-gray-700">Full NTN:</span>
              <span className="ml-2 text-gray-900">{data.sellerFullNTN}</span>
            </div>
          )}
          <div>
            <span className="font-medium text-gray-700">Province:</span>
            <span className="ml-2 text-gray-900">{data.sellerProvince || 'N/A'}</span>
          </div>
          {data.sellerCity && (
            <div>
              <span className="font-medium text-gray-700">City:</span>
              <span className="ml-2 text-gray-900">{data.sellerCity}</span>
            </div>
          )}
          <div className="sm:col-span-2">
            <span className="font-medium text-gray-700">Address:</span>
            <span className="ml-2 text-gray-900">{data.sellerAddress || 'N/A'}</span>
          </div>
        </div>
      </div>
    );
  };

  // Helper function to render buyer information
  const renderBuyerInfo = (data) => {
    if (!data) return null;
    
    return (
      <div className="bg-green-50 p-3 sm:p-4 rounded-lg mb-4">
        <h4 className="text-sm sm:text-md font-semibold text-green-900 mb-3">Buyer Information</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-700">Business Name:</span>
            <span className="ml-2 text-gray-900">{data.buyerBusinessName || 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">NTN/CNIC:</span>
            <span className="ml-2 text-gray-900">{data.buyerNTNCNIC || 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Province:</span>
            <span className="ml-2 text-gray-900">{data.buyerProvince || 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-gray-700">Registration Type:</span>
            <span className="ml-2 text-gray-900">{data.buyerRegistrationType || 'N/A'}</span>
          </div>
          {data.buyerCity && (
            <div>
              <span className="font-medium text-gray-700">City:</span>
              <span className="ml-2 text-gray-900">{data.buyerCity}</span>
            </div>
          )}
          <div className="sm:col-span-2">
            <span className="font-medium text-gray-700">Address:</span>
            <span className="ml-2 text-gray-900">{data.buyerAddress || 'N/A'}</span>
          </div>
        </div>
      </div>
    );
  };

  // Helper function to render invoice items as a comprehensive table
  const renderInvoiceItemsTable = (invoiceItems) => {
    if (!invoiceItems || !Array.isArray(invoiceItems) || invoiceItems.length === 0) {
      return <p className="text-sm text-gray-500">No invoice items</p>;
    }

    return (
      <div className="bg-purple-50 p-4 rounded-lg mb-4">
        <h4 className="text-md font-semibold text-purple-900 mb-3">Invoice Items ({invoiceItems.length} items)</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  HS Code
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Qty
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Price
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tax Rate
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sales Tax
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Extra Tax
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Further Tax
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoiceItems.map((item, index) => (
                <tr key={item.id || index}>
                  <td className="px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium text-gray-900">{item.product_name || 'N/A'}</div>
                      <div className="text-gray-500 text-xs">{item.productDescription || 'No description'}</div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.hsCode || 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.quantity ? (
                      <div>
                        <span>{item.quantity}</span>
                        {item.uoM && (
                          <span className="ml-1 text-blue-600 font-medium">{item.uoM}</span>
                        )}
                      </div>
                    ) : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.unitPrice ? `$${parseFloat(item.unitPrice).toFixed(2)}` : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.totalValues ? `$${parseFloat(item.totalValues).toFixed(2)}` : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.rate || 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.salesTaxApplicable ? `$${parseFloat(item.salesTaxApplicable).toFixed(2)}` : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.extraTax ? `$${parseFloat(item.extraTax).toFixed(2)}` : 'N/A'}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500">
                    {item.furtherTax ? `$${parseFloat(item.furtherTax).toFixed(2)}` : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Helper function to render object as table with intelligent data display
  const renderObjectAsTable = (obj, title) => {
    if (!obj) return <p className="text-sm text-gray-500">No data available</p>;
    
    let parsedObj;
    try {
      parsedObj = typeof obj === 'string' ? JSON.parse(obj) : obj;
    } catch (error) {
      console.error('Error parsing object:', error);
      return <p className="text-sm text-red-500">Error parsing data</p>;
    }

    // Check if this is invoice data and render it specially
    if (parsedObj.invoice_id || parsedObj.invoice_number) {
      return (
        <div className="space-y-4">
          {/* Basic Invoice Information */}
          <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
            <h4 className="text-sm sm:text-md font-semibold text-gray-900 mb-3">Invoice Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Invoice Number:</span>
                <span className="ml-2 text-gray-900">{parsedObj.invoice_number || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">System Invoice ID:</span>
                <span className="ml-2 text-gray-900">{parsedObj.system_invoice_id || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">FBR Invoice Number:</span>
                <span className="ml-2 text-gray-900">{parsedObj.fbr_invoice_number || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Status:</span>
                <span className="ml-2 text-gray-900">{parsedObj.status || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Invoice Type:</span>
                <span className="ml-2 text-gray-900">{parsedObj.invoiceType || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Invoice Date:</span>
                <span className="ml-2 text-gray-900">{parsedObj.invoiceDate || 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Total Amount:</span>
                <span className="ml-2 text-gray-900">{parsedObj.totalAmount ? `$${parseFloat(parsedObj.totalAmount).toFixed(2)}` : 'N/A'}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">FBR Validation:</span>
                <span className="ml-2 text-gray-900">{parsedObj.fbrValidation || 'N/A'}</span>
              </div>
              {parsedObj.invoiceRefNo && (
                <div>
                  <span className="font-medium text-gray-700">Invoice Ref No:</span>
                  <span className="ml-2 text-gray-900">{parsedObj.invoiceRefNo}</span>
                </div>
              )}
              {parsedObj.companyInvoiceRefNo && (
                <div>
                  <span className="font-medium text-gray-700">Company Invoice Ref No:</span>
                  <span className="ml-2 text-gray-900">{parsedObj.companyInvoiceRefNo}</span>
                </div>
              )}
              {parsedObj.internal_invoice_no && (
                <div>
                  <span className="font-medium text-gray-700">Internal Invoice No:</span>
                  <span className="ml-2 text-gray-900">{parsedObj.internal_invoice_no}</span>
                </div>
              )}
              {parsedObj.transctypeId && (
                <div>
                  <span className="font-medium text-gray-700">Transaction Type ID:</span>
                  <span className="ml-2 text-gray-900">{parsedObj.transctypeId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Seller Information */}
          {renderSellerInfo(parsedObj)}

          {/* Buyer Information */}
          {renderBuyerInfo(parsedObj)}

          {/* Invoice Items */}
          {parsedObj.invoice_items && Array.isArray(parsedObj.invoice_items) && (
            renderInvoiceItemsTable(parsedObj.invoice_items)
          )}

          {/* Additional fields not covered above - only show non-empty fields */}
          {(() => {
            const coveredFields = new Set([
              'invoice_id', 'invoice_number', 'system_invoice_id', 'fbr_invoice_number', 'status',
              'invoiceType', 'invoiceDate', 'totalAmount', 'fbrValidation', 'invoice_items',
              'sellerNTNCNIC', 'sellerFullNTN', 'sellerBusinessName', 'sellerProvince', 'sellerAddress', 'sellerCity',
              'buyerNTNCNIC', 'buyerBusinessName', 'buyerProvince', 'buyerAddress', 'buyerRegistrationType',
              'invoiceRefNo', 'companyInvoiceRefNo', 'internal_invoice_no', 'transctypeId', 'transctypeld'
            ]);
            
            // Filter out empty fields and only show meaningful additional data
            const additionalFields = Object.entries(parsedObj)
              .filter(([key]) => !coveredFields.has(key))
              .filter(([key, value]) => {
                // Only show fields that have meaningful values
                return value !== null && 
                       value !== undefined && 
                       value !== '' && 
                       value !== 'NULL' && 
                       value !== 'null' &&
                       (typeof value !== 'string' || value.trim() !== '');
              });
            
            if (additionalFields.length > 0) {
              return (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <h4 className="text-md font-semibold text-yellow-900 mb-3">Additional Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {additionalFields.map(([key, value]) => (
                      <div key={key}>
                        <span className="font-medium text-gray-700">{key}:</span>
                        <span className="ml-2 text-gray-900">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            return null;
          })()}
        </div>
      );
    }

    // For non-invoice data, render as regular table
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Field
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(parsedObj).map(([key, value]) => (
              <tr key={key}>
                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                  {key}
                </td>
                <td className="px-4 py-2 text-sm text-gray-500">
                  {value === null
                    ? <span className="text-gray-500 italic">null</span>
                    : typeof value === 'object' && value !== null
                      ? JSON.stringify(value, null, 2)
                      : String(value)
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Helper function to render changed fields as comparison table
  const renderChangedFieldsAsTable = (changedFields) => {
    if (!changedFields) return <p className="text-sm text-gray-500">No changes detected</p>;
    
    console.log('🔍 Frontend Debug - Raw changedFields:', changedFields);
    const parsedFields = typeof changedFields === 'string' ? JSON.parse(changedFields) : changedFields;
    console.log('🔍 Frontend Debug - Parsed changedFields:', parsedFields);
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Field
              </th>
              <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Previous Value
              </th>
              <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                New Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(parsedFields).map(([field, values]) => (
              <tr key={field}>
                <td className="px-2 sm:px-4 py-2 text-sm font-medium text-gray-900 break-words">
                  {field}
                </td>
                <td className="px-2 sm:px-4 py-2 text-sm text-red-600 break-words">
                  {field === 'invoice_items' && Array.isArray(values.old) ? (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700 mb-2">Previous Items ({values.old.length} items):</p>
                      {renderInvoiceItemsTable(values.old)}
                    </div>
                  ) : values.old === null 
                    ? <span className="text-gray-500 italic">null</span>
                    : typeof values.old === 'object' && values.old !== null 
                      ? <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(values.old, null, 2)}</pre>
                      : String(values.old)
                  }
                </td>
                <td className="px-2 sm:px-4 py-2 text-sm text-green-600 break-words">
                  {field === 'invoice_items' && Array.isArray(values.new) ? (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700 mb-2">New Items ({values.new.length} items):</p>
                      {renderInvoiceItemsTable(values.new)}
                    </div>
                  ) : values.new === null 
                    ? <span className="text-gray-500 italic">null</span>
                    : typeof values.new === 'object' && values.new !== null 
                      ? <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(values.new, null, 2)}</pre>
                      : String(values.new)
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Audit Management</h1>
          <p className="text-gray-600 mt-2">
            Track and monitor all system activities and changes
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Operations</p>
                <p className="text-2xl font-semibold text-gray-900">{statistics.totalOperations || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Created</p>
                <p className="text-2xl font-semibold text-gray-900">{statistics.operationsByType?.CREATE || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Updated</p>
                <p className="text-2xl font-semibold text-gray-900">{statistics.operationsByType?.UPDATE || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Deleted</p>
                <p className="text-2xl font-semibold text-gray-900">{statistics.operationsByType?.DELETE || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-6">
              {[
                { id: "logs", name: "Audit Logs", icon: "📋" },
                { id: "summary", name: "Summary", icon: "📊" },
                { id: "statistics", name: "Statistics", icon: "📈" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* Filters */}
            <div className="mb-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entity Type
                  </label>
                  <select
                    value={filters.entityType}
                    onChange={(e) => {
                      handleFilterChange("entityType", e.target.value);
                      if (!e.target.value) {
                        handleFilterChange("entityId", "");
                      }
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Types</option>
                    <option value="invoice">Invoice</option>
                    <option value="buyer">Buyer</option>
                    <option value="product">Product</option>
                    <option value="user">User</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Operation
                  </label>
                  <select
                    value={filters.operation}
                    onChange={(e) => handleFilterChange("operation", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Operations</option>
                    <option value="CREATE">Create</option>
                    <option value="UPDATE">Update</option>
                    <option value="DELETE">Delete</option>
                    <option value="SAVE_DRAFT">Save Draft</option>
                    <option value="SAVE_AND_VALIDATE">Save & Validate</option>
                    <option value="SUBMIT_TO_FBR">Submit to FBR</option>
                    <option value="BULK_CREATE">Bulk Create</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entity ID (for complete history)
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      value={filters.entityId}
                      onChange={(e) => handleFilterChange("entityId", e.target.value)}
                      placeholder="Enter ID..."
                      className="flex-1 border border-gray-300 rounded-l-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={!filters.entityType}
                    />
                    {filters.entityId && filters.entityType && (
                      <button
                        onClick={() => fetchEntityHistory(filters.entityType, filters.entityId)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-r-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        title="View Complete History"
                      >
                        🕒
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange("startDate", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange("endDate", e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search
                  </label>
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => handleFilterChange("search", e.target.value)}
                    placeholder="Search..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-between">
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setFilters({
                        entityType: "",
                        entityId: "",
                        operation: "",
                        tenantId: "",
                        startDate: "",
                        endDate: "",
                        search: "",
                      });
                      setPagination(prev => ({ ...prev, page: 1 }));
                      clearEntitySelection();
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Clear Filters
                  </button>
                  {filters.entityId && filters.entityType && (
                    <button
                      onClick={clearEntitySelection}
                      className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-300 rounded-md hover:bg-blue-100"
                    >
                      Show All Logs
                    </button>
                  )}
                </div>

                {activeTab === "logs" && (
                  <button
                    onClick={exportAuditLogs}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700"
                  >
                    Export CSV
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            {loading && (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* Complete History Banner */}
            {!showEntityHistory && auditLogs.length > 0 && (
              <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">ℹ️</span>
                  <div>
                    <h4 className="text-lg font-semibold text-blue-900">Complete History Available</h4>
                    <p className="text-blue-700 text-sm">
                      Click "View Complete History" buttons to see all changes for an entity in chronological order.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!loading && !error && (
              <>
                {activeTab === "logs" && (
                  <>
                    {/* Entity History View */}
                    {showEntityHistory && entityHistory && (
                      <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-lg p-6 shadow-lg">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="text-2xl">🕒</span>
                              <h3 className="text-xl font-bold text-blue-900">
                                Complete Edit History: {entityHistory.entityName || `${entityHistory.entityType} #${entityHistory.entityId}`}
                              </h3>
                            </div>
                            <p className="text-blue-700 text-sm font-medium">
                              📅 Timeline of ALL changes from creation to current state - {entityHistory.timeline.length} operations
                            </p>
                          </div>
                          <button
                            onClick={closeEntityHistory}
                            className="text-blue-600 hover:text-blue-800 text-2xl font-bold bg-white rounded-full w-8 h-8 flex items-center justify-center shadow-md"
                          >
                            ×
                          </button>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                          <div className="bg-white p-4 rounded-lg">
                            <div className="text-sm font-medium text-gray-600">Total Operations</div>
                            <div className="text-2xl font-bold text-gray-900">{entityHistory.summary.totalOperations}</div>
                          </div>
                          <div className="bg-white p-4 rounded-lg">
                            <div className="text-sm font-medium text-gray-600">Created By</div>
                            <div className="text-sm font-bold text-gray-900">{entityHistory.summary.createdBy?.name || "Unknown"}</div>
                            <div className="text-xs text-gray-500">{entityHistory.summary.createdBy?.email || ""}</div>
                          </div>
                          <div className="bg-white p-4 rounded-lg">
                            <div className="text-sm font-medium text-gray-600">Last Modified By</div>
                            <div className="text-sm font-bold text-gray-900">{entityHistory.summary.lastModifiedBy?.name || "Unknown"}</div>
                            <div className="text-xs text-gray-500">{entityHistory.summary.lastModifiedBy?.email || ""}</div>
                          </div>
                          <div className={`p-4 rounded-lg ${entityHistory.isDeleted ? 'bg-red-50' : 'bg-green-50'}`}>
                            <div className={`text-sm font-medium ${entityHistory.isDeleted ? 'text-red-600' : 'text-green-600'}`}>
                              Status
                            </div>
                            <div className={`text-sm font-bold ${entityHistory.isDeleted ? 'text-red-900' : 'text-green-900'}`}>
                              {entityHistory.isDeleted ? "Deleted" : "Active"}
                            </div>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                          {entityHistory.timeline.length === 0 ? (
                            <div className="text-center py-8 bg-white rounded-lg border-2 border-dashed border-gray-300">
                              <div className="text-4xl mb-2">📝</div>
                              <h4 className="text-lg font-medium text-gray-900 mb-2">No History Found</h4>
                              <p className="text-gray-500">This entity has no audit history recorded.</p>
                            </div>
                          ) : (
                            <>
                              {/* Timeline Header */}
                              <div className="bg-white border-2 border-blue-200 rounded-lg p-4 mb-4">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className="text-2xl">📅</span>
                                  <h4 className="text-lg font-bold text-blue-900">Complete Timeline - All Changes in Order</h4>
                                </div>
                                <p className="text-blue-700 text-sm">
                                  This shows the complete journey from creation to current state, with all users who made changes.
                                </p>
                              </div>
                              
                              {entityHistory.timeline.map((entry, index) => (
                            <div key={entry.id} className="bg-white border border-gray-200 rounded-lg p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                  <div className="text-2xl">
                                    {entry.operation === 'CREATE' ? '➕' : 
                                     entry.operation === 'UPDATE' ? '✏️' : 
                                     entry.operation === 'DELETE' ? '🗑️' : '📝'}
                                  </div>
                                  <div>
                                    <div className="flex items-center space-x-2">
                                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getOperationColor(entry.operation)}`}>
                                        {entry.operation}
                                      </span>
                                      <span className="text-sm text-gray-500">
                                        by {entry.user.name || "Unknown"}
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                      {formatDate(entry.timestamp)}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => showAuditDetails({
                                    ...entry,
                                    entityType: entityHistory.entityType,
                                    entityId: entityHistory.entityId,
                                    oldValues: entry.oldValues,
                                    newValues: entry.newValues,
                                    changedFields: entry.changedFields,
                                    ipAddress: entry.ipAddress,
                                    tenantName: entry.tenant.name,
                                    additionalInfo: entry.additionalInfo
                                  })}
                                  className="text-blue-600 hover:text-blue-900 font-medium text-sm"
                                >
                                  View Details
                                </button>
                              </div>
                            </div>
                              ))
                              }
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Regular Audit Logs Table */}
                    {!showEntityHistory && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Entity
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Operation
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                User
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Date
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {auditLogs.map((log) => (
                              <tr key={log.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEntityTypeColor(log.entityType)}`}>
                                      {log.entityType}
                                    </span>
                                    <span className="ml-2 text-sm text-gray-900">#{log.entityId}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getOperationColor(log.operation)}`}>
                                    {log.operation}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-gray-900">{log.userName || "Unknown"}</div>
                                  <div className="text-sm text-gray-500">{log.userEmail || "N/A"}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {formatDate(log.created_at)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={() => showAuditDetails(log)}
                                      className="px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100"
                                    >
                                      View Details
                                    </button>
                                    <button
                                      onClick={() => viewEntityHistory(log.entityType, log.entityId)}
                                      className="px-3 py-1 text-xs font-bold text-white bg-green-600 border border-green-700 rounded hover:bg-green-700"
                                    >
                                      🕒 Complete History
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}

                {activeTab === "summary" && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Entity
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created By
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Last Modified By
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Operations
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {auditSummary.map((summary) => (
                          <tr key={summary.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEntityTypeColor(summary.entityType)}`}>
                                {summary.entityType}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{summary.entityName || "N/A"}</div>
                              <div className="text-sm text-gray-500">ID: {summary.entityId}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{summary.createdByName || "Unknown"}</div>
                              <div className="text-sm text-gray-500">{summary.createdByEmail || "N/A"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">{summary.lastModifiedByName || "Unknown"}</div>
                              <div className="text-sm text-gray-500">{summary.lastModifiedByEmail || "N/A"}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {summary.totalOperations}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                {summary.isDeleted ? (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full text-red-600 bg-red-100">
                                    Deleted
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full text-green-600 bg-green-100">
                                    Active
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === "statistics" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gray-50 rounded-lg p-6">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Operations by Entity Type</h3>
                      <div className="space-y-3">
                        {Object.entries(statistics.operationsByEntity || {}).map(([entityType, count]) => (
                          <div key={entityType} className="flex justify-between items-center">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEntityTypeColor(entityType)}`}>
                              {entityType}
                            </span>
                            <span className="text-sm font-medium text-gray-900">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-lg p-6">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Top Users by Activity</h3>
                      <div className="space-y-3">
                        {statistics.topUsers?.slice(0, 10).map((user, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{user.userName || "Unknown"}</div>
                              <div className="text-xs text-gray-500">{user.userEmail || "N/A"}</div>
                            </div>
                            <span className="text-sm font-medium text-gray-900">{user.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              </>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} results
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                    className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Audit Details Modal */}
      {showDetailsModal && selectedLog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="relative p-2 sm:p-4 md:p-5 border w-[95%] sm:w-11/12 md:w-10/12 lg:w-9/12 xl:w-8/12 2xl:w-7/12 max-w-6xl shadow-lg rounded-md bg-white max-h-[95vh] sm:max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start sm:items-center mb-4 flex-shrink-0">
              <h3 className="text-base sm:text-lg font-medium text-gray-900 pr-2">
                Details - {selectedLog.entityType} #{selectedLog.entityId}
              </h3>
              <button
                onClick={closeDetailsModal}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5 sm:h-6 sm:w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 sm:space-y-6 overflow-y-auto flex-1 pr-1 sm:pr-2">
                {/* Basic Information */}
                <div className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                  <h4 className="text-sm sm:text-md font-semibold text-gray-900 mb-3">Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Operation</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getOperationColor(selectedLog.operation)}`}>
                        {selectedLog.operation}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Entity Type</label>
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEntityTypeColor(selectedLog.entityType)}`}>
                        {selectedLog.entityType}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">User</label>
                      <p className="text-sm text-gray-900">{selectedLog.userName || "Unknown"}</p>
                      <p className="text-sm text-gray-500">{selectedLog.userEmail || "N/A"}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Date</label>
                      <p className="text-sm text-gray-900">{formatDate(selectedLog.created_at)}</p>
                    </div>
                    {selectedLog.entityType !== "invoice" && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">IP Address</label>
                          <p className="text-sm text-gray-900">{selectedLog.ipAddress || "N/A"}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Tenant</label>
                          <p className="text-sm text-gray-900">{selectedLog.tenantName || "N/A"}</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Old Values (for UPDATE/DELETE operations) */}
                {selectedLog.oldValues && (
                  <div className="bg-red-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-sm sm:text-md font-semibold text-red-900 mb-3">Previous Values</h4>
                    <div className="bg-white p-2 sm:p-3 rounded border overflow-x-auto">
                      {renderObjectAsTable(selectedLog.oldValues)}
                    </div>
                  </div>
                )}

                {/* New Values (for CREATE/UPDATE operations) */}
                {selectedLog.newValues && (
                  <div className="bg-green-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-sm sm:text-md font-semibold text-green-900 mb-3">New Values</h4>
                    <div className="bg-white p-2 sm:p-3 rounded border overflow-x-auto">
                      {renderObjectAsTable(selectedLog.newValues)}
                    </div>
                  </div>
                )}

                {/* Changed Fields (for UPDATE operations) */}
                {selectedLog.changedFields && (
                  <div className="bg-blue-50 p-3 sm:p-4 rounded-lg">
                    <h4 className="text-sm sm:text-md font-semibold text-blue-900 mb-3">Changed Fields</h4>
                    <div className="bg-white p-2 sm:p-3 rounded border overflow-x-auto">
                      {renderChangedFieldsAsTable(selectedLog.changedFields)}
                    </div>
                  </div>
                )}


            </div>

            <div className="mt-4 sm:mt-6 flex justify-end flex-shrink-0 border-t pt-3 sm:pt-4">
              <button
                onClick={closeDetailsModal}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 w-full sm:w-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AuditManagement;
