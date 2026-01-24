import React, { useState, useEffect } from "react";
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
} from "@mui/material";
import dayjs from "dayjs";
import { fetchData } from "../API/GetApi";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import {
  getRatesForSellerProvince,
  getSellerProvinceCode,
} from "../utils/provinceMatcher";

const RateSelector = ({
  index,
  item,
  handleItemChange,
  transactionTypeId,
  selectedProvince,
  sellerProvince, // New prop for seller's province
}) => {
  const { tokensLoaded } = useTenantSelection();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);

  // Function to fetch rate data
  const getRateData = async (overrideTransactionTypeId = null) => {
    const effectiveTransactionTypeId =
      overrideTransactionTypeId || transactionTypeId;

    // Check if tokens are loaded before making API call
    if (!tokensLoaded) {
      console.warn("Tokens not loaded yet, skipping rate fetch");
      setRates([]);
      return null;
    }

    if (!effectiveTransactionTypeId) {
      console.log("Missing transaction type ID:", {
        effectiveTransactionTypeId,
      });
      setRates([]);
      return null;
    }

    // Determine which province to use for rate selection
    let provinceToUse = null;
    let provinceCode = null;

    if (sellerProvince) {
      // Use seller's province if available
      console.log(`Using seller's province: "${sellerProvince}"`);
      try {
        provinceCode = await getSellerProvinceCode(sellerProvince);
        if (provinceCode) {
          provinceToUse = sellerProvince;
          console.log(
            `Found province code ${provinceCode} for seller province "${sellerProvince}"`
          );
        } else {
          console.warn(
            `Could not determine province code for seller province "${sellerProvince}"`
          );
        }
      } catch (error) {
        console.error("Error getting seller province code:", error);
      }
    }

    // Fallback to selectedProvince if seller province failed or not available
    if (!provinceCode && selectedProvince) {
      console.log(`Falling back to selected province: "${selectedProvince}"`);

      // Get the full province data from localStorage
      const provinceResponseRaw = localStorage.getItem("provinceResponse");

      console.log("Province Response Raw:", provinceResponseRaw);

      // Parse the province data from localStorage
      let provinceResponse;
      try {
        provinceResponse = provinceResponseRaw
          ? JSON.parse(provinceResponseRaw)
          : [];
      } catch (parseError) {
        console.error("Error parsing province data:", parseError);
        provinceResponse = [];
      }

      // Ensure provinceResponse is an array
      if (!Array.isArray(provinceResponse)) {
        console.error("Province response is not an array:", provinceResponse);
        setRates([]);
        return null;
      }

      console.log(
        "Available provinces:",
        provinceResponse.map((p) => ({
          desc: p.stateProvinceDesc,
          code: p.stateProvinceCode,
        }))
      );
      console.log("Looking for province:", selectedProvince);

      const selectedProvinceObj = provinceResponse.find(
        (prov) => prov.stateProvinceDesc === selectedProvince
      );

      if (!selectedProvinceObj) {
        console.error("Selected province not found in province data");
        console.log(
          "Available province descriptions:",
          provinceResponse.map((p) => p.stateProvinceDesc)
        );
        setRates([]);
        return null;
      }

      provinceCode = selectedProvinceObj.stateProvinceCode;
      provinceToUse = selectedProvince;
      console.log("Found province code:", provinceCode);
    }

    if (!provinceCode) {
      console.error("No province code available for rate selection");
      setRates([]);
      return null;
    }

    setLoading(true);
    try {
      const currentDate = dayjs().format("DD-MMM-YYYY");
      
      const response = await fetchData(
        `pdi/v2/SaleTypeToRate?date=${currentDate}&transTypeId=${effectiveTransactionTypeId}&originationSupplier=${provinceCode}`
      );
      console.log("Rate Response:", response);
      console.log("Transaction Type ID:", effectiveTransactionTypeId);
      console.log("Response type:", typeof response);
      console.log("Response is array:", Array.isArray(response));
      console.log(
        "Note: SaleTypeToRate API returns rate information, not transaction type information"
      );

      // Debug: Log the full response structure for SN007
      // Note: SaleTypeToRate API returns rate information (ratE_ID, ratE_DESC, ratE_VALUE)
      // but does NOT return transactioN_TYPE_ID - that comes from the transtypecode API
      if (effectiveTransactionTypeId === "80") {
        console.log(
          "SN007 Debug - Full API Response:",
          JSON.stringify(response, null, 2)
        );
        if (Array.isArray(response)) {
          console.log(
            "SN007 Debug - Response array items:",
            response.map((item) => ({
              ratE_ID: item.ratE_ID,
              ratE_DESC: item.ratE_DESC,
              ratE_VALUE: item.ratE_VALUE,
            }))
          );
        }
      }

      if (Array.isArray(response)) {
        setRates(response);
      } else if (response && typeof response === "object") {
        // Handle case where response might be wrapped in an object
        const ratesArray = response.data || response.rates || response;
        setRates(Array.isArray(ratesArray) ? ratesArray : []);
      } else {
        setRates([]);
      }
    } catch (error) {
      console.error("Error fetching rates:", error);
      setRates([]);
    } finally {
      setLoading(false);
    }
  };

  // Manual function to fetch rates
  const handleFetchRates = async () => {
    if (!tokensLoaded) {
      console.warn("Tokens not loaded yet, cannot fetch rates");
      return;
    }

    if (!transactionTypeId) {
      console.warn("Transaction type not selected yet");
      return;
    }

    if (!selectedProvince && !sellerProvince) {
      console.warn(
        "No province available (neither selected nor seller province)"
      );
      return;
    }

    await getRateData();
  };

  // Fetch rates when dependencies change (only for editing mode)
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if (
      isEditing &&
      item.rate &&
      transactionTypeId &&
      (selectedProvince || sellerProvince)
    ) {
      getRateData();
    }
  }, [transactionTypeId, selectedProvince, sellerProvince, tokensLoaded]);

  // Clear rates and fetch new ones when transactionTypeId changes
  useEffect(() => {
    if (
      transactionTypeId &&
      (selectedProvince || sellerProvince) &&
      tokensLoaded
    ) {
      // Clear previous rates immediately when transaction type changes
      setRates([]);
      // Fetch new rates for the current transaction type
      getRateData();
    }
  }, [transactionTypeId, selectedProvince, sellerProvince]);

  // Additional effect to handle editing when transactionTypeId is set after component mount
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if (isEditing && item.rate && transactionTypeId && rates.length === 0) {
      console.log(
        "Editing mode detected with transactionTypeId, fetching rates for:",
        item.rate
      );
      getRateData(transactionTypeId);
    }
  }, [transactionTypeId, item.rate, sellerProvince]);

  // Fallback effect to set transactionTypeId for editing when scenario is known but transactionTypeId is missing
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if (isEditing && item.rate && !transactionTypeId) {
      // Try to get transactionTypeId from localStorage or set based on common scenarios
      const storedTransactionTypeId = localStorage.getItem("transactionTypeId");
      if (storedTransactionTypeId) {
        console.log(
          "Found stored transactionTypeId for editing:",
          storedTransactionTypeId
        );
        // The parent component should pick this up and set the state
        // Force a re-render by triggering the rate fetch
        if (selectedProvince || sellerProvince) {
          console.log(
            "Triggering rate fetch with stored transactionTypeId:",
            storedTransactionTypeId
          );
          getRateData(storedTransactionTypeId);
        }
      } else {
        // Try to infer from the rate description or other context
        console.log(
          "No stored transactionTypeId found, checking for scenario-based fallback"
        );
      }
    }
  }, [item.rate, transactionTypeId, selectedProvince, sellerProvince]);

  // Handle editing case - set selectedRateId when editing an invoice
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if ((isEditing || item.rate) && rates.length > 0) {
      console.log("Editing mode detected, looking for rate:", item.rate);
      console.log(
        "Available rates:",
        rates.map((r) => r.ratE_DESC)
      );
      const selectedRateObj = rates.find(
        (rate) => rate.ratE_DESC === item.rate
      );
      if (selectedRateObj) {
        // Store rate ID per item instead of globally
        localStorage.setItem(
          `selectedRateId_${index}`,
          selectedRateObj.ratE_ID
        );
        console.log(
          `Set selectedRateId for item ${index} editing: ${selectedRateObj.ratE_ID}`
        );
      } else {
        console.warn(`Rate not found in available rates: ${item.rate}`);
      }
    }
  }, [rates, item.rate, index]);

  // Additional effect to handle editing when rate data is loaded after the editing flag is set
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if ((isEditing || item.rate) && rates.length > 0) {
      // This effect runs when rate data is loaded and we're in editing mode
      console.log(
        "Editing mode detected (delayed), looking for rate:",
        item.rate
      );
      const selectedRateObj = rates.find(
        (rate) => rate.ratE_DESC === item.rate
      );
      if (selectedRateObj) {
        // Store rate ID per item instead of globally
        localStorage.setItem(
          `selectedRateId_${index}`,
          selectedRateObj.ratE_ID
        );
        console.log(
          `Set selectedRateId for item ${index} editing (delayed): ${selectedRateObj.ratE_ID}`
        );
      } else {
        console.warn(
          `Rate not found in available rates (delayed): ${item.rate}`
        );
      }
    }
  }, [rates, item.rate, index]);

  // Handle rate selection and save ratE_ID to localStorage per item
  const handleRateChange = (event) => {
    const selectedRate = event.target.value;
    const selectedRateObj = rates.find(
      (rate) => rate.ratE_DESC === selectedRate
    );
    if (selectedRateObj) {
      // Store rate ID per item instead of globally
      localStorage.setItem(`selectedRateId_${index}`, selectedRateObj.ratE_ID);
      console.log(
        `Selected Rate ID for item ${index}: ${selectedRateObj.ratE_ID}`
      );
    }
    handleItemChange(index, "rate", selectedRate);
  };

  // Check if we're in editing mode and have a rate value but no transactionTypeId
  const isEditingWithRate =
    localStorage.getItem("editingInvoice") === "true" &&
    item.rate &&
    !transactionTypeId;

  // Improved logic to determine when to show transaction type message
  // Don't show transaction type message if we have a rate value (editing mode) or if transactionTypeId is available
  const showTransactionTypeMessage =
    !transactionTypeId && !isEditingWithRate && !item.rate;
  const showProvinceMessage =
    !showTransactionTypeMessage && !selectedProvince && !sellerProvince;

  return (
    <Box sx={{ flex: "1 1 22%", minWidth: "180px" }}>
      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
        <FormControl
          size="small"
          error={showTransactionTypeMessage || showProvinceMessage}
          sx={{ flex: 1 }}
        >
          <InputLabel id={`rate-${index}`}>Rate</InputLabel>
          <Select
            labelId={`rate-${index}`}
            value={item.rate || ""}
            label="Rate"
            onChange={handleRateChange}
            disabled={
              showTransactionTypeMessage || showProvinceMessage || loading
            }
          >
            {/* Debug info for editing mode */}
            {localStorage.getItem("editingInvoice") === "true" && item.rate && (
              <div style={{ display: "none" }}>
                Debug: Editing mode with rate "{item.rate}" for item {index}
              </div>
            )}
            {showTransactionTypeMessage ? (
              <MenuItem value="">Please select transaction type first</MenuItem>
            ) : showProvinceMessage ? (
              <MenuItem value="">
                Please select province or ensure seller province is set
              </MenuItem>
            ) : loading ? (
              <MenuItem value="">Loading rates...</MenuItem>
            ) : rates.length === 0 ? (
              <MenuItem value="">No rates available</MenuItem>
            ) : (
              rates.map((rate) => (
                <MenuItem key={rate.ratE_ID} value={rate.ratE_DESC}>
                  {rate.ratE_DESC}
                </MenuItem>
              ))
            )}
          </Select>
          {showTransactionTypeMessage && (
            <Box sx={{ color: "error.main", fontSize: 13, mt: 0.5, ml: 1 }}>
              {isEditingWithRate
                ? "Loading transaction type data..."
                : "Please select transaction type first."}
            </Box>
          )}
          {showProvinceMessage && (
            <Box sx={{ color: "error.main", fontSize: 13, mt: 0.5, ml: 1 }}>
              Please select province or ensure seller province is set.
            </Box>
          )}
        </FormControl>

        {/* Get Rate Button - Only show when transaction type is selected */}
        {transactionTypeId && (
          <Button
            onClick={handleFetchRates}
            disabled={
              loading || !tokensLoaded || (!selectedProvince && !sellerProvince)
            }
            variant="outlined"
            size="small"
            sx={{
              color: "#007AFF",
              borderColor: "#007AFF",
              backgroundColor: "rgba(0, 122, 255, 0.05)",
              fontWeight: 500,
              fontSize: "11px",
              py: 0.5,
              px: 1,
              borderRadius: 2,
              textTransform: "none",
              minWidth: "auto",
              height: "40px",
              "&:hover": {
                backgroundColor: "rgba(0, 122, 255, 0.1)",
                borderColor: "#0056CC",
              },
              "&:disabled": {
                color: "rgba(0, 122, 255, 0.5)",
                borderColor: "rgba(0, 122, 255, 0.3)",
              },
              transition: "all 0.2s ease-in-out",
            }}
          >
            {loading ? (
              <>
                <CircularProgress
                  size={14}
                  sx={{ mr: 0.5, color: "#007AFF" }}
                />
                Getting...
              </>
            ) : (
              "Get Rates"
            )}
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default RateSelector;
