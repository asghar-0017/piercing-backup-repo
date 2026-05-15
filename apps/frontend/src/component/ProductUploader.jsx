/**
 * ProductUploader Component
 *
 * This component handles bulk product uploads from CSV/Excel files.
 *
 * Features:
 * - File upload (CSV/Excel)
 * - Template download with validation
 * - Duplicate product detection
 * - Preview with validation status indicators
 * - Bulk upload with error handling
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
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
  Tooltip,
} from "@mui/material";
import {
  CloudUpload,
  FileUpload,
  Delete,
  Visibility,
  CheckCircle,
  Error,
  Warning,
  Download,
  Info,
  Speed,
  Memory,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import { api } from "../API/Api";
import uploadOptimizer from "../utils/uploadOptimizer";
// Remove static XLSX import to fix compatibility issues

const ProductUploader = ({ onUpload, onClose, isOpen, selectedTenant }) => {
  const [file, setFile] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [existingProducts, setExistingProducts] = useState([]);
  const [newProducts, setNewProducts] = useState([]);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [performanceMetrics, setPerformanceMetrics] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const fileInputRef = useRef(null);

  // Internal keys for product data
  const expectedColumns = [
    "productName",
    "productDescription",
    "hsCode",
    "uom",
  ];

  // Map display headers (as shown in Excel) back to internal keys
  const displayToInternalHeaderMap = {
    "Product Name": "productName",
    "Product Description": "productDescription",
    "HS Code": "hsCode",
    "Unit Of Measurement": "uom",
  };

  const downloadTemplate = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Products", {
        views: [{ state: "frozen", ySplit: 1 }],
      });

      // Header row with visual labels
      const visualHeaders = [
        "Product Name",
        "Product Description",
        "HS Code",
        "Unit Of Measurement",
      ];
      worksheet.addRow(visualHeaders);
      worksheet.getRow(1).font = { bold: true };

      // Ensure HS Code column is treated as text and readable
      const hsCodeIdx = visualHeaders.indexOf("HS Code") + 1;
      if (hsCodeIdx > 0) {
        const col = worksheet.getColumn(hsCodeIdx);
        col.numFmt = "@"; // Force string format for entire column
        col.alignment = { horizontal: "left" };
        if (!col.width || col.width < 18) col.width = 20;

        // Also set string format for the header row to ensure consistency
        const headerCell = worksheet.getCell(1, hsCodeIdx);
        headerCell.numFmt = "@";
      }

      // Fetch HS Codes and build HS list from API (limit for performance)
      let hsCodeValues = [];
      try {
        const res = await api.get(`/hs-codes?environment=sandbox`);
        console.log("HS Codes API response:", res);
        const codes = Array.isArray(res?.data?.data) ? res.data.data : [];
        const limited = codes.slice(0, 1000);
        hsCodeValues = limited
          .map((c) => {
            const code = c.hS_CODE || c.hs_code || c.code || "";
            const desc = c.description || "";
            return `${code} - ${desc}`.trim();
          })
          .filter(Boolean);
        console.log("Processed HS Codes:", hsCodeValues.length);
      } catch (e) {
        console.error("Error fetching HS codes:", e);
        // Fallback HS codes if API fails
        hsCodeValues = [
          "0101.10.00 - Live horses, pure-bred breeding animals",
          "0101.90.00 - Live horses, other",
          "0102.10.00 - Live asses, pure-bred breeding animals",
          "0102.90.00 - Live asses, other",
          "0103.10.00 - Live swine, pure-bred breeding animals",
          "0103.91.00 - Live swine, weighing less than 50 kg",
          "0103.92.00 - Live swine, weighing 50 kg or more",
          "0104.10.00 - Live sheep, pure-bred breeding animals",
          "0104.20.00 - Live sheep, other",
          "0105.11.00 - Live goats, pure-bred breeding animals",
          "0105.12.00 - Live goats, other",
        ];
      }

      // Hardcoded UOM options from API response
      const uomOptions = [
        "MT",
        "Bill of lading",
        "SET",
        "KWH",
        "40KG",
        "Liter",
        "SqY",
        "Bag",
        "KG",
        "MMBTU",
        "Meter",
        "Pcs",
        "Carat",
        "Cubic Metre",
        "Dozen",
        "Gram",
        "Gallon",
        "Kilogram",
        "Pound",
        "Timber Logs",
        "Numbers, pieces, units",
        "Packs",
        "Pair",
        "Square Foot",
        "Square Metre",
        "Thousand Unit",
        "Mega Watt",
        "Foot",
        "Barrels",
        "NO",
        "Others",
        "1000 kWh",
      ];

      console.log(
        "UOM dropdown enabled with",
        uomOptions.length,
        "hardcoded options"
      );

      // Create a veryHidden worksheet to store the lists
      const listsSheet = workbook.addWorksheet("Lists");
      listsSheet.state = "veryHidden"; // cannot be unhidden via Excel UI

      console.log("Creating Excel with:", {
        uomCount: uomOptions.length,
        hsCount: hsCodeValues.length,
      });

      // Column A: UOM list
      uomOptions.forEach((uom, i) => {
        listsSheet.getCell(1 + i, 1).value = uom;
      });
      // Column B: HS Code list (with description) - No longer used for dropdown validation
      // Users can now input their own HS Code values
      // Ensure HS Codes are stored as strings to prevent Excel from treating them as numbers
      hsCodeValues.forEach((val, i) => {
        const cell = listsSheet.getCell(1 + i, 2);
        cell.value = val;
        cell.numFmt = "@"; // Force string format
      });

      // Helper to convert column index to Excel letter
      const getColLetter = (col) => {
        let temp = "";
        let n = col;
        while (n > 0) {
          const rem = (n - 1) % 26;
          temp = String.fromCharCode(65 + rem) + temp;
          n = Math.floor((n - 1) / 26);
        }
        return temp;
      };

      const uomColIdx = visualHeaders.indexOf("Unit Of Measurement") + 1;
      const hsColIdx = visualHeaders.indexOf("HS Code") + 1;
      // No row limit - allow unlimited rows of data
      const maxRows = 10000000; // allow up to 10,000,000 rows of data for template generation

      const uomRange = `'Lists'!$A$1:$A$${Math.max(1, uomOptions.length)}`;
      const hsRange = `'Lists'!$B$1:$B$${Math.max(1, hsCodeValues.length)}`;

      console.log("Data validation ranges:", {
        uomRange,
        hsRange:
          "HS Code range no longer used for validation - users input free text",
      });

      // Apply data validations row-wise (limited to reasonable number for template)
      for (let r = 2; r <= Math.min(maxRows, 10000); r++) {
        if (uomColIdx > 0) {
          worksheet.getCell(r, uomColIdx).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [uomRange],
            showErrorMessage: true,
          };
        }
        // HS Code dropdown removed - users can now input their own values
        // if (hsColIdx > 0) {
        //   worksheet.getCell(r, hsColIdx).dataValidation = {
        //     type: "list",
        //     allowBlank: true,
        //     formulae: [hsRange],
        //     showErrorMessage: true,
        //   };
        // }
      }

      // Start with empty body rows; users will fill data beneath the headers

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "product_template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success("Excel template downloaded successfully!");
    } catch (err) {
      console.error("Error generating Excel template:", err);
      toast.error("Failed to generate Excel template.");
    }
  };

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

  const processFile = useCallback(async (selectedFile) => {
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
    setExistingProducts([]);
    setNewProducts([]);
    setProcessingProgress(0);
    setIsProcessing(true);

    try {
      // Use optimized file processing with Web Worker
      const result = await uploadOptimizer.processFile(
        selectedFile,
        (progress) => {
          setProcessingProgress(progress);
        }
      );

      // Validate products with optimized validation
      const validationResult = await uploadOptimizer.validateProducts(
        result.data,
        (progress) => {
          setProcessingProgress(50 + progress * 0.5); // 50-100% for validation
        }
      );

      setPreviewData(validationResult.validData);
      setErrors(validationResult.validationErrors);
      setProcessingProgress(100);

      if (validationResult.validData.length > 0) {
        // Skip existing check - treat all as new as per user request to "upload all"
        // Wrap data to match expected structure { productData: ... } for handleUpload
        const formattedNewProducts = validationResult.validData.map(item => ({
          productData: item,
          row: item._row
        }));
        setNewProducts(formattedNewProducts);
        setExistingProducts([]);
        // checkExistingProducts(validationResult.validData);
      }

      // Show performance metrics
      const metrics = uploadOptimizer.getPerformanceMetrics();
      setPerformanceMetrics(metrics);
      const latestParsing = metrics.fileParsing[metrics.fileParsing.length - 1];
      const latestValidation =
        metrics.validation[metrics.validation.length - 1];
    } catch (error) {
      console.error("Error processing file:", error);

      if (
        error.message.includes("Excel parsing error") ||
        error.message.includes("oi is not a constructor")
      ) {
        toast.error(
          "Excel file parsing failed. Please convert your file to CSV format or try a different Excel file.",
          { autoClose: 8000 }
        );
      } else {
        toast.error(`Error processing file: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
      setProcessingProgress(0);
    }
  }, []);

  const parseFileContent = async (content, fileType, file) => {
    if (fileType === "text/csv") {
      // Improved CSV parsing with better handling of quoted fields
      const lines = content.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        throw new Error(
          "CSV file must have at least a header row and one data row"
        );
      }

      // Parse headers
      const headers = parseCSVLine(lines[0]);

      // Validate headers - check if visual labels are present
      const visualHeaders = Object.keys(displayToInternalHeaderMap);
      const missingHeaders = visualHeaders.filter(
        (col) => !headers.includes(col)
      );
      if (missingHeaders.length > 0) {
        throw new Error(
          `Missing required columns: ${missingHeaders.join(", ")}`
        );
      }

      const data = [];

      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
          const values = parseCSVLine(lines[i]);
          const row = {};

          headers.forEach((header, index) => {
            row[header] = values[index] || "";
          });

          // Map visual headers to internal keys (force hsCode to string)
          const mappedRow = {};
          Object.entries(displayToInternalHeaderMap).forEach(
            ([visualHeader, internalKey]) => {
              const value = row[visualHeader] || "";
              mappedRow[internalKey] =
                internalKey === "hsCode" ? String(value) : value;
            }
          );

          data.push(mappedRow);
        }
      }

      return data;
    } else {
      // Excel file parsing using dynamic xlsx import to avoid compatibility issues
      try {
        // Dynamic import to avoid XLSX constructor issues
        const XLSX = await import("xlsx");

        const workbook = XLSX.read(content, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert worksheet to JSON and get formatted values as strings
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: false,
        });

        if (jsonData.length < 2) {
          throw new Error(
            "Excel file must have at least a header row and one data row"
          );
        }

        // Get headers from first row
        const headers = jsonData[0].map((header) =>
          String(header || "").trim()
        );

        // Validate headers - check if visual labels are present
        const visualHeaders = Object.keys(displayToInternalHeaderMap);
        const missingHeaders = visualHeaders.filter(
          (col) => !headers.includes(col)
        );
        if (missingHeaders.length > 0) {
          throw new Error(
            `Missing required columns: ${missingHeaders.join(", ")}`
          );
        }

        const data = [];

        // Process data rows (skip header row)
        for (let i = 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (
            row &&
            row.some(
              (cell) => cell !== null && cell !== undefined && cell !== ""
            )
          ) {
            const rowData = {};

            headers.forEach((header, index) => {
              rowData[header] = row[index] || "";
            });

            // Map visual headers to internal keys (force hsCode to string)
            const mappedRow = {};
            Object.entries(displayToInternalHeaderMap).forEach(
              ([visualHeader, internalKey]) => {
                const value = rowData[visualHeader] || "";
                mappedRow[internalKey] =
                  internalKey === "hsCode" ? String(value) : value;
              }
            );

            data.push(mappedRow);
          }
        }

        return data;
      } catch (error) {
        console.error("Error parsing Excel file:", error);

        // Provide more specific error messages
        if (error.message.includes("oi is not a constructor")) {
          throw new Error(
            "Excel parsing error: Please try converting your Excel file to CSV format, or contact support if the issue persists."
          );
        } else if (error.message.includes("Cannot read properties")) {
          throw new Error(
            "Excel file format not supported. Please ensure you're using a valid Excel file (.xlsx or .xls) or convert to CSV format."
          );
        } else {
          throw new Error(
            `Error parsing Excel file: ${error.message}. Please check the file format and try again.`
          );
        }
      }
    }
  };

  const parseCSVLine = (line) => {
    const result = [];
    let current = "";
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }

      i++;
    }

    result.push(current.trim());
    return result;
  };

  const validateAndSetPreview = (data) => {
    const validData = [];
    const validationErrors = [];

    // Hardcoded UOM options for validation
    const validUOMs = [
      "MT",
      "Bill of lading",
      "SET",
      "KWH",
      "40KG",
      "Liter",
      "SqY",
      "Bag",
      "KG",
      "MMBTU",
      "Meter",
      "Pcs",
      "Carat",
      "Cubic Metre",
      "Dozen",
      "Gram",
      "Gallon",
      "Kilogram",
      "Pound",
      "Timber Logs",
      "Numbers, pieces, units",
      "Packs",
      "Pair",
      "Square Foot",
      "Square Metre",
      "Thousand Unit",
      "Mega Watt",
      "Foot",
      "Barrels",
      "NO",
      "Others",
      "1000 kWh",
    ];

    data.forEach((row, index) => {
      const rowErrors = [];

      // Required field validation
      if (!row.productName || row.productName.trim() === "") {
        rowErrors.push("Product name is required");
      }

      if (!row.hsCode || row.hsCode.trim() === "") {
        rowErrors.push("HS Code is required");
      }

      if (!row.uom || row.uom.trim() === "") {
        rowErrors.push("Unit of Measurement is required");
      }

      // UOM validation using hardcoded options
      if (row.uom && row.uom.trim() !== "") {
        const uomValue = String(row.uom).trim();
        const isValidUOM = validUOMs.some(
          (validUom) =>
            validUom.toLowerCase() === uomValue.toLowerCase() ||
            validUom.toLowerCase().includes(uomValue.toLowerCase()) ||
            uomValue.toLowerCase().includes(validUom.toLowerCase())
        );

        if (!isValidUOM) {
          rowErrors.push(
            `Unit of Measurement "${row.uom}" is not valid. Please select from the dropdown.`
          );
        }
      }

      // HS Code format validation (now more flexible for user input)
      if (row.hsCode && row.hsCode.trim() !== "") {
        const hsCodeStr = String(row.hsCode).trim();
        // Allow alphanumeric HS Codes (e.g., "0101.10.00", "ABC123")
        if (!/^[A-Za-z0-9.\-\s]+$/.test(hsCodeStr)) {
          rowErrors.push(
            "HS Code should contain only letters, numbers, dots, hyphens, and spaces"
          );
        }
        if (hsCodeStr.length < 2 || hsCodeStr.length > 20) {
          rowErrors.push("HS Code should be between 2-20 characters");
        }

        // Note: HS code duplicates are now allowed as per business requirements
      }

      if (rowErrors.length > 0) {
        validationErrors.push({
          row: index + 1,
          errors: rowErrors,
        });
      } else {
        validData.push({
          ...row,
          _row: index + 1,
        });
      }
    });

    setPreviewData(validData);
    setErrors(validationErrors);

    if (validData.length > 0) {
      // Skip existing check - treat all as new
      // Wrap data to match expected structure { productData: ... } for handleUpload
      const formattedNewProducts = validData.map(item => ({
        productData: item,
        row: item._row
      }));
      setNewProducts(formattedNewProducts);
      setExistingProducts([]);
      // checkExistingProducts(validData);
    }
  };

  // Ultra-optimized existing product checking with performance monitoring
  const checkExistingProducts = async (productsData) => {
    if (!selectedTenant) {
      toast.error("Please select a Company before checking existing products.");
      return;
    }

    console.log(
      `Starting ultra-fast existing product check for ${productsData.length} products...`
    );

    // Use Date.now() for timing (more compatible than performance.now())
    const startTime = Date.now();
    setCheckingExisting(true);

    try {
      const response = await api.post(
        `/tenant/${selectedTenant.tenant_id}/products/check-existing`,
        { products: productsData }
      );

      console.log("API response received:", response.data);

      const {
        existing,
        new: newProductsData,
        performance,
      } = response.data.data;

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      console.log(
        `✅ Ultra-fast existing product check completed in ${totalTime.toFixed(2)}ms`
      );
      console.log(
        `📊 Found ${existing.length} existing products, ${newProductsData.length} new products`
      );

      if (performance) {
        console.log(
          `Backend Performance: ${performance.productsPerSecond} products/second`
        );
        console.log(`⚡ Total Backend Time: ${performance.totalTime}ms`);
      }

      console.log(`🌐 Frontend Total Time: ${totalTime.toFixed(2)}ms`);
      console.log(
        `📈 Overall Performance: ${(productsData.length / (totalTime / 1000)).toFixed(2)} products/second`
      );

      setExistingProducts(existing);
      setNewProducts(newProductsData);

      if (existing.length > 0) {
        toast.success(
          `${existing.length} products already exist and will be skipped during upload`,
          { autoClose: 3000 }
        );
      } else {
        toast.success(
          `${productsData.length} products are new and ready for upload`,
          { autoClose: 3000 }
        );
      }
    } catch (error) {
      console.error("Error checking existing products:", error);
      toast.error(
        "Error checking existing products. Preview may not be accurate."
      );
    } finally {
      setCheckingExisting(false);
    }
  };

  // Ultra-optimized product upload with progressive processing
  const handleUpload = useCallback(async () => {
    if (!file || newProducts.length === 0) {
      toast.error("Please select a valid file with new products to upload");
      return;
    }

    // Show progress bar immediately
    setUploading(true);
    setUploadProgress(0);
    setUploadResults(null);
    setShowResults(false);

    console.log(
      `Starting ultra-fast bulk product upload for ${newProducts.length} products...`
    );

    try {
      // Only upload new products
      const productsToUpload = newProducts.map((item) => ({
        ...item.productData,
      }));

      // Call the parent's upload function
      const result = await onUpload(productsToUpload);

      // Check if there were any errors in the upload
      if (
        result &&
        result.data &&
        result.data.data &&
        result.data.data.summary
      ) {
        const { summary, errors, performance } = result.data.data;

        console.log(`✅ Ultra-fast bulk upload completed`);
        console.log(
          `📊 Results: ${summary.successful} successful, ${summary.failed} failed`
        );

        if (performance) {
          console.log(
            `Backend Performance: ${performance.productsPerSecond} products/second`
          );
          console.log(`⚡ Backend Breakdown:`);
          console.log(`  - Validation: ${performance.validationTime}ms`);
          console.log(`  - Duplicate Check: ${performance.duplicateTime}ms`);
          console.log(`  - Bulk Insert: ${performance.insertTime}ms`);
          console.log(`  - Total Backend: ${performance.totalTime}ms`);
        }

        // Store detailed results for display
        const detailedResults = {
          summary,
          errors: errors || [],
          performance,
          successfulProducts: [],
          failedProducts: [],
        };

        // Process successful products - get actual product data from the upload
        if (summary.successful > 0) {
          // Map successful products from the uploaded data
          const successfulProducts = productsToUpload.slice(0, summary.successful);
          detailedResults.successfulProducts = successfulProducts.map((product, index) => ({
            row: index + 1,
            productName: product.productName || product.name || `Product ${index + 1}`,
            hsCode: product.hsCode || '',
            uom: product.uom || '',
            status: 'success'
          }));
        }

        // Process failed products with detailed error information
        if (summary.failed > 0 && errors) {
          detailedResults.failedProducts = errors.map((error, index) => {
            // Find the actual product data from the original upload
            const originalProduct = productsToUpload.find((p, idx) => idx + 1 === error.row) ||
              productsToUpload[error.row - 1] ||
              productsToUpload[index];

            return {
              row: error.row || index + 1,
              productName: originalProduct?.productName || originalProduct?.name || error.product || `Product ${error.row || index + 1}`,
              hsCode: originalProduct?.hsCode || '',
              uom: originalProduct?.uom || '',
              error: error.error || error.errors?.join(', ') || 'Unknown error',
              status: 'failed'
            };
          });
        }

        setUploadResults(detailedResults);
        setShowResults(true);

        if (summary.failed > 0) {
          toast.warning(
            `Upload completed with issues: ${summary.successful} products added successfully, ${summary.failed} products failed.`,
            {
              autoClose: 8000,
              closeOnClick: false,
              pauseOnHover: true,
            }
          );
          console.error("Upload errors:", errors);
        } else {
          toast.success(`Successfully uploaded ${summary.successful} products`);
        }
      } else {
        // Fallback for when detailed results are not available
        const fallbackResults = {
          summary: { successful: productsToUpload.length, failed: 0 },
          errors: [],
          performance: null,
          successfulProducts: productsToUpload.map((product, index) => ({
            row: index + 1,
            productName: product.productName || product.name || `Product ${index + 1}`,
            status: 'success'
          })),
          failedProducts: [],
        };
        setUploadResults(fallbackResults);
        setShowResults(true);
        toast.success(
          `Successfully uploaded ${productsToUpload.length} products`
        );
      }

      // Don't close immediately, let user see results
      // handleClose();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Error uploading products. Please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [file, newProducts, onUpload]);

  const handleClose = useCallback(() => {
    setFile(null);
    setPreviewData([]);
    setErrors([]);
    setShowPreview(false);
    setExistingProducts([]);
    setNewProducts([]);
    setProcessingProgress(0);
    setUploadProgress(0);
    setPerformanceMetrics(null);
    setIsProcessing(false);
    setUploadResults(null);
    setShowResults(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  }, [onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      uploadOptimizer.cleanup();
    };
  }, []);

  const removeFile = () => {
    setFile(null);
    setPreviewData([]);
    setErrors([]);
    setExistingProducts([]);
    setNewProducts([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Create a combined preview data with status indicators
  const getCombinedPreviewData = () => {
    const combined = [];

    const normalize = (data) => {
      // Handle cases where data might be undefined or have different structures
      if (!data) {
        return {
          productName: "",
          productDescription: "",
          hsCode: "",
          uom: "",
        };
      }

      // Ensure preview consistently uses productName/description keys
      return {
        productName: data.productName || data.name || "",
        productDescription: data.productDescription || data.description || "",
        hsCode: data.hsCode || "",
        uom: data.uom || "",
      };
    };

    // Add existing products with status
    // Add existing products with status - DISABLED as per user request to hide existing products from list
    // existingProducts.forEach((item, index) => {
    //   // Handle different data structures from API
    //   const productData = item.productData || item;
    //   const rowNumber = item?.row ?? item?.productData?._row ?? index + 1;

    //   combined.push({
    //     ...normalize(productData),
    //     _status: "existing",
    //     _existingProduct: item.existingProduct,
    //     _row: rowNumber,
    //   });
    // });

    // Add new products with status
    newProducts.forEach((item, index) => {
      // Handle different data structures from API
      const productData = item.productData || item;
      const rowNumber =
        item?.row ??
        item?.productData?._row ??
        existingProducts.length + index + 1;

      combined.push({
        ...normalize(productData),
        _status: "new",
        _row: rowNumber,
      });
    });

    // Sort by original row order
    return combined.sort((a, b) => a._row - b._row);
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Upload Products from File</Typography>
          <IconButton onClick={handleClose}>
            <Delete />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a CSV or Excel file with the following columns: Product Name,
            Product Description, HS Code, Unit Of Measurement.
            <br />
            <strong>Note:</strong> Products with duplicate names
            will be skipped during upload. HS code duplicates are allowed.
            <br />
            <strong>Tip:</strong> If you encounter issues with Excel files, try
            converting them to CSV format for better compatibility.
          </Typography>

          {/* Download Template Button */}
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={downloadTemplate}
              size="small"
            >
              Download Excel Template
            </Button>
          </Box>

          {/* File Upload Area */}
          <Paper
            variant="outlined"
            sx={{
              p: 3,
              textAlign: "center",
              border: "2px dashed #ccc",
              backgroundColor: "#fafafa",
              cursor: isProcessing ? "not-allowed" : "pointer",
              opacity: isProcessing ? 0.7 : 1,
              "&:hover": {
                borderColor: isProcessing ? "#ccc" : "primary.main",
                backgroundColor: isProcessing ? "#fafafa" : "#f5f5f5",
              },
            }}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileSelect}
              style={{ display: "none" }}
              disabled={isProcessing}
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

                {/* Processing Progress */}
                {isProcessing && (
                  <Box sx={{ mt: 2, width: "100%" }}>
                    <Typography variant="body2" color="primary" gutterBottom>
                      Processing...{" "}
                      {file.size > 1024 * 1024 ? "(streaming)" : "(parallel)"}
                    </Typography>
                    <LinearProgress
                      variant="determinate"
                      value={processingProgress}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {processingProgress.toFixed(1)}% complete
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Box>

        {/* Validation Results */}
        {errors.length > 0 && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Validation Errors ({errors.length} rows):
            </Typography>
            {errors.slice(0, 5).map((error, index) => (
              <Typography key={index} variant="body2">
                Row {error.row}: {error.errors.join(", ")}
              </Typography>
            ))}
            {errors.length > 5 && (
              <Typography variant="body2">
                ... and {errors.length - 5} more errors
              </Typography>
            )}
          </Alert>
        )}

        {/* Preview Section */}
        {file && previewData.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Typography variant="h6">
                Preview ({previewData.length} rows)
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowPreview(!showPreview)}
                startIcon={showPreview ? <Visibility /> : <Visibility />}
              >
                {showPreview ? "Hide Preview" : "Show Preview"}
              </Button>
            </Box>

            {showPreview && (
              <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Row</TableCell>
                      <TableCell>Product Name</TableCell>
                      <TableCell>Product Description</TableCell>
                      <TableCell>HS Code</TableCell>
                      <TableCell>Unit Of Measurement</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {getCombinedPreviewData().map((row, index) => (
                      <TableRow key={index}>
                        <TableCell>{row._row}</TableCell>
                        <TableCell>{row.productName}</TableCell>
                        <TableCell>{row.productDescription}</TableCell>
                        <TableCell>{row.hsCode}</TableCell>
                        <TableCell>{row.uom}</TableCell>
                        <TableCell>
                          {row._status === "existing" ? (
                            <Chip
                              icon={<Warning />}
                              label="Existing"
                              color="warning"
                              size="small"
                            />
                          ) : (
                            <Chip
                              icon={<CheckCircle />}
                              label="New"
                              color="success"
                              size="small"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Summary */}
            <Box sx={{ mt: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
              {existingProducts.length > 0 && (
                <Box display="flex" alignItems="center" gap={2}>
                  <Warning color="warning" />
                  <Typography variant="body2" color="warning.main">
                    {existingProducts.length} products already exist and will be
                    skipped
                  </Typography>
                </Box>
              )}
              {newProducts.length > 0 && (
                <Box display="flex" alignItems="center" gap={2}>
                  <CheckCircle color="success" />
                  <Typography variant="body2" color="success.main">
                    {newProducts.length} new products will be uploaded
                  </Typography>
                </Box>
              )}
              {errors.length > 0 && (
                <Box display="flex" alignItems="center" gap={2}>
                  <Error color="error" />
                  <Typography variant="body2" color="error.main">
                    {errors.length} rows skipped due to errors
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Upload Progress */}
            {uploading && (
              <Box sx={{ mt: 2, width: "100%" }}>
                <Typography variant="body2" color="primary" gutterBottom>
                  Uploading...
                </Typography>
                <LinearProgress
                  variant={uploadProgress > 0 ? "determinate" : "indeterminate"}
                  value={uploadProgress}
                  sx={{ height: 8, borderRadius: 4 }}
                />
                {uploadProgress > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {uploadProgress.toFixed(1)}% complete
                  </Typography>
                )}
              </Box>
            )}

            {/* Only-existing validation */}
            {existingProducts.length > 0 && newProducts.length === 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                All selected products already exist in the system. Please modify
                the file to include at least one new product to enable upload.
              </Alert>
            )}
          </Box>
        )}

        {/* Upload Results Section */}
        {uploadResults && showResults && (
          <Box sx={{ mt: 3 }}>
            <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Typography variant="h6">
                Upload Results
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setShowResults(!showResults)}
                startIcon={showResults ? <Visibility /> : <Visibility />}
              >
                {showResults ? "Hide Results" : "Show Results"}
              </Button>
            </Box>

            {showResults && (
              <Box>
                {/* Summary Cards */}
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                  <Paper sx={{
                    p: 3,
                    minWidth: 150,
                    textAlign: 'center',
                    bgcolor: 'success.main',
                    color: 'white',
                    borderRadius: 2,
                    boxShadow: 2
                  }}>
                    <Typography variant="h3" color="inherit" sx={{ fontWeight: 'bold' }}>
                      {uploadResults.summary.successful}
                    </Typography>
                    <Typography variant="h6" color="inherit" sx={{ mt: 1 }}>
                      Successful
                    </Typography>
                  </Paper>
                  {uploadResults.summary.failed > 0 && (
                    <Paper sx={{
                      p: 3,
                      minWidth: 150,
                      textAlign: 'center',
                      bgcolor: 'error.main',
                      color: 'white',
                      borderRadius: 2,
                      boxShadow: 2
                    }}>
                      <Typography variant="h3" color="inherit" sx={{ fontWeight: 'bold' }}>
                        {uploadResults.summary.failed}
                      </Typography>
                      <Typography variant="h6" color="inherit" sx={{ mt: 1 }}>
                        Failed
                      </Typography>
                    </Paper>
                  )}
                </Box>

                {/* Detailed Results Table */}
                <TableContainer component={Paper} sx={{ maxHeight: 400, borderRadius: 2, boxShadow: 2 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'primary.main' }}>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Row</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Product Name</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>HS Code</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>UOM</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
                        <TableCell sx={{ color: 'white', fontWeight: 'bold', bgcolor: 'black' }}>Error Details</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {/* Successful Products */}
                      {uploadResults.successfulProducts.map((product, index) => (
                        <TableRow
                          key={`success-${index}`}
                          sx={{
                            bgcolor: 'success.light',
                            '&:hover': { bgcolor: 'success.main', color: 'white' },
                            borderLeft: '4px solid #4caf50'
                          }}
                        >
                          <TableCell sx={{ fontWeight: 'bold' }}>{product.row}</TableCell>
                          <TableCell sx={{ fontWeight: 'medium' }}>{product.productName}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', bgcolor: 'rgba(76, 175, 80, 0.1)' }}>
                            {product.hsCode}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'medium' }}>{product.uom}</TableCell>
                          <TableCell>
                            <Chip
                              icon={<CheckCircle />}
                              label="Success"
                              color="success"
                              size="small"
                              sx={{ fontWeight: 'bold' }}
                            />
                          </TableCell>
                          <TableCell sx={{ bgcolor: 'black' }}>
                            <Typography variant="body2" color="white" sx={{ fontStyle: 'italic' }}>
                              ✓ Uploaded successfully
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}

                      {/* Failed Products */}
                      {uploadResults.failedProducts.map((product, index) => (
                        <TableRow
                          key={`failed-${index}`}
                          sx={{
                            bgcolor: 'error.light',
                            '&:hover': { bgcolor: 'error.main', color: 'white' },
                            borderLeft: '4px solid #f44336'
                          }}
                        >
                          <TableCell sx={{ fontWeight: 'bold' }}>{product.row}</TableCell>
                          <TableCell sx={{ fontWeight: 'medium' }}>{product.productName}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', bgcolor: 'rgba(244, 67, 54, 0.1)' }}>
                            {product.hsCode}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'medium' }}>{product.uom}</TableCell>
                          <TableCell>
                            <Chip
                              icon={<Error />}
                              label="Failed"
                              color="error"
                              size="small"
                              sx={{ fontWeight: 'bold' }}
                            />
                          </TableCell>
                          <TableCell sx={{ bgcolor: 'black' }}>
                            <Typography variant="body2" color="white" sx={{ fontWeight: 'medium' }}>
                              {product.error}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

              </Box>
            )}
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
        {!uploading && (
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={
              !file ||
              newProducts.length === 0 ||
              checkingExisting ||
              isProcessing ||
              (existingProducts.length > 0 && newProducts.length === 0)
            }
            startIcon={<FileUpload />}
          >
            {newProducts.length === 0
              ? "No new products to upload"
              : `Upload ${newProducts.length} New Products`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ProductUploader;
