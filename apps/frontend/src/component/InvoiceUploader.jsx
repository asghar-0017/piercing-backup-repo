import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Link,
  LinearProgress,
} from "@mui/material";
import {
  CloudUpload,
  FileUpload,
  Delete,
  Visibility,
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  Download,
  Info,
  Cancel,
  Close,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import { api } from "../API/Api";
import * as XLSX from "xlsx";
import { useFileProcessor } from "../hooks/useFileProcessor";
import { useStreamingUpload } from "../hooks/useStreamingUpload";

const FUTURE_DATE_ERROR_MESSAGE =
  "Invoice date exceeds the current date. Please select today or a past date.";

const COMPANY_INVOICE_REF_NO_REQUIRED_MESSAGE =
  "companyInvoiceRefNo must be required";

const isCompanyInvoiceRefNoMissing = (refNo) => {
  const trimmed = String(refNo ?? "").trim();
  if (!trimmed) return true;
  return /^row_\d+$/i.test(trimmed);
};

const showCompanyInvoiceRefNoRequired = () =>
  Swal.fire({
    icon: "error",
    title: "Required Field",
    text: COMPANY_INVOICE_REF_NO_REQUIRED_MESSAGE,
    confirmButtonColor: "#d33",
  });

const convertExcelDateToYYYYMMDD = (excelDate) => {
  if (!excelDate || excelDate === "") return "";

  // Helper to format Date object to YYYY-MM-DD string
  const toLocalYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Helper to process Excel Serial Date (Number)
  const processExcelSerial = (serial) => {
    if (serial < 1000) return ""; // Ignore small numbers that are likely not dates
    // Set time to NOON (12:00) to avoid DST/Timezone shifts
    const excelEpoch = new Date(1900, 0, 1, 12, 0, 0);
    let daysToAdd = serial - 1;
    // Adjust for Excel's leap year bug (1900 is not a leap year)
    if (serial > 59) {
      daysToAdd = daysToAdd - 1;
    }
    const date = new Date(
      excelEpoch.getTime() + daysToAdd * 24 * 60 * 60 * 1000,
    );
    return toLocalYYYYMMDD(date);
  };

  // 1. Handle actual Number type
  if (typeof excelDate === "number") {
    return processExcelSerial(excelDate);
  }

  // 2. Handle String type
  if (typeof excelDate === "string") {
    // Trim whitespace and remove invisible characters
    const cleanedDate = excelDate.trim();

    // 2a. Check if it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate)) {
      return cleanedDate;
    }

    // 2b. Check if it looks like a number (integer or float)
    // Matches: "45658", "45658.0", "45658.123"
    if (/^-?\d+(\.\d+)?$/.test(cleanedDate)) {
      const numericValue = parseFloat(cleanedDate);
      if (!isNaN(numericValue)) {
        return processExcelSerial(numericValue);
      }
    }

    // 2c. Handle standard date separators (slash/dash)
    if (cleanedDate.includes("/") || cleanedDate.includes("-")) {
      const parts = cleanedDate.split(/[\/\-]/);
      if (parts.length === 3) {
        // Try MM/DD/YYYY format first (US format)
        let month = parseInt(parts[0], 10);
        let day = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);

        // Check if it is YYYY/MM/DD or YYYY-MM-DD
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        }
        // Logic to disambiguate DD/MM/YYYY vs MM/DD/YYYY
        else if (month <= 12 && day <= 12) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const dateMMDD = new Date(year, month - 1, day);
          const dateDDMM = new Date(year, day - 1, month);

          const isFutureMMDD = dateMMDD.getTime() > today.getTime();
          const isFutureDDMM = dateDDMM.getTime() > today.getTime();

          // If MM/DD is Future but DD/MM is Not Future, assume DD/MM
          if (isFutureMMDD && !isFutureDDMM) {
            [month, day] = [day, month];
          }
        }
        // If month > 12, it must be DD/MM/YYYY format
        else if (month > 12 && day <= 12) {
          [month, day] = [day, month];
        }

        // Validate range
        if (
          month >= 1 &&
          month <= 12 &&
          day >= 1 &&
          day <= 31 &&
          year >= 1900 &&
          year <= 2100
        ) {
          return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        }
      }
    }

    // 2d. Fallback for text formats (e.g. "Jan 1, 2025")
    // STRICTLY BLOCK plain numbers from reaching this to avoid Year 45658 issue
    // Only proceed if it contains letters or separators
    if (
      /[a-zA-Z]/.test(cleanedDate) ||
      cleanedDate.includes("/") ||
      cleanedDate.includes("-") ||
      cleanedDate.includes(",")
    ) {
      const date = new Date(cleanedDate);
      if (!isNaN(date.getTime())) {
        return toLocalYYYYMMDD(date);
      }
    }
  }

  return "";
};

const isFutureDate = (value) => {
  if (!value) return false;

  let date;
  // Handle YYYY-MM-DD explicitly to avoid timezone issues with new Date(string)
  // new Date("YYYY-MM-DD") parses as UTC, which can shift the date when converted to local time
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    // Create date in local time (months are 0-indexed)
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  const isFuture = date.getTime() > today.getTime();

  if (isFuture) {
    console.warn(
      `[Future Date Validation Failed] Input: "${value}" -> Parsed: ${date.toLocaleDateString()} (Timestamp: ${date.getTime()}) vs Today: ${today.toLocaleDateString()} (Timestamp: ${today.getTime()})`,
    );
  }

  return isFuture;
};

