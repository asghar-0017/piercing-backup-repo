import { Box, FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { fetchData } from "../API/GetApi";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import { getSellerProvinceCode } from "../utils/provinceMatcher";

const SROScheduleNumber = ({
  index,
  item,
  handleItemChange,
  disabled,
  selectedProvince,
  sellerProvince,
}) => {
  const { tokensLoaded } = useTenantSelection();
  const [sro, setSro] = useState([]);
  const [rateId, setRateId] = useState(null);

  const getSRO = async () => {
    try {
      // Use item-specific rate ID instead of global one
      var RateId = localStorage.getItem(`selectedRateId_${index}`);
      console.log(`RateId for item ${index}:`, RateId);

      if (!RateId) {
        console.warn(`selectedRateId_${index} is missing in localStorage`);
        return;
      }

      // Check if tokens are loaded before making API call
      if (!tokensLoaded) {
        console.warn("Tokens not loaded yet, skipping SRO fetch");
        return;
      }

      // Determine which province to use for SRO selection
      let provinceToUse = null;
      let provinceCode = null;

      if (sellerProvince) {
        // Use seller's province if available
        console.log(`Using seller's province for SRO: "${sellerProvince}"`);
        try {
          provinceCode = await getSellerProvinceCode(sellerProvince);
          if (provinceCode) {
            provinceToUse = sellerProvince;
            console.log(
              `Found province code ${provinceCode} for seller province "${sellerProvince}" in SRO component`
            );
          } else {
            console.warn(
              `Could not determine province code for seller province "${sellerProvince}" in SRO component`
            );
          }
        } catch (error) {
          console.error(
            "Error getting seller province code in SRO component:",
            error
          );
        }
      }

      // Fallback to selectedProvince if seller province failed or not available
      if (!provinceCode && selectedProvince) {
        console.log(
          `Falling back to selected province for SRO: "${selectedProvince}"`
        );

        // Get the full province data from localStorage
        const provinceResponseRaw = localStorage.getItem("provinceResponse");

        if (!provinceResponseRaw) {
          console.warn("No province data available in localStorage for SRO");
          return;
        }

        try {
          const provinceResponse = JSON.parse(provinceResponseRaw);

          if (!Array.isArray(provinceResponse)) {
            console.error("Province response is not an array in SRO component");
            return;
          }

          const selectedProvinceObj = provinceResponse.find(
            (prov) => prov.stateProvinceDesc === selectedProvince
          );

          if (!selectedProvinceObj) {
            console.warn(
              `Province not found in provinceResponse: ${selectedProvince}`
            );
            return;
          }

          provinceCode = selectedProvinceObj.stateProvinceCode;
          provinceToUse = selectedProvince;
          console.log("Found province code for SRO:", provinceCode);
        } catch (parseError) {
          console.error(
            "Error parsing province data in SRO component:",
            parseError
          );
          return;
        }
      }

      if (!provinceCode) {
        console.error("No province code available for SRO selection");
        return;
      }

      const currentDate = dayjs().format("DD-MMM-YYYY");
      const response = await fetchData(
        `pdi/v1/SroSchedule?rate_id=${RateId}&date=${currentDate}&origination_supplier_csv=${provinceCode}`
      );
      console.log(`SRO for item ${index}:`, response);
      setSro(response);
      return response;
    } catch (error) {
      console.error("Error fetching SRO:", error);
      return [];
    }
  };

  // Track per-item RateId changes from localStorage (especially during edit flow)
  useEffect(() => {
    // Initialize from storage
    setRateId(localStorage.getItem(`selectedRateId_${index}`));

    const handleStorage = (e) => {
      if (e.key === `selectedRateId_${index}`) {
        setRateId(e.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);

    // Polling fallback for same-tab localStorage writes
    const interval = setInterval(() => {
      const current = localStorage.getItem(`selectedRateId_${index}`);
      setRateId((prev) => (prev !== current ? current : prev));
    }, 500);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, [index]);

  // Fetch SRO when inputs or detected rateId change
  useEffect(() => {
    if (!tokensLoaded) return;
    getSRO();
  }, [
    selectedProvince,
    sellerProvince,
    tokensLoaded,
    index,
    item.rate,
    rateId,
  ]);

  // Handle editing case - set SROId when editing an invoice
  useEffect(() => {
    const hasPrefilledSRO = Boolean(item.sroScheduleNo);
    if (hasPrefilledSRO && sro.length > 0) {
      console.log(
        `Editing mode detected for item ${index}, looking for SRO schedule:`,
        item.sroScheduleNo
      );
      console.log(
        `Available SRO schedules for item ${index}:`,
        sro.map((s) => s.srO_DESC)
      );
      const selectedSROObj = sro.find(
        (sroItem) => sroItem.srO_DESC === item.sroScheduleNo
      );
      if (selectedSROObj) {
        // Store SRO ID per item instead of globally
        localStorage.setItem(`SROId_${index}`, selectedSROObj.srO_ID);
        console.log(
          `Set SROId for item ${index} editing: ${selectedSROObj.srO_ID}`
        );
      } else {
        console.warn(
          `SRO schedule not found in available schedules for item ${index}: ${item.sroScheduleNo}`
        );
      }
    }
  }, [sro, item.sroScheduleNo, index]);

  // Additional effect to handle editing when SRO data is loaded after the editing flag is set
  useEffect(() => {
    const hasPrefilledSRO = Boolean(item.sroScheduleNo);
    if (hasPrefilledSRO && sro.length > 0) {
      // This effect runs when SRO data is loaded and we're in editing mode
      const selectedSROObj = sro.find(
        (sroItem) => sroItem.srO_DESC === item.sroScheduleNo
      );
      if (selectedSROObj) {
        // Store SRO ID per item instead of globally
        localStorage.setItem(`SROId_${index}`, selectedSROObj.srO_ID);
        console.log(
          `Set SROId for item ${index} editing (delayed): ${selectedSROObj.srO_ID}`
        );
      }
    }
  }, [sro, item.sroScheduleNo, index]);

  const handleSROChange = (event) => {
    const selectedSRO = event.target.value; // e.g., "18%"
    const selectedSROObj = sro.find((sro) => sro.srO_DESC === selectedSRO);
    if (selectedSROObj) {
      // Store SRO ID per item instead of globally
      localStorage.setItem(`SROId_${index}`, selectedSROObj.srO_ID);
      console.log(
        `SAVED SROId for item ${index}: ${selectedSROObj.srO_ID} to localStorage`
      );
    }
    if (sro.length === 0) {
      localStorage.removeItem(`SROId_${index}`);
    }
    handleItemChange(index, "sroScheduleNo", selectedSRO);
  };
  return (
    <Box sx={{ flex: "1 1 22%", minWidth: "180px" }}>
      <FormControl fullWidth size="small" disabled={disabled}>
        <InputLabel id={`sro-schedule-${index}`}>SRO Schedule No</InputLabel>
        <Select
          labelId={`sro-schedule-${index}`}
          value={item.sroScheduleNo || (sro.length === 0 ? "N/A" : "")}
          label="SRO Schedule No"
          onChange={handleSROChange}
        >
          {sro.length === 0 ? (
            <MenuItem value="N/A">N/A</MenuItem>
          ) : (
            sro.map((curElem) => (
              <MenuItem key={curElem.srO_ID} value={curElem.srO_DESC}>
                {curElem.srO_DESC}
              </MenuItem>
            ))
          )}
        </Select>
      </FormControl>
    </Box>
  );
};

export default SROScheduleNumber;
