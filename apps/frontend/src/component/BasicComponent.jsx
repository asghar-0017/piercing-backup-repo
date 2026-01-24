import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  useTheme,
  Skeleton,
  TextField,
  MenuItem,
  InputAdornment,
  Checkbox,
  CircularProgress,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import VisibilityIcon from "@mui/icons-material/Visibility";
import PrintIcon from "@mui/icons-material/Print";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import PermissionGate from "./PermissionGate";

import { api, API_CONFIG } from "../API/Api";
import { postData } from "../API/GetApi";
import SearchIcon from "@mui/icons-material/Search";
import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import Tooltip from "@mui/material/Tooltip";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import InvoiceViewModal from "./InvoiceViewModal";
import CustomPagination from "./CustomPagination";
import InvoiceUploader from "./InvoiceUploader";
import hsCodeCache from "../utils/hsCodeCache";

import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import { showError, showErrorFromResponse } from "../utils/errorHandler.jsx";

export default function BasicTable() {
  const [invoices, setInvoices] = useState([]);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // New state variables for Save and Validate and Submit functionality
  const [saveValidateLoading, setSaveValidateLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [isSubmitVisible, setIsSubmitVisible] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [saleType, setSaleType] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [fromDate, setFromDate] = useState(dayjs().startOf("month"));
  const [toDate, setToDate] = useState(dayjs());
  const [goToPage, setGoToPage] = useState("");
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState("DESC");
  const theme = useTheme();
  const { selectedTenant } = useTenantSelection();
  const navigate = useNavigate();

  const apiKey = API_CONFIG.apiKeyLocal;

  // Determine if the logged-in user is an admin
  const isAdmin = (() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed?.role === "admin";
    } catch {
      return false;
    }
  })();

  // Helper function to handle column sorting
  const handleSort = (column) => {
    if (sortBy === column) {
      // Toggle sort order if same column
      setSortOrder(sortOrder === "ASC" ? "DESC" : "ASC");
    } else {
      // Set new column and default to ASC
      setSortBy(column);
      setSortOrder("ASC");
    }
  };

  // Helper function to format date to dd-mm-yyyy (timezone-safe)
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      // If already YYYY-MM-DD, format directly to preserve day
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

  // Helper function to get status color
  const getStatusColor = (status) => {
    switch (status) {
      case "draft":
        return "#ff9800"; // Orange
      case "saved":
        return "#2196f3"; // Blue
      case "validated":
        return "#9c27b0"; // Purple
      case "submitted":
        return "#ff9800"; // Orange (same as draft for now)
      case "posted":
        return "#4caf50"; // Green
      default:
        return "#757575"; // Grey
    }
  };

  // Helper function to get status display text
  const getStatusText = (status) => {
    switch (status) {
      case "draft":
        return "Draft";
      case "saved":
        return "Saved";
      case "validated":
        return "Validated";
      case "submitted":
        return "Submitted";
      case "posted":
        return "Posted";
      default:
        return "Unknown";
    }
  };

  // Debounce search input
  useEffect(() => {
    setIsTyping(true);

    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setIsTyping(false);
    }, 800); // 800ms delay - increased for better UX

    return () => clearTimeout(timer);
  }, [search]);

  // Trigger API call when sorting changes
  useEffect(() => {
    if (selectedTenant) {
      getMyInvoices();
    }
  }, [sortBy, sortOrder]);

  const getMyInvoices = async (isSearchOperation = false) => {
    if (isSearchOperation) {
      setSearchLoading(true);
    } else {
      setLoading(true);
    }

    try {
      if (!selectedTenant) {
        console.error("No Company selected");
        if (isSearchOperation) {
          setSearchLoading(false);
        } else {
          setLoading(false);
        }
        return;
      }

      // Build query parameters for server-side pagination and filtering
      const params = new URLSearchParams();
      params.append("page", page.toString());
      if (rowsPerPage === "All") {
        params.append("limit", "999999"); // Large number to get all records
      } else {
        params.append("limit", rowsPerPage.toString());
      }

      if (debouncedSearch.trim()) {
        params.append("search", debouncedSearch.trim());
      }

      if (saleType && saleType !== "All") {
        params.append("sale_type", saleType);
      }

      if (statusFilter && statusFilter !== "All") {
        params.append("status", statusFilter);
      }

      if (fromDate) {
        params.append("start_date", dayjs(fromDate).format("YYYY-MM-DD"));
      }
      if (toDate) {
        params.append("end_date", dayjs(toDate).format("YYYY-MM-DD"));
      }

      // Add sorting parameters
      params.append("sort_by", sortBy);
      params.append("sort_order", sortOrder);

      const response = await api.get(
        `/tenant/${selectedTenant.tenant_id}/invoices?${params.toString()}`
      );

      if (response.data.success) {
        console.log(response.data.data.invoices);
        setInvoices(response.data.data.invoices || []);
        // Update pagination info from server response
        if (response.data.data.pagination) {
          setTotalPages(response.data.data.pagination.total_pages);
          setTotalRecords(response.data.data.pagination.total_records);
        }
      } else {
        console.error("Failed to fetch invoices:", response.data.message);
        setInvoices([]);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      await showErrorFromResponse(error);
      setInvoices([]);
    } finally {
      if (isSearchOperation) {
        setSearchLoading(false);
      } else {
        setLoading(false);
      }
    }
  };

  // Initial load only
  useEffect(() => {
    if (selectedTenant) {
      getMyInvoices(false);
    }
  }, [selectedTenant]);

  // All other operations (search, filters, pagination) - smooth loading
  useEffect(() => {
    if (selectedTenant) {
      // Skip if this is the initial load (debouncedSearch is undefined)
      if (debouncedSearch === undefined) {
        return;
      }

      // Trigger API call for any changes
      getMyInvoices(true);
    }
  }, [debouncedSearch, page, rowsPerPage, saleType, statusFilter, fromDate, toDate]);

  const handleButtonClick = async (invoice) => {
    try {
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "No Company selected",
          type: "error",
        });
        return;
      }

      // Get the auth token
      const token =
        localStorage.getItem("tenantToken") || localStorage.getItem("token");
      if (!token) {
        await showError({
          title: "Error",
          message: "Authentication token not found",
          type: "error",
        });
        return;
      }

      const link = `${apiKey}/print-invoice/${invoice.invoiceNumber}?tenantId=${selectedTenant.tenant_id}`;

      window.open(link, "_blank");
    } catch (error) {
      console.error("Error printing invoice:", error);
      await showErrorFromResponse(error);
    }
  };

  const handleViewInvoice = async (invoice) => {
    try {
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "No Company selected",
          type: "error",
        });
        return;
      }

      const response = await api.get(
        `/tenant/${selectedTenant.tenant_id}/invoices/${invoice.id}`
      );

      if (response.data.success) {
        setSelectedInvoice(response.data.data);
        setViewModalOpen(true);
      } else {
        console.error("Failed to fetch invoice:", response.data.message);
        await showError({
          title: "Error",
          message: "Failed to fetch invoice details",
          type: "error",
        });
      }
    } catch (error) {
      console.error("Error fetching invoice data:", error);
      await showErrorFromResponse(error);
    }
  };

  const handleEditInvoice = async (invoice) => {
    try {
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "No Company selected",
          type: "error",
        });
        return;
      }

      const response = await api.get(
        `/tenant/${selectedTenant.tenant_id}/invoices/${invoice.id}`
      );

      if (response.data.success) {
        setSelectedInvoice(response.data.data);

        if (invoice.status === "saved" || invoice.status === "draft") {
          // For saved and draft invoices, navigate to create form with data
          localStorage.setItem(
            "editInvoiceData",
            JSON.stringify(response.data.data)
          );
          navigate("/create-invoice");
        }
      } else {
        console.error("Failed to fetch invoice:", response.data.message);
        await showError({
          title: "Error",
          message: "Failed to fetch invoice details",
          type: "error",
        });
      }
    } catch (error) {
      console.error("Error fetching invoice data:", error);
      await showErrorFromResponse(error);
    }
  };

  // Product creation removed - only use existing products

  const handleBulkUpload = async (invoicesData, options = {}) => {
    const {
      onProgress = () => { },
      onChunkComplete = () => { },
      onError = () => { },
      chunkSize = 1000,
    } = options;

    try {
      // For large uploads, use streaming service
      if (invoicesData.length > 100) {
        const StreamingUploadService = (
          await import("../services/StreamingUploadService")
        ).default;

        const result = await StreamingUploadService.uploadInvoices(
          invoicesData,
          {
            tenantId: selectedTenant.tenant_id,
            chunkSize,
            onProgress,
            onChunkComplete,
            onError,
          }
        );

        if (result.success) {
          const { successfulInvoices, failedInvoices, errors, warnings } =
            result;

          if (failedInvoices > 0) {
            toast.warning(
              `Upload completed with issues: ${successfulInvoices} invoices added successfully, ${failedInvoices} invoices failed.`,
              {
                autoClose: 8000,
                closeOnClick: false,
                pauseOnHover: true,
              }
            );
            console.error("Upload errors:", errors);
          } else {
            getMyInvoices();
            toast.success(
              `Successfully uploaded ${successfulInvoices} invoices as drafts!`
            );
          }

          // Product creation removed - only use existing products

          return result;
        } else {
          throw new Error("Streaming upload failed");
        }
      } else {
        // For small uploads, use regular API
        const response = await api.post(
          `/tenant/${selectedTenant.tenant_id}/invoices/bulk`,
          { invoices: invoicesData, chunkSize }
        );

        if (response.data.success) {
          const { summary, errors, warnings } = response.data.data;

          if (summary.failed > 0) {
            toast.warning(
              `Upload completed with issues: ${summary.successful} invoices added successfully, ${summary.failed} invoices failed.`,
              {
                autoClose: 8000,
                closeOnClick: false,
                pauseOnHover: true,
              }
            );
            console.error("Upload errors:", errors);
          } else {
            getMyInvoices();
            toast.success(
              `Successfully uploaded ${summary.successful} invoices as drafts!`
            );
          }

          // Product creation removed - only use existing products

          return response.data;
        } else {
          throw new Error(response.data.message || "Upload failed");
        }
      }
    } catch (error) {
      console.error("Error in bulk upload:", error);
      await showErrorFromResponse(error);
      throw error;
    }
  };

  const handleDeleteClick = async (invoice) => {
    const result = await Swal.fire({
      title: "Are you sure you want to delete this invoice?",
      text: "You can recover it later from Audit Management.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      try {
        if (!selectedTenant) {
          await showError({
            title: "Error",
            message: "No Company selected",
            type: "error",
          });
          return;
        }

        const response = await api.delete(
          `/tenant/${selectedTenant.tenant_id}/invoices/${invoice.id}`
        );

        if (response.data.success) {
          Swal.fire(
            "Deleted!",
            "Invoice has been deleted successfully.",
            "success"
          );
          // Refresh the invoice list
          getMyInvoices();
        } else {
          console.error("Failed to delete invoice:", response.data.message);
          await showError({
            title: "Error",
            message: "Failed to delete invoice",
            type: "error",
          });
        }
      } catch (error) {
        console.error("Error deleting invoice:", error);
        await showErrorFromResponse(error);
      }
    }
  };

  // Handle Save and Validate for selected invoices
  const handleSaveAndValidate = async () => {
    setSaveValidateLoading(true);
    try {
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "Please select a Company before saving and validating invoices.",
          type: "error",
        });
        setSaveValidateLoading(false);
        return;
      }

      if (selectedInvoices.size === 0) {
        await showError({
          title: "Error",
          message: "Please select at least one invoice to save and validate.",
          type: "error",
        });
        setSaveValidateLoading(false);
        return;
      }

      // Get selected invoice details
      const selectedInvoiceDetails = filteredInvoices.filter((invoice) =>
        selectedInvoices.has(invoice._id || invoice.id)
      );

      // Process each selected invoice
      const results = [];
      for (const invoice of selectedInvoiceDetails) {
        try {
          // Get full invoice details
          const response = await api.get(
            `/tenant/${selectedTenant.tenant_id}/invoices/${invoice.id}`
          );

          if (response.data.success) {
            const invoiceData = response.data.data;

            // Clean the data for FBR validation (similar to createInvoiceForm.jsx)
            const cleanedItems = invoiceData.items.map(
              ({
                isSROScheduleEnabled,
                isSROItemEnabled,
                retailPrice,
                isValueSalesManual,
                isTotalValuesManual,
                isSalesTaxManual,
                isSalesTaxWithheldManual,
                isFurtherTaxManual,
                isFedPayableManual,
                ...rest
              }) => {
                // Special handling for uoM based on rate content
                let uoMValue = rest.uoM?.trim() || null;
                if (rest.rate && rest.rate.includes("/bill")) {
                  uoMValue = "Bill of lading";
                }
                if (rest.rate && rest.rate.includes("/SqY")) {
                  uoMValue = "SqY";
                }

                const baseItem = {
                  ...rest,
                  fixedNotifiedValueOrRetailPrice: Number(
                    Number(retailPrice || 0).toFixed(2)
                  ),
                  quantity:
                    rest.quantity === "" ? 0 : parseFloat(rest.quantity || 0),
                  unitPrice: Number(Number(rest.unitPrice || 0).toFixed(2)),
                  valueSalesExcludingST: Number(
                    Number(rest.valueSalesExcludingST || 0).toFixed(2)
                  ),
                  salesTaxApplicable:
                    Math.round(Number(rest.salesTaxApplicable || 0) * 100) /
                    100,
                  salesTaxWithheldAtSource: Number(
                    Number(rest.salesTaxWithheldAtSource || 0).toFixed(2)
                  ),
                  totalValues: Number(Number(rest.totalValues || 0).toFixed(2)),
                  sroScheduleNo: rest.sroScheduleNo?.trim() || null,
                  sroItemSerialNo: rest.sroItemSerialNo?.trim() || null,
                  uoM: uoMValue,
                  productDescription:
                    rest.productDescription?.replace(/\n/g, " ").trim() || null,
                  saleType:
                    rest.saleType?.trim() || "Goods at standard rate (default)",
                  furtherTax: Number(Number(rest.furtherTax || 0).toFixed(2)),
                  fedPayable: Number(Number(rest.fedPayable || 0).toFixed(2)),
                  discount: Number(Number(rest.discount || 0).toFixed(2)),
                };

                // Only include extraTax if saleType is NOT "Goods at Reduced Rate"
                if (rest.saleType?.trim() !== "Goods at Reduced Rate") {
                  baseItem.extraTax = Number(
                    Number(rest.extraTax || 0).toFixed(2)
                  );
                } else {
                  // For "Goods at Reduced Rate", send empty string instead of null
                  baseItem.extraTax = "";
                }

                return baseItem;
              }
            );

            const cleanedData = {
              ...invoiceData,
              buyerAddress: invoiceData.buyerAddress
                ? invoiceData.buyerAddress.replace(/\n/g, " ")
                : invoiceData.buyerAddress,
              invoiceDate: dayjs(invoiceData.invoiceDate).format("YYYY-MM-DD"),
              transctypeId: invoiceData.transctypeId,
              // scenarioId: "SN001", // Hardcoded SN001 for FBR validation
              items: cleanedItems,
            };

            // STEP 1: Hit FBR API through backend - validateinvoicedata
            const fbrValidateResponse = await api.post(
              `/tenant/${selectedTenant.tenant_id}/validate-invoice?environment=production`,
              cleanedData
            );

            // Handle different FBR response structures
            const validationData =
              fbrValidateResponse.data?.data || fbrValidateResponse.data;
            const hasValidationResponse =
              validationData && validationData.validationResponse;
            const isFbrSuccess =
              fbrValidateResponse.status === 200 &&
              (hasValidationResponse
                ? validationData.validationResponse.statusCode === "00"
                : true);

            if (!isFbrSuccess) {
              // If FBR validation fails, show detailed error
              let errorMessage = "Invoice validation with FBR failed.";
              let errorDetails = [];

              // Handle different error response structures
              if (hasValidationResponse) {
                const validation = validationData.validationResponse;
                if (validation.error) {
                  errorMessage = validation.error;
                }
                // Check for item-specific errors - structure as objects like createInvoiceForm.jsx
                if (
                  validation.invoiceStatuses &&
                  Array.isArray(validation.invoiceStatuses)
                ) {
                  validation.invoiceStatuses.forEach((status, index) => {
                    if (status.error) {
                      errorDetails.push({
                        item: status.itemSNo || index + 1,
                        error: status.error,
                      });
                    }
                  });
                }
              } else if (validationData?.error) {
                errorMessage = validationData.error;
              } else if (validationData?.message) {
                errorMessage = validationData.message;
              } else if (fbrValidateResponse.data?.message) {
                errorMessage = fbrValidateResponse.data.message;
              }

              // Check for additional error details in the response
              if (
                validationData?.invoiceStatuses &&
                Array.isArray(validationData.invoiceStatuses)
              ) {
                validationData.invoiceStatuses.forEach((status, index) => {
                  if (status.error) {
                    errorDetails.push({
                      item: status.itemSNo || index + 1,
                      error: status.error,
                    });
                  }
                });
              }

              results.push({
                invoiceNumber: invoice.invoiceNumber,
                status: "error",
                message: errorMessage,
                itemErrors: errorDetails.length > 0 ? errorDetails : undefined, // Store item errors separately
              });
              continue; // Skip to next invoice
            }

            // STEP 2: Hit Your Backend API Second - save-validate
            // Only proceed if FBR validation was successful
            const saveResponse = await api.post(
              `/tenant/${selectedTenant.tenant_id}/invoices/save-validate`,
              invoiceData
            );

            if (saveResponse.status === 201) {
              results.push({
                invoiceNumber: invoice.invoiceNumber,
                status: "success",
                message: `Invoice ${invoice.invoiceNumber} validated with FBR and saved successfully`,
              });
            } else {
              results.push({
                invoiceNumber: invoice.invoiceNumber,
                status: "error",
                message: "Failed to save invoice after FBR validation",
              });
            }
          } else {
            results.push({
              invoiceNumber: invoice.invoiceNumber,
              status: "error",
              message: "Failed to fetch invoice details",
            });
          }
        } catch (error) {
          console.error(
            `Error processing invoice ${invoice.invoiceNumber}:`,
            error
          );
          results.push({
            invoiceNumber: invoice.invoiceNumber,
            status: "error",
            message:
              error.message ||
              error.response?.data?.message ||
              "Error processing invoice",
            itemErrors: error.itemErrors || [], // Store item errors if present
          });
        }
      }

      // Show results
      const successful = results.filter((r) => r.status === "success");
      const failed = results.filter((r) => r.status === "error");

      if (failed.length === 0) {
        Swal.fire({
          icon: "success",
          title: "All Invoices Validated and Saved Successfully!",
          text: `${successful.length} invoices have been validated with FBR and saved successfully.`,
          confirmButtonColor: "#28a745",
        });
        setIsSubmitVisible(true);
        getMyInvoices(); // Refresh the list
      } else if (successful.length === 0) {
        // Flatten all errors including item-level errors
        const errorDetails = [];
        let generalMessage = "All selected invoices failed validation or saving.";
        
        failed.forEach((f) => {
          if (f.itemErrors && f.itemErrors.length > 0) {
            // If there are item-level errors, show each item error separately
            f.itemErrors.forEach((itemError) => {
              errorDetails.push({
                item: `Invoice ${f.invoiceNumber} - Item ${itemError.item}`,
                error: itemError.error,
              });
            });
            // Include general error message if available
            if (f.message && f.message !== "Invoice validation with FBR failed.") {
              generalMessage = f.message;
            }
          } else {
            // If no item errors, show invoice-level error
            errorDetails.push({
              item: f.invoiceNumber,
              error: f.message,
            });
          }
        });
        await showError({
          title: "All Invoices Failed to Validate and Save",
          message: generalMessage,
          details: errorDetails,
          type: "error",
          width: "700px",
        });
      } else {
        Swal.fire({
          icon: "warning",
          title: "Partial Success",
          text: `${successful.length} invoices validated with FBR and saved successfully. ${failed.length} invoices failed validation or saving.`,
          confirmButtonColor: "#ff9800",
        });
        setIsSubmitVisible(true);
        getMyInvoices(); // Refresh the list
      }
    } catch (error) {
      console.error("Save and Validate Error:", error);
      await showErrorFromResponse(error);
    } finally {
      setSaveValidateLoading(false);
    }
  };
  const handleBulkPrint = async () => {
    try {
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "No Company selected",
          type: "error",
        });
        return;
      }

      if (selectedInvoices.size === 0) {
        await showError({
          title: "Error",
          message: "Please select at least one invoice to print",
          type: "error",
        });
        return;
      }

      // Get the auth token
      const token =
        localStorage.getItem("tenantToken") || localStorage.getItem("token");
      if (!token) {
        await showError({
          title: "Error",
          message: "Authentication token not found",
          type: "error",
        });
        return;
      }

      // Get selected invoice details
      const selectedInvoiceDetails = filteredInvoices.filter((invoice) =>
        selectedInvoices.has(invoice._id || invoice.id)
      );

      console.log(
        `🖨️ Bulk Print: Generating single PDF with ${selectedInvoiceDetails.length} invoices`
      );
      console.log(
        "Selected invoices:",
        selectedInvoiceDetails.map((inv) => inv.invoiceNumber)
      );

      // Show loading message
      toast.info(
        `Generating PDF with ${selectedInvoiceDetails.length} invoice(s)...`,
        {
          autoClose: 3000,
        }
      );

      // Call bulk print API
      const response = await api.post(
        "/bulk-print-invoices",
        {
          invoiceNumbers: selectedInvoiceDetails.map(
            (inv) => inv.invoiceNumber
          ),
          tenantId: selectedTenant?.tenant_id,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          responseType: "blob", // Important for PDF download
        }
      );

      // Create blob and download
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bulk_invoices_${Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(
        `PDF generated with ${selectedInvoiceDetails.length} invoice(s)`
      );

      // Clear selection after printing
      setSelectedInvoices(new Set());
      setSelectMode(false);
    } catch (error) {
      console.error("Error generating bulk PDF:", error);
      await showErrorFromResponse(error);
    }
  };

  // Handle Submit for selected invoices
  const handleSubmit = async () => {
    setSubmitLoading(true);
    try {
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "Please select a Company before submitting invoices.",
          type: "error",
        });
        setSubmitLoading(false);
        return;
      }

      if (selectedInvoices.size === 0) {
        await showError({
          title: "Error",
          message: "Please select at least one invoice to submit.",
          type: "error",
        });
        setSubmitLoading(false);
        return;
      }

      // Get selected invoice details
      const selectedInvoiceDetails = filteredInvoices.filter((invoice) =>
        selectedInvoices.has(invoice._id || invoice.id)
      );

      // Process each selected invoice
      const results = [];
      for (const invoice of selectedInvoiceDetails) {
        try {
          // Get full invoice details
          const response = await api.get(
            `/tenant/${selectedTenant.tenant_id}/invoices/${invoice.id}`
          );

          if (response.data.success) {
            const invoiceData = response.data.data;

            // Clean the data for FBR submission (similar to createInvoiceForm.jsx)
            const cleanedItems = invoiceData.items.map(
              ({
                isSROScheduleEnabled,
                isSROItemEnabled,
                retailPrice,
                isValueSalesManual,
                isTotalValuesManual,
                isSalesTaxManual,
                isSalesTaxWithheldManual,
                isFurtherTaxManual,
                isFedPayableManual,
                ...rest
              }) => {
                // Special handling for uoM based on rate content
                let uoMValue = rest.uoM?.trim() || null;
                if (rest.rate && rest.rate.includes("/bill")) {
                  uoMValue = "Bill of lading";
                }
                if (rest.rate && rest.rate.includes("/SqY")) {
                  uoMValue = "SqY";
                }

                const baseItem = {
                  ...rest,
                  fixedNotifiedValueOrRetailPrice: Number(
                    Number(retailPrice || 0).toFixed(2)
                  ),
                  quantity:
                    rest.quantity === "" ? 0 : parseFloat(rest.quantity || 0),
                  unitPrice: Number(Number(rest.unitPrice || 0).toFixed(2)),
                  valueSalesExcludingST: Number(
                    Number(rest.valueSalesExcludingST || 0).toFixed(2)
                  ),
                  salesTaxApplicable:
                    Math.round(Number(rest.salesTaxApplicable || 0) * 100) /
                    100,
                  salesTaxWithheldAtSource: Number(
                    Number(rest.salesTaxWithheldAtSource || 0).toFixed(2)
                  ),
                  totalValues: Number(Number(rest.totalValues || 0).toFixed(2)),
                  sroScheduleNo: rest.sroScheduleNo?.trim() || null,
                  sroItemSerialNo: rest.sroItemSerialNo?.trim() || null,
                  uoM: uoMValue,
                  productDescription:
                    rest.productDescription?.replace(/\n/g, " ").trim() || null,
                  saleType:
                    rest.saleType?.trim() || "Goods at standard rate (default)",
                  furtherTax: Number(Number(rest.furtherTax || 0).toFixed(2)),
                  fedPayable: Number(Number(rest.fedPayable || 0).toFixed(2)),
                  discount: Number(Number(rest.discount || 0).toFixed(2)),
                };

                // Only include extraTax if saleType is NOT "Goods at Reduced Rate"
                if (rest.saleType?.trim() !== "Goods at Reduced Rate") {
                  baseItem.extraTax = Number(
                    Number(rest.extraTax || 0).toFixed(2)
                  );
                } else {
                  // For "Goods at Reduced Rate", send empty string instead of null
                  baseItem.extraTax = "";
                }

                return baseItem;
              }
            );

            const cleanedData = {
              ...invoiceData,
              buyerAddress: invoiceData.buyerAddress
                ? invoiceData.buyerAddress.replace(/\n/g, " ")
                : invoiceData.buyerAddress,
              invoiceDate: dayjs(invoiceData.invoiceDate).format("YYYY-MM-DD"),
              transctypeId: invoiceData.transctypeId,
              // scenarioId: "SN001",
              items: cleanedItems,
            };

            // Validate numeric fields before sending to FBR
            const validateNumericFields = (items) => {
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const numericFields = [
                  "quantity",
                  "unitPrice",
                  "valueSalesExcludingST",
                  "salesTaxApplicable",
                  "salesTaxWithheldAtSource",
                  "totalValues",
                  "furtherTax",
                  "fedPayable",
                  "discount",
                  "fixedNotifiedValueOrRetailPrice",
                ];

                for (const field of numericFields) {
                  if (item[field] !== null && item[field] !== undefined) {
                    const value = Number(item[field]);
                    if (isNaN(value) || value < 0) {
                      throw new Error(
                        `Item ${i + 1}: Invalid ${field} value. Must be a non-negative number.`
                      );
                    }
                  }
                }

                // Special validation for extraTax
                if (
                  item.extraTax !== null &&
                  item.extraTax !== undefined &&
                  item.extraTax !== ""
                ) {
                  const extraTaxValue = Number(item.extraTax);
                  if (isNaN(extraTaxValue) || extraTaxValue < 0) {
                    throw new Error(
                      `Item ${i + 1}: Invalid extraTax value. Must be a non-negative number.`
                    );
                  }
                }
              }
            };

            try {
              validateNumericFields(cleanedItems);
            } catch (validationError) {
              throw new Error(`Validation failed: ${validationError.message}`);
            }

            // STEP 1: Hit FBR API through backend
            const fbrResponse = await api.post(
              `/tenant/${selectedTenant.tenant_id}/submit-invoice?environment=production`,
              cleanedData
            );

            // Handle different FBR response structures
            let fbrInvoiceNumber = null;
            let isSuccess = false;
            let errorDetails = null;

            const responseData = fbrResponse.data?.data || fbrResponse.data;

            if (fbrResponse.status === 200) {
              // Check for validationResponse structure (old format)
              if (responseData && responseData.validationResponse) {
                const validation = responseData.validationResponse;
                isSuccess = validation.statusCode === "00";
                fbrInvoiceNumber = responseData.invoiceNumber;
                if (!isSuccess) {
                  errorDetails = validation;
                }
              }
              // Check for direct response structure (new format)
              else if (
                responseData &&
                (responseData.invoiceNumber || responseData.success)
              ) {
                isSuccess = true;
                fbrInvoiceNumber = responseData.invoiceNumber;
              }
              // Check for error response structure
              else if (responseData && responseData.error) {
                isSuccess = false;
                errorDetails = responseData;
              }
              // Check for empty response - this might be a successful submission
              else if (!responseData || responseData === "") {
                isSuccess = true;
                fbrInvoiceNumber = `FBR_${Date.now()}`;
              }
              // If response is unexpected, treat as success if status is 200
              else {
                isSuccess = true;
              }
            }

            if (!isSuccess) {
              const details = errorDetails || {
                raw: responseData ?? null,
                note: "Unexpected FBR response structure",
                status: fbrResponse.status,
              };

              // Collect item errors as objects like createInvoiceForm.jsx
              let errorMessage = "FBR submission failed";
              const itemErrors = [];

              if (details && typeof details === "object") {
                if (details.error) {
                  errorMessage = details.error;
                }
                // Check for item-specific errors in invoiceStatuses
                if (Array.isArray(details.invoiceStatuses)) {
                  details.invoiceStatuses.forEach((s, index) => {
                    if (s?.error) {
                      itemErrors.push({
                        item: s.itemSNo || index + 1,
                        error: s.error,
                      });
                    }
                  });
                }
                // Check for item-specific errors in validationResponse
                if (details.validationResponse) {
                  const v = details.validationResponse;
                  if (v?.error && !errorMessage.includes(v.error)) {
                    errorMessage = v.error;
                  }
                  if (Array.isArray(v?.invoiceStatuses)) {
                    v.invoiceStatuses.forEach((s, index) => {
                      if (s?.error) {
                        itemErrors.push({
                          item: s.itemSNo || index + 1,
                          error: s.error,
                        });
                      }
                    });
                  }
                }
              }

              // Store error with item errors separately
              throw {
                message: errorMessage,
                itemErrors: itemErrors,
                invoiceNumber: invoice.invoiceNumber,
              };
            }

            // Ensure we have a valid FBR invoice number
            if (!fbrInvoiceNumber || fbrInvoiceNumber.trim() === "") {
              throw new Error(
                "FBR submission failed: No invoice number received from FBR"
              );
            }

            // STEP 2: Hit Your Backend API Second
            // Prepare data for backend with FBR invoice number
            const backendData = {
              ...invoiceData, // Use original form data to preserve all fields
              invoiceDate: dayjs(invoiceData.invoiceDate).format("YYYY-MM-DD"),
              transctypeId: invoiceData.transctypeId,
              items: cleanedItems, // Use cleaned items for consistency
              fbr_invoice_number: fbrInvoiceNumber,
              status: "posted", // Set status as posted since it's been submitted to FBR
            };

            // Call backend API to save invoice
            const backendResponse = await api.post(
              `/tenant/${selectedTenant.tenant_id}/invoices`,
              backendData
            );

            if (backendResponse.status !== 200) {
              throw new Error(
                `Failed to save invoice to backend database. Status: ${backendResponse.status}`
              );
            }

            // STEP 3: Delete the saved invoice if it exists
            if (invoiceData.id) {
              try {
                const deleteResponse = await api.delete(
                  `/tenant/${selectedTenant.tenant_id}/invoices/${invoiceData.id}`
                );

                if (deleteResponse.status !== 200) {
                  // Failed to delete saved invoice, but submission was successful
                }
              } catch (deleteError) {
                // Error deleting saved invoice, but main submission was successful
              }
            }

            results.push({
              invoiceNumber: invoice.invoiceNumber,
              status: "success",
              message: `Invoice ${invoice.invoiceNumber} submitted successfully to FBR. FBR Invoice Number: ${fbrInvoiceNumber}`,
            });
          } else {
            results.push({
              invoiceNumber: invoice.invoiceNumber,
              status: "error",
              message: "Failed to fetch invoice details",
            });
          }
        } catch (error) {
          console.error(
            `Error processing invoice ${invoice.invoiceNumber}:`,
            error
          );
          results.push({
            invoiceNumber: invoice.invoiceNumber,
            status: "error",
            message:
              error.message ||
              error.response?.data?.message ||
              "Error processing invoice",
            itemErrors: error.itemErrors || [], // Store item errors if present
          });
        }
      }

      // Show results
      const successful = results.filter((r) => r.status === "success");
      const failed = results.filter((r) => r.status === "error");

      if (failed.length === 0) {
        Swal.fire({
          icon: "success",
          title: "All Invoices Submitted Successfully!",
          text: `${successful.length} invoices have been submitted to FBR.`,
          confirmButtonColor: "#28a745",
        });
        getMyInvoices(); // Refresh the list
        setSelectedInvoices(new Set()); // Clear selection
        setSelectMode(false); // Exit select mode
      } else if (successful.length === 0) {
        // Flatten all errors including item-level errors
        const errorDetails = [];
        let generalMessage = "All selected invoices failed to submit.";
        
        failed.forEach((f) => {
          if (f.itemErrors && f.itemErrors.length > 0) {
            // If there are item-level errors, show each item error separately
            f.itemErrors.forEach((itemError) => {
              errorDetails.push({
                item: `Invoice ${f.invoiceNumber} - Item ${itemError.item}`,
                error: itemError.error,
              });
            });
            // Include general error message if available
            if (f.message && f.message !== "FBR submission failed") {
              generalMessage = f.message;
            }
          } else {
            // If no item errors, show invoice-level error
            errorDetails.push({
              item: f.invoiceNumber,
              error: f.message,
            });
          }
        });
        await showError({
          title: "All Invoices Failed to Submit",
          message: generalMessage,
          details: errorDetails,
          type: "error",
          width: "700px",
        });
      } else {
        Swal.fire({
          icon: "warning",
          title: "Partial Success",
          text: `${successful.length} invoices submitted successfully. ${failed.length} invoices failed.`,
          confirmButtonColor: "#ff9800",
        });
        getMyInvoices(); // Refresh the list
      }
    } catch (error) {
      console.error("Submit Error:", error);
      await showErrorFromResponse(error);
    } finally {
      setSubmitLoading(false);
    }
  };

  // Since we're using server-side pagination, we don't need client-side filtering
  // The server handles all filtering and pagination
  const filteredInvoices = invoices || [];

  // Handle individual checkbox selection
  const handleRowSelection = (invoiceId) => {
    const newSelected = new Set(selectedInvoices);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoices(newSelected);
    // Reset submit visibility when selection changes
    setIsSubmitVisible(false);
  };

  // Handle select all functionality
  const handleSelectAll = () => {
    if (selectedInvoices.size === filteredInvoices.length) {
      // If all are selected, unselect all
      setSelectedInvoices(new Set());
    } else {
      // Select all
      const allIds = filteredInvoices.map(
        (invoice) => invoice._id || invoice.id
      );
      setSelectedInvoices(new Set(allIds));
    }
    // Reset submit visibility when selection changes
    setIsSubmitVisible(false);
  };

  // Toggle select mode
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    if (selectMode) {
      setSelectedInvoices(new Set());
      setIsSubmitVisible(false); // Reset submit visibility when exiting select mode
    }
  };

  // Bulk delete selected invoices (only draft/saved)
  const handleBulkDelete = async () => {
    try {
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "Please select a Company before deleting invoices.",
          type: "error",
        });
        return;
      }

      if (selectedInvoices.size === 0) {
        await showError({
          title: "Error",
          message: "Please select at least one invoice to delete.",
          type: "error",
        });
        return;
      }

      const selectedInvoiceDetails = filteredInvoices.filter((invoice) =>
        selectedInvoices.has(invoice._id || invoice.id)
      );

      const nonDeletable = selectedInvoiceDetails.filter(
        (inv) => inv.status !== "draft" && inv.status !== "saved"
      );

      if (nonDeletable.length > 0) {
        Swal.fire({
          icon: "warning",
          title: "Some invoices cannot be deleted",
          text: "Only Draft or Saved invoices can be deleted. Please adjust your selection.",
          confirmButtonColor: "#ff9800",
        });
        return;
      }

      const result = await Swal.fire({
        title: "Delete Selected Invoices",
        text: "You can recover these invoices later from Audit Management.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, delete",
        cancelButtonText: "Cancel",
        reverseButtons: true,
      });

      if (!result.isConfirmed) return;

      setBulkDeleteLoading(true);

      const results = [];
      for (const inv of selectedInvoiceDetails) {
        try {
          const response = await api.delete(
            `/tenant/${selectedTenant.tenant_id}/invoices/${inv.id}`
          );
          if (response.data.success) {
            results.push({
              invoiceNumber: inv.invoiceNumber,
              status: "success",
            });
          } else {
            results.push({
              invoiceNumber: inv.invoiceNumber,
              status: "error",
              message: response.data.message || "Failed",
            });
          }
        } catch (err) {
          results.push({
            invoiceNumber: inv.invoiceNumber,
            status: "error",
            message: err.response?.data?.message || err.message || "Error",
          });
        }
      }

      const success = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "error");

      if (failed.length === 0) {
        Swal.fire({
          icon: "success",
          title: "Deleted",
          text: `${success} invoice(s) deleted successfully.`,
          confirmButtonColor: "#28a745",
        });
      } else if (success === 0) {
        const errorDetails = failed.map((f) => ({
          item: f.invoiceNumber,
          error: f.message || "Failed to delete",
        }));
        await showError({
          title: "Deletion Failed",
          message: "All selected invoices failed to delete.",
          details: errorDetails,
          type: "error",
          width: "700px",
        });
      } else {
        Swal.fire({
          icon: "warning",
          title: "Partial Delete",
          text: `${success} invoice(s) deleted. ${failed.length} failed.`,
          confirmButtonColor: "#ff9800",
        });
      }

      // Refresh and reset selection
      await getMyInvoices();
      setSelectedInvoices(new Set());
      setSelectMode(false);
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  return (
    <>
      {!selectedTenant ? (
        <Box
          sx={{
            textAlign: "center",
            p: 4,
            height: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.palette.background.default,
          }}
        >
          <Typography variant="h5" color="text.secondary" gutterBottom>
            No Company Selected
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Please select a Company to view invoices.
          </Typography>
        </Box>
      ) : loading ? (
        <Box sx={{ p: { xs: 1, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
          {/* Header Section Skeleton */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 3,
            }}
          >
            <Skeleton variant="text" width={200} height={40} />
          </Box>

          {/* Search and Filter Controls Skeleton */}
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <Skeleton variant="rounded" width={260} height={40} />
            <Skeleton variant="rounded" width={160} height={40} />
            <Skeleton variant="rounded" width={140} height={40} />
            <Skeleton variant="rounded" width={140} height={40} />
            <Skeleton variant="rounded" width={120} height={40} />
          </Box>

          {/* Table Skeleton */}
          <TableContainer
            component={Paper}
            elevation={4}
            sx={{
              borderRadius: 3,
              overflow: "hidden",
              boxShadow: 4,
            }}
          >
            <Table
              size="small"
              sx={{
                minWidth: 650,
                "& .MuiTableCell-root": { py: 1.9, px: 1, fontSize: 12 },
                "& .MuiTableCell-head": {
                  py: 0.75,
                  fontSize: 13,
                  fontWeight: 700,
                },
              }}
            >
              <TableHead>
                <TableRow sx={{ background: "#EDEDED" }}>
                  {[...Array(10)].map((_, index) => (
                    <TableCell key={index}>
                      <Skeleton variant="text" width={80} height={20} />
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[...Array(5)].map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {[...Array(10)].map((_, colIndex) => (
                      <TableCell key={`${rowIndex}-${colIndex}`}>
                        <Skeleton
                          variant="text"
                          width={colIndex === 9 ? 120 : 100}
                          height={16}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination Skeleton */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 2,
            }}
          >
            <Skeleton variant="text" width={200} height={20} />
            <Skeleton variant="rounded" width={300} height={32} />
          </Box>
        </Box>
      ) : (
        <Box sx={{ p: { xs: 1, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
          {/* Header Section */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              mb: 3,
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 600,
                letterSpacing: 1,
                textShadow: "0 2px 8px #e3e3e3",
              }}
            >
              Your Invoices
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={toggleSelectMode}
                sx={{ minWidth: 80 }}
              >
                {selectMode ? "Cancel" : "Select"}
              </Button>

              <PermissionGate permission="invoice_uploader">
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<CloudUploadIcon />}
                  onClick={() => setUploaderOpen(true)}
                >
                  Bulk Upload CSV/Excel
                </Button>
              </PermissionGate>
            </Box>
          </Box>

          {/* Selection Info */}
          {selectMode && (
            <Box
              sx={{
                mb: 2,
                p: 2,
                bgcolor: "primary.light",
                borderRadius: 1,
                color: "white",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Typography variant="body2">
                  {selectedInvoices.size} of {filteredInvoices.length} invoices
                  selected
                </Typography>
                {selectedInvoices.size > 0 && (
                  <Box sx={{ display: "flex", gap: 1 }}>
                    {/* Check if any selected invoice has posted status */}
                    {(() => {
                      const hasPostedInvoices = filteredInvoices
                        .filter((invoice) =>
                          selectedInvoices.has(invoice._id || invoice.id)
                        )
                        .some((invoice) => invoice.status === "posted");

                      return (
                        <>
                          <PermissionGate permission="invoice.delete">
                            <Tooltip
                              title={
                                hasPostedInvoices
                                  ? "You have selected posted invoices. Unselect them to proceed."
                                  : ""
                              }
                              placement="top"
                              arrow
                            >
                              <span>
                                <Button
                                  onClick={handleBulkDelete}
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  sx={{
                                    borderRadius: 1.5,
                                    fontWeight: 600,
                                    px: 1.5,
                                    py: 0.3,
                                    fontSize: 11,
                                    letterSpacing: 0.3,
                                    boxShadow: 1,
                                    transition: "all 0.2s",
                                    minWidth: "auto",
                                    bgcolor: "white",
                                    color: hasPostedInvoices
                                      ? "#ccc"
                                      : "#d32f2f",
                                    borderColor: hasPostedInvoices
                                      ? "#ccc"
                                      : "#d32f2f",
                                    "&:hover": {
                                      background: hasPostedInvoices
                                        ? "transparent"
                                        : "#d32f2f",
                                      color: hasPostedInvoices
                                        ? "#ccc"
                                        : "white",
                                      boxShadow: hasPostedInvoices ? 1 : 2,
                                      borderColor: hasPostedInvoices
                                        ? "#ccc"
                                        : "#d32f2f",
                                    },
                                  }}
                                  disabled={
                                    bulkDeleteLoading || hasPostedInvoices
                                  }
                                >
                                  {bulkDeleteLoading ? (
                                    <CircularProgress
                                      size={16}
                                      color="inherit"
                                    />
                                  ) : (
                                    "Delete Selected"
                                  )}
                                </Button>
                              </span>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate permission="invoice.view">
                            <Tooltip
                              title="Print Selected Invoices as PDF"
                              placement="top"
                              arrow
                            >
                              <span>
                                <Button
                                  onClick={handleBulkPrint}
                                  variant="outlined"
                                  color="info"
                                  size="small"
                                  startIcon={<PrintIcon />}
                                  sx={{
                                    borderRadius: 1.5,
                                    fontWeight: 600,
                                    px: 1.5,
                                    py: 0.3,
                                    fontSize: 11,
                                    letterSpacing: 0.3,
                                    boxShadow: 1,
                                    transition: "all 0.2s",
                                    minWidth: "auto",
                                    bgcolor: "white",
                                    color: "#1976d2",
                                    borderColor: "#1976d2",
                                    "&:hover": {
                                      background: "#1976d2",
                                      color: "white",
                                      boxShadow: 2,
                                      borderColor: "#1976d2",
                                    },
                                  }}
                                >
                                  Print Selected
                                </Button>
                              </span>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate permission="invoice_validate">
                            <Tooltip
                              title={
                                hasPostedInvoices
                                  ? "You have selected posted invoices. Unselect them to proceed."
                                  : ""
                              }
                              placement="top"
                              arrow
                            >
                              <span>
                                <Button
                                  onClick={handleSaveAndValidate}
                                  variant="outlined"
                                  color="warning"
                                  size="small"
                                  sx={{
                                    borderRadius: 1.5,
                                    fontWeight: 600,
                                    px: 1.5,
                                    py: 0.3,
                                    fontSize: 11,
                                    letterSpacing: 0.3,
                                    boxShadow: 1,
                                    transition: "all 0.2s",
                                    minWidth: "auto",
                                    bgcolor: "white",
                                    color: hasPostedInvoices
                                      ? "#ccc"
                                      : "#f57c00",
                                    borderColor: hasPostedInvoices
                                      ? "#ccc"
                                      : "#f57c00",
                                    "&:hover": {
                                      background: hasPostedInvoices
                                        ? "transparent"
                                        : "#f57c00",
                                      color: hasPostedInvoices
                                        ? "#ccc"
                                        : "white",
                                      boxShadow: hasPostedInvoices ? 1 : 2,
                                      borderColor: hasPostedInvoices
                                        ? "#ccc"
                                        : "#f57c00",
                                    },
                                  }}
                                  disabled={
                                    saveValidateLoading || hasPostedInvoices
                                  }
                                >
                                  {saveValidateLoading ? (
                                    <CircularProgress
                                      size={16}
                                      color="inherit"
                                    />
                                  ) : (
                                    "Save & Validate"
                                  )}
                                </Button>
                              </span>
                            </Tooltip>
                          </PermissionGate>
                          {isSubmitVisible && (
                            <Tooltip
                              title={
                                hasPostedInvoices
                                  ? "You have selected posted invoices. Unselect them to proceed."
                                  : ""
                              }
                              placement="top"
                              arrow
                            >
                              <span>
                                <Button
                                  onClick={handleSubmit}
                                  variant="contained"
                                  size="small"
                                  sx={{
                                    background: hasPostedInvoices
                                      ? "#ccc"
                                      : "#2E7D32",
                                    borderRadius: 1.5,
                                    fontWeight: 600,
                                    px: 1.5,
                                    py: 0.3,
                                    fontSize: 11,
                                    letterSpacing: 0.3,
                                    boxShadow: 1,
                                    transition: "background 0.2s",
                                    minWidth: "auto",
                                    "&:hover": {
                                      background: hasPostedInvoices
                                        ? "#ccc"
                                        : "#256e2b",
                                    },
                                  }}
                                  disabled={submitLoading || hasPostedInvoices}
                                >
                                  {submitLoading ? (
                                    <CircularProgress
                                      size={16}
                                      color="inherit"
                                    />
                                  ) : (
                                    "Submit"
                                  )}
                                </Button>
                              </span>
                            </Tooltip>
                          )}
                        </>
                      );
                    })()}
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* Search and Filter Controls */}
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <TextField
              variant="outlined"
              size="small"
              placeholder="Search by Invoice #, Company Invoice #, or Buyer NTN"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: (isTyping || searchLoading) && (
                  <InputAdornment position="end">
                    {isTyping ? (
                      <Box
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          border: "2px solid #ccc",
                          borderTop: "2px solid #1976d2",
                          animation: "spin 1s linear infinite",
                          "@keyframes spin": {
                            "0%": { transform: "rotate(0deg)" },
                            "100%": { transform: "rotate(360deg)" },
                          },
                        }}
                      />
                    ) : (
                      <CircularProgress size={16} />
                    )}
                  </InputAdornment>
                ),
              }}
              sx={{
                minWidth: 260,
                "& .MuiOutlinedInput-root": {
                  borderRadius: "8px",
                },
                "& input::placeholder": {
                  fontSize: "0.8rem",
                  opacity: 1,
                },
              }}
            />
            <TextField
              select
              label="Sale Type"
              size="small"
              value={saleType}
              onChange={(e) => {
                setSaleType(e.target.value);
                setPage(1);
              }}
              InputProps={{
                endAdornment: searchLoading && (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="All">All</MenuItem>
              <MenuItem value="Sale Invoice">Sale Invoice</MenuItem>
              <MenuItem value="Debit Note">Debit Note</MenuItem>
            </TextField>
            <TextField
              select
              label="Status"
              size="small"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              InputProps={{
                endAdornment: searchLoading && (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="All">All Status</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="saved">Saved</MenuItem>
              <MenuItem value="posted">Posted</MenuItem>
            </TextField>

            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="From Date"
                value={fromDate}
                onChange={(val) => {
                  setFromDate(val);
                  setPage(1);
                }}
                slotProps={{
                  textField: {
                    size: "small",
                    sx: { minWidth: 140 },
                    InputProps: {
                      endAdornment: searchLoading && (
                        <InputAdornment position="end">
                          <CircularProgress size={16} />
                        </InputAdornment>
                      ),
                    },
                  },
                }}
              />
              <DatePicker
                label="To Date"
                value={toDate}
                onChange={(val) => {
                  setToDate(val);
                  setPage(1);
                }}
                slotProps={{
                  textField: {
                    size: "small",
                    sx: { minWidth: 140 },
                    InputProps: {
                      endAdornment: searchLoading && (
                        <InputAdornment position="end">
                          <CircularProgress size={16} />
                        </InputAdornment>
                      ),
                    },
                  },
                }}
              />
            </LocalizationProvider>
            <TextField
              select
              label="Rows per page"
              size="small"
              value={rowsPerPage}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "All") {
                  setRowsPerPage("All");
                } else {
                  setRowsPerPage(Number(value));
                }
                setPage(1);
              }}
              InputProps={{
                endAdornment: searchLoading && (
                  <InputAdornment position="end">
                    <CircularProgress size={16} />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 120 }}
            >
              {[5, 10, 20, 50, "All"].map((num) => (
                <MenuItem key={num} value={num}>
                  {num}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Empty State */}
          {filteredInvoices.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8, color: "#90a4ae" }}>
              <SentimentDissatisfiedIcon sx={{ fontSize: 60, mb: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No invoices found
              </Typography>
              <Typography variant="body2">
                Try adjusting your search or filter criteria.
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer
                component={Paper}
                elevation={4}
                sx={{
                  borderRadius: 3,
                  overflow: "hidden",
                  boxShadow: 4,
                  position: "relative",
                  opacity: searchLoading ? 0.7 : 1,
                  transition: "opacity 0.3s ease",
                }}
              >
                <Table
                  size="small"
                  sx={{
                    minWidth: 650,
                    "& .MuiTableCell-root": { py: 1.9, px: 1, fontSize: 12 },
                    "& .MuiTableCell-head": {
                      py: 0.75,
                      fontSize: 13,
                      fontWeight: 700,
                    },
                  }}
                  aria-label="invoice table"
                >
                  <TableHead>
                    <TableRow
                      sx={{
                        background: "#EDEDED",
                      }}
                    >
                      {selectMode && (
                        <TableCell
                          align="center"
                          sx={{
                            fontWeight: "bold",
                            fontSize: 13,
                            letterSpacing: 0.3,
                            width: 50,
                          }}
                        >
                          <Checkbox
                            checked={
                              selectedInvoices.size ===
                              filteredInvoices.length &&
                              filteredInvoices.length > 0
                            }
                            indeterminate={
                              selectedInvoices.size > 0 &&
                              selectedInvoices.size < filteredInvoices.length
                            }
                            onChange={handleSelectAll}
                            size="small"
                          />
                        </TableCell>
                      )}
                      {[
                        "S.No",
                        "System ID",
                        "Invoice Number",
                        "Company Invoice #",
                        "Invoice Date",
                        "Invoice Type",
                        "Buyer",
                        "Buyer NTN",
                        "Product Description",
                        ...(isAdmin ? ["Created By"] : []),
                        "Actions",
                      ].map((heading) => (
                        <TableCell
                          key={heading}
                          align={
                            heading === "S.No" ||
                              heading === "System ID" ||
                              heading === "Invoice Number" ||
                              heading === "Company Invoice #" ||
                              heading === "Invoice Date"
                              ? "left"
                              : "center"
                          }
                          sx={{
                            fontWeight: "bold",
                            fontSize: 13,
                            letterSpacing: 0.3,
                            cursor:
                              heading === "Company Invoice #" ||
                                heading === "Invoice Date"
                                ? "pointer"
                                : "default",
                            "&:hover":
                              heading === "Company Invoice #" ||
                                heading === "Invoice Date"
                                ? {
                                  backgroundColor: "#f5f5f5",
                                }
                                : {},
                          }}
                          onClick={
                            heading === "Company Invoice #"
                              ? () => handleSort("companyInvoiceRefNo")
                              : heading === "Invoice Date"
                                ? () => handleSort("created_at")
                                : undefined
                          }
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            {heading}
                            {heading === "Company Invoice #" && (
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "column",
                                  fontSize: "10px",
                                }}
                              >
                                {sortBy === "companyInvoiceRefNo"
                                  ? sortOrder === "ASC"
                                    ? "↑"
                                    : "↓"
                                  : ""}
                              </Box>
                            )}
                            {heading === "Invoice Date" && (
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "column",
                                  fontSize: "10px",
                                }}
                              >
                                {sortBy === "created_at"
                                  ? sortOrder === "ASC"
                                    ? "↑"
                                    : "↓"
                                  : ""}
                              </Box>
                            )}
                          </Box>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {filteredInvoices.map((row, index) => (
                      <TableRow
                        key={row._id || index}
                        sx={{
                          "&:hover": {
                            backgroundColor: "#EDEDED",
                            transition: "background-color 0.3s",
                          },
                        }}
                      >
                        {selectMode && (
                          <TableCell
                            align="center"
                            sx={{
                              width: 50,
                            }}
                          >
                            <Checkbox
                              checked={selectedInvoices.has(row._id || row.id)}
                              onChange={() =>
                                handleRowSelection(row._id || row.id)
                              }
                              size="small"
                            />
                          </TableCell>
                        )}
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: "#666",
                          }}
                        >
                          {rowsPerPage === "All"
                            ? index + 1
                            : (page - 1) * rowsPerPage + index + 1}
                        </TableCell>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: "#1976d2",
                          }}
                        >
                          {row.systemInvoiceId || "N/A"}
                        </TableCell>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            {row.invoiceNumber}
                            <Tooltip title="Copy Invoice Number">
                              <Button
                                variant="text"
                                size="small"
                                onClick={() => {
                                  navigator.clipboard.writeText(
                                    row.invoiceNumber
                                  );
                                  toast.success(
                                    `Invoice Number "${row.invoiceNumber}" copied to clipboard.`,
                                    {
                                      autoClose: 3000,
                                      closeOnClick: false,
                                      pauseOnHover: true,
                                    }
                                  );
                                }}
                                sx={{
                                  minWidth: "24px",
                                  width: "24px",
                                  height: "24px",
                                  p: 0,
                                  color: "#607d8b",
                                  "&:hover": {
                                    color: "#1976d2",
                                  },
                                }}
                              >
                                <ContentCopyIcon fontSize="10px" />
                              </Button>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{ fontWeight: 500 }}
                        >
                          {row.companyInvoiceRefNo || "N/A"}
                        </TableCell>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{ fontWeight: 500 }}
                        >
                          {formatDate(row.invoiceDate)}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 500 }}>
                          {row.invoiceType || "N/A"}
                        </TableCell>
                        <TableCell align="center">
                          <Box
                            sx={{
                              fontWeight: 500,
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              justifyContent: "center",
                            }}
                          >
                            <Box>{row.buyerBusinessName || "N/A"}</Box>
                            <Tooltip
                              title={getStatusText(row.status)}
                              placement="top"
                              arrow
                            >
                              <Box
                                component="span"
                                bgcolor={getStatusColor(row.status)}
                                sx={{
                                  width: "10px",
                                  height: "10px",
                                  borderRadius: "50%",
                                  display: "inline-block",
                                }}
                              ></Box>
                            </Tooltip>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Box sx={{ fontWeight: 500 }}>
                            {row.buyerNTNCNIC || "N/A"}
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          {row.items && row.items.length > 0
                            ? row.items
                              .map((item) => item.productDescription || "N/A")
                              .join(", ")
                            : "N/A"}
                        </TableCell>
                        {isAdmin && (
                          <TableCell align="center" sx={{ fontWeight: 500 }}>
                            {row.created_by_name
                              ? `${row.created_by_name} (${row.created_by_user_id || ""})`
                              : row.created_by_email || "-"}
                          </TableCell>
                        )}
                        <TableCell align="center">
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "center",
                              gap: 1,
                            }}
                          >
                            {/* Print button for all invoice statuses */}
                            <Tooltip
                              title={`Print ${row.status === "posted" ? "Invoice" : row.status === "draft" ? "Draft Invoice" : "Saved Invoice"}`}
                            >
                              <Button
                                variant="outlined"
                                color={
                                  row.status === "posted" ? "success" : "info"
                                }
                                size="small"
                                onClick={() => handleButtonClick(row)}
                                sx={{
                                  minWidth: "32px",
                                  width: "32px",
                                  height: "32px",
                                  p: 0,
                                  "&:hover": {
                                    backgroundColor:
                                      row.status === "posted"
                                        ? "success.main"
                                        : "info.main",
                                    color:
                                      row.status === "posted"
                                        ? "success.contrastText"
                                        : "info.contrastText",
                                    borderColor:
                                      row.status === "posted"
                                        ? "success.main"
                                        : "info.main",
                                  },
                                }}
                              >
                                <PrintIcon fontSize="small" />
                              </Button>
                            </Tooltip>
                            <Tooltip title="View Invoice Details">
                              <Button
                                variant="outlined"
                                color="primary"
                                size="small"
                                onClick={() => handleViewInvoice(row)}
                                sx={{
                                  minWidth: "32px",
                                  width: "32px",
                                  height: "32px",
                                  p: 0,
                                  "&:hover": {
                                    backgroundColor: "primary.main",
                                    color: "primary.contrastText",
                                    borderColor: "primary.main",
                                  },
                                }}
                              >
                                <VisibilityIcon fontSize="small" />
                              </Button>
                            </Tooltip>
                            {(row.status === "draft" ||
                              row.status === "saved") && (
                                <>
                                  <PermissionGate permission="invoice.update">
                                    <Tooltip
                                      title={`Edit ${row.status === "draft" ? "Draft" : "Saved"} Invoice`}
                                    >
                                      <Button
                                        variant="outlined"
                                        color="warning"
                                        size="small"
                                        onClick={() => handleEditInvoice(row)}
                                        sx={{
                                          minWidth: "32px",
                                          width: "32px",
                                          height: "32px",
                                          p: 0,
                                          "&:hover": {
                                            backgroundColor: "warning.main",
                                            color: "warning.contrastText",
                                            borderColor: "warning.main",
                                          },
                                        }}
                                      >
                                        <EditIcon fontSize="small" />
                                      </Button>
                                    </Tooltip>
                                  </PermissionGate>
                                  <PermissionGate permission="invoice.delete">
                                    <Tooltip title="Delete Invoice">
                                      <Button
                                        variant="outlined"
                                        color="error"
                                        size="small"
                                        onClick={() => handleDeleteClick(row)}
                                        sx={{
                                          minWidth: "32px",
                                          width: "32px",
                                          height: "32px",
                                          p: 0,
                                          "&:hover": {
                                            backgroundColor: "error.main",
                                            color: "error.contrastText",
                                            borderColor: "error.main",
                                          },
                                        }}
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </Button>
                                    </Tooltip>
                                  </PermissionGate>
                                </>
                              )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {/* Pagination Controls */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {rowsPerPage === "All"
                    ? `Showing all ${totalRecords} invoices`
                    : `Showing ${(page - 1) * rowsPerPage + 1} to ${Math.min(page * rowsPerPage, totalRecords)} of ${totalRecords} invoices`}
                </Typography>
                {rowsPerPage !== "All" && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CustomPagination
                      count={totalPages}
                      page={page}
                      onChange={(_, value) => setPage(value)}
                      showFirstButton
                      showLastButton
                      size="small"
                    />
                  </Box>
                )}
              </Box>
            </>
          )}

          {/* Invoice View Modal */}
          <InvoiceViewModal
            open={viewModalOpen}
            onClose={() => setViewModalOpen(false)}
            invoice={selectedInvoice}
            onPrint={() => {
              if (selectedInvoice) {
                handleButtonClick(selectedInvoice);
              }
            }}
          />

          {/* Invoice Uploader Modal */}
          <InvoiceUploader
            isOpen={uploaderOpen}
            onClose={() => setUploaderOpen(false)}
            onUpload={handleBulkUpload}
            selectedTenant={selectedTenant}
          />
        </Box>
      )}
    </>
  );
}
