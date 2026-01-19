
const convertExcelDateToYYYYMMDD = (excelDate) => {
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
      const numericValue = parseFloat(excelDate);
      // If it's a large number, treat it as Excel serial date
      if (numericValue > 1000) {
        // Excel dates are number of days since 1900-01-01
        // Excel incorrectly treats 1900 as a leap year, so we need to adjust
        const excelEpoch = new Date(1900, 0, 1);
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
    }

    // Handle date strings with slashes or dashes (MM/DD/YYYY or DD/MM/YYYY)
    if (excelDate.includes("/") || excelDate.includes("-")) {
      const parts = excelDate.split(/[\/\-]/);
      if (parts.length === 3) {
        // Try MM/DD/YYYY format first (US format)
        let month = parseInt(parts[0], 10);
        let day = parseInt(parts[1], 10);
        let year = parseInt(parts[2], 10);

        // Check if it is YYYY/MM/DD or YYYY-MM-DD (if regex missed it)
        if (parts[0].length === 4) {
          year = parseInt(parts[0], 10);
          month = parseInt(parts[1], 10);
          day = parseInt(parts[2], 10);
        }
        // Logic to disambiguate DD/MM/YYYY vs MM/DD/YYYY
        // If ambiguous (both <= 12), prefer the interpretation that yields a PAST or TODAY date
        else if (month <= 12 && day <= 12) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Interpretation A: MM/DD/YYYY (US) - current default
          const dateMMDD = new Date(year, month - 1, day);

          // Interpretation B: DD/MM/YYYY (International)
          const dateDDMM = new Date(year, day - 1, month);

          const isFutureMMDD = dateMMDD.getTime() > today.getTime();
          const isFutureDDMM = dateDDMM.getTime() > today.getTime();

          // If MM/DD is Future but DD/MM is Not Future, assume user meant DD/MM
          if (isFutureMMDD && !isFutureDDMM) {
            [month, day] = [day, month];
          }
        }
        // If month > 12, it must be DD/MM/YYYY format
        else if (month > 12 && day <= 12) {
          // Swap month and day
          [month, day] = [day, month];
        }

        // Validate the date
        if (
          month >= 1 &&
          month <= 12 &&
          day >= 1 &&
          day <= 31 &&
          year >= 1900 &&
          year <= 2100
        ) {
          // Format as YYYY-MM-DD
          return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
        }
      }
    }

    // Try to parse various date formats using JavaScript Date
    const date = new Date(excelDate);
    if (!isNaN(date.getTime())) {
      return toLocalYYYYMMDD(date);
    }
  }

  // If it's a number (Excel serial date), convert it
  if (typeof excelDate === "number") {
    // Excel dates are number of days since 1900-01-01
    // Excel incorrectly treats 1900 as a leap year, so we need to adjust
    const excelEpoch = new Date(1900, 0, 1);
    let daysToAdd = excelDate - 1;

    // Adjust for Excel's leap year bug (1900 is not a leap year but Excel treats it as one)
    if (excelDate > 59) {
      daysToAdd = daysToAdd - 1;
    }

    const date = new Date(
      excelEpoch.getTime() + daysToAdd * 24 * 60 * 60 * 1000,
    );
    return toLocalYYYYMMDD(date);
  }

  return "";
};

const isFutureDate = (value) => {
  if (!value) return false;

  let date;
  // Handle YYYY-MM-DD explicitly to avoid timezone issues with new Date(string)
  // new Date("YYYY-MM-DD") parses as UTC, which can shift the date when converted to local time
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    // Create date in local time (months are 0-indexed)
    date = new Date(year, month - 1, day);
  } else {
    date = new Date(value);
  }

  if (isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  console.log(`Checking date: ${value} -> Parsed: ${date.toDateString()} vs Today: ${today.toDateString()}`);
  return date.getTime() > today.getTime();
};

const testDate = "45658";
const converted = convertExcelDateToYYYYMMDD(testDate);
console.log(`Converted '${testDate}': ${converted}`);
const isFuture = isFutureDate(converted);
console.log(`Is Future: ${isFuture}`);
