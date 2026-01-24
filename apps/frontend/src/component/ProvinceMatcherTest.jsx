import React, { useState } from "react";
import { Box, Button, TextField, Typography, Paper, Alert } from "@mui/material";
import dayjs from "dayjs";
import { getSellerProvinceCode, getRatesForSellerProvince } from "../utils/provinceMatcher";
import { fetchData } from "../API/GetApi";

const ProvinceMatcherTest = () => {
  const [sellerProvince, setSellerProvince] = useState("SINDH");
  const [transactionTypeId, setTransactionTypeId] = useState("1");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testProvinceMatching = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      console.log(`Testing province matching for: "${sellerProvince}"`);
      
      // Test 1: Get province code
      const provinceCode = await getSellerProvinceCode(sellerProvince);
      console.log(`Province code result:`, provinceCode);

      if (!provinceCode) {
        setError(`Could not determine province code for "${sellerProvince}"`);
        setLoading(false);
        return;
      }

      // Test 2: Get rates using the province code
      const rates = await getRatesForSellerProvince(sellerProvince, transactionTypeId);
      console.log(`Rates result:`, rates);

      // Test 3: Test SRO API call directly
      let sroResult = null;
      try {
        const currentDate = dayjs().format("DD-MMM-YYYY");
        sroResult = await fetchData(
          `pdi/v1/SroSchedule?rate_id=1&date=${currentDate}&origination_supplier_csv=${provinceCode}`
        );
        console.log(`SRO API result:`, sroResult);
      } catch (sroError) {
        console.warn("SRO API test failed (this might be expected):", sroError);
        sroResult = { error: "SRO API test failed", details: sroError.message };
      }

      setResults({
        sellerProvince,
        provinceCode,
        rates,
        sroTest: sroResult,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error("Test failed:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const testMultipleProvinces = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    const testProvinces = [
      "SINDH",
      "PUNJAB", 
      "KPK",
      "BALOCHISTAN",
      "FEDERAL",
      "AJK",
      "GB"
    ];

    const results = [];

    for (const province of testProvinces) {
      try {
        const code = await getSellerProvinceCode(province);
        results.push({ province, code, success: !!code });
      } catch (err) {
        results.push({ province, code: null, success: false, error: err.message });
      }
    }

    setResults({
      type: "multiple_provinces",
      results,
      timestamp: new Date().toISOString()
    });
    setLoading(false);
  };

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: "auto" }}>
      <Typography variant="h4" gutterBottom>
        Province Matcher Test Component
      </Typography>
      
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Test Single Province
        </Typography>
        
        <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
          <TextField
            label="Seller Province"
            value={sellerProvince}
            onChange={(e) => setSellerProvince(e.target.value)}
            placeholder="e.g., SINDH, PUNJAB, KPK"
            sx={{ minWidth: 200 }}
          />
          <TextField
            label="Transaction Type ID"
            value={transactionTypeId}
            onChange={(e) => setTransactionTypeId(e.target.value)}
            type="number"
            sx={{ minWidth: 150 }}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            onClick={testProvinceMatching}
            disabled={loading || !sellerProvince}
          >
            {loading ? "Testing..." : "Test Province Matching"}
          </Button>
          
          <Button
            variant="outlined"
            onClick={testMultipleProvinces}
            disabled={loading}
          >
            {loading ? "Testing..." : "Test All Provinces"}
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {results && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Test Results
          </Typography>
          
          {results.type === "multiple_provinces" ? (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Multiple Province Test Results:
              </Typography>
              {results.results.map((result, index) => (
                <Box key={index} sx={{ mb: 1, p: 1, border: "1px solid #ddd", borderRadius: 1 }}>
                  <Typography variant="body2">
                    <strong>{result.province}:</strong> {result.success ? `✅ ${result.code}` : `❌ ${result.error || "Failed"}`}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                Single Province Test Results:
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>Seller Province:</strong> {results.sellerProvince}
                </Typography>
                <Typography variant="body2">
                  <strong>Province Code:</strong> {results.provinceCode}
                </Typography>
                <Typography variant="body2">
                  <strong>Rates Found:</strong> {results.rates?.length || 0}
                </Typography>
                <Typography variant="body2">
                  <strong>SRO Test:</strong> {results.sroTest?.error ? "Failed" : "Success"}
                </Typography>
                <Typography variant="body2">
                  <strong>Timestamp:</strong> {new Date(results.timestamp).toLocaleString()}
                </Typography>
              </Box>

              {results.rates && results.rates.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Sample Rates:
                  </Typography>
                  {results.rates.slice(0, 3).map((rate, index) => (
                    <Typography key={index} variant="body2" sx={{ fontFamily: "monospace" }}>
                      {JSON.stringify(rate, null, 2)}
                    </Typography>
                  ))}
                </Box>
              )}

              {results.sroTest && !results.sroTest.error && (
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    SRO Test Results:
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                    {JSON.stringify(results.sroTest, null, 2)}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      )}

      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          How It Works
        </Typography>
        <Typography variant="body2" paragraph>
          This component tests the province matching functionality that's now integrated into both 
          <strong>RateSelector</strong> and <strong>SROScheduleNumber</strong> components.
        </Typography>
        <Typography variant="body2" paragraph>
          <strong>1. Province Code Lookup:</strong> Uses the new <code>provinceMatcher</code> utility 
          to find the FBR <code>stateProvinceCode</code> for a given seller province.
        </Typography>
        <Typography variant="body2" paragraph>
          <strong>2. Rate Selection:</strong> Automatically fetches rates using the determined province code 
          in the <code>originationSupplier</code> parameter.
        </Typography>
        <Typography variant="body2" paragraph>
          <strong>3. SRO Integration:</strong> Tests the SRO API call using the same province code 
          to ensure consistency across both components.
        </Typography>
        <Typography variant="body2">
          <strong>Supported Provinces:</strong> SINDH, PUNJAB, KPK, BALOCHISTAN, FEDERAL, AJK, GB
        </Typography>
      </Paper>
    </Box>
  );
};

export default ProvinceMatcherTest;
