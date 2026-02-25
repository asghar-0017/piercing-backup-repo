import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Divider,
  Stack,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  IconButton,
  CircularProgress,
  Alert,
  Snackbar,
  FormControlLabel,
  Radio,
  RadioGroup,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { fetchData } from "../API/GetApi";
import { useTenantSelection } from "../Context/TenantSelectionProvider";

// Utility function to wait for a specified time
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BuyerModal = ({ isOpen, onClose, onSave, buyer }) => {
  const { tokensLoaded, retryTokenFetch, validateAndRefreshToken } =
    useTenantSelection();
  const [formData, setFormData] = useState({
    buyerNTNCNIC: "",
    buyerBusinessName: "",
    buyerProvince: "",
    buyerAddress: "",
    buyerRegistrationType: "",
    buyerPhoneNumber: "",
    documentType: "NTN", // Default to NTN
  });
  const [provinces, setProvinces] = useState([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showError, setShowError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [maxRetries] = useState(3);
  const [checkingBuyerRegistration, setCheckingBuyerRegistration] =
    useState(false);
  const [buyerRegistrationHint, setBuyerRegistrationHint] = useState("");
  const [ntnDebounceTimer, setNtnDebounceTimer] = useState(null);
  const [fbrCache, setFbrCache] = useState(new Map()); // Cache for FBR results
  const [fbrServiceDown, setFbrServiceDown] = useState(false); // Track if FBR service is down

  // Check if all required fields are filled
  const isFormValid = () => {
    const {
      buyerNTNCNIC,
      buyerBusinessName,
      buyerProvince,
      buyerAddress,
      buyerRegistrationType,
      buyerPhoneNumber,
    } = formData;

    return !!(
      buyerNTNCNIC &&
      buyerBusinessName &&
      buyerProvince &&
      buyerAddress &&
      buyerRegistrationType &&
      buyerPhoneNumber
    );
  };

  const fbrFailed =
    fbrServiceDown ||
    (formData.buyerRegistrationType &&
      formData.buyerRegistrationType.includes("FBR API Issue"));

  // Reset form data when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset error and success states
      setErrorMessage("");
      setShowError(false);
      setIsSubmitting(false);
      setRetryCount(0);

      if (buyer) {
        // If editing an existing buyer, populate the form
        console.log("=== EDITING BUYER ===");
        console.log("Buyer data received:", buyer);

        // Reset checking states when editing
        setCheckingBuyerRegistration(false);
        setBuyerRegistrationHint("");
        setFbrServiceDown(false); // Reset service down flag when editing

        // Determine document type based on NTN/CNIC value
        const determineDocumentType = (ntnCnic) => {
          if (!ntnCnic) return "NTN";
          // If it's exactly 13 digits, it's likely CNIC
          if (/^\d{13}$/.test(ntnCnic)) return "CNIC";
          // Otherwise, assume it's NTN
          return "NTN";
        };

        const documentType = determineDocumentType(buyer.buyerNTNCNIC);
        console.log("Document type determined:", documentType);

        setFormData({
          buyerNTNCNIC: buyer.buyerNTNCNIC || "",
          buyerBusinessName: buyer.buyerBusinessName || "",
          buyerProvince: buyer.buyerProvince || "",
          buyerAddress: buyer.buyerAddress || "",
          buyerRegistrationType: buyer.buyerRegistrationType || "Unregistered",
          buyerPhoneNumber: buyer.buyerPhoneNumber || "",
          documentType: documentType,
        });
        console.log("Form data set with NTN/CNIC:", buyer.buyerNTNCNIC || "");
        console.log("Form data set with province:", buyer.buyerProvince || "");
        console.log("=== END EDITING BUYER ===");
      } else {
        // If adding a new buyer, reset the form to empty
        setFormData({
          buyerNTNCNIC: "",
          buyerBusinessName: "",
          buyerProvince: "",
          buyerAddress: "",
          buyerRegistrationType: "Unregistered", // Default value
          buyerPhoneNumber: "",
          documentType: "NTN",
        });
      }
    }
  }, [isOpen, buyer]);

  // Debug effect to monitor formData changes
  useEffect(() => {
    if (isOpen && buyer) {
      console.log("FormData changed:", formData);
    }
  }, [formData, isOpen, buyer]);

  // Enhanced function to fetch provinces with retry mechanism
  const handleFetchProvinces = async () => {
    setLoadingProvinces(true);
    setErrorMessage("");
    setShowError(false);

    try {
      // First, try to validate and refresh token if needed
      const tokenValid = await validateAndRefreshToken();

      if (!tokenValid && retryCount < maxRetries) {
        console.log(
          `Token validation failed, attempting retry ${retryCount + 1}/${maxRetries}`,
        );
        setRetryCount((prev) => prev + 1);

        // Wait a bit before retrying (exponential backoff)
        await wait(1000 * Math.pow(2, retryCount));

        // Try to fetch provinces again
        await handleFetchProvinces();
        return;
      }

      if (!tokenValid) {
        throw new Error(
          "Unable to load tokens after multiple attempts. Please refresh the page and try again.",
        );
      }

      const response = await fetchData("pdi/v1/provinces");
      console.log("Provinces fetched:", response);
      setProvinces(response);
      // Store in localStorage for other components to use
      localStorage.setItem("provinceResponse", JSON.stringify(response));
      setRetryCount(0); // Reset retry count on success
    } catch (error) {
      console.error("Error fetching provinces:", error);

      // If it's a token-related error and we haven't exceeded retries, try again
      if (
        (error.message.includes("token") || error.message.includes("Token")) &&
        retryCount < maxRetries
      ) {
        console.log(
          `Token error detected, attempting retry ${retryCount + 1}/${maxRetries}`,
        );
        setRetryCount((prev) => prev + 1);

        // Wait before retrying (exponential backoff)
        await wait(1000 * Math.pow(2, retryCount));

        // Try to fetch provinces again
        await handleFetchProvinces();
        return;
      }

      // Fallback: Try to load provinces from localStorage if API fails
      try {
        const cachedProvinces = localStorage.getItem("provinceResponse");
        if (cachedProvinces) {
          const parsedProvinces = JSON.parse(cachedProvinces);
          console.log(
            "Using cached provinces from localStorage:",
            parsedProvinces,
          );
          setProvinces(parsedProvinces);
          setErrorMessage(
            "Using cached province data. Some provinces may be outdated.",
          );
          // setShowError(true); // Don't show error if we have cached data to use
          return;
        }
      } catch (cacheError) {
        console.error("Error loading cached provinces:", cacheError);
      }

      setErrorMessage(
        error.message || "Failed to fetch provinces. Please try again.",
      );
      setShowError(true);
      setProvinces([]);
    } finally {
      setLoadingProvinces(false);
    }
  };

  // Auto-fetch provinces when modal opens and tokens are loaded
  useEffect(() => {
    if (isOpen && tokensLoaded && provinces.length === 0) {
      // Small delay to ensure everything is properly initialized
      const timer = setTimeout(() => {
        handleFetchProvinces();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isOpen, tokensLoaded]);

  // Additional effect to handle province loading when editing a buyer
  useEffect(() => {
    if (isOpen && buyer && buyer.buyerProvince && provinces.length === 0) {
      // If we're editing a buyer and provinces haven't loaded yet, try to load them
      // This ensures the province field shows the current value even if FBR API fails
      if (tokensLoaded) {
        const timer = setTimeout(() => {
          handleFetchProvinces();
        }, 300);

        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, buyer, buyer?.buyerProvince, provinces.length, tokensLoaded]);

  // Initialize provinces from cache when modal opens
  useEffect(() => {
    if (isOpen && provinces.length === 0) {
      // Try to load cached provinces first for immediate display
      try {
        const cachedProvinces = localStorage.getItem("provinceResponse");
        if (cachedProvinces) {
          const parsedProvinces = JSON.parse(cachedProvinces);
          console.log(
            "Loading cached provinces on modal open:",
            parsedProvinces,
          );
          setProvinces(parsedProvinces);
        }
      } catch (cacheError) {
        console.error(
          "Error loading cached provinces on modal open:",
          cacheError,
        );
      }
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // Special handling for NTN/CNIC field with restrictions
    if (name === "buyerNTNCNIC") {
      let restrictedValue = "";

      if (formData.documentType === "NTN") {
        // NTN: only alphanumeric characters, maximum 7 characters
        const cleanValue = value.replace(/[^a-zA-Z0-9]/g, "");
        restrictedValue = cleanValue.slice(0, 7);
      } else if (formData.documentType === "CNIC") {
        // CNIC: only numbers, exactly 13 digits
        const numbersOnly = value.replace(/[^0-9]/g, "");
        restrictedValue = numbersOnly.slice(0, 13);
      }

      setFormData((prev) => ({ ...prev, [name]: restrictedValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    // Don't proceed if already submitting
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Basic validation for required fields
      const {
        buyerNTNCNIC,
        buyerBusinessName,
        buyerProvince,
        buyerAddress,
        buyerRegistrationType,
        buyerPhoneNumber,
        documentType,
      } = formData;
      if (
        !buyerNTNCNIC ||
        !buyerBusinessName ||
        !buyerProvince ||
        !buyerAddress ||
        !buyerRegistrationType ||
        !buyerPhoneNumber
      ) {
        throw new Error("Please fill in all required fields.");
      }

      // Validate NTN/CNIC length based on document type
      if (documentType === "NTN" && buyerNTNCNIC.length !== 7) {
        throw new Error("NTN must be exactly 7 characters long.");
      }
      if (documentType === "CNIC" && buyerNTNCNIC.length !== 13) {
        throw new Error("CNIC must be exactly 13 characters long.");
      }

      // Validate phone number format if provided
      if (formData.buyerPhoneNumber && formData.buyerPhoneNumber.trim()) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/;
        if (!phoneRegex.test(formData.buyerPhoneNumber.trim())) {
          throw new Error(
            "Please enter a valid phone number (10-15 digits with optional +, spaces, hyphens, or parentheses).",
          );
        }
      }

      // Proceed with saving - exclude documentType as it's only for frontend logic
      const { documentType: _, ...dataToSave } = formData;
      console.log("Saving buyer data:", dataToSave);
      onSave(dataToSave);
    } catch (error) {
      console.error("Error during save process:", error);

      // Show error message to user
      setErrorMessage(error.message || "Error saving buyer. Please try again.");
      setShowError(true);

      // Don't close modal on error - let user fix the issue
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
  };

  const checkBuyerRegistration = async (registrationNo) => {
    console.log("checkBuyerRegistration() -> registrationNo:", registrationNo);
    if (!registrationNo) return;

    // If service is known to be down, don't attempt API call
    if (fbrServiceDown) {
      setBuyerRegistrationHint(
        "FBR API issue - service unavailable. Please set registration type manually.",
      );
      setFormData((prev) => ({
        ...prev,
        buyerRegistrationType: "FBR API Issue - Service Unavailable",
      }));
      return;
    }

    // Check cache first
    const cacheKey = registrationNo.trim();
    if (fbrCache.has(cacheKey)) {
      const cachedResult = fbrCache.get(cacheKey);
      console.log("Using cached FBR result:", cachedResult);

      setFormData((prev) => ({
        ...prev,
        buyerRegistrationType: cachedResult.registrationType,
      }));

      setBuyerRegistrationHint(
        cachedResult.registrationType === "Registered" ? "" : "",
      );
      return;
    }

    try {
      setCheckingBuyerRegistration(true);
      setBuyerRegistrationHint("");

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      const response = await fetch(
        "https://amggarments.inplsoftwares.com/api/buyer-check",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ registrationNo }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      console.log(
        "FBR buyer check response status:",
        response.status,
        "ok:",
        response.ok,
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json().catch(() => ({}));

      console.log("FBR buyer check parsed data:", data);

      let derivedRegistrationType = "Unregistered"; // Default to Unregistered

      if (data && typeof data.REGISTRATION_TYPE === "string") {
        derivedRegistrationType =
          data.REGISTRATION_TYPE.toLowerCase() === "registered"
            ? "Registered"
            : "Unregistered";
      } else if (data) {
        let isRegistered = false;
        if (typeof data === "boolean") {
          isRegistered = data;
        } else {
          isRegistered =
            data.isRegistered === true ||
            data.registered === true ||
            (typeof data.status === "string" &&
              data.status.toLowerCase() === "registered") ||
            (typeof data.registrationType === "string" &&
              data.registrationType.toLowerCase() === "registered");
        }
        derivedRegistrationType = isRegistered ? "Registered" : "Unregistered";
      }

      // Cache the result for future use
      setFbrCache((prev) =>
        new Map(prev).set(cacheKey, {
          registrationType: derivedRegistrationType,
          timestamp: Date.now(),
        }),
      );

      setFormData((prev) => ({
        ...prev,
        buyerRegistrationType: derivedRegistrationType,
      }));

      setBuyerRegistrationHint(
        derivedRegistrationType === "Registered" ? "" : "",
      );
    } catch (err) {
      console.error("Buyer registration check failed:", err);

      // Mark service as down if we get 503 or 500 errors
      if (
        err.message.includes("503") ||
        err.message.includes("500") ||
        err.message.includes("Upstream request failed")
      ) {
        setFbrServiceDown(true);
        console.log("FBR service marked as down due to server errors");
      }

      let errorMessage = "FBR API issue - service unavailable.";
      let registrationTypeError = "FBR API Issue - Service Unavailable";

      if (err.name === "AbortError") {
        errorMessage = "FBR API issue - check timed out.";
        registrationTypeError = "FBR API Issue - Timeout";
      } else if (err.message.includes("Failed to fetch")) {
        errorMessage = "FBR API issue - service unavailable.";
        registrationTypeError = "FBR API Issue - Service Unavailable";
      } else if (err.message.includes("503")) {
        errorMessage = "FBR API issue - service temporarily unavailable.";
        registrationTypeError = "FBR API Issue - Service Unavailable";
      } else if (err.message.includes("500")) {
        errorMessage = "FBR API issue - server error.";
        registrationTypeError = "FBR API Issue - Server Error";
      }

      setBuyerRegistrationHint(errorMessage);

      // Show the specific error in the registration type field
      setFormData((prev) => ({
        ...prev,
        buyerRegistrationType: registrationTypeError,
      }));
    } finally {
      setCheckingBuyerRegistration(false);
    }
  };

  // Clear NTN/CNIC field when document type changes (only for new buyers, not when editing)
  useEffect(() => {
    if (isOpen && !buyer) {
      setFormData((prev) => ({ ...prev, buyerNTNCNIC: "" }));
      setBuyerRegistrationHint("");
    }
  }, [formData.documentType, isOpen, buyer]);

  // Clean up old cache entries (older than 1 hour) and reset service down flag
  useEffect(() => {
    const cleanupCache = () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      setFbrCache((prev) => {
        const newCache = new Map();
        for (const [key, value] of prev) {
          if (value.timestamp > oneHourAgo) {
            newCache.set(key, value);
          }
        }
        return newCache;
      });
    };

    const resetServiceDown = () => {
      setFbrServiceDown(false);
      console.log("FBR service down flag reset - attempting to reconnect");
    };

    const interval = setInterval(cleanupCache, 30 * 60 * 1000); // Clean every 30 minutes
    const serviceResetInterval = setInterval(resetServiceDown, 5 * 60 * 1000); // Reset service down flag every 5 minutes

    return () => {
      clearInterval(interval);
      clearInterval(serviceResetInterval);
    };
  }, []);

  // API call when NTN/CNIC reaches correct length (7 for NTN, 13 for CNIC)
  // Check FBR for both new buyers and when editing existing buyers
  useEffect(() => {
    if (!isOpen) return;
    const value = (formData.buyerNTNCNIC || "").trim();
    if (ntnDebounceTimer) clearTimeout(ntnDebounceTimer);
    if (!value) return;

    // Only check if the value has reached the correct length
    const isCorrectLength =
      (formData.documentType === "NTN" && value.length === 7) ||
      (formData.documentType === "CNIC" && value.length === 13);

    if (!isCorrectLength) return;

    const id = setTimeout(() => {
      console.log("Length reached -> checking buyer with:", value);
      checkBuyerRegistration(value);
    }, 500); // Reduced delay since we're only calling when length is correct
    setNtnDebounceTimer(id);
    return () => clearTimeout(id);
  }, [formData.buyerNTNCNIC, formData.documentType, isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <Snackbar
        open={showError}
        autoHideDuration={6000}
        onClose={() => setShowError(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setShowError(false)}
          severity="error"
          sx={{
            width: "100%",
            backgroundColor: "rgba(255, 245, 245, 0.9)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(255, 0, 0, 0.1)",
            color: "#d32f2f",
          }}
        >
          {errorMessage}
        </Alert>
      </Snackbar>

      {/* Animated liquid background */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 1299,
          background: `
            radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(119, 167, 255, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.3) 0%, transparent 50%)
          `,
          animation: "liquidFloat 6s ease-in-out infinite alternate",
          "@keyframes liquidFloat": {
            "0%": {
              transform: "scale(1) rotate(0deg)",
            },
            "100%": {
              transform: "scale(1.1) rotate(2deg)",
            },
          },
        }}
      />

      {/* Main modal backdrop */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(8px)",
          zIndex: 1300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: { xs: 1, sm: 2 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            width: { xs: "95%", sm: "80%", md: "60%", lg: "50%" },
            maxWidth: { xs: "100%", sm: 450, md: 500 },
            maxHeight: { xs: "80vh", sm: "95vh" },
            borderRadius: { xs: 2, sm: 3 },
            position: "relative",
            // Frosted glass effect like Apple notifications
            backgroundColor: "rgba(255, 255, 255, 0.55)",
            backdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: `
              0 8px 32px rgba(0, 0, 0, 0.12),
              0 2px 8px rgba(0, 0, 0, 0.08),
              inset 0 1px 0 rgba(255, 255, 255, 0.6)
            `,
            // Smooth entrance animation
            animation: "modalSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            "@keyframes modalSlideUp": {
              "0%": {
                opacity: 0,
                transform: "translateY(30px) scale(0.95)",
              },
              "100%": {
                opacity: 1,
                transform: "translateY(0) scale(1)",
              },
            },
          }}
        >
          {/* Close button with hover effect */}
          <IconButton
            onClick={onClose}
            sx={{
              position: "absolute",
              top: { xs: 8, sm: 12 },
              right: { xs: 8, sm: 12 },
              backgroundColor: "rgba(0, 0, 0, 0.05)",
              color: "#666",
              width: { xs: 28, sm: 32 },
              height: { xs: 28, sm: 32 },
              zIndex: 1,
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.1)",
                transform: "scale(1.1)",
              },
              transition: "all 0.2s ease-in-out",
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          {/* Title with modern typography */}
          <Typography
            variant="h5"
            fontWeight={600}
            align="center"
            gutterBottom
            sx={{
              color: "#1a1a1a",
              mt: { xs: 0.5, sm: 1 },
              mb: { xs: 1.5, sm: 2 },
              letterSpacing: "-0.02em",
              fontSize: { xs: "1.1rem", sm: "1.3rem" },
            }}
          >
            {buyer ? "Edit Buyer" : "Add Buyer"}
          </Typography>

          {/* Form container */}
          <Box
            component="form"
            noValidate
            onSubmit={handleSave}
            sx={{ width: "100%" }}
          >
            <Stack spacing={{ xs: 1, sm: 1.5 }}>
              {/* Document Type Radio Buttons */}
              <FormControl component="fieldset">
                <RadioGroup
                  row
                  name="documentType"
                  value={formData.documentType}
                  onChange={handleChange}
                  sx={{
                    "& .MuiFormControlLabel-root": {
                      marginRight: 2,
                    },
                    "& .MuiRadio-root": {
                      color: "rgba(0, 122, 255, 0.6)",
                      "&.Mui-checked": {
                        color: "#007AFF",
                      },
                    },
                    "& .MuiFormControlLabel-label": {
                      color: "#1a1a1a",
                      fontWeight: 400,
                      fontSize: "0.875rem",
                    },
                  }}
                >
                  <FormControlLabel
                    value="NTN"
                    control={<Radio size="small" />}
                    label="NTN"
                  />
                  <FormControlLabel
                    value="CNIC"
                    control={<Radio size="small" />}
                    label="CNIC"
                  />
                </RadioGroup>
              </FormControl>

              {/* Modern text fields with frosted styling */}
              <TextField
                label="NTN/CNIC"
                name="buyerNTNCNIC"
                value={formData.buyerNTNCNIC}
                onChange={(e) => {
                  console.log("NTN/CNIC onChange:", e.target.value);
                  handleChange(e);
                }}
                onBlur={(e) => {
                  console.log("NTN/CNIC onBlur ->", e.target.value);
                  // Check registration for both new and existing buyers
                  checkBuyerRegistration(e.target.value?.trim());
                }}
                fullWidth
                required
                variant="outlined"
                placeholder="Enter NTN/CNIC"
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    backdropFilter: "blur(10px)",
                    borderRadius: 2,
                    "& fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                      borderWidth: 1,
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.2)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#007AFF",
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#1a1a1a",
                    fontWeight: 500,
                  },
                  "& .MuiOutlinedInput-input": {
                    color: "#1a1a1a",
                    fontWeight: 400,
                  },
                }}
                helperText={
                  checkingBuyerRegistration ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        color: "#007AFF",
                      }}
                    >
                      <CircularProgress size={14} sx={{ color: "#007AFF" }} />
                      <span>Checking registration from FBR...</span>
                    </Box>
                  ) : (
                    buyerRegistrationHint ||
                    `${formData.documentType === "NTN" ? "NTN: Max 7 alphanumeric characters" : "CNIC: Exactly 13 numbers only"} (${formData.buyerNTNCNIC.length}/${formData.documentType === "NTN" ? "7" : "13"})`
                  )
                }
              />

              <TextField
                label="Business Name"
                name="buyerBusinessName"
                value={formData.buyerBusinessName}
                onChange={handleChange}
                fullWidth
                required
                variant="outlined"
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    backdropFilter: "blur(10px)",
                    borderRadius: 2,
                    "& fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.2)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#007AFF",
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#1a1a1a",
                    fontWeight: 500,
                  },
                  "& .MuiOutlinedInput-input": {
                    color: "#1a1a1a",
                  },
                }}
              />

              {/* Province section with Get Province button */}
              <Box>
                <FormControl
                  fullWidth
                  required
                  size="small"
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.6)",
                      backdropFilter: "blur(10px)",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.12)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.2)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#007AFF",
                        borderWidth: 2,
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "#1a1a1a",
                      fontWeight: 500,
                    },
                    "& .MuiSelect-select": {
                      color: "#1a1a1a",
                    },
                  }}
                >
                  <InputLabel id="buyerProvince-label">Province</InputLabel>
                  <Select
                    labelId="buyerProvince-label"
                    name="buyerProvince"
                    value={formData.buyerProvince}
                    label="Province"
                    onChange={handleChange}
                    disabled={loadingProvinces}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          backgroundColor: "rgba(255, 255, 255, 0.9)",
                          backdropFilter: "blur(20px)",
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                          borderRadius: 2,
                          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
                          maxHeight: "150px",
                        },
                      },
                    }}
                  >
                    {/* Debug info */}
                    {console.log(
                      "Province dropdown - formData.buyerProvince:",
                      formData.buyerProvince,
                    )}
                    {console.log("Province dropdown - provinces:", provinces)}
                    {console.log(
                      "Province dropdown - provinces length:",
                      provinces.length,
                    )}

                    {/* Show current province value if it exists and is not in the FBR list */}
                    {formData.buyerProvince &&
                      !provinces.some(
                        (p) => p.stateProvinceDesc === formData.buyerProvince,
                      ) && (
                        <MenuItem
                          value={formData.buyerProvince}
                          sx={{
                            color: "#1a1a1a",
                            backgroundColor: "rgba(0, 122, 255, 0.05)",
                            "&:hover": {
                              backgroundColor: "rgba(0, 122, 255, 0.1)",
                            },
                          }}
                        >
                          {formData.buyerProvince} (Current)
                        </MenuItem>
                      )}

                    {/* Add standard uppercase provinces for consistency */}
                    {[
                      "BALOCHISTAN",
                      "AZAD JAMMU AND KASHMIR",
                      "CAPITAL TERRITORY",
                      "PUNJAB",
                      "KHYBER PAKHTUNKHWA",
                      "GILGIT BALTISTAN",
                      "SINDH",
                    ].map((province) => (
                      <MenuItem
                        key={province}
                        value={province}
                        sx={{
                          color: "#1a1a1a",
                          "&:hover": {
                            backgroundColor: "rgba(0, 122, 255, 0.1)",
                          },
                        }}
                      >
                        {province}
                      </MenuItem>
                    ))}

                    {provinces.length === 0 ? (
                      <MenuItem disabled>
                        {loadingProvinces
                          ? `Loading provinces...${retryCount > 0 ? ` (Retry ${retryCount}/${maxRetries})` : ""}`
                          : "No provinces available"}
                      </MenuItem>
                    ) : (
                      provinces.map((province) => (
                        <MenuItem
                          key={province.stateProvinceCode}
                          value={province.stateProvinceDesc}
                          sx={{
                            color: "#1a1a1a",
                            "&:hover": {
                              backgroundColor: "rgba(0, 122, 255, 0.1)",
                            },
                          }}
                        >
                          {province.stateProvinceDesc}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>

                {/* Fallback text field to show current province when dropdown is empty */}
                {formData.buyerProvince &&
                  provinces.length === 0 &&
                  !loadingProvinces && (
                    <TextField
                      label="Current Province (Read-only)"
                      value={formData.buyerProvince}
                      fullWidth
                      size="small"
                      disabled
                      sx={{
                        mt: 1,
                        "& .MuiOutlinedInput-root": {
                          backgroundColor: "rgba(255, 255, 255, 0.4)",
                          "& fieldset": {
                            borderColor: "rgba(0, 122, 255, 0.3)",
                          },
                        },
                        "& .MuiInputLabel-root": {
                          color: "rgba(0, 122, 255, 0.7)",
                        },
                      }}
                      helperText="Province data is currently unavailable. Your current province value is preserved."
                    />
                  )}

                {/* Get Province Button */}
                <Button
                  onClick={handleFetchProvinces}
                  disabled={loadingProvinces}
                  variant="outlined"
                  size="small"
                  sx={{
                    mt: 0.5,
                    color: "#007AFF",
                    borderColor: "#007AFF",
                    backgroundColor: "rgba(0, 122, 255, 0.05)",
                    fontWeight: 500,
                    fontSize: "12px",
                    py: 0.3,
                    px: 1.5,
                    borderRadius: 1.5,
                    textTransform: "none",
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
                  {loadingProvinces ? (
                    <>
                      <CircularProgress
                        size={14}
                        sx={{ mr: 0.5, color: "#007AFF" }}
                      />
                      {retryCount > 0
                        ? `Retrying... (${retryCount}/${maxRetries})`
                        : "Getting Provinces..."}
                    </>
                  ) : (
                    "Get Provinces"
                  )}
                </Button>
              </Box>

              <TextField
                label="Address"
                name="buyerAddress"
                value={formData.buyerAddress}
                onChange={handleChange}
                fullWidth
                required
                variant="outlined"
                multiline
                rows={2}
                size="small"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    backdropFilter: "blur(10px)",
                    borderRadius: 2,
                    "& fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.2)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#007AFF",
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#1a1a1a",
                    fontWeight: 500,
                  },
                  "& .MuiOutlinedInput-input": {
                    color: "#1a1a1a",
                  },
                }}
              />

              {/* Phone Number and Registration Type in a row */}
              <Box sx={{ display: "flex", gap: 1.5 }}>
                {/* Phone Number Field */}
                <TextField
                  label="Phone Number"
                  name="buyerPhoneNumber"
                  value={formData.buyerPhoneNumber}
                  onChange={handleChange}
                  variant="outlined"
                  size="small"
                  required
                  placeholder="Enter phone number"
                  sx={{
                    flex: 1,
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.6)",
                      backdropFilter: "blur(10px)",
                      borderRadius: 2,
                      "& fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.12)",
                      },
                      "&:hover fieldset": {
                        borderColor: "rgba(0, 0, 0, 0.2)",
                      },
                      "&.Mui-focused fieldset": {
                        borderColor: "#007AFF",
                        borderWidth: 2,
                      },
                    },
                    "& .MuiInputLabel-root": {
                      color: "#1a1a1a",
                      fontWeight: 500,
                    },
                    "& .MuiOutlinedInput-input": {
                      color: "#1a1a1a",
                    },
                  }}
                />

                {/* Registration Type Section */}
                <Box sx={{ flex: 1 }}>
                  {/* Registration Type - Auto-filled by API */}
                  <TextField
                    label="Registration Type"
                    value={
                      checkingBuyerRegistration
                        ? "Checking FBR..."
                        : formData.buyerRegistrationType ||
                        "Will be auto-filled from FBR"
                    }
                    disabled
                    size="small"
                    fullWidth
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        backgroundColor: checkingBuyerRegistration
                          ? "rgba(0, 122, 255, 0.05)"
                          : "rgba(255, 255, 255, 0.4)",
                        backdropFilter: "blur(10px)",
                        borderRadius: 2,
                        "& fieldset": {
                          borderColor: checkingBuyerRegistration
                            ? "rgba(0, 122, 255, 0.3)"
                            : "rgba(0, 0, 0, 0.12)",
                        },
                        "&:hover fieldset": {
                          borderColor: checkingBuyerRegistration
                            ? "rgba(0, 122, 255, 0.5)"
                            : "rgba(0, 0, 0, 0.2)",
                        },
                      },
                      "& .MuiInputLabel-root": {
                        color: checkingBuyerRegistration
                          ? "#007AFF"
                          : "#1a1a1a",
                        fontWeight: 500,
                      },
                      "& .MuiOutlinedInput-input": {
                        color: checkingBuyerRegistration
                          ? "#007AFF"
                          : "#1a1a1a",
                        fontWeight: 500,
                      },
                    }}
                    InputProps={{
                      endAdornment: checkingBuyerRegistration ? (
                        <CircularProgress size={20} sx={{ color: "#007AFF" }} />
                      ) : null,
                    }}
                    helperText={
                      checkingBuyerRegistration
                        ? "Verifying registration status with FBR..."
                        : buyerRegistrationHint || ""
                    }
                  />

                  {/* FBR check buttons - positioned below the field like Get Provinces */}
                  {formData.buyerNTNCNIC && !checkingBuyerRegistration && (
                    <Button
                      onClick={() => {
                        setFbrServiceDown(false); // Reset service down flag
                        checkBuyerRegistration(formData.buyerNTNCNIC);
                      }}
                      disabled={checkingBuyerRegistration}
                      variant="outlined"
                      size="small"
                      sx={{
                        mt: 0.5,
                        color: "#007AFF",
                        borderColor: "#007AFF",
                        backgroundColor: "rgba(0, 122, 255, 0.05)",
                        fontWeight: 500,
                        fontSize: "12px",
                        py: 0.3,
                        px: 1.5,
                        borderRadius: 1.5,
                        textTransform: "none",
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
                      {buyerRegistrationHint &&
                        (buyerRegistrationHint.includes("unavailable") ||
                          buyerRegistrationHint.includes("FBR API issue"))
                        ? "Retry FBR Check"
                        : "Check FBR Registration"}
                    </Button>
                  )}
                </Box>
              </Box>

              {/* Action buttons with modern styling */}
              <Stack spacing={1} sx={{ mt: { xs: 1, sm: 1.5 } }}>
                {(isSubmitting ||
                  !isFormValid() ||
                  (!checkingBuyerRegistration && !fbrFailed)) && (
                    <Button
                      type="submit"
                      variant="contained"
                      fullWidth
                      disabled={isSubmitting || !isFormValid()}
                      size="small"
                      sx={{
                        backgroundColor: "#007AFF",
                        color: "white",
                        fontWeight: 600,
                        fontSize: { xs: "13px", sm: "14px" },
                        py: { xs: 0.8, sm: 1 },
                        borderRadius: 2,
                        textTransform: "none",
                        boxShadow: "0 4px 20px rgba(0, 122, 255, 0.3)",
                        "&:hover": {
                          backgroundColor: "#0056CC",
                          transform: "translateY(-1px)",
                          boxShadow: "0 6px 25px rgba(0, 122, 255, 0.4)",
                        },
                        "&:disabled": {
                          backgroundColor: isSubmitting
                            ? "rgba(0, 122, 255, 0.6)"
                            : "rgba(0, 0, 0, 0.12)",
                          color: isSubmitting ? "white" : "rgba(0, 0, 0, 0.26)",
                        },
                        transition: "all 0.2s ease-in-out",
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <CircularProgress
                            size={18}
                            sx={{ mr: 1, color: "white" }}
                          />
                          Saving...
                        </>
                      ) : !isFormValid() ? (
                        "Fill Required Fields"
                      ) : (
                        "Save"
                      )}
                    </Button>
                  )}
              </Stack>
            </Stack>
          </Box>
        </Paper>
      </Box>
    </>
  );
};

export default BuyerModal;