const InvoiceUploader = ({ onUpload, onClose, isOpen, selectedTenant }) => {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [existingInvoices, setExistingInvoices] = useState([]);
  const [newInvoices, setNewInvoices] = useState([]);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [totalRowsInFile, setTotalRowsInFile] = useState(0);
  // BillTo / ShipTo lookup lists (fetched once when dialog opens)
  const [billToRecords, setBillToRecords] = useState([]);
  const [shipToRecords, setShipToRecords] = useState([]);

  useEffect(() => {
    console.log("uploadResults state changed:", uploadResults);
    console.log("showResults state changed:", showResults);
  }, [uploadResults, showResults]);

  useEffect(() => {
    const invalidInvoice = previewData.find(
      (invoice) => invoice && isFutureDate(invoice.invoiceDate),
    );
    if (invalidInvoice) {
      toast.error(
        `Invoice date ${invalidInvoice.invoiceDate} exceeds the current date. Please select today or a past date.`,
      );
    }
  }, [previewData]);

  const fileInputRef = useRef(null);

  // Use Web Worker for file processing
  const {
    isProcessing,
    progress,
    progressMessage,
    error: processingError,
    processFile: processFileWithWorker,
    cancelProcessing,
    cleanup,
    reset: resetProcessor,
  } = useFileProcessor();

  // Use streaming upload for large uploads
  const {
    isUploading,
    uploadProgress,
    uploadResult,
    uploadError,
    startUpload,
    cancelUpload,
    resetUpload,
    estimateUploadTime,
    getUploadStats,
  } = useStreamingUpload();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Fetch BillTo and ShipTo records when the dialog opens and a tenant is selected
  useEffect(() => {
    if (!isOpen || !selectedTenant) return;
    const tenantId = selectedTenant.tenant_id;
    const fetchBillShip = async () => {
      try {
        const [billRes, shipRes] = await Promise.all([
          api.get(`/tenant/${tenantId}/bill-to?limit=All`),
          api.get(`/tenant/${tenantId}/ship-to?limit=All`),
        ]);
        setBillToRecords(billRes.data?.data || []);
        setShipToRecords(shipRes.data?.data || []);
      } catch (err) {
        console.warn("Could not fetch Bill To / Ship To records:", err);
      }
    };
    fetchBillShip();
  }, [isOpen, selectedTenant]);

  // Expected columns for invoice data (including buyer details) - now optional
  const expectedColumns = [
    // Invoice details
    "invoiceType",
    "invoiceDate",
    "invoiceRefNo",
    "companyInvoiceRefNo",
    // Extra invoice-level fields
    "custAccountNo",
    "custLpoNo",
    "lpoDate",
    "deliveryNoteNo",
    "sp",
    "productOrigin",
    "productCertifiedBy",
    "paymentTerms",
    "paymentDue",
    "group",
    "billToName",
    "shipToName",
    // Buyer details (only NTN/CNIC kept)
    "buyerNTNCNIC",
    // Transaction and item details
    "transctypeId",
    "item_rate",
    "item_sroScheduleNo",
    "item_sroItemSerialNo",
    "item_saleType",
    "item_hsCode",
    "item_uoM",
    "item_productName",
    "item_valueSalesExcludingST",
    "item_quantity",
    "item_qtyForInternal",
    "item_itemCode",
    "item_units",
    "item_courierCharges",
    "item_vat",
    "item_vat18Amount",
    "item_vat25Amount",
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

  // Required columns (invoiceRefNo is optional)
  const requiredColumns = expectedColumns.filter(
    (col) => col !== "invoiceRefNo",
  );

  // Mandatory fields for validation (as per user request)
  const mandatoryFields = [
    { key: "invoiceType", label: "Invoice Type" },
    { key: "invoiceDate", label: "Invoice Date" },
    { key: "companyInvoiceRefNo", label: "Company Invoice Ref No" },
    { key: "buyerNTNCNIC", label: "Buyer NTN" },
    { key: "transctypeId", label: "Transaction Type" },
    { key: "item_sroScheduleNo", label: "SRO Schedule No" },
    { key: "item_sroItemSerialNo", label: "SRO Item No" },
    { key: "item_uoM", label: "Unit of Measurement" },
    { key: "item_productName", label: "Product Name" },
    { key: "item_valueSalesExcludingST", label: "Value of Sales Excl ST" },
    { key: "item_quantity", label: "Quantity" },
    { key: "item_rate", label: "Rate" },
    { key: "item_unitPrice", label: "Unit Cost" },
    { key: "item_salesTaxApplicable", label: "Sales Tax Applicable" },
  ];

  // Map display headers (as shown in Excel) back to internal keys
  const displayToInternalHeaderMap = {
    "Invoice Type": "invoiceType",
    "Invoice Date": "invoiceDate",
    "Invoice Ref No": "invoiceRefNo",
    "Company Invoice Ref No": "companyInvoiceRefNo",
    "Buyer NTN/CNIC": "buyerNTNCNIC",
    "Transaction Type": "transctypeId",
    // New invoice-level columns
    "CUST. A/C NO": "custAccountNo",
    "CUST. LPO NO": "custLpoNo",
    "LPO DATE": "lpoDate",
    "DEL. NOTE NO": "deliveryNoteNo",
    SP: "sp",
    "PRODUCT ORIGIN": "productOrigin",
    "PRODUCT CERTIFIED BY": "productCertifiedBy",
    "PAYMENT TERMS": "paymentTerms",
    "PAYMENT DUE": "paymentDue",
    GROUP: "group",
    "BILL TO": "billToName",
    "SHIP TO": "shipToName",
    Rate: "item_rate",
    "SRO Schedule No": "item_sroScheduleNo",
    "SRO Item No": "item_sroItemSerialNo",
    "Sale Type": "item_saleType",
    "HS Code": "item_hsCode",
    "Unit Of Measurement": "item_uoM",
    "Product Name": "item_productName",
    "Value Sales (Excl ST)": "item_valueSalesExcludingST",
    "Quantity in KGS (For FBR)": "item_quantity",
    Quantity: "item_quantity",
    "Qty (For Internal Use)": "item_qtyForInternal",
    "Item Code": "item_itemCode",
    Units: "item_units",
    "Courier Charges": "item_courierCharges",
    VAT: "item_vat",
    "Calculated VAT 18%": "item_vat18Amount",
    "Calculated VAT 25%": "item_vat25Amount",
    "Unit Cost": "item_unitPrice",
    "Sales Tax Applicable": "item_salesTaxApplicable",
    "ST Withheld at Source": "item_salesTaxWithheldAtSource",
    "Extra Tax": "item_extraTax",
    "Further Tax": "item_furtherTax",
    "FED Payable": "item_fedPayable",
    "Advance Income Tax": "item_advanceIncomeTax",
    Discount: "item_discount",
    "Total Values": "item_totalValues",
    // Additional mappings for common variations
    dn_invoice_ref_no: "invoiceRefNo",
    invoice_ref_no: "invoiceRefNo",
    invoice_ref_number: "invoiceRefNo",
    invoice_number: "invoiceRefNo",
    internal_invoice_no: "companyInvoiceRefNo",
    internal_invoice_number: "companyInvoiceRefNo",
    buyer_ntn_cnic: "buyerNTNCNIC",
    buyer_ntn: "buyerNTNCNIC",
    transaction_type: "transctypeId",
    transctype_id: "transctypeId",
    cust_ac_no: "custAccountNo",
    cust_lpo_no: "custLpoNo",
    lpo_date: "lpoDate",
    del_note_no: "deliveryNoteNo",
    sp: "sp",
    product_origin: "productOrigin",
    product_certified_by: "productCertifiedBy",
    payment_terms: "paymentTerms",
    payment_due: "paymentDue",
    group: "group",
    bill_to: "billToName",
    ship_to: "shipToName",
    product_name: "item_productName",
    hs_code: "item_hsCode",
    hscode: "item_hsCode",
    quantity: "item_quantity",
    unit_price: "item_unitPrice",
    unit_cost: "item_unitPrice",
    qty_for_internal: "item_qtyForInternal",
    qty_internal: "item_qtyForInternal",
    item_code: "item_itemCode",
    units: "item_units",
    courier_charges: "item_courierCharges",
    couriercharges: "item_courierCharges",
    vat: "item_vat",
    calculated_vat_18: "item_vat18Amount",
    calculated_vat_25: "item_vat25Amount",
    vat_18: "item_vat18Amount",
    vat_25: "item_vat25Amount",
    vat18amount: "item_vat18Amount",
    vat25amount: "item_vat25Amount",
    total_values: "item_totalValues",
    value_sales_excluding_st: "item_valueSalesExcludingST",
    sales_tax_applicable: "item_salesTaxApplicable",
    st_withheld_at_source: "item_salesTaxWithheldAtSource",
    extra_tax: "item_extraTax",
    further_tax: "item_furtherTax",
    fed_payable: "item_fedPayable",
    discount: "item_discount",
    unit_of_measurement: "item_uoM",
    uom: "item_uoM",
    rate: "item_rate",
    sro_schedule_no: "item_sroScheduleNo",
    sro_item_serial_no: "item_sroItemSerialNo",
    sale_type: "item_saleType",
  };

  const normalizeHeader = (h) => {
    const header = String(h || "").trim();

    // First try exact match
    if (displayToInternalHeaderMap[header]) {
      return displayToInternalHeaderMap[header];
    }

    // Try partial matches for truncated headers
    const partialMatches = {
      "Invoice Da": "invoiceDate",
      "Invoice Re": "invoiceRefNo",
      "Company I": "companyInvoiceRefNo",
      "Buyer NTN": "buyerNTNCNIC",
      Transactio: "transctypeId",
      "SRO Sched": "item_sroScheduleNo",
      "SRO Item": "item_sroItemSerialNo",
      "Product Na": "item_productName",
      "Value Sale": "item_valueSalesExcludingST",
      "Unit Of Me": "item_uoM",
      "Sales Tax": "item_salesTaxApplicable",
      "ST Withheld": "item_salesTaxWithheldAtSource",
      "FED Payab": "item_fedPayable",
      "Total Valu": "item_totalValues",
      "Qty (For I": "item_qtyForInternal",
      "Courier Ch": "item_courierCharges",
    };

    if (partialMatches[header]) {
      return partialMatches[header];
    }

    // Fallback to original header
    return header;
  };

  // Utility function to check if a row has meaningful data
  const hasMeaningfulData = (row, rowIndex) => {
    // Check for meaningful invoice-level data
    const hasInvoiceData =
      (row.invoiceType &&
        row.invoiceType.trim() !== "" &&
        row.invoiceType !== "Standard") ||
      (row.invoiceDate && row.invoiceDate.trim() !== "") ||
      (row.companyInvoiceRefNo &&
        row.companyInvoiceRefNo.trim() !== "" &&
        row.companyInvoiceRefNo !== `row_${rowIndex + 1}`) ||
      (row.buyerNTNCNIC && row.buyerNTNCNIC.trim() !== "");

    // Check for meaningful item-level data
    const hasItemData =
      (row.item_productName && row.item_productName.trim() !== "") ||
      (row.item_hsCode && row.item_hsCode.trim() !== "") ||
      (row.item_quantity &&
        row.item_quantity !== "" &&
        row.item_quantity !== "0" &&
        row.item_quantity !== 0) ||
      (row.item_unitPrice &&
        row.item_unitPrice !== "" &&
        row.item_unitPrice !== "0" &&
        row.item_unitPrice !== 0) ||
      (row.item_totalValues &&
        row.item_totalValues !== "" &&
        row.item_totalValues !== "0" &&
        row.item_totalValues !== 0) ||
      (row.item_valueSalesExcludingST &&
        row.item_valueSalesExcludingST !== "" &&
        row.item_valueSalesExcludingST !== "0" &&
        row.item_valueSalesExcludingST !== 0);

    const hasData = hasInvoiceData || hasItemData;

    // Debug logging for empty rows
    if (!hasData && rowIndex < 10) {
      // Only log first 10 for debugging
      console.log(`🚫 Row ${rowIndex + 1} filtered out as empty:`, {
        invoiceType: row.invoiceType,
        companyInvoiceRefNo: row.companyInvoiceRefNo,
        item_productName: row.item_productName,
        item_hsCode: row.item_hsCode,
        item_quantity: row.item_quantity,
        item_unitPrice: row.item_unitPrice,
      });
    }

    return hasData;
  };

  // Flexible meaningful data check that works with any column structure
  const hasMeaningfulDataFlexible = (row, headers, rowIndex) => {
    // Check if any cell has meaningful data (not empty, not just whitespace, not "0")
    const hasAnyData = Object.values(row).some((value) => {
      const strValue = String(value).trim();
      return (
        strValue !== "" &&
        strValue !== "0" &&
        strValue !== "null" &&
        strValue !== "undefined"
      );
    });

    // If no data at all, skip
    if (!hasAnyData) {
      return false;
    }

    // Check for instruction patterns in any field - if found, reject
    const instructionPatterns = [
      "auto-calculates",
      "enter ",
      "use the",
      "dropdown",
      "validated",
      "hardcoded",
      "fallback",
      "unit cost",
      "value sales",
      "sales tax",
      "computed",
      "computed as",
      "divided by",
    ];

    const hasInstructionPatterns = Object.values(row).some((value) => {
      const strValue = String(value).toLowerCase();
      return instructionPatterns.some((pattern) => strValue.includes(pattern));
    });

    if (hasInstructionPatterns) {
      return false;
    }

    // Check for numbered list patterns (1., 2., a., b., etc.)
    const hasNumberedListPattern = Object.values(row).some((value) => {
      const strValue = String(value).trim();
      return /^\d+\.\s/.test(strValue) || /^[a-z]\.\s/i.test(strValue);
    });

    if (hasNumberedListPattern) {
      return false;
    }

    // Check for common invoice-related keywords in any field
    const invoiceKeywords = [
      "invoice",
      "bill",
      "receipt",
      "order",
      "purchase",
      "sale",
      "product",
      "item",
      "quantity",
      "price",
      "amount",
      "total",
    ];
    const hasInvoiceKeywords = Object.values(row).some((value) => {
      const strValue = String(value).toLowerCase();
      return invoiceKeywords.some((keyword) => strValue.includes(keyword));
    });

    // Check for numeric values that might indicate quantities or prices
    const hasNumericData = Object.values(row).some((value) => {
      const strValue = String(value).trim();
      const numValue = parseFloat(strValue);
      return !isNaN(numValue) && numValue > 0;
    });

    // Check for date-like values
    const hasDateData = Object.values(row).some((value) => {
      const strValue = String(value).trim();
      // Simple date pattern check
      return (
        /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(strValue) ||
        /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/.test(strValue)
      );
    });

    // Accept if it has any meaningful data and either invoice keywords, numeric data, or date data
    return hasAnyData && (hasInvoiceKeywords || hasNumericData || hasDateData);
  };

  // Buyer selection removed; buyer details should be provided in the sheet

  // Old function - commented out (was using backend API)
  // const downloadExistingTemplate = async () => {
  //   // ... implementation details ...
  // };

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  // Utility functions to clean data for preview display
  const cleanTransctypeId = (value) => {
    if (!value || String(value).trim() === "" || String(value).trim() === "N/A")
      return "";

    const stringValue = String(value).trim();

    // If it contains " - ", extract the part before the first " - "
    if (stringValue.includes(" - ")) {
      const parts = stringValue.split(" - ");
      const idPart = parts[0].trim();
      // Return the ID part if it's not empty
      return idPart;
    }

    // If no " - " found, assume the entire string is the ID
    return stringValue;
  };

  const cleanHsCode = (value) => {
    if (!value || String(value).trim() === "" || String(value).trim() === "N/A")
      return "";

    const stringValue = String(value).trim();

    console.log(
      "🔍 cleanHsCode input:",
      stringValue.substring(0, 100) + (stringValue.length > 100 ? "..." : ""),
    );

    // If it contains " - ", extract the part before the first " - "
    if (stringValue.includes(" - ")) {
      const parts = stringValue.split(" - ");
      const codePart = parts[0].trim();
      console.log("🔍 cleanHsCode output:", codePart);
      // Return the code part if it's not empty
      return codePart;
    }

    // If no " - " found, assume the entire string is the code
    console.log("🔍 cleanHsCode output (no dash):", stringValue);
    return stringValue;
  };

  // Helper to extract seller details robustly (handling both camelCase and snake_case)
  const getSellerDetail = (tenant, fieldName) => {
    if (!tenant) return "";

    // keys to check in order of preference
    const keysToCheck = [
      fieldName, // e.g. sellerNTNCNIC
      fieldName.toLowerCase(), // e.g. sellerntncnic
      // Convert camelCase to snake_case
      fieldName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), // e.g. seller_ntn_cnic
    ];

    // Special case for NTN/CNIC which has inconsistent naming
    if (fieldName === "sellerNTNCNIC") {
      keysToCheck.push("seller_ntn_cnic");
      keysToCheck.push("seller_ntn");
      keysToCheck.push("ntn");
      keysToCheck.push("cnic");
    }

    for (const key of keysToCheck) {
      if (
        tenant[key] !== undefined &&
        tenant[key] !== null &&
        tenant[key] !== ""
      ) {
        return tenant[key];
      }
    }

    return "";
  };

  const processFile = async (selectedFile) => {
    // Validate file type
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];

    if (!validTypes.includes(selectedFile.type)) {
      toast.error("Please select a valid CSV or Excel file");
      return;
    }

    setFile(selectedFile);
    setErrors([]);
    setPreviewData([]);
    setExistingInvoices([]);
    setNewInvoices([]);
    resetProcessor();

    try {
      // Use Web Worker for file processing
      const result = await processFileWithWorker(selectedFile, expectedColumns);

      if (result.success) {
        const { invoices, errors: processingErrors, warnings } = result.data;
        setPreviewData(invoices);
        setErrors(processingErrors);

        // helper to fix rate
        const fixRate = (item) => {
          if (item.item_rate) {
            let rateVal = String(item.item_rate).trim();
            if (rateVal && !rateVal.includes("%")) {
              item.item_rate = `${rateVal}%`;
            }
          }
          // Also check 'rate' if it exists
          if (item.rate) {
            let rateVal = String(item.rate).trim();
            if (rateVal && !rateVal.includes("%")) {
              item.rate = `${rateVal}%`;
            }
          }
          return item;
        };

        // Post-process to ensure rate has %
        const processedInvoices = invoices.map((row) => {
          // Create a shallow copy to avoid mutating the original locked object if frozen
          const newRow = { ...row };

          if (newRow.items && Array.isArray(newRow.items)) {
            newRow.items = newRow.items.map((item) => fixRate({ ...item }));
            return newRow;
          } else {
            return fixRate(newRow);
          }
        });

        // Now populate seller details if a tenant is selected
        if (selectedTenant) {
          const extractedSellerInfo = {
            sellerNTNCNIC: getSellerDetail(selectedTenant, "sellerNTNCNIC"),
            sellerFullNTN: getSellerDetail(selectedTenant, "sellerFullNTN"),
            sellerBusinessName: getSellerDetail(
              selectedTenant,
              "sellerBusinessName",
            ),
            sellerProvince: getSellerDetail(selectedTenant, "sellerProvince"),
            sellerAddress: getSellerDetail(selectedTenant, "sellerAddress"),
          };

          // Apply seller info to all rows
          processedInvoices.forEach((row) => {
            Object.assign(row, extractedSellerInfo);
            // If items are grouped, also apply to items if needed (though usually on invoice level)
            if (row.items && Array.isArray(row.items)) {
              row.items.forEach((item) =>
                Object.assign(item, extractedSellerInfo),
              );
            }
          });
        }

        // Re-set preview data with fixed rates
        setPreviewData(processedInvoices);

        if (processingErrors.length > 0) {
          toast.warning(
            `File processed with ${processingErrors.length} errors`,
          );
        } else {
          toast.success(
            `File processed successfully: ${processedInvoices.length} invoices found`,
          );
        }

        // Store total rows count from worker
        if (result.totalRows) {
          setTotalRowsInFile(result.totalRows);
        } else {
          // Fallback: estimate from invoices/items
          const estRows = processedInvoices.reduce(
            (acc, inv) => acc + (inv.items?.length || 1),
            0,
          );
          setTotalRowsInFile(estRows);
        }

        // Check for existing invoices
        await checkExistingInvoices(processedInvoices);
      } else {
        toast.error(`File processing failed: ${result.error}`);
        setErrors([{ message: result.error }]);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      toast.error("Error processing file. Please try again.");
      setErrors([{ message: error.message }]);
    }
  };

  const processFileContent = (content, fileType, file) => {
    if (fileType === "text/csv") {
      // Improved CSV parsing with better handling of quoted fields
      const lines = content.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        throw new Error(
          "CSV file must have at least a header row and one data row",
        );
      }

      // Parse headers and normalize to internal keys
      const headers = parseCSVLine(lines[0]).map((h) => normalizeHeader(h));

      // Log missing headers but don't throw error - process whatever columns are available
      const missingHeaders = expectedColumns.filter(
        (col) => !headers.includes(col),
      );
      if (missingHeaders.length > 0) {
        console.warn(
          `Missing expected columns: ${missingHeaders.join(", ")}. Processing with available columns.`,
        );
      }

      const data = [];

      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = parseCSVLine(lines[i]);

          // Check if this row has any meaningful data in the first few columns
          const hasData = values
            .slice(0, 5)
            .some((value) => value && value.trim() !== "");

          if (hasData) {
            const row = {};

            headers.forEach((header, index) => {
              let value = values[index] || "";

              // Convert date format if this is the invoiceDate field
              if (header === "invoiceDate" && value) {
                value = convertExcelDateToYYYYMMDD(value);
              }

              row[header] = value;
            });

            // Only include expected columns
            const filteredRow = {};
            expectedColumns.forEach((col) => {
              filteredRow[col] = row[col] || "";
            });

            // Additional check: exclude rows that are clearly not invoice data
            const invoiceType = String(filteredRow.invoiceType || "")
              .trim()
              .toLowerCase();
            const invoiceDate = String(filteredRow.invoiceDate || "").trim();

            // Skip special rows
            if (
              invoiceType.includes("total") ||
              invoiceType.includes("instruction") ||
              invoiceType.includes("summary") ||
              invoiceType.includes("note")
            ) {
              continue;
            }

            // Use utility function to check for meaningful data
            if (hasMeaningfulData(filteredRow, i - 1)) {
              data.push(filteredRow);
            }
          }
        }
      }

      return data;
    } else {
      // Excel file parsing using xlsx library
      try {
        const workbook = XLSX.read(content, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert worksheet to JSON with better date handling
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false, // Set to false to get formatted values
          dateNF: "yyyy-mm-dd",
        });

        if (jsonData.length < 2) {
          throw new Error(
            "Excel file must have at least a header row and one data row",
          );
        }

        // Get headers from first row and normalize
        const headers = jsonData[0].map((header) => normalizeHeader(header));

        // Log available headers for debugging
        console.log("Available headers in Excel file:", headers);
        console.log("Expected columns:", expectedColumns);

        // Log missing headers but don't throw error - process whatever columns are available
        const missingHeaders = expectedColumns.filter(
          (col) => !headers.includes(col),
        );
        if (missingHeaders.length > 0) {
          console.warn(
            `Missing expected columns: ${missingHeaders.join(", ")}. Processing with available columns.`,
          );
        }

        const data = [];

        // Process data rows (skip header row)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];

          // Check if row exists and has any meaningful data
          if (row && Array.isArray(row)) {
            // Check if the row has any non-empty cells in the first few columns (key fields)
            const hasData = row
              .slice(0, 5)
              .some(
                (cell) =>
                  cell !== null &&
                  cell !== undefined &&
                  String(cell).trim() !== "",
              );

            if (hasData) {
              const rowData = {};

              headers.forEach((header, index) => {
                let value =
                  row[index] !== null && row[index] !== undefined
                    ? String(row[index]).trim()
                    : "";

                // Convert date format if this is the invoiceDate field
                if (
                  header === "invoiceDate" &&
                  row[index] !== null &&
                  row[index] !== undefined
                ) {
                  // Handle different types that xlsx might return for dates
                  if (row[index] instanceof Date) {
                    // If it's already a Date object, format it
                    value = row[index].toISOString().split("T")[0];
                  } else {
                    // Convert the value to string and then process it
                    const dateValue = String(row[index]).trim();
                    value = convertExcelDateToYYYYMMDD(dateValue);
                  }
                }

                rowData[header] = value;
              });

              // Debug: Log raw parsed data for first few rows
              if (i <= 3) {
                console.log(`🔍 Raw Excel Row ${i}:`, {
                  headers: headers,
                  rawRow: row,
                  parsedRowData: rowData,
                  companyInvoiceRefNo: rowData.companyInvoiceRefNo,
                  hasCompanyInvoiceRefNo: !!rowData.companyInvoiceRefNo,
                  internalInvoiceNo: rowData.internalInvoiceNo, // Still logged for reference
                  productName: rowData.item_productName,
                  hsCode: rowData.item_hsCode,
                  quantity: rowData.item_quantity,
                  unitPrice: rowData.item_unitPrice,
                });
              }

              // Only include expected columns
              const filteredRow = {};
              expectedColumns.forEach((col) => {
                filteredRow[col] = rowData[col] || "";
              });

              // Additional check: exclude rows that are clearly not invoice data
              const invoiceType = String(filteredRow.invoiceType || "")
                .trim()
                .toLowerCase();
              const invoiceDate = String(filteredRow.invoiceDate || "").trim();

              // Skip special rows - check for instruction patterns
              if (
                invoiceType.includes("total") ||
                invoiceType.includes("instruction") ||
                invoiceType.includes("summary") ||
                invoiceType.includes("note") ||
                invoiceType.includes("auto-calculates") ||
                invoiceType.includes("enter ") ||
                invoiceType.includes("use the") ||
                invoiceType.includes("dropdown") ||
                invoiceType.includes("validated") ||
                invoiceType.includes("hardcoded") ||
                invoiceType.includes("fallback") ||
                /^\d+\.\s/.test(invoiceType) || // Starts with number followed by period and space
                /^[a-z]\.\s/i.test(invoiceType) // Starts with letter followed by period and space
              ) {
                continue;
              }

              // Use utility function to check for meaningful data
              // Also try with the raw row data in case the filtered row is empty
              if (
                hasMeaningfulData(filteredRow, i - 1) ||
                hasMeaningfulDataFlexible(rowData, headers, i - 1)
              ) {
                data.push(filteredRow);
              }
            }
          }
        }

        return data;
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        throw new Error(
          "Error parsing Excel file. Please check the file format.",
        );
      }
    }
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        // End of field
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    // Add the last field
    result.push(current.trim());

    return result;
  };

  const validateAndSetPreview = async (data) => {
    console.log(`Raw data rows received: ${data.length}`);

    // Filter out completely empty rows and special rows
    let validData = data
      .filter((row, index) => {
        // Skip rows that are clearly not invoice data
        const invoiceType = String(row.invoiceType || "")
          .trim()
          .toLowerCase();
        const invoiceDate = String(row.invoiceDate || "").trim();

        // Exclude special rows
        if (
          invoiceType.includes("total") ||
          invoiceType.includes("instruction") ||
          invoiceType.includes("summary") ||
          invoiceType.includes("note")
        ) {
          return false;
        }

        // Use utility function to check for meaningful data
        return hasMeaningfulData(row, index);
      })
      .map((row, index) => {
        // Ensure all expected columns exist with default values if missing
        const processedRow = {};
        expectedColumns.forEach((col) => {
          let value = row[col] || "";

          // Ensure date format is correct
          if (col === "invoiceDate" && value) {
            value = convertExcelDateToYYYYMMDD(value);
          }

          // Clean transctypeId and hsCode for preview display
          if (col === "transctypeId" && value) {
            value = cleanTransctypeId(value);
          }

          if (col === "item_hsCode" && value) {
            value = cleanHsCode(value);
          }

          processedRow[col] = value;
        });
        return processedRow;
      });

    console.log(`Valid data rows after filtering: ${validData.length}`);

    // Log details about filtered rows for debugging
    const filteredOutCount = data.length - validData.length;
    if (filteredOutCount > 0) {
      console.log(`🚫 Filtered out ${filteredOutCount} empty/invalid rows`);
      console.log(`✅ Kept ${validData.length} rows with meaningful data`);
    }

    // Populate seller details from selected tenant
    if (selectedTenant) {
      // Debug logging for tenant details
      console.log("🔍 Selected Tenant Details:", selectedTenant);

      const extractedSellerInfo = {
        sellerNTNCNIC: getSellerDetail(selectedTenant, "sellerNTNCNIC"),
        sellerFullNTN: getSellerDetail(selectedTenant, "sellerFullNTN"),
        sellerBusinessName: getSellerDetail(
          selectedTenant,
          "sellerBusinessName",
        ),
        sellerProvince: getSellerDetail(selectedTenant, "sellerProvince"),
        sellerAddress: getSellerDetail(selectedTenant, "sellerAddress"),
      };

      console.log("🔍 Extracted Seller Info:", extractedSellerInfo);

      // Validate that tenant has required seller information
      if (
        !extractedSellerInfo.sellerNTNCNIC ||
        !extractedSellerInfo.sellerBusinessName
      ) {
        toast.error(
          "Selected company is missing required seller information (NTN/CNIC or Business Name)",
        );
        setPreviewData([]);
        return;
      }

      validData = validData.map((row) => ({
        ...row,
        sellerNTNCNIC: extractedSellerInfo.sellerNTNCNIC,
        sellerFullNTN: extractedSellerInfo.sellerFullNTN,
        sellerBusinessName: extractedSellerInfo.sellerBusinessName,
        sellerProvince: extractedSellerInfo.sellerProvince,
        sellerAddress: extractedSellerInfo.sellerAddress,
      }));
    } else {
      toast.error("Please select a tenant before uploading invoices");
      setPreviewData([]);
      return;
    }

    setErrors([]);
    setPreviewData(validData);

    // Check for existing invoices if we have data
    if (validData.length > 0 && selectedTenant) {
      await checkExistingInvoices(validData);
    }
  };

  /**
   * Calculate statuses for all grouped invoices (duplicate, existing, error, ready)
   * This provides row-wise status for the preview screen.
   */
  const calculateInvoiceStatuses = (invoices, existingInvoicesFromDb) => {
    const seenInvoicesInCsv = new Set();
    const existingRefNos = new Set(
      existingInvoicesFromDb.map((ex) =>
        String(ex.invoiceData.companyInvoiceRefNo || "")
          .trim()
          .toLowerCase(),
      ),
    );

    const invoiceMandatory = [
      "invoiceType",
      "invoiceDate",
      "companyInvoiceRefNo",
      "buyerNTNCNIC",
      "transctypeId",
    ];
    const itemMandatory = [
      "item_sroScheduleNo",
      "item_sroItemSerialNo",
      "item_uoM",
      "item_productName",
      "item_valueSalesExcludingST",
      "item_quantity",
      "item_rate",
      "item_unitPrice",
      "item_salesTaxApplicable",
    ];

    return invoices.map((invoice) => {
      const errorMessages = [];

      invoiceMandatory.forEach((key) => {
        const val = invoice[key];
        if (key === "companyInvoiceRefNo") {
          if (isCompanyInvoiceRefNoMissing(val)) {
            errorMessages.push(COMPANY_INVOICE_REF_NO_REQUIRED_MESSAGE);
          }
        } else if (
          val === undefined ||
          val === null ||
          String(val).trim() === ""
        ) {
          const fieldLabel =
            mandatoryFields.find((f) => f.key === key)?.label || key;
          errorMessages.push(`This field is required: ${fieldLabel}`);
        }
      });

      if (isFutureDate(invoice.invoiceDate)) {
        errorMessages.push(FUTURE_DATE_ERROR_MESSAGE);
      }

      if (invoice.items && Array.isArray(invoice.items)) {
        invoice.items.forEach((item) => {
          itemMandatory.forEach((key) => {
            const val = item[key];
            const isEmpty =
              val === undefined || val === null || String(val).trim() === "";
            const isZeroButRequiredNonZero =
              [
                "item_rate",
                "item_quantity",
                "item_unitPrice",
                "item_valueSalesExcludingST",
              ].includes(key) &&
              (val === 0 || val === "0");

            if (isEmpty || isZeroButRequiredNonZero) {
              const fieldLabel =
                mandatoryFields.find((f) => f.key === key)?.label || key;
              errorMessages.push(`This field is required: ${fieldLabel}`);
            }
          });
        });
      }

      if (errorMessages.length > 0) {
        return {
          ...invoice,
          _status: "error",
          _details: errorMessages.join(" | "),
        };
      }

      return {
        ...invoice,
        _status: "ready",
        _details: "Ready",
      };
    });
  };

  const checkExistingInvoices = async (invoicesData) => {
    if (!selectedTenant) {
      toast.error("No company selected");
      return;
    }

    setCheckingExisting(true);
    try {
      // Clean the data before checking - extract only IDs for transctypeId and hsCode
      const cleanedData = invoicesData.map((invoice) => {
        const cleanedInvoice = { ...invoice };

        // Clean transctypeId - extract only the ID part
        if (cleanedInvoice.transctypeId) {
          cleanedInvoice.transctypeId = cleanTransctypeId(
            cleanedInvoice.transctypeId,
          );
        }

        // Clean item_hsCode - extract only the code part
        if (cleanedInvoice.item_hsCode) {
          cleanedInvoice.item_hsCode = cleanHsCode(cleanedInvoice.item_hsCode);
        }

        return cleanedInvoice;
      });

      // Check all invoices for existing ones - no limit
      const limitedData = cleanedData; // Check all invoices

      // Skip API call if no data to check
      if (!limitedData || limitedData.length === 0) {
        console.log(
          "No data to check for existing invoices, skipping API call",
        );
        setExistingInvoices([]);
        setNewInvoices([]);
        return;
      }

      const response = await api.post(
        `/tenant/${selectedTenant.tenant_id}/invoices/check-existing`,
        { invoices: limitedData },
      );

      const { existing, new: newInvoicesData } = response.data.data;
      setExistingInvoices(existing);
      setNewInvoices(newInvoicesData);

      // Calculate combined status for all invoices
      const statusData = calculateInvoiceStatuses(invoicesData, existing);
      setPreviewData(statusData);

      if (existing.length > 0) {
        toast.info(
          `${existing.length} invoices already exist and will be skipped during upload`,
        );
      }
    } catch (error) {
      console.error("Error checking existing invoices:", error);
      // Don't show error toast, just log it and continue
      // This allows the upload to proceed even if checking fails
      setExistingInvoices([]);
      setNewInvoices([]);
    } finally {
      setCheckingExisting(false);
    }
  };

  const handleUpload = async () => {
    if (!file || previewData.length === 0) {
      toast.error("Please select a valid file with invoice data to upload");
      return;
    }

    if (
      previewData.some((invoice) =>
        isCompanyInvoiceRefNoMissing(invoice?.companyInvoiceRefNo),
      )
    ) {
      await showCompanyInvoiceRefNoRequired();
      return;
    }

    // --- Pre-flight: Detect within-CSV duplicate companyInvoiceRefNo ---
    {
      const seenRefs = new Map(); // refNo -> row index (1-based)
      const withinCsvDuplicates = [];
      previewData.forEach((invoice, idx) => {
        const refNo = String(invoice.companyInvoiceRefNo || "").trim();
        if (!refNo) return;
        if (seenRefs.has(refNo)) {
          withinCsvDuplicates.push({
            row: idx + 1,
            refNo,
            firstRow: seenRefs.get(refNo),
          });
        } else {
          seenRefs.set(refNo, idx + 1);
        }
      });
      if (withinCsvDuplicates.length > 0) {
        const details = withinCsvDuplicates
          .map(
            (d) =>
              `Row ${d.row}: "${d.refNo}" (first seen at row ${d.firstRow})`,
          )
          .join("\n");
        toast.error(
          `Duplicate Company Invoice Reference Numbers found in the file:\n${details}`,
          { autoClose: 8000 },
        );
        return;
      }
    }

    setUploading(true);
    setUploadResults(null);
    setShowResults(false);
    try {
      // 1. Prepare invoices for upload (grouping if needed)
      // Check if previewData contains already-grouped invoices (from worker) or individual rows
      const isAlreadyGrouped =
        previewData.length > 0 &&
        previewData[0].items &&
        Array.isArray(previewData[0].items);

      let invoicesToUpload;

      if (isAlreadyGrouped) {
        // Data is already grouped by worker, use it directly
        console.log("🔍 Using already-grouped invoices from worker");

        // Build name→id lookup maps for Bill To and Ship To
        const billToByName = {};
        billToRecords.forEach((r) => {
          if (r.name) billToByName[r.name.trim().toLowerCase()] = r;
        });
        const shipToByName = {};
        shipToRecords.forEach((r) => {
          if (r.name) shipToByName[r.name.trim().toLowerCase()] = r;
        });

        invoicesToUpload = previewData.map((invoice) => {
          // Resolve Bill To name → id
          const billToMatch = invoice.billToName
            ? billToByName[String(invoice.billToName).trim().toLowerCase()]
            : null;
          const shipToMatch = invoice.shipToName
            ? shipToByName[String(invoice.shipToName).trim().toLowerCase()]
            : null;

          return {
            ...invoice,
            sourceInvoiceNo: invoice.companyInvoiceRefNo,
            // Extra invoice-level fields (already set by worker)
            custAccountNo: invoice.custAccountNo || "",
            custLpoNo: invoice.custLpoNo || "",
            lpoDate: invoice.lpoDate || "",
            deliveryNoteNo: invoice.deliveryNoteNo || "",
            sp: invoice.sp || "",
            productOrigin: invoice.productOrigin || "",
            productCertifiedBy: invoice.productCertifiedBy || "",
            paymentTerms: invoice.paymentTerms || "",
            paymentDue: invoice.paymentDue || "",
            group: invoice.group || "",
            // Resolve Bill To / Ship To names to IDs
            billToId: billToMatch ? billToMatch.id : invoice.billToId || null,
            shipToId: shipToMatch ? shipToMatch.id : invoice.shipToId || null,
            // Ensure seller details are populated from selected tenant
            sellerNTNCNIC: getSellerDetail(selectedTenant, "sellerNTNCNIC"),
            sellerFullNTN: getSellerDetail(selectedTenant, "sellerFullNTN"),
            sellerBusinessName: getSellerDetail(
              selectedTenant,
              "sellerBusinessName",
            ),
            sellerProvince: getSellerDetail(selectedTenant, "sellerProvince"),
            sellerAddress: getSellerDetail(selectedTenant, "sellerAddress"),
          };
        });
      } else {
        // Data is individual rows, need to group them
        console.log("🔍 Grouping individual rows");
        const groupedInvoices = new Map();
        const groupingErrors = [];

        previewData.forEach((row, index) => {
          // Clean the row data before processing
          const cleanedItem = { ...row };

          // Clean transctypeId - extract only the ID part
          if (cleanedItem.transctypeId) {
            cleanedItem.transctypeId = cleanTransctypeId(
              cleanedItem.transctypeId,
            );
          }

          // Clean item_hsCode - extract only the code part
          if (cleanedItem.item_hsCode) {
            cleanedItem.item_hsCode = cleanHsCode(cleanedItem.item_hsCode);
          }

          // Map Excel field names to backend expected field names
          // Backend expects productName or name, but Excel sends item_productName
          console.log("🔍 Frontend Debug: Before mapping:", {
            item_productName: cleanedItem.item_productName,
            name: cleanedItem.name,
            productName: cleanedItem.productName,
          });

          if (
            cleanedItem.item_productName &&
            cleanedItem.item_productName.trim() !== ""
          ) {
            cleanedItem.productName = cleanedItem.item_productName;
            cleanedItem.name = cleanedItem.item_productName;
            console.log(
              "✅ Frontend: Mapped product name:",
              cleanedItem.item_productName,
            );
          } else {
            console.log("❌ Frontend: No valid item_productName found");
          }

          console.log("🔍 Frontend Debug: After mapping:", {
            name: cleanedItem.name,
            productName: cleanedItem.productName,
          });

          // Map other item fields to remove the 'item_' prefix
          if (cleanedItem.item_hsCode) {
            cleanedItem.hsCode = cleanedItem.item_hsCode;
          }
          if (cleanedItem.item_rate) {
            let rateVal = String(cleanedItem.item_rate).trim();
            // If it's a number or string without %, append %
            if (rateVal && !rateVal.includes("%")) {
              rateVal = `${rateVal}%`;
            }
            cleanedItem.rate = rateVal;
          }
          if (cleanedItem.item_uoM) {
            cleanedItem.uoM = cleanedItem.item_uoM;
          }
          if (cleanedItem.item_quantity) {
            cleanedItem.quantity = cleanedItem.item_quantity;
          }
          if (cleanedItem.item_unitPrice) {
            cleanedItem.unitPrice = cleanedItem.item_unitPrice;
          }
          if (cleanedItem.item_totalValues) {
            cleanedItem.totalValues = cleanedItem.item_totalValues;
          }
          if (cleanedItem.item_valueSalesExcludingST) {
            cleanedItem.valueSalesExcludingST =
              cleanedItem.item_valueSalesExcludingST;
          }
          if (cleanedItem.item_fixedNotifiedValueOrRetailPrice) {
            cleanedItem.fixedNotifiedValueOrRetailPrice =
              cleanedItem.item_fixedNotifiedValueOrRetailPrice;
          }
          if (cleanedItem.item_salesTaxApplicable) {
            cleanedItem.salesTaxApplicable =
              cleanedItem.item_salesTaxApplicable;
          }
          if (cleanedItem.item_extraTax) {
            cleanedItem.extraTax = cleanedItem.item_extraTax;
          }
          if (cleanedItem.item_furtherTax) {
            cleanedItem.furtherTax = cleanedItem.item_furtherTax;
          }
          if (cleanedItem.item_sroScheduleNo) {
            cleanedItem.sroScheduleNo = cleanedItem.item_sroScheduleNo;
          }
          if (cleanedItem.item_fedPayable) {
            cleanedItem.fedPayable = cleanedItem.item_fedPayable;
          }
          if (cleanedItem.item_advanceIncomeTax) {
            cleanedItem.advanceIncomeTax = cleanedItem.item_advanceIncomeTax;
          }
          if (cleanedItem.item_discount) {
            cleanedItem.discount = cleanedItem.item_discount;
          }
          if (cleanedItem.item_saleType) {
            cleanedItem.saleType = cleanedItem.item_saleType;
          }
          if (cleanedItem.item_sroItemSerialNo) {
            cleanedItem.sroItemSerialNo = cleanedItem.item_sroItemSerialNo;
          }

          const refFromFile = String(
            cleanedItem.companyInvoiceRefNo || "",
          ).trim();
          if (isCompanyInvoiceRefNoMissing(refFromFile)) {
            groupingErrors.push({
              row: index + 1,
              companyInvoiceRefNo: refFromFile || "(empty)",
              errors: [COMPANY_INVOICE_REF_NO_REQUIRED_MESSAGE],
              message: `Row ${index + 1}: ${COMPANY_INVOICE_REF_NO_REQUIRED_MESSAGE}`,
            });
            return;
          }
          const companyInvoiceRefNo = refFromFile;

          // Add row number for tracking
          cleanedItem._row = index + 1;

          if (groupedInvoices.has(companyInvoiceRefNo)) {
            // Add item to existing invoice group
            const existingInvoice = groupedInvoices.get(companyInvoiceRefNo);

            // Validate consistency of invoice-level data
            const consistencyErrors = [];

            if (existingInvoice.invoiceType !== cleanedItem.invoiceType) {
              consistencyErrors.push(
                `Invoice Type mismatch: ${existingInvoice.invoiceType} vs ${cleanedItem.invoiceType}`,
              );
            }
            if (existingInvoice.invoiceDate !== cleanedItem.invoiceDate) {
              consistencyErrors.push(
                `Invoice Date mismatch: ${existingInvoice.invoiceDate} vs ${cleanedItem.invoiceDate}`,
              );
            }
            if (existingInvoice.buyerNTNCNIC !== cleanedItem.buyerNTNCNIC) {
              consistencyErrors.push(
                `Buyer NTN/CNIC mismatch: ${existingInvoice.buyerNTNCNIC} vs ${cleanedItem.buyerNTNCNIC}`,
              );
            }

            if (consistencyErrors.length > 0) {
              groupingErrors.push({
                row: index + 1,
                companyInvoiceRefNo: companyInvoiceRefNo,
                errors: consistencyErrors,
                message: `Row ${index + 1} has different invoice-level data than other rows with companyInvoiceRefNo: ${companyInvoiceRefNo}`,
              });
            }

            existingInvoice.items.push(cleanedItem);
          } else {
            // Create new invoice group
            groupedInvoices.set(companyInvoiceRefNo, {
              invoiceType: cleanedItem.invoiceType,
              invoiceDate: cleanedItem.invoiceDate,
              invoiceRefNo: cleanedItem.invoiceRefNo,
              companyInvoiceRefNo: cleanedItem.companyInvoiceRefNo,
              internalInvoiceNo: cleanedItem.internalInvoiceNo, // Keep this for reference
              // Seller details from selected tenant
              sellerNTNCNIC: getSellerDetail(selectedTenant, "sellerNTNCNIC"),
              sellerFullNTN: getSellerDetail(selectedTenant, "sellerFullNTN"),
              sellerBusinessName: getSellerDetail(
                selectedTenant,
                "sellerBusinessName",
              ),
              sellerProvince: getSellerDetail(selectedTenant, "sellerProvince"),
              sellerAddress: getSellerDetail(selectedTenant, "sellerAddress"),
              // Buyer details
              buyerNTNCNIC: cleanedItem.buyerNTNCNIC,
              transctypeId: cleanedItem.transctypeId,
              // Extra invoice-level fields
              custAccountNo: cleanedItem.custAccountNo || "",
              custLpoNo: cleanedItem.custLpoNo || "",
              lpoDate: cleanedItem.lpoDate || "",
              deliveryNoteNo: cleanedItem.deliveryNoteNo || "",
              sp: cleanedItem.sp || "",
              productOrigin: cleanedItem.productOrigin || "",
              productCertifiedBy: cleanedItem.productCertifiedBy || "",
              paymentTerms: cleanedItem.paymentTerms || "",
              paymentDue: cleanedItem.paymentDue || "",
              group: cleanedItem.group || "",
              // Resolve Bill To / Ship To names to IDs
              billToId: (() => {
                const name = String(cleanedItem.billToName || "").trim().toLowerCase();
                if (!name) return null;
                const match = billToRecords.find(
                  (r) => r.name && r.name.trim().toLowerCase() === name,
                );
                return match ? match.id : null;
              })(),
              shipToId: (() => {
                const name = String(cleanedItem.shipToName || "").trim().toLowerCase();
                if (!name) return null;
                const match = shipToRecords.find(
                  (r) => r.name && r.name.trim().toLowerCase() === name,
                );
                return match ? match.id : null;
              })(),
              items: [cleanedItem],
              _row: index + 1, // Track the first row for this invoice
            });
          }
        });

        // Check for grouping errors
        if (groupingErrors.length > 0) {
          console.error("Grouping validation errors:", groupingErrors);
          toast.error(
            `Found ${groupingErrors.length} grouping validation errors. Rows with the same Company Invoice Ref No must have consistent invoice-level data. Check console for details.`,
          );
          setUploading(false);
          return;
        }

        // Ensure all invoice groups have seller details from selected tenant
        invoicesToUpload = Array.from(groupedInvoices.values()).map(
          (invoice) => ({
            ...invoice,
            sourceInvoiceNo: invoice.companyInvoiceRefNo,
            sellerNTNCNIC: getSellerDetail(selectedTenant, "sellerNTNCNIC"),
            sellerFullNTN: getSellerDetail(selectedTenant, "sellerFullNTN"),
            sellerBusinessName: getSellerDetail(
              selectedTenant,
              "sellerBusinessName",
            ),
            sellerProvince: getSellerDetail(selectedTenant, "sellerProvince"),
            sellerAddress: getSellerDetail(selectedTenant, "sellerAddress"),
          }),
        );
      }

      // Log seller details being populated
      console.log("🔍 Debug: Seller details populated from tenant:", {
        tenantName: selectedTenant?.sellerBusinessName,
        sellerNTNCNIC: selectedTenant?.sellerNTNCNIC,
        sellerProvince: selectedTenant?.sellerProvince,
        sellerAddress: selectedTenant?.sellerAddress,
        totalInvoices: invoicesToUpload.length,
      });

      console.log("🔍 Debug: Grouped invoices for backend:", {
        totalInvoices: invoicesToUpload.length,
        totalRows: previewData.length,
        sampleInvoice: invoicesToUpload[0],
        sampleInvoiceItems: invoicesToUpload[0]?.items?.length || 0,
        sampleCompanyInvoiceRefNo: invoicesToUpload[0]?.companyInvoiceRefNo,
        hasCompanyInvoiceRefNo: !!invoicesToUpload[0]?.companyInvoiceRefNo,
        sampleInternalInvoiceNo: invoicesToUpload[0]?.internalInvoiceNo, // Still logged for reference
        groupingSummary: invoicesToUpload.map((inv) => ({
          companyInvoiceRefNo: inv.companyInvoiceRefNo,
          internalInvoiceNo: inv.internalInvoiceNo, // Still included for reference
          itemCount: inv.items.length,
          rows: inv.items.map((item) => item._row),
        })),
      });

      // Use calculated statuses from previewData if available, otherwise recalculate
      // Build a map of companyInvoiceRefNo → resolved invoice (with billToId/shipToId)
      // so we don't lose them when filtering by previewData status
      const resolvedInvoiceMap = new Map(
        invoicesToUpload.map((inv) => [
          String(inv.companyInvoiceRefNo || inv._row || "").trim(),
          inv,
        ]),
      );

      const invoicesWithStatus = previewData.map((inv) => {
        // If it's already an invoice object with status, use it
        if (inv._status) return inv;

        // Otherwise, it might be the raw grouped invoices (this fallback is for safety)
        return inv;
      });

      const validationErrors = [];
      const finalInvoicesToUpload = [];

      invoicesWithStatus.forEach((invoice) => {
        if (invoice._status === "error") {
          validationErrors.push({
            row: invoice._row,
            error: invoice._details,
          });
        } else if (invoice._status === "ready") {
          // Merge resolved billToId/shipToId back from invoicesToUpload
          const key = String(
            invoice.companyInvoiceRefNo || invoice._row || "",
          ).trim();
          const resolved = resolvedInvoiceMap.get(key);
          finalInvoicesToUpload.push(
            resolved
              ? {
                  ...invoice,
                  billToId: resolved.billToId ?? invoice.billToId ?? null,
                  shipToId: resolved.shipToId ?? invoice.shipToId ?? null,
                }
              : invoice,
          );
        }
      });

      // Update invoicesToUpload for the actual upload process
      invoicesToUpload = finalInvoicesToUpload;

      if (invoicesToUpload.length === 0) {
        if (validationErrors.length > 0) {
          setErrors(validationErrors);
          toast.error(
            "No valid invoices to upload. Please fix the errors in the CSV.",
          );
        } else {
          toast.error("No valid invoices to upload.");
        }
        setUploading(false);
        return;
      }

      // If there are some errors but also some valid ones, we proceed but notify
      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        toast.warning(
          `${validationErrors.length} invoices have errors and will be skipped. Proceeding with ${invoicesToUpload.length} valid invoices.`,
        );
      }

      // 4. Upload Rules: Proceed with valid invoices

      // Use streaming upload for large files, regular upload for small files
      if (invoicesToUpload.length > 100) {
        // Estimate upload time
        const estimate = estimateUploadTime(invoicesToUpload.length);
        toast.info(
          `Starting upload of ${invoicesToUpload.length} invoices. Estimated time: ${estimate.estimatedTimeMinutes} minutes`,
        );

        // Use streaming upload
        const result = await startUpload(invoicesToUpload, {
          tenantId: selectedTenant.tenant_id,
          chunkSize: 500,
        });

        if (result.success) {
          console.log("Streaming upload result:", result);
          const { successfulInvoices, failedInvoices, errors, summary } =
            result;

          // Store detailed results for display
          const detailedResults = {
            summary: summary || {
              successful: successfulInvoices,
              failed: failedInvoices,
              total: successfulInvoices + failedInvoices,
              totalRows: totalRowsInFile,
            },
            errors: errors || [],
            performance: result.performance || null,
            successfulInvoices: [],
            failedInvoices: [],
          };

          // Process successful invoices - only show actually successful ones
          if (successfulInvoices > 0) {
            // Create a map of successful invoice indices
            const successfulIndices = new Set();
            const errorRows = new Set(errors.map((error) => error.row));

            // Only include invoices that don't have errors
            invoicesToUpload.forEach((invoice, index) => {
              if (!errorRows.has(index + 1)) {
                successfulIndices.add(index);
              }
            });

            detailedResults.successfulInvoices = Array.from(
              successfulIndices,
            ).map((index) => {
              const invoice = invoicesToUpload[index];
              return {
                row: index + 1,
                invoiceNumber:
                  invoice.internalInvoiceNo || `Invoice ${index + 1}`,
                buyerName: invoice.buyerNTNCNIC || "",
                status: "success",
              };
            });
          }

          // Process failed invoices with detailed error information
          if (errors && errors.length > 0) {
            console.log("🔍 Processing errors:", errors);
            detailedResults.failedInvoices = errors.map((error, index) => {
              // Find the actual invoice data from the original upload
              const originalInvoice =
                invoicesToUpload.find((inv, idx) => idx + 1 === error.row) ||
                invoicesToUpload[error.row - 1] ||
                invoicesToUpload[index];

              const failedInvoice = {
                row: error.row || index + 1,
                invoiceNumber:
                  originalInvoice?.internalInvoiceNo ||
                  `Invoice ${error.row || index + 1}`,
                buyerName: originalInvoice?.buyerBusinessName || "",
                error:
                  error.error || error.errors?.join(", ") || "Unknown error",
                status: "failed",
              };

              console.log("🔍 Created failed invoice:", failedInvoice);
              return failedInvoice;
            });
            console.log(
              "🔍 Final failedInvoices array:",
              detailedResults.failedInvoices,
            );
          }

          // Set results and show them
          setUploadResults(detailedResults);
          setShowResults(true);
          console.log("Streaming upload results set:", detailedResults);
          console.log("showResults state set to true");
          console.log("uploadResults state:", detailedResults);

          // Force show results after a short delay to ensure state is updated
          setTimeout(() => {
            console.log("Timeout check - uploadResults:", uploadResults);
            console.log("Timeout check - showResults:", showResults);

            // Force re-render by updating state again
            setUploadResults((prev) => {
              console.log("Force update uploadResults:", prev);
              return prev;
            });
            setShowResults((prev) => {
              console.log("Force update showResults:", prev);
              return prev;
            });
          }, 100);

          // Check if there are any errors (including product validation errors)
          const hasErrors = errors && errors.length > 0;
          const actualSuccessfulCount =
            detailedResults.successfulInvoices.length;
          const actualFailedCount = detailedResults.failedInvoices.length;

          if (hasErrors) {
            toast.warning(
              `Upload completed with issues: ${actualSuccessfulCount} invoices added successfully, ${actualFailedCount} invoices failed due to validation errors.`,
              {
                autoClose: 8000,
                closeOnClick: false,
                pauseOnHover: true,
              },
            );
            console.error("Upload errors:", errors);
          } else {
            toast.success(
              `Successfully uploaded ${actualSuccessfulCount} invoices as drafts!`,
            );
          }
        } else {
          // Handle streaming upload failure - check if it's a validation error
          if (
            result &&
            result.error &&
            result.error.response &&
            result.error.response.status === 409
          ) {
            const errorData = result.error.response.data;
            const duplicateErrors = errorData?.data?.errors || [];
            const detailedResults = {
              summary: {
                successful: 0,
                failed: duplicateErrors.length || 1,
                total: duplicateErrors.length || 1,
              },
              errors: duplicateErrors,
              performance: null,
              successfulInvoices: [],
              failedInvoices:
                duplicateErrors.length > 0
                  ? duplicateErrors.map((e, idx) => ({
                      row: e.row || idx + 1,
                      invoiceNumber: `Invoice ${e.row || idx + 1}`,
                      buyerName: "N/A",
                      error:
                        e.error ||
                        "Duplicate Company Invoice Reference Number found in system.",
                      status: "failed",
                    }))
                  : [
                      {
                        row: 1,
                        invoiceNumber: "Invoice",
                        buyerName: "N/A",
                        error:
                          errorData?.message ||
                          "Duplicate Company Invoice Reference Number found in system.",
                        status: "failed",
                      },
                    ],
            };
            setUploadResults(detailedResults);
            setShowResults(true);
            toast.error(
              errorData?.message ||
                "Upload rejected: Duplicate Company Invoice Reference Number found in system.",
              { autoClose: 8000 },
            );
          } else if (
            result &&
            result.error &&
            result.error.response &&
            result.error.response.status === 400
          ) {
            const errorData = result.error.response.data;
            console.log(
              "Streaming upload failed with validation errors:",
              errorData,
            );

            // Process errors from the new fail-all validation structure
            const errors = errorData.data?.errors || [];

            // Group errors by invoice row to avoid counting duplicates
            const errorsByInvoice = {};
            errors.forEach((error) => {
              const row = error.row || 1;
              if (!errorsByInvoice[row]) {
                errorsByInvoice[row] = [];
              }
              errorsByInvoice[row].push(error);
            });

            const uniqueFailedInvoices = Object.keys(errorsByInvoice).length;
            const summary = errorData.data?.summary || {
              successful: 0,
              failed: uniqueFailedInvoices,
              total: uniqueFailedInvoices,
            };

            // Create detailed results for display - group errors by invoice
            const detailedResults = {
              summary,
              errors,
              performance: null,
              successfulInvoices: [],
              failedInvoices: Object.entries(errorsByInvoice).map(
                ([row, invoiceErrors]) => ({
                  row: parseInt(row),
                  invoiceNumber: `Invoice ${row}`,
                  buyerName: "N/A",
                  error: invoiceErrors.map((e) => e.error).join("; "), // Combine multiple errors for same invoice
                  status: "failed",
                  allErrors: invoiceErrors, // Store all errors for detailed display
                }),
              ),
            };

            setUploadResults(detailedResults);
            setShowResults(true);

            // Show detailed error message with specific error types
            if (errors.length > 0) {
              const buyerErrors = errors.filter((e) =>
                e.error.includes("Buyer with NTN"),
              ).length;
              const productErrors = errors.filter((e) =>
                e.error.includes("Product"),
              ).length;
              const otherErrors = errors.length - buyerErrors - productErrors;

              let errorMessage = `Validation failed. ${uniqueFailedInvoices} invoice(s) have errors. No invoices will be created.`;
              if (buyerErrors > 0)
                errorMessage += ` (${buyerErrors} buyer validation errors)`;
              if (productErrors > 0)
                errorMessage += ` (${productErrors} product validation errors)`;
              if (otherErrors > 0)
                errorMessage += ` (${otherErrors} other errors)`;

              toast.error(errorMessage, { autoClose: 10000 });
            } else {
              toast.error(
                `Upload failed: ${errorData.message || "Unknown error"}`,
              );
            }
          } else {
            throw new Error("Streaming upload failed");
          }
        }
      } else {
        // Use regular upload for small files
        try {
          const result = await onUpload(invoicesToUpload);

          // Check if there were any errors in the upload
          if (
            result &&
            result.data &&
            result.data.data &&
            result.data.data.summary
          ) {
            const { summary, errors, performance } = result.data.data;

            // Store detailed results for display
            const detailedResults = {
              summary: {
                ...summary,
                totalRows: totalRowsInFile,
              },
              errors: errors || [],
              performance,
              successfulInvoices: [],
              failedInvoices: [],
            };

            // Process successful invoices - only show actually successful ones
            if (summary.successful > 0) {
              // Create a map of successful invoice indices
              const successfulIndices = new Set();
              const errorRows = new Set(errors.map((error) => error.row));

              // Only include invoices that don't have errors
              invoicesToUpload.forEach((invoice, index) => {
                if (!errorRows.has(index + 1)) {
                  successfulIndices.add(index);
                }
              });

              detailedResults.successfulInvoices = Array.from(
                successfulIndices,
              ).map((index) => {
                const invoice = invoicesToUpload[index];
                return {
                  row: index + 1,
                  invoiceNumber:
                    invoice.internalInvoiceNo || `Invoice ${index + 1}`,
                  buyerName: invoice.buyerBusinessName || "",
                  totalAmount:
                    invoice.item_totalValues ||
                    invoice.totalValues ||
                    invoice.totalAmount ||
                    0,
                  status: "success",
                };
              });
            }

            // Process failed invoices with detailed error information
            if (errors && errors.length > 0) {
              console.log("🔍 Regular upload - Processing errors:", errors);
              detailedResults.failedInvoices = errors.map((error, index) => {
                // Find the actual invoice data from the original upload
                const originalInvoice =
                  invoicesToUpload.find((inv, idx) => idx + 1 === error.row) ||
                  invoicesToUpload[error.row - 1] ||
                  invoicesToUpload[index];

                const failedInvoice = {
                  row: error.row || index + 1,
                  invoiceNumber:
                    originalInvoice?.internalInvoiceNo ||
                    `Invoice ${error.row || index + 1}`,
                  buyerName: originalInvoice?.buyerBusinessName || "",
                  error:
                    error.error || error.errors?.join(", ") || "Unknown error",
                  status: "failed",
                };

                console.log(
                  "🔍 Regular upload - Created failed invoice:",
                  failedInvoice,
                );
                return failedInvoice;
              });
              console.log(
                "🔍 Regular upload - Final failedInvoices array:",
                detailedResults.failedInvoices,
              );
            }

            setUploadResults(detailedResults);
            setShowResults(true);
            console.log("Upload results set:", detailedResults);

            // Check if there are any errors (including product validation errors)
            const hasErrors = errors && errors.length > 0;
            const actualSuccessfulCount =
              detailedResults.successfulInvoices.length;
            const actualFailedCount = detailedResults.failedInvoices.length;

            if (hasErrors) {
              toast.warning(
                `Upload completed with issues: ${actualSuccessfulCount} invoices added successfully, ${actualFailedCount} invoices failed due to validation errors.`,
                {
                  autoClose: 8000,
                  closeOnClick: false,
                  pauseOnHover: true,
                },
              );
              console.error("Upload errors:", errors);
            } else {
              toast.success(
                `Successfully uploaded ${actualSuccessfulCount} invoices as drafts!`,
              );
            }
          } else {
            // Fallback for when detailed results are not available
            const fallbackResults = {
              summary: { successful: invoicesToUpload.length, failed: 0 },
              errors: [],
              performance: null,
              successfulInvoices: invoicesToUpload.map((invoice, index) => ({
                row: index + 1,
                invoiceNumber:
                  invoice.internalInvoiceNo || `Invoice ${index + 1}`,
                buyerName: invoice.buyerBusinessName || "",
                totalAmount:
                  invoice.item_totalValues ||
                  invoice.totalValues ||
                  invoice.totalAmount ||
                  0,
                status: "success",
              })),
              failedInvoices: [],
            };
            setUploadResults(fallbackResults);
            setShowResults(true);
            console.log("Fallback upload results set:", fallbackResults);
            toast.success(
              `Successfully uploaded ${invoicesToUpload.length} invoices as drafts`,
            );
          }
        } catch (uploadError) {
          // Handle 400 response with detailed errors (like validation failures)
          if (uploadError.response && uploadError.response.status === 400) {
            const errorData = uploadError.response.data;
            console.log("Upload failed with detailed errors:", errorData);

            // Process errors from the new fail-all validation structure
            const errors = errorData.data?.errors || [];

            // Group errors by invoice row to avoid counting duplicates
            const errorsByInvoice = {};
            errors.forEach((error) => {
              const row = error.row || 1;
              if (!errorsByInvoice[row]) {
                errorsByInvoice[row] = [];
              }
              errorsByInvoice[row].push(error);
            });

            const uniqueFailedInvoices = Object.keys(errorsByInvoice).length;
            const summary = errorData.data?.summary || {
              successful: 0,
              failed: uniqueFailedInvoices,
              total: uniqueFailedInvoices,
            };

            // Create detailed results for display - group errors by invoice
            const detailedResults = {
              summary,
              errors,
              performance: null,
              successfulInvoices: [],
              failedInvoices: Object.entries(errorsByInvoice).map(
                ([row, invoiceErrors]) => ({
                  row: parseInt(row),
                  invoiceNumber: `Invoice ${row}`,
                  buyerName: "N/A",
                  error: invoiceErrors.map((e) => e.error).join("; "), // Combine multiple errors for same invoice
                  status: "failed",
                  allErrors: invoiceErrors, // Store all errors for detailed display
                }),
              ),
            };

            setUploadResults(detailedResults);
            setShowResults(true);

            // Show detailed error message with specific error types
            if (errors.length > 0) {
              const buyerErrors = errors.filter((e) =>
                e.error.includes("Buyer with NTN"),
              ).length;
              const productErrors = errors.filter((e) =>
                e.error.includes("Product"),
              ).length;
              const otherErrors = errors.length - buyerErrors - productErrors;

              let errorMessage = `Validation failed. ${uniqueFailedInvoices} invoice(s) have errors. No invoices will be created.`;
              if (buyerErrors > 0)
                errorMessage += ` (${buyerErrors} buyer validation errors)`;
              if (productErrors > 0)
                errorMessage += ` (${productErrors} product validation errors)`;
              if (otherErrors > 0)
                errorMessage += ` (${otherErrors} other errors)`;

              toast.error(errorMessage, { autoClose: 10000 });
            } else {
              toast.error(
                `Upload failed: ${errorData.message || "Unknown error"}`,
              );
            }
          } else {
            // Handle other errors
            console.error("Upload error:", uploadError);
            toast.error("Error uploading invoices. Please try again.");
          }
        }
      }

      // Don't close immediately if there are failed invoices to show
      console.log("Checking modal closing logic...");
      console.log("uploadResults:", uploadResults);
      console.log("uploadResults.summary:", uploadResults?.summary);
      console.log(
        "uploadResults.summary.failed:",
        uploadResults?.summary?.failed,
      );

      // Don't close the modal automatically - let the user decide when to close
      console.log("Upload completed - keeping modal open to show results");
      console.log("Final uploadResults:", uploadResults);
      console.log("Final showResults:", showResults);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Error uploading invoices. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = (forceClose = false) => {
    // Only clear results if we're force closing or if there are no results to show
    if (forceClose || !uploadResults || !showResults) {
      setFile(null);
      setPreviewData([]);
      setErrors([]);
      setShowPreview(false);
      setExistingInvoices([]);
      setNewInvoices([]);
      setUploadResults(null);
      setShowResults(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onClose();
    } else {
      console.log("Preventing modal close - results are being displayed");
    }
  };

  const removeFile = () => {
    setFile(null);
    setPreviewData([]);
    setErrors([]);
    setExistingInvoices([]);
    setNewInvoices([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Create a combined preview data with status indicators
  const getCombinedPreviewData = () => {
    const combined = [];

    // Add existing invoices with status
    existingInvoices.forEach((item) => {
      combined.push({
        ...item.invoiceData,
        _status: "existing",
        _existingInvoice: item.existingInvoice,
        _row: item.row,
      });
    });

    // Add new invoices with status
    newInvoices.forEach((item) => {
      combined.push({
        ...item.invoiceData,
        _status: "new",
        _row: item.row,
      });
    });

    // Sort by original row order
    return combined.sort((a, b) => a._row - b._row);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={(event, reason) => {
        console.log("Dialog onClose called with reason:", reason);
        if (reason === "backdropClick" || reason === "escapeKeyDown") {
          // Don't close if there are results to show
          if (uploadResults && showResults) {
            console.log(
              "Preventing dialog close - results are being displayed",
            );
            return;
          }
        }
        handleClose();
      }}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            Upload Invoices from File (Draft Status)
          </Typography>
          <IconButton onClick={handleClose}>
            <Delete />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a CSV or Excel file with invoice data. All invoices will be
            saved with "draft" status. Invoice numbers will be generated
            automatically by the system.
            <br />
            <br />
            <strong>Seller Details:</strong> All seller information (NTN/CNIC,
            Business Name, Province, Address) will be automatically populated
            from the selected company:{" "}
            <strong>
              {selectedTenant?.sellerBusinessName || "No company selected"}
            </strong>
            <br />
            <br />
            <strong>Buyer Details:</strong> Fill buyer NTN/CNIC in the sheet.
            All buyers must exist in the system before uploading invoices.
            <br />
            <br />
            <strong>Product Validation:</strong> All products must exist in the
            system. Products with names that don't match existing products will
            cause upload errors.
            <br />
            <br />
            <strong>New Feature:</strong> Rows with the same{" "}
            <code>Company Invoice Ref No</code> will be automatically combined
            into single invoices with multiple line items.
          </Typography>

          {/* Tenant Selection Warning */}
          {!selectedTenant && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Please select a comapny before uploading invoices. Seller details
              will be populated from the selected company.
            </Alert>
          )}

          {/* Download Template Button - Download from Public Folder */}
           <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              onClick={async () => {
                try {
                  setDownloadingTemplate(true);

                  // Download template from public folder
                  const templateUrl = "/invoiceTemplate/invoice_template.xlsx";

                  // Fetch the template file from public folder
                  const response = await fetch(templateUrl);

                  if (!response.ok) {
                    throw new Error(
                      `Failed to fetch template: ${response.statusText}`,
                    );
                  }

                  // Create blob and download
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "invoice_template.xlsx";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);

                  toast.success("Excel template downloaded successfully!");
                } catch (error) {
                  console.error("Error downloading template:", error);
                  toast.error(
                    "Could not download Excel template. Please try again.",
                  );
                } finally {
                  setDownloadingTemplate(false);
                }
              }}
              size="small"
              disabled={downloadingTemplate}
              startIcon={
                downloadingTemplate ? (
                  <CircularProgress size={16} />
                ) : (
                  <Download />
                )
              }
            >
              {downloadingTemplate
                ? "Downloading..."
                : "Download Excel Template"}
            </Button>
          </Box> 

          {/* COMMENTED OUT: Backend Template Generation Code - Preserved for Future Use */}
       
          {/* <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              onClick={async () => {
                try {
                  setDownloadingTemplate(true);

                  if (!selectedTenant) {
                    toast.error(
                      "Please select a company before downloading the template",
                    );
                    return;
                  }

                  // Download template from API endpoint
                  const response = await api.get(
                    `/tenant/${selectedTenant.tenant_id}/invoices/template.xlsx`,
                    {
                      responseType: "blob",
                      headers: {
                        Accept:
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                      },
                    },
                  );

                  // Create blob and download
                  const blob = new Blob([response.data], {
                    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  });

                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "invoice_template.xlsx";
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  window.URL.revokeObjectURL(url);

                  toast.success("Excel template downloaded successfully!");
                } catch (error) {
                  console.error("Error downloading template:", error);
                  toast.error(
                    "Could not download Excel template. Please try again.",
                  );
                } finally {
                  setDownloadingTemplate(false);
                }
              }}
              size="small"
              disabled={downloadingTemplate || !selectedTenant}
              startIcon={
                downloadingTemplate ? (
                  <CircularProgress size={16} />
                ) : (
                  <Download />
                )
              }
            >
              {downloadingTemplate
                ? "Downloading..."
                : "Download Excel Template (Backend)"}
            </Button>
          </Box>  */}

          {/* File Processing Progress */}
          {isProcessing && (
            <Box sx={{ mb: 2 }}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {progressMessage}
                </Typography>
                <Button
                  size="small"
                  startIcon={<Cancel />}
                  onClick={cancelProcessing}
                  color="error"
                >
                  Cancel
                </Button>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                {Math.round(progress)}% complete
              </Typography>
            </Box>
          )}

          {/* Processing Error */}
          {processingError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {processingError}
            </Alert>
          )}

          {/* Upload Progress */}
          {isUploading && (
            <Box sx={{ mb: 2 }}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {uploadProgress.message}
                </Typography>
                <Button
                  size="small"
                  startIcon={<Cancel />}
                  onClick={cancelUpload}
                  color="error"
                >
                  Cancel Upload
                </Button>
              </Box>
              <LinearProgress
                variant="determinate"
                value={uploadProgress.percentage}
                sx={{ height: 8, borderRadius: 4 }}
              />
              <Box display="flex" justifyContent="space-between" sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {uploadProgress.completedInvoices} /{" "}
                  {uploadProgress.totalInvoices} invoices
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Chunk {uploadProgress.currentChunk} /{" "}
                  {uploadProgress.totalChunks}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {Math.round(uploadProgress.percentage)}% complete
                </Typography>
              </Box>
            </Box>
          )}

          {/* Upload Error */}
          {uploadError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              Upload failed: {uploadError.message}
            </Alert>
          )}

          {/* File Upload Area */}
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: "center",
              border: "2px dashed #ccc",
              backgroundColor: "#fafafa",
              cursor: isProcessing ? "not-allowed" : "pointer",
              opacity: isProcessing ? 0.6 : 1,
              "&:hover": {
                borderColor: isProcessing ? "#ccc" : "primary.main",
                backgroundColor: isProcessing ? "#fafafa" : "#f5f5f5",
              },
            }}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            onDrop={!isProcessing ? handleDrop : undefined}
            onDragOver={!isProcessing ? handleDragOver : undefined}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              disabled={isProcessing}
              style={{ display: "none" }}
            />

            {!file ? (
              <Box>
                <CloudUpload
                  sx={{ fontSize: 48, color: "text.secondary", mb: 2 }}
                />
                <Typography variant="h6" gutterBottom>
                  Drop your file here or click to browse
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Supports CSV and Excel files
                </Typography>
              </Box>
            ) : (
              <Box>
                <FileUpload
                  sx={{ fontSize: 48, color: "primary.main", mb: 2 }}
                />
                <Typography variant="h6" gutterBottom>
                  {file.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  File size: {(file.size / 1024).toFixed(2)} KB
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>

        {/* Combined Validation Preview Section */}
        {file && previewData.length > 0 && (
          <Box sx={{ mt: 3, mb: 2 }}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              mb={2}
            >
              <Typography variant="h6">
                Validation Preview ({previewData.length} Grouped Invoices)
              </Typography>
              <Button
                startIcon={<Visibility />}
                onClick={() => setShowPreview(!showPreview)}
                size="small"
                variant="outlined"
              >
                {showPreview ? "Hide" : "Show"} Detailed Preview
              </Button>
            </Box>

            {/* Summary of validation results */}
            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
              <Paper
                sx={{
                  p: 1.5,
                  flex: 1,
                  minWidth: "120px",
                  bgcolor: "grey.50",
                  border: "1px solid",
                  borderColor: "grey.300",
                }}
              >
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                >
                  Total Groups
                </Typography>
                <Typography variant="h6">{previewData.length}</Typography>
              </Paper>
              <Paper
                sx={{
                  p: 1.5,
                  flex: 1,
                  minWidth: "120px",
                  bgcolor: "#e8f5e9",
                  border: "1px solid",
                  borderColor: "#c8e6c9",
                }}
              >
                <Typography
                  variant="caption"
                  color="success.main"
                  display="block"
                >
                  Ready
                </Typography>
                <Typography variant="h6" color="success.main">
                  {previewData.filter((i) => i._status === "ready").length}
                </Typography>
              </Paper>
              <Paper
                sx={{
                  p: 1.5,
                  flex: 1,
                  minWidth: "120px",
                  bgcolor: "#ffebee",
                  border: "1px solid",
                  borderColor: "#ffcdd2",
                }}
              >
                <Typography
                  variant="caption"
                  color="error.main"
                  display="block"
                >
                  Errors
                </Typography>
                <Typography variant="h6" color="error.main">
                  {previewData.filter((i) => i._status === "error").length}
                </Typography>
              </Paper>
            </Box>

            {showPreview && (
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ maxHeight: 500 }}
              >
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          backgroundColor: "#f5f5f5",
                          width: 140,
                        }}
                      >
                        Status
                      </TableCell>
                      <TableCell
                        sx={{
                          fontWeight: "bold",
                          backgroundColor: "#f5f5f5",
                          width: 60,
                        }}
                      >
                        Row
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: "bold", backgroundColor: "#f5f5f5" }}
                      >
                        Company Ref No
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: "bold", backgroundColor: "#f5f5f5" }}
                      >
                        Buyer NTN
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: "bold", backgroundColor: "#f5f5f5" }}
                      >
                        Items
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: "bold", backgroundColor: "#f5f5f5" }}
                      >
                        Validation Details
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {previewData.map((row, index) => (
                      <TableRow
                        key={index}
                        sx={{
                          bgcolor:
                            row._status === "error"
                              ? "#fff4f4"
                              : row._status === "ready"
                                ? "#f1f8e9"
                                : "inherit",
                          "&:hover": {
                            bgcolor:
                              row._status === "error"
                                ? "#ffe8e8"
                                : row._status === "ready"
                                  ? "#e8f5e9"
                                  : "#f5f5f5",
                          },
                        }}
                      >
                        <TableCell>
                          {row._status === "ready" && (
                            <Chip
                              label="Ready"
                              size="small"
                              color="success"
                              icon={<CheckCircle />}
                            />
                          )}
                          {row._status === "error" && (
                            <Chip
                              label="Error"
                              size="small"
                              color="error"
                              icon={<ErrorIcon />}
                            />
                          )}
                        </TableCell>
                        <TableCell>{row._row || index + 1}</TableCell>
                        <TableCell sx={{ fontWeight: 500 }}>
                          {row.companyInvoiceRefNo || "-"}
                        </TableCell>
                        <TableCell>{row.buyerNTNCNIC || "-"}</TableCell>
                        <TableCell>
                          <Chip
                            label={row.items?.length || 0}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{
                              color:
                                row._status === "error"
                                  ? "error.main"
                                  : "text.secondary",
                              fontWeight: row._status === "error" ? 500 : 400,
                            }}
                          >
                            {row._details || "-"}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* Upload Status / Loading */}
        {checkingExisting && (
          <Box
            display="flex"
            alignItems="center"
            gap={2}
            mb={2}
            sx={{ p: 2, bgcolor: "info.50", borderRadius: 1 }}
          >
            <CircularProgress size={20} />
            <Typography variant="body2">
              Checking database for existing invoices...
            </Typography>
          </Box>
        )}

        {/* Upload Results Display (Success/Failure after upload) */}
        {uploadResults && showResults && (
          <Box
            sx={{
              mt: 3,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Typography variant="h6">Upload Results</Typography>
              <IconButton size="small" onClick={() => setShowResults(false)}>
                <Close />
              </IconButton>
            </Box>

            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Paper
                sx={{
                  p: 2,
                  flex: 1,
                  minWidth: "150px",
                  bgcolor: "success.main",
                  color: "white",
                  textAlign: "center",
                  borderRadius: 2,
                }}
              >
                <Typography variant="h4" sx={{ fontWeight: "bold" }}>
                  {uploadResults.successfulInvoices?.length || 0}
                </Typography>
                <Typography variant="body2">Success</Typography>
              </Paper>
              <Paper
                sx={{
                  p: 2,
                  flex: 1,
                  minWidth: "150px",
                  bgcolor: "error.main",
                  color: "white",
                  textAlign: "center",
                  borderRadius: 2,
                }}
              >
                <Typography variant="h4" sx={{ fontWeight: "bold" }}>
                  {uploadResults.failedInvoices?.length || 0}
                </Typography>
                <Typography variant="body2">Failed</Typography>
              </Paper>
            </Box>

            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ maxHeight: 300 }}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: "bold", bgcolor: "#f5f5f5" }}>
                      Invoice
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold", bgcolor: "#f5f5f5" }}>
                      Status
                    </TableCell>
                    <TableCell sx={{ fontWeight: "bold", bgcolor: "#f5f5f5" }}>
                      Details
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {uploadResults.successfulInvoices?.map((inv, idx) => (
                    <TableRow key={`success-${idx}`}>
                      <TableCell>
                        {inv.invoiceNumber || `Row ${inv.row}`}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label="Success"
                          size="small"
                          color="success"
                          icon={<CheckCircle />}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="success.main">
                          Uploaded successfully
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                  {uploadResults.failedInvoices?.map((inv, idx) => (
                    <TableRow key={`fail-${idx}`}>
                      <TableCell>
                        {inv.invoiceNumber || `Row ${inv.row}`}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label="Failed"
                          size="small"
                          color="error"
                          icon={<ErrorIcon />}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="error.main">
                          {inv.error}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={uploading}>
          Cancel
        </Button>
        {file && (
          <Button onClick={removeFile} disabled={uploading}>
            Remove File
          </Button>
        )}
        {uploadResults && (
          <Button
            onClick={() => {
              setUploadResults(null);
              setShowResults(false);
            }}
            disabled={uploading}
            variant="outlined"
          >
            Clear Results
          </Button>
        )}
        <Button
          onClick={handleUpload}
          variant="contained"
          disabled={
            !file ||
            previewData.length === 0 ||
            uploading ||
            checkingExisting ||
            previewData.some(
              (invoice) => invoice && isFutureDate(invoice.invoiceDate),
            ) ||
            previewData.some((invoice) =>
              isCompanyInvoiceRefNoMissing(invoice?.companyInvoiceRefNo),
            )
          }
          startIcon={
            uploading ? <CircularProgress size={20} /> : <FileUpload />
          }
        >
          {uploading
            ? "Uploading..."
            : uploadResults &&
                uploadResults.summary &&
                uploadResults.summary.successful > 0
              ? `Upload Again (${(() => {
                  const uniqueInvoices = new Set();
                  previewData.forEach((row) => {
                    const companyInvoiceRefNo =
                      row.companyInvoiceRefNo?.trim() ||
                      `row_${row._row || "unknown"}`;
                    uniqueInvoices.add(companyInvoiceRefNo);
                  });
                  return uniqueInvoices.size;
                })()} Invoices)`
              : (() => {
                  // Count unique invoices after grouping by companyInvoiceRefNo
                  const uniqueInvoices = new Set();
                  previewData.forEach((row) => {
                    const companyInvoiceRefNo =
                      row.companyInvoiceRefNo?.trim() ||
                      `row_${row._row || "unknown"}`;
                    uniqueInvoices.add(companyInvoiceRefNo);
                  });
                  return `Upload ${uniqueInvoices.size} Invoices as Drafts`;
                })()}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InvoiceUploader;
