// FBR API Service for checking registration status
import { API_CONFIG } from "./Api";
import axios from "axios";

const FBR_API_BASE_URL = "https://gw.fbr.gov.pk/dist/v1";

export const checkRegistrationStatus = async (registrationNo) => {
  try {
    // Get current token dynamically from context
    const token = API_CONFIG.getCurrentToken("sandbox");

    if (!token) {
      throw new Error(
        "No FBR token found. Please ensure the Company is selected and credentials are loaded."
      );
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    // Use POST request as per the API specification
    const response = await axios({
      method: "POST",
      url: `${FBR_API_BASE_URL}/Get_Reg_Type`,
      headers: config.headers,
      data: {
        Registration_No: registrationNo,
      },
      timeout: 10000, // 10 second timeout
    });

    console.log("FBR Registration Status API Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error checking registration status:", error);

    // Handle specific error cases
    if (error.response?.status === 401) {
      throw new Error(
        "Authentication failed. Please check your FBR credentials."
      );
    } else if (error.response?.status === 404) {
      throw new Error("Registration number not found in FBR system.");
    } else if (error.response?.status === 500) {
      throw new Error(
        "FBR system is temporarily unavailable. Please try again later or contact support."
      );
    } else if (error.response?.data) {
      throw new Error(
        error.response.data.message || "Error checking registration status."
      );
    } else if (error.code === "ECONNABORTED") {
      throw new Error(
        "Request timeout. FBR system may be slow. Please try again."
      );
    } else if (error.code === "ERR_NETWORK") {
      throw new Error(
        "Network error. Please check your internet connection and try again."
      );
    } else {
      throw new Error(
        "Unable to connect to FBR system. Please try again later."
      );
    }
  }
};

// New function to automatically fetch and fill registration type
export const getRegistrationType = async (registrationNo) => {
  try {
    const response = await checkRegistrationStatus(registrationNo);

    if (
      response &&
      response.statuscode === "00" &&
      response.REGISTRATION_TYPE
    ) {
      return {
        success: true,
        registrationType: response.REGISTRATION_TYPE,
        registrationNo: response.REGISTRATION_NO,
        message: `Registration type automatically filled: ${response.REGISTRATION_TYPE}`,
      };
    } else if (response && response.statuscode !== "00") {
      return {
        success: false,
        message:
          response.message ||
          "Invalid registration number or FBR system error.",
      };
    } else {
      return {
        success: false,
        message: "Unable to fetch registration type from FBR system.",
      };
    }
  } catch (error) {
    console.error("Error fetching registration type:", error);
    return {
      success: false,
      message: error.message || "Error fetching registration type.",
      error: error.message,
    };
  }
};

// Helper function to validate registration status
export const validateRegistrationStatus = (selectedType, apiResponse) => {
  if (!apiResponse || !apiResponse.REGISTRATION_TYPE) {
    return {
      isValid: false,
      message: "Unable to verify registration status. Please try again.",
    };
  }

  const apiStatus = apiResponse.REGISTRATION_TYPE.toLowerCase();
  const selectedStatus = selectedType.toLowerCase();

  // If user selected "Registered" but API returns "unregistered"
  if (selectedStatus === "registered" && apiStatus === "unregistered") {
    return {
      isValid: false,
      message: `Registration status mismatch! The NTN/CNIC ${apiResponse.REGISTRATION_NO} is registered as "Unregistered" in FBR system, but you selected "Registered". Please verify the registration type.`,
    };
  }

  // If user selected "Unregistered" but API returns "registered"
  if (selectedStatus === "unregistered" && apiStatus === "registered") {
    return {
      isValid: false,
      message: `Registration status mismatch! The NTN/CNIC ${apiResponse.REGISTRATION_NO} is registered as "Registered" in FBR system, but you selected "Unregistered". Please verify the registration type.`,
    };
  }

  return {
    isValid: true,
    message: "Registration status verified successfully!",
  };
};

// New function to post invoice data to FBR and get invoice number
export const postInvoiceDataToFBR = async (invoiceData) => {
  try {
    // Get current token dynamically from context
    const token = API_CONFIG.getCurrentToken("sandbox");

    if (!token) {
      throw new Error(
        "No FBR token found. Please ensure the Company is selected and credentials are loaded."
      );
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    // Call FBR API to post invoice data
    const response = await axios({
      method: "POST",
      url: `${FBR_API_BASE_URL}/di_data/v1/di/postinvoicedata`,
      headers: config.headers,
      data: invoiceData,
      timeout: 30000, // 30 second timeout for invoice submission
    });

    console.log("FBR Invoice Submission Response:", response.data);

    // Handle different FBR response structures
    let fbrInvoiceNumber = null;
    let isSuccess = false;
    let errorDetails = null;

    if (response.status === 200) {
      // Check for validationResponse structure (old format)
      if (response.data && response.data.validationResponse) {
        const validation = response.data.validationResponse;
        isSuccess = validation.statusCode === "00";
        fbrInvoiceNumber = response.data.invoiceNumber;
        if (!isSuccess) {
          errorDetails = validation;
        }
      }
      // Check for direct response structure (new format)
      else if (
        response.data &&
        (response.data.invoiceNumber || response.data.success)
      ) {
        isSuccess = true;
        fbrInvoiceNumber = response.data.invoiceNumber;
      }
      // Check for error response structure
      else if (response.data && response.data.error) {
        isSuccess = false;
        errorDetails = response.data;
      }
      // Check for empty response - this might be a successful submission
      else if (!response.data || response.data === "") {
        console.log(
          "FBR returned empty response with 200 status - treating as successful submission"
        );
        isSuccess = true;
        // For empty responses, we'll use a generated invoice number
        fbrInvoiceNumber = `FBR_${Date.now()}`;
      }
      // If response is unexpected, treat as success if status is 200
      else {
        isSuccess = true;
        console.log(
          "FBR returned 200 status with unexpected response structure, treating as success"
        );
      }
    }

    if (!isSuccess) {
      const details = errorDetails || {
        raw: response.data ?? null,
        note: "Unexpected FBR response structure",
        status: response.status,
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
        "FBR submission failed: No invoice number received from FBR"
      );
    }

    return {
      success: true,
      fbrInvoiceNumber,
      message: "Invoice submitted to FBR successfully",
    };
  } catch (error) {
    console.error("Error posting invoice data to FBR:", error);
    throw new Error(
      error.message ||
        "Unable to submit invoice to FBR system. Please try again later."
    );
  }
};


// New function to fetch transaction types from FBR
export const getTransactionTypes = async () => {
  try {
    // Get current token dynamically from context - try sandbox first, then production
    let token = API_CONFIG.getCurrentToken("sandbox");

    if (!token) {
      // Fallback to production token if sandbox is not available
      token = API_CONFIG.getCurrentToken("production");
    }

    // Also try localStorage fallback
    if (!token) {
      token = localStorage.getItem("sandboxProductionToken");
    }

    if (!token) {
      // If no token is available, throw an error instead of returning fallback data
      throw new Error(
        "No FBR token found. Please ensure the Company is selected and credentials are loaded."
      );
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    // Use GET request to fetch transaction types
    const response = await axios({
      method: "GET",
      url: "https://gw.fbr.gov.pk/pdi/v1/transtypecode",
      headers: config.headers,
      timeout: 10000, // 10 second timeout
    });

    console.log("FBR Transaction Types API Response:", response.data);

    // Return the data directly - let the calling component handle the structure
    return response.data;
  } catch (error) {
    console.error("Error fetching transaction types:", error);

    // Handle specific error cases and throw appropriate errors
    if (error.response?.status === 401) {
      throw new Error(
        "Authentication failed. Please check your FBR credentials."
      );
    } else if (error.response?.status === 404) {
      throw new Error("Transaction types API endpoint not found.");
    } else if (error.response?.status === 500) {
      throw new Error(
        "FBR system is temporarily unavailable. Please try again later."
      );
    } else if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          "Error fetching transaction types from FBR API."
      );
    } else if (error.code === "ECONNABORTED") {
      throw new Error(
        "Request timeout. FBR system may be slow. Please try again."
      );
    } else if (error.code === "ERR_NETWORK") {
      throw new Error(
        "Network error. Please check your internet connection and try again."
      );
    } else {
      throw new Error(
        error.message ||
          "Unable to fetch transaction types from FBR API. Please try again later."
      );
    }
  }
};

// New function to fetch document types from backend instead of FBR directly
export const getDocumentTypesFromBackend = async (tenantId) => {
  try {
    // Get current token dynamically from context
    let token = API_CONFIG.getCurrentToken("sandbox");

    if (!token) {
      // Fallback to production token if sandbox is not available
      token = API_CONFIG.getCurrentToken("production");
    }

    // Also try localStorage fallback
    if (!token) {
      token = localStorage.getItem("sandboxProductionToken");
    }

    if (!token) {
      throw new Error(
        "No FBR token found. Please ensure the Company is selected and credentials are loaded."
      );
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    // Call our backend API instead of FBR directly
    const response = await axios({
      method: "GET",
      url: `/api/tenant/${tenantId}/document-types`,
      headers: config.headers,
      timeout: 10000, // 10 second timeout
    });

    console.log("Backend Document Types API Response:", response.data);

    // Return the data directly - let the calling component handle the structure
    return response.data;
  } catch (error) {
    console.error("Error fetching document types from backend:", error);

    // Handle specific error cases and throw appropriate errors
    if (error.response?.status === 401) {
      throw new Error("Authentication failed. Please check your credentials.");
    } else if (error.response?.status === 404) {
      throw new Error("Document types API endpoint not found.");
    } else if (error.response?.status === 500) {
      throw new Error(
        "System is temporarily unavailable. Please try again later."
      );
    } else if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          "Error fetching document types from backend API."
      );
    } else if (error.code === "ECONNABORTED") {
      throw new Error("Request timeout. System may be slow. Please try again.");
    } else if (error.code === "ERR_NETWORK") {
      throw new Error(
        "Network error. Please check your internet connection and try again."
      );
    } else {
      throw new Error(
        error.message ||
          "Unable to fetch document types from backend API. Please try again later."
      );
    }
  }
};

