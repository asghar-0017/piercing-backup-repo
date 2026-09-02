/**
 * File Processing Web Worker
 * Handles heavy file parsing operations in a separate thread
 * to prevent UI blocking and improve performance
 */

// Import XLSX library for Excel processing
importScripts(
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
);

// Message handler for file processing
self.onmessage = function (e) {
  const { type, data } = e.data;

  try {
    switch (type) {
      case "PARSE_CSV":
        const csvResult = parseCSV(data.content, data.headers);
        self.postMessage({
          type: "PARSE_CSV_SUCCESS",
          data: csvResult,
        });
        break;

      case "PARSE_EXCEL":
        const excelResult = parseExcel(data.content);
        self.postMessage({
          type: "PARSE_EXCEL_SUCCESS",
          data: excelResult,
        });
        break;

      case "VALIDATE_PRODUCTS":
        const validationResult = validateProducts(
          data.products,
          data.validUOMs
        );
        self.postMessage({
          type: "VALIDATE_PRODUCTS_SUCCESS",
          data: validationResult,
        });
        break;

      default:
        self.postMessage({
          type: "ERROR",
          error: "Unknown message type: " + type,
        });
    }
  } catch (error) {
    self.postMessage({
      type: "ERROR",
      error: error.message,
    });
  }
};

/**
 * Parse CSV content with optimized parsing
 */
function parseCSV(content, expectedHeaders) {
  const lines = content.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error(
      "CSV file must have at least a header row and one data row"
    );
  }

  // Parse headers
  const headers = parseCSVLine(lines[0]);

  // Validate headers
  const missingHeaders = expectedHeaders.filter(
    (col) => !headers.includes(col)
  );
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
  }

  const data = [];
  const displayToInternalHeaderMap = {
    "Product Name": "productName",
    "Product Description": "productDescription",
    "Weight": "weight",
    "HS Code": "hsCode",
    "Unit Of Measurement": "uom",
  };

  // Process data rows in chunks for better performance
  const chunkSize = 1000;
  for (let i = 1; i < lines.length; i += chunkSize) {
    const chunk = lines.slice(i, i + chunkSize);

    chunk.forEach((line, chunkIndex) => {
      if (line.trim()) {
        const values = parseCSVLine(line);
        const row = {};

        headers.forEach((header, index) => {
          row[header] = values[index] || "";
        });

        // Map visual headers to internal keys
        const mappedRow = {};
        Object.entries(displayToInternalHeaderMap).forEach(
          ([visualHeader, internalKey]) => {
            const value = row[visualHeader] || "";
            mappedRow[internalKey] =
              internalKey === "hsCode" ? String(value) : value;
          }
        );

        data.push({
          ...mappedRow,
          _row: i + chunkIndex,
        });
      }
    });

    // Send progress update for large files
    if (lines.length > 1000) {
      self.postMessage({
        type: "PROGRESS",
        progress: Math.min(100, ((i + chunkSize) / lines.length) * 100),
      });
    }
  }

  return {
    data,
    totalRows: data.length,
    headers,
  };
}

/**
 * Parse Excel content using XLSX library
 */
function parseExcel(content) {
  try {
    const workbook = XLSX.read(content, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with optimized settings
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    if (jsonData.length < 2) {
      throw new Error(
        "Excel file must have at least a header row and one data row"
      );
    }

    const headers = jsonData[0].map((header) => String(header || "").trim());

    const displayToInternalHeaderMap = {
      "Product Name": "productName",
      "Product Description": "productDescription",
      "Weight": "weight",
      "HS Code": "hsCode",
      "Unit Of Measurement": "uom",
    };

    // Validate required headers
    const requiredHeaders = [
      "Product Name",
      "HS Code",
      "Unit Of Measurement",
    ];
    const missingHeaders = requiredHeaders.filter(
      (col) => !headers.includes(col)
    );
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required columns: ${missingHeaders.join(", ")}`);
    }

    const data = [];

    // Process data rows in chunks
    const chunkSize = 1000;
    for (let i = 1; i < jsonData.length; i += chunkSize) {
      const chunk = jsonData.slice(i, i + chunkSize);

      chunk.forEach((row, chunkIndex) => {
        if (
          row &&
          row.some((cell) => cell !== null && cell !== undefined && cell !== "")
        ) {
          const rowData = {};

          headers.forEach((header, index) => {
            rowData[header] = row[index] || "";
          });

          // Map visual headers to internal keys
          const mappedRow = {};
          Object.entries(displayToInternalHeaderMap).forEach(
            ([visualHeader, internalKey]) => {
              const value = rowData[visualHeader] || "";
              mappedRow[internalKey] =
                internalKey === "hsCode" ? String(value) : value;
            }
          );

          data.push({
            ...mappedRow,
            _row: i + chunkIndex,
          });
        }
      });

      // Send progress update for large files
      if (jsonData.length > 1000) {
        self.postMessage({
          type: "PROGRESS",
          progress: Math.min(100, ((i + chunkSize) / jsonData.length) * 100),
        });
      }
    }

    return {
      data,
      totalRows: data.length,
      headers,
    };
  } catch (error) {
    throw new Error(`Excel parsing error: ${error.message}`);
  }
}

/**
 * Validate products with optimized validation logic
 */
function validateProducts(products, validUOMs) {
  const validData = [];
  const validationErrors = [];

  // Create UOM lookup set for O(1) performance
  const validUOMSet = new Set(validUOMs.map((uom) => uom.toLowerCase()));

  products.forEach((row, index) => {
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

    // UOM validation with optimized lookup
    if (row.uom && row.uom.trim() !== "") {
      const uomValue = String(row.uom).trim().toLowerCase();
      const isValidUOM =
        validUOMSet.has(uomValue) ||
        Array.from(validUOMSet).some(
          (validUom) =>
            validUom.includes(uomValue) || uomValue.includes(validUom)
        );

      if (!isValidUOM) {
        rowErrors.push(
          `Unit of Measurement "${row.uom}" is not valid. Please select from the dropdown.`
        );
      }
    }

    // HS Code format validation
    if (row.hsCode && row.hsCode.trim() !== "") {
      const hsCodeStr = String(row.hsCode).trim();
      if (!/^[A-Za-z0-9.\-\s]+$/.test(hsCodeStr)) {
        rowErrors.push(
          "HS Code should contain only letters, numbers, dots, hyphens, and spaces"
        );
      }
      if (hsCodeStr.length < 2 || hsCodeStr.length > 20) {
        rowErrors.push("HS Code should be between 2-20 characters");
      }
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

  return {
    validData,
    validationErrors,
    totalProcessed: products.length,
  };
}

/**
 * Optimized CSV line parser with better quote handling
 */
function parseCSVLine(line) {
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
}
