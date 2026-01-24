import { fetchData } from "../API/GetApi";
import dayjs from "dayjs";
import { getRatesForTransactionType } from "./hardcodedRates";

/**
 * Province Matcher Utility
 *
 * This utility handles:
 * 1. Fetching provinces from FBR API
 * 2. Matching seller's province with FBR province list
 * 3. Returning the matching stateProvinceCode for rate selection API
 */

/**
 * Fetch provinces from FBR API and cache them
 * @param {string} environment - The environment (sandbox/production)
 * @returns {Promise<Array>} Array of provinces with stateProvinceCode and stateProvinceDesc
 */
export const fetchProvincesFromFBR = async (environment = "sandbox") => {
  try {
    console.log("Fetching provinces from FBR API...");
    const provinces = await fetchData("pdi/v1/provinces", environment);

    // Cache the provinces in localStorage for reuse
    localStorage.setItem("fbrProvinces", JSON.stringify(provinces));
    localStorage.setItem("fbrProvincesTimestamp", Date.now().toString());

    console.log("Provinces fetched and cached:", provinces);
    return provinces;
  } catch (error) {
    console.error("Error fetching provinces from FBR:", error);

    // Try to get cached provinces if available
    const cachedProvinces = localStorage.getItem("fbrProvinces");
    if (cachedProvinces) {
      console.log("Using cached provinces due to API error");
      return JSON.parse(cachedProvinces);
    }

    throw error;
  }
};

/**
 * Get provinces from cache or fetch from FBR if needed
 * @param {string} environment - The environment (sandbox/production)
 * @param {number} cacheExpiryMinutes - Cache expiry time in minutes (default: 60)
 * @returns {Promise<Array>} Array of provinces
 */
export const getProvinces = async (
  environment = "sandbox",
  cacheExpiryMinutes = 60
) => {
  try {
    // Check if we have cached provinces
    const cachedProvinces = localStorage.getItem("fbrProvinces");
    const cachedTimestamp = localStorage.getItem("fbrProvincesTimestamp");

    if (cachedProvinces && cachedTimestamp) {
      const cacheAge = Date.now() - parseInt(cachedTimestamp);
      const cacheExpiryMs = cacheExpiryMinutes * 60 * 1000;

      if (cacheAge < cacheExpiryMs) {
        console.log(
          "Using cached provinces (age:",
          Math.round(cacheAge / 1000),
          "seconds)"
        );
        return JSON.parse(cachedProvinces);
      }
    }

    // Cache expired or doesn't exist, fetch fresh data
    return await fetchProvincesFromFBR(environment);
  } catch (error) {
    console.error("Error getting provinces:", error);
    throw error;
  }
};

/**
 * Find the matching province for a given seller province
 * @param {string} sellerProvince - The seller's province (e.g., "SINDH", "PUNJAB")
 * @param {Array} provinces - Array of provinces from FBR API
 * @returns {Object|null} Matching province object with stateProvinceCode and stateProvinceDesc, or null if not found
 */
export const findMatchingProvince = (sellerProvince, provinces) => {
  if (!sellerProvince || !Array.isArray(provinces)) {
    return null;
  }

  const sellerProvinceUpper = sellerProvince.trim().toUpperCase();

  // First try exact match
  let matchingProvince = provinces.find(
    (prov) => prov.stateProvinceDesc.toUpperCase() === sellerProvinceUpper
  );

  if (matchingProvince) {
    console.log(`Exact match found for "${sellerProvince}":`, matchingProvince);
    return matchingProvince;
  }

  // Try case-insensitive match
  matchingProvince = provinces.find(
    (prov) =>
      prov.stateProvinceDesc.toLowerCase() ===
      sellerProvince.trim().toLowerCase()
  );

  if (matchingProvince) {
    console.log(
      `Case-insensitive match found for "${sellerProvince}":`,
      matchingProvince
    );
    return matchingProvince;
  }

  // Try partial match and common variations
  const variations = {
    SINDH: ["SINDH", "SINDH PROVINCE", "SINDH PROV"],
    PUNJAB: ["PUNJAB", "PUNJAB PROVINCE", "PUNJAB PROV"],
    "KHYBER PAKHTUNKHWA": [
      "KHYBER PAKHTUNKHWA",
      "KPK",
      "KHYBER PAKHTUNKHWA PROVINCE",
    ],
    BALOCHISTAN: ["BALOCHISTAN", "BALOCHISTAN PROVINCE", "BALOCHISTAN PROV"],
    "CAPITAL TERRITORY": [
      "CAPITAL TERRITORY",
      "FEDERAL",
      "ISLAMABAD",
      "FEDERAL TERRITORY",
    ],
    "GILGIT BALTISTAN": ["GILGIT BALTISTAN", "GB", "GILGIT BALTISTAN PROVINCE"],
    "AZAD JAMMU AND KASHMIR": [
      "AZAD JAMMU AND KASHMIR",
      "AJK",
      "AZAD JAMMU & KASHMIR",
    ],
  };

  // Check if seller province matches any variation
  for (const [standardName, variationList] of Object.entries(variations)) {
    if (
      variationList.some(
        (variation) =>
          variation.toUpperCase() === sellerProvinceUpper ||
          sellerProvinceUpper.includes(variation.toUpperCase()) ||
          variation.toUpperCase().includes(sellerProvinceUpper)
      )
    ) {
      // Find the standard province in the FBR list
      matchingProvince = provinces.find(
        (prov) =>
          prov.stateProvinceDesc.toUpperCase() === standardName.toUpperCase()
      );

      if (matchingProvince) {
        console.log(
          `Variation match found for "${sellerProvince}" -> "${standardName}":`,
          matchingProvince
        );
        return matchingProvince;
      }
    }
  }

  // Try fuzzy matching for close matches
  for (const province of provinces) {
    const fbrProvinceUpper = province.stateProvinceDesc.toUpperCase();

    // Check if seller province contains FBR province name or vice versa
    if (
      sellerProvinceUpper.includes(fbrProvinceUpper) ||
      fbrProvinceUpper.includes(sellerProvinceUpper)
    ) {
      console.log(
        `Fuzzy match found for "${sellerProvince}" -> "${province.stateProvinceDesc}":`,
        province
      );
      return province;
    }
  }

  console.warn(`No matching province found for "${sellerProvince}"`);
  console.log(
    "Available provinces:",
    provinces.map((p) => p.stateProvinceDesc)
  );
  return null;
};

