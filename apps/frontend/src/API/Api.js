import axios from "axios";

// Create a token manager that will be updated by the context
let tokenManager = {
  getSandboxToken: () => null,
  getProductionToken: () => null,
  getCurrentToken: (environment = "sandbox") => null,
};

// Function to update token manager from context
export const updateTokenManager = (manager) => {
  console.log("API: Updating token manager with:", manager);
  tokenManager = manager;
};

const API_CONFIG = {
  apiKey: import.meta.env.VITE_SERVER_API || "/api",
  apiKeyLocal: import.meta.env.VITE_SERVER_API_LOCAL || "/api",
  get sandBoxTestToken() {
    const token = tokenManager.getSandboxToken();
    console.log(
      "API_CONFIG: sandBoxTestToken =",
      token ? "Available" : "Not available"
    );
    return token;
  },
  get productionToken() {
    const token = tokenManager.getProductionToken();
    console.log(
      "API_CONFIG: productionToken =",
      token ? "Available" : "Not available"
    );
    return token;
  },
  getCurrentToken(environment = "sandbox") {
    const token = tokenManager.getCurrentToken(environment);
    console.log(
      "API_CONFIG: getCurrentToken(",
      environment,
      ") =",
      token ? `Available (${token.substring(0, 10)}...)` : "Not available"
    );
    return token;
  },
};

const api = axios.create({
  // baseURL: "https://fbrtestcase.inplsoftwares.online/api",
  baseURL: "https://united-tubes.inplsoftwares.online/api",
  // You can add headers or other config here if needed
});

// Add request interceptor to include auth token and tenant ID
api.interceptors.request.use(
  (config) => {
    const adminToken = localStorage.getItem("token");
    const tenantToken = localStorage.getItem("tenantToken");
    const tenantId = localStorage.getItem("tenantId");
    const selectedTenant = localStorage.getItem("selectedTenant");

    // Use tenant token if available, otherwise use admin token
    if (tenantToken) {
      config.headers.Authorization = `Bearer ${tenantToken}`;
    } else if (adminToken) {
      config.headers.Authorization = `Bearer ${adminToken}`;
    }

    // Skip tenant ID for authentication endpoints
    const isAuthEndpoint =
      config.url.includes("/auth/") ||
      config.url.includes("/tenant-auth/") ||
      config.url === "/auth/login" ||
      config.url === "/auth/forgot-password" ||
      config.url === "/auth/verify-reset-code" ||
      config.url === "/auth/reset-password" ||
      config.url === "/auth/refresh-token";

    if (!isAuthEndpoint) {
      // For admin users, use selected tenant ID if available
      let tenantIdToUse = null;

      if (selectedTenant) {
        try {
          const tenant = JSON.parse(selectedTenant);
          tenantIdToUse = tenant.tenant_id;
          console.log(
            "Using tenant ID from selectedTenant localStorage:",
            tenantIdToUse
          );
        } catch (error) {
          console.error(
            "Error parsing selected Company from localStorage:",
            error
          );
        }
      } else if (tenantId) {
        tenantIdToUse = tenantId;
        console.log(
          "Using tenant ID from tenantId localStorage:",
          tenantIdToUse
        );
      }

      // Fallback: Try to extract tenant ID from URL if not found in localStorage
      if (!tenantIdToUse && config.url.includes("/tenant/")) {
        const urlMatch = config.url.match(/\/tenant\/([^\/]+)/);
        if (urlMatch && urlMatch[1]) {
          tenantIdToUse = urlMatch[1];
          console.log(
            "Extracted tenant ID from URL as fallback:",
            tenantIdToUse
          );
        }
      }

      // Set the tenant ID header if we have one
      if (tenantIdToUse) {
        config.headers["X-Tenant-ID"] = tenantIdToUse;
        console.log("Set X-Tenant-ID header:", tenantIdToUse);
      } else {
        console.warn("No tenant ID available for request:", config.url);
      }
    } else {
      console.log("Skipping tenant ID for auth endpoint:", config.url);
    }

    // Debug logging for important requests
    if (config.url.includes("/dashboard") || config.url.includes("/tenant/")) {
      console.log("API Request Debug:", {
        url: config.url,
        method: config.method,
        hasAuthHeader: !!config.headers.Authorization,
        hasTenantHeader: !!config.headers["X-Tenant-ID"],
        tenantId: config.headers["X-Tenant-ID"],
        selectedTenant: selectedTenant ? JSON.parse(selectedTenant) : null,
      });
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Utility function to get current token state for debugging
export const getCurrentTokenState = () => {
  const selectedTenant = localStorage.getItem("selectedTenant");

  return {
    selectedTenant: selectedTenant ? JSON.parse(selectedTenant) : null,
    sandBoxTestToken: API_CONFIG.sandBoxTestToken,
    productionToken: API_CONFIG.productionToken,
    currentSandboxToken: tokenManager.getSandboxToken(),
    currentProductionToken: tokenManager.getProductionToken(),
  };
};

// Debug function to check token manager state
export const debugTokenManager = () => {
  console.log("=== Token Manager Debug ===");
  console.log("Token Manager:", tokenManager);
  console.log("API_CONFIG.sandBoxTestToken:", API_CONFIG.sandBoxTestToken);
  console.log("API_CONFIG.productionToken:", API_CONFIG.productionToken);
  console.log(
    "API_CONFIG.getCurrentToken('sandbox'):",
    API_CONFIG.getCurrentToken("sandbox")
  );
  console.log("=== End Token Manager Debug ===");
};

export { API_CONFIG, api };
