import React from "react";
import {
  Box,
  Modal,
  IconButton,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import "./InvoicePrintStyles.css";
import { generateInvoiceQRCode } from "../utils/qrCodeGenerator";

// Utility function to format numbers with commas
const formatNumberWithCommas = (number) => {
  if (number === null || number === undefined || isNaN(number)) return "0.00";
  const num = parseFloat(number);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Helper function to format date to dd-mm-yyyy, preserving original calendar day
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  try {
    // If a pure date (YYYY-MM-DD), format without timezone shifts
    const m = /^\d{4}-\d{2}-\d{2}$/.exec(dateString);
    if (m) {
      const [y, mo, d] = dateString.split("-");
      return `${d}-${mo}-${y}`;
    }

    // Otherwise parse and use UTC parts to avoid off-by-one due to timezone
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

const InvoiceViewModal = ({ open, onClose, invoice, onPrint }) => {
  if (!invoice) return null;

  // Calculate totals
  const subTotal = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.valueSalesExcludingST || 0),
    0
  );
  const gst = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.salesTaxApplicable || 0),
    0
  );
  const further = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.furtherTax || 0),
    0
  );
  const extra = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.extraTax || 0),
    0
  );
  const fed = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.fedPayable || 0),
    0
  );
  const advanceIncomeTaxTotal = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.advanceIncomeTax || 0),
    0
  );
  const dis = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.discount || 0),
    0
  );
  const withheld = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.salesTaxWithheldAtSource || 0),
    0
  );
  const grandTotal = (invoice.items || []).reduce(
    (sum, item) => sum + parseFloat(item.totalValues || 0),
    0
  );

  // Convert number to words function with paisa support
  const convertToWords = (num) => {
    if (!num || isNaN(num)) return "Zero";

    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
    ];
    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];
    const teens = [
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];

    const convertLessThanOneThousand = (num) => {
      if (num === 0) return "";

      if (num < 10) return ones[num];
      if (num < 20) return teens[num - 10];
      if (num < 100)
        return (
          tens[Math.floor(num / 10)] +
          (num % 10 !== 0 ? " " + ones[num % 10] : "")
        );
      if (num < 1000)
        return (
          ones[Math.floor(num / 100)] +
          " Hundred" +
          (num % 100 !== 0 ? " " + convertLessThanOneThousand(num % 100) : "")
        );
    };

    // Helper function for converting numbers without adding "Rupees"
    const convertNumberToWords = (num) => {
      if (num === 0) return "";

      const numStr = num.toString();

      if (numStr.length <= 3) {
        return convertLessThanOneThousand(parseInt(numStr));
      } else if (numStr.length <= 6) {
        // Thousands (1,000 to 999,999)
        const thousands = parseInt(numStr.slice(0, -3));
        const remainder = parseInt(numStr.slice(-3));
        return (
          convertLessThanOneThousand(thousands) +
          " Thousand" +
          (remainder !== 0 ? " " + convertLessThanOneThousand(remainder) : "")
        );
      } else if (numStr.length <= 9) {
        // Millions (1,000,000 to 999,999,999)
        const millions = parseInt(numStr.slice(0, -6));
        const remainder = parseInt(numStr.slice(-6));
        return (
          convertLessThanOneThousand(millions) +
          " Million" +
          (millions !== 1 ? "s" : "") +
          (remainder !== 0 ? " " + convertNumberToWords(remainder) : "")
        );
      } else if (numStr.length <= 12) {
        // Billions (1,000,000,000 to 999,999,999,999)
        const billions = parseInt(numStr.slice(0, -9));
        const remainder = parseInt(numStr.slice(-9));
        return (
          convertLessThanOneThousand(billions) +
          " Billion" +
          (billions !== 1 ? "s" : "") +
          (remainder !== 0 ? " " + convertNumberToWords(remainder) : "")
        );
      } else {
        // Trillions and beyond
        const trillions = parseInt(numStr.slice(0, -12));
        const remainder = parseInt(numStr.slice(-12));
        return (
          convertLessThanOneThousand(trillions) +
          " Trillion" +
          (trillions !== 1 ? "s" : "") +
          (remainder !== 0 ? " " + convertNumberToWords(remainder) : "")
        );
      }
    };

    // Handle decimal amounts
    const rupees = Math.floor(num);
    const paisa = Math.round((num - rupees) * 100);

    let result = "";

    if (rupees === 0 && paisa === 0) return "Zero";

    if (rupees > 0) {
      result = convertNumberToWords(rupees);
      // Add "Rupees" only once at the end
      result += " Rupees";
    }

    if (paisa > 0) {
      if (result) result += " and ";
      result += convertLessThanOneThousand(paisa) + " Paisa";
    }

    return result;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Box
        sx={{
          width: "95%",
          maxWidth: "1200px",
          maxHeight: "95vh",
          bgcolor: "background.paper",
          boxShadow: 24,
          borderRadius: 1,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <Box
          className="modal-header print-buttons"
          sx={{
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 2,
            py: 1,
          }}
        >
          <Typography variant="h6" sx={{ fontWeight: "bold" }}>
            Sales Tax Invoice
          </Typography>
          <Box>
            {/* Print button for all invoice statuses */}
            <IconButton
              onClick={onPrint}
              sx={{ color: "primary.contrastText", mr: 1 }}
              title={`Print ${invoice?.status === "posted" ? "Invoice" : invoice?.status === "draft" ? "Draft Invoice" : "Saved Invoice"}`}
            >
              <PrintIcon />
            </IconButton>
            <IconButton
              onClick={onClose}
              sx={{ color: "primary.contrastText" }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Invoice Content */}
        <Box
          className="invoice-print-content invoice-view-modal"
          sx={{
            p: 3,
            overflowY: "auto",
            fontFamily: "Arial, sans-serif",
            fontSize: "12px",
            color: "#000",
            maxHeight: "calc(95vh - 80px)", // Account for header height
          }}
        >
          {/* Header Section */}
          <Box
            className="header"
            sx={{ textAlign: "center", mb: 2, position: "relative" }}
          >
            <Typography variant="h4" sx={{ fontWeight: "bold", mb: 1 }}>
              Sales Tax Invoice
            </Typography>
          </Box>

          {/* Invoice Info Row */}
          <Box
            className="flex-row"
            sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}
          >
            <Box className="section">
              <Typography variant="body2">
                <strong>Invoice #:</strong> {invoice.invoiceNumber}
              </Typography>
              <Typography variant="body2">
                <strong>Company Invoice Ref No:</strong>{" "}
                {invoice.companyInvoiceRefNo || "N/A"}
              </Typography>
            </Box>
            <Box className="section">
              <Typography variant="body2">
                <strong>Date:</strong> {formatDate(invoice.invoiceDate)}
              </Typography>
            </Box>
          </Box>

          {/* Buyer and Seller Info */}
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
            {/* Buyer Section */}
            <Box sx={{ flex: 1, mr: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: "bold", mb: 1 }}>
                Buyer:
              </Typography>
              <Typography variant="body2">
                {invoice.buyerBusinessName}
              </Typography>
              <Typography variant="body2">{invoice.buyerAddress}</Typography>
              <Typography variant="body2">
                REGION: {invoice.buyerProvince}
              </Typography>
              <Typography variant="body2">
                NTN: {invoice.buyerNTNCNIC}
              </Typography>
              <Typography variant="body2">
                TYPE: {invoice.buyerRegistrationType}
              </Typography>
            </Box>

            {/* Seller Section */}
            <Box
              sx={{
                flex: 1,
                ml: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: "bold", mb: 1 }}>
                Seller:
              </Typography>
              <Typography variant="body2" align="right">
                {invoice.sellerBusinessName}
              </Typography>
              <Typography
                sx={{ maxWidth: "250px" }}
                variant="body2"
                align="right"
              >
                {invoice.sellerAddress}
                <br />
                {invoice.sellerCity}
              </Typography>
              <Typography variant="body2" align="right">
                NTN: {invoice.sellerFullNTN || invoice.sellerNTNCNIC}
              </Typography>
            </Box>
          </Box>

          {/* Items Table */}
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    SR No.
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    HS Code
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Product Description
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Quantity
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Unit Price
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Rate
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Tax Rate (%)
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Sales Tax
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Extra Tax
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Further Tax
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    FED
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Advance Income Tax
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Discount
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Sales Tax Withheld
                  </TableCell>
                  <TableCell
                    sx={{
                      bgcolor: "#2c7c93",
                      color: "white",
                      fontWeight: "bold",
                      textAlign: "center",
                      fontSize: "11px",
                      p: 1,
                    }}
                  >
                    Total (incl. Tax)
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(invoice.items || []).map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {idx + 1}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {item.hsCode}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {item.productDescription || "N/A"}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(item.quantity)}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(parseFloat(item.unitPrice))}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(
                        parseFloat(item.valueSalesExcludingST)
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {item.rate}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(
                        parseFloat(item.salesTaxApplicable)
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(parseFloat(item.extraTax))}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(parseFloat(item.furtherTax))}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(parseFloat(item.fedPayable))}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {item.advanceIncomeTax === null ||
                      item.advanceIncomeTax === undefined ||
                      item.advanceIncomeTax === ""
                        ? "0"
                        : formatNumberWithCommas(
                            parseFloat(item.advanceIncomeTax)
                          )}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(parseFloat(item.discount))}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(
                        parseFloat(item.salesTaxWithheldAtSource)
                      )}
                    </TableCell>
                    <TableCell
                      sx={{
                        border: "1px solid #157492",
                        textAlign: "center",
                        fontSize: "11px",
                        p: 1,
                      }}
                    >
                      {formatNumberWithCommas(parseFloat(item.totalValues))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Summary Box and Total in Words */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "flex-start",
            }}
          >
            {/* Summary Box */}
            <Box
              className="summary-box"
              sx={{
                width: "300px",
                bgcolor: "#eee",
                p: 2,
                border: "1px solid #ccc",
                textAlign: "right",
              }}
            >
              <Typography variant="body2" sx={{ mb: 1 }}>
                Sub Total (Excl. Tax): {formatNumberWithCommas(subTotal)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Sales Tax (GST): {formatNumberWithCommas(gst)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Further Tax: {formatNumberWithCommas(further)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Extra Tax: {formatNumberWithCommas(extra)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                fedPayable: {formatNumberWithCommas(fed)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Advance Income Tax:{" "}
                {formatNumberWithCommas(advanceIncomeTaxTotal)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Discount: {formatNumberWithCommas(dis)}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                Sales Tax Withheld: {formatNumberWithCommas(withheld)}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                Grand Total (Incl. All Taxes): Rs.{" "}
                {formatNumberWithCommas(grandTotal)}
              </Typography>
            </Box>
          </Box>

          {/* Clear fix */}
          <div style={{ clear: "both" }}></div>

          {/* Total in Words */}
          <Box className="total-in-words" sx={{ mt: 3, mb: 4, clear: "both" }}>
            <Typography variant="body2" sx={{ fontWeight: "bold" }}>
              Total in words:
              <br />
              {(() => {
                const words = convertToWords(grandTotal);
                // Preserve capital R in Rupees and capital P in Paisa
                const displayText = words
                  .toLowerCase()
                  .replace(/^\w/, (c) => c.toUpperCase())
                  .replace(/\brupees\b/g, "Rupees")
                  .replace(/\bpaisa\b/g, "Paisa");
                return displayText + " Only";
              })()}
            </Typography>
          </Box>

          {/* QR Box */}
          <Box
            className="qr-box"
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 4,
            }}
          ></Box>
        </Box>
      </Box>
    </Modal>
  );
};

export default InvoiceViewModal;