/**
 * Get the stateProvinceCode for a seller's province
 * @param {string} sellerProvince - The seller's province
 * @param {string} environment - The environment (sandbox/production)
 * @returns {Promise<number|null>} The stateProvinceCode if found, null otherwise
 */
export const getSellerProvinceCode = async (
  sellerProvince,
  environment = "sandbox"
) => {
  try {
    if (!sellerProvince) {
      console.warn("No seller province provided");
      return null;
    }

    console.log(
      `Getting province code for seller province: "${sellerProvince}"`
    );

    // Get provinces (from cache or FBR)
    const provinces = await getProvinces(environment);

    // Find matching province
    const matchingProvince = findMatchingProvince(sellerProvince, provinces);

    if (matchingProvince) {
      const provinceCode = matchingProvince.stateProvinceCode;
      console.log(
        `Found province code ${provinceCode} for "${sellerProvince}"`
      );
      return provinceCode;
    }

    console.warn(`Could not find province code for "${sellerProvince}"`);
    return null;
  } catch (error) {
    console.error("Error getting seller province code:", error);
    return null;
  }
};

/**
 * Enhanced rate selection function that automatically uses seller's province
 * @param {string} sellerProvince - The seller's province
 * @param {string} transactionTypeId - The transaction type ID
 * @param {string} environment - The environment (sandbox/production)
 * @returns {Promise<Array>} Array of rates for the seller's province
 */
export const getRatesForSellerProvince = async (
  sellerProvince,
  transactionTypeId,
  environment = "sandbox"
) => {
  try {
    if (!sellerProvince || !transactionTypeId) {
      console.warn("Missing required parameters:", {
        sellerProvince,
        transactionTypeId,
      });
      return [];
    }

    console.log(
      `Getting rates for seller province: "${sellerProvince}", transaction type: ${transactionTypeId}`
    );

    // First try to get rates from hardcoded data
    const hardcodedRates = getRatesForTransactionType(transactionTypeId);
    if (hardcodedRates && hardcodedRates.length > 0) {
      console.log(
        `Using hardcoded rates for transaction type ${transactionTypeId}:`,
        hardcodedRates
      );
      return hardcodedRates;
    }

    console.log(
      `No hardcoded rates found for transaction type ${transactionTypeId}, falling back to API call`
    );

    // Get the province code for the seller
    const provinceCode = await getSellerProvinceCode(
      sellerProvince,
      environment
    );

    if (!provinceCode) {
      console.error(
        `Could not determine province code for "${sellerProvince}"`
      );
      return [];
    }

    // Fetch rates using the province code
    const currentDate = dayjs().format("DD-MMM-YYYY");
    const rates = await fetchData(
      `pdi/v2/SaleTypeToRate?date=${currentDate}&transTypeId=${transactionTypeId}&originationSupplier=${provinceCode}`,
      environment
    );

    console.log(`Rates fetched for province code ${provinceCode}:`, rates);
    return Array.isArray(rates) ? rates : [];
  } catch (error) {
    console.error("Error getting rates for seller province:", error);
    return [];
  }
};

export default {
  fetchProvincesFromFBR,
  getProvinces,
  findMatchingProvince,
  getSellerProvinceCode,
  getRatesForSellerProvince,
};
