import axios from "axios";

// FBR API base URL
const FBR_BASE_URL = "https://gw.fbr.gov.pk";

export const fetchData = async (
  endpoint,
  environment = "sandbox",
  token = null,
) => {
  if (!token) {
    throw new Error(`No ${environment} token provided for FBR API calls`);
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.get(`${FBR_BASE_URL}/${endpoint}`, config);

    console.log("FBR API Response:", {
      endpoint,
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("FBR API Error:", {
      endpoint,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
};

// New function to fetch document types from FBR
export const getDocumentTypes = async (
  environment = "sandbox",
  token = null,
) => {
  if (!token) {
    throw new Error(`No ${environment} token provided for FBR API calls`);
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.get(
      `${FBR_BASE_URL}/pdi/v1/doctypecode`,
      config,
    );

    console.log("FBR Document Types API Response:", {
      endpoint: "pdi/v1/doctypecode",
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("FBR Document Types API Error:", {
      endpoint: "pdi/v1/doctypecode",
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
};

// New function to fetch provinces from FBR
export const getProvinces = async (environment = "sandbox", token = null) => {
  if (!token) {
    throw new Error(`No ${environment} token provided for FBR API calls`);
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.get(
      `${FBR_BASE_URL}/pdi/v1/provinces`,
      config,
    );

    console.log("FBR Provinces API Response:", {
      endpoint: "pdi/v1/provinces",
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("FBR Provinces API Error:", {
      endpoint: "pdi/v1/provinces",
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
};

// New function to validate invoice data with FBR
export const validateInvoiceData = async (
  invoiceData,
  environment = "production",
  token = null,
) => {
  if (!token) {
    throw new Error(`No ${environment} token provided for FBR API calls`);
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await axios.post(
      `${FBR_BASE_URL}/di_data/v1/di/validateinvoicedata_sb`,
      invoiceData,
      config,
    );

    console.log("FBR Invoice Validation API Response:", {
      endpoint: "di_data/v1/di/validateinvoicedata",
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("FBR Invoice Validation API Error:", {
      endpoint: "di_data/v1/di/validateinvoicedata",
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
};

// New function to submit invoice data to FBR
export const submitInvoiceData = async (
  invoiceData,
  environment = "production",
  token = null,
) => {
  if (!token) {
    throw new Error(`No ${environment} token provided for FBR API calls`);
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  try {
    const response = await axios.post(
      `${FBR_BASE_URL}/di_data/v1/di/postinvoicedata_sb`,
      invoiceData,
      config,
    );

    console.log("FBR Invoice Submission API Response:", {
      endpoint: "di_data/v1/di/postinvoicedata",
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("FBR Invoice Submission API Error:", {
      endpoint: "di_data/v1/di/postinvoicedata",
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
};

// New function to fetch SRO Schedule from FBR
export const getSROSchedule = async (
  rateId,
  date = new Date().toISOString().split("T")[0],
  originationSupplierCsv,
  environment = "sandbox",
  token = null,
) => {
  if (!token) {
    throw new Error(`No ${environment} token provided for FBR API calls`);
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.get(
      `${FBR_BASE_URL}/pdi/v1/SroSchedule?rate_id=${encodeURIComponent(rateId)}&date=${encodeURIComponent(date)}&origination_supplier_csv=${encodeURIComponent(originationSupplierCsv)}`,
      config,
    );

    console.log("FBR SRO Schedule API Response:", {
      endpoint: "pdi/v1/SroSchedule",
      rateId,
      date,
      originationSupplierCsv,
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("FBR SRO Schedule API Error:", {
      endpoint: "pdi/v1/SroSchedule",
      rateId,
      date,
      originationSupplierCsv,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
};

// New function to fetch SRO Items from FBR
export const getSROItems = async (
  sroId,
  date = new Date().toISOString().split("T")[0],
  environment = "sandbox",
  token = null,
) => {
  if (!token) {
    throw new Error(`No ${environment} token provided for FBR API calls`);
  }

  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  try {
    const response = await axios.get(
      `${FBR_BASE_URL}/pdi/v2/SROItem?date=${encodeURIComponent(date)}&sro_id=${encodeURIComponent(sroId)}`,
      config,
    );

    console.log("FBR SRO Items API Response:", {
      endpoint: "pdi/v2/SROItem",
      sroId,
      date,
      status: response.status,
      data: response.data,
    });

    return response.data;
  } catch (error) {
    console.error("FBR SRO Items API Error:", {
      endpoint: "pdi/v2/SROItem",
      sroId,
      date,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw error;
  }
};
