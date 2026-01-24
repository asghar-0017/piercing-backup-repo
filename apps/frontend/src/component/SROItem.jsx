import { Box, FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import React, { useEffect, useState } from "react";
import dayjs from "dayjs";
import { fetchData } from "../API/GetApi";
import { useTenantSelection } from "../Context/TenantSelectionProvider";

const SROItem = ({ index, item, handleItemChange, disabled }) => {
  const { tokensLoaded } = useTenantSelection();
  const [sro, setSro] = useState([]);
  const [sroId, setSroId] = useState(null);

  useEffect(() => {
    const getSROItem = async () => {
      // Use item-specific SRO ID instead of global one
      const itemSROId = localStorage.getItem(`SROId_${index}`);
      console.log(`SROId for item ${index}:`, itemSROId);

      if (!itemSROId) {
        console.warn(`SROId_${index} is missing in localStorage`);
        return;
      }

      // Check if tokens are loaded before making API call
      if (!tokensLoaded) {
        console.warn("Tokens not loaded yet, skipping SRO item fetch");
        return;
      }

      try {
        const currentDate = dayjs().format("YYYY-MM-DD");
        const response = await fetchData(
          `pdi/v2/SROItem?date=${currentDate}&sro_id=${itemSROId}`
        );
        console.log(`SRO ITEM RESPONSE for item ${index}:`, response);
        setSro(response);
      } catch (error) {
        console.error("Error fetching rates:", error);
      }
    };

    getSROItem();
  }, [tokensLoaded, index, item.sroScheduleNo, sroId]);

  // Track per-item SROId changes from localStorage (especially during edit flow)
  useEffect(() => {
    setSroId(localStorage.getItem(`SROId_${index}`));

    const handleStorage = (e) => {
      if (e.key === `SROId_${index}`) {
        setSroId(e.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);

    const interval = setInterval(() => {
      const current = localStorage.getItem(`SROId_${index}`);
      setSroId((prev) => (prev !== current ? current : prev));
    }, 500);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
    };
  }, [index]);

  // Handle editing case - ensure SRO item is properly set when editing
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if (isEditing && item.sroItemSerialNo && sro.length > 0) {
      // The SRO item should already be set in the form data
      // This effect ensures the component recognizes the existing value
      console.log(
        `Editing SRO item for item ${index}: ${item.sroItemSerialNo}`
      );
    }
  }, [sro, item.sroItemSerialNo, index]);

  // Additional effect to handle editing when SRO data is loaded after the editing flag is set
  useEffect(() => {
    const isEditing = localStorage.getItem("editingInvoice") === "true";
    if (isEditing && item.sroItemSerialNo && sro.length > 0) {
      // This effect runs when SRO data is loaded and we're in editing mode
      console.log(
        `Editing SRO item for item ${index} (delayed): ${item.sroItemSerialNo}`
      );
      console.log(
        `Available SRO items for item ${index}:`,
        sro.map((s) => s.srO_ITEM_DESC)
      );

      // Check if the SRO item exists in the loaded data
      const itemExists = sro.some(
        (curElem) => curElem.srO_ITEM_DESC === item.sroItemSerialNo
      );
      if (!itemExists) {
        console.warn(
          `SRO item not found in available items for item ${index}: ${item.sroItemSerialNo}`
        );
      }
    }
  }, [sro, item.sroItemSerialNo, index]);

  const handleSROChange = (event) => {
    const selectedSRO = event.target.value;
    handleItemChange(index, "sroItemSerialNo", selectedSRO);
  };

  // Get item-specific SRO ID
  const itemSROId = localStorage.getItem(`SROId_${index}`);

  // ✅ Early return AFTER hooks
  if (!itemSROId) {
    return null;
  }

  // Determine the value to show: if data exists and matches, select it; otherwise, show 'N/A' if no SRO items
  let selectedValue = "";
  if (sro.length === 0) {
    selectedValue = "N/A";
  } else if (
    item.sroItemSerialNo &&
    sro.some((curElem) => curElem.srO_ITEM_DESC === item.sroItemSerialNo)
  ) {
    selectedValue = item.sroItemSerialNo;
  }

  return (
    <Box sx={{ flex: "1 1 22%", minWidth: "180px" }}>
      <FormControl fullWidth size="small" disabled={disabled}>
        <InputLabel id={`sro-item-${index}`}>SRO Item No</InputLabel>
        <Select
          labelId={`sro-item-${index}`}
          value={selectedValue}
          label="SRO Item No"
          onChange={handleSROChange}
        >
          {sro.length === 0 ? (
            <MenuItem key="N/A" value="N/A">
              N/A
            </MenuItem>
          ) : (
            sro.map((curElem) => (
              <MenuItem key={curElem.srO_ITEM_ID} value={curElem.srO_ITEM_DESC}>
                {curElem.srO_ITEM_DESC}
              </MenuItem>
            ))
          )}
        </Select>
      </FormControl>
    </Box>
  );
};

export default SROItem;
