import * as React from "react";
import {
  Box,
  InputLabel,
  TextField,
  Select,
  MenuItem,
  FormControl,
  Typography,
  Autocomplete,
  CircularProgress,
} from "@mui/material";
import { DemoContainer } from "@mui/x-date-pickers/internals/demo";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import Button from "@mui/material/Button";
import dayjs from "dayjs";
import { fetchData, postData } from "../API/GetApi";
import { api } from "../API/Api";
import { checkRegistrationStatusWithDate } from "../API/FBRService";
import RateSelector from "../component/RateSelector";
import SROScheduleNumber from "../component/SROScheduleNumber";
import SROItem from "../component/SROItem";
import UnitOfMeasurement from "../component/UnitOfMeasurement";
import BillOfLadingUoM from "../component/BillOfLadingUoM";
import OptimizedHSCodeSelector from "../component/OptimizedHSCodeSelector";
import Swal from "sweetalert2";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_CONFIG } from "../API/Api";
import TenantSelectionPrompt from "../component/TenantSelectionPrompt";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import TenantDashboard from "../component/TenantDashboard";

// Don't destructure sandBoxTestToken at import time, use it dynamically
const { apiKeyLocal } = API_CONFIG;

export default function ProductionFoam() {
  const { selectedTenant } = useTenantSelection();

  const [formData, setFormData] = React.useState({
    invoiceType: "",
    invoiceDate: dayjs(),
    sellerNTNCNIC: "",
    sellerFullNTN: "",
    sellerBusinessName: "",
    sellerProvince: "",
    sellerAddress: "",
    buyerNTNCNIC: "",
    buyerBusinessName: "",
    buyerProvince: "",
    buyerAddress: "",
    buyerRegistrationType: "",
    invoiceRefNo: "",
    companyInvoiceRefNo: "",
    transactionTypeId: "",
    items: [
      {
        hsCode: "",
        productDescription: "",
        rate: "",
        uoM: "",
        quantity: "1",
        totalValues: "0",
        valueSalesExcludingST: "0",
        fixedNotifiedValueOrRetailPrice: "1",
        salesTaxApplicable: "0",
        salesTaxWithheldAtSource: "0",
        sroScheduleNo: "",
        sroItemSerialNo: "",
        saleType: "",
        isSROScheduleEnabled: false,
        isSROItemEnabled: false,
        extraTax: "",
        furtherTax: "0",
        fedPayable: "0",
        discount: "0",
        isValueSalesManual: false,
      },
    ],
  });

  const [transactionTypes, setTransactionTypes] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [isPrintable, setIsPrintable] = React.useState(false);
  const [province, setProvince] = React.useState([]);
  const [hsCodeList, setHsCodeList] = React.useState([]);
  const [invoiceTypes, setInvoiceTypes] = React.useState([]);
  const [buyers, setBuyers] = useState([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState("");
  const navigate = useNavigate();
  const [allLoading, setAllLoading] = React.useState(true);

  // State for FBR registration status
  const [fbrRegistrationStatus, setFbrRegistrationStatus] = React.useState({
    loading: false,
    isActive: null,
    shouldApplyFurtherTax: null,
    message: "",
    error: null
  });

  const handleChange = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Update form data when selected tenant changes
  React.useEffect(() => {
    if (selectedTenant) {
      setFormData((prev) => ({
        ...prev,
        sellerNTNCNIC: selectedTenant.sellerNTNCNIC || "",
        sellerFullNTN: selectedTenant.sellerFullNTN || "",
        sellerBusinessName: selectedTenant.sellerBusinessName || "",
        sellerProvince: selectedTenant.sellerProvince || "",
        sellerAddress: selectedTenant.sellerAddress || "",
      }));
    } else {
      // Clear seller fields if no tenant is selected
      setFormData((prev) => ({
        ...prev,
        sellerNTNCNIC: "",
        sellerFullNTN: "",
        sellerBusinessName: "",
        sellerProvince: "",
        sellerAddress: "",
      }));
    }
  }, [selectedTenant]);

  React.useEffect(() => {
    setAllLoading(true);
    Promise.allSettled([
      fetchData("pdi/v1/provinces").then((response) => {
        setProvince(response);
        localStorage.setItem("provinceResponse", JSON.stringify(response));
      }),
      // HS codes will be loaded by OptimizedHSCodeSelector component with caching
      Promise.resolve([]),
      fetchData("pdi/v1/doctypecode", "production")
        .then((data) => setInvoiceTypes(data))
        .catch(() =>
          setInvoiceTypes([
            { docTypeId: 4, docDescription: "Sale Invoice" },
            { docTypeId: 9, docDescription: "Debit Note" },
          ])
        ),
      fetchData("pdi/v1/transtypecode", "production").then((res) =>
        setTransactionTypes(res)
      ),
    ]).finally(() => setAllLoading(false));
  }, [selectedTenant]);

  useEffect(() => {
    const fetchBuyers = async () => {
      try {
        if (!selectedTenant) {
          console.error("No Company selected");
          setBuyers([]);
          return;
        }

        const response = await api.get(
          `/tenant/${selectedTenant.tenant_id}/buyers/all`
        );

        if (response.data.success) {
          setBuyers(response.data.data.buyers || []);
        } else {
          console.error("Failed to fetch buyers:", response.data.message);
          setBuyers([]);
        }
      } catch (error) {
        console.error("Error fetching buyers:", error);
        setBuyers([]);
      }
    };

    fetchBuyers();
  }, [selectedTenant]);

  useEffect(() => {
    if (!selectedBuyerId) return;
    const buyer = buyers.find((b) => b.id === selectedBuyerId);
    if (buyer) {
      setFormData((prev) => ({
        ...prev,
        buyerNTNCNIC: buyer.buyerNTNCNIC || "",
        buyerBusinessName: buyer.buyerBusinessName || "",
        buyerProvince: buyer.buyerProvince || "",
        buyerAddress: buyer.buyerAddress || "",
        buyerRegistrationType: buyer.buyerRegistrationType || "",
      }));
    }
  }, [selectedBuyerId, buyers]);

  // Effect to handle buyer selection and call FBR API for registration status
  React.useEffect(() => {
    if (!selectedBuyerId || buyers.length === 0) {
      // Reset FBR status when no buyer is selected
      setFbrRegistrationStatus({
        loading: false,
        isActive: null,
        shouldApplyFurtherTax: null,
        message: "",
        error: null
      });
      return;
    }

    const buyer = buyers.find((b) => b.id === selectedBuyerId);
    if (!buyer || !buyer.buyerNTNCNIC) {
      console.log("No buyer found or buyer has no NTN/CNIC");
      return;
    }

    // Call FBR API to check registration status
    const checkFbrStatus = async () => {
      try {
        setFbrRegistrationStatus(prev => ({ ...prev, loading: true, error: null }));
        
        const currentDate = dayjs().format('YYYY-MM-DD');
        console.log(`Checking FBR status for NTN: ${buyer.buyerNTNCNIC}, Date: ${currentDate}`);
        
        const result = await checkRegistrationStatusWithDate(buyer.buyerNTNCNIC, currentDate);
        
        console.log("FBR API result:", result);
        
        setFbrRegistrationStatus({
          loading: false,
          isActive: result.isActive,
          shouldApplyFurtherTax: result.shouldApplyFurtherTax,
          message: result.message,
          error: null
        });

        // Update Further Tax for all items based on FBR status
        if (result.shouldApplyFurtherTax !== null) {
          setFormData(prev => ({
            ...prev,
            items: prev.items.map(item => {
              // Only auto-calculate if not manually edited
              if (item.isFurtherTaxManual) {
                // If manually edited, only recalculate Total Values with current Further Tax
                const calculatedTotalBeforeDiscount =
                  parseFloat(item.valueSalesExcludingST || 0) +
                  parseFloat(item.salesTaxApplicable || 0) +
                  parseFloat(item.furtherTax || 0) + // Use current Further Tax value
                  parseFloat(item.fedPayable || 0) +
                  parseFloat(item.extraTax || 0);

                const discountAmount = parseFloat(item.discount || 0);
                const totalAfterDiscount = calculatedTotalBeforeDiscount - discountAmount;
                const taxWithheld = parseFloat(item.salesTaxWithheldAtSource || 0);
                const calculatedTotal = Number((totalAfterDiscount + taxWithheld).toFixed(2));
                
                return {
                  ...item,
                  totalValues: calculatedTotal.toString(), // Update Total Values
                };
              }
              
              const valueSalesExcludingST = parseFloat(item.valueSalesExcludingST) || 0;
              const furtherTaxAmount = result.shouldApplyFurtherTax ? (valueSalesExcludingST * 0.04) : 0;
              
              // Recalculate Total Values when Further Tax changes
              const calculatedTotalBeforeDiscount =
                parseFloat(item.valueSalesExcludingST || 0) +
                parseFloat(item.salesTaxApplicable || 0) +
                furtherTaxAmount + // Use the new Further Tax amount
                parseFloat(item.fedPayable || 0) +
                parseFloat(item.extraTax || 0);

              const discountAmount = parseFloat(item.discount || 0);
              const totalAfterDiscount = calculatedTotalBeforeDiscount - discountAmount;
              const taxWithheld = parseFloat(item.salesTaxWithheldAtSource || 0);
              const calculatedTotal = Number((totalAfterDiscount + taxWithheld).toFixed(2));
              
              return {
                ...item,
                furtherTax: furtherTaxAmount.toFixed(2), // Calculate 4% of Value Sales (Excluding ST)
                totalValues: calculatedTotal.toString(), // Update Total Values
              };
            })
          }));
        }

      } catch (error) {
        console.error("Error checking FBR registration status:", error);
        setFbrRegistrationStatus({
          loading: false,
          isActive: null,
          shouldApplyFurtherTax: null,
          message: "",
          error: error.message
        });
      }
    };

    checkFbrStatus();
  }, [selectedBuyerId, buyers]);

  // Effect to recalculate Total Values when Further Tax is manually changed
  React.useEffect(() => {
    if (fbrRegistrationStatus.shouldApplyFurtherTax !== null) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.isFurtherTaxManual) {
            // If manually edited, only recalculate Total Values with current Further Tax
            const calculatedTotalBeforeDiscount =
              parseFloat(item.valueSalesExcludingST || 0) +
              parseFloat(item.salesTaxApplicable || 0) +
              parseFloat(item.furtherTax || 0) + // Use current Further Tax value
              parseFloat(item.fedPayable || 0) +
              parseFloat(item.extraTax || 0);

            const discountAmount = parseFloat(item.discount || 0);
            const totalAfterDiscount = calculatedTotalBeforeDiscount - discountAmount;
            const taxWithheld = parseFloat(item.salesTaxWithheldAtSource || 0);
            const calculatedTotal = Number((totalAfterDiscount + taxWithheld).toFixed(2));
            
            return {
              ...item,
              totalValues: calculatedTotal.toString(), // Update Total Values
            };
          }
          
          // For non-manual further tax, don't recalculate - let user control it
          return item;
        })
      }));
    }
  }, [fbrRegistrationStatus.shouldApplyFurtherTax]);

  // Effect to calculate Further Tax when Value Sales changes (for new invoices)
  React.useEffect(() => {
    if (fbrRegistrationStatus.shouldApplyFurtherTax !== null) {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          // Only auto-calculate if not manually edited and FBR status requires further tax
          if (!item.isFurtherTaxManual && fbrRegistrationStatus.shouldApplyFurtherTax) {
            const valueSalesExcludingST = parseFloat(item.valueSalesExcludingST) || 0;
            const furtherTaxAmount = valueSalesExcludingST * 0.04;
            
            // Recalculate Total Values when Further Tax changes
            const calculatedTotalBeforeDiscount =
              parseFloat(item.valueSalesExcludingST || 0) +
              parseFloat(item.salesTaxApplicable || 0) +
              furtherTaxAmount + // Use the new Further Tax amount
              parseFloat(item.fedPayable || 0) +
              parseFloat(item.extraTax || 0);

            const discountAmount = parseFloat(item.discount || 0);
            const totalAfterDiscount = calculatedTotalBeforeDiscount - discountAmount;
            const taxWithheld = parseFloat(item.salesTaxWithheldAtSource || 0);
            const calculatedTotal = Number((totalAfterDiscount + taxWithheld).toFixed(2));
            
            return {
              ...item,
              furtherTax: furtherTaxAmount.toFixed(2), // Calculate 4% of Value Sales (Excluding ST)
              totalValues: calculatedTotal.toString(), // Update Total Values
            };
          }
          
          return item;
        })
      }));
    }
  }, [formData.items.map(item => item.valueSalesExcludingST).join(','), fbrRegistrationStatus.shouldApplyFurtherTax]);

  const handleItemChange = (index, field, value) => {
    setFormData((prev) => {
      const updatedItems = [...prev.items];
      const item = { ...updatedItems[index] };

      // Utility to parse values
      const parseValue = (val, isFloat = true) =>
        val === "" ? (isFloat ? 0 : "") : isFloat ? parseFloat(val) || 0 : val;

      // Update the field - store the raw string value for display
      if (
        [
          "quantity",
          "fixedNotifiedValueOrRetailPrice",
          "valueSalesExcludingST",
          "salesTaxApplicable",
          "totalValues",
          "salesTaxWithheldAtSource",
          "extraTax",
          "furtherTax",
          "fedPayable",
          "discount",
        ].includes(field)
      ) {
        // Store the raw string value for display
        item[field] = value;
        if (field === "valueSalesExcludingST") {
          item.isValueSalesManual = true;
        }
      } else {
        item[field] = value;
      }

      // Handle SRO reset logic
      if (field === "rate" && value) {
        item.isSROScheduleEnabled = true;
        item.sroScheduleNo = "";
        item.sroItemSerialNo = "";
        item.isSROItemEnabled = false;
        item.isValueSalesManual = false;

        // Auto-set uoM to "Bill of lading" for scenario SN018 when rate contains "/bill"
        if (prev.scenarioId === "SN018" && value.includes("/bill")) {
          item.uoM = "Bill of lading";
          console.log(
            `Auto-setting uoM to "Bill of lading" for rate "${value}" in scenario SN018`
          );
        }
        // Auto-set uoM to "SqY" for scenario SN019 when rate contains "/SqY"
        if (prev.scenarioId === "SN019" && value.includes("/SqY")) {
          item.uoM = "SqY";
          console.log(
            `Auto-setting uoM to "SqY" for rate "${value}" in scenario SN019`
          );
        }
      }

      if (field === "sroScheduleNo" && value) {
        item.isSROItemEnabled = true;
        item.sroItemSerialNo = "";
      }

      // Begin calculations
      if (!item.isValueSalesManual) {
        // NEW LOGIC: unitCost is the total cost, not multiplied by quantity
        const unitCost = parseFloat(item.fixedNotifiedValueOrRetailPrice || 0);
        const rate = parseFloat((item.rate || "0").replace("%", "")) || 0;

        // Value without sales tax is just the unit cost
        item.valueSalesExcludingST = unitCost.toString();

        // Sales tax
        console.log("Production - Checking rate conditions:", item.rate);
        if (
          item.rate &&
          item.rate.toLowerCase() !== "exempt" &&
          item.rate !== "0%"
        ) {
          console.log("Production - Rate conditions passed:", item.rate);
          let salesTax = 0;

          // Check if rate is in "RS." format (fixed amount)
          console.log(
            "Production - Checking rate:",
            item.rate,
            "Type:",
            typeof item.rate
          );
          if (
            item.rate &&
            (item.rate.includes("RS.") ||
              item.rate.includes("rs.") ||
              item.rate.includes("Rs."))
          ) {
            const fixedAmount =
              parseFloat(item.rate.replace(/RS\./i, "").trim()) || 0;
            console.log(
              "Production - RS. format detected, fixedAmount:",
              fixedAmount
            );
            salesTax = fixedAmount; // Fixed amount directly
          } else if (item.rate.includes("/bill")) {
            const fixedAmount = parseFloat(item.rate.replace("/bill", "")) || 0;
            const quantity = parseFloat(item.quantity || 0);
            salesTax = fixedAmount * quantity; // Fixed amount per item × quantity
          } else if (item.rate.includes("/SqY")) {
            // Check if rate is in "/SqY" format (fixed amount per SqY)
            const fixedAmount = parseFloat(item.rate.replace("/SqY", "")) || 0;
            const quantity = parseFloat(item.quantity || 0);
            salesTax = fixedAmount * quantity; // Fixed amount per SqY × quantity
          } else {
            // Handle percentage rates
            const rate = parseFloat((item.rate || "0").replace("%", "")) || 0;
            const rateFraction = rate / 100;
            salesTax = unitCost * rateFraction;
          }

          item.salesTaxApplicable = salesTax.toString();
        } else {
          item.salesTaxApplicable = "0";
          item.salesTaxWithheldAtSource = "0";
        }

        // Total before discount
        let totalBeforeDiscount =
          parseFloat(item.valueSalesExcludingST || 0) +
          parseFloat(item.salesTaxApplicable || 0) +
          parseFloat(item.furtherTax || 0) +
          parseFloat(item.fedPayable || 0) +
          parseFloat(item.extraTax || 0);

        // Discount as percentage
        let discountPercent = parseFloat(item.discount || 0);
        let discountAmount = 0;
        if (discountPercent > 0) {
          discountAmount = (totalBeforeDiscount * discountPercent) / 100;
        }
        const totalValue = Number(
          (totalBeforeDiscount - discountAmount).toFixed(2)
        );
        item.totalValues = totalValue.toString();
      }

      // Parse extra fields always as numbers for calculations
      const extraTaxNum = parseInt(item.extraTax, 10) || 0;
      const furtherTaxNum = parseFloat(item.furtherTax || 0);
      const fedPayableNum = parseFloat(item.fedPayable || 0);
      const discountNum = parseFloat(item.discount || 0);

      // Calculate totals
      const totalValue =
        parseFloat(item.valueSalesExcludingST || 0) +
        parseFloat(item.salesTaxApplicable || 0) +
        furtherTaxNum +
        fedPayableNum +
        extraTaxNum -
        discountNum;

      item.totalValues = Number(totalValue.toFixed(2)).toString();

      updatedItems[index] = item;
      return { ...prev, items: updatedItems };
    });
  };

  const addNewItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          hsCode: "",
          productDescription: "",
          rate: "",
          uoM: "",
          quantity: "1",
          totalValues: "0",
          valueSalesExcludingST: "0",
          fixedNotifiedValueOrRetailPrice: "1",
          salesTaxApplicable: "0",
          salesTaxWithheldAtSource: "0",
          sroScheduleNo: "",
          sroItemSerialNo: "",
          billOfLadingUoM: "",
          extraTax: "",
          furtherTax: "0",
          fedPayable: "0",
          discount: "0",
          saleType: "Goods at Standard Rate (default)",
          isSROScheduleEnabled: false,
          isSROItemEnabled: false,
          isValueSalesManual: false,
        },
      ],
    }));
  };

  const removeItem = (index) => {
    // Clean up item-specific localStorage entries and reindex remaining items
    const currentItems = formData.items;

    // Remove the current item's entries
    localStorage.removeItem(`selectedRateId_${index}`);
    localStorage.removeItem(`SROId_${index}`);

    // Reindex remaining items (shift down by 1)
    for (let i = index + 1; i < currentItems.length; i++) {
      const oldRateId = localStorage.getItem(`selectedRateId_${i}`);
      const oldSROId = localStorage.getItem(`SROId_${i}`);

      if (oldRateId) {
        localStorage.setItem(`selectedRateId_${i - 1}`, oldRateId);
        localStorage.removeItem(`selectedRateId_${i}`);
      }

      if (oldSROId) {
        localStorage.setItem(`SROId_${i - 1}`, oldSROId);
        localStorage.removeItem(`SROId_${i}`);
      }
    }

    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleTransactionTypeChange = (desc) => {
    const selectedType = transactionTypes.find(
      (item) => item.transactioN_DESC === desc
    );
    if (!selectedType) return;

    // Check if there are items with data and show warning
    const hasItemsWithData = formData.items.some(
      (item) =>
        item.hsCode ||
        item.productDescription ||
        item.rate ||
        item.uoM ||
        parseFloat(item.quantity) > 1 ||
        parseFloat(item.valueSalesExcludingST) > 0
    );

    if (hasItemsWithData) {
      Swal.fire({
        title: "Warning",
        text: "Changing the transaction type will reset your items. Are you sure you want to continue?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, change it!",
        cancelButtonText: "Cancel",
      }).then((result) => {
        if (result.isConfirmed) {
          // User confirmed - proceed with transaction type change and reset items
          proceedWithTransactionTypeChange(selectedType);
          Swal.fire({
            title: "Items Reset",
            text: "Your items have been reset due to transaction type change.",
            icon: "info",
            confirmButtonColor: "#2A69B0",
            timer: 2000,
            showConfirmButton: false,
          });
        }
        // If user cancels, do nothing - the transaction type remains unchanged
      });
      return;
    }

    // If no items with data, proceed normally
    proceedWithTransactionTypeChange(selectedType);
  };

  const proceedWithTransactionTypeChange = (selectedType) => {
    console.log("selectedType", selectedType.transactioN_TYPE_ID);
    localStorage.setItem("transactionTypeId", selectedType.transactioN_TYPE_ID);
    localStorage.setItem("saleType", selectedType.transactioN_DESC);
    setFormData((prev) => ({
      ...prev,
      transactionTypeId: selectedType.transactioN_TYPE_ID,
      items: [
        {
          hsCode: "",
          productDescription: "",
          rate: "",
          uoM: "",
          quantity: "1",
          totalValues: "0",
          valueSalesExcludingST: "0",
          fixedNotifiedValueOrRetailPrice: "1",
          salesTaxApplicable: "0",
          salesTaxWithheldAtSource: "0",
          sroScheduleNo: "",
          sroItemSerialNo: "",
          saleType: selectedType.transactioN_DESC,
          isSROScheduleEnabled: false,
          isSROItemEnabled: false,
          extraTax: "",
          furtherTax: "0",
          fedPayable: "0",
          discount: "0",
          isValueSalesManual: false,
        },
      ],
    }));
  };

  const handleSubmitChange = async () => {
    setLoading(true);
    try {
      // Validate that a tenant is selected and seller information is populated
      if (!selectedTenant) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: "Please select a Company before creating an invoice.",
          confirmButtonColor: "#d33",
        });
        setLoading(false);
        return;
      }

      // Validate seller fields
      const sellerRequiredFields = [
        { field: "sellerNTNCNIC", label: "Seller NTN/CNIC" },
        { field: "sellerBusinessName", label: "Seller Business Name" },
        { field: "sellerProvince", label: "Seller Province" },
        { field: "sellerAddress", label: "Seller Address" },
      ];

      for (const { field, label } of sellerRequiredFields) {
        if (!formData[field] || formData[field].trim() === "") {
          Swal.fire({
            icon: "error",
            title: "Error",
            text: `${label} is required. Please select a Company to populate seller information.`,
            confirmButtonColor: "#d33",
          });
          setLoading(false);
          return;
        }
      }

      for (const [index, item] of formData.items.entries()) {
        const itemRequiredFields = [
          {
            field: "hsCode",
            message: `HS Code is required for item ${index + 1}`,
            validate: (value) => {
              if (!value || value.trim() === "") {
                return `HS Code is required for item ${index + 1}`;
              }
              if (value.length > 50) {
                return `HS Code must be 50 characters or less for item ${index + 1}`;
              }
              return null;
            },
          },
          {
            field: "productDescription",
            message: `Product Description is required for item ${index + 1}`,
          },
          { field: "rate", message: `Rate is required for item ${index + 1}` },
          {
            field: "uoM",
            message: `Unit of Measurement is required for item ${index + 1}`,
          },
          {
            field: "quantity",
            message: `Quantity is required for item ${index + 1}`,
          },
          {
            field: "valueSalesExcludingST",
            message: `Value Sales Excluding ST is required for item ${
              index + 1
            }`,
          },
          ...(item.rate && item.rate.toLowerCase() === "exempt"
            ? [
                {
                  field: "sroScheduleNo",
                  message: `SRO Schedule Number is required for exempt item ${
                    index + 1
                  }`,
                },
                {
                  field: "sroItemSerialNo",
                  message: `SRO Item Serial Number is required for exempt item ${
                    index + 1
                  }`,
                },
              ]
            : []),
          ...(item.rate &&
          item.rate.includes("/bill") &&
          formData.scenarioId === "SN018"
            ? [
                {
                  field: "billOfLadingUoM",
                  message: `Bill of lading UoM is required for Services FED in ST Mode with ${
                    item.rate
                  } rate for item ${index + 1}`,
                },
              ]
            : []),
        ];

        for (const fieldConfig of itemRequiredFields) {
          const { field, message, validate } = fieldConfig;

          if (validate) {
            // Use custom validation function
            const validationError = validate(item[field]);
            if (validationError) {
              Swal.fire({
                icon: "error",
                title: "Error",
                text: validationError,
                confirmButtonColor: "#d33",
              });
              setLoading(false);
              return;
            }
          } else {
            // Use default validation
            if (
              !item[field] ||
              (field === "valueSalesExcludingST" && item[field] <= 0)
            ) {
              Swal.fire({
                icon: "error",
                title: "Error",
                text: message,
                confirmButtonColor: "#d33",
              });
              setLoading(false);
              return;
            }
          }
        }
      }

      const cleanedItems = formData.items.map(
        ({ isSROScheduleEnabled, isSROItemEnabled, ...rest }) => {
          // Special handling for uoM in scenario SN018 with rate containing "/bill"
          let uoMValue = rest.uoM?.trim() || null;
          if (
            formData.scenarioId === "SN018" &&
            rest.rate &&
            rest.rate.includes("/bill")
          ) {
            uoMValue = "Bill of lading";
            console.log(
              `Forcing uoM to "Bill of lading" for scenario SN018 with rate "${rest.rate}"`
            );
          }
          if (
            formData.scenarioId === "SN019" &&
            rest.rate &&
            rest.rate.includes("/SqY")
          ) {
            uoMValue = "SqY";
            console.log(
              `Forcing uoM to "SqY" for scenario SN019 with rate "${rest.rate}"`
            );
          }

          const baseItem = {
            ...rest,
            quantity: rest.quantity === "" ? 0 : parseInt(rest.quantity, 10),
            sroScheduleNo: rest.sroScheduleNo?.trim() || "",
            sroItemSerialNo: rest.sroItemSerialNo?.trim() || "",
            uoM: uoMValue,
            productDescription: rest.productDescription?.trim() || "N/A",
            saleType:
              rest.saleType?.trim() || "Goods at standard rate (default)",
            furtherTax: Number(rest.furtherTax) || 0,
            fedPayable: Number(rest.fedPayable) || 0,
            discount: Number(rest.discount) || 0,
            salesTaxApplicable:
              Math.round(Number(rest.salesTaxApplicable) * 100) / 100,
            totalValues: Number(Number(rest.totalValues).toFixed(2)),
          };

          // Only include extraTax if saleType is NOT "Goods at Reduced Rate"
          if (rest.saleType?.trim() !== "Goods at Reduced Rate") {
            baseItem.extraTax = Number(rest.extraTax) || 0;
          }

          return baseItem;
        }
      );

      const cleanedData = {
        ...formData,
        invoiceDate: dayjs(formData.invoiceDate).format("YYYY-MM-DD"),
        items: cleanedItems,
      };

      // Validate with FBR API through backend
      const validateRes = await api.post(
        `/tenant/${selectedTenant.tenant_id}/validate-invoice?environment=production`,
        cleanedData
      );

      // Handle different FBR response structures
      const validationData = validateRes.data?.data || validateRes.data;
      const hasValidationResponse =
        validationData && validationData.validationResponse;
      const isValidationSuccess =
        validateRes.status === 200 &&
        (hasValidationResponse
          ? validationData.validationResponse.statusCode === "00"
          : true);

      if (isValidationSuccess) {
        try {
          const postRes = await api.post(
            `/tenant/${selectedTenant.tenant_id}/submit-invoice?environment=production`,
            cleanedData
          );
          console.log("Post Invoice Response:", postRes);
          // Handle different FBR response structures for post
          const postResponseData = postRes.data?.data || postRes.data;
          const hasPostValidationResponse =
            postResponseData && postResponseData.validationResponse;
          const isPostSuccess =
            postRes.status === 200 &&
            (hasPostValidationResponse
              ? postResponseData.validationResponse.statusCode === "00"
              : true);

          if (isPostSuccess) {
            const invoiceNumber = postResponseData.invoiceNumber;
            Swal.fire({
              icon: "success",
              title: "Invoice Created Successfully!",
              text: `Invoice Number: ${invoiceNumber}`,
              showCancelButton: true,
              confirmButtonText: "View Invoice",
              cancelButtonText: "Create New",
              confirmButtonColor: "#28a745",
              cancelButtonColor: "#6c757d",
              reverseButtons: true,
            }).then((result) => {
              if (result.isConfirmed) {
                // Navigate to view invoice
                navigate("/your-invoices");
              } else {
                // Reset form and create new invoice
                resetForm();
              }
            });
            setIsPrintable(true);
          } else {
            // Handle different error response structures with detailed error information
            let errorMessage = "Invoice submission failed.";
            let errorDetails = [];

            if (hasPostValidationResponse) {
              const validation = postResponseData.validationResponse;
              if (validation.error) {
                errorMessage = validation.error;
              }
              // Check for item-specific errors
              if (
                validation.invoiceStatuses &&
                Array.isArray(validation.invoiceStatuses)
              ) {
                validation.invoiceStatuses.forEach((status, index) => {
                  if (status.error) {
                    errorDetails.push(`Item ${index + 1}: ${status.error}`);
                  }
                });
              }
            } else if (postResponseData.error) {
              errorMessage = postResponseData.error;
            } else if (postResponseData.message) {
              errorMessage = postResponseData.message;
            } else if (postRes.data?.message) {
              errorMessage = postRes.data.message;
            }

            // Check for additional error details in the response
            if (
              postResponseData.invoiceStatuses &&
              Array.isArray(postResponseData.invoiceStatuses)
            ) {
              postResponseData.invoiceStatuses.forEach((status, index) => {
                if (status.error) {
                  errorDetails.push(`Item ${index + 1}: ${status.error}`);
                }
              });
            }

            // Combine error message with details
            const fullErrorMessage =
              errorDetails.length > 0
                ? `${errorMessage}\n\nDetails:\n${errorDetails.join("\n")}`
                : errorMessage;

            Swal.fire({
              icon: "error",
              title: "FBR Submission Failed",
              text: fullErrorMessage,
              confirmButtonColor: "#d33",
              width: "600px",
              customClass: {
                popup: "swal-wide",
              },
            });
          }
        } catch (postError) {
          console.error("Post Invoice Error:", {
            message: postError.message,
            status: postError.response?.status,
            data: postError.response?.data,
          });

          // Enhanced error handling for different types of errors
          let errorTitle = "Error";
          let errorMessage = "Failed to submit invoice";
          let errorDetails = [];

          // Check if it's a validation error from FBR
          const postErrorResponse = postError.response?.data;

          if (postErrorResponse) {
            // Handle FBR API validation errors
            const fbrError =
              postErrorResponse?.validationResponse?.error ||
              postErrorResponse?.error ||
              postErrorResponse?.message;

            if (fbrError) {
              errorTitle = "FBR Submission Error";
              errorMessage = fbrError;

              // Check for item-specific errors in validation response
              if (postErrorResponse.validationResponse?.invoiceStatuses) {
                postErrorResponse.validationResponse.invoiceStatuses.forEach(
                  (status, index) => {
                    if (status.error) {
                      errorDetails.push(`Item ${index + 1}: ${status.error}`);
                    }
                  }
                );
              }
            } else {
              // Handle other API response errors
              if (
                postErrorResponse.errors &&
                Array.isArray(postErrorResponse.errors)
              ) {
                errorDetails = postErrorResponse.errors;
              } else if (postErrorResponse.message) {
                errorMessage = postErrorResponse.message;
              }
            }
          } else {
            // Handle network and other errors
            if (postError.code === "ECONNABORTED") {
              errorTitle = "Request Timeout";
              errorMessage = "FBR API request timed out. Please try again.";
            } else if (postError.code === "ERR_NETWORK") {
              errorTitle = "Network Error";
              errorMessage =
                "Unable to connect to FBR API. Please check your internet connection.";
            } else if (postError.message) {
              errorMessage = postError.message;
            }
          }

          // Combine error message with details
          const fullErrorMessage =
            errorDetails.length > 0
              ? `${errorMessage}\n\nDetails:\n${errorDetails.join("\n")}`
              : errorMessage;

          Swal.fire({
            icon: "error",
            title: errorTitle,
            text: fullErrorMessage,
            confirmButtonColor: "#d33",
            width: "600px",
            customClass: {
              popup: "swal-wide",
            },
          });
        }
      } else {
        // Handle different error response structures with detailed error information
        let errorMessage = "Invoice validation failed.";
        let errorDetails = [];

        if (hasValidationResponse) {
          const validation = validationData.validationResponse;
          if (validation.error) {
            errorMessage = validation.error;
          }
          // Check for item-specific errors
          if (
            validation.invoiceStatuses &&
            Array.isArray(validation.invoiceStatuses)
          ) {
            validation.invoiceStatuses.forEach((status, index) => {
              if (status.error) {
                errorDetails.push(`Item ${index + 1}: ${status.error}`);
              }
            });
          }
        } else if (validationData.error) {
          errorMessage = validationData.error;
        } else if (validationData.message) {
          errorMessage = validationData.message;
        } else if (validateRes.data?.message) {
          errorMessage = validateRes.data.message;
        }

        // Check for additional error details in the response
        if (
          validationData.invoiceStatuses &&
          Array.isArray(validationData.invoiceStatuses)
        ) {
          validationData.invoiceStatuses.forEach((status, index) => {
            if (status.error) {
              errorDetails.push(`Item ${index + 1}: ${status.error}`);
            }
          });
        }

        // Combine error message with details
        const fullErrorMessage =
          errorDetails.length > 0
            ? `${errorMessage}\n\nDetails:\n${errorDetails.join("\n")}`
            : errorMessage;

        Swal.fire({
          icon: "error",
          title: "FBR Validation Failed",
          text: fullErrorMessage,
          confirmButtonColor: "#d33",
          width: "600px",
          customClass: {
            popup: "swal-wide",
          },
        });
      }
    } catch (error) {
      console.error("General Error:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: `Failed to process the invoice: ${error.message}`,
        confirmButtonColor: "#d33",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintInvoice = () => {
    printInvoice(formData);
  };

  const resetForm = () => {
    // Clean up all item-specific localStorage entries
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("selectedRateId_") || key.startsWith("SROId_"))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    setFormData({
      invoiceType: "",
      invoiceDate: dayjs(),
      sellerNTNCNIC: selectedTenant?.sellerNTNCNIC || "",
      sellerBusinessName: selectedTenant?.sellerBusinessName || "",
      sellerProvince: selectedTenant?.sellerProvince || "",
      sellerAddress: selectedTenant?.sellerAddress || "",
      buyerNTNCNIC: "",
      buyerBusinessName: "",
      buyerProvince: "",
      buyerAddress: "",
      buyerRegistrationType: "",
      invoiceRefNo: "",
      companyInvoiceRefNo: "",
      transactionTypeId: "",
      items: [
        {
          hsCode: "",
          productDescription: "",
          rate: "",
          uoM: "",
          quantity: "1",
          totalValues: "0",
          valueSalesExcludingST: "0",
          fixedNotifiedValueOrRetailPrice: "1",
          salesTaxApplicable: "0",
          salesTaxWithheldAtSource: "0",
          sroScheduleNo: "",
          sroItemSerialNo: "",
          saleType: "",
          isSROScheduleEnabled: false,
          isSROItemEnabled: false,
          extraTax: "",
          furtherTax: "0",
          fedPayable: "0",
          discount: "0",
          isValueSalesManual: false,
        },
      ],
    });
    setSelectedBuyerId("");
  };

  return (
    <TenantSelectionPrompt>
      {selectedTenant && <TenantDashboard />}
      <Box
        className="professional-form"
        sx={{
          p: { xs: 2, sm: 4 },
          background: "linear-gradient(135deg, #f8fafc 0%, #e0e7ef 100%)",
          borderRadius: 4,
          mt: selectedTenant ? 2 : 8,
          boxShadow: 6,
          maxWidth: 1200,
          mx: "auto",
          mb: 6,
        }}
      >
        {/* Invoice Type Section */}
        <Box
          sx={{
            border: "1px solid #e3e8ee",
            borderRadius: 3,
            p: { xs: 2, sm: 3 },
            mb: 4,
            background: "#fff",
            boxShadow: 2,
            transition: "box-shadow 0.2s",
            "&:hover": { boxShadow: 6 },
          }}
        >
          <Typography
            variant="h6"
            sx={{
              mb: 2,
              fontWeight: 700,
              textTransform: "uppercase",
              color: "#1976d2",
              letterSpacing: 1,
            }}
          >
            Invoice Details
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <Box sx={{ m: 1, flex: "1 1 30%", minWidth: "250px" }}>
              <FormControl fullWidth>
                <InputLabel id="invoice-type-label">Invoice Type</InputLabel>
                <Select
                  labelId="invoice-type-label"
                  value={formData.invoiceType}
                  label="Invoice Type"
                  onChange={(e) => handleChange("invoiceType", e.target.value)}
                >
                  {invoiceTypes.map((type) => (
                    <MenuItem key={type.docTypeId} value={type.docDescription}>
                      {type.docDescription}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ flex: "1 1 30%", minWidth: "250px" }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DemoContainer components={["DatePicker"]}>
                  <DatePicker
                    label="Invoice Date"
                    value={formData.invoiceDate}
                    onChange={(date) => handleChange("invoiceDate", date)}
                    sx={{ width: "100%" }}
                  />
                </DemoContainer>
              </LocalizationProvider>
            </Box>

            <Box sx={{ m: 1, flex: "1 1 30%", minWidth: "250px" }}>
              <TextField
                fullWidth
                label="Invoice Ref No."
                value={formData.invoiceRefNo}
                onChange={(e) => handleChange("invoiceRefNo", e.target.value)}
                variant="outlined"
                disabled={formData.invoiceType === "Sale Invoice"}
              />
            </Box>

            <Box sx={{ m: 1, flex: "1 1 30%", minWidth: "250px" }}>
              <TextField
                fullWidth
                label="Company Invoice Ref No:"
                value={formData.companyInvoiceRefNo}
                onChange={(e) =>
                  handleChange("companyInvoiceRefNo", e.target.value)
                }
                variant="outlined"
              />
            </Box>
          </Box>
        </Box>
        {/* Seller Detail Section */}
        <Typography
          variant="h6"
          sx={{
            mb: 2,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#1976d2",
            letterSpacing: 1,
          }}
        >
          Seller Detail
        </Typography>

        {/* Tenant Selection Status */}
        {selectedTenant ? (
          <Box
            sx={{
              mb: 2,
              p: 2,
              bgcolor: "success.light",
              borderRadius: 2,
              color: "white",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              ✓ Selected Tenant: {selectedTenant.sellerBusinessName} (
              {selectedTenant.sellerNTNCNIC})
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Seller information has been automatically populated from the
              selected Company.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              mb: 2,
              p: 2,
              bgcolor: "warning.light",
              borderRadius: 2,
              color: "white",
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              ⚠ Please select a Company to populate seller information
            </Typography>
            <Typography
              variant="caption"
              sx={{ opacity: 0.9, display: "block", mb: 1 }}
            >
              Go to Tenant Management to select a Company before creating an
              invoice.
            </Typography>
            <Button
              variant="contained"
              size="small"
              onClick={() => navigate("/tenant-management")}
              sx={{
                bgcolor: "white",
                color: "warning.main",
                "&:hover": { bgcolor: "grey.100" },
              }}
            >
              Select Tenant
            </Button>
          </Box>
        )}

        <Box
          sx={{
            border: "1px solid #e3e8ee",
            borderRadius: 3,
            p: { xs: 2, sm: 3 },
            mb: 4,
            background: selectedTenant ? "#f7fafd" : "#fff5f5",
            boxShadow: 1,
            transition: "box-shadow 0.2s",
            "&:hover": { boxShadow: 4 },
          }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {[
              { label: "Seller NTN/CNIC", field: "sellerNTNCNIC" },
              { label: "Seller NTN", field: "sellerFullNTN" },
              { label: "Seller Business Name", field: "sellerBusinessName" },
              { label: "Seller Address", field: "sellerAddress" },
            ].map(({ label, field }) => (
              <Box key={field} sx={{ flex: "1 1 30%", minWidth: "250px" }}>
                <TextField
                  fullWidth
                  label={label}
                  value={formData[field]}
                  onChange={(e) => handleChange(field, e.target.value)}
                  variant="outlined"
                  disabled={true}
                />
              </Box>
            ))}

            <Box sx={{ flex: "1 1 30%", minWidth: "250px" }}>
              <FormControl fullWidth>
                <InputLabel id="seller-province-label">
                  Seller Province
                </InputLabel>
                <Select
                  labelId="seller-province-label"
                  value={formData.sellerProvince}
                  label="Seller Province"
                  onChange={(e) =>
                    handleChange("sellerProvince", e.target.value)
                  }
                  disabled={true}
                >
                  {/* Add tenant's province if it's not in the FBR list */}
                  {selectedTenant &&
                    selectedTenant.sellerProvince &&
                    !province.find(
                      (p) =>
                        p.stateProvinceDesc === selectedTenant.sellerProvince
                    ) && (
                      <MenuItem value={selectedTenant.sellerProvince}>
                        {selectedTenant.sellerProvince}
                      </MenuItem>
                    )}
                  {/* Standard FBR provinces */}
                  {province.map((prov) => (
                    <MenuItem
                      key={prov.stateProvinceCode}
                      value={prov.stateProvinceDesc}
                    >
                      {prov.stateProvinceDesc}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
        </Box>
        {/* Buyer Detail Section */}
        <Typography
          variant="h6"
          sx={{
            mb: 2,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#1976d2",
            letterSpacing: 1,
          }}
        >
          Buyer Detail
        </Typography>
        <Box
          sx={{
            border: "1px solid #e3e8ee",
            borderRadius: 3,
            p: { xs: 2, sm: 3 },
            mb: 4,
            background: "#fff",
            boxShadow: 1,
            transition: "box-shadow 0.2s",
            "&:hover": { boxShadow: 4 },
          }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <Box sx={{ flex: "1 1 30%", minWidth: "250px" }}>
              <Autocomplete
                fullWidth
                options={buyers}
                getOptionLabel={(option) =>
                  option.buyerBusinessName
                    ? `${option.buyerBusinessName} (${option.buyerNTNCNIC})`
                    : ""
                }
                value={buyers.find((b) => b.id === selectedBuyerId) || null}
                onChange={(_, newValue) =>
                  setSelectedBuyerId(newValue ? newValue.id : "")
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Buyer"
                    variant="outlined"
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                getOptionKey={(option) =>
                  option.id ||
                  option.buyerNTNCNIC ||
                  option.buyerBusinessName ||
                  option.buyerAddress ||
                  Math.random()
                }
              />
            </Box>
          </Box>

          {/* Buyer Details Fields - Only show when a buyer is selected */}
          {selectedBuyerId && (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, mt: 3 }}>
              {[
                { label: "Buyer NTN/CNIC", field: "buyerNTNCNIC" },
                { label: "Buyer Business Name", field: "buyerBusinessName" },
                { label: "Buyer Address", field: "buyerAddress" },
              ].map(({ label, field }) => (
                <Box key={field} sx={{ flex: "1 1 30%", minWidth: "250px" }}>
                  <TextField
                    fullWidth
                    label={label}
                    value={formData[field]}
                    onChange={(e) => handleChange(field, e.target.value)}
                    variant="outlined"
                    disabled={true}
                  />
                </Box>
              ))}

              <Box sx={{ flex: "1 1 30%", minWidth: "250px" }}>
                <FormControl fullWidth>
                  <InputLabel id="buyer-province-label">
                    Buyer Province
                  </InputLabel>
                  <Select
                    labelId="buyer-province-label"
                    value={formData.buyerProvince}
                    label="Buyer Province"
                    onChange={(e) =>
                      handleChange("buyerProvince", e.target.value)
                    }
                    disabled={true}
                  >
                    {/* Add buyer's province if it's not in the FBR list */}
                    {formData.buyerProvince &&
                      !province.find(
                        (p) => p.stateProvinceDesc === formData.buyerProvince
                      ) && (
                        <MenuItem value={formData.buyerProvince}>
                          {formData.buyerProvince}
                        </MenuItem>
                      )}
                    {/* Standard FBR provinces */}
                    {province.map((prov) => (
                      <MenuItem
                        key={prov.stateProvinceCode}
                        value={prov.stateProvinceDesc}
                      >
                        {prov.stateProvinceDesc}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ flex: "1 1 30%", minWidth: "250px" }}>
                <FormControl fullWidth>
                  <InputLabel id="buyer-registration-type-label">
                    Buyer Registration Type
                  </InputLabel>
                  <Select
                    labelId="buyer-registration-type-label"
                    value={formData.buyerRegistrationType}
                    label="Buyer Registration Type"
                    onChange={(e) =>
                      handleChange("buyerRegistrationType", e.target.value)
                    }
                    disabled={true}
                  >
                    <MenuItem value="Registered">Registered</MenuItem>
                    <MenuItem value="Unregistered">Unregistered</MenuItem>
                    <MenuItem value="Consumer">Consumer</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
          )}

          {/* FBR Registration Status Indicator */}
          {selectedBuyerId && (
            <Box sx={{ mt: 2, p: 2, borderRadius: 2, backgroundColor: "#f8f9fa", border: "1px solid #e9ecef" }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600, color: "#495057" }}>
                FBR Registration Status
              </Typography>
              {fbrRegistrationStatus.loading ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="body2" color="text.secondary">
                    Checking registration status...
                  </Typography>
                </Box>
              ) : fbrRegistrationStatus.error ? (
                <Box sx={{ p: 1, backgroundColor: "#fff3cd", border: "1px solid #ffeaa7", borderRadius: 1 }}>
                  <Typography variant="body2" color="#856404">
                    ⚠️ Unable to verify registration status: {fbrRegistrationStatus.error}
                  </Typography>
                </Box>
              ) : fbrRegistrationStatus.isActive !== null ? (
                <Box>
                  <Box sx={{ 
                    p: 1, 
                    backgroundColor: fbrRegistrationStatus.isActive ? "#d4edda" : "#d1ecf1", 
                    border: `1px solid ${fbrRegistrationStatus.isActive ? "#c3e6cb" : "#bee5eb"}`, 
                    borderRadius: 1,
                    mb: 1
                  }}>
                    <Typography variant="body2" color={fbrRegistrationStatus.isActive ? "#155724" : "#0c5460"}>
                      <strong>Status:</strong> {fbrRegistrationStatus.status}
                    </Typography>
                    <Typography variant="body2" color={fbrRegistrationStatus.isActive ? "#155724" : "#0c5460"}>
                      <strong>Further Tax:</strong> {fbrRegistrationStatus.shouldApplyFurtherTax ? "4% (Applied - Registration Inactive)" : "0% (Not Applied - Registration Active)"}
                    </Typography>
                  </Box>
                </Box>
              ) : null}
            </Box>
          )}
        </Box>
        {/* Transaction Type Section */}
        <Typography
          variant="h6"
          sx={{
            mb: 2,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#1976d2",
            letterSpacing: 1,
          }}
        >
          Transaction Type
        </Typography>
        <Box
          sx={{
            border: "1px solid #e3e8ee",
            borderRadius: 3,
            p: { xs: 2, sm: 3 },
            mb: 4,
            background: "#f7fafd",
            boxShadow: 1,
            transition: "box-shadow 0.2s",
            "&:hover": { boxShadow: 4 },
          }}
        >
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            <Box sx={{ flex: "1 1 30%", minWidth: "250px" }}>
              <FormControl fullWidth>
                <InputLabel id="transaction-type-label">
                  Transaction Type
                </InputLabel>
                <Select
                  labelId="transaction-type-label"
                  value={formData.transactionTypeDesc}
                  label="Transaction Type"
                  onChange={(e) => handleTransactionTypeChange(e.target.value)}
                >
                  <MenuItem value="">
                    <em>Select a transaction type</em>
                  </MenuItem>
                  {transactionTypes.map((type) => (
                    <MenuItem
                      key={type.transactioN_TYPE_ID}
                      value={type.transactioN_DESC}
                    >
                      {type.transactioN_TYPE_ID} {type.transactioN_DESC}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
        </Box>
        {/* Items Section */}
        <Typography
          variant="h6"
          sx={{
            mb: 2,
            fontWeight: 700,
            textTransform: "uppercase",
            color: "#1976d2",
            letterSpacing: 1,
          }}
        >
          Items
        </Typography>
        {formData.items.map((item, index) => (
          <Box
            key={index}
            sx={{
              mb: 4,
              border: "1px solid #e3e8ee",
              borderRadius: 3,
              p: { xs: 2, sm: 3 },
              boxShadow: 2,
              background: "#fff",
              position: "relative",
              minHeight: "200px",
              transition: "box-shadow 0.2s, border-color 0.2s",
              "&:hover": { boxShadow: 6, borderColor: "#1976d2" },
            }}
          >
            {/* HS Code Section - Full Line */}
            <Box
              sx={{
                border: "1px solid #e3e8ee",
                borderRadius: 3,
                p: { xs: 2, sm: 3 },
                mb: 2,
                background: "#f7fafd",
                boxShadow: 1,
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 4 },
              }}
            >
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                <Box sx={{ flex: "1 1 30%", minWidth: "250px" }}>
                  <OptimizedHSCodeSelector
                    index={index}
                    item={item}
                    handleItemChange={handleItemChange}
                    environment="production"
                  />
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
              <RateSelector
                key={`RateSelector-${index}`}
                index={index}
                item={item}
                handleItemChange={handleItemChange}
                transactionTypeId={formData.transactionTypeId}
                selectedProvince={formData.sellerProvince}
                sellerProvince={formData.sellerProvince}
              />
              <SROScheduleNumber
                key={`SROScheduleNumber-${index}`}
                index={index}
                item={item}
                disabled={!item.isSROScheduleEnabled}
                handleItemChange={handleItemChange}
                selectedProvince={formData.sellerProvince}
                sellerProvince={formData.sellerProvince}
              />
              <SROItem
                key={`SROItem-${index}`}
                index={index}
                disabled={!item.isSROItemEnabled}
                item={item}
                handleItemChange={handleItemChange}
              />
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
              <Box sx={{ flex: "1 1 23%", minWidth: "200px" }}>
                <TextField
                  fullWidth
                  label="Product Description"
                  value={item.productDescription || ""}
                  onChange={(e) =>
                    handleItemChange(
                      index,
                      "productDescription",
                      e.target.value
                    )
                  }
                  variant="outlined"
                />
              </Box>
              <Box sx={{ flex: "1 1 23%", minWidth: "200px" }}>
                <TextField
                  fullWidth
                  label="Sales Type"
                  type="text"
                  value={item.saleType || ""}
                  onChange={(e) =>
                    handleItemChange(index, "saleType", e.target.value)
                  }
                  InputProps={{
                    readOnly: true,
                  }}
                  variant="outlined"
                />
              </Box>
              <UnitOfMeasurement
                key={`UnitOfMeasurement-${index}`}
                index={index}
                item={item}
                handleItemChange={handleItemChange}
                hsCode={item.hsCode}
              />
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Unit Cost"
                  type="text"
                  value={item.fixedNotifiedValueOrRetailPrice}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      handleItemChange(
                        index,
                        "fixedNotifiedValueOrRetailPrice",
                        value
                      );
                    }
                  }}
                  variant="outlined"
                />
              </Box>

              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Qty"
                  type="text"
                  value={item.quantity}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers
                    if (value === "" || /^\d*$/.test(value)) {
                      handleItemChange(index, "quantity", value);
                    }
                  }}
                  variant="outlined"
                />
              </Box>

              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Value Sales (Excl. ST)"
                  type="text"
                  value={item.valueSalesExcludingST}
                  InputProps={{
                    readOnly: true,
                  }}
                  variant="outlined"
                  sx={{
                    "& .MuiInputBase-input.Mui-readOnly": {
                      backgroundColor: "#f5f5f5",
                      cursor: "not-allowed",
                    },
                  }}
                />
              </Box>

              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Sales Tax Applicable"
                  type="text"
                  value={item.salesTaxApplicable}
                  InputProps={{
                    readOnly: true,
                  }}
                  variant="outlined"
                  sx={{
                    "& .MuiInputBase-input.Mui-readOnly": {
                      backgroundColor: "#f5f5f5",
                      cursor: "not-allowed",
                    },
                  }}
                />
              </Box>

              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Total Values"
                  type="text"
                  value={item.totalValues}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      handleItemChange(index, "totalValues", value);
                    }
                  }}
                  variant="outlined"
                />
              </Box>
            </Box>

            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 2 }}>
              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="ST Withheld at Source"
                  type="text"
                  value={item.salesTaxWithheldAtSource}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      handleItemChange(
                        index,
                        "salesTaxWithheldAtSource",
                        value
                      );
                    }
                  }}
                  variant="outlined"
                />
              </Box>
              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Extra Tax"
                  type="text"
                  value={item.extraTax}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      handleItemChange(index, "extraTax", value);
                    }
                  }}
                  variant="outlined"
                />
              </Box>
              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Further Tax"
                  type="text"
                  value={item.furtherTax}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      handleItemChange(index, "furtherTax", value);
                    }
                  }}
                  variant="outlined"
                />
              </Box>
              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="FED Payable"
                  type="text"
                  value={item.fedPayable}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      handleItemChange(index, "fedPayable", value);
                    }
                  }}
                  variant="outlined"
                />
              </Box>
              <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                <TextField
                  fullWidth
                  label="Discount"
                  type="text"
                  value={item.discount}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow only numbers and decimal points
                    if (value === "" || /^\d*\.?\d*$/.test(value)) {
                      handleItemChange(index, "discount", value);
                    }
                  }}
                  variant="outlined"
                />
              </Box>
            </Box>

            <Box sx={{ position: "relative", mt: 2, textAlign: "right" }}>
              <Button
                variant="contained"
                color="error"
                size="small"
                onClick={() => removeItem(index)}
                sx={{
                  mt: 2,
                  borderRadius: 2,
                  fontWeight: 600,
                  px: 2,
                  py: 0.5,
                  boxShadow: 1,
                  fontSize: 12,
                  transition: "background 0.2s",
                  "&:hover": { background: "#b71c1c" },
                }}
              >
                Remove
              </Button>
            </Box>
          </Box>
        ))}
        <Box
          className="button-group"
          sx={{ display: "flex", justifyContent: "space-between", mt: 4 }}
        >
          <Button
            variant="contained"
            onClick={addNewItem}
            color="success"
            size="small"
            sx={{
              borderRadius: 2,
              fontWeight: 600,
              px: 3,
              py: 1,
              boxShadow: 1,
              fontSize: 13,
              letterSpacing: 0.5,
              transition: "background 0.2s",
              "&:hover": { background: "#388e3c" },
            }}
          >
            + Add Item
          </Button>
          <Box>
            <Button
              onClick={handleSubmitChange}
              variant="contained"
              color="primary"
              size="small"
              sx={{
                mr: 2,
                borderRadius: 2,
                fontWeight: 600,
                px: 3,
                py: 1,
                fontSize: 13,
                letterSpacing: 0.5,
                boxShadow: 1,
                transition: "background 0.2s",
                "&:hover": { background: "#115293" },
              }}
              disabled={loading}
            >
              {loading ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                "Submit"
              )}
            </Button>
          </Box>
        </Box>
        {allLoading && (
          <Box
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              bgcolor: "rgba(255,255,255,0.7)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress size={50} color="primary" />
          </Box>
        )}
      </Box>
    </TenantSelectionPrompt>
  );
}
