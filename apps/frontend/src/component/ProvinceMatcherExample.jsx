import React, { useState } from "react";
import { Box, Button, Typography, Paper, Alert } from "@mui/material";
import dayjs from "dayjs";
import { getSellerProvinceCode } from "../utils/provinceMatcher";

/**
 * Example component demonstrating how to use the province matching feature
 * This shows the basic usage pattern for integrating province matching in your components
 */
const ProvinceMatcherExample = () => {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Example: Get province code for a seller
  const handleGetProvinceCode = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // This is how you would use the province matching in your component
      const provinceCode = await getSellerProvinceCode("SINDH");
      
      if (provinceCode) {
        setResult({
          sellerProvince: "SINDH",
          fbrProvinceCode: provinceCode,
          message: `Successfully matched SINDH to FBR province code ${provinceCode}`
        });
      } else {
        setError("Could not determine province code for SINDH");
      }
    } catch (error) {
      setError(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Example: Show how to use in a real scenario
  const handleSimulateRateFetching = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // Simulate a real-world scenario where you need to get rates
      // for a seller in SINDH province
      const sellerProvince = "SINDH";
      const transactionTypeId = "80"; // Example transaction type
      
      console.log(`Simulating rate fetching for seller in ${sellerProvince}`);
      
      // Step 1: Get the province code
      const provinceCode = await getSellerProvinceCode(sellerProvince);
      
      if (!provinceCode) {
        setError(`Could not determine province code for ${sellerProvince}`);
        return;
      }
      
      // Step 2: Use the province code for rate selection
      // In a real scenario, you would call the rate API here
      const currentDate = dayjs().format("DD-MMM-YYYY");
      const rateApiUrl = `pdi/v2/SaleTypeToRate?date=${currentDate}&transTypeId=${transactionTypeId}&originationSupplier=${provinceCode}`;
      
      setResult({
        sellerProvince,
        fbrProvinceCode: provinceCode,
        transactionTypeId,
        rateApiUrl,
        message: `Ready to fetch rates using province code ${provinceCode}`
      });
      
      console.log(`Would call rate API: ${rateApiUrl}`);
      
    } catch (error) {
      setError(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, m: 2, maxWidth: 600 }}>
      <Typography variant="h6" gutterBottom>
        Province Matcher Usage Example
      </Typography>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        This component demonstrates how to integrate the province matching feature 
        into your existing components.
      </Typography>

      <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          onClick={handleGetProvinceCode}
          disabled={loading}
        >
          Test Basic Matching
        </Button>
        
        <Button
          variant="outlined"
          onClick={handleSimulateRateFetching}
          disabled={loading}
        >
          Simulate Rate Fetching
        </Button>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Result Display */}
      {result && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Result:
          </Typography>
          <Paper sx={{ p: 2, bgcolor: "grey.50" }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Seller Province:</strong> {result.sellerProvince}
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>FBR Province Code:</strong> {result.fbrProvinceCode}
            </Typography>
            {result.transactionTypeId && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Transaction Type ID:</strong> {result.transactionTypeId}
              </Typography>
            )}
            {result.rateApiUrl && (
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Rate API URL:</strong> {result.rateApiUrl}
              </Typography>
            )}
            <Typography variant="body2" sx={{ mt: 2, color: "success.main" }}>
              {result.message}
            </Typography>
          </Paper>
        </Box>
      )}

      {/* Code Example */}
      <Box sx={{ mt: 3, p: 2, bgcolor: "info.50", borderRadius: 1 }}>
        <Typography variant="h6" gutterBottom>
          Code Example:
        </Typography>
        <Typography variant="body2" component="pre" sx={{ 
          bgcolor: "grey.100", 
          p: 2, 
          borderRadius: 1, 
          overflow: "auto",
          fontSize: "12px"
        }}>
{`// Import the utility function
import { getSellerProvinceCode } from '../utils/provinceMatcher';

// Use in your component
const handleProvinceMatching = async () => {
  try {
    const provinceCode = await getSellerProvinceCode("SINDH");
    
    if (provinceCode) {
      // Use the province code for rate selection
      const currentDate = dayjs().format("DD-MMM-YYYY");
      const rateApiUrl = \`pdi/v2/SaleTypeToRate?date=\${currentDate}&transTypeId=80&originationSupplier=\${provinceCode}\`;
      
      // Call your rate API here
      const rates = await fetchRates(rateApiUrl);
      
      console.log('Rates for SINDH:', rates);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};`}
        </Typography>
      </Box>

      {/* Integration Notes */}
      <Box sx={{ mt: 3, p: 2, bgcolor: "warning.50", borderRadius: 1 }}>
        <Typography variant="h6" gutterBottom>
          Integration Notes:
        </Typography>
        <Typography variant="body2" component="div">
          <ul>
            <li>The province matching is automatic and handles various input formats</li>
            <li>Results are cached for performance (60 minutes by default)</li>
            <li>Always handle errors gracefully in production code</li>
            <li>Use the returned province code in your rate selection API calls</li>
            <li>The system falls back to manual province selection if needed</li>
          </ul>
        </Typography>
      </Box>
    </Paper>
  );
};

export default ProvinceMatcherExample;
