/**
 * Web Worker for processing large invoice files
 * Handles CSV/Excel parsing in a separate thread to prevent UI blocking
 */

// For module workers, we need to import XLSX differently
// We'll use a simple CSV parser for now and handle Excel files in the main thread

class FileProcessor {
  constructor() {
    this.isProcessing = false;
    this.progressCallback = null;
  }

  /**
   * Process CSV content
   * @param {string} content - CSV file content
   * @param {Array} expectedColumns - Expected column headers
   */
  processCSV(content, expectedColumns) {
    const lines = content.split("\n").filter((line) => line.trim());

    if (lines.length < 2) {
      throw new Error(
        "CSV file must have at least a header row and one data row",
      );
    }

    // Parse headers and normalize
    const headers = this.parseCSVLine(lines[0]).map((h) =>
      this.normalizeHeader(h),
    );

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
    const totalLines = lines.length - 1; // Exclude header

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      const row = {};

      headers.forEach((header, index) => {
        row[header] = values[index] || "";
      });

      data.push(row);

      // Report progress every 100 rows
      if (i % 100 === 0) {
        this.reportProgress((i / totalLines) * 100, `Processed ${i} rows`);
      }
    }

    return data;
  }

  /**
   * Process Excel content (simplified for Web Worker)
   * @param {Array} jsonData - Pre-parsed Excel data from main thread
   * @param {Array} expectedColumns - Expected column headers
   */
  processExcel(jsonData, expectedColumns) {
    if (jsonData.length < 2) {
      throw new Error(
        "Excel file must have at least a header row and one data row",
      );
    }

    const headers = jsonData[0].map((h) => this.normalizeHeader(h));

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

    // Create a mapping of available headers to their original names for data processing
    const headerMapping = {};
    jsonData[0].forEach((originalHeader, index) => {
      const normalizedHeader = headers[index];
      headerMapping[normalizedHeader] = originalHeader;
    });

    const data = [];
    const totalRows = jsonData.length - 1; // Exclude header

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || !Array.isArray(row)) continue; // Skip invalid rows

      // Check if the row has any non-empty cells in the first few columns (key fields)
      const hasData = row
        .slice(0, 5)
        .some(
          (cell) =>
            cell !== null && cell !== undefined && String(cell).trim() !== "",
        );

      if (!hasData) continue; // Skip rows with no meaningful data

      const rowData = {};
      headers.forEach((header, index) => {
        let value =
          row[index] !== null && row[index] !== undefined
            ? String(row[index]).trim()
            : "";
        rowData[header] = value;
      });

      // Log first few rows for debugging
      if (i <= 3) {
        console.log(`Excel Row ${i} data:`, {
          ...rowData,
          productName: rowData.item_productName,
          productDescription: rowData.item_productDescription,
          hsCode: rowData.item_hsCode,
          quantity: rowData.item_quantity,
          unitPrice: rowData.item_unitPrice,
          buyerBusinessName: rowData.buyerBusinessName,
          buyerNTNCNIC: rowData.buyerNTNCNIC,
        });
      }

      // Additional check: exclude rows that are clearly not invoice data
      const invoiceType = String(
        rowData.invoiceType || rowData.invoice_type || "",
      )
        .trim()
        .toLowerCase();

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

      // More flexible meaningful data check that works with any column structure
      const isMeaningful = this.hasMeaningfulDataFlexible(
        rowData,
        headers,
        i - 1,
      );

      // Debug logging for first few rows
      if (i <= 5) {
        console.log(`Row ${i} meaningful data check:`, {
          isMeaningful,
          hasData: Object.values(rowData).some((v) => String(v).trim() !== ""),
          sampleData: {
            invoiceType: rowData.invoiceType,
            companyInvoiceRefNo: rowData.companyInvoiceRefNo,
            buyerBusinessName: rowData.buyerBusinessName,
            item_productName: rowData.item_productName,
          },
          allData: rowData,
        });
      }

      if (isMeaningful) {
        data.push(rowData);
      }

      // Report progress every 100 rows
      if (i % 100 === 0) {
        this.reportProgress((i / totalRows) * 100, `Processed ${i} rows`);
      }
    }

    console.log(
      `Processed ${data.length} meaningful rows from ${totalRows} total rows`,
    );

    // Debug: Log sample of processed data
    if (data.length > 0) {
      console.log("🔍 Worker Debug: Sample processed row:", {
        productName: data[0].item_productName,
        hsCode: data[0].item_hsCode,
        quantity: data[0].item_quantity,
        unitPrice: data[0].item_unitPrice,
        totalValues: data[0].item_totalValues,
        buyerBusinessName: data[0].buyerBusinessName,
      });
    }

    return data;
  }

  /**
   * Parse CSV line with proper handling of quoted fields
   * @param {string} line - CSV line
   */
  parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  /**
   * Normalize header names
   * @param {string} header - Header name
   */
  normalizeHeader(header) {
    const headerStr = String(header || "").trim();

    // Map display headers (as shown in Excel) back to internal keys
    const displayToInternalHeaderMap = {
      "Invoice Type": "invoiceType",
      "Invoice Date": "invoiceDate",
      "Invoice Ref No": "invoiceRefNo",
      "Company Invoice Ref No": "companyInvoiceRefNo",
      "Buyer NTN/CNIC": "buyerNTNCNIC",
      "Buyer Buisness Name": "buyerBusinessName",
      "Buyer Province": "buyerProvince",
      "Buyer Address": "buyerAddress",
      "Buyer Registration Type": "buyerRegistrationType",
      "Transaction Type": "transctypeId",
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
      "BILL TO NTN": "billToName",
      "BILL TO NTN/CNIC": "billToName",
      "Bill To NTN": "billToName",
      "SHIP TO": "shipToName",
      "SHIP TO NTN": "shipToName",
      "SHIP TO NTN/CNIC": "shipToName",
      "Ship To NTN": "shipToName",
      Rate: "item_rate",
      "SRO Schedule No": "item_sroScheduleNo",
      "SRO Item No": "item_sroItemSerialNo",
      "Sale Type": "item_saleType",
      "HS Code": "item_hsCode",
      "Unit Of Measurement": "item_uoM",
      "Unit Of Measurement for (FBR)": "item_uoM",
      "Unit of Measurement for (FBR)": "item_uoM",
      "Unit Of Measurement for (Internal)": "item_uoMForInternal",
      "Unit of Measurement for (Internal)": "item_uoMForInternal",
      "UoM (For Internal Use)": "item_uoMForInternal",
      "Product Name": "item_productName",
      "Product Weight": "item_productWeight",
      "product_weight": "item_productWeight",
      "productweight": "item_productWeight",
      "weight": "item_productWeight",
      "item_productWeight": "item_productWeight",
      "item_weight": "item_productWeight",
      "Product Description": "item_productDescription",
      "Value Sales (Excl ST)": "item_valueSalesExcludingST",
      "Qty (For Internal Use)": "item_qtyForInternal",
      "Quantity in KGS (For FBR)": "item_quantity",
      Quantity: "item_quantity",
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
      buyer_business_name: "buyerBusinessName",
      buyer_buisness_name: "buyerBusinessName",
      buyer_ntn_cnic: "buyerNTNCNIC",
      buyer_ntn: "buyerNTNCNIC",
      buyer_province: "buyerProvince",
      buyer_address: "buyerAddress",
      buyer_registration_type: "buyerRegistrationType",
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
      bill_to_ntn: "billToName",
      ship_to: "shipToName",
      ship_to_ntn: "shipToName",
      product_name: "item_productName",
      product_weight: "item_productWeight",
      productweight: "item_productWeight",
      weight: "item_productWeight",
      product_description: "item_productDescription",
      hs_code: "item_hsCode",
      hscode: "item_hsCode",
      quantity: "item_quantity",
      unit_price: "item_unitPrice",
      unit_cost: "item_unitPrice",
      qty_for_internal: "item_qtyForInternal",
      qty_internal: "item_qtyForInternal",
      qty_for_internal_use: "item_qtyForInternal",
      qty_internal_use: "item_qtyForInternal",
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
      advance_income_tax: "item_advanceIncomeTax",
      discount: "item_discount",
      unit_of_measurement: "item_uoM",
      unit_of_measurement_for_fbr: "item_uoM",
      unit_of_measurement_for_internal: "item_uoMForInternal",
      uom_for_internal: "item_uoMForInternal",
      uom_internal: "item_uoMForInternal",
      uom: "item_uoM",
      rate: "item_rate",
      sro_schedule_no: "item_sroScheduleNo",
      sro_item_serial_no: "item_sroItemSerialNo",
      sale_type: "item_saleType",
    };

    // First try exact match
    if (displayToInternalHeaderMap[headerStr]) {
      return displayToInternalHeaderMap[headerStr];
    }

    // Try partial matches for truncated headers
    const partialMatches = {
      "Invoice Da": "invoiceDate",
      "Invoice Re": "invoiceRefNo",
      "Company I": "companyInvoiceRefNo",
      "Buyer NTN": "buyerNTNCNIC",
      "Buyer Buis": "buyerBusinessName",
      "Buyer Prov": "buyerProvince",
      "Buyer Addı": "buyerAddress",
      "Buyer Regi": "buyerRegistrationType",
      Transactio: "transctypeId",
      "SRO Sched": "item_sroScheduleNo",
      "SRO Item": "item_sroItemSerialNo",
      "Product Na": "item_productName",
      "Product We": "item_productWeight",
      "Product De": "item_productDescription",
      "Value Sale": "item_valueSalesExcludingST",
      "Unit Of Measurement for (FBR)": "item_uoM",
      "Unit Of Measurement for (Internal)": "item_uoMForInternal",
      "Unit Of Measurement for (F": "item_uoM",
      "Unit Of Measurement for (I": "item_uoMForInternal",
      "Unit Of Me": "item_uoM",
      "Sales Tax": "item_salesTaxApplicable",
      "ST Withheld": "item_salesTaxWithheldAtSource",
      "FED Payab": "item_fedPayable",
      "Total Valu": "item_totalValues",
      "Qty (For I": "item_qtyForInternal",
      "Item Code": "item_itemCode",
      "Courier Ch": "item_courierCharges",
      "Calculated": "item_vat18Amount",
    };

    if (partialMatches[headerStr]) {
      return partialMatches[headerStr];
    }

    // Fallback to normalized version
    return headerStr
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
  }

  /**
   * Check if a row has meaningful data
   * @param {Object} row - Row data
   * @param {number} rowIndex - Row index
   */
  hasMeaningfulData(row, rowIndex) {
    // Check for meaningful invoice-level data
    const hasInvoiceData =
      (row.invoiceType &&
        row.invoiceType.trim() !== "" &&
        row.invoiceType !== "Standard") ||
      (row.invoiceDate && row.invoiceDate.trim() !== "") ||
      (row.companyInvoiceRefNo &&
        row.companyInvoiceRefNo.trim() !== "" &&
        row.companyInvoiceRefNo !== `row_${rowIndex + 1}`) ||
      (row.buyerBusinessName &&
        row.buyerBusinessName.trim() !== "" &&
        row.buyerBusinessName !== "Unknown Buyer") ||
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

    return hasInvoiceData || hasItemData;
  }

  /**
   * Flexible meaningful data check that works with any column structure
   * @param {Object} row - Row data
   * @param {Array} headers - Available headers
   * @param {number} rowIndex - Row index
   */
  hasMeaningfulDataFlexible(row, headers, rowIndex) {
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
      console.log(`Row ${rowIndex + 1}: No data found`);
      return false;
    }

    // Check for instruction patterns in any field - if found, reject
    // Made more specific to avoid false positives with legitimate invoice data
    const instructionPatterns = [
      "auto-calculates",
      "enter ",
      "use the",
      "dropdown",
      "validated",
      "hardcoded",
      "fallback",
      "computed as",
      "divided by",
      "instruction",
      "note:",
      "tip:",
      "help:",
      "example:",
    ];

    const hasInstructionPatterns = Object.entries(row).some(([key, value]) => {
      const strValue = String(value).toLowerCase().trim();
      // Only check for patterns at the beginning of the field or as complete phrases
      const matchesPattern = instructionPatterns.some((pattern) => {
        return (
          strValue.startsWith(pattern) ||
          strValue.includes(` ${pattern}`) ||
          strValue.includes(`${pattern} `)
        );
      });

      if (matchesPattern) {
        console.log(
          `Row ${rowIndex + 1}: Field '${key}' contains instruction pattern:`,
          {
            value: String(value),
            lowerValue: strValue,
            matchedPattern: instructionPatterns.find(
              (pattern) =>
                strValue.startsWith(pattern) ||
                strValue.includes(` ${pattern}`) ||
                strValue.includes(`${pattern} `),
            ),
          },
        );
      }

      return matchesPattern;
    });

    if (hasInstructionPatterns) {
      console.log(
        `Row ${rowIndex + 1}: Contains instruction patterns - REJECTING`,
      );
      return false;
    }

    // Check for numbered list patterns (1., 2., a., b., etc.)
    const hasNumberedListPattern = Object.values(row).some((value) => {
      const strValue = String(value).trim();
      return /^\d+\.\s/.test(strValue) || /^[a-z]\.\s/i.test(strValue);
    });

    if (hasNumberedListPattern) {
      console.log(`Row ${rowIndex + 1}: Contains numbered list patterns`);
      return false;
    }

    // More lenient check - accept if it has any meaningful data
    // This is much more permissive and should catch most valid invoice rows
    console.log(`Row ${rowIndex + 1}: Accepting as meaningful data`);
    return hasAnyData;
  }

  /**
   * Convert Excel date (serial or string) to YYYY-MM-DD
   * @param {string|number} excelDate - Excel date
   */
  convertExcelDateToYYYYMMDD(excelDate) {
    if (!excelDate || excelDate === "") return "";

    const toLocalYYYYMMDD = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const processExcelSerial = (serial) => {
      if (serial < 1000) return "";
      const excelEpoch = new Date(1900, 0, 1, 12, 0, 0);
      let daysToAdd = serial - 1;
      if (serial > 59) {
        daysToAdd = daysToAdd - 1;
      }
      const date = new Date(
        excelEpoch.getTime() + daysToAdd * 24 * 60 * 60 * 1000,
      );
      return toLocalYYYYMMDD(date);
    };

    if (typeof excelDate === "number") {
      return processExcelSerial(excelDate);
    }

    if (typeof excelDate === "string") {
      const cleanedDate = excelDate.trim();

      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanedDate)) {
        return cleanedDate;
      }

      if (/^-?\d+(\.\d+)?$/.test(cleanedDate)) {
        const numericValue = parseFloat(cleanedDate);
        if (!isNaN(numericValue)) {
          return processExcelSerial(numericValue);
        }
      }

      if (cleanedDate.includes("/") || cleanedDate.includes("-")) {
        const parts = cleanedDate.split(/[\/\-]/);
        if (parts.length === 3) {
          let month = parseInt(parts[0], 10);
          let day = parseInt(parts[1], 10);
          let year = parseInt(parts[2], 10);

          if (parts[0].length === 4) {
            year = parseInt(parts[0], 10);
            month = parseInt(parts[1], 10);
            day = parseInt(parts[2], 10);
          } else if (month <= 12 && day <= 12) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dateMMDD = new Date(year, month - 1, day);
            const dateDDMM = new Date(year, day - 1, month);
            const isFutureMMDD = dateMMDD.getTime() > today.getTime();
            const isFutureDDMM = dateDDMM.getTime() > today.getTime();
            if (isFutureMMDD && !isFutureDDMM) {
              [month, day] = [day, month];
            }
          } else if (month > 12 && day <= 12) {
            [month, day] = [day, month];
          }

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
  }

  /**
   * Group invoices by company invoice reference number
   * @param {Array} data - Parsed data
   */
  groupInvoices(data) {
    const groupedInvoices = new Map();
    const errors = [];
    const warnings = [];

    data.forEach((item, index) => {
      try {
        // Use any available identifier or create a unique one
        // Try different possible column names for invoice reference
        const refFromFile =
          item.companyInvoiceRefNo?.trim() ||
          item.company_invoice_ref_no?.trim() ||
          item.dn_invoice_ref_no?.trim() ||
          item.internalInvoiceNo?.trim() ||
          item.internal_invoice_no?.trim() ||
          item.invoiceNumber?.trim() ||
          item.invoice_number?.trim() ||
          "";

        const groupingKey = refFromFile || `row_${index + 1}`;

        if (groupedInvoices.has(groupingKey)) {
          const existingInvoice = groupedInvoices.get(groupingKey);

          // Add item to existing invoice
          existingInvoice.items.push(this.cleanItemData(item, index));
        } else {
          // Create new invoice group with whatever data is available
          const buyerBusinessName =
            item.buyerBusinessName ||
            item.buyer_business_name ||
            item.buyer_buisness_name ||
            "";

          // Debug logging for buyer business name
          if (index < 3) {
            console.log(`🔍 Worker Debug: Creating invoice ${index + 1}:`, {
              companyInvoiceRefNo: refFromFile,
              buyerBusinessName,
              buyerNTNCNIC: item.buyerNTNCNIC || item.buyer_ntn_cnic || "",
              availableFields: Object.keys(item).filter((key) =>
                key.toLowerCase().includes("buyer"),
              ),
            });
          }

          groupedInvoices.set(groupingKey, {
            invoiceType: item.invoiceType || item.invoice_type || "Standard",
            invoiceDate:
              this.convertExcelDateToYYYYMMDD(
                item.invoiceDate || item.invoice_date,
              ) || new Date().toISOString().split("T")[0],
            companyInvoiceRefNo: refFromFile,
            internalInvoiceNo:
              item.internalInvoiceNo ||
              item.internal_invoice_no ||
              item.invoiceNumber ||
              item.invoice_number ||
              `INT-${index + 1}`,
            buyerBusinessName: buyerBusinessName,
            buyerNTNCNIC: item.buyerNTNCNIC || item.buyer_ntn_cnic || "",
            buyerProvince: item.buyerProvince || item.buyer_province || "",
            buyerAddress: item.buyerAddress || item.buyer_address || "",
            buyerRegistrationType:
              item.buyerRegistrationType ||
              item.buyer_registration_type ||
              "Individual",
            transctypeId:
              item.transctypeId ||
              item.transaction_type ||
              item.transctype_id ||
              "",
            // Invoice-level extra fields
            custAccountNo: item.custAccountNo || item.cust_ac_no || "",
            custLpoNo: item.custLpoNo || item.cust_lpo_no || "",
            lpoDate:
              this.convertExcelDateToYYYYMMDD(item.lpoDate || item.lpo_date) ||
              "",
            deliveryNoteNo: item.deliveryNoteNo || item.del_note_no || "",
            sp: item.sp || "",
            productOrigin: item.productOrigin || item.product_origin || "",
            productCertifiedBy:
              item.productCertifiedBy || item.product_certified_by || "",
            paymentTerms: item.paymentTerms || item.payment_terms || "",
            paymentDue: item.paymentDue || item.payment_due || "",
            group: item.group || "",
            // Bill To / Ship To — store the name typed by the user; the
            // frontend will resolve the name → id before submitting.
            billToName: item.billToName || item.bill_to || "",
            shipToName: item.shipToName || item.ship_to || "",
            items: [this.cleanItemData(item, index)],
          });
        }
      } catch (error) {
        errors.push({
          row: index + 1,
          message: error.message,
        });
      }
    });

    const finalInvoices = Array.from(groupedInvoices.values());

    // Debug: Log final invoice data
    if (finalInvoices.length > 0) {
      console.log("🔍 Worker Debug: Final invoice data:", {
        totalInvoices: finalInvoices.length,
        sampleInvoice: {
          companyInvoiceRefNo: finalInvoices[0].companyInvoiceRefNo,
          buyerBusinessName: finalInvoices[0].buyerBusinessName,
          itemsCount: finalInvoices[0].items?.length || 0,
          sampleItem: finalInvoices[0].items?.[0]
            ? {
                item_productName: finalInvoices[0].items[0].item_productName,
                item_hsCode: finalInvoices[0].items[0].item_hsCode,
                item_quantity: finalInvoices[0].items[0].item_quantity,
                item_unitPrice: finalInvoices[0].items[0].item_unitPrice,
                item_totalValues: finalInvoices[0].items[0].item_totalValues,
              }
            : null,
        },
      });
    }

    return {
      invoices: finalInvoices,
      errors,
      warnings,
    };
  }

  /**
   * Clean HS code to extract only the numeric part
   * @param {string} value - HS code value
   */
  cleanHsCode(value) {
    if (!value || String(value).trim() === "" || String(value).trim() === "N/A")
      return "";

    const stringValue = String(value).trim();

    console.log(
      "🔍 Worker cleanHsCode input:",
      stringValue.substring(0, 100) + (stringValue.length > 100 ? "..." : ""),
    );

    // If it contains " - ", extract the part before the first " - "
    if (stringValue.includes(" - ")) {
      const parts = stringValue.split(" - ");
      const codePart = parts[0].trim();
      console.log("🔍 Worker cleanHsCode output:", codePart);
      // Return the code part if it's not empty
      return codePart;
    }

    // If no " - " found, assume the entire string is the code
    console.log("🔍 Worker cleanHsCode output (no dash):", stringValue);
    return stringValue;
  }

  /**
   * Clean and validate item data
   * @param {Object} item - Raw item data
   * @param {number} index - Row index
   */
  cleanItemData(item, index) {
    const cleaned = { ...item };

    // Convert numeric fields - handle various field name variations
    const numericFields = [
      "quantity",
      "unitPrice",
      "totalValues",
      "valueSalesExcludingST",
      "fixedNotifiedValueOrRetailPrice",
      "salesTaxApplicable",
      "salesTaxWithheldAtSource",
      "extraTax",
      "furtherTax",
      "fedPayable",
      "advanceIncomeTax",
      "discount",
      "rate",
      // Alternative field names
      "item_quantity",
      "item_unitPrice",
      "item_totalValues",
      "item_valueSalesExcludingST",
      "item_salesTaxApplicable",
      "item_salesTaxWithheldAtSource",
      "item_extraTax",
      "item_furtherTax",
      "item_fedPayable",
      "item_advanceIncomeTax",
      "item_discount",
      "item_rate",
      "item_qtyForInternal",
      "item_courierCharges",
      "item_vat18Amount",
      "item_vat25Amount",
    ];

    numericFields.forEach((field) => {
      if (
        cleaned[field] !== undefined &&
        cleaned[field] !== null &&
        cleaned[field] !== ""
      ) {
        const num = parseFloat(cleaned[field]);
        cleaned[field] = isNaN(num) ? 0 : num;
      } else {
        // Only default to 0 for optional fields.
        // For mandatory fields, leave as undefined so validator catches them.
        const criticalFields = [
          "quantity",
          "unitPrice",
          "rate",
          "valueSalesExcludingST",
          "salesTaxApplicable",
          "item_quantity",
          "item_unitPrice",
          "item_rate",
          "item_valueSalesExcludingST",
          "item_salesTaxApplicable",
        ];

        if (!criticalFields.includes(field)) {
          cleaned[field] = 0;
        }
      }
    });

    // Map alternative field names to standard names AND preserve original names for backend
    const fieldMappings = {
      item_productName: "name",
      item_productWeight: "productWeight",
      item_hsCode: "hsCode",
      item_productDescription: "productDescription",
      item_quantity: "quantity",
      item_unitPrice: "unitPrice",
      item_totalValues: "totalValues",
      item_valueSalesExcludingST: "valueSalesExcludingST",
      item_salesTaxApplicable: "salesTaxApplicable",
      item_salesTaxWithheldAtSource: "salesTaxWithheldAtSource",
      item_extraTax: "extraTax",
      item_furtherTax: "furtherTax",
      item_fedPayable: "fedPayable",
      item_advanceIncomeTax: "advanceIncomeTax",
      item_discount: "discount",
      item_uoM: "uoM",
      item_rate: "rate",
      item_saleType: "saleType",
      item_sroScheduleNo: "sroScheduleNo",
      item_sroItemSerialNo: "sroItemSerialNo",
      item_qtyForInternal: "qtyForInternal",
      item_itemCode: "itemCode",
      item_units: "units",
      item_courierCharges: "courierCharges",
      item_vat18Amount: "vat18Amount",
      item_vat25Amount: "vat25Amount",
    };

    // Create both mapped and original field names for backend compatibility
    Object.entries(fieldMappings).forEach(([oldField, newField]) => {
      if (cleaned[oldField] !== undefined) {
        let value = cleaned[oldField];

        // Clean HS code to extract only the numeric part
        if (oldField === "item_hsCode") {
          value = this.cleanHsCode(value);
        }

        cleaned[newField] = value;
        // Also keep the original field name for backend validation
        cleaned[oldField] = value;
      }
    });

    // Add row tracking
    cleaned._row = index + 1;

    // Handle VAT dropdown field: 0.18 (18%) -> vat18=true, 0.25 (25%) -> vat25=true
    // Excel stores 18% as 0.18 when the cell is formatted as percentage
    const vatRaw = String(cleaned.item_vat || cleaned.vat || "").trim().toLowerCase();
    const vatNum = parseFloat(vatRaw);
    const is18 = vatRaw.includes("18") || Math.abs(vatNum - 0.18) < 0.001;
    const is25 = vatRaw.includes("25") || Math.abs(vatNum - 0.25) < 0.001;
    if (is18) {
      cleaned.vat18 = true;
      cleaned.vat25 = false;
      // Recalculate VAT amounts based on current values
      const salesExcl = parseFloat(cleaned.valueSalesExcludingST || cleaned.item_valueSalesExcludingST || 0) || 0;
      const salesTax = parseFloat(cleaned.salesTaxApplicable || cleaned.item_salesTaxApplicable || 0) || 0;
      cleaned.vat18Amount = Math.round((salesExcl + salesTax) * 0.18 * 100) / 100;
      cleaned.item_vat18Amount = cleaned.vat18Amount;
      cleaned.vat25Amount = 0;
      cleaned.item_vat25Amount = 0;
    } else if (is25) {
      cleaned.vat25 = true;
      cleaned.vat18 = false;
      const salesExcl = parseFloat(cleaned.valueSalesExcludingST || cleaned.item_valueSalesExcludingST || 0) || 0;
      const salesTax = parseFloat(cleaned.salesTaxApplicable || cleaned.item_salesTaxApplicable || 0) || 0;
      cleaned.vat25Amount = Math.round((salesExcl + salesTax) * 0.25 * 100) / 100;
      cleaned.item_vat25Amount = cleaned.vat25Amount;
      cleaned.vat18Amount = 0;
      cleaned.item_vat18Amount = 0;
    } else {
      cleaned.vat18 = cleaned.vat18 || false;
      cleaned.vat25 = cleaned.vat25 || false;
    }

    // Auto-calculate quantity (Qty in KGS / For FBR) if productWeight and qtyForInternal are provided
    const pWeightRaw = String(cleaned.item_productWeight || cleaned.productWeight || cleaned.weight || "").trim();
    const qIntRaw = String(cleaned.item_qtyForInternal || cleaned.qtyForInternal || cleaned.qty_for_internal || "").trim();
    const pWeightNum = parseFloat(pWeightRaw);
    const qIntNum = parseFloat(qIntRaw);

    if (!isNaN(pWeightNum) && !isNaN(qIntNum) && pWeightNum > 0 && qIntNum > 0) {
      const calcQty = pWeightNum * qIntNum;
      const formattedQty = Number.isInteger(calcQty) ? calcQty : Math.round(calcQty * 100) / 100;
      cleaned.quantity = formattedQty;
      cleaned.item_quantity = formattedQty;
    }

    // Auto-calculate Unit Cost if valueSalesExcludingST and qtyForInternal are provided
    const vsExclVal = parseFloat(cleaned.valueSalesExcludingST || cleaned.item_valueSalesExcludingST || 0) || 0;
    const qIntVal = parseFloat(cleaned.item_qtyForInternal || cleaned.qtyForInternal || 0) || 0;
    if (vsExclVal > 0 && qIntVal > 0) {
      const calcUnitPrice = Math.round((vsExclVal / qIntVal) * 10000) / 10000;
      cleaned.unitPrice = calcUnitPrice;
      cleaned.item_unitPrice = calcUnitPrice;
    }

    // Calculate totalValues accurately
    const vsExcl = parseFloat(cleaned.valueSalesExcludingST || cleaned.item_valueSalesExcludingST || 0) || 0;
    const stApp = parseFloat(cleaned.salesTaxApplicable || cleaned.item_salesTaxApplicable || 0) || 0;
    const ftVal = parseFloat(cleaned.furtherTax || cleaned.item_furtherTax || 0) || 0;
    const etVal = parseFloat(cleaned.extraTax || cleaned.item_extraTax || 0) || 0;
    const fedVal = parseFloat(cleaned.fedPayable || cleaned.item_fedPayable || 0) || 0;
    const advVal = parseFloat(cleaned.advanceIncomeTax || cleaned.item_advanceIncomeTax || 0) || 0;
    const discVal = parseFloat(cleaned.discount || cleaned.item_discount || 0) || 0;
    const courierVal = parseFloat(cleaned.courierCharges || cleaned.item_courierCharges || 0) || 0;

    const recalcTotal = Math.round((vsExcl + stApp + ftVal + etVal + fedVal + advVal - discVal + courierVal) * 100) / 100;
    cleaned.totalValues = recalcTotal;
    cleaned.item_totalValues = recalcTotal;

    return cleaned;
  }

  /**
   * Report progress to main thread
   * @param {number} percentage - Progress percentage
   * @param {string} message - Progress message
   */
  reportProgress(percentage, message) {
    if (this.progressCallback) {
      this.progressCallback(percentage, message);
    }

    self.postMessage({
      type: "progress",
      percentage,
      message,
    });
  }

  /**
   * Main processing function
   * @param {Object} data - Processing data
   */
  async process(data) {
    if (this.isProcessing) {
      throw new Error("Already processing a file");
    }

    this.isProcessing = true;

    try {
      this.reportProgress(0, "Starting file processing...");

      let parsedData;

      if (data.type === "csv") {
        this.reportProgress(10, "Parsing CSV file...");
        parsedData = this.processCSV(data.content, data.expectedColumns);
      } else if (data.type === "excel") {
        this.reportProgress(10, "Processing Excel data...");
        parsedData = this.processExcel(data.jsonData, data.expectedColumns);
      } else {
        throw new Error("Unsupported file type");
      }

      this.reportProgress(70, "Grouping invoices...");
      const result = this.groupInvoices(parsedData);

      this.reportProgress(100, "Processing complete!");

      return {
        success: true,
        data: result,
        totalRows: parsedData.length,
        invoiceCount: result.invoices.length,
        errorCount: result.errors.length,
        warningCount: result.warnings.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    } finally {
      this.isProcessing = false;
    }
  }
}

// Create processor instance
const processor = new FileProcessor();

// Handle messages from main thread
self.onmessage = async function (e) {
  const { type, data } = e.data;

  switch (type) {
    case "process":
      try {
        const result = await processor.process(data);
        self.postMessage({
          type: "result",
          data: result,
        });
      } catch (error) {
        self.postMessage({
          type: "error",
          error: error.message,
        });
      }
      break;

    case "cancel":
      processor.isProcessing = false;
      self.postMessage({
        type: "cancelled",
      });
      break;
  }
};