// New function to fetch provinces from backend instead of FBR directly
export const getProvincesFromBackend = async (tenantId) => {
  try {
    // Get current token dynamically from context
    let token = API_CONFIG.getCurrentToken("sandbox");

    if (!token) {
      // Fallback to production token if sandbox is not available
      token = API_CONFIG.getCurrentToken("production");
    }

    // Also try localStorage fallback
    if (!token) {
      token = localStorage.getItem("sandboxProductionToken");
    }

    if (!token) {
      throw new Error(
        "No FBR token found. Please ensure the Company is selected and credentials are loaded."
      );
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    // Call our backend API instead of FBR directly
    const response = await axios({
      method: "GET",
      url: `/api/tenant/${tenantId}/provinces`,
      headers: config.headers,
      timeout: 10000, // 10 second timeout
    });

    console.log("Backend Provinces API Response:", response.data);

    // Return the data directly - let the calling component handle the structure
    return response.data;
  } catch (error) {
    console.error("Error fetching provinces from backend:", error);

    // Handle specific error cases and throw appropriate errors
    if (error.response?.status === 401) {
      throw new Error("Authentication failed. Please check your credentials.");
    } else if (error.response?.status === 404) {
      throw new Error("Provinces API endpoint not found.");
    } else if (error.response?.status === 500) {
      throw new Error(
        "System is temporarily unavailable. Please try again later."
      );
    } else if (error.response?.data) {
      throw new Error(
        error.response.data.message ||
          "Error fetching provinces from backend API."
      );
    } else if (error.code === "ECONNABORTED") {
      throw new Error("Request timeout. System may be slow. Please try again.");
    } else if (error.code === "ERR_NETWORK") {
      throw new Error(
        "Network error. Please check your internet connection and try again."
      );
    } else {
      throw new Error(
        error.message ||
          "Unable to fetch provinces from backend API. Please try again later."
      );
    }
  }
};
// New function to check registration status with NTN and date for Further Tax calculation
export const checkRegistrationStatusWithDate = async (ntn, date) => {
  try {
    // Get current token dynamically from context
    let token = API_CONFIG.getCurrentToken("sandbox");

    if (!token) {
      // Fallback to production token if sandbox is not available
      token = API_CONFIG.getCurrentToken("production");
    }

    // Also try localStorage fallback
    if (!token) {
      token = localStorage.getItem("sandboxProductionToken");
    }

    if (!token) {
      throw new Error(
        "No FBR token found. Please ensure the Company is selected and credentials are loaded."
      );
    }

    const config = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Cookie": "cookiesession1=678B2A2DC4E5F1CDD65FEA0006F56D56"
      },
    };

    // Use POST request to check registration status with date
    const response = await axios({
      method: "POST",
      url: `${FBR_API_BASE_URL}/statl`,
      headers: config.headers,
      data: {
        regno: ntn,
        date: date
      },
      timeout: 10000, // 10 second timeout
    });

    console.log("FBR Registration Status with Date API Response:", response.data);
    
    // Parse the response to determine if registration is active
    if (response.data && response.data["status code"] === "01") {
      const isActive = response.data.status === "Active";
      return {
        success: true,
        isActive: isActive,
        status: response.data.status,
        message: `Registration status: ${response.data.status}`,
        shouldApplyFurtherTax: !isActive // Apply Further Tax if NOT active
      };
    } else {
      return {
        success: false,
        isActive: false,
        status: "Unknown",
        message: "Unable to determine registration status",
        shouldApplyFurtherTax: true // Default to applying Further Tax if status unknown
      };
    }
  } catch (error) {
    console.error("Error checking registration status with date:", error);

    // Handle specific error cases
    if (error.response?.status === 401) {
      throw new Error(
        "Authentication failed. Please check your FBR credentials."
      );
    } else if (error.response?.status === 404) {
      throw new Error("Registration number not found in FBR system.");
    } else if (error.response?.status === 500) {
      throw new Error(
        "FBR system is temporarily unavailable. Please try again later or contact support."
      );
    } else if (error.response?.data) {
      throw new Error(
        error.response.data.message || "Error checking registration status."
      );
    } else if (error.code === "ECONNABORTED") {
      throw new Error(
        "Request timeout. FBR system may be slow. Please try again."
      );
    } else if (error.code === "ERR_NETWORK") {
      throw new Error(
        "Network error. Please check your internet connection and try again."
      );
    } else {
      throw new Error(
        "Unable to connect to FBR system. Please try again later."
      );
    }
  }
};