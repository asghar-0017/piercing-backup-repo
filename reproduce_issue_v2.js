
const convertExcelDateToYYYYMMDD = (excelDate) => {
  // Simulate the function in the codebase
  if (!excelDate || excelDate === "") return "";

  const toLocalYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // If it's already a string that looks like a date, try to parse it
  if (typeof excelDate === "string") {
    // Check if it's already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(excelDate)) {
      return excelDate;
    }

    // Check if it's a numeric string that might be an Excel serial date
    if (/^\d+$/.test(excelDate)) {
      console.log("Matched numeric regex");
      const numericValue = parseFloat(excelDate);
      // If it's a large number, treat it as Excel serial date
      if (numericValue > 1000) {
        // Excel dates are number of days since 1900-01-01
        // Set time to NOON (12:00) to avoid DST/Timezone shifts causing date to jump to previous/next day
        const excelEpoch = new Date(1900, 0, 1, 12, 0, 0);
        let daysToAdd = numericValue - 1;

        // Adjust for Excel's leap year bug (1900 is not a leap year but Excel treats it as one)
        if (numericValue > 59) {
          daysToAdd = daysToAdd - 1;
        }

        const date = new Date(
          excelEpoch.getTime() + daysToAdd * 24 * 60 * 60 * 1000,
        );
        return toLocalYYYYMMDD(date);
      }
    } else {
        console.log("Did NOT match numeric regex");
    }

    // Handle date strings with slashes or dashes (MM/DD/YYYY or DD/MM/YYYY)
    if (excelDate.includes("/") || excelDate.includes("-")) {
        // ... omitted for brevity
    }

    // Try to parse various date formats using JavaScript Date
    console.log("Fallback to new Date()");
    const date = new Date(excelDate);
    if (!isNaN(date.getTime())) {
      console.log("Fallback date valid:", date.toISOString());
      return toLocalYYYYMMDD(date);
    }
  }

  return "";
};

console.log("--- Test 1: Clean String ---");
console.log("Result:", convertExcelDateToYYYYMMDD("45658"));

console.log("\n--- Test 2: String with Space ---");
console.log("Result:", convertExcelDateToYYYYMMDD("45658 "));
