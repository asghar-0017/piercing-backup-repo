/**
 * CreateInvoice Form Component
 *
 * This component handles invoice creation and editing, including:
 * - Adding/editing invoice items
 * - Buyer selection and management
 * - Transaction type handling
 * - Form validation and submission
 *
 * Recent fixes:
 * - Fixed buyer field not being pre-filled when editing items from Added Items list
 * - Enhanced buyer information storage and restoration during item editing
 * - Added debugging logs for buyer selection tracking
 * - Improved buyer field re-rendering when selection changes
 */
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
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Checkbox,
  FormControlLabel,
  Chip,
} from "@mui/material";
import {
  Business,
  CreditCard,
  LocationOn,
  Map as MapIcon,
  ErrorOutline as ErrorOutlineIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { DemoContainer } from "@mui/x-date-pickers/internals/demo";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import { FaTrash, FaEdit } from "react-icons/fa";
import { IoIosAddCircle } from "react-icons/io";
import dayjs from "dayjs";
import {
  getTransactionTypes,
  checkRegistrationStatusWithDate,
} from "../API/FBRService";
import { fetchData, postData } from "../API/GetApi";
import RateSelector from "../component/RateSelector";
import SROScheduleNumber from "../component/SROScheduleNumber";
import SROItem from "../component/SROItem";
import BillOfLadingUoM from "../component/BillOfLadingUoM";
import OptimizedHSCodeSelector from "../component/OptimizedHSCodeSelector";
import ProductModal from "../component/ProductModal";
import hsCodeCache from "../utils/hsCodeCache";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import { showError, showErrorFromResponse } from "../utils/errorHandler.jsx";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { api, API_CONFIG, debugTokenManager } from "../API/Api";

import TenantSelectionPrompt from "../component/TenantSelectionPrompt";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import BuyerModal from "../component/BuyerModal";

// Utility function to format numbers with commas and 2 decimal places
const formatNumberWithCommas = (value) => {
  if (!value || isNaN(parseFloat(value))) return "";
  const num = parseFloat(value);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Utility function to format integers with commas
const formatIntegerWithCommas = (value) => {
  if (!value || isNaN(parseInt(value))) return "";
  const num = parseInt(value);
  return num.toLocaleString("en-US");
};

// Utility function to format editable numbers with commas and 2 decimal places
const formatEditableNumberWithCommas = (value) => {
  if (!value || isNaN(parseFloat(value))) return "";
  const num = parseFloat(value);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Utility function to remove commas and convert back to number
const removeCommas = (value) => {
  if (!value) return "";
  return value.replace(/,/g, "");
};

// Enhanced utility function for handling floating number inputs with natural typing
const handleFloatingNumberInput = (value, allowEmpty = true) => {
  // Allow empty string when deleting all content
  if (value === "" && allowEmpty) {
    return "";
  }

  // Remove existing commas to get the raw number for validation
  const rawValue = value.replace(/,/g, "");

  // Allow natural decimal number input including:
  // - Numbers: 123
  // - Decimals: 123.45, .45, 123.
  // - Leading decimal: .5
  const decimalPattern = /^(\d*\.?\d*)$/;

  if (decimalPattern.test(rawValue)) {
    return rawValue; // Return raw value without commas for internal storage
  }

  return null; // Invalid input, don't update
};

// Format decimal number with commas and max 2 decimal places (only on blur)
const formatDecimalOnBlur = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  // Remove commas before parsing to avoid parseFloat issues
  const cleanValue = value.replace(/,/g, "");
  const numValue = parseFloat(cleanValue);
  if (isNaN(numValue)) {
    return "";
  }

  // Format with commas and 2 decimal places
  return numValue.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// Format number with commas while typing (for display only)
const formatWithCommasWhileTyping = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  // Handle decimal point cases
  if (value.includes(".")) {
    const [integerPart, decimalPart] = value.split(".");
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${formattedInteger}.${decimalPart}`;
  } else {
    // Format integer part with commas
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
};

// Format quantity with commas while preserving decimal places
const formatQuantityWithCommas = (value) => {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  // Remove commas first to get the raw value
  const cleanValue = value.toString().replace(/,/g, "");

  // Handle decimal point cases
  if (cleanValue.includes(".")) {
    const [integerPart, decimalPart] = cleanValue.split(".");
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${formattedInteger}.${decimalPart}`;
  } else {
    // Format integer part with commas
    return cleanValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
};

export default function CreateInvoice() {
  const { selectedTenant, tokensLoaded, retryTokenFetch } =
    useTenantSelection();

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
    custAccountNo: "",
    custLpoNo: "",
    lpoDate: "",
    deliveryNoteNo: "",
    sp: "",
    productOrigin: "",
    productCertifiedBy: "",
    paymentTerms: "",
    paymentDue: "",
    group: "",
    sourceInvoiceNo: "",
    transctypeId: "",
    billToId: "",
    shipToId: "",
    items: [
      {
        name: "",
        hsCode: "",
        productDescription: "",
        rate: "",
        quantity: "1",
        unitPrice: "0.00", // Calculated field: Retail Price ÷ Quantity
        retailPrice: "0", // User input field
        itemCode: "",
        units: "",
        weight: "",
        qtyForInternal: "",
        courierCharges: "0",
        totalValues: "0",
        valueSalesExcludingST: "0",
        salesTaxApplicable: "0",
        salesTaxWithheldAtSource: "0",
        sroScheduleNo: "",
        sroItemSerialNo: "",
        billOfLadingUoM: "",
        uoM: "",
        uoMForInternal: "",
        saleType: "",
        isSROScheduleEnabled: false,
        isSROItemEnabled: false,
        extraTax: "",
        furtherTax: "0",
        fedPayable: "0",
        discount: "0",
        advanceIncomeTax: "0",
        vat18: false,
        vat25: false,
        vatAmount: 0,
        isValueSalesManual: false,
        isTotalValuesManual: false,
        isSalesTaxManual: false,
        isSalesTaxWithheldManual: false,
        isFurtherTaxManual: false,
        isFedPayableManual: false,
      },
    ],
  });
  const [isEditMode, setIsEditMode] = React.useState(false);
  const originalSourceInvoiceNoRef = React.useRef("");
  const [editInvoiceNumber, setEditInvoiceNumber] = React.useState("");
  const [invoiceDateError, setInvoiceDateError] = React.useState("");

  // Add state for tracking added items
  const [addedItems, setAddedItems] = React.useState([]);
  const [editingItemIndex, setEditingItemIndex] = React.useState(null);

  // Buyer and product related state - moved here to avoid initialization errors
  const [buyers, setBuyers] = useState([]);
  // Buyer pagination/search state
  const [buyerSearch, setBuyerSearch] = useState("");
  const [buyerPage, setBuyerPage] = useState(1);
  const [buyerHasMore, setBuyerHasMore] = useState(true);
  const [loadingBuyers, setLoadingBuyers] = useState(false);
  const buyerSearchDebounceRef = React.useRef(null);
  const [products, setProducts] = useState([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState("");
  const [isBuyerModalOpen, setIsBuyerModalOpen] = useState(false);
  const [selectedProductIdByItem, setSelectedProductIdByItem] = useState({});
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [uomOptions, setUomOptions] = useState({});
  const [loadingUom, setLoadingUom] = useState({});

  // Product pagination/search state
  const [productSearch, setProductSearch] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [productHasMore, setProductHasMore] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const searchDebounceRef = React.useRef(null);
  const [productInputValue, setProductInputValue] = useState("");
  const isManualBuyerClearRef = useRef(false);
  const isManualProductClearRef = useRef(false);
  // Prevents the formData effect from clearing isSubmitVisible right after a
  // successful save-validate (where we update both formData and isSubmitVisible together)
  const suppressSubmitResetRef = useRef(false);

  // Bill To & Ship To State Management
  const [billToOptions, setBillToOptions] = useState([]);
  const [billToSearch, setBillToSearch] = useState("");
  const [loadingBillTo, setLoadingBillTo] = useState(false);
  const [selectedBillTo, setSelectedBillTo] = useState(null);
  const [isBillToModalOpen, setIsBillToModalOpen] = useState(false);
  const [billToInputValue, setBillToInputValue] = useState("");

  const [shipToOptions, setShipToOptions] = useState([]);
  const [shipToSearch, setShipToSearch] = useState("");
  const [loadingShipTo, setLoadingShipTo] = useState(false);
  const [selectedShipTo, setSelectedShipTo] = useState(null);
  const [isShipToModalOpen, setIsShipToModalOpen] = useState(false);
  const [shipToInputValue, setShipToInputValue] = useState("");

  // Memoized combined options for maximum performance
  const billToCombinedOptions = React.useMemo(() => {
    const opts = [{ id: "__add__", name: "+ Add Bill To" }];

    buyers.forEach((b) => {
      opts.push({
        id: `buyer_${b.id}`,
        buyerId: b.id,
        name: b.buyerBusinessName || "",
        address: b.buyerAddress || "",
        ntn: b.buyerNTNCNIC || "",
        isBuyer: true,
        rawBuyer: b,
      });
    });

    billToOptions.forEach((o) => {
      opts.push(o);
    });

    return opts;
  }, [buyers, billToOptions]);

  const shipToCombinedOptions = React.useMemo(() => {
    const opts = [{ id: "__add__", name: "+ Add Ship To" }];

    buyers.forEach((b) => {
      opts.push({
        id: `buyer_${b.id}`,
        buyerId: b.id,
        name: b.buyerBusinessName || "",
        address: b.buyerAddress || "",
        ntn: b.buyerNTNCNIC || "",
        isBuyer: true,
        rawBuyer: b,
      });
    });

    shipToOptions.forEach((o) => {
      opts.push(o);
    });

    return opts;
  }, [buyers, shipToOptions]);

  const customFilterBillToOptions = React.useCallback((options, state) => {
    const inputValue = (state.inputValue || "").trim().toLowerCase();
    const results = [options[0]]; // Always keep "+ Add Bill To" at position 0

    let count = 0;
    for (let i = 1; i < options.length; i++) {
      const opt = options[i];
      if (!inputValue) {
        results.push(opt);
        count++;
      } else {
        const nameMatch = opt.name && opt.name.toLowerCase().includes(inputValue);
        const ntnMatch = opt.ntn && opt.ntn.toLowerCase().includes(inputValue);
        const addrMatch = opt.address && opt.address.toLowerCase().includes(inputValue);
        if (nameMatch || ntnMatch || addrMatch) {
          results.push(opt);
          count++;
        }
      }
      if (count >= 50) break; // Limit rendering to 50 items for instant 0ms response!
    }
    return results;
  }, []);

  const customFilterShipToOptions = React.useCallback((options, state) => {
    const inputValue = (state.inputValue || "").trim().toLowerCase();
    const results = [options[0]]; // Always keep "+ Add Ship To" at position 0

    let count = 0;
    for (let i = 1; i < options.length; i++) {
      const opt = options[i];
      if (!inputValue) {
        results.push(opt);
        count++;
      } else {
        const nameMatch = opt.name && opt.name.toLowerCase().includes(inputValue);
        const ntnMatch = opt.ntn && opt.ntn.toLowerCase().includes(inputValue);
        const addrMatch = opt.address && opt.address.toLowerCase().includes(inputValue);
        if (nameMatch || ntnMatch || addrMatch) {
          results.push(opt);
          count++;
        }
      }
      if (count >= 50) break; // Limit rendering to 50 items for instant 0ms response!
    }
    return results;
  }, []);

  const fetchShipTo = async (searchVal = "") => {
    if (!selectedTenant) return;
    setLoadingShipTo(true);
    try {
      const response = await api.get(`/tenant/${selectedTenant.tenant_id}/ship-to`, {
        params: { search: searchVal, limit: 50 },
      });
      if (response.data && response.data.success) {
        setShipToOptions(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching ship-to options:", error);
    } finally {
      setLoadingShipTo(false);
    }
  };

  const fetchBillTo = async (searchVal = "") => {
    if (!selectedTenant) return;
    setLoadingBillTo(true);
    try {
      const response = await api.get(`/tenant/${selectedTenant.tenant_id}/bill-to`, {
        params: { search: searchVal, limit: 50 },
      });
      if (response.data && response.data.success) {
        setBillToOptions(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching bill-to options:", error);
    } finally {
      setLoadingBillTo(false);
    }
  };

  useEffect(() => {
    if (selectedTenant) {
      fetchShipTo("");
      fetchBillTo("");
    } else {
      setShipToOptions([]);
      setBillToOptions([]);
      setSelectedShipTo(null);
      setSelectedBillTo(null);
    }
  }, [selectedTenant]);

  useEffect(() => {
    if (formData.billToId) {
      const foundInBill = billToOptions.find(b => String(b.id) === String(formData.billToId));
      if (foundInBill) {
        setSelectedBillTo(foundInBill);
        setBillToInputValue(foundInBill.name);
      } else {
        const foundInBuyer = buyers.find(b => `buyer_${b.id}` === String(formData.billToId) || String(b.id) === String(formData.billToId));
        if (foundInBuyer) {
          const bOpt = {
            id: `buyer_${foundInBuyer.id}`,
            buyerId: foundInBuyer.id,
            name: foundInBuyer.buyerBusinessName || "",
            address: foundInBuyer.buyerAddress || "",
            ntn: foundInBuyer.buyerNTNCNIC || "",
            isBuyer: true,
            rawBuyer: foundInBuyer,
          };
          setSelectedBillTo(bOpt);
          setBillToInputValue(bOpt.name);
        }
      }
    } else if (!formData.billToId) {
      setSelectedBillTo(null);
      setBillToInputValue("");
    }
  }, [formData.billToId, billToOptions, buyers]);

  useEffect(() => {
    if (formData.shipToId) {
      const foundInShip = shipToOptions.find(s => String(s.id) === String(formData.shipToId));
      if (foundInShip) {
        setSelectedShipTo(foundInShip);
        setShipToInputValue(foundInShip.name);
      } else {
        const foundInBuyer = buyers.find(b => `buyer_${b.id}` === String(formData.shipToId) || String(b.id) === String(formData.shipToId));
        if (foundInBuyer) {
          const bOpt = {
            id: `buyer_${foundInBuyer.id}`,
            buyerId: foundInBuyer.id,
            name: foundInBuyer.buyerBusinessName || "",
            address: foundInBuyer.buyerAddress || "",
            ntn: foundInBuyer.buyerNTNCNIC || "",
            isBuyer: true,
            rawBuyer: foundInBuyer,
          };
          setSelectedShipTo(bOpt);
          setShipToInputValue(bOpt.name);
        }
      }
    } else if (!formData.shipToId) {
      setSelectedShipTo(null);
      setShipToInputValue("");
    }
  }, [formData.shipToId, shipToOptions, buyers]);

  const handleSelectBillTo = async (newValue) => {
    if (!newValue) {
      setSelectedBillTo(null);
      setBillToInputValue("");
      handleChange("billToId", "");
      return;
    }

    if (newValue.id === "__add__") {
      setIsBillToModalOpen(true);
      return;
    }

    if (newValue.isBuyer) {
      const rawB = newValue.rawBuyer || newValue;
      const bName = rawB.buyerBusinessName || newValue.name || "";
      const bAddress = rawB.buyerAddress || newValue.address || "";
      const bNtn = rawB.buyerNTNCNIC || newValue.ntn || "";

      // Check if a BillTo record already exists for this buyer in billToOptions
      const existing = billToOptions.find(
        (o) =>
          (bNtn && o.ntn === bNtn) ||
          (o.name && o.name.toLowerCase() === bName.toLowerCase())
      );

      if (existing) {
        setSelectedBillTo(existing);
        setBillToInputValue(existing.name || bName);
        handleChange("billToId", existing.id);
      } else if (selectedTenant) {
        try {
          const payload = {
            name: bName,
            address: bAddress || "N/A",
            refNo: rawB.buyerRegistrationType || bNtn || "BUYER",
            ntn: bNtn,
            strn: "",
          };
          const res = await api.post(
            `/tenant/${selectedTenant.tenant_id}/bill-to`,
            payload
          );
          if (res.data && res.data.success && res.data.data) {
            const newRecord = res.data.data;
            setBillToOptions((prev) => [newRecord, ...prev]);
            setSelectedBillTo(newRecord);
            setBillToInputValue(newRecord.name || bName);
            handleChange("billToId", newRecord.id);
          } else {
            setSelectedBillTo(newValue);
            setBillToInputValue(bName);
            handleChange("billToId", newValue.id);
          }
        } catch (err) {
          console.error("Error auto-creating Bill To record for buyer:", err);
          setSelectedBillTo(newValue);
          setBillToInputValue(bName);
          handleChange("billToId", newValue.id);
        }
      } else {
        setSelectedBillTo(newValue);
        setBillToInputValue(bName);
        handleChange("billToId", newValue.id);
      }
    } else {
      setSelectedBillTo(newValue);
      setBillToInputValue(newValue.name || "");
      handleChange("billToId", newValue.id);
    }
  };

  const handleSelectShipTo = async (newValue) => {
    if (!newValue) {
      setSelectedShipTo(null);
      setShipToInputValue("");
      handleChange("shipToId", "");
      return;
    }

    if (newValue.id === "__add__") {
      setIsShipToModalOpen(true);
      return;
    }

    if (newValue.isBuyer) {
      const rawB = newValue.rawBuyer || newValue;
      const bName = rawB.buyerBusinessName || newValue.name || "";
      const bAddress = rawB.buyerAddress || newValue.address || "";
      const bNtn = rawB.buyerNTNCNIC || newValue.ntn || "";

      // Check if a ShipTo record already exists for this buyer in shipToOptions
      const existing = shipToOptions.find(
        (o) =>
          (bNtn && o.ntn === bNtn) ||
          (o.name && o.name.toLowerCase() === bName.toLowerCase())
      );

      if (existing) {
        setSelectedShipTo(existing);
        setShipToInputValue(existing.name || bName);
        handleChange("shipToId", existing.id);
      } else if (selectedTenant) {
        try {
          const payload = {
            name: bName,
            address: bAddress || "N/A",
            contactPerson: "",
            contactNo: rawB.buyerPhoneNumber || "",
            cnic: bNtn && bNtn.length === 13 ? bNtn : "",
            ntn: bNtn,
          };
          const res = await api.post(
            `/tenant/${selectedTenant.tenant_id}/ship-to`,
            payload
          );
          if (res.data && res.data.success && res.data.data) {
            const newRecord = res.data.data;
            setShipToOptions((prev) => [newRecord, ...prev]);
            setSelectedShipTo(newRecord);
            setShipToInputValue(newRecord.name || bName);
            handleChange("shipToId", newRecord.id);
          } else {
            setSelectedShipTo(newValue);
            setShipToInputValue(bName);
            handleChange("shipToId", newValue.id);
          }
        } catch (err) {
          console.error("Error auto-creating Ship To record for buyer:", err);
          setSelectedShipTo(newValue);
          setShipToInputValue(bName);
          handleChange("shipToId", newValue.id);
        }
      } else {
        setSelectedShipTo(newValue);
        setShipToInputValue(bName);
        handleChange("shipToId", newValue.id);
      }
    } else {
      setSelectedShipTo(newValue);
      setShipToInputValue(newValue.name || "");
      handleChange("shipToId", newValue.id);
    }
  };

  // Bill To & Ship To Creation Form States & Handlers
  const [shipToForm, setShipToForm] = useState({
    name: "",
    address: "",
    contactPerson: "",
    contactNo: "",
    cnic: "",
    ntn: "",
  });

  const [billToForm, setBillToForm] = useState({
    name: "",
    address: "",
    refNo: "",
    ntn: "",
    strn: "",
  });

  const [shipToFormErrors, setShipToFormErrors] = useState({});
  const [billToFormErrors, setBillToFormErrors] = useState({});
  const [isSubmittingShipTo, setIsSubmittingShipTo] = useState(false);
  const [isSubmittingBillTo, setIsSubmittingBillTo] = useState(false);

  const handleSaveShipTo = async (e) => {
    e.preventDefault();
    if (isSubmittingShipTo) return;

    // Validation
    const errors = {};
    if (!shipToForm.name.trim()) errors.name = "Name is required";
    if (!shipToForm.address.trim()) errors.address = "Address is required";
    if (!shipToForm.contactPerson.trim()) errors.contactPerson = "Contact Person is required";
    if (!shipToForm.contactNo.trim()) errors.contactNo = "Contact No is required";
    if (!shipToForm.cnic.trim()) errors.cnic = "CNIC is required";

    setShipToFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmittingShipTo(true);
    try {
      const response = await api.post(`/tenant/${selectedTenant.tenant_id}/ship-to`, shipToForm);
      if (response.data && response.data.success) {
        const newRecord = response.data.data;
        toast.success("Ship To added successfully!");

        // Add to options list
        setShipToOptions((prev) => [newRecord, ...prev]);
        // Select it
        setSelectedShipTo(newRecord);
        handleChange("shipToId", newRecord.id);

        // Reset form & close
        setShipToForm({ name: "", address: "", contactPerson: "", contactNo: "", cnic: "", ntn: "" });
        setIsShipToModalOpen(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create Ship To record.");
    } finally {
      setIsSubmittingShipTo(false);
    }
  };

  const handleSaveBillTo = async (e) => {
    e.preventDefault();
    if (isSubmittingBillTo) return;

    // Validation
    const errors = {};
    if (!billToForm.name.trim()) errors.name = "Name is required";
    if (!billToForm.address.trim()) errors.address = "Address is required";
    if (!billToForm.refNo.trim()) errors.refNo = "Ref No is required";

    setBillToFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmittingBillTo(true);
    try {
      const response = await api.post(`/tenant/${selectedTenant.tenant_id}/bill-to`, billToForm);
      if (response.data && response.data.success) {
        const newRecord = response.data.data;
        toast.success("Bill To added successfully!");

        // Add to options list
        setBillToOptions((prev) => [newRecord, ...prev]);
        // Select it
        setSelectedBillTo(newRecord);
        handleChange("billToId", newRecord.id);

        // Reset form & close
        setBillToForm({ name: "", address: "", refNo: "", ntn: "", strn: "" });
        setIsBillToModalOpen(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to create Bill To record.");
    } finally {
      setIsSubmittingBillTo(false);
    }
  };

  const normalizeHsCode = (hsCode) => {
    if (!hsCode) return "";
    return hsCode.includes(" - ")
      ? hsCode.split(" - ")[0].trim()
      : hsCode.trim();
  };

  const [transactionTypes, setTransactionTypes] = React.useState([]);
  const [transactionTypesError, setTransactionTypesError] =
    React.useState(null);
  const [transactionTypesLoading, setTransactionTypesLoading] =
    React.useState(false);

  // State for transaction type dropdown
  const [transactionTypeDropdownOpen, setTransactionTypeDropdownOpen] =
    React.useState(false);

  // State for FBR registration status
  const [fbrRegistrationStatus, setFbrRegistrationStatus] = React.useState({
    loading: false,
    isActive: null,
    shouldApplyFurtherTax: null,
    message: "",
    error: null,
  });

  // Debug effect to monitor transactionTypes state
  React.useEffect(() => {
    console.log("TransactionTypes state changed:", transactionTypes);
    console.log("TransactionTypes length:", transactionTypes?.length || 0);
    console.log("TransactionTypes error:", transactionTypesError);
  }, [transactionTypes, transactionTypesError]);

  // Debug effect to monitor selectedBuyerId changes
  React.useEffect(() => {
    console.log("SelectedBuyerId changed:", selectedBuyerId);
    if (selectedBuyerId && buyers.length > 0) {
      const buyer = buyers.find((b) => b.id === selectedBuyerId);
      console.log("Selected buyer details:", buyer);
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
        error: null,
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
        setFbrRegistrationStatus((prev) => ({
          ...prev,
          loading: true,
          error: null,
        }));

        const currentDate = dayjs().format("YYYY-MM-DD");
        console.log(
          `Checking FBR status for NTN: ${buyer.buyerNTNCNIC}, Date: ${currentDate}`,
        );

        const result = await checkRegistrationStatusWithDate(
          buyer.buyerNTNCNIC,
          currentDate,
        );

        console.log("FBR API result:", result);

        setFbrRegistrationStatus({
          loading: false,
          isActive: result.isActive,
          shouldApplyFurtherTax: result.shouldApplyFurtherTax,
          message: result.message,
          error: null,
        });

        // Update Further Tax for all items based on FBR status
        if (result.shouldApplyFurtherTax !== null) {
          setFormData((prev) => ({
            ...prev,
            items: prev.items.map((item) => {
              // Only auto-calculate if not manually edited
              if (item.isFurtherTaxManual) {
                // If manually edited, only recalculate Total Values with current Further Tax
                const calculatedTotalBeforeDiscount =
                  parseFloat(item.valueSalesExcludingST || 0) +
                  parseFloat(item.salesTaxApplicable || 0) +
                  parseFloat(item.furtherTax || 0) + // Use current Further Tax value
                  parseFloat(item.fedPayable || 0) +
                  parseFloat(item.extraTax || 0) +
                  parseFloat(item.advanceIncomeTax || 0);

                const discountAmount = parseFloat(item.discount || 0);
                const totalAfterDiscount =
                  calculatedTotalBeforeDiscount - discountAmount;
                const taxWithheld = parseFloat(
                  item.salesTaxWithheldAtSource || 0,
                );
                const calculatedTotal = Number(
                  (totalAfterDiscount + taxWithheld).toFixed(2),
                );

                return {
                  ...item,
                  totalValues: calculatedTotal.toString(), // Update Total Values
                  isTotalValuesManual: false, // Reset manual flag since it's auto-calculated
                };
              }

              const valueSalesExcludingST =
                parseFloat(item.valueSalesExcludingST) || 0;
              const furtherTaxAmount = result.shouldApplyFurtherTax
                ? valueSalesExcludingST * 0.04
                : 0;

              // Recalculate Total Values when Further Tax changes
              const calculatedTotalBeforeDiscount =
                parseFloat(item.valueSalesExcludingST || 0) +
                parseFloat(item.salesTaxApplicable || 0) +
                furtherTaxAmount + // Use the new Further Tax amount
                parseFloat(item.fedPayable || 0) +
                parseFloat(item.extraTax || 0) +
                parseFloat(item.advanceIncomeTax || 0);

              const discountAmount = parseFloat(item.discount || 0);
              const totalAfterDiscount =
                calculatedTotalBeforeDiscount - discountAmount;
              const taxWithheld = parseFloat(
                item.salesTaxWithheldAtSource || 0,
              );
              const calculatedTotal = Number(
                (totalAfterDiscount + taxWithheld).toFixed(2),
              );

              return {
                ...item,
                furtherTax: furtherTaxAmount.toFixed(2), // Calculate 4% of Value Sales (Excluding ST)
                totalValues: calculatedTotal.toString(), // Update Total Values
                // Don't reset isFurtherTaxManual flag - preserve user's manual edits
                isTotalValuesManual: false, // Reset manual flag since it's auto-calculated
              };
            }),
          }));
        }
      } catch (error) {
        console.error("Error checking FBR registration status:", error);
        setFbrRegistrationStatus({
          loading: false,
          isActive: null,
          shouldApplyFurtherTax: null,
          message: "",
          error: error.message,
        });
      }
    };

    checkFbrStatus();
  }, [selectedBuyerId, buyers]);

  // Effect to recalculate Total Values when Further Tax is manually changed
  React.useEffect(() => {
    if (fbrRegistrationStatus.shouldApplyFurtherTax !== null) {
      setFormData((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (item.isFurtherTaxManual) {
            // If manually edited, only recalculate Total Values with current Further Tax
            const calculatedTotalBeforeDiscount =
              parseFloat(item.valueSalesExcludingST || 0) +
              parseFloat(item.salesTaxApplicable || 0) +
              parseFloat(item.furtherTax || 0) + // Use current Further Tax value
              parseFloat(item.fedPayable || 0) +
              parseFloat(item.extraTax || 0) +
              parseFloat(item.advanceIncomeTax || 0);

            const discountAmount = parseFloat(item.discount || 0);
            const totalAfterDiscount =
              calculatedTotalBeforeDiscount - discountAmount;
            const taxWithheld = parseFloat(item.salesTaxWithheldAtSource || 0);
            const calculatedTotal = Number(
              (totalAfterDiscount + taxWithheld).toFixed(2),
            );

            return {
              ...item,
              totalValues: calculatedTotal.toString(), // Update Total Values
              isTotalValuesManual: false, // Reset manual flag since it's auto-calculated
            };
          }

          // For non-manual further tax, don't recalculate - let user control it
          return item;
        }),
      }));
    }
  }, [fbrRegistrationStatus.shouldApplyFurtherTax]);

  // Effect to calculate Further Tax when Value Sales changes (for new invoices)
  React.useEffect(() => {
    if (fbrRegistrationStatus.shouldApplyFurtherTax !== null) {
      setFormData((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          // Only auto-calculate if not manually edited and FBR status requires further tax
          if (
            !item.isFurtherTaxManual &&
            fbrRegistrationStatus.shouldApplyFurtherTax
          ) {
            const valueSalesExcludingST =
              parseFloat(item.valueSalesExcludingST) || 0;
            const furtherTaxAmount = valueSalesExcludingST * 0.04;

            // Recalculate Total Values when Further Tax changes
            const calculatedTotalBeforeDiscount =
              parseFloat(item.valueSalesExcludingST || 0) +
              parseFloat(item.salesTaxApplicable || 0) +
              furtherTaxAmount + // Use the new Further Tax amount
              parseFloat(item.fedPayable || 0) +
              parseFloat(item.extraTax || 0) +
              parseFloat(item.advanceIncomeTax || 0);

            const discountAmount = parseFloat(item.discount || 0);
            const totalAfterDiscount =
              calculatedTotalBeforeDiscount - discountAmount;
            const taxWithheld = parseFloat(item.salesTaxWithheldAtSource || 0);
            const calculatedTotal = Number(
              (totalAfterDiscount + taxWithheld).toFixed(2),
            );

            return {
              ...item,
              furtherTax: furtherTaxAmount.toFixed(2), // Calculate 4% of Value Sales (Excluding ST)
              totalValues: calculatedTotal.toString(), // Update Total Values
              isTotalValuesManual: false, // Reset manual flag since it's auto-calculated
            };
          }

          return item;
        }),
      }));
    }
  }, [
    formData.items.map((item) => item.valueSalesExcludingST).join(","),
    fbrRegistrationStatus.shouldApplyFurtherTax,
  ]);

  // Effect to update form data when buyer is selected
  React.useEffect(() => {
    if (!selectedBuyerId || buyers.length === 0) return;

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

  // Debug effect to monitor selectedProductIdByItem changes
  React.useEffect(() => {
    console.log("selectedProductIdByItem changed:", selectedProductIdByItem);
    if (selectedProductIdByItem[0] && products.length > 0) {
      const selectedProduct = products.find(
        (p) => p.id === selectedProductIdByItem[0],
      );
      console.log("Selected product details:", selectedProduct);
    }
  }, [selectedProductIdByItem, products]);

  // Load UoM options when product is selected or HS Code is available
  React.useEffect(() => {
    const loadUomOptions = async (index) => {
      const productId = selectedProductIdByItem[index];
      const selectedProduct = products.find((p) => p.id === productId);

      // Use HS code from selected product or from form data
      let rawHsCode = selectedProduct?.hsCode || formData.items[index]?.hsCode;

      if (!rawHsCode) {
        setUomOptions((prev) => ({ ...prev, [index]: [] }));
        return;
      }

      // Extract HS code (remove description if present)
      const hsCode = rawHsCode.includes(" - ")
        ? rawHsCode.split(" - ")[0].trim()
        : rawHsCode.trim();

      if (!hsCode) {
        setUomOptions((prev) => ({ ...prev, [index]: [] }));
        return;
      }

      console.log(`loadUomOptions for index ${index}, hsCode:`, hsCode);
      setLoadingUom((prev) => ({ ...prev, [index]: true }));

      try {
        const uomData = await hsCodeCache.getUOM(hsCode, "sandbox");
        console.log(`loadUomOptions for index ${index} result:`, uomData);
        setUomOptions((prev) => ({ ...prev, [index]: uomData || [] }));
      } catch (error) {
        console.error("Error loading UoM options:", error);
        setUomOptions((prev) => ({ ...prev, [index]: [] }));
      } finally {
        setLoadingUom((prev) => ({ ...prev, [index]: false }));
      }
    };

    // Load UoM for all items in formData
    if (formData.items) {
      formData.items.forEach((_, index) => {
        loadUomOptions(index);
      });
    }
  }, [
    selectedProductIdByItem,
    products,
    formData.items?.map((item) => item.hsCode).join(","),
  ]);

  // Debug effect to monitor UoM value in formData
  React.useEffect(() => {
    if (formData.items && formData.items[0]) {
      console.log("Current item 0 UoM in formData:", formData.items[0].uoM);
    }
  }, [formData.items]);

  // Effect to sync buyer selection with form data when editing
  React.useEffect(() => {
    if (
      editingItemIndex &&
      formData.buyerNTNCNIC &&
      formData.buyerBusinessName &&
      buyers.length > 0
    ) {
      console.log("Syncing buyer selection with form data during editing");
      const matchingBuyer = buyers.find(
        (buyer) =>
          buyer.buyerNTNCNIC === formData.buyerNTNCNIC &&
          buyer.buyerBusinessName === formData.buyerBusinessName,
      );
      if (matchingBuyer && matchingBuyer.id !== selectedBuyerId) {
        console.log(
          "Updating buyer selection to match form data:",
          matchingBuyer.id,
        );
        setSelectedBuyerId(matchingBuyer.id);
      }
    }
  }, [editingItemIndex, buyers]); // Removed formData and selectedBuyerId to prevent loops

  // Sync product selection with form data during editing
  React.useEffect(() => {
    if (
      editingItemIndex &&
      formData.items[0]?.hsCode &&
      formData.items[0]?.name &&
      products.length > 0
    ) {
      console.log("Syncing product selection with form data during editing");
      const matchingProduct = products.find(
        (product) =>
          normalizeHsCode(product.hsCode).toLowerCase() ===
          normalizeHsCode(formData.items[0].hsCode).toLowerCase() &&
          (product.name || "").trim().toLowerCase() ===
          (formData.items[0].name || "").trim().toLowerCase(),
      );

      if (matchingProduct) {
        if (matchingProduct.id !== selectedProductIdByItem[0]) {
          console.log(
            "Updating product selection to match form data:",
            matchingProduct.id,
          );
          setSelectedProductIdByItem((prev) => ({
            ...prev,
            0: matchingProduct.id,
          }));
        }

        // Only set input value if it's currently empty (initial load for editing)
        // This prevents fighting with the user during typing/clearing
        if (!productInputValue && matchingProduct.name) {
          setProductInputValue(matchingProduct.name);
        }
      }
    }
  }, [editingItemIndex, products]); // Removed formData and selectedProductIdByItem to prevent loops

  // Function to handle transaction type button click
  const handleTransactionTypeButtonClick = async () => {
    if (transactionTypes.length === 0 && !transactionTypesLoading) {
      // Check if we have the required dependencies
      if (!selectedTenant || !tokensLoaded) {
        setTransactionTypesError(
          "Please ensure a Company is selected and credentials are loaded.",
        );
        return;
      }

      // Ensure we have a token before calling API
      const token =
        API_CONFIG.getCurrentToken("sandbox") ||
        localStorage.getItem("sandboxProductionToken");
      if (!token) {
        setTransactionTypesError(
          "No FBR token found. Please ensure the Company is selected and credentials are loaded.",
        );
        return;
      }

      // If no transaction types loaded, fetch them first
      setTransactionTypesLoading(true);
      setTransactionTypesError(null);

      try {
        const data = await getTransactionTypes();
        let transactionTypesArray = [];

        if (Array.isArray(data)) {
          transactionTypesArray = data;
        } else if (data && typeof data === "object") {
          if (data.data && Array.isArray(data.data)) {
            transactionTypesArray = data.data;
          } else if (
            data.transactionTypes &&
            Array.isArray(data.transactionTypes)
          ) {
            transactionTypesArray = data.transactionTypes;
          } else if (data.results && Array.isArray(data.results)) {
            transactionTypesArray = data.results;
          } else {
            transactionTypesArray = [data];
          }
        }

        if (transactionTypesArray.length > 0) {
          setTransactionTypes(transactionTypesArray);
          setTransactionTypeDropdownOpen(true);
        } else {
          setTransactionTypesError("API returned empty transaction types list");
        }
      } catch (error) {
        setTransactionTypesError(
          error.message ||
          "Failed to fetch transaction types from API. Please check your connection and try again.",
        );
      } finally {
        setTransactionTypesLoading(false);
      }
    } else {
      // If transaction types are already loaded, just open the dropdown
      setTransactionTypeDropdownOpen(true);
    }
  };

  // Fetch transaction types from API - now triggered by button click instead of automatic
  // React.useEffect(() => {
  //   const fetchTransactionTypes = async () => {
  //     // Only fetch when tenant and tokens are ready
  //     if (!selectedTenant || !tokensLoaded) {
  //       return;
  //     }

  //     // Ensure we have a token before calling API to avoid spurious errors on refresh
  //     const token =
  //       API_CONFIG.getCurrentToken("sandbox") ||
  //       localStorage.getItem("sandboxProductionToken");
  //     if (!token) {
  //       return;
  //     }

  //     console.log("Fetching transaction types from API...");
  //     setTransactionTypesLoading(true);
  //     setTransactionTypesError(null);

  //     try {
  //       const data = await getTransactionTypes();

  //       // Handle different possible response structures
  //       let transactionTypesArray = [];

  //       if (Array.isArray(data)) {
  //         transactionTypesArray = data;
  //       } else if (data && typeof data === "object") {
  //         // Check if data is wrapped in a response object
  //         if (data.data && Array.isArray(data.data)) {
  //           transactionTypesArray = data.data;
  //         } else if (
  //           data.transactionTypes &&
  //           Array.isArray(data.transactionTypes)
  //         ) {
  //           transactionTypesArray = data.transactionTypes;
  //         } else if (data.results && Array.isArray(data.results)) {
  //           transactionTypesArray = data.results;
  //         } else {
  //           // If it's a single object, wrap it in an array
  //           transactionTypesArray = [data];
  //         }
  //       }

  //       console.log("Transaction types from API:", transactionTypesArray);

  //       if (transactionTypesArray.length > 0) {
  //         setTransactionTypes(transactionTypesArray);
  //       } else {
  //         setTransactionTypesError("API returned empty transaction types list");
  //       }
  //     } catch (error) {
  //       console.error("Error fetching transaction types:", error);
  //       setTransactionTypesError(
  //         error.message ||
  //           "Failed to fetch transaction types from API. Please check your connection and try again."
  //       );
  //     } finally {
  //       setTransactionTypesLoading(false);
  //     }
  //   };

  //   fetchTransactionTypes();
  // }, [selectedTenant, tokensLoaded]);

  const [loading, setLoading] = React.useState(false);
  const [saveLoading, setSaveLoading] = React.useState(false);
  const [saveValidateLoading, setSaveValidateLoading] = React.useState(false);
  const [isPrintable, setIsPrintable] = React.useState(false);
  const [province, setProvince] = React.useState([]);
  const [hsCodeList, setHsCodeList] = React.useState([]);
  const [invoiceTypes, setInvoiceTypes] = React.useState([]);
  const navigate = useNavigate();
  const [allLoading, setAllLoading] = React.useState(true);
  const [transactionTypeId, setTransactionTypeId] = React.useState(null);
  const [loadingTimeout, setLoadingTimeout] = React.useState(false);
  const [editingId, setEditingId] = React.useState(null);
  const [isSubmitVisible, setIsSubmitVisible] = React.useState(false);

  // Auto-fetch transaction types in edit mode or when a transaction type is already present
  React.useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    const hasExistingTransctype = Boolean(
      transactionTypeId || formData.transctypeId,
    );

    if (
      (isEditing || hasExistingTransctype) &&
      transactionTypes.length === 0 &&
      !transactionTypesLoading &&
      selectedTenant &&
      tokensLoaded
    ) {
      const fetchTypes = async () => {
        try {
          setTransactionTypesLoading(true);
          setTransactionTypesError(null);
          const data = await getTransactionTypes();
          let transactionTypesArray = [];
          if (Array.isArray(data)) {
            transactionTypesArray = data;
          } else if (data && typeof data === "object") {
            if (data.data && Array.isArray(data.data)) {
              transactionTypesArray = data.data;
            } else if (
              data.transactionTypes &&
              Array.isArray(data.transactionTypes)
            ) {
              transactionTypesArray = data.transactionTypes;
            } else if (data.results && Array.isArray(data.results)) {
              transactionTypesArray = data.results;
            } else {
              transactionTypesArray = [data];
            }
          }
          if (transactionTypesArray.length > 0) {
            setTransactionTypes(transactionTypesArray);
          } else {
            setTransactionTypesError(
              "API returned empty transaction types list",
            );
          }
        } catch (error) {
          setTransactionTypesError(
            error.message ||
            "Failed to fetch transaction types from API. Please check your connection and try again.",
          );
        } finally {
          setTransactionTypesLoading(false);
        }
      };
      fetchTypes();
    }
  }, [
    transactionTypeId,
    formData.transctypeId,
    transactionTypes.length,
    transactionTypesLoading,
    selectedTenant,
    tokensLoaded,
  ]);

  // Add timeout mechanism to prevent infinite loading
  React.useEffect(() => {
    if (!tokensLoaded && selectedTenant) {
      const timeout = setTimeout(() => {
        setLoadingTimeout(true);

        // Automatically retry token fetch when timeout is reached
        if (retryTokenFetch) {
          retryTokenFetch();
        }
      }, 10000); // 10 seconds timeout

      return () => clearTimeout(timeout);
    } else {
      setLoadingTimeout(false);
    }
  }, [tokensLoaded, selectedTenant, retryTokenFetch]);

  // Hide Submit button whenever form data changes after a successful validation.
  // Skipped once (via suppressSubmitResetRef) when we intentionally update formData
  // as part of the save-validate success flow so the Submit button stays visible.
  React.useEffect(() => {
    if (suppressSubmitResetRef.current) {
      suppressSubmitResetRef.current = false;
      return;
    }
    if (isSubmitVisible) {
      setIsSubmitVisible(false);
    }
    // We intentionally ignore dependencies like setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const handleChange = (name, value) => {
    if (name === "invoiceDate") {
      if (value && dayjs(value).isAfter(dayjs(), "day")) {
        setInvoiceDateError(
          "This date exceeds the current date. Please select today or a past date.",
        );
      } else {
        setInvoiceDateError("");
      }
    }
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: value,
      };
      if (name === "companyInvoiceRefNo") {
        next.sourceInvoiceNo = value;
      }
      return next;
    });
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
  }, [selectedTenant]); // Removed province dependency to prevent infinite loops

  // Check for draft invoice data to edit
  React.useEffect(() => {
    const editInvoiceData = localStorage.getItem("editInvoiceData");
    if (editInvoiceData) {
      try {
        const invoiceData = JSON.parse(editInvoiceData);
        if (invoiceData.sourceInvoiceNo) {
          originalSourceInvoiceNoRef.current = invoiceData.sourceInvoiceNo;
        }
        // Track editing draft id
        if (invoiceData.id) {
          setEditingId(invoiceData.id);
        }

        // Debug: Log the invoice data to see what's available
        console.log("Loading invoice data for editing:", invoiceData);
        console.log("Invoice type from data:", invoiceData.invoiceType);
        console.log("Available invoice types:", invoiceTypes);

        // Check if we need to wait for invoice types to load
        if (invoiceTypes.length === 0) {
          console.log(
            "Invoice types not loaded yet, will retry when they're available",
          );
        }

        // Helper function to find invoice type description by ID or description
        const getInvoiceTypeDescription = (invoiceTypeValue) => {
          if (!invoiceTypeValue) return "";

          // If it's already a description, return it
          if (typeof invoiceTypeValue === "string") {
            // Check if it matches any of the available descriptions
            const matchingType = invoiceTypes.find(
              (type) => type.docDescription === invoiceTypeValue,
            );
            if (matchingType) return invoiceTypeValue;
          }

          // If it's a number/ID, try to find the description
          if (!isNaN(invoiceTypeValue)) {
            const matchingType = invoiceTypes.find(
              (type) => type.docTypeId === parseInt(invoiceTypeValue),
            );
            if (matchingType) return matchingType.docDescription;
          }

          // If no match found, return the original value
          return invoiceTypeValue;
        };

        // Convert the invoice data to form format
        const formDataFromInvoice = {
          invoiceType:
            getInvoiceTypeDescription(invoiceData.invoiceType) ||
            getInvoiceTypeDescription(invoiceData.docTypeDescription) ||
            getInvoiceTypeDescription(invoiceData.documentType) ||
            "",
          invoiceDate: invoiceData.invoiceDate
            ? dayjs(invoiceData.invoiceDate)
            : dayjs(),
          sellerNTNCNIC: invoiceData.sellerNTNCNIC || "",
          sellerFullNTN: invoiceData.sellerFullNTN || "",
          sellerBusinessName: invoiceData.sellerBusinessName || "",
          sellerProvince: invoiceData.sellerProvince || "",
          sellerAddress: invoiceData.sellerAddress || "",
          buyerNTNCNIC: invoiceData.buyerNTNCNIC || "",
          buyerBusinessName: invoiceData.buyerBusinessName || "",
          buyerProvince: invoiceData.buyerProvince || "",
          buyerAddress: invoiceData.buyerAddress || "",
          buyerRegistrationType: invoiceData.buyerRegistrationType || "",
          invoiceRefNo: invoiceData.invoiceRefNo || "",
          companyInvoiceRefNo: invoiceData.companyInvoiceRefNo || "",
          custAccountNo: invoiceData.custAccountNo || "",
          custLpoNo: invoiceData.custLpoNo || "",
          lpoDate: invoiceData.lpoDate || "",
          deliveryNoteNo: invoiceData.deliveryNoteNo || "",
          sp: invoiceData.sp || "",
          productOrigin: invoiceData.productOrigin || "",
          productCertifiedBy: invoiceData.productCertifiedBy || "",
          paymentTerms: invoiceData.paymentTerms || "",
          paymentDue: invoiceData.paymentDue || "",
          group: invoiceData.group || "",
          sourceInvoiceNo: invoiceData.sourceInvoiceNo || "",
          transctypeId: "",
          billToId: invoiceData.bill_to_id || invoiceData.billToId || "",
          shipToId: invoiceData.ship_to_id || invoiceData.shipToId || "",
          items: [
            {
              name: "",
              hsCode: "",
              productDescription: "",
              rate: "",
              quantity: "1",
              unitPrice: "0.00", // Calculated field: Retail Price ÷ Quantity
              retailPrice: "0", // User input field
              itemCode: "",
              units: "",
              qtyForInternal: "",
              courierCharges: "0",
              totalValues: "0",
              valueSalesExcludingST: "0",
              salesTaxApplicable: "0",
              salesTaxWithheldAtSource: "0",
              sroScheduleNo: "",
              sroItemSerialNo: "",
              billOfLadingUoM: "",
              uoM: "",
              uoMForInternal: "",
              saleType: "",
              isSROScheduleEnabled: false,
              isSROItemEnabled: false,
              extraTax: "",
              furtherTax: "0",
              fedPayable: "0",
              discount: "0",
              advanceIncomeTax: "0",
              isValueSalesManual: false,
              isTotalValuesManual: false,
              isSalesTaxManual: false,
              isSalesTaxWithheldManual: false,
              isFurtherTaxManual: false,
              isFedPayableManual: false,
            },
          ],
        };

        setFormData(formDataFromInvoice);

        if (invoiceData.BillTo) {
          setSelectedBillTo(invoiceData.BillTo);
          setBillToInputValue(invoiceData.BillTo.name || "");
        }
        if (invoiceData.ShipTo) {
          setSelectedShipTo(invoiceData.ShipTo);
          setShipToInputValue(invoiceData.ShipTo.name || "");
        }

        // Set existing items to addedItems for editing
        if (invoiceData.items && invoiceData.items.length > 0) {
          const existingItems = invoiceData.items.map((item) => ({
            id: item.id || `existing-${Date.now()}-${Math.random()}`, // Generate unique ID if not present
            name: item.name || "",
            hsCode: item.hsCode || "",
            productDescription: item.productDescription || "",
            rate: item.rate || "",
            quantity: item.quantity || "1",
            unitPrice: item.unitPrice
              ? parseFloat(item.unitPrice).toFixed(2)
              : "0.00",
            retailPrice:
              item.retailPrice || item.fixedNotifiedValueOrRetailPrice || "0",
            itemCode: item.item_code || item.itemCode || "",
            units: item.units || "",
            weight: item.weight !== undefined && item.weight !== null ? String(item.weight) : "",
            qtyForInternal: item.qtyForInternal !== undefined && item.qtyForInternal !== null ? String(item.qtyForInternal) : "",
            courierCharges: item.courier_charges !== undefined
              ? String(item.courier_charges)
              : item.courierCharges || "0",
            totalValues: item.totalValues || "0",
            valueSalesExcludingST: item.valueSalesExcludingST || "0",
            salesTaxApplicable: item.salesTaxApplicable || "0",
            salesTaxWithheldAtSource: item.salesTaxWithheldAtSource || "0",
            sroScheduleNo: item.sroScheduleNo || "",
            sroItemSerialNo: item.sroItemSerialNo || "",
            billOfLadingUoM: item.billOfLadingUoM || "",
            uoM: item.uoM || "",
            uoMForInternal: item.uoMForInternal || "",
            saleType: item.saleType || "",
            isSROScheduleEnabled: item.rate ? true : false,
            isSROItemEnabled: item.sroScheduleNo ? true : false,
            extraTax: item.extraTax || "",
            furtherTax: item.furtherTax || "0",
            fedPayable: item.fedPayable || "0",
            discount: item.discount || "0",
            advanceIncomeTax: item.advanceIncomeTax || "0",
            vat18: item.vat18 || false,
            vat25: item.vat25 || false,
            vatAmount: item.vatAmount || 0,
            vat18Amount: item.vat18Amount !== undefined && item.vat18Amount !== null ? parseFloat(item.vat18Amount) : (item.vat18 ? Math.round(((parseFloat(item.valueSalesExcludingST || 0) || 0) + (parseFloat(item.salesTaxApplicable || 0) || 0)) * 0.18 * 100) / 100 : 0),
            vat25Amount: item.vat25Amount !== undefined && item.vat25Amount !== null ? parseFloat(item.vat25Amount) : (item.vat25 ? Math.round(((parseFloat(item.valueSalesExcludingST || 0) || 0) + (parseFloat(item.salesTaxApplicable || 0) || 0)) * 0.25 * 100) / 100 : 0),
            isValueSalesManual: false,
            isTotalValuesManual: false,
            isSalesTaxManual: false,
            isSalesTaxWithheldManual: false,
            isFurtherTaxManual: true, // Mark as manual when editing to preserve user's Further Tax value
            isFedPayableManual: false,
          }));
          setAddedItems(existingItems);
        }

        // Debug: Log the final form data
        console.log("Final form data set:", formDataFromInvoice);
        console.log(
          "Invoice type in form data:",
          formDataFromInvoice.invoiceType,
        );

        // Set the transactionTypeId and other required data for editing
        const scenarioId = invoiceData.scenario_id || invoiceData.scenarioId;

        // Ensure transaction type is cleared when editing
        localStorage.removeItem("transactionTypeId");
        setTransactionTypeId(null);

        // Set saleType if available from items
        if (
          invoiceData.items &&
          invoiceData.items.length > 0 &&
          invoiceData.items[0].saleType
        ) {
          localStorage.setItem("saleType", invoiceData.items[0].saleType);
        }

        // Set selectedRateId if available from items (for SRO components)
        if (
          invoiceData.items &&
          invoiceData.items.length > 0 &&
          invoiceData.items[0].rate
        ) {
          // We need to find the rate ID from the rate description
          // This will be handled by the RateSelector component when it loads
          // For now, we'll set a flag to indicate we're editing
          localStorage.setItem("editingInvoice", "true");
        }

        // Set buyer ID for editing - this is the key fix for buyer data not coming
        if (invoiceData.buyerNTNCNIC && invoiceData.buyerBusinessName) {
          // We'll set this after buyers are loaded
          localStorage.setItem(
            "editingBuyerData",
            JSON.stringify({
              buyerNTNCNIC: invoiceData.buyerNTNCNIC,
              buyerBusinessName: invoiceData.buyerBusinessName,
              buyerProvince: invoiceData.buyerProvince,
              buyerAddress: invoiceData.buyerAddress,
              buyerRegistrationType: invoiceData.buyerRegistrationType,
            }),
          );
        }

        // NEW: Set product data for editing - Store product info for restoration
        if (invoiceData.items && invoiceData.items.length > 0) {
          const productData = invoiceData.items.map((item) => ({
            name: item.name || "",
            productDescription: item.productDescription || "",
            hsCode: item.hsCode || "",
            billOfLadingUoM: item.billOfLadingUoM || "",
            uoM: item.uoM || "",
            // Store additional fields that might help with product matching
            quantity: item.quantity || "",
            rate: item.rate || "",
            // Add other product fields as needed
          }));

          localStorage.setItem(
            "editingProductData",
            JSON.stringify(productData),
          );

          console.log("Stored product data for editing:", productData);
        }

        // Clear the localStorage data after loading (keep id in state)
        setIsEditMode(true);
        setEditInvoiceNumber(
          invoiceData.invoiceNumber ||
          invoiceData.companyInvoiceRefNo ||
          invoiceData.invoiceRefNo ||
          "",
        );
        localStorage.removeItem("editInvoiceData");

        // Show a notification that we're editing an invoice
        Swal.fire({
          icon: "info",
          title: "Editing Invoice",
          text: "Invoice data loaded for editing. Please review and make any necessary changes.",
          timer: 3000,
          showConfirmButton: false,
        });
      } catch (error) {
        console.error("Error parsing edit invoice data:", error);
        localStorage.removeItem("editInvoiceData");
      }
    }
  }, [selectedTenant, tokensLoaded]);

  // Retry loading invoice data when invoice types become available
  React.useEffect(() => {
    const editInvoiceData = localStorage.getItem("editInvoiceData");
    if (editInvoiceData && invoiceTypes.length > 0) {
      try {
        const invoiceData = JSON.parse(editInvoiceData);
        console.log(
          "Retrying to load invoice data with invoice types:",
          invoiceTypes,
        );

        // Helper function to find invoice type description by ID or description
        const getInvoiceTypeDescription = (invoiceTypeValue) => {
          if (!invoiceTypeValue) return "";

          // If it's already a description, return it
          if (typeof invoiceTypeValue === "string") {
            // Check if it matches any of the available descriptions
            const matchingType = invoiceTypes.find(
              (type) => type.docDescription === invoiceTypeValue,
            );
            if (matchingType) return invoiceTypeValue;
          }

          // If it's a number/ID, try to find the description
          if (!isNaN(invoiceTypeValue)) {
            const matchingType = invoiceTypes.find(
              (type) => type.docTypeId === parseInt(invoiceTypeValue),
            );
            if (matchingType) return matchingType.docDescription;
          }

          // If no match found, return the original value
          return invoiceTypeValue;
        };

        // Update only the invoice type if it was empty before
        setFormData((prev) => {
          if (!prev.invoiceType && invoiceData.invoiceType) {
            const resolvedInvoiceType =
              getInvoiceTypeDescription(invoiceData.invoiceType) ||
              getInvoiceTypeDescription(invoiceData.docTypeDescription) ||
              getInvoiceTypeDescription(invoiceData.documentType) ||
              "";
            console.log("Updating invoice type to:", resolvedInvoiceType);
            return {
              ...prev,
              invoiceType: resolvedInvoiceType,
            };
          }
          return prev;
        });
      } catch (error) {
        console.error("Error retrying invoice data load:", error);
      }
    }
  }, [invoiceTypes]);

  // Handle setting buyer ID when editing and buyers are loaded
  useEffect(() => {
    const checkAndRestoreBuyer = async () => {
      const editingBuyerData = localStorage.getItem("editingBuyerData");
      if (!editingBuyerData) return;

      // Wait for any loading to complete to ensure we have the latest list
      // This prevents race conditions where we search before the initial list is ready
      if (loadingBuyers) return;

      try {
        const buyerData = JSON.parse(editingBuyerData);

        // Robust matching logic:
        // 1. Try exact match on NTN/CNIC (most reliable)
        // 2. Try match on Business Name
        const matchingBuyer = buyers.find((buyer) => {
          if (
            buyerData.buyerNTNCNIC &&
            buyer.buyerNTNCNIC === buyerData.buyerNTNCNIC
          ) {
            return true;
          }
          if (
            !buyerData.buyerNTNCNIC &&
            buyer.buyerBusinessName === buyerData.buyerBusinessName
          ) {
            return true;
          }
          return false;
        });

        if (matchingBuyer) {
          console.log(
            "Found buyer for restoration:",
            matchingBuyer.buyerBusinessName,
          );
          setSelectedBuyerId(matchingBuyer.id);
          setSelectedBuyer(matchingBuyer); // Explicitly set selectedBuyer object
          // Sync Input Value Explicitly
          if (matchingBuyer) {
            const label = matchingBuyer.buyerBusinessName
              ? `${matchingBuyer.buyerBusinessName} (${matchingBuyer.buyerNTNCNIC})`
              : "";
            setBuyerInputValue(label);
          }
          localStorage.removeItem("editingBuyerData");
        } else if (selectedTenant) {
          // If not found in current list, try to fetch it
          console.log(
            "Buyer not found in current list, searching API...",
            buyerData,
          );
          try {
            // Search by NTN if available, otherwise name
            const searchTerm =
              buyerData.buyerNTNCNIC || buyerData.buyerBusinessName;

            const response = await api.get(
              `/tenant/${selectedTenant.tenant_id}/buyers`,
              {
                params: {
                  search: searchTerm,
                },
              },
            );

            if (response.data.success && response.data.data.buyers) {
              const found = response.data.data.buyers.find((b) => {
                if (
                  buyerData.buyerNTNCNIC &&
                  b.buyerNTNCNIC === buyerData.buyerNTNCNIC
                )
                  return true;
                return b.buyerBusinessName === buyerData.buyerBusinessName;
              });

              if (found) {
                console.log("Buyer found via API search:", found);
                setBuyers((prev) => {
                  if (prev.some((b) => b.id === found.id)) return prev;
                  return [...prev, found];
                });

                // Immediately restore since we found the buyer
                setSelectedBuyerId(found.id);
                setSelectedBuyer(found); // Explicitly set selectedBuyer object
                const label = found.buyerBusinessName
                  ? `${found.buyerBusinessName} (${found.buyerNTNCNIC})`
                  : "";
                setBuyerInputValue(label);
                localStorage.removeItem("editingBuyerData");
              } else {
                console.log("Buyer not found in API search either.");
                // We should probably keep retrying or let the user manually select
                // But to avoid infinite loops if data is truly gone:
                // localStorage.removeItem("editingBuyerData");
              }
            }
          } catch (err) {
            console.error("Error searching buyer:", err);
          }
        }
      } catch (error) {
        console.error("Error parsing editing buyer data:", error);
        localStorage.removeItem("editingBuyerData");
      }
    };

    checkAndRestoreBuyer();

    // Also try to restore buyer information for items being edited when buyers are loaded
    if (editingItemIndex && buyers.length > 0) {
      console.log(
        "Buyers loaded, attempting to restore buyer for editing item",
      );
    }
  }, [buyers, loadingBuyers, selectedTenant, editingItemIndex]);

  // NEW: Handle setting product IDs when editing and products are loaded
  // Only restore products when editing individual items, not when initially loading invoice
  useEffect(() => {
    const editingProductData = localStorage.getItem("editingProductData");
    if (editingProductData && products.length > 0 && editingItemIndex) {
      try {
        const productDataArray = JSON.parse(editingProductData);

        console.log(
          "Restoring products for editing individual item:",
          editingItemIndex,
        );

        // Find the specific item being edited
        const itemData = productDataArray[0]; // Since we're editing one item at a time

        if (
          itemData &&
          (itemData.name || itemData.hsCode || itemData.productDescription)
        ) {
          // Try multiple matching strategies
          let matchingProduct = null;

          // Strategy 1: Match by Case-insensitive name and HS Code
          if (itemData.name && itemData.hsCode) {
            matchingProduct = products.find(
              (product) =>
                (product.name || "").trim().toLowerCase() ===
                (itemData.name || "").trim().toLowerCase() &&
                normalizeHsCode(product.hsCode).toLowerCase() ===
                normalizeHsCode(itemData.hsCode).toLowerCase(),
            );
          }

          // Strict matching enforced. Loose strategies (HS Code only, Name only) removed to prevent incorrect prefill.

          if (matchingProduct) {
            console.log(`Found matching product for editing item:`, {
              itemName: itemData.name,
              itemHsCode: itemData.hsCode,
              matchedProductId: matchingProduct.id,
              matchedProductName: matchingProduct.name,
            });

            // Set product ID for the current editing item (index 0)
            setSelectedProductIdByItem((prev) => ({
              ...prev,
              0: matchingProduct.id,
            }));

            // Set input value to match the product name
            setProductInputValue(matchingProduct.name);
          } else {
            console.log(
              `No matching product found for editing item:`,
              itemData,
            );
          }
        }

        // Clear the editing product data after processing
        localStorage.removeItem("editingProductData");
      } catch (error) {
        console.error("Error parsing editing product data:", error);
        localStorage.removeItem("editingProductData");
      }
    }
  }, [products, editingItemIndex]);

  // Fix unit cost calculation when editing - ensure unit cost is calculated from retail price and quantity
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if (isEditing && formData.items && formData.items.length > 0) {
      setFormData((prev) => {
        const updatedItems = prev.items.map((item) => {
          const valueSales = parseFloat(
            parseFloat(item.valueSalesExcludingST || 0).toFixed(2),
          );
          const qtyForUnitCost =
            parseFloat(item.qtyForInternal || 0) > 0
              ? parseFloat(item.qtyForInternal)
              : parseFloat(item.quantity || 0);
          const unitCost = qtyForUnitCost > 0 ? valueSales / qtyForUnitCost : 0;
          return {
            ...item,
            unitPrice: unitCost.toFixed(2),
          };
        });
        return { ...prev, items: updatedItems };
      });
    }
  }, []); // Run only once on mount to fix editing mode

  // Ensure rate field is properly set when editing
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if (isEditing && formData.items && formData.items.length > 0) {
      // The rate field should already be set from the form data initialization
      // This effect ensures that if there are any timing issues, the rate is preserved
      const hasRateValues = formData.items.some(
        (item) => item.rate && item.rate.trim() !== "",
      );
      if (hasRateValues) {
        // Ensure the editing flag is maintained until rates are loaded
        localStorage.setItem("editingInvoice", "true");
      }
    }
  }, []); // Run only once on mount for editing mode

  React.useEffect(() => {
    // Don't make API calls if tenant is not selected
    if (!selectedTenant) {
      setAllLoading(false);
      return;
    }

    // Check if we have a token available (either from context or localStorage fallback)
    const token =
      API_CONFIG.getCurrentToken("sandbox") ||
      localStorage.getItem("sandboxProductionToken");
    if (!token) {
      setAllLoading(false);
      return;
    }

    // Add a small delay to ensure token manager is properly updated
    const timer = setTimeout(() => {
      setAllLoading(true);

      Promise.allSettled([
        // Use backend API instead of calling FBR directly to avoid CSP issues
        fetch(`/api/tenant/${selectedTenant.tenant_id}/provinces`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((response) => response.json())
          .then((data) => {
            if (data.success) {
              setProvince(data.data);
              localStorage.setItem(
                "provinceResponse",
                JSON.stringify(data.data),
              );
            } else {
              console.error("Failed to fetch provinces:", data.message);
              // Fallback to empty array
              setProvince([]);
            }
          })
          .catch((error) => {
            console.error("Error fetching provinces:", error);
            setProvince([]);
          }),
        // HS codes will be loaded by OptimizedHSCodeSelector component with caching
        Promise.resolve([]),
        (async () => {
          try {
            const token = API_CONFIG.getCurrentToken("sandbox");

            if (!token) {
              console.error("No token available for doctypecode API");
              setInvoiceTypes([
                { docTypeId: 4, docDescription: "Sale Invoice" },
                { docTypeId: 9, docDescription: "Debit Note" },
              ]);
              return;
            }

            // Use backend API instead of calling FBR directly to avoid CSP issues
            const response = await fetch(
              `/api/tenant/${selectedTenant.tenant_id}/document-types`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );

            if (response.ok) {
              const data = await response.json();
              setInvoiceTypes(data);
            } else {
              console.error(
                "Doctypecode API failed with status:",
                response.status,
              );
              setInvoiceTypes([
                { docTypeId: 4, docDescription: "Sale Invoice" },
                { docTypeId: 9, docDescription: "Debit Note" },
              ]);
            }
          } catch (error) {
            console.error("Error fetching doctypecode:", error);
            setInvoiceTypes([
              { docTypeId: 4, docDescription: "Sale Invoice" },
              { docTypeId: 9, docDescription: "Debit Note" },
            ]);
          }
        })(),
        // Transaction types will be loaded by the ensureTransactionTypes useEffect
        Promise.resolve([]),
      ]).finally(() => setAllLoading(false));
    }, 100);

    return () => clearTimeout(timer);
  }, [selectedTenant, tokensLoaded]);

  // Monitor token availability and retry if needed
  useEffect(() => {
    if (selectedTenant && tokensLoaded) {
      const token = API_CONFIG.getCurrentToken("sandbox");
      if (!token) {
        // Token not available despite tokensLoaded=true, this might indicate a race condition
        // Don't automatically retry - let the user handle it manually if needed
      } else {
        // Token is available, clear any loading timeout
        setLoadingTimeout(false);
      }
    }
  }, [selectedTenant, tokensLoaded]);

  // Monitor token availability and start loading data when token is available
  useEffect(() => {
    if (selectedTenant) {
      const token =
        API_CONFIG.getCurrentToken("sandbox") ||
        localStorage.getItem("sandboxProductionToken");
      if (token && !allLoading && !tokensLoaded) {
        // Trigger the data loading effect
        const timer = setTimeout(() => {
          setAllLoading(true);

          Promise.allSettled([
            // Use backend API instead of calling FBR directly to avoid CSP issues
            fetch(`/api/tenant/${selectedTenant.tenant_id}/provinces`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((response) => response.json())
              .then((data) => {
                if (data.success) {
                  setProvince(data.data);
                  localStorage.setItem(
                    "provinceResponse",
                    JSON.stringify(data.data),
                  );
                } else {
                  console.error("Failed to fetch provinces:", data.message);
                  // Fallback to empty array
                  setProvince(response);
                }
              })
              .catch((error) => {
                console.error("Error fetching provinces:", error);
                setProvince([]);
              }),
            // HS codes will be loaded by OptimizedHSCodeSelector component with caching
            Promise.resolve([]),
            (async () => {
              try {
                const token = API_CONFIG.getCurrentToken("sandbox");

                if (!token) {
                  console.error("No token available for doctypecode API");
                  setInvoiceTypes([
                    { docTypeId: 4, docDescription: "Sale Invoice" },
                    { docTypeId: 9, docDescription: "Debit Note" },
                  ]);
                  return;
                }

                // Use backend API instead of calling FBR directly to avoid CSP issues
                const response = await fetch(
                  `/api/tenant/${selectedTenant.tenant_id}/document-types`,
                  {
                    headers: { Authorization: `Bearer ${token}` },
                  },
                );

                if (response.ok) {
                  const data = await response.json();
                  setInvoiceTypes(data);
                } else {
                  console.error(
                    "Doctypecode API failed with status:",
                    response.status,
                  );
                  setInvoiceTypes([
                    { docTypeId: 4, docDescription: "Sale Invoice" },
                    { docTypeId: 9, docDescription: "Debit Note" },
                  ]);
                }
              } catch (error) {
                console.error("Error fetching doctypecode:", error);
                setInvoiceTypes([
                  { docTypeId: 4, docDescription: "Sale Invoice" },
                  { docTypeId: 9, docDescription: "Debit Note" },
                ]);
              }
            })(),
            // Transaction types will be loaded by the ensureTransactionTypes useEffect
            Promise.resolve([]),
          ]).finally(() => setAllLoading(false));
        }, 100);

        return () => clearTimeout(timer);
      }
    }
  }, [selectedTenant, allLoading, tokensLoaded]);

  // Handle scenario data changes (skip setting transaction type while editing)
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    const currentTransctypeId = formData.transctypeId;

    if (!isEditing && currentTransctypeId && transactionTypes.length > 0) {
      // Set transactionTypeId based on transctypeId only when not editing
      const newTransactionTypeId = currentTransctypeId;

      if (newTransactionTypeId) {
        localStorage.setItem("transactionTypeId", newTransactionTypeId);
        setTransactionTypeId(newTransactionTypeId);
      }
    }
  }, [transactionTypes, formData.transctypeId]);

  // Additional fallback (skip while editing)
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    const currentTransctypeId = formData.transctypeId;
    const storedTransactionTypeId = localStorage.getItem("transactionTypeId");

    if (!isEditing && currentTransctypeId && !transactionTypeId) {
      // Try to set from stored value first, then from form data when not editing
      const newTransactionTypeId =
        storedTransactionTypeId || currentTransctypeId;

      if (newTransactionTypeId) {
        setTransactionTypeId(newTransactionTypeId);
      }
    }
  }, [formData.transctypeId, transactionTypeId]);

  useEffect(() => {
    const fetchBuyersPage = async (page = 1, search = "", append = false) => {
      try {
        if (!selectedTenant) {
          setBuyers([]);
          setBuyerHasMore(false);
          return;
        }

        setLoadingBuyers(true);
        let response = null;
        if (!search && page === 1) {
          response = await api.get(
            `/tenant/${selectedTenant.tenant_id}/buyers/all`
          ).catch(() => null);
        }

        if (!response || !response.data || !response.data.success) {
          response = await api.get(
            `/tenant/${selectedTenant.tenant_id}/buyers`,
            {
              params: { page, limit: 1000, search: search || undefined },
            },
          );
        }

        if (response.data && response.data.success) {
          const rows = response.data.data?.buyers || [];
          const pagination = response.data.data?.pagination || {};
          setBuyers((prev) => (append ? [...prev, ...rows] : rows));
          setBuyerHasMore(
            pagination.total_pages ? (pagination.current_page || page) < pagination.total_pages : false
          );
          setBuyerPage(pagination.current_page || page);
        } else {
          setBuyerHasMore(false);
          if (!append) setBuyers([]);
        }
      } catch (error) {
        console.error("Error fetching buyers (paginated):", error);
        setBuyerHasMore(false);
        if (!append) setBuyers([]);
      } finally {
        setLoadingBuyers(false);
      }
    };

    // Reset list when tenant changes
    setBuyers([]);
    setBuyerSearch("");
    setBuyerPage(1);
    setBuyerHasMore(true);
    if (selectedTenant) {
      fetchBuyersPage(1, "", false);
    }

    // Expose functions to handlers
    createInvoiceFormFetchers.buyer = fetchBuyersPage;
  }, [selectedTenant]);

  // Local holder for fetchers to use inside event handlers without recreating
  const createInvoiceFormFetchers = React.useRef({}).current;

  const fetchProductsPage = React.useCallback(
    async (page = 1, search = "", append = false) => {
      if (!selectedTenant || loadingProducts) return;
      try {
        setLoadingProducts(true);
        const response = await api.get(
          `/tenant/${selectedTenant.tenant_id}/products`,
          {
            params: {
              page,
              limit: 25,
              search: search || undefined,
            },
          },
        );
        if (response.data.success) {
          const rows = response.data.data || [];
          const pagination = response.data.pagination || {};
          setProducts((prev) => (append ? [...prev, ...rows] : rows));
          setProductHasMore(!!pagination.hasMore);
          setProductPage(pagination.page || page);
        }
      } catch (error) {
        console.error("Error fetching products (paginated):", error);
        if (!append) setProducts([]);
        setProductHasMore(false);
      } finally {
        setLoadingProducts(false);
      }
    },
    [selectedTenant, loadingProducts],
  );

  // Initialize/reset products when tenant changes
  useEffect(() => {
    setProducts([]);
    setProductSearch("");
    setProductPage(1);
    setProductHasMore(true);
    if (selectedTenant) {
      fetchProductsPage(1, "", false);
    }
  }, [selectedTenant]);

  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [buyerInputValue, setBuyerInputValue] = useState("");

  const getBuyerLabel = (option) => {
    if (!option) return "";
    return option.buyerBusinessName
      ? `${option.buyerBusinessName} (${option.buyerNTNCNIC})`
      : "";
  };

  // Sync selectedBuyer with selectedBuyerId
  useEffect(() => {
    if (!selectedBuyerId) {
      setSelectedBuyer(null);
      // Also clear input if ID is cleared - REMOVED to prevent text loss on backspace
      return;
    }

    // Try to find in current buyers list first
    const found = buyers.find((b) => b.id === selectedBuyerId);
    if (found) {
      setSelectedBuyer(found);
    }
    // If not found in current list, keep the existing selectedBuyer if it matches the ID
    else if (selectedBuyer && selectedBuyer.id === selectedBuyerId) {
      // Do nothing, keep current
    }
  }, [selectedBuyerId, buyers]);

  // Duplicated code removed

  // Manual input sync useEffect removed to prevent fighting during search

  // Duplicated code removed

  // BuyerModal functions
  const openBuyerModal = () => {
    setIsBuyerModalOpen(true);
  };

  const closeBuyerModal = () => {
    setIsBuyerModalOpen(false);
  };

  const handleSaveBuyer = async (buyerData) => {
    try {
      const transformedData = {
        buyerNTNCNIC: buyerData.buyerNTNCNIC,
        buyerBusinessName: buyerData.buyerBusinessName,
        buyerProvince: buyerData.buyerProvince,
        buyerAddress: buyerData.buyerAddress,
        buyerRegistrationType: buyerData.buyerRegistrationType,
        buyerPhoneNumber: buyerData.buyerPhoneNumber,
      };

      // Create new buyer
      const response = await api.post(
        `/tenant/${selectedTenant.tenant_id}/buyers`,
        transformedData,
      );

      // Add the new buyer to the list
      setBuyers([...buyers, response.data.data]);

      // Close modal on success
      closeBuyerModal();

      // Show success message
      Swal.fire({
        icon: "success",
        title: "Buyer Added Successfully!",
        text: "The buyer has been added to your system.",
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (error) {
      console.error("Error saving buyer:", error);

      let errorMessage = "Error saving buyer.";

      if (error.response) {
        const { status, data } = error.response;

        if (status === 400) {
          if (data.message && data.message.includes("already exists")) {
            errorMessage =
              "A buyer with this NTN/CNIC already exists. Please use a different NTN/CNIC.";
          } else if (data.message && data.message.includes("validation")) {
            errorMessage =
              "Please check your input data. Some fields may be invalid or missing.";
          } else {
            errorMessage =
              data.message || "Invalid data provided. Please check all fields.";
          }
        } else if (status === 409) {
          errorMessage = "This buyer already exists in our system.";
        } else if (status === 500) {
          errorMessage = "Server error occurred. Please try again later.";
        } else {
          errorMessage =
            data.message || "An error occurred while saving the buyer.";
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      await showError({
        title: "Error",
        message: errorMessage,
        type: "error",
      });
    }
  };

  // Product modal handlers
  const openProductModal = () => setIsProductModalOpen(true);
  const closeProductModal = () => {
    setIsProductModalOpen(false);
  };
  const handleSaveProduct = async (productData) => {
    try {
      // Create new product
      const response = await api.post(
        `/tenant/${selectedTenant.tenant_id}/products`,
        {
          name: productData.name,
          description: productData.description,
          hsCode: productData.hsCode,
          uom: productData.uoM || productData.uom,
        },
      );
      const saved = response.data.data;
      setProducts((prev) => [...prev, saved]);
      setSelectedProductIdByItem((prev) => ({ ...prev, 0: saved.id }));
      setFormData((prev) => {
        const updated = [...prev.items];
        if (!updated[0]) updated[0] = {};
        updated[0] = {
          ...updated[0],
          name: saved.name,
          hsCode: saved.hsCode,
          productDescription: saved.description,
        };
        return { ...prev, items: updated };
      });
      setIsProductModalOpen(false);

      toast.success("Product has been added successfully.", {
        autoClose: 2000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } catch (e) {
      console.error("Error saving product:", e);

      let errorMessage = "Failed to save product. Please try again.";

      if (e.response) {
        const { status, data } = e.response;

        if (status === 400) {
          if (data.message && data.message.includes("HS Code is required")) {
            errorMessage = "HS Code is required for the product.";
          } else if (
            data.message &&
            data.message.includes("name is required")
          ) {
            errorMessage = "Product name is required.";
          } else {
            errorMessage =
              data.message || "Invalid data provided. Please check all fields.";
          }
        } else if (status === 409) {
          if (data.message && data.message.includes("HS Code")) {
            errorMessage = data.message;
          } else {
            errorMessage = "A product with this information already exists.";
          }
        } else if (status === 500) {
          errorMessage = "Server error occurred. Please try again later.";
        } else {
          errorMessage =
            data.message || "An error occurred while saving the product.";
        }
      } else if (e.message) {
        errorMessage = e.message;
      }

      toast.error(errorMessage, {
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };

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

  const handleItemChange = (index, field, value) => {
    console.log(
      `handleItemChange called for index ${index}, field ${field}, value:`,
      value,
    );
    setFormData((prev) => {
      const updatedItems = [...prev.items];
      const item = { ...updatedItems[index] };

      // Utility to parse values for calculations
      const parseValue = (val, isFloat = true) =>
        val === "" ? (isFloat ? 0 : "") : isFloat ? parseFloat(val) || 0 : val;

      // Update the field - store the raw string value for display
      if (
        [
          "quantity",
          "unitPrice", // Calculated field
          "retailPrice", // User input field
          "courierCharges",
          "valueSalesExcludingST",
          "salesTaxApplicable",
          "totalValues",
          "salesTaxWithheldAtSource",
          "extraTax",
          "furtherTax",
          "fedPayable",
          "advanceIncomeTax",
          "discount",
        ].includes(field)
      ) {
        // Store the raw string value for display
        item[field] = value;
        if (field === "valueSalesExcludingST") {
          item.isValueSalesManual = true;
        }
        if (field === "totalValues") {
          item.isTotalValuesManual = true;
        }
        if (field === "salesTaxApplicable") {
          item.isSalesTaxManual = true;
        }
        if (field === "salesTaxWithheldAtSource") {
          item.isSalesTaxWithheldManual = true;
        }
        if (field === "furtherTax") {
          item.isFurtherTaxManual = true;
        }
        if (field === "fedPayable") {
          item.isFedPayableManual = true;
        }
      } else {
        if (field === "vat18") {
          item.vat18 = value;
        } else if (field === "vat25") {
          item.vat25 = value;
        } else {
          item[field] = value;
        }
      }

      // Auto-calculate quantity (Qty in KGS / For FBR) when qtyForInternal or product weight changes
      if (field === "qtyForInternal" || field === "weight") {
        const prodId = selectedProductIdByItem[index];
        const selectedProd = products.find(
          (p) => String(p.id) === String(prodId)
        );
        const weightVal =
          field === "weight"
            ? value
            : item.weight !== undefined && item.weight !== ""
            ? item.weight
            : selectedProd?.weight !== undefined && selectedProd?.weight !== null
            ? String(selectedProd.weight)
            : "";

        const qtyInternalVal =
          field === "qtyForInternal" ? value : item.qtyForInternal;

        const wNum = parseFloat(weightVal);
        const qIntNum = parseFloat(qtyInternalVal);

        if (!isNaN(wNum) && !isNaN(qIntNum) && wNum > 0 && qIntNum > 0) {
          const calcQty = wNum * qIntNum;
          item.quantity = Number.isInteger(calcQty)
            ? calcQty.toString()
            : calcQty.toFixed(2);
        } else if (field === "qtyForInternal" && (value === "" || qIntNum === 0)) {
          item.quantity = "";
        }
      }

      // Handle SRO reset logic
      if (field === "rate" && value) {
        item.isSROScheduleEnabled = true;
        item.sroScheduleNo = "";
        item.sroItemSerialNo = "";
        item.isSROItemEnabled = false;
        item.isValueSalesManual = false;
      }

      if (field === "sroScheduleNo") {
        const v = (value || "").trim().toLowerCase();
        item.isSROItemEnabled = Boolean(value) && v !== "n/a";
        item.sroItemSerialNo = "";
      }

      // Begin calculations
      const isThirdSchedule =
        item.saleType === "3rd Schedule Goods" ||
        prev.scenarioId === "SN027" ||
        prev.scenarioId === "SN008";

      // Auto-calculate unit cost and sales tax if not manual
      if (!item.isValueSalesManual) {
        const valueSales = parseFloat(
          parseFloat(item.valueSalesExcludingST || 0).toFixed(2),
        );
        const qtyForUnitCost =
          parseFloat(item.qtyForInternal || 0) > 0
            ? parseFloat(item.qtyForInternal)
            : parseFloat(item.quantity || 0);

        // Calculate unit cost: Value Sales (Excl ST) ÷ Qty (For Internal Use)
        const unitCost = qtyForUnitCost > 0 ? valueSales / qtyForUnitCost : 0;
        item.unitPrice = unitCost.toFixed(2);

        // Ensure unit cost is always calculated when retail price or quantity changes
        // Unit cost calculation completed

        // Only calculate sales tax if not manually entered
        if (!item.isSalesTaxManual) {
          if (
            item.rate &&
            item.rate.toLowerCase() !== "exempt" &&
            item.rate !== "0%"
          ) {
            let salesTax = 0;

            // Check if rate is in "RS." format (fixed amount)
            if (
              item.rate &&
              (item.rate.includes("RS.") ||
                item.rate.includes("rs.") ||
                item.rate.includes("Rs."))
            ) {
              const fixedAmount =
                parseFloat(item.rate.replace(/RS\./i, "").trim()) || 0;
              salesTax = fixedAmount; // Fixed amount directly
            } else if (item.rate.includes("/bill")) {
              const fixedAmount =
                parseFloat(item.rate.replace("/bill", "")) || 0;
              const quantity = parseFloat(item.quantity || 0);
              salesTax = fixedAmount * quantity; // Fixed amount per item × quantity
            } else if (item.rate.includes("/SqY")) {
              // Check if rate is in "/SqY" format (fixed amount per SqY)
              const fixedAmount =
                parseFloat(item.rate.replace("/SqY", "")) || 0;
              const quantity = parseFloat(item.quantity || 0);
              salesTax = fixedAmount * quantity; // Fixed amount per SqY × quantity
            } else {
              // Handle percentage rates - use valueSalesExcludingST instead of retailPrice
              const rate = parseFloat((item.rate || "0").replace("%", "")) || 0;
              const rateFraction = rate / 100;
              const valueSales = parseFloat(item.valueSalesExcludingST || 0);
              salesTax = valueSales * rateFraction;
            }

            item.salesTaxApplicable = salesTax.toString();
          } else {
            item.salesTaxApplicable = "0";
          }
        }
      } else if (item.isValueSalesManual) {
        // If user manually entered value sales, update unit cost and then sales tax if not manual
        const valueSales = parseFloat(
          parseFloat(item.valueSalesExcludingST || 0).toFixed(2),
        );
        const qtyForUnitCost =
          parseFloat(item.qtyForInternal || 0) > 0
            ? parseFloat(item.qtyForInternal)
            : parseFloat(item.quantity || 0);
        const unitCost = qtyForUnitCost > 0 ? valueSales / qtyForUnitCost : 0;
        item.unitPrice = unitCost.toFixed(2);

        // Only calculate sales tax if not manually entered
        if (!item.isSalesTaxManual) {
          if (
            item.rate &&
            item.rate.toLowerCase() !== "exempt" &&
            item.rate !== "0%"
          ) {
            let salesTax = 0;

            // Check if rate is in "RS." format (fixed amount)
            if (
              item.rate &&
              (item.rate.includes("RS.") ||
                item.rate.includes("rs.") ||
                item.rate.includes("Rs."))
            ) {
              const fixedAmount =
                parseFloat(item.rate.replace(/RS\./i, "").trim()) || 0;
              salesTax = fixedAmount; // Fixed amount directly
            } else if (item.rate.includes("/bill")) {
              const fixedAmount =
                parseFloat(item.rate.replace("/bill", "")) || 0;
              const quantity = parseFloat(item.quantity || 0);
              salesTax = fixedAmount * quantity; // Fixed amount per item × quantity
            } else if (item.rate.includes("/SqY")) {
              // Check if rate is in "/SqY" format (fixed amount per SqY)
              const fixedAmount =
                parseFloat(item.rate.replace("/SqY", "")) || 0;
              const quantity = parseFloat(item.quantity || 0);
              salesTax = fixedAmount * quantity; // Fixed amount per SqY × quantity
            } else {
              // Handle percentage rates - use valueSalesExcludingST
              const rate = parseFloat((item.rate || "0").replace("%", "")) || 0;
              const rateFraction = rate / 100;
              const valueSales = parseFloat(item.valueSalesExcludingST || 0);
              salesTax = valueSales * rateFraction;
            }

            item.salesTaxApplicable = salesTax.toString();
          } else {
            item.salesTaxApplicable = "0";
          }
        }
      }

      // Recalculate total value if it's not manually entered
      // Formula: (Qty × Unit Cost) + Courier Charges
      // Calculate VAT Amounts separately
      const salesExclSTVal = parseFloat(item.valueSalesExcludingST || 0) || 0;
      const salesTaxVal = parseFloat(item.salesTaxApplicable || 0) || 0;
      
      const vat18Amt = item.vat18 ? Math.round((salesExclSTVal + salesTaxVal) * 0.18 * 100) / 100 : 0;
      const vat25Amt = item.vat25 ? Math.round((salesExclSTVal + salesTaxVal) * 0.25 * 100) / 100 : 0;
      
      item.vat18Amount = vat18Amt;
      item.vat25Amount = vat25Amt;
      item.vatAmount = vat18Amt + vat25Amt;

      if (!item.isTotalValuesManual) {
        const qtyForTotal =
          parseFloat(item.qtyForInternal || 0) > 0
            ? parseFloat(item.qtyForInternal)
            : parseFloat(item.quantity || 0);
        const unitCostForTotal = parseFloat(item.unitPrice || 0);
        const courierForTotal = parseFloat(item.courierCharges || 0);
        const salesTaxApp = parseFloat(item.salesTaxApplicable || 0);
        const salesTaxWithheld = parseFloat(item.salesTaxWithheldAtSource || 0);
        const extraTaxVal = parseFloat(item.extraTax || 0);
        const furtherTaxVal = parseFloat(item.furtherTax || 0);
        const fedPayableVal = parseFloat(item.fedPayable || 0);
        const advIncomeTaxVal = parseFloat(item.advanceIncomeTax || 0);

        const rowLineTotal = Number(
          (
            (qtyForTotal * unitCostForTotal) +
            courierForTotal +
            salesTaxApp +
            salesTaxWithheld +
            extraTaxVal +
            furtherTaxVal +
            fedPayableVal +
            advIncomeTaxVal +
            item.vatAmount
          ).toFixed(2),
        );
        item.totalValues = rowLineTotal.toString();
      }

      updatedItems[index] = item;
      return { ...prev, items: updatedItems };
    });
  };

  const addNewItem = () => {
    // Check if current item has required fields filled
    const currentItem = formData.items[0];
    if (!currentItem.hsCode) {
      // Show error message if required fields are empty
      Swal.fire({
        icon: "warning",
        title: "Required Fields Missing",
        text: "Please fill in HS Code before adding item.",
        confirmButtonColor: "#2A69B0",
      });
      return;
    }

    // Add current item to addedItems list with buyer and product information
    const itemToAdd = {
      ...currentItem,
      id: Date.now(), // Add unique ID
      buyerId: selectedBuyerId, // Store buyer ID for editing
      buyerNTNCNIC: formData.buyerNTNCNIC, // Store buyer NTN/CNIC for editing
      buyerBusinessName: formData.buyerBusinessName, // Store buyer business name for editing
      productId: selectedProductIdByItem[0], // Store product ID for editing
    };

    console.log("📦 addNewItem - captured itemCode:", itemToAdd.itemCode, "| units:", itemToAdd.units);
    console.log("Adding item with buyer and product info:", {
      buyerId: selectedBuyerId,
      buyerNTN: formData.buyerNTNCNIC,
      buyerName: formData.buyerBusinessName,
      productId: selectedProductIdByItem[0],
      itemId: itemToAdd.id,
    });

    setAddedItems((prev) => {
      const newItems = [...prev, itemToAdd];

      return newItems;
    });

    // Clear Transaction Type completely when an item is added
    // First clear localStorage to prevent useEffect from restoring values
    localStorage.removeItem("saleType");
    localStorage.removeItem("transactionTypeId");
    localStorage.removeItem("editingInvoice"); // Clear editing flag to prevent auto-restoration

    // Also clear any scenario-related data that might interfere
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("scenario") ||
          key.startsWith("selectedRateId_") ||
          key.startsWith("SROId_"))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Clear state variables
    setTransactionTypeId(null);
    setTransactionTypeDropdownOpen(false); // Close dropdown immediately

    // Small delay to ensure state updates are processed
    setTimeout(() => {
      // Force a re-render of the transaction type dropdown
      setTransactionTypeDropdownOpen(false);

      // Additional cleanup to ensure transaction type is completely cleared
      setFormData((prev) => ({
        ...prev,
        transctypeId: "", // Ensure this is cleared
      }));
    }, 100);

    // Reset the form to initial state with cleared transaction type
    setFormData((prev) => ({
      ...prev,
      transctypeId: "", // Clear transaction type ID
      items: [
        {
          name: "",
          hsCode: "",
          productDescription: "",
          rate: "",
          quantity: "1",
          unitPrice: "0.00", // Calculated field: Retail Price ÷ Quantity
          retailPrice: "0", // User input field
          itemCode: "",
          units: "",
          weight: "",
          qtyForInternal: "",
          courierCharges: "0",
          totalValues: "0",
          valueSalesExcludingST: "0",
          salesTaxApplicable: "0",
          salesTaxWithheldAtSource: "0",
          sroScheduleNo: "",
          sroItemSerialNo: "",
          billOfLadingUoM: "",
          uoM: "",
          uoMForInternal: "",
          extraTax: "",
          furtherTax: "0",
          fedPayable: "0",
          discount: "0",
          advanceIncomeTax: "0",
          saleType: "", // Clear Sales Type on add item
          isSROScheduleEnabled: false,
          isSROItemEnabled: false,
          vat18: false,
          vat25: false,
          vatAmount: 0,
          isValueSalesManual: false,
          isTotalValuesManual: false,
          isSalesTaxManual: false,
          isSalesTaxWithheldManual: false,
          isFurtherTaxManual: false,
          isFedPayableManual: false,
        },
      ],
    }));

    // Clear the product selection for the new item
    setSelectedProductIdByItem((prev) => ({ ...prev, 0: undefined }));
    setProductInputValue("");
    setProductSearch("");
    setBuyerSearch("");

    // Clear editing state
    setEditingItemIndex(null);

    // Show success message
    Swal.fire({
      icon: "success",
      title: editingItemIndex
        ? "Item Updated Successfully"
        : "Item Added Successfully",
      text: editingItemIndex
        ? "Item has been updated in the list."
        : "Item has been added to the list.",
      confirmButtonColor: "#2A69B0",
      timer: 1500,
      showConfirmButton: false,
    });
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

  // Function to delete item from addedItems list
  const deleteAddedItem = (itemId) => {
    setAddedItems((prev) => prev.filter((item) => item.id !== itemId));
    Swal.fire({
      icon: "success",
      title: "Item Deleted",
      text: "Item has been removed from the list.",
      confirmButtonColor: "#2A69B0",
      timer: 1500,
      showConfirmButton: false,
    });
  };

  // Function to edit item from addedItems list
  const editAddedItem = async (itemId) => {
    const itemToEdit = addedItems.find((item) => item.id === itemId);
    if (itemToEdit) {
      // Remove the item from addedItems
      setAddedItems((prev) => prev.filter((item) => item.id !== itemId));

      console.log("editAddedItem: itemToEdit.uoM:", itemToEdit.uoM);
      // Set the form data with the item to edit
      setFormData((prev) => {
        console.log(
          "editAddedItem: prev formData.items[0].uoM:",
          prev.items[0]?.uoM,
        );
        return {
          ...prev,
          items: [itemToEdit],
        };
      });

      console.log("editAddedItem: itemToEdit details:", itemToEdit);

      // Wait for buyers and products to be loaded if they're not already available
      if (buyers.length === 0) {
        console.log("Buyers not loaded yet, waiting...");
        // Wait a bit for buyers to load
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (products.length === 0) {
        console.log("Products not loaded yet, waiting...");
        // Wait a bit for products to load
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Small delay to ensure form data is properly set before restoring product
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Note: Buyer restoration has been removed from editAddedItem.
      // The buyer is set at the invoice level, not the item level.
      // When editing an item, the buyer field should remain unchanged.

      // NEW: Store product data for restoration when editing individual items
      if (
        itemToEdit.name ||
        itemToEdit.hsCode ||
        itemToEdit.productDescription
      ) {
        const productData = [
          {
            name: itemToEdit.name || "",
            productDescription: itemToEdit.productDescription || "",
            hsCode: itemToEdit.hsCode || "",
            billOfLadingUoM: itemToEdit.billOfLadingUoM || "",
            uoM: itemToEdit.uoM || "",
            uoMForInternal: itemToEdit.uoMForInternal || "",
            quantity: itemToEdit.quantity || "",
            rate: itemToEdit.rate || "",
          },
        ];

        localStorage.setItem("editingProductData", JSON.stringify(productData));

        console.log(
          "Stored product data for editing individual item:",
          productData,
        );
      }

      // Restore product information if available in the item
      // Restore product information
      let targetProduct = null;

      // 1. Try to find the product in the current loaded list
      if (itemToEdit.productId) {
        // Priority: ID match
        targetProduct = products.find((p) => p.id === itemToEdit.productId);
      }

      if (!targetProduct && itemToEdit.hsCode && itemToEdit.name) {
        // Fallback: Case-insensitive Name + HS Code match in current list
        targetProduct = products.find(
          (p) =>
            normalizeHsCode(p.hsCode).toLowerCase() ===
            normalizeHsCode(itemToEdit.hsCode).toLowerCase() &&
            (p.name || "").trim().toLowerCase() ===
            (itemToEdit.name || "").trim().toLowerCase(),
        );
      }

      // 2. If not found in current list, but we have info to fetch it
      if (!targetProduct && (itemToEdit.name || itemToEdit.hsCode)) {
        // Prepare the UI by setting the input value to the product name if we have it
        if (itemToEdit.name) {
          setProductInputValue(itemToEdit.name);
        }

        console.log("Product not in list, fetching specifically for:", {
          name: itemToEdit.name,
          hsCode: itemToEdit.hsCode,
        });

        try {
          // Prefer Name for search as it matches the user intent better, fallback to HS Code
          const searchTerm = itemToEdit.name || itemToEdit.hsCode;
          const response = await api.get(
            `/tenant/${selectedTenant.tenant_id}/products`,
            {
              params: {
                search: searchTerm,
                limit: 100,
              },
            },
          );

          if (response.data.success && response.data.data) {
            const fetchedList = response.data.data;

            // Priority A: Strict ID match (if we had an ID)
            if (itemToEdit.productId) {
              targetProduct = fetchedList.find(
                (p) => p.id === itemToEdit.productId,
              );
            }

            // Priority B: Strict Name + HS Code match
            if (!targetProduct && itemToEdit.hsCode && itemToEdit.name) {
              targetProduct = fetchedList.find(
                (p) =>
                  normalizeHsCode(p.hsCode).toLowerCase() ===
                  normalizeHsCode(itemToEdit.hsCode).toLowerCase() &&
                  (p.name || "").trim().toLowerCase() ===
                  (itemToEdit.name || "").trim().toLowerCase(),
              );
            }

            // If found, ensure it's added to the products list so Autocomplete can see it
            if (targetProduct) {
              console.log("Found missing product via API:", targetProduct.id);
              setProducts((prev) => {
                if (prev.some((p) => p.id === targetProduct.id)) return prev;
                return [...prev, targetProduct];
              });
            } else {
              console.log("Product not found in API results even after fetch.");
            }
          }
        } catch (error) {
          console.error(
            "Error fetching specific product for restoration:",
            error,
          );
        }
      } else if (targetProduct) {
        console.log("Product found in current list:", targetProduct.id);
      }

      // 3. Set the selection if we have a target product or at least an ID/Name
      if (itemToEdit.name) {
        setProductInputValue(itemToEdit.name);
      } else if (targetProduct) {
        setProductInputValue(targetProduct.name);
      }

      if (targetProduct) {
        setSelectedProductIdByItem((prev) => ({
          ...prev,
          0: targetProduct.id,
        }));

        // RE-RESTORE UoM and billOfLadingUoM in case they were cleared by effects
        if (itemToEdit.uoM) {
          console.log("Re-restoring UoM in formData:", itemToEdit.uoM);
          setFormData((prev) => {
            const items = [...prev.items];
            if (items[0]) {
              items[0] = { ...items[0], uoM: itemToEdit.uoM };
            }
            return { ...prev, items };
          });
        }
      } else if (itemToEdit.productId) {
        setSelectedProductIdByItem((prev) => ({
          ...prev,
          0: itemToEdit.productId,
        }));
      }

      // Reset search terms to ensure full list is available when user clears the input
      setProductSearch("");
      setBuyerSearch("");

      // Prefill Transaction Type based on item's saleType
      try {
        let types = transactionTypes;
        if (!types || types.length === 0) {
          const data = await getTransactionTypes();
          let arr = [];
          if (Array.isArray(data)) {
            arr = data;
          } else if (data && typeof data === "object") {
            if (data.data && Array.isArray(data.data)) {
              arr = data.data;
            } else if (
              data.transactionTypes &&
              Array.isArray(data.transactionTypes)
            ) {
              arr = data.transactionTypes;
            } else if (data.results && Array.isArray(data.results)) {
              arr = data.results;
            } else {
              arr = [data];
            }
          }
          types = arr;
          if (arr.length > 0) {
            setTransactionTypes(arr);
          }
        }

        const getTransactionTypeId = (type) => {
          return (
            type.transactioN_TYPE_ID ||
            type.transactionTypeId ||
            type.transaction_type_id ||
            type.transactionTypeID ||
            type.id ||
            type.typeId ||
            type.transTypeId
          );
        };
        const getTransactionTypeDesc = (type) => {
          return (
            type.transactioN_DESC ||
            type.transactionDesc ||
            type.description ||
            type.desc ||
            type.name
          );
        };

        const match = types.find(
          (t) =>
            (getTransactionTypeDesc(t) || "").trim() ===
            (itemToEdit.saleType || "").trim(),
        );
        if (match) {
          const id = getTransactionTypeId(match);
          if (id) {
            localStorage.setItem("transactionTypeId", id);
            if (itemToEdit.saleType) {
              localStorage.setItem("saleType", itemToEdit.saleType);
            }
            setTransactionTypeId(id);
            setFormData((prev) => ({ ...prev, transctypeId: id }));
          }
        } else {
          // If no match, clear transaction type selection
          localStorage.removeItem("transactionTypeId");
          setTransactionTypeId(null);
          setFormData((prev) => ({ ...prev, transctypeId: "" }));
        }
      } catch (e) {
        // Silently fail; user can select manually
      }

      // Set editing state
      setEditingItemIndex(itemId);

      Swal.fire({
        icon: "info",
        title: "Edit Mode",
        text: "Item loaded for editing. Make changes and click Add to update.",
        confirmButtonColor: "#2A69B0",
      });
    }
  };

  const handleTransactionTypeChange = (transctypeId) => {
    if (!transctypeId) {
      setFormData((prev) => ({
        ...prev,
        transctypeId: "",
      }));
      localStorage.removeItem("saleType");
      localStorage.removeItem("transactionTypeId");
      setTransactionTypeId(null);
      return;
    }

    // Proceed without clearing items
    proceedWithTransactionTypeChange(transctypeId);
  };

  const proceedWithTransactionTypeChange = (transctypeId) => {
    // Helper function to get the ID from a transaction type object
    const getTransactionTypeId = (type) => {
      return (
        type.transactioN_TYPE_ID ||
        type.transactionTypeId ||
        type.transaction_type_id ||
        type.transactionTypeID ||
        type.id ||
        type.typeId ||
        type.transTypeId
      );
    };

    // Helper function to get the description from a transaction type object
    const getTransactionTypeDesc = (type) => {
      return (
        type.transactioN_DESC ||
        type.transactionDesc ||
        type.description ||
        type.desc ||
        type.name
      );
    };

    // Find the selected transaction type from the API data
    const selectedTransactionType = transactionTypes.find((item) => {
      const typeId = getTransactionTypeId(item);
      return (
        typeId === transctypeId ||
        typeId === String(transctypeId) ||
        typeId === Number(transctypeId)
      );
    });

    if (!selectedTransactionType) {
      console.error("Selected transaction type not found in API data");
      return;
    }

    const saleType = getTransactionTypeDesc(selectedTransactionType) || "";

    // Transaction type change processed

    // Update localStorage and state
    localStorage.setItem("saleType", saleType);
    localStorage.setItem("transactionTypeId", transctypeId);
    setTransactionTypeId(transctypeId);

    // Update form data
    setFormData((prev) => {
      const isEditing = localStorage.getItem("editingInvoice") === "true";
      const items =
        prev.items.length > 0
          ? prev.items.map((item) => ({
            ...item,
            // Don't update product description - keep existing or clear if no HS code
            productDescription: item.hsCode ? item.productDescription : "",
            saleType: saleType,
            rate: isEditing ? item.rate : "", // Preserve rate when editing
          }))
          : [
            {
              hsCode: "",
              productDescription: "", // Don't set scenario description automatically
              rate: "",
              quantity: "1",
              unitPrice: "0.00",
              retailPrice: "0",
              totalValues: "0",
              valueSalesExcludingST: "0",
              salesTaxApplicable: "0",
              salesTaxWithheldAtSource: "0",
              sroScheduleNo: "",
              sroItemSerialNo: "",
              billOfLadingUoM: "",
              uoM: "",
              uoMForInternal: "",
              extraTax: "",
              furtherTax: "0",
              fedPayable: "0",
              discount: "0",
              advanceIncomeTax: "0",
              saleType,
              isSROScheduleEnabled: false,
              isSROItemEnabled: false,
              isValueSalesManual: false,
              isTotalValuesManual: false,
              isSalesTaxManual: false,
              isSalesTaxWithheldManual: false,
              isFurtherTaxManual: false,
              isFedPayableManual: false,
            },
          ];
      return {
        ...prev,
        transctypeId: transctypeId,
        items,
      };
    });
  };

  const showCompanyInvoiceRefNoRequired = () =>
    Swal.fire({
      icon: "error",
      title: "Required Field",
      text: "companyInvoiceRefNo must be required",
      confirmButtonColor: "#d33",
    });

  const isFormEmptyForDraft = (data) => {
    const isNonEmptyString = (value) =>
      typeof value === "string" && value.trim() !== "";

    const nonSellerFields = [
      // Only consider buyer and basic invoice fields here; seller is auto-populated after company selection
      "buyerNTNCNIC",
      "buyerBusinessName",
      "buyerProvince",
      "buyerAddress",
      "invoiceRefNo",
      "companyInvoiceRefNo",
      "scenarioId",
    ];

    const hasBuyerOrInvoiceData = nonSellerFields.some((key) =>
      isNonEmptyString(data[key]),
    );

    // Check both formData.items and addedItems for data
    const hasItemsData =
      (Array.isArray(data.items) &&
        data.items.some((item) => {
          const hasTextFields =
            (item.hsCode && item.hsCode.trim() !== "") ||
            (item.productDescription &&
              item.productDescription.trim() !== "") ||
            (item.rate && item.rate.trim() !== "");

          const hasNumericFields =
            Number(item.unitPrice) > 0 ||
            Number(item.valueSalesExcludingST) > 0 ||
            Number(item.salesTaxApplicable) > 0 ||
            Number(item.salesTaxWithheldAtSource) > 0 ||
            Number(item.totalValues) > 0 ||
            Number(item.extraTax) > 0 ||
            Number(item.furtherTax) > 0 ||
            Number(item.fedPayable) > 0 ||
            Number(item.discount) > 0;

          return hasTextFields || hasNumericFields;
        })) ||
      (Array.isArray(addedItems) && addedItems.length > 0);

    return !(hasBuyerOrInvoiceData || hasItemsData);
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      if (dayjs(formData.invoiceDate).isAfter(dayjs(), "day")) {
        setInvoiceDateError(
          "This date exceeds the current date. Please select today or a past date.",
        );
        await showError({
          title: "Error",
          message:
            "This date exceeds the current date. Please select today or a past date.",
          type: "error",
        });
        setSaveLoading(false);
        return;
      }
      // Any new save invalidates prior validation
      setIsSubmitVisible(false);
      // Basic validation for save
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "Please select a Company before saving the invoice.",
          type: "error",
        });
        setSaveLoading(false);
        return;
      }

      if (
        !formData.companyInvoiceRefNo ||
        formData.companyInvoiceRefNo.trim() === ""
      ) {
        await showCompanyInvoiceRefNoRequired();
        setSaveLoading(false);
        return;
      }

      // Prevent saving an empty form as draft
      if (isFormEmptyForDraft(formData)) {
        Swal.fire({
          icon: "warning",
          title: "Form is empty",
          text: "Please fill some fields before saving a draft.",
          confirmButtonColor: "#d33",
        });
        setSaveLoading(false);
        return;
      }

      // Use addedItems for saving if available, otherwise use formData.items
      const itemsToSave = addedItems.length > 0 ? addedItems : formData.items;

      // Only check if there's at least some data to save
      if (itemsToSave.length === 0) {
        Swal.fire({
          icon: "warning",
          title: "No Items",
          text: "Please add at least one item before saving a draft.",
          confirmButtonColor: "#d33",
        });
        setSaveLoading(false);
        return;
      }

      const cleanedData = {
        ...formData,
        invoiceDate: dayjs(formData.invoiceDate).format("YYYY-MM-DD"),
        transctypeId: formData.transctypeId,
        items: itemsToSave.map(
          (
            {
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
            },
            index,
          ) => {
            const baseItem = {
              ...rest,
              fixedNotifiedValueOrRetailPrice: 0,
              quantity: rest.quantity === "" ? 0 : parseFloat(rest.quantity),
              unitPrice: Number(Number(rest.unitPrice || 0).toFixed(2)),
              valueSalesExcludingST: Number(
                Number(rest.valueSalesExcludingST || 0).toFixed(2),
              ),
              salesTaxApplicable:
                Math.round(Number(rest.salesTaxApplicable) * 100) / 100,
              salesTaxWithheldAtSource: Number(
                Number(rest.salesTaxWithheldAtSource || 0).toFixed(2),
              ),
              totalValues: Number(Number(rest.totalValues).toFixed(2)),
              sroScheduleNo: rest.sroScheduleNo?.trim() || null,
              sroItemSerialNo: rest.sroItemSerialNo?.trim() || null,

              name: rest.name?.trim() || null,
              productDescription: rest.productDescription
                ? rest.productDescription.replace(/\r?\n/g, " ").trim()
                : null,
              saleType:
                rest.saleType?.trim() || "Goods at standard rate (default)",
              furtherTax: Number(Number(rest.furtherTax || 0).toFixed(2)),
              fedPayable: Number(Number(rest.fedPayable || 0).toFixed(2)),
              discount: Number(Number(rest.discount || 0).toFixed(2)),
              advanceIncomeTax: Number(
                Number(rest.advanceIncomeTax || 0).toFixed(2),
              ),
            };

            if (rest.saleType?.trim() !== "Goods at Reduced Rate") {
              baseItem.extraTax = rest.extraTax;
            }

            return baseItem;
          },
        ),
      };

      // Create items for backend that include all fields (including advanceIncomeTax)
      const backendItems = itemsToSave.map((item) => ({
        ...item,
        quantity: item.quantity === "" ? 0 : parseFloat(item.quantity),
        unitPrice: Number(Number(item.unitPrice || 0).toFixed(2)),
        valueSalesExcludingST: Number(
          Number(item.valueSalesExcludingST || 0).toFixed(2),
        ),
        salesTaxApplicable:
          Math.round(Number(item.salesTaxApplicable) * 100) / 100,
        salesTaxWithheldAtSource: Number(
          Number(item.salesTaxWithheldAtSource || 0).toFixed(2),
        ),
        totalValues: Number(Number(item.totalValues).toFixed(2)),
        furtherTax: Number(Number(item.furtherTax || 0).toFixed(2)),
        fedPayable: Number(Number(item.fedPayable || 0).toFixed(2)),
        discount: Number(Number(item.discount || 0).toFixed(2)),
        advanceIncomeTax: Number(Number(item.advanceIncomeTax || 0).toFixed(2)), // Keep in database
        // Explicitly carry itemCode and units so they are never lost
        itemCode: item.itemCode || null,
        units: item.units || null,
        courierCharges: item.courierCharges || null,
      }));

      const backendData = {
        ...formData,
        sourceInvoiceNo: formData.sourceInvoiceNo || originalSourceInvoiceNoRef.current || formData.companyInvoiceRefNo,
        invoiceDate: dayjs(formData.invoiceDate).format("YYYY-MM-DD"),
        transctypeId: formData.transctypeId,
        items: backendItems, // Use backend items that include all fields
      };

      // Include id when editing to update the same draft instead of creating a new one
      const payload = editingId
        ? { id: editingId, ...backendData }
        : backendData;
      console.log(
        "Saving invoice with payload:",
        JSON.stringify(payload, null, 2),
      );
      console.log(
        "Items being saved:",
        payload.items.map((item) => ({ name: item.name, hsCode: item.hsCode, itemCode: item.itemCode, units: item.units })),
      );
      const response = await api.post(
        `/tenant/${selectedTenant.tenant_id}/invoices/save`,
        payload,
      );

      if (response.status === 201) {
        const result = await Swal.fire({
          icon: "success",
          title: "Invoice Saved Successfully!",
          text: `Draft saved with number: ${response.data.data.invoice_number}`,
          showCancelButton: true,
          confirmButtonText: "Create New",
          cancelButtonText: "Stay Here",
          confirmButtonColor: "#28a745",
          cancelButtonColor: "#6c757d",
          reverseButtons: true,
        });

        if (result.isConfirmed) {
          window.location.reload();
        } else {
          const newId = response.data?.data?.id || response.data?.data?.invoice_id;
          if (!editingId && newId) {
            setEditingId(newId);
          }
          if (response.data?.data?.sourceInvoiceNo) {
            setFormData((prev) => ({
              ...prev,
              sourceInvoiceNo: response.data.data.sourceInvoiceNo,
            }));
          }
        }
      }
    } catch (error) {
      console.error("Save Error:", error);
      if (error.response?.status === 409) {
        Swal.fire({
          icon: "error",
          title: "Duplicate Reference Number",
          html: `Company Invoice Reference Number <strong>${formData.companyInvoiceRefNo || ""}</strong> already exists in the system.`,
          confirmButtonColor: "#d33",
        });
      } else {
        await showError({
          title: "Error",
          message: `Failed to save invoice: ${error.response?.data?.message || error.message}`,
          type: "error",
        });
      }
    } finally {
      setSaveLoading(false);
    }
  };

  // Function to validate individual items
  const validateItem = (item, itemNumber) => {
    const errors = [];

    // Required field validations
    if (!item.hsCode || item.hsCode.trim() === "") {
      errors.push("HS Code is required");
    } else if (item.hsCode.length > 50) {
      errors.push("HS Code must be 50 characters or less");
    }

    // productDescription is optional

    if (!item.rate || item.rate.trim() === "") {
      errors.push("Rate is required");
    }

    if (
      !item.quantity ||
      item.quantity === "" ||
      parseFloat(item.quantity) <= 0
    ) {
      errors.push("Quantity must be greater than 0");
    }

    if (
      !item.retailPrice ||
      item.retailPrice === "" ||
      parseFloat(item.retailPrice) < 0
    ) {
      errors.push("Retail Price cannot be negative");
    }

    // Validate retail price format (should be a valid number with up to 2 decimal places)
    if (item.retailPrice && !/^\d+(\.\d{1,2})?$/.test(item.retailPrice)) {
      errors.push(
        "Retail Price must be a valid number with up to 2 decimal places",
      );
    }

    if (
      !item.totalValues ||
      item.totalValues === "" ||
      parseFloat(item.totalValues) <= 0
    ) {
      errors.push("Total Value must be greater than 0");
    }

    // Numeric validations
    if (item.quantity && isNaN(parseFloat(item.quantity))) {
      errors.push("Quantity must be a valid number");
    }

    if (item.retailPrice && isNaN(parseFloat(item.retailPrice))) {
      errors.push("Retail Price must be a valid number");
    }

    if (item.totalValues && isNaN(parseFloat(item.totalValues))) {
      errors.push("Total Value must be a valid number");
    }

    if (item.salesTaxApplicable && isNaN(parseFloat(item.salesTaxApplicable))) {
      errors.push("Sales Tax must be a valid number");
    }

    if (item.furtherTax && isNaN(parseFloat(item.furtherTax))) {
      errors.push("Further Tax must be a valid number");
    }

    if (item.fedPayable && isNaN(parseFloat(item.fedPayable))) {
      errors.push("FED Payable must be a valid number");
    }

    return errors;
  };

  const handleSaveAndValidate = async () => {
    setSaveValidateLoading(true);
    try {
      if (dayjs(formData.invoiceDate).isAfter(dayjs(), "day")) {
        setInvoiceDateError(
          "This date exceeds the current date. Please select today or a past date.",
        );
        await showError({
          title: "Error",
          message:
            "This date exceeds the current date. Please select today or a past date.",
          type: "error",
        });
        setSaveValidateLoading(false);
        return;
      }
      // Basic validation for save and validate
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "Please select a Company before saving the invoice.",
          type: "error",
        });
        setSaveValidateLoading(false);
        return;
      }

      // Validate seller fields
      const sellerRequiredFields = [
        { field: "sellerNTNCNIC", label: "Seller NTN/CNIC" },
        { field: "sellerFullNTN", label: "Seller NTN" },
        { field: "sellerBusinessName", label: "Seller Business Name" },
        { field: "sellerProvince", label: "Seller Province" },
        { field: "sellerAddress", label: "Seller Address" },
      ];

      for (const { field, label } of sellerRequiredFields) {
        if (!formData[field] || formData[field].trim() === "") {
          await showError({
            title: "Error",
            message: `${label} is required. Please select a Company to populate seller information.`,
            type: "error",
          });
          setSaveValidateLoading(false);
          return;
        }
      }

      if (
        !formData.companyInvoiceRefNo ||
        formData.companyInvoiceRefNo.trim() === ""
      ) {
        await showCompanyInvoiceRefNoRequired();
        setSaveValidateLoading(false);
        return;
      }

      // ── Pre-check: companyInvoiceRefNo uniqueness BEFORE hitting FBR ──
      if (formData.companyInvoiceRefNo.trim()) {
        try {
          const refCheckRes = await api.post(
            `/tenant/${selectedTenant.tenant_id}/invoices/check-company-ref`,
            {
              companyInvoiceRefNo: formData.companyInvoiceRefNo.trim(),
              excludeId: editingId || null,
            },
          );
          if (refCheckRes.data?.exists) {
            Swal.fire({
              icon: "error",
              title: "Duplicate Reference Number",
              html: `Company Invoice Reference Number <strong>${formData.companyInvoiceRefNo.trim()}</strong> already exists in the system.`,
              confirmButtonColor: "#d33",
            });
            setSaveValidateLoading(false);
            return;
          }
        } catch (refCheckErr) {
          // If the check itself fails (network etc.), don't block — backend will still validate
          console.warn("Company ref pre-check failed:", refCheckErr.message);
        }
      }

      // Use addedItems for saving if available, otherwise use formData.items
      const itemsToSave = addedItems.length > 0 ? addedItems : formData.items;

      // Validate all items before proceeding
      const validationErrors = [];
      itemsToSave.forEach((item, index) => {
        const itemErrors = validateItem(item, index + 1);
        if (itemErrors.length > 0) {
          validationErrors.push({
            itemNumber: index + 1,
            errors: itemErrors,
          });
        }
      });

      // If there are validation errors, show them and stop
      if (validationErrors.length > 0) {
        const errorDetails = validationErrors.map((error) => ({
          item: error.itemNumber,
          error: error.errors.join(", "),
        }));

        await showError({
          title: "Item Validation Failed",
          message: "Please fix the following validation errors:",
          details: errorDetails,
          type: "error",
        });
        setSaveValidateLoading(false);
        return;
      }

      const sanitizeAddress = (address) =>
        address ? address.replace(/\r?\n/g, " ") : "";

      const {
        custAccountNo,
        custLpoNo,
        lpoDate,
        deliveryNoteNo,
        sp,
        productOrigin,
        productCertifiedBy,
        paymentTerms,
        paymentDue,
        group,
        billToId,
        shipToId,
        ...fbrFormData
      } = formData;

      const cleanedData = {
        ...fbrFormData,
        buyerAddress: sanitizeAddress(formData.buyerAddress),
        sellerAddress: sanitizeAddress(formData.sellerAddress),
        invoiceDate: dayjs(formData.invoiceDate).format("YYYY-MM-DD"),
        transctypeId: formData.transctypeId,
        scenarioId: "SN001", // Hardcoded SN001 for FBR validation
        items: itemsToSave.map(
          (
            {
              isSROScheduleEnabled,
              isSROItemEnabled,
              retailPrice,
              isValueSalesManual,
              isTotalValuesManual,
              isSalesTaxManual,
              isSalesTaxWithheldManual,
              isFurtherTaxManual,
              isFedPayableManual,
              advanceIncomeTax, // Remove from FBR API payload
              itemCode,
              units,
              courierCharges,
              vat18,
              vat25,
              vatAmount,
              vat18Amount,
              vat25Amount,
              ...rest
            },
            index,
          ) => {
            const baseItem = {
              ...rest,
              fixedNotifiedValueOrRetailPrice: 0,
              quantity: rest.quantity === "" ? 0 : parseFloat(rest.quantity),
              unitPrice: Number(Number(rest.unitPrice || 0).toFixed(2)),
              valueSalesExcludingST: Number(
                Number(rest.valueSalesExcludingST || 0).toFixed(2),
              ),
              salesTaxApplicable:
                Math.round(Number(rest.salesTaxApplicable) * 100) / 100,
              salesTaxWithheldAtSource: Number(
                Number(rest.salesTaxWithheldAtSource || 0).toFixed(2),
              ),
              totalValues: Number(Number(rest.totalValues).toFixed(2)),
              sroScheduleNo: rest.sroScheduleNo?.trim() || null,
              sroItemSerialNo: rest.sroItemSerialNo?.trim() || null,
              name: rest.name?.trim() || null,
              productDescription: rest.productDescription
                ? rest.productDescription.replace(/\r?\n/g, " ").trim()
                : null,
              saleType:
                rest.saleType?.trim() || "Goods at standard rate (default)",
              furtherTax: Number(Number(rest.furtherTax || 0).toFixed(2)),
              fedPayable: Number(Number(rest.fedPayable || 0).toFixed(2)),
              discount: Number(Number(rest.discount || 0).toFixed(2)),
              // advanceIncomeTax and other custom fields removed from FBR API payload but kept in database
            };

            if (rest.saleType?.trim() !== "Goods at Reduced Rate") {
              baseItem.extraTax = rest.extraTax;
            }

            return baseItem;
          },
        ),
      };

      // Validate with FBR API through backend
      const validateRes = await api.post(
        `/tenant/${selectedTenant.tenant_id}/validate-invoice?environment=production`,
        cleanedData,
      );

      // Handle different FBR response structures
      const validationData = validateRes.data?.data || validateRes.data;
      const hasValidationResponse =
        validationData && validationData.validationResponse;
      const isSuccess =
        validateRes.status === 200 &&
        (hasValidationResponse
          ? validationData.validationResponse.statusCode === "00"
          : true);

      if (isSuccess) {
        // If validation passes, save the invoice with status 'saved'
        // Create items for backend that include all fields (including advanceIncomeTax)
        const backendItems = itemsToSave.map((item) => ({
          ...item,
          quantity: item.quantity === "" ? 0 : parseFloat(item.quantity),
          unitPrice: Number(Number(item.unitPrice || 0).toFixed(2)),
          valueSalesExcludingST: Number(
            Number(item.valueSalesExcludingST || 0).toFixed(2),
          ),
          salesTaxApplicable:
            Math.round(Number(item.salesTaxApplicable) * 100) / 100,
          salesTaxWithheldAtSource: Number(
            Number(item.salesTaxWithheldAtSource || 0).toFixed(2),
          ),
          totalValues: Number(Number(item.totalValues).toFixed(2)),
          furtherTax: Number(Number(item.furtherTax || 0).toFixed(2)),
          fedPayable: Number(Number(item.fedPayable || 0).toFixed(2)),
          discount: Number(Number(item.discount || 0).toFixed(2)),
          advanceIncomeTax: Number(
            Number(item.advanceIncomeTax || 0).toFixed(2),
          ), // Keep in database
          // Explicitly carry itemCode and units so they are never lost
          itemCode: item.itemCode || null,
          units: item.units || null,
          courierCharges: item.courierCharges || null,
        }));

        const backendData = {
          ...formData,
          sourceInvoiceNo: formData.sourceInvoiceNo || originalSourceInvoiceNoRef.current || formData.companyInvoiceRefNo,
          buyerAddress: sanitizeAddress(formData.buyerAddress),
          sellerAddress: sanitizeAddress(formData.sellerAddress),
          invoiceDate: dayjs(formData.invoiceDate).format("YYYY-MM-DD"),
          transctypeId: formData.transctypeId,
          scenarioId: "SN001", // Hardcoded SN001 for save and validate
          items: backendItems, // Use backend items that include all fields
        };

        const payload = editingId
          ? { id: editingId, ...backendData }
          : backendData;
        console.log(
          "Saving and validating invoice with payload:",
          JSON.stringify(payload, null, 2),
        );
        console.log(
          "Items being saved:",
          payload.items.map((item) => ({
            name: item.name,
            hsCode: item.hsCode,
            itemCode: item.itemCode,
            units: item.units,
          })),
        );
        const response = await api.post(
          `/tenant/${selectedTenant.tenant_id}/invoices/save-validate`,
          payload,
        );

        if (response.status === 201) {
          Swal.fire({
            icon: "success",
            title: "Invoice Saved and Validated Successfully!",
            text: `Invoice validated with FBR and saved with number: ${response.data.data.invoice_number}`,
            confirmButtonColor: "#28a745",
          });
          const newId = response.data?.data?.id || response.data?.data?.invoice_id;
          if (!editingId && newId) {
            setEditingId(newId);
          }
          // Suppress the formData effect from hiding the Submit button for this update
          suppressSubmitResetRef.current = true;
          if (response.data?.data?.sourceInvoiceNo) {
            setFormData((prev) => ({
              ...prev,
              sourceInvoiceNo: response.data.data.sourceInvoiceNo,
            }));
          }
          // Allow submission only after a successful save & validate
          setIsSubmitVisible(true);
        }
      } else {
        // If validation fails, show detailed FBR validation error
        let errorMessage = "Invoice validation with FBR failed.";
        let errorDetails = [];

        // Handle different error response structures
        const errorData = validateRes.data?.data || validateRes.data;
        if (hasValidationResponse) {
          const validation = errorData.validationResponse;
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
                errorDetails.push({
                  item: status.itemSNo || index + 1,
                  error: status.error,
                });
              }
            });
          }
        } else if (errorData.error) {
          errorMessage = errorData.error;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (validateRes.data?.message) {
          errorMessage = validateRes.data.message;
        }

        // Check for additional error details in the response
        if (
          errorData.invoiceStatuses &&
          Array.isArray(errorData.invoiceStatuses)
        ) {
          errorData.invoiceStatuses.forEach((status, index) => {
            if (status.error) {
              errorDetails.push({
                item: status.itemSNo || index + 1,
                error: status.error,
              });
            }
          });
        }

        // Show structured error modal
        await showError({
          title: "FBR Validation Failed",
          message: errorMessage,
          details: errorDetails,
          type: "error",
          width: "700px",
        });
      }
    } catch (error) {
      console.error("Save and Validate Error:", error);
      if (error.response?.status === 409) {
        Swal.fire({
          icon: "error",
          title: "Duplicate Reference Number",
          html: `Company Invoice Reference Number <strong>${formData.companyInvoiceRefNo || ""}</strong> already exists in the system.`,
          confirmButtonColor: "#d33",
        });
      } else {
        // Use the error handler utility to show structured error
        await showErrorFromResponse(error, { width: "700px" });
      }
    } finally {
      setSaveValidateLoading(false);
    }
  };

  const handleSubmitChange = async () => {
    const result = await Swal.fire({
      icon: "warning",
      title: "Are you sure you want to submit this invoice?",
      text: "Once submitted, it will be posted to FBR.",
      showCancelButton: true,
      confirmButtonText: "Yes, submit",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2E7D32",
    });
    if (!result.isConfirmed) {
      return;
    }
    setLoading(true);
    try {
      if (dayjs(formData.invoiceDate).isAfter(dayjs(), "day")) {
        setInvoiceDateError(
          "This date exceeds the current date. Please select today or a past date.",
        );
        await showError({
          title: "Error",
          message:
            "This date exceeds the current date. Please select today or a past date.",
          type: "error",
        });
        setLoading(false);
        return;
      }
      // Validate that a tenant is selected and seller information is populated
      if (!selectedTenant) {
        await showError({
          title: "Error",
          message: "Please select a Company before creating an invoice.",
          type: "error",
        });
        setLoading(false);
        return;
      }

      // Validate seller fields
      const sellerRequiredFields = [
        { field: "sellerNTNCNIC", label: "Seller NTN/CNIC" },
        { field: "sellerFullNTN", label: "Seller NTN" },
        { field: "sellerBusinessName", label: "Seller Business Name" },
        { field: "sellerProvince", label: "Seller Province" },
        { field: "sellerAddress", label: "Seller Address" },
      ];

      for (const { field, label } of sellerRequiredFields) {
        if (!formData[field] || formData[field].trim() === "") {
          await showError({
            title: "Error",
            message: `${label} is required. Please select a Company to populate seller information.`,
            type: "error",
          });
          setLoading(false);
          return;
        }
      }

      if (
        !formData.companyInvoiceRefNo ||
        formData.companyInvoiceRefNo.trim() === ""
      ) {
        await showCompanyInvoiceRefNoRequired();
        setLoading(false);
        return;
      }

      // Check if there are any items to validate
      if (
        addedItems.length === 0 &&
        (!formData.items || formData.items.length === 0)
      ) {
        await showError({
          title: "Error",
          message:
            "At least one item is required. Please add items to the list.",
          type: "error",
        });
        setLoading(false);
        return;
      }

      // Use addedItems for validation if available, otherwise use formData.items
      const itemsToValidate =
        addedItems.length > 0 ? addedItems : formData.items;

      for (const [index, item] of itemsToValidate.entries()) {
        const itemRequiredFields = [
          {
            field: "hsCode",
            message: `HS Code is required for item ${index + 1}`,
          },
          // productDescription is optional
          { field: "rate", message: `Rate is required for item ${index + 1}` },

          {
            field: "quantity",
            message: `Quantity is required for item ${index + 1}`,
          },
          // {
          //   field: "retailPrice",
          //   message: `Retail Price is required for item ${index + 1}`,
          // },
          {
            field: "valueSalesExcludingST",
            message: `Value Sales Excluding ST is required for item ${index + 1
              }`,
          },
          ...(item.rate && item.rate.toLowerCase() === "exempt"
            ? [
              {
                field: "sroScheduleNo",
                message: `SRO Schedule Number is required for exempt item ${index + 1
                  }`,
              },
              {
                field: "sroItemSerialNo",
                message: `SRO Item Serial Number is required for exempt item ${index + 1
                  }`,
              },
            ]
            : []),
          ...(item.rate &&
            item.rate.includes("/bill") &&
            formData.scenarioId === "SN018"
            ? []
            : []),
        ];

        // Validation check for item

        for (const { field, message } of itemRequiredFields) {
          if (
            !item[field] ||
            (field === "valueSalesExcludingST" && item[field] <= 0) ||
            (field === "retailPrice" && parseFloat(item[field]) <= 0)
          ) {
            await showError({
              title: "Error",
              message: message,
              type: "error",
            });
            setLoading(false);
            return;
          }
        }
      }

      // Use addedItems instead of formData.items for submission
      const itemsToSubmit = addedItems.length > 0 ? addedItems : formData.items;

      const cleanedItems = itemsToSubmit.map(
        (
          {
            isSROScheduleEnabled,
            isSROItemEnabled,
            retailPrice,
            isValueSalesManual,
            isTotalValuesManual,
            isSalesTaxManual,
            isSalesTaxWithheldManual,
            isFurtherTaxManual,
            isFedPayableManual,
            advanceIncomeTax, // Remove from FBR API payload
            itemCode,
            units,
            courierCharges,
            vat18,
            vat25,
            vatAmount,
            vat18Amount,
            vat25Amount,
            ...rest
          },
          index,
        ) => {
          // Data cleaning for item

          const baseItem = {
            ...rest,
            fixedNotifiedValueOrRetailPrice: 0, // fixed to 0 as required
            quantity: rest.quantity === "" ? 0 : parseFloat(rest.quantity),
            unitPrice: Number(Number(rest.unitPrice || 0).toFixed(2)),
            valueSalesExcludingST: Number(
              Number(rest.valueSalesExcludingST || 0).toFixed(2),
            ),
            salesTaxApplicable:
              Math.round(Number(rest.salesTaxApplicable) * 100) / 100,
            salesTaxWithheldAtSource: Number(
              Number(rest.salesTaxWithheldAtSource || 0).toFixed(2),
            ),
            totalValues: Number(Number(rest.totalValues).toFixed(2)),
            sroScheduleNo: rest.sroScheduleNo?.trim() || null,
            sroItemSerialNo: rest.sroItemSerialNo?.trim() || null,
            productDescription: rest.productDescription
              ? rest.productDescription.replace(/\r?\n/g, " ").trim()
              : null,
            saleType:
              rest.saleType?.trim() || "Goods at standard rate (default)",
            furtherTax: Number(Number(rest.furtherTax || 0).toFixed(2)),
            fedPayable: Number(Number(rest.fedPayable || 0).toFixed(2)),
            discount: Number(Number(rest.discount || 0).toFixed(2)),
            billOfLadingUoM: rest.billOfLadingUoM?.trim() || null,
            uoM: rest.uoM?.trim() || null,
            // advanceIncomeTax and other custom fields removed from FBR API payload but kept in database
          };

          // Only include extraTax if saleType is NOT "Goods at Reduced Rate"
          if (rest.saleType?.trim() !== "Goods at Reduced Rate") {
            baseItem.extraTax = rest.extraTax;
          }

          return baseItem;
        },
      );

      const sanitizeAddress = (address) =>
        address ? address.replace(/\r?\n/g, " ") : "";

      const {
        custAccountNo,
        custLpoNo,
        lpoDate,
        deliveryNoteNo,
        sp,
        productOrigin,
        productCertifiedBy,
        paymentTerms,
        paymentDue,
        group,
        billToId,
        shipToId,
        ...fbrFormData
      } = formData;

      const cleanedData = {
        ...fbrFormData,
        buyerAddress: sanitizeAddress(formData.buyerAddress),
        sellerAddress: sanitizeAddress(formData.sellerAddress),
        invoiceDate: dayjs(formData.invoiceDate).format("YYYY-MM-DD"),
        transctypeId: formData.transctypeId,
        scenarioId: "SN001", // Hardcoded SN001 for submit
        items: cleanedItems,
      };

      // STEP 1: Hit FBR API through backend
      const fbrResponse = await api.post(
        `/tenant/${selectedTenant.tenant_id}/submit-invoice?environment=production`,
        cleanedData,
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

        const collectErrorMessages = (det) => {
          const messages = [];
          if (det && typeof det === "object") {
            if (det.error) messages.push(det.error);
            if (Array.isArray(det.invoiceStatuses)) {
              det.invoiceStatuses.forEach((s) => {
                if (s?.error) messages.push(`Item ${s.itemSNo}: ${s.error}`);
              });
            }
            if (det.validationResponse) {
              const v = det.validationResponse;
              if (v?.error) messages.push(v.error);
              if (Array.isArray(v?.invoiceStatuses)) {
                v.invoiceStatuses.forEach((s) => {
                  if (s?.error) messages.push(`Item ${s.itemSNo}: ${s.error}`);
                });
              }
            }
          }
          return messages.filter(Boolean);
        };

        const errorMessages = collectErrorMessages(details);
        const message = errorMessages.length
          ? `FBR submission failed: ${errorMessages.join("; ")}`
          : "FBR submission failed";

        throw new Error(message);
      }

      // Ensure we have a valid FBR invoice number
      if (!fbrInvoiceNumber || fbrInvoiceNumber.trim() === "") {
        throw new Error(
          "FBR submission failed: No invoice number received from FBR",
        );
      }

      // STEP 2: Hit Your Backend API Second
      // Prepare data for backend with FBR invoice number
      // Note: We need to include the original form data fields that were removed during FBR cleaning

      // Create items for backend that include all fields and FBR item numbers
      const fbrStatuses =
        responseData?.validationResponse?.invoiceStatuses ||
        responseData?.data?.validationResponse?.invoiceStatuses ||
        [];

      const backendItems = itemsToSubmit.map((item, index) => {
        const itemSNo = index + 1;
        const fbrStatus = fbrStatuses.find(
          (s) => parseInt(s.itemSNo) === itemSNo,
        );

        return {
          ...item,
          invoiceItemNo: fbrStatus?.invoiceNo || "", // This is the FBR item ID
          quantity: item.quantity === "" ? 0 : parseFloat(item.quantity),
          unitPrice: Number(Number(item.unitPrice || 0).toFixed(2)),
          valueSalesExcludingST: Number(
            Number(item.valueSalesExcludingST || 0).toFixed(2),
          ),
          salesTaxApplicable:
            Math.round(Number(item.salesTaxApplicable) * 100) / 100,
          salesTaxWithheldAtSource: Number(
            Number(item.salesTaxWithheldAtSource || 0).toFixed(2),
          ),
          totalValues: Number(Number(item.totalValues).toFixed(2)),
          furtherTax: Number(Number(item.furtherTax || 0).toFixed(2)),
          fedPayable: Number(Number(item.fedPayable || 0).toFixed(2)),
          discount: Number(Number(item.discount || 0).toFixed(2)),
          advanceIncomeTax: Number(
            Number(item.advanceIncomeTax || 0).toFixed(2),
          ), // Keep in database
          // Explicitly carry itemCode and units so they are never lost
          itemCode: item.itemCode || null,
          units: item.units || null,
          courierCharges: item.courierCharges || null,
        };
      });

      const backendData = {
        ...formData, // Use original form data to preserve all fields
        sourceInvoiceNo: formData.sourceInvoiceNo || originalSourceInvoiceNoRef.current || formData.companyInvoiceRefNo,
        buyerAddress: sanitizeAddress(formData.buyerAddress),
        sellerAddress: sanitizeAddress(formData.sellerAddress),
        invoiceDate: dayjs(formData.invoiceDate).format("YYYY-MM-DD"),
        transctypeId: formData.transctypeId,
        scenarioId: "SN001", // Hardcoded SN001 for submit
        items: backendItems, // Use backend items that include all fields
        fbr_invoice_number: fbrInvoiceNumber,
        status: "posted", // Set status as posted since it's been submitted to FBR
        idToDelete: editingId || null, // Pass the draft ID to be deleted by the backend
      };

      // Call backend API to save invoice
      const backendResponse = await api.post(
        `/tenant/${selectedTenant.tenant_id}/invoices`,
        backendData,
      );

      if (backendResponse.status !== 200) {
        throw new Error(
          `Failed to save invoice to backend database. Status: ${backendResponse.status}`,
        );
      }

      // STEP 4: Show Success Message
      Swal.fire({
        icon: "success",
        title: "Invoice Submitted Successfully!",
        text: `FBR Invoice Number: ${fbrInvoiceNumber}`,
        showCancelButton: true,
        confirmButtonText: "View Invoice",
        cancelButtonText: "Create New",
        confirmButtonColor: "#28a745",
        cancelButtonColor: "#6c757d",
        reverseButtons: true,
      }).then((result) => {
        if (result.isConfirmed) {
          const apiKey = API_CONFIG.apiKeyLocal;
          const link = `${apiKey}/print-invoice/${fbrInvoiceNumber}?tenantId=${selectedTenant.tenant_id}`;
          window.open(link, "_blank");
        }

        resetForm();
        // Always reset editingId after successful submission
        setEditingId(null);
      });
      setIsPrintable(true);
    } catch (error) {
      console.error("Submit Error:", error);

      // Provide more specific error messages based on error type
      let errorMessage = "Failed to submit invoice";
      let errorTitle = "Submission Error";

      if (error.response) {
        // Backend API error
        if (error.response.status === 401) {
          errorTitle = "Authentication Error";
          errorMessage = "Please log in again. Your session may have expired.";
        } else if (error.response.status === 403) {
          errorTitle = "Access Denied";
          errorMessage = "You don't have permission to perform this action.";
        } else if (error.response.status === 409) {
          errorTitle = "Duplicate Invoice";
          errorMessage = "An invoice with this number already exists.";
        } else if (error.response.status >= 500) {
          errorTitle = "Server Error";
          errorMessage = "Backend server error. Please try again later.";
        } else {
          errorMessage =
            error.response.data?.error ||
            error.response.data?.message ||
            `Backend error: ${error.response.status}`;
        }
      } else if (error.request) {
        // Network error
        errorTitle = "Network Error";
        errorMessage =
          "Unable to connect to server. Please check your internet connection.";
      } else {
        // Other errors (like FBR API errors)
        errorMessage = error.message || "An unexpected error occurred";
      }

      await showError({
        title: errorTitle,
        message: errorMessage,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintInvoice = () => {
    // Use addedItems for printing if available, otherwise use formData
    const dataToPrint =
      addedItems.length > 0 ? { ...formData, items: addedItems } : formData;
    printInvoice(dataToPrint);
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
      sellerFullNTN: selectedTenant?.sellerFullNTN || "",
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
      custAccountNo: "",
      custLpoNo: "",
      lpoDate: "",
      deliveryNoteNo: "",
      sp: "",
      productOrigin: "",
      productCertifiedBy: "",
      paymentTerms: "",
      paymentDue: "",
      group: "",
      transctypeId: "",
      items: [
        {
          name: "",
          hsCode: "",
          productDescription: "",
          rate: "",
          quantity: "1",
          unitPrice: "0.00", // Calculated field: Retail Price ÷ Quantity
          retailPrice: "0", // User input field
          totalValues: "0",
          valueSalesExcludingST: "0",
          salesTaxApplicable: "0",
          salesTaxWithheldAtSource: "0",
          sroScheduleNo: "",
          sroItemSerialNo: "",
          billOfLadingUoM: "",
          uoM: "",
          uoMForInternal: "",
          saleType: "",
          isSROScheduleEnabled: false,
          isSROItemEnabled: false,
          extraTax: "",
          furtherTax: "0",
          fedPayable: "0",
          discount: "0",
          advanceIncomeTax: "0",
          isValueSalesManual: false,
          isTotalValuesManual: false,
          isSalesTaxManual: false,
          isSalesTaxWithheldManual: false,
          isFurtherTaxManual: false,
          isFedPayableManual: false,
        },
      ],
    });
    setIsSubmitVisible(false);
    setSelectedBuyerId("");
    setTransactionTypeId(null);
    setAddedItems([]);
    setEditingItemIndex(null);
    setProductInputValue("");
    setProductSearch("");
    setBuyerSearch("");
  };

  // Show loading state when tokens are not loaded
  if (!selectedTenant) {
    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          p: 3,
          textAlign: "center",
        }}
      >
        <Alert
          severity="warning"
          sx={{
            maxWidth: 500,
            mb: 3,
            "& .MuiAlert-message": {
              fontSize: "1.1rem",
              fontWeight: 500,
            },
          }}
        >
          Please select a Company to continue
        </Alert>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={() => navigate("/tenant-management")}
          sx={{ mt: 2 }}
        >
          Select Company
        </Button>
      </Box>
    );
  }

  if (!tokensLoaded && selectedTenant) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
          flexDirection: "column",
        }}
      >
        <CircularProgress sx={{ mb: 2 }} />
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          {loadingTimeout
            ? "Loading is taking longer than expected..."
            : "Loading data from FBR..."}
        </Typography>
        <Button variant="outlined" onClick={retryTokenFetch} sx={{ mt: 2 }}>
          Retry Loading Credentials
        </Button>
        {loadingTimeout && (
          <Typography
            variant="body2"
            color="error"
            sx={{ mt: 2, textAlign: "center" }}
          >
            If the issue persists, try refreshing the page or selecting a
            different Company.
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <TenantSelectionPrompt>
      <Box
        className="professional-form"
        sx={{
          p: { xs: 1.5, sm: 2 },
          borderRadius: 2,
          mt: selectedTenant ? 1 : 4,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          maxWidth: "100%",
          mx: "auto",
          mb: 0,
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              "linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)",
            borderRadius: 2,
            pointerEvents: "none",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            gap: 1,
            mb: 1.5,
            position: "relative",
            zIndex: 1,
          }}
        >
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.5,
              textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            {isEditMode
              ? `Edit Invoice (Invoice No: ${editInvoiceNumber || "N/A"})`
              : "Invoice Creation"}
          </Typography>
          {selectedTenant && (
            <Tooltip
              title={`${selectedTenant.sellerBusinessName} | ${selectedTenant.sellerNTNCNIC}${selectedTenant.sellerFullNTN ? ` | Seller NTN: ${selectedTenant.sellerFullNTN}` : ""} | ${selectedTenant.sellerProvince} | ${selectedTenant.sellerAddress}`}
              arrow
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.5,
                  py: 0.8,
                  borderRadius: 25,
                  bgcolor: "rgba(255, 255, 255, 0.2)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  boxShadow: "0 4px 15px rgba(0,0,0,0.2)",
                  backdropFilter: "blur(10px)",
                  maxWidth: { xs: "100%", sm: 600 },
                  overflow: "hidden",
                }}
              >
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                    minWidth: 0,
                  }}
                >
                  <Business fontSize="small" />
                  <strong>{selectedTenant.sellerBusinessName}</strong>
                </Typography>
                <Typography variant="body2" noWrap>
                  |
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <CreditCard fontSize="small" />
                  {selectedTenant.sellerNTNCNIC}
                </Typography>
                {selectedTenant.sellerFullNTN && (
                  <>
                    <Typography variant="body2" noWrap>
                      |
                    </Typography>
                    <Typography
                      variant="body2"
                      noWrap
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.5,
                      }}
                    >
                      <CreditCard fontSize="small" />
                      Seller NTN: {selectedTenant.sellerFullNTN}
                    </Typography>
                  </>
                )}
                <Typography variant="body2" noWrap>
                  |
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <MapIcon fontSize="small" />
                  {selectedTenant.sellerProvince}
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>
        {/* Invoice Type Section */}
        <Box
          className="form-section"
          sx={{
            border: "none",
            borderRadius: 2,
            p: { xs: 1.5, sm: 2 },
            mb: 2,
            background: "rgba(255, 255, 255, 0.95)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            backdropFilter: "blur(10px)",
            transition: "all 0.3s ease",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Typography
            className="section-title"
            variant="h6"
            sx={{
              mb: 1.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontSize: "1rem",
            }}
          >
            Invoice Details
          </Typography>
          <Box
            className="compact-grid"
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 2,
            }}
          >
            <FormControl fullWidth size="small">
              <InputLabel id="invoice-type-label">Invoice Type</InputLabel>
              <Select
                labelId="invoice-type-label"
                value={formData.invoiceType}
                label="Invoice Type"
                onChange={(e) => handleChange("invoiceType", e.target.value)}
                sx={{
                  "& .MuiOutlinedInput-root": {
                    "& fieldset": { borderColor: "#e5e7eb" },
                  },
                }}
              >
                {invoiceTypes.map((type) => (
                  <MenuItem key={type.docTypeId} value={type.docDescription}>
                    {type.docDescription}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Invoice Date"
                value={formData.invoiceDate}
                onChange={(date) => handleChange("invoiceDate", date)}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    size: "small",
                    error: Boolean(invoiceDateError),
                    helperText: invoiceDateError || "",
                    sx: {
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "#e5e7eb" },
                      },
                      "& .MuiInputLabel-root": { color: "#6b7280" },
                    },
                  },
                }}
              />
            </LocalizationProvider>

            <TextField
              fullWidth
              size="small"
              label="Invoice Ref No."
              value={formData.invoiceRefNo}
              onChange={(e) => handleChange("invoiceRefNo", e.target.value)}
              variant="outlined"
              disabled={formData.invoiceType === "Sale Invoice"}
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              required
              label="Company Invoice Ref No:"
              value={formData.companyInvoiceRefNo}
              onChange={(e) =>
                handleChange("companyInvoiceRefNo", e.target.value)
              }
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="CUST. A/C NO"
              value={formData.custAccountNo}
              onChange={(e) => handleChange("custAccountNo", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="CUST. LPO NO"
              value={formData.custLpoNo}
              onChange={(e) => handleChange("custLpoNo", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="LPO DATE"
              value={formData.lpoDate}
              onChange={(e) => handleChange("lpoDate", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="DEL. NOTE NO"
              value={formData.deliveryNoteNo}
              onChange={(e) => handleChange("deliveryNoteNo", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="SP"
              value={formData.sp}
              onChange={(e) => handleChange("sp", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="PRODUCT ORIGIN"
              value={formData.productOrigin}
              onChange={(e) => handleChange("productOrigin", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="PRODUCT CERTIFIED BY"
              value={formData.productCertifiedBy}
              onChange={(e) => handleChange("productCertifiedBy", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="PAYMENT TERMS"
              value={formData.paymentTerms}
              onChange={(e) => handleChange("paymentTerms", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="PAYMENT DUE"
              value={formData.paymentDue}
              onChange={(e) => handleChange("paymentDue", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <TextField
              fullWidth
              size="small"
              label="GROUP"
              value={formData.group}
              onChange={(e) => handleChange("group", e.target.value)}
              variant="outlined"
              sx={{
                "& .MuiOutlinedInput-root": {
                  "& fieldset": { borderColor: "#e5e7eb" },
                },
                "& .MuiInputLabel-root": { color: "#6b7280" },
              }}
            />

            <Autocomplete
              fullWidth
              size="small"
              options={billToCombinedOptions}
              filterOptions={customFilterBillToOptions}
              getOptionLabel={(option) => option.name || ""}
              value={selectedBillTo}
              inputValue={billToInputValue}
              onInputChange={(event, newValue) => {
                setBillToInputValue(newValue);
              }}
              onChange={(event, newValue) => {
                handleSelectBillTo(newValue);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Bill To"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "#e5e7eb" },
                    },
                    "& .MuiInputLabel-root": { color: "#6b7280" },
                  }}
                />
              )}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                if (option.id === "__add__") {
                  return (
                    <li key={key} {...rest} style={{ color: "#007AFF", fontWeight: 600 }}>
                      + Add New Bill To
                    </li>
                  );
                }
                return (
                  <li key={key} {...rest}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {option.name}
                        </Typography>
                        {option.isBuyer && (
                          <Chip
                            label="Buyer"
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.6rem", fontWeight: 700 }}
                          />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {option.address}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
            />

            <Autocomplete
              fullWidth
              size="small"
              options={shipToCombinedOptions}
              filterOptions={customFilterShipToOptions}
              getOptionLabel={(option) => option.name || ""}
              value={selectedShipTo}
              inputValue={shipToInputValue}
              onInputChange={(event, newValue) => {
                setShipToInputValue(newValue);
              }}
              onChange={(event, newValue) => {
                handleSelectShipTo(newValue);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Ship To"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "#e5e7eb" },
                    },
                    "& .MuiInputLabel-root": { color: "#6b7280" },
                  }}
                />
              )}
              renderOption={(props, option) => {
                const { key, ...rest } = props;
                if (option.id === "__add__") {
                  return (
                    <li key={key} {...rest} style={{ color: "#007AFF", fontWeight: 600 }}>
                      + Add New Ship To
                    </li>
                  );
                }
                return (
                  <li key={key} {...rest}>
                    <Box>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {option.name}
                        </Typography>
                        {option.isBuyer && (
                          <Chip
                            label="Buyer"
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.6rem", fontWeight: 700 }}
                          />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {option.address}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              isOptionEqualToValue={(option, value) => String(option.id) === String(value.id)}
            />
          </Box>
        </Box>

        {/* Buyer Detail Section */}
        <Box
          className="form-section"
          sx={{
            border: "none",
            borderRadius: 2,
            p: { xs: 1.5, sm: 4 },
            mb: 2,
            background: "rgba(255, 255, 255, 0.95)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            backdropFilter: "blur(10px)",
            transition: "all 0.3s ease",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 2,
            }}
          >
            <Box sx={{ position: "relative" }}>
              <Box
                sx={{
                  position: "absolute",
                  top: -31,
                  right: 0,
                  zIndex: 2,
                }}
              >
                <Button
                  variant="outlined"
                  size="small"
                  onClick={openBuyerModal}
                  sx={{
                    color: "#007AFF",
                    borderColor: "#007AFF",
                    backgroundColor: "rgba(0, 122, 255, 0.05)",
                    fontSize: "0.75rem",
                    padding: "2px 4px",
                    minWidth: "auto",
                    height: "23px",
                    "&:hover": {
                      backgroundColor: "rgba(0, 122, 255, 0.1)",
                      borderColor: "#0056CC",
                    },
                  }}
                >
                  Add Buyer
                </Button>
              </Box>
              <Autocomplete
                key={`buyer-autocomplete`}
                fullWidth
                size="small"
                options={(() => {
                  const currentSelected =
                    buyers.find((b) => b.id === selectedBuyerId) ||
                    selectedBuyer;
                  const filteredBuyers = buyers.filter(
                    (b) => b.id !== selectedBuyerId,
                  );
                  const result = [];
                  if (currentSelected && currentSelected.id !== "__loading__") {
                    result.push(currentSelected);
                  }
                  result.push(...filteredBuyers);
                  if (loadingBuyers && buyerHasMore) {
                    result.push({
                      id: "__loading__",
                      buyerBusinessName: "Loading more...",
                    });
                  }
                  return result;
                })()}
                filterOptions={(x) => x}
                getOptionLabel={(option) =>
                  option.buyerBusinessName
                    ? `${option.buyerBusinessName} (${option.buyerNTNCNIC})`
                    : ""
                }
                value={
                  buyers.find((b) => b.id === selectedBuyerId) ||
                  selectedBuyer ||
                  null
                }
                inputValue={buyerInputValue}
                onInputChange={(_, newInputValue, reason) => {
                  console.log("onInputChange", {
                    newInputValue,
                    reason,
                    current: buyerInputValue,
                    isManualClear: isManualBuyerClearRef.current,
                  });

                  // CRITICAL FIX: Prevent Autocomplete from auto-clearing text when value switches to null
                  // When we backspace to search, if we clear the selection (set value to null), Autocomplete
                  // normally triggers a 'reset' with an empty string. We catch this and block it.
                  if (reason === "reset") {
                    if (isManualBuyerClearRef.current) {
                      console.log("Blocking unwanted reset from manual clear");
                      isManualBuyerClearRef.current = false;
                      return;
                    }
                    if (newInputValue === "" && buyerInputValue.length > 0) {
                      console.log("Blocking unwanted empty reset");
                      return;
                    }
                  }

                  // always update input value to reflect user typing (or valid resets)
                  setBuyerInputValue(newInputValue);

                  // If user clears the input manually, we must force clear the selection
                  if (newInputValue === "" && reason === "input") {
                    console.log("Input cleared by user, clearing selection");
                    setSelectedBuyer(null);
                    setSelectedBuyerId("");
                    setBuyerSearch("");
                    setBuyers([]);
                  }

                  if (reason === "input") {
                    // Check if new input matches the currently selected buyer's label
                    // If it doesn't match, we should clear the selection so the text doesn't "reappear"
                    const currentSelected =
                      buyers.find((b) => b.id === selectedBuyerId) ||
                      selectedBuyer;
                    if (currentSelected) {
                      const label = currentSelected.buyerBusinessName
                        ? `${currentSelected.buyerBusinessName} (${currentSelected.buyerNTNCNIC})`
                        : "";
                      if (newInputValue !== label) {
                        console.log(
                          "Input deviation detected, clearing selection",
                        );
                        isManualBuyerClearRef.current = true; // Mark that we are clearing it
                        setSelectedBuyer(null);
                        setSelectedBuyerId("");
                      }
                    }

                    setBuyerSearch(newInputValue);
                    if (buyerSearchDebounceRef.current) {
                      clearTimeout(buyerSearchDebounceRef.current);
                    }
                    buyerSearchDebounceRef.current = setTimeout(() => {
                      setBuyers([]);
                      setBuyerPage(1);
                      setBuyerHasMore(true);
                      createInvoiceFormFetchers.buyer?.(
                        1,
                        newInputValue,
                        false,
                      );
                    }, 300);
                  }

                  if (reason === "blur") {
                    const selectedBuyer = buyers.find(
                      (b) => b.id === selectedBuyerId,
                    );
                    const getBuyerLabel = (option) =>
                      option.buyerBusinessName
                        ? `${option.buyerBusinessName} (${option.buyerNTNCNIC})`
                        : "";

                    if (selectedBuyer && !newInputValue) {
                      setSelectedBuyerId(""); // Clear selected buyer if input is empty on blur
                    } else if (
                      selectedBuyer &&
                      newInputValue !== getBuyerLabel(selectedBuyer)
                    ) {
                      // Restore label on blur if mismatch (and not empty)
                      setBuyerInputValue(getBuyerLabel(selectedBuyer));
                    }
                  }
                }}
                ListboxProps={{
                  onScroll: (event) => {
                    const list = event.currentTarget;
                    const nearBottom =
                      list.scrollTop + list.clientHeight >=
                      list.scrollHeight - 16;
                    if (nearBottom && buyerHasMore && !loadingBuyers) {
                      const next = (buyerPage || 1) + 1;
                      createInvoiceFormFetchers.buyer?.(
                        next,
                        buyerSearch,
                        true,
                      );
                    }
                  },
                }}
                onChange={(_, newValue) => {
                  console.log("Buyer selection changed:", newValue);
                  if (newValue?.id === "__loading__") return;

                  if (!newValue) {
                    setSelectedBuyer(null);
                    setSelectedBuyerId("");
                    setBuyerInputValue(""); // Explicitly clear input on clear action
                    return;
                  }

                  // Update both ID and Object immediately
                  setSelectedBuyer(newValue);
                  setSelectedBuyerId(newValue.id);

                  // Force input sync immediately
                  const label = newValue.buyerBusinessName
                    ? `${newValue.buyerBusinessName} (${newValue.buyerNTNCNIC})`
                    : "";
                  setBuyerInputValue(label);

                  const buyerOpt = {
                    id: `buyer_${newValue.id}`,
                    buyerId: newValue.id,
                    name: newValue.buyerBusinessName || "",
                    address: newValue.buyerAddress || "",
                    ntn: newValue.buyerNTNCNIC || "",
                    isBuyer: true,
                    rawBuyer: newValue,
                  };

                  if (!selectedBillTo) {
                    handleSelectBillTo(buyerOpt);
                  }
                  if (!selectedShipTo) {
                    handleSelectShipTo(buyerOpt);
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select Buyer"
                    variant="outlined"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "#e5e7eb" },
                      },
                    }}
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderOption={(props, option) => {
                  const { key, ...rest } = props;
                  if (option.id === "__loading__") {
                    return (
                      <li key={key} {...rest}>
                        Loading more...
                      </li>
                    );
                  }
                  return (
                    <li key={key} {...rest}>
                      {option.buyerBusinessName}
                      {option.buyerNTNCNIC ? ` (${option.buyerNTNCNIC})` : ""}
                    </li>
                  );
                }}
                getOptionKey={(option) =>
                  option.id ||
                  option.buyerNTNCNIC ||
                  option.buyerBusinessName ||
                  option.buyerAddress ||
                  Math.random()
                }
              />
            </Box>
            <Box sx={{ position: "relative" }}>
              {/* Transaction Type Error Display */}
              {transactionTypesError && (
                <Box
                  sx={{
                    mb: 1,
                    p: 1.5,
                    borderRadius: 1,
                    backgroundColor: "rgba(239, 68, 68, 0.1)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "#dc2626",
                    fontSize: "0.875rem",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 1,
                    }}
                  >
                    <ErrorOutlineIcon sx={{ fontSize: "1rem" }} />
                    {transactionTypesError}
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setTransactionTypesError(null);
                      setTransactionTypesLoading(true);
                      // Re-fetch transaction types
                      const fetchTransactionTypes = async () => {
                        try {
                          const data = await getTransactionTypes();
                          let transactionTypesArray = [];
                          if (Array.isArray(data)) {
                            transactionTypesArray = data;
                          } else if (data && typeof data === "object") {
                            if (data.data && Array.isArray(data.data)) {
                              transactionTypesArray = data.data;
                            } else if (
                              data.transactionTypes &&
                              Array.isArray(data.transactionTypes)
                            ) {
                              transactionTypesArray = data.transactionTypes;
                            } else if (
                              data.results &&
                              Array.isArray(data.results)
                            ) {
                              transactionTypesArray = data.results;
                            } else {
                              transactionTypesArray = [data];
                            }
                          }
                          if (transactionTypesArray.length > 0) {
                            setTransactionTypes(transactionTypesArray);
                          } else {
                            setTransactionTypesError(
                              "API returned empty transaction types list",
                            );
                          }
                        } catch (error) {
                          setTransactionTypesError(
                            error.message ||
                            "Failed to fetch transaction types from API. Please check your connection and try again.",
                          );
                        } finally {
                          setTransactionTypesLoading(false);
                        }
                      };
                      fetchTransactionTypes();
                    }}
                    sx={{
                      color: "#dc2626",
                      borderColor: "#dc2626",
                      "&:hover": {
                        borderColor: "#b91c1c",
                        backgroundColor: "rgba(220, 38, 38, 0.04)",
                      },
                    }}
                  >
                    Retry
                  </Button>
                </Box>
              )}

              {/* Transaction Type Loading Display */}
              {/* {transactionTypesLoading && (
                <Box
                  sx={{
                    mb: 1,
                    p: 1.5,
                    borderRadius: 1,
                    backgroundColor: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    color: "#2563eb",
                    fontSize: "0.875rem",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <CircularProgress size={16} />
                  Loading transaction types from API...
                </Box>
              )} */}

              <Box>
                <Autocomplete
                  key={`transaction-type-${transactionTypeId || "empty"}-${formData.transctypeId || "empty"}`}
                  options={transactionTypes}
                  disabled={
                    transactionTypesLoading ||
                    !!transactionTypesError ||
                    transactionTypes.length === 0
                  }
                  loading={transactionTypesLoading}
                  open={transactionTypeDropdownOpen}
                  onOpen={() => setTransactionTypeDropdownOpen(true)}
                  onClose={() => setTransactionTypeDropdownOpen(false)}
                  getOptionLabel={(option) => {
                    if (typeof option === "string") return option;

                    const getTransactionTypeId = (type) => {
                      return (
                        type.transactioN_TYPE_ID ||
                        type.transactionTypeId ||
                        type.transaction_type_id ||
                        type.transactionTypeID ||
                        type.id ||
                        type.typeId ||
                        type.transTypeId
                      );
                    };

                    const getTransactionTypeDesc = (type) => {
                      return (
                        type.transactioN_DESC ||
                        type.transactionDesc ||
                        type.description ||
                        type.desc ||
                        type.name
                      );
                    };

                    return `${getTransactionTypeId(option)} - ${getTransactionTypeDesc(option)}`;
                  }}
                  value={(() => {
                    const effectiveId =
                      transactionTypeId || formData.transctypeId;

                    // Helper function to get the ID from a transaction type object
                    const getTransactionTypeId = (type) => {
                      return (
                        type.transactioN_TYPE_ID ||
                        type.transactionTypeId ||
                        type.transaction_type_id ||
                        type.transactionTypeID ||
                        type.id ||
                        type.typeId ||
                        type.transTypeId
                      );
                    };

                    // Helper function to get the description from a transaction type object
                    const getTransactionTypeDesc = (type) => {
                      return (
                        type.transactioN_DESC ||
                        type.transactionDesc ||
                        type.description ||
                        type.desc ||
                        type.name
                      );
                    };

                    // Try to find the matching transaction type
                    const foundType = transactionTypes.find((type) => {
                      const typeId = getTransactionTypeId(type);
                      return (
                        typeId === effectiveId ||
                        typeId === String(effectiveId) ||
                        typeId === Number(effectiveId)
                      );
                    });

                    // Autocomplete value calculation completed
                    return foundType || null;
                  })()}
                  onChange={(event, newValue) => {
                    if (newValue) {
                      const getTransactionTypeId = (type) => {
                        return (
                          type.transactioN_TYPE_ID ||
                          type.transactionTypeId ||
                          type.transaction_type_id ||
                          type.transactionTypeID ||
                          type.id ||
                          type.typeId ||
                          type.transTypeId
                        );
                      };
                      handleTransactionTypeChange(
                        getTransactionTypeId(newValue),
                      );
                    } else {
                      handleTransactionTypeChange("");
                    }
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={
                        transactionTypesLoading
                          ? "Loading Transaction Types..."
                          : transactionTypesError
                            ? "Transaction Type (Error)"
                            : "Transaction Type"
                      }
                      size="small"
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          "& fieldset": {
                            borderColor: transactionTypesError
                              ? "#dc2626"
                              : "#e5e7eb",
                          },
                        },
                      }}
                      InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                          <>
                            {transactionTypesLoading ? (
                              <CircularProgress color="inherit" size={20} />
                            ) : null}
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTransactionTypeButtonClick();
                              }}
                              disabled={transactionTypesLoading}
                              size="small"
                              sx={{
                                ml: 1,
                                minWidth: "auto",
                                height: 24,
                                px: 1,
                                fontSize: "0.72rem",
                                color: "#007AFF",
                                borderColor: "#007AFF",
                                border: "1px solid",
                                backgroundColor: "rgba(0, 122, 255, 0.05)",
                                "&:hover": {
                                  backgroundColor: "rgba(0, 122, 255, 0.1)",
                                  borderColor: "#0056CC",
                                },
                                "&:disabled": {
                                  color: "#9ca3af",
                                  borderColor: "#9ca3af",
                                  backgroundColor: "rgba(156, 163, 175, 0.05)",
                                },
                              }}
                            >
                              Choose
                            </Button>
                            {params.InputProps.endAdornment}
                          </>
                        ),
                      }}
                    />
                  )}
                  isOptionEqualToValue={(option, value) => {
                    const getTransactionTypeId = (type) => {
                      return (
                        type.transactioN_TYPE_ID ||
                        type.transactionTypeId ||
                        type.transaction_type_id ||
                        type.transactionTypeID ||
                        type.id ||
                        type.typeId ||
                        type.transTypeId
                      );
                    };
                    return (
                      getTransactionTypeId(option) ===
                      getTransactionTypeId(value)
                    );
                  }}
                  freeSolo
                  selectOnFocus
                  clearOnBlur={false}
                  handleHomeEndKeys
                />
              </Box>
            </Box>
          </Box>

          {/* FBR Registration Status Indicator */}
          {selectedBuyerId && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 2,
                backgroundColor: "#f8f9fa",
                border: "1px solid #e9ecef",
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ mb: 1, fontWeight: 600, color: "#495057" }}
              >
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
                <Alert severity="warning" sx={{ py: 1 }}>
                  <Typography variant="body2">
                    Unable to verify registration status:{" "}
                    {fbrRegistrationStatus.error}
                  </Typography>
                </Alert>
              ) : fbrRegistrationStatus.isActive !== null ? (
                <Box>
                  <Alert
                    severity={
                      fbrRegistrationStatus.isActive ? "success" : "info"
                    }
                    sx={{ py: 1, mb: 1 }}
                  >
                    <Typography variant="body2">
                      <strong>Status:</strong> {fbrRegistrationStatus.status}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Further Tax:</strong>{" "}
                      {fbrRegistrationStatus.shouldApplyFurtherTax
                        ? "4% (Applied - Registration Inactive)"
                        : "0% (Not Applied - Registration Active)"}
                    </Typography>
                  </Alert>
                </Box>
              ) : null}
            </Box>
          )}

          {/* Only keeping Select Buyer field; removing other buyer detail fields */}
        </Box>

        {/* Items Section */}
        <Box
          sx={{
            border: "none",
            borderRadius: 2,
            p: { xs: 1.5, sm: 2 },
            mb: 2,
            background: "rgba(255, 255, 255, 0.95)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            backdropFilter: "blur(10px)",
            transition: "all 0.3s ease",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              mb: 1.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontSize: "1rem",
            }}
          >
            Items
          </Typography>

          {formData.items.map((item, index) => (
            <Box
              key={index}
              sx={{
                mb: 1,
                border: "1px solid rgba(99, 102, 241, 0.15)",
                borderRadius: 1,
                p: { xs: 1, sm: 1.25 },
                background: "rgba(248, 250, 252, 0.7)",
                position: "relative",
                transition: "all 0.3s ease",
                "&:hover": {
                  boxShadow: "0 3px 10px rgba(99, 102, 241, 0.15)",
                  background: "rgba(248, 250, 252, 0.9)",
                },
              }}
            >
              {/* Select Product Section (replaces HS Code section) */}
              <Box
                sx={{
                  border: "none",
                  borderRadius: 1,
                  p: 1,
                  mb: 1,
                  background: "rgba(255, 255, 255, 0.6)",
                  transition: "all 0.2s ease",
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                    gap: 1,
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Autocomplete
                      key={`product-autocomplete-${index}`}
                      fullWidth
                      size="small"
                      options={(() => {
                        const currentId = selectedProductIdByItem[index];
                        const itemName = formData.items[index]?.name || "";
                        const currentSelected =
                          products.find(
                            (p) => String(p.id) === String(currentId),
                          ) ||
                          (currentId || itemName
                            ? {
                              id: currentId || `temp-${itemName}`,
                              name: itemName || "Selected Product",
                              hsCode: formData.items[index]?.hsCode || "",
                              description:
                                formData.items[index]?.productDescription ||
                                "",
                            }
                            : null);

                        const opts = [{ id: "__add__", name: "Add Product" }];
                        if (currentSelected) {
                          opts.push(currentSelected);
                        }

                        // Add other products, avoiding duplicates with currentSelected
                        products.forEach((p) => {
                          if (
                            !currentSelected ||
                            String(p.id) !== String(currentSelected.id)
                          ) {
                            opts.push(p);
                          }
                        });

                        if (loadingProducts && productHasMore) {
                          opts.push({
                            id: "__loading__",
                            name: "Loading more...",
                          });
                        }
                        return opts;
                      })()}
                      filterOptions={(x) => x}
                      getOptionLabel={(option) => option?.name || ""}
                      value={(() => {
                        const currentId = selectedProductIdByItem[index];
                        const itemName = formData.items[index]?.name || "";

                        const found = products.find(
                          (p) => String(p.id) === String(currentId),
                        );
                        if (found) return found;

                        if (currentId || itemName) {
                          // Only return a temp object if the input matches the name exactly
                          // This prevents the "reappearing" text when the user has already edited the input
                          if (productInputValue === itemName) {
                            return {
                              id: currentId || `temp-${itemName}`,
                              name: itemName || "Selected Product",
                              hsCode: formData.items[index]?.hsCode || "",
                              description:
                                formData.items[index]?.productDescription || "",
                            };
                          }
                        }
                        return null;
                      })()}
                      inputValue={productInputValue}
                      onInputChange={(_, newValue, reason) => {
                        console.log("Product Autocomplete onInputChange", {
                          newValue,
                          reason,
                          index,
                          current: productInputValue,
                          isManualClear: isManualProductClearRef.current,
                        });

                        // Ignore unwanted resets that clear the text when value mismatches during typing
                        if (reason === "reset") {
                          if (isManualProductClearRef.current) {
                            console.log(
                              "Blocking unwanted product reset from manual clear",
                            );
                            isManualProductClearRef.current = false;
                            return;
                          }
                          if (newValue === "" && productInputValue.length > 0) {
                            console.log("Blocking unwanted product reset");
                            return;
                          }
                        }

                        setProductInputValue(newValue);

                        if (reason === "input") {
                          // Clear selection if input deviates from the current selected name
                          const itemName = formData.items[index]?.name || "";
                          if (itemName && newValue !== itemName) {
                            console.log(
                              "Product input deviation, clearing selection",
                            );
                            isManualProductClearRef.current = true;
                            setSelectedProductIdByItem((prev) => ({
                              ...prev,
                              [index]: undefined,
                            }));
                            handleItemChange(index, "name", "");
                            // We don't necessarily clear hsCode/description here to allow the user to search/edit
                            // But clearing name is key to stop the 'value' prop from fighting back
                          }

                          setProductSearch(newValue);
                          if (searchDebounceRef.current) {
                            clearTimeout(searchDebounceRef.current);
                          }
                          searchDebounceRef.current = setTimeout(() => {
                            setProducts([]);
                            setProductPage(1);
                            setProductHasMore(true);
                            fetchProductsPage(1, newValue, false);
                          }, 300);
                        }
                      }}
                      onBlur={() => {
                        // If input is empty on blur AND no selection exists, clear selection
                        if (
                          !productInputValue &&
                          !selectedProductIdByItem[index]
                        ) {
                          setSelectedProductIdByItem((prev) => ({
                            ...prev,
                            [index]: undefined,
                          }));
                          handleItemChange(index, "name", "");
                          handleItemChange(index, "hsCode", "");
                          handleItemChange(index, "productDescription", "");
                          handleItemChange(index, "uoM", "");
                          handleItemChange(index, "billOfLadingUoM", "");
                        }
                      }}
                      ListboxProps={{
                        onScroll: (event) => {
                          const listboxNode = event.currentTarget;
                          const nearBottom =
                            listboxNode.scrollTop + listboxNode.clientHeight >=
                            listboxNode.scrollHeight - 16;
                          if (
                            nearBottom &&
                            productHasMore &&
                            !loadingProducts
                          ) {
                            const nextPage = (productPage || 1) + 1;
                            fetchProductsPage(nextPage, productSearch, true);
                          }
                        },
                      }}
                      onChange={(event, newVal, reason) => {
                        console.log(
                          "Product Autocomplete onChange triggered:",
                          {
                            newVal,
                            reason,
                            index,
                          },
                        );
                        if (newVal?.id === "__add__") {
                          openProductModal();
                          return;
                        }
                        if (newVal?.id === "__loading__") {
                          return;
                        }
                        setSelectedProductIdByItem((prev) => ({
                          ...prev,
                          [index]: newVal?.id || undefined,
                        }));

                        // Only clear UoM fields if the product was explicitly changed by the user to a DIFFERENT product
                        if (
                          (reason === "selectOption" || reason === "clear") &&
                          newVal?.id !== selectedProductIdByItem[index]
                        ) {
                          console.log(
                            "Product changed via user interaction, clearing UoM",
                          );
                          handleItemChange(index, "uoM", "");
                          handleItemChange(index, "billOfLadingUoM", "");
                        }

                        if (newVal) {
                          handleItemChange(index, "name", newVal.name || "");
                          handleItemChange(
                            index,
                            "hsCode",
                            newVal.hsCode || "",
                          );
                          handleItemChange(
                            index,
                            "productDescription",
                            newVal.description || "",
                          );
                          handleItemChange(
                            index,
                            "weight",
                            newVal.weight !== undefined && newVal.weight !== null
                              ? String(newVal.weight)
                              : "",
                          );
                        } else {
                          // Clear product fields if selection is cleared
                          handleItemChange(index, "name", "");
                          handleItemChange(index, "hsCode", "");
                          handleItemChange(index, "productDescription", "");
                          handleItemChange(index, "weight", "");
                        }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="Select Product" />
                      )}
                      renderOption={(props, option) => {
                        const { key, ...rest } = props;
                        if (option.id === "__add__") {
                          return (
                            <li
                              key={key}
                              {...rest}
                              style={{ color: "#007AFF", fontWeight: 600 }}
                            >
                              + Add Product
                            </li>
                          );
                        }
                        if (option.id === "__loading__") {
                          return (
                            <li key={key} {...rest}>
                              Loading more...
                            </li>
                          );
                        }
                        return (
                          <li key={key} {...rest}>
                            {option.name}
                          </li>
                        );
                      }}
                      isOptionEqualToValue={(opt, val) =>
                        String(opt.id) === String(val.id)
                      }
                    />

                    {/* UoM Dropdown (For FBR) */}
                    <FormControl fullWidth size="small">
                      <InputLabel>UoM for FBR</InputLabel>
                      <Select
                        value={formData.items[index]?.uoM || ""}
                        onChange={(e) => {
                          // Only allow selection if it's not the placeholder
                          if (e.target.value !== "select_product_first") {
                            handleItemChange(index, "uoM", e.target.value);
                            handleItemChange(
                              index,
                              "billOfLadingUoM",
                              e.target.value,
                            );
                          }
                        }}
                        label="UoM for FBR"
                        endAdornment={
                          loadingUom[index] ? (
                            <CircularProgress size={16} sx={{ mr: 1 }} />
                          ) : null
                        }
                      >
                        {!(
                          selectedProductIdByItem[index] ||
                          formData.items[index]?.hsCode
                        ) ? (
                          <MenuItem value="select_product_first" disabled>
                            Select Product first
                          </MenuItem>
                        ) : uomOptions[index]?.length > 0 ? (
                          uomOptions[index].map((uom, uomIndex) => {
                            const uomValue = uom.description || uom.uoM_ID;
                            return (
                              <MenuItem key={uomIndex} value={uomValue}>
                                {uom.description || uom.uoM_ID}
                              </MenuItem>
                            );
                          })
                        ) : (
                          <MenuItem value="no_uom_available" disabled>
                            No UoM available
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>

                    {/* UoM for Internal Input Field */}
                    <TextField
                      fullWidth
                      size="small"
                      label="UoM for Internal"
                      type="text"
                      value={formData.items[index]?.uoMForInternal || ""}
                      onChange={(e) =>
                        handleItemChange(index, "uoMForInternal", e.target.value)
                      }
                      variant="outlined"
                    />
                  </Box>
                </Box>
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 1,
                  mb: 1,
                }}
              >
                <RateSelector
                  key={`RateSelector-${index}`}
                  index={index}
                  item={item}
                  handleItemChange={handleItemChange}
                  transactionTypeId={transactionTypeId}
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
                {item.sroScheduleNo &&
                  item.sroScheduleNo.trim().toLowerCase() !== "n/a" ? (
                  <SROItem
                    key={`SROItem-${index}`}
                    index={index}
                    disabled={!item.isSROItemEnabled}
                    item={item}
                    handleItemChange={handleItemChange}
                  />
                ) : null}
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 1,
                  mb: 1,
                }}
              >
                <TextField
                  fullWidth
                  size="small"
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
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { borderColor: "#e5e7eb" },
                      backgroundColor: "#f9fafb",
                    },
                    "& .MuiInputLabel-root": { color: "#6b7280" },
                  }}
                />
              </Box>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: 1,
                  mb: 1,
                }}
              >
                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Value Sales (Excl. ST)"
                    type="text"
                    value={
                      item.valueSalesExcludingST === "0.00" ||
                        item.valueSalesExcludingST === "0"
                        ? ""
                        : formatWithCommasWhileTyping(
                          item.valueSalesExcludingST,
                        )
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(
                          index,
                          "valueSalesExcludingST",
                          newValue,
                        );
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          handleItemChange(
                            index,
                            "valueSalesExcludingST",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>

                <TextField
                  fullWidth
                  size="small"
                  label="Qty in KGS (For FBR)"
                  type="text"
                  value={
                    item.quantity === "0.00"
                      ? ""
                      : formatQuantityWithCommas(item.quantity)
                  } // Show empty instead of 0.00
                  onChange={(e) => {
                    const newValue = handleFloatingNumberInput(
                      e.target.value,
                      true,
                    );
                    if (newValue !== null) {
                      handleItemChange(index, "quantity", newValue);
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value) {
                      // Remove commas and get the raw numeric value
                      const cleanValue = value.replace(/,/g, "");
                      // Don't parse to float and back to string - preserve the original decimal places
                      if (cleanValue && cleanValue !== "") {
                        handleItemChange(index, "quantity", cleanValue);
                      }
                    }
                  }}
                  variant="outlined"
                />

                <TextField
                  fullWidth
                  size="small"
                  label="Qty (For Internal Use)"
                  type="text"
                  value={item.qtyForInternal || ""}
                  onChange={(e) => {
                    const newValue = handleFloatingNumberInput(
                      e.target.value,
                      true,
                    );
                    if (newValue !== null) {
                      handleItemChange(index, "qtyForInternal", newValue);
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value) {
                      const cleanVal = value.replace(/,/g, "");
                      if (cleanVal && cleanVal !== "") {
                        handleItemChange(index, "qtyForInternal", cleanVal);
                      }
                    }
                  }}
                  variant="outlined"
                />

                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Unit Cost"
                    type="text"
                    value={formatNumberWithCommas(item.unitPrice)}
                    InputProps={{ readOnly: true }}
                    variant="outlined"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "& fieldset": { borderColor: "#e5e7eb" },
                      },
                      "& .MuiInputLabel-root": { color: "#6b7280" },
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
                    size="small"
                    label="Item Code"
                    type="text"
                    value={item.itemCode || ""}
                    onChange={(e) =>
                      handleItemChange(index, "itemCode", e.target.value)
                    }
                    variant="outlined"
                  />
                </Box>

                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Units"
                    type="text"
                    value={item.units || ""}
                    onChange={(e) =>
                      handleItemChange(index, "units", e.target.value)
                    }
                    variant="outlined"
                  />
                </Box>

                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Courier Charges"
                    type="text"
                    value={
                      item.courierCharges === "0.00" ||
                      item.courierCharges === "0"
                        ? ""
                        : formatWithCommasWhileTyping(item.courierCharges)
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(index, "courierCharges", newValue);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          handleItemChange(
                            index,
                            "courierCharges",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>

                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Sales Tax Applicable"
                    type="text"
                    value={formatNumberWithCommas(item.salesTaxApplicable)}
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
              </Box>

              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 1, alignItems: "flex-start" }}>
                <Box sx={{ flex: "1 1 18%", minWidth: "150px", display: "flex", flexDirection: "column" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={item.vat18 || false}
                        onChange={(e) => handleItemChange(index, "vat18", e.target.checked)}
                        color="primary"
                        size="small"
                      />
                    }
                    label="VAT 18%"
                    sx={{ mb: 0.5, ml: 0 }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Calculated VAT 18%"
                    type="text"
                    value={formatNumberWithCommas(item.vat18Amount || 0)}
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

                <Box sx={{ flex: "1 1 18%", minWidth: "150px", display: "flex", flexDirection: "column" }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={item.vat25 || false}
                        onChange={(e) => handleItemChange(index, "vat25", e.target.checked)}
                        color="primary"
                        size="small"
                      />
                    }
                    label="VAT 25%"
                    sx={{ mb: 0.5, ml: 0 }}
                  />
                  <TextField
                    fullWidth
                    size="small"
                    label="Calculated VAT 25%"
                    type="text"
                    value={formatNumberWithCommas(item.vat25Amount || 0)}
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
              </Box>

              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mt: 1 }}>
                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="ST Withheld at Source"
                    type="text"
                    value={
                      item.salesTaxWithheldAtSource === "0.00" ||
                        item.salesTaxWithheldAtSource === "0"
                        ? ""
                        : formatWithCommasWhileTyping(
                          item.salesTaxWithheldAtSource,
                        )
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(
                          index,
                          "salesTaxWithheldAtSource",
                          newValue,
                        );
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        // Remove commas and get the raw numeric value
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          // Store the raw numeric value, not the formatted one
                          handleItemChange(
                            index,
                            "salesTaxWithheldAtSource",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>
                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Extra Tax"
                    type="text"
                    value={
                      item.extraTax === "0.00" || item.extraTax === "0"
                        ? ""
                        : formatWithCommasWhileTyping(item.extraTax)
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(index, "extraTax", newValue);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        // Remove commas and get the raw numeric value
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          // Store the raw numeric value, not the formatted one
                          handleItemChange(
                            index,
                            "extraTax",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>
                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Further Tax"
                    type="text"
                    value={
                      item.furtherTax === "0.00" || item.furtherTax === "0"
                        ? ""
                        : formatWithCommasWhileTyping(item.furtherTax)
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(index, "furtherTax", newValue);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        // Remove commas and get the raw numeric value
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          // Store the raw numeric value, not the formatted one
                          handleItemChange(
                            index,
                            "furtherTax",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>
                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="FED Payable"
                    type="text"
                    value={
                      item.fedPayable === "0.00" || item.fedPayable === "0"
                        ? ""
                        : formatWithCommasWhileTyping(item.fedPayable)
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(index, "fedPayable", newValue);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        // Remove commas and get the raw numeric value
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          // Store the raw numeric value, not the formatted one
                          handleItemChange(
                            index,
                            "fedPayable",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>
                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Advance Income Tax"
                    type="text"
                    value={
                      item.advanceIncomeTax === "0.00" ||
                        item.advanceIncomeTax === "0"
                        ? ""
                        : formatWithCommasWhileTyping(item.advanceIncomeTax)
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(index, "advanceIncomeTax", newValue);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          handleItemChange(
                            index,
                            "advanceIncomeTax",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>
                <Box sx={{ flex: "1 1 18%", minWidth: "150px" }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Discount"
                    type="text"
                    value={
                      item.discount === "0.00" || item.discount === "0"
                        ? ""
                        : formatWithCommasWhileTyping(item.discount)
                    }
                    onChange={(e) => {
                      const newValue = handleFloatingNumberInput(
                        e.target.value,
                        true,
                      );
                      if (newValue !== null) {
                        handleItemChange(index, "discount", newValue);
                      }
                    }}
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value) {
                        // Remove commas and get the raw numeric value
                        const cleanValue = value.replace(/,/g, "");
                        const numValue = parseFloat(cleanValue);
                        if (!isNaN(numValue)) {
                          // Store the raw numeric value, not the formatted one
                          handleItemChange(
                            index,
                            "discount",
                            numValue.toString(),
                          );
                        }
                      }
                    }}
                    variant="outlined"
                  />
                </Box>
              </Box>

              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 1.5,
                  mt: 1,
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Box sx={{ flex: "0 1 18%", minWidth: "150px" }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Total Values: {formatNumberWithCommas(item.totalValues)}
                  </Typography>
                </Box>
                <Tooltip title={editingItemIndex ? "Update Item" : "Add Item"}>
                  <IconButton
                    aria-label={editingItemIndex ? "update item" : "add item"}
                    onClick={addNewItem}
                    sx={{
                      color: editingItemIndex ? "#f57c00" : "#2A69B0",
                      transition: "color 0.2s ease",
                    }}
                  >
                    <IoIosAddCircle size={35} />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* <Box sx={{ position: "relative", mt: 0.5, textAlign: "left" }}>
                <IconButton
                  aria-label="remove item"
                  color="error"
                  size="small"
                  onClick={() => removeItem(index)}
                  sx={{
                    mt: 0.5,
                    borderRadius: 1.5,
                  }}
                >
                  <FaTrash />
                </IconButton>
              </Box> */}
            </Box>
          ))}
        </Box>

        {/* Helper message when no items are added */}
        {addedItems.length === 0 && (
          <Box
            sx={{
              border: "2px dashed #2A69B0",
              borderRadius: 2,
              p: 3,
              mb: 2,
              background: "rgba(248, 250, 252, 0.7)",
              textAlign: "center",
            }}
          >
            <Typography
              variant="body1"
              sx={{
                color: "#2A69B0",
                fontWeight: 500,
                mb: 1,
              }}
            >
              📋 No items added yet
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "#2A69B0",
                fontSize: "0.875rem",
              }}
            >
              Fill in the item details above and click the + button to add
              items. Save and Validate buttons will appear once you add items.
            </Typography>
          </Box>
        )}

        {/* Added Items Table */}
        {addedItems.length > 0 && (
          <Box
            sx={{
              border: "none",
              borderRadius: 2,
              p: { xs: 1.5, sm: 2 },
              mb: 2,
              background: "rgba(255, 255, 255, 0.95)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              backdropFilter: "blur(10px)",
              transition: "all 0.3s ease",
              position: "relative",
              zIndex: 1,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                mb: 1.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: 1,
                fontSize: "1rem",
              }}
            >
              Added Items ({addedItems.length})
            </Typography>

            <Box
              sx={{
                overflowX: "auto",
                border: "1px solid rgba(99, 102, 241, 0.15)",
                borderRadius: 1,
                background: "rgba(248, 250, 252, 0.7)",
              }}
            >
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ background: "rgba(99, 102, 241, 0.1)" }}>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Item No
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        HS Code
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Product Description
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Rate
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        UoM (FBR)
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        UoM (Internal)
                      </TableCell>

                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Quantity
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Qty (Internal)
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Unit Cost
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Item Code
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Units
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Courier Charges
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Total Value
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {addedItems.map((item, index) => (
                      <TableRow
                        key={item.id}
                        sx={{
                          "&:nth-of-type(odd)": {
                            background: "rgba(255, 255, 255, 0.5)",
                          },
                          "&:hover": {
                            background: "rgba(99, 102, 241, 0.05)",
                          },
                        }}
                      >
                        <TableCell
                          sx={{ fontSize: "0.875rem", fontWeight: 600 }}
                        >
                          Item {index + 1}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.hsCode}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.productDescription}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.rate}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.uoM || "-"}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.uoMForInternal || "-"}
                        </TableCell>

                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {formatQuantityWithCommas(item.quantity)}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.qtyForInternal ? formatQuantityWithCommas(item.qtyForInternal) : "-"}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {formatNumberWithCommas(item.unitPrice)}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.itemCode || "-"}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {item.units || "-"}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {formatNumberWithCommas(item.courierCharges)}
                        </TableCell>
                        <TableCell sx={{ fontSize: "0.875rem" }}>
                          {formatNumberWithCommas(item.totalValues)}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: "flex", gap: 1 }}>
                            <Tooltip
                              title={
                                editingItemIndex && editingItemIndex !== item.id
                                  ? "Save the current item first"
                                  : "Edit item"
                              }
                              placement="top"
                            >
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={() => editAddedItem(item.id)}
                                  disabled={
                                    editingItemIndex &&
                                    editingItemIndex !== item.id
                                  }
                                  sx={{
                                    borderRadius: 1,
                                    "&:hover": {
                                      background:
                                        editingItemIndex &&
                                          editingItemIndex !== item.id
                                          ? "rgba(0, 0, 0, 0.04)"
                                          : "rgba(99, 102, 241, 0.1)",
                                    },
                                    "&.Mui-disabled": {
                                      color: "rgba(0, 0, 0, 0.26)",
                                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                                    },
                                  }}
                                >
                                  <FaEdit size={16} />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => deleteAddedItem(item.id)}
                              sx={{
                                borderRadius: 1,
                                "&:hover": {
                                  background: "rgba(244, 67, 54, 0.1)",
                                },
                              }}
                            >
                              <FaTrash size={16} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        )}

        <Box
          className="button-group"
          sx={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            mt: 0.5,
            mb: 0,
            py: 0,
            minHeight: "auto",
            height: "auto",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {/* Show Save Draft and Save & Validate buttons only when there are added items */}
            {addedItems.length > 0 && (
              <>
                <Button
                  onClick={handleSave}
                  variant="outlined"
                  color="info"
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
                    "&:hover": {
                      background: "#0288d1",
                      color: "white",
                      boxShadow: 2,
                    },
                  }}
                  disabled={saveLoading}
                >
                  {saveLoading ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    "Save Draft"
                  )}
                </Button>
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
                    "&:hover": {
                      background: "#f57c00",
                      color: "white",
                      boxShadow: 2,
                    },
                  }}
                  disabled={saveValidateLoading}
                >
                  {saveValidateLoading ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    "Save & Validate"
                  )}
                </Button>
              </>
            )}
            {isSubmitVisible && (
              <Button
                onClick={handleSubmitChange}
                variant="contained"
                size="small"
                sx={{
                  background: "#2E7D32",
                  borderRadius: 1.5,
                  fontWeight: 600,
                  px: 1.5,
                  py: 0.3,
                  fontSize: 11,
                  letterSpacing: 0.3,
                  boxShadow: 1,
                  transition: "background 0.2s",
                  minWidth: "auto",
                  "&:hover": { background: "#256e2b" },
                }}
                disabled={loading}
              >
                {loading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  "Submit"
                )}
              </Button>
            )}
          </Box>
        </Box>
        {(allLoading ||
          (selectedTenant && !tokensLoaded && !loadingTimeout)) && (
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

        {/* Buyer Modal */}
        <BuyerModal
          isOpen={isBuyerModalOpen}
          onClose={closeBuyerModal}
          onSave={handleSaveBuyer}
          buyer={null}
        />

        {/* Product Modal */}
        <ProductModal
          isOpen={isProductModalOpen}
          onClose={closeProductModal}
          onSave={handleSaveProduct}
          initialProduct={null}
        />

        {/* Bill To Modal */}
        <Dialog open={isBillToModalOpen} onClose={() => setIsBillToModalOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Add New Bill To
            <IconButton onClick={() => setIsBillToModalOpen(false)}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <form onSubmit={handleSaveBillTo}>
            <DialogContent dividers sx={{ p: 3 }}>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <TextField
                  label="Name"
                  required
                  value={billToForm.name}
                  onChange={(e) => setBillToForm({ ...billToForm, name: e.target.value })}
                  error={!!billToFormErrors.name}
                  helperText={billToFormErrors.name}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Address"
                  required
                  value={billToForm.address}
                  onChange={(e) => setBillToForm({ ...billToForm, address: e.target.value })}
                  error={!!billToFormErrors.address}
                  helperText={billToFormErrors.address}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
                <TextField
                  label="Ref No"
                  required
                  value={billToForm.refNo}
                  onChange={(e) => setBillToForm({ ...billToForm, refNo: e.target.value })}
                  error={!!billToFormErrors.refNo}
                  helperText={billToFormErrors.refNo}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="NTN"
                  value={billToForm.ntn}
                  onChange={(e) => setBillToForm({ ...billToForm, ntn: e.target.value })}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="STRN"
                  value={billToForm.strn}
                  onChange={(e) => setBillToForm({ ...billToForm, strn: e.target.value })}
                  fullWidth
                  size="small"
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setIsBillToModalOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained" color="primary" disabled={isSubmittingBillTo}>
                {isSubmittingBillTo ? <CircularProgress size={24} /> : "Save"}
              </Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Ship To Modal */}
        <Dialog open={isShipToModalOpen} onClose={() => setIsShipToModalOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Add New Ship To
            <IconButton onClick={() => setIsShipToModalOpen(false)}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <form onSubmit={handleSaveShipTo}>
            <DialogContent dividers sx={{ p: 3 }}>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <TextField
                  label="Name"
                  required
                  value={shipToForm.name}
                  onChange={(e) => setShipToForm({ ...shipToForm, name: e.target.value })}
                  error={!!shipToFormErrors.name}
                  helperText={shipToFormErrors.name}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Address"
                  required
                  value={shipToForm.address}
                  onChange={(e) => setShipToForm({ ...shipToForm, address: e.target.value })}
                  error={!!shipToFormErrors.address}
                  helperText={shipToFormErrors.address}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />
                <TextField
                  label="Contact Person"
                  required
                  value={shipToForm.contactPerson}
                  onChange={(e) => setShipToForm({ ...shipToForm, contactPerson: e.target.value })}
                  error={!!shipToFormErrors.contactPerson}
                  helperText={shipToFormErrors.contactPerson}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="Contact No"
                  required
                  value={shipToForm.contactNo}
                  onChange={(e) => setShipToForm({ ...shipToForm, contactNo: e.target.value })}
                  error={!!shipToFormErrors.contactNo}
                  helperText={shipToFormErrors.contactNo}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="CNIC"
                  required
                  value={shipToForm.cnic}
                  onChange={(e) => setShipToForm({ ...shipToForm, cnic: e.target.value })}
                  error={!!shipToFormErrors.cnic}
                  helperText={shipToFormErrors.cnic}
                  fullWidth
                  size="small"
                />
                <TextField
                  label="NTN"
                  value={shipToForm.ntn}
                  onChange={(e) => setShipToForm({ ...shipToForm, ntn: e.target.value })}
                  fullWidth
                  size="small"
                />
              </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setIsShipToModalOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained" color="primary" disabled={isSubmittingShipTo}>
                {isSubmittingShipTo ? <CircularProgress size={24} /> : "Save"}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </Box>
    </TenantSelectionPrompt>
  );
}
