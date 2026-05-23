// Shared utilities and constants
export const API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "http://localhost:5150"
    : "http://localhost:3004";

export const FBR_API_URL = "https://gw.fbr.gov.pk";

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
  }).format(amount);
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-PK");
};

export const generateInvoiceNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `INV-${timestamp}-${random}`;
};
