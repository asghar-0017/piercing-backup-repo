import React from "react";
import ReactDOM from "react-dom/client";
import ErrorModal from "../component/ErrorModal";

/**
 * Shows an error modal with structured formatting
 * @param {Object} options - Configuration options
 * @param {string} options.title - Modal title (default: "Error")
 * @param {string} options.message - Main error message
 * @param {Array|string} options.details - Array of error details or string with details
 * @param {string} options.type - Type of alert: 'error', 'success', 'warning', 'info' (default: 'error')
 * @param {boolean} options.showCancelButton - Show cancel button (default: false)
 * @param {string} options.confirmButtonText - Confirm button text (default: "OK")
 * @param {string} options.cancelButtonText - Cancel button text (default: "Cancel")
 * @param {string} options.width - Modal width (default: "600px")
 * @returns {Promise} Promise that resolves when modal is closed
 */
export const showError = (options = {}) => {
  return new Promise((resolve) => {
    const {
      title = "Error",
      message = "",
      details = [],
      type = "error",
      showCancelButton = false,
      confirmButtonText = "OK",
      cancelButtonText = "Cancel",
      width = "600px",
    } = options;

    // Create a container for the modal
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = ReactDOM.createRoot(container);

    const handleClose = (confirmed = false) => {
      root.unmount();
      document.body.removeChild(container);
      resolve({ isConfirmed: confirmed, isDismissed: !confirmed });
    };

    const handleConfirm = () => {
      handleClose(true);
    };

    root.render(
      <ErrorModal
        open={true}
        onClose={() => handleClose(false)}
        onConfirm={handleConfirm}
        title={title}
        message={message}
        details={details}
        type={type}
        showCancelButton={showCancelButton}
        confirmButtonText={confirmButtonText}
        cancelButtonText={cancelButtonText}
        width={width}
      />
    );
  });
};

/**
 * Helper function to parse error response and extract structured error information
 * @param {Object} error - Error object from API call
 * @returns {Object} Parsed error with title, message, and details
 */
export const parseError = (error) => {
  let errorTitle = "Error";
  let errorMessage = "An error occurred";
  let errorDetails = [];

  // Check if it's a validation error from FBR
  const errorResponse = error?.response?.data || error?.data || error;

  if (errorResponse) {
    // Handle FBR API validation errors
    const fbrError =
      errorResponse?.validationResponse?.error ||
      errorResponse?.data?.error ||
      errorResponse?.data?.message ||
      errorResponse?.error ||
      errorResponse?.message;

    if (fbrError) {
      errorTitle = "FBR Validation Error";
      errorMessage = fbrError;

      // Check for item-specific errors in validation response
      const invoiceStatuses =
        errorResponse?.validationResponse?.invoiceStatuses ||
        errorResponse?.invoiceStatuses;

      if (invoiceStatuses && Array.isArray(invoiceStatuses)) {
        invoiceStatuses.forEach((status, index) => {
          if (status?.error) {
            errorDetails.push({
              item: status.itemSNo || index + 1,
              error: status.error,
            });
          }
        });
      }
    } else {
      // Handle other API response errors
      if (errorResponse.errors && Array.isArray(errorResponse.errors)) {
        errorDetails = errorResponse.errors.map((err, index) => ({
          error: typeof err === "string" ? err : err.message || JSON.stringify(err),
        }));
      } else if (errorResponse.message) {
        errorMessage = errorResponse.message;
      }
    }
  } else {
    // Handle network and other errors
    if (error?.code === "ECONNABORTED") {
      errorTitle = "Request Timeout";
      errorMessage = "FBR API request timed out. Please try again.";
    } else if (error?.code === "ERR_NETWORK") {
      errorTitle = "Network Error";
      errorMessage =
        "Unable to connect to FBR API. Please check your internet connection.";
    } else if (error?.message) {
      errorMessage = error.message;
    }
  }

  return {
    title: errorTitle,
    message: errorMessage,
    details: errorDetails,
  };
};

/**
 * Shows an error from an error object (automatically parses it)
 * @param {Object} error - Error object from API call
 * @param {Object} options - Additional options to override parsed values
 * @returns {Promise} Promise that resolves when modal is closed
 */
export const showErrorFromResponse = (error, options = {}) => {
  const parsed = parseError(error);
  return showError({
    ...parsed,
    ...options,
  });
};

