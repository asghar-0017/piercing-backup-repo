import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Tabs,
  Tab,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Skeleton,
  IconButton,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Snackbar,
  Chip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import CloseIcon from "@mui/icons-material/Close";
import Swal from "sweetalert2";
import { toast } from "react-toastify";
import { api } from "../API/Api";
import CustomPagination from "../component/CustomPagination";
import TenantSelectionPrompt from "../component/TenantSelectionPrompt";
import { useTenantSelection } from "../Context/TenantSelectionProvider";

// LocalStorage Keys helper
const getShipToKey = (tenantId) => `shipto_tenant_${tenantId}`;
const getBillToKey = (tenantId) => `billto_tenant_${tenantId}`;

export default function BillToShipTo() {
  const { selectedTenant } = useTenantSelection();

  // Current tab (0 = SHIP TO, 1 = BILL TO)
  const [tabValue, setTabValue] = useState(0);

  // --- SHIP TO Tab States (Preserved) ---
  const [shipToData, setShipToData] = useState([]);
  const [shipToSearch, setShipToSearch] = useState("");
  const [shipToPage, setShipToPage] = useState(1);
  const [shipToRowsPerPage, setShipToRowsPerPage] = useState(10);
  const [shipToLoading, setShipToLoading] = useState(false);

  // --- BILL TO Tab States (Preserved) ---
  const [billToData, setBillToData] = useState([]);
  const [billToSearch, setBillToSearch] = useState("");
  const [billToPage, setBillToPage] = useState(1);
  const [billToRowsPerPage, setBillToRowsPerPage] = useState(10);
  const [billToLoading, setBillToLoading] = useState(false);

  // --- BUYERS State ---
  const [buyersData, setBuyersData] = useState([]);
  const [buyersLoading, setBuyersLoading] = useState(false);

  // --- Modal States ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState("SHIP"); // "SHIP" or "BILL"
  const [editingRecord, setEditingRecord] = useState(null); // null means ADD mode

  // Form Fields
  const [shipForm, setShipForm] = useState({
    name: "",
    address: "",
    contactPerson: "",
    contactNo: "",
    cnic: "",
    ntn: "",
  });

  const [billForm, setBillForm] = useState({
    name: "",
    address: "",
    refNo: "",
    ntn: "",
    strn: "",
  });

  const [validationErrors, setValidationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Alert/Toast states inside modal
  const [modalError, setModalError] = useState("");

  // --- Fetch Logic (with LocalStorage fallbacks) ---
  const fetchShipTo = async (tenantId) => {
    setShipToLoading(true);
    try {
      const response = await api.get(`/tenant/${tenantId}/ship-to`, { params: { limit: "All" } }).catch(() => null);
      if (response && response.data && response.data.success) {
        setShipToData(response.data.data || []);
      } else {
        // Fallback
        const local = localStorage.getItem(getShipToKey(tenantId));
        if (local) {
          setShipToData(JSON.parse(local));
        } else {
          setShipToData([]);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setShipToLoading(false);
    }
  };

  const fetchBillTo = async (tenantId) => {
    setBillToLoading(true);
    try {
      const response = await api.get(`/tenant/${tenantId}/bill-to`, { params: { limit: "All" } }).catch(() => null);
      if (response && response.data && response.data.success) {
        setBillToData(response.data.data || []);
      } else {
        // Fallback
        const local = localStorage.getItem(getBillToKey(tenantId));
        if (local) {
          setBillToData(JSON.parse(local));
        } else {
          setBillToData([]);
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setBillToLoading(false);
    }
  };

  const fetchBuyers = async (tenantId) => {
    setBuyersLoading(true);
    try {
      const response = await api.get(`/tenant/${tenantId}/buyers/all`).catch(() => null);
      if (response && response.data && response.data.success) {
        setBuyersData(response.data.data.buyers || []);
      } else {
        setBuyersData([]);
      }
    } catch (error) {
      console.error(error);
      setBuyersData([]);
    } finally {
      setBuyersLoading(false);
    }
  };

  // Fetch when selected tenant changes
  useEffect(() => {
    if (selectedTenant) {
      fetchShipTo(selectedTenant.tenant_id);
      fetchBillTo(selectedTenant.tenant_id);
      fetchBuyers(selectedTenant.tenant_id);
    }
  }, [selectedTenant]);

  // --- Form Validation ---
  const validateShipForm = () => {
    const errors = {};
    if (!shipForm.name.trim()) errors.name = "Name is required";
    if (!shipForm.address.trim()) errors.address = "Address is required";

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateBillForm = () => {
    const errors = {};
    if (!billForm.name.trim()) errors.name = "Name is required";
    if (!billForm.address.trim()) errors.address = "Address is required";

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // --- Modal Reset & Controls ---
  const handleOpenAddModal = (type) => {
    setModalType(type);
    setEditingRecord(null);
    setValidationErrors({});
    setModalError("");
    setIsSubmitting(false);

    if (type === "SHIP") {
      setShipForm({
        name: "",
        address: "",
        contactPerson: "",
        contactNo: "",
        cnic: "",
        ntn: "",
      });
    } else {
      setBillForm({
        name: "",
        address: "",
        refNo: "",
        ntn: "",
        strn: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (type, record) => {
    setModalType(type);
    setEditingRecord(record);
    setValidationErrors({});
    setModalError("");
    setIsSubmitting(false);

    if (type === "SHIP") {
      setShipForm({
        name: record.name || "",
        address: record.address || "",
        contactPerson: record.contactPerson || "",
        contactNo: record.contactNo || "",
        cnic: record.cnic || "",
        ntn: record.ntn || "",
      });
    } else {
      setBillForm({
        name: record.name || "",
        address: record.address || "",
        refNo: record.refNo || "",
        ntn: record.ntn || "",
        strn: record.strn || "",
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setValidationErrors({});
    setModalError("");
  };

  // --- Combine Buyers with Ship To & Bill To ---
  const combinedShipToData = React.useMemo(() => {
    const buyerShipToRecords = buyersData.map((b) => ({
      id: `buyer_ship_${b.id}`,
      name: b.buyerBusinessName || "N/A",
      address: b.buyerAddress || "N/A",
      contactPerson: b.buyerProvince ? `Province: ${b.buyerProvince}` : "-",
      contactNo: b.buyerPhoneNumber || "-",
      cnic: b.buyerNTNCNIC && b.buyerNTNCNIC.length === 13 ? b.buyerNTNCNIC : "-",
      ntn: b.buyerNTNCNIC || "-",
      isBuyer: true,
      rawBuyer: b,
    }));

    const formattedShipTo = shipToData.map((s) => ({
      ...s,
      isBuyer: false,
    }));

    return [...buyerShipToRecords, ...formattedShipTo];
  }, [buyersData, shipToData]);

  const combinedBillToData = React.useMemo(() => {
    const buyerBillToRecords = buyersData.map((b) => ({
      id: `buyer_bill_${b.id}`,
      name: b.buyerBusinessName || "N/A",
      address: b.buyerAddress || "N/A",
      refNo: b.buyerRegistrationType || b.buyerNTNCNIC || "-",
      ntn: b.buyerNTNCNIC || "-",
      strn: "-",
      isBuyer: true,
      rawBuyer: b,
    }));

    const formattedBillTo = billToData.map((b) => ({
      ...b,
      isBuyer: false,
    }));

    return [...buyerBillToRecords, ...formattedBillTo];
  }, [buyersData, billToData]);

  // --- Save / Update Handler ---
  const handleSave = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const tenantId = selectedTenant?.tenant_id;
    if (!tenantId) return;

    if (editingRecord && editingRecord.isBuyer) {
      if (modalType === "SHIP" && !validateShipForm()) return;
      if (modalType === "BILL" && !validateBillForm()) return;
      setIsSubmitting(true);
      try {
        const buyerPayload = {
          buyerBusinessName: modalType === "SHIP" ? shipForm.name : billForm.name,
          buyerAddress: modalType === "SHIP" ? shipForm.address : billForm.address,
          buyerNTNCNIC: modalType === "SHIP" ? shipForm.ntn : billForm.ntn,
          ...(modalType === "SHIP" && shipForm.contactNo && { buyerPhoneNumber: shipForm.contactNo }),
        };

        const response = await api.put(
          `/tenant/${tenantId}/buyers/${editingRecord.rawBuyer.id}`,
          buyerPayload
        );

        if (response && response.data && response.data.success) {
          toast.success("Buyer updated successfully!");
          fetchBuyers(tenantId);
          handleCloseModal();
        } else {
          toast.error(response?.data?.message || "Failed to update buyer.");
        }
      } catch (error) {
        setModalError(error.message || "An error occurred while saving buyer.");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (modalType === "SHIP") {
      if (!validateShipForm()) return;
      setIsSubmitting(true);
      try {
        const payload = { ...shipForm };
        let response = null;
        try {
          if (editingRecord) {
            response = await api.put(`/tenant/${tenantId}/ship-to/${editingRecord.id}`, payload);
          } else {
            response = await api.post(`/tenant/${tenantId}/ship-to`, payload);
          }
        } catch (apiErr) {
          console.warn("Backend API failed", apiErr.message);
          if (apiErr.response) {
            throw apiErr;
          }
        }

        if (response && response.data && response.data.success) {
          // Success from server
          toast.success(editingRecord ? "Ship To updated successfully!" : "Ship To added successfully!");
          fetchShipTo(tenantId);
          handleCloseModal();
        } else {
          // LocalStorage fallback update
          const localData = JSON.parse(localStorage.getItem(getShipToKey(tenantId)) || "[]");
          if (editingRecord) {
            const updated = localData.map((item) =>
              item.id === editingRecord.id ? { ...item, ...payload } : item
            );
            localStorage.setItem(getShipToKey(tenantId), JSON.stringify(updated));
            setShipToData(updated);
            toast.success("Ship To updated successfully!");
          } else {
            const newItem = { id: `s_${Date.now()}`, ...payload };
            const updated = [...localData, newItem];
            localStorage.setItem(getShipToKey(tenantId), JSON.stringify(updated));
            setShipToData(updated);
            toast.success("Ship To added successfully!");
          }
          handleCloseModal();
        }
      } catch (error) {
        setModalError(error.message || "An error occurred while saving.");
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // BILL TO
      if (!validateBillForm()) return;
      setIsSubmitting(true);
      try {
        const payload = { ...billForm };
        let response = null;
        try {
          if (editingRecord) {
            response = await api.put(`/tenant/${tenantId}/bill-to/${editingRecord.id}`, payload);
          } else {
            response = await api.post(`/tenant/${tenantId}/bill-to`, payload);
          }
        } catch (apiErr) {
          console.warn("Backend API failed", apiErr.message);
          if (apiErr.response) {
            throw apiErr;
          }
        }

        if (response && response.data && response.data.success) {
          toast.success(editingRecord ? "Bill To updated successfully!" : "Bill To added successfully!");
          fetchBillTo(tenantId);
          handleCloseModal();
        } else {
          // LocalStorage fallback update
          const localData = JSON.parse(localStorage.getItem(getBillToKey(tenantId)) || "[]");
          if (editingRecord) {
            const updated = localData.map((item) =>
              item.id === editingRecord.id ? { ...item, ...payload } : item
            );
            localStorage.setItem(getBillToKey(tenantId), JSON.stringify(updated));
            setBillToData(updated);
            toast.success("Bill To updated successfully!");
          } else {
            const newItem = { id: `b_${Date.now()}`, ...payload };
            const updated = [...localData, newItem];
            localStorage.setItem(getBillToKey(tenantId), JSON.stringify(updated));
            setBillToData(updated);
            toast.success("Bill To added successfully!");
          }
          handleCloseModal();
        }
      } catch (error) {
        setModalError(error.message || "An error occurred while saving.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // --- Delete Handler ---
  const handleDelete = async (type, recordId, item = null) => {
    const tenantId = selectedTenant?.tenant_id;
    if (!tenantId) return;

    if (item && item.isBuyer) {
      const result = await Swal.fire({
        title: "Delete Buyer Record?",
        text: `This buyer "${item.name}" is part of the Buyers registry. Are you sure you want to delete this buyer?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonColor: "#3085d6",
        confirmButtonText: "Yes, delete buyer!",
        cancelButtonText: "Cancel",
        reverseButtons: true,
      });

      if (result.isConfirmed) {
        try {
          const response = await api.delete(`/tenant/${tenantId}/buyers/${item.rawBuyer.id}`);
          if (response && response.data && response.data.success) {
            toast.success("Buyer deleted successfully!");
            fetchBuyers(tenantId);
          } else {
            toast.error(response?.data?.message || "Failed to delete buyer.");
          }
        } catch (error) {
          toast.error("Error deleting buyer record.");
        }
      }
      return;
    }

    const result = await Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      if (type === "SHIP") {
        setShipToLoading(true);
        try {
          let response = null;
          try {
            response = await api.delete(`/tenant/${tenantId}/ship-to/${recordId}`);
          } catch (apiErr) {
            console.warn("Backend API delete failed, using localStorage fallback");
          }

          if (response && response.data && response.data.success) {
            toast.success("Ship To deleted successfully!");
            fetchShipTo(tenantId);
          } else {
            // LocalStorage fallback
            const localData = JSON.parse(localStorage.getItem(getShipToKey(tenantId)) || "[]");
            const updated = localData.filter((item) => item.id !== recordId);
            localStorage.setItem(getShipToKey(tenantId), JSON.stringify(updated));
            setShipToData(updated);
            toast.success("Ship To deleted successfully!");
          }
        } catch (error) {
          toast.error("Error deleting Ship To record.");
        } finally {
          setShipToLoading(false);
        }
      } else {
        // BILL
        setBillToLoading(true);
        try {
          let response = null;
          try {
            response = await api.delete(`/tenant/${tenantId}/bill-to/${recordId}`);
          } catch (apiErr) {
            console.warn("Backend API delete failed, using localStorage fallback");
          }

          if (response && response.data && response.data.success) {
            toast.success("Bill To deleted successfully!");
            fetchBillTo(tenantId);
          } else {
            // LocalStorage fallback
            const localData = JSON.parse(localStorage.getItem(getBillToKey(tenantId)) || "[]");
            const updated = localData.filter((item) => item.id !== recordId);
            localStorage.setItem(getBillToKey(tenantId), JSON.stringify(updated));
            setBillToData(updated);
            toast.success("Bill To deleted successfully!");
          }
        } catch (error) {
          toast.error("Error deleting Bill To record.");
        } finally {
          setBillToLoading(false);
        }
      }
    }
  };

  // --- Filtering & Paginations ---
  // Ship To Filtering
  const filteredShipTo = combinedShipToData.filter((item) => {
    const term = shipToSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      (item.name || "").toLowerCase().includes(term) ||
      (item.address || "").toLowerCase().includes(term) ||
      (item.contactPerson || "").toLowerCase().includes(term) ||
      (item.contactNo || "").toLowerCase().includes(term) ||
      (item.cnic || "").toLowerCase().includes(term) ||
      (item.ntn || "").toLowerCase().includes(term)
    );
  });

  const totalShipToPages = shipToRowsPerPage === "All" ? 1 : Math.ceil(filteredShipTo.length / shipToRowsPerPage);
  const paginatedShipTo = shipToRowsPerPage === "All"
    ? filteredShipTo
    : filteredShipTo.slice((shipToPage - 1) * shipToRowsPerPage, shipToPage * shipToRowsPerPage);

  // Bill To Filtering
  const filteredBillTo = combinedBillToData.filter((item) => {
    const term = billToSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      (item.name || "").toLowerCase().includes(term) ||
      (item.address || "").toLowerCase().includes(term) ||
      (item.refNo || "").toLowerCase().includes(term) ||
      (item.ntn || "").toLowerCase().includes(term) ||
      (item.strn || "").toLowerCase().includes(term)
    );
  });

  const totalBillToPages = billToRowsPerPage === "All" ? 1 : Math.ceil(filteredBillTo.length / billToRowsPerPage);
  const paginatedBillTo = billToRowsPerPage === "All"
    ? filteredBillTo
    : filteredBillTo.slice((billToPage - 1) * billToRowsPerPage, billToPage * billToRowsPerPage);

  // Reset pagination page when filters change
  useEffect(() => {
    setShipToPage(1);
  }, [shipToSearch, shipToRowsPerPage]);

  useEffect(() => {
    setBillToPage(1);
  }, [billToSearch, billToRowsPerPage]);

  return (
    <TenantSelectionPrompt>
      <Box sx={{ p: { xs: 1, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 600,
              letterSpacing: 1,
              textShadow: "0 2px 8px #e3e3e3",
            }}
          >
            Bill To & Ship To Management
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Manage Bill To and Ship To master records.
          </Typography>
        </Box>

        {/* Tab Interface */}
        <Paper sx={{ mb: 3, borderRadius: 2 }}>
          <Tabs
            value={tabValue}
            onChange={(e, val) => setTabValue(val)}
            indicatorColor="primary"
            textColor="primary"
            variant="fullWidth"
          >
            <Tab label="SHIP TO" sx={{ fontWeight: 600 }} />
            <Tab label="BILL TO" sx={{ fontWeight: 600 }} />
          </Tabs>
        </Paper>

        {/* SHIP TO TAB CONTENT */}
        <Box sx={{ display: tabValue === 0 ? "block" : "none" }}>
          {/* Top Bar */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 2 }}>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", flexGrow: 1 }}>
              <TextField
                variant="outlined"
                size="small"
                placeholder="Search by Name, Address, Contact, CNIC, NTN..."
                value={shipToSearch}
                onChange={(e) => setShipToSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  minWidth: 260,
                  maxWidth: 400,
                  flexGrow: 1,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                  "& input::placeholder": { fontSize: "0.8rem", opacity: 1 },
                }}
              />
              <TextField
                select
                label="Rows per page"
                size="small"
                value={shipToRowsPerPage}
                onChange={(e) => {
                  const val = e.target.value;
                  setShipToRowsPerPage(val === "All" ? "All" : Number(val));
                }}
                sx={{ minWidth: 120 }}
              >
                {[5, 10, 20, 50, "All"].map((num) => (
                  <MenuItem key={num} value={num}>
                    {num}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleOpenAddModal("SHIP")}
              sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
            >
              + ADD SHIP TO
            </Button>
          </Box>

          {/* Table Area */}
          {shipToLoading || buyersLoading ? (
            <TablePlaceholder columnsCount={8} />
          ) : paginatedShipTo.length === 0 ? (
            <EmptyState message="No Ship To records found" />
          ) : (
            <>
              <TableContainer component={Paper} elevation={3} sx={{ borderRadius: 3, overflow: "hidden" }}>
                <Table size="small" sx={{ minWidth: 800, "& .MuiTableCell-root": { py: 1.5, px: 2 } }}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#EDEDED" }}>
                      {["S.No", "Name", "Address", "Contact Person", "Contact No", "CNIC", "NTN", "Actions"].map((col) => (
                        <TableCell key={col} sx={{ fontWeight: "bold", fontSize: 13 }}>
                          {col}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedShipTo.map((item, index) => (
                      <TableRow key={item.id} sx={{ "&:hover": { backgroundColor: "#EDEDED", transition: "background-color 0.2s" } }}>
                        <TableCell sx={{ fontWeight: 700 }}>
                          {shipToRowsPerPage === "All" ? index + 1 : (shipToPage - 1) * shipToRowsPerPage + index + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <span>{item.name}</span>
                            {item.isBuyer && (
                              <Chip
                                label="Buyer"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>{item.address}</TableCell>
                        <TableCell>{item.contactPerson}</TableCell>
                        <TableCell>{item.contactNo}</TableCell>
                        <TableCell>{item.cnic}</TableCell>
                        <TableCell>{item.ntn}</TableCell>
                        <TableCell>
                          <Box display="flex" gap={1}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleOpenEditModal("SHIP", item)}
                              sx={{ py: 0.2, px: 1, minWidth: "auto", fontSize: 11 }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              onClick={() => handleDelete("SHIP", item.id, item)}
                              sx={{ py: 0.2, px: 1, minWidth: "auto", fontSize: 11 }}
                            >
                              Delete
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {shipToRowsPerPage === "All"
                    ? `Showing all ${filteredShipTo.length} records`
                    : `Showing ${(shipToPage - 1) * shipToRowsPerPage + 1} to ${Math.min(shipToPage * shipToRowsPerPage, filteredShipTo.length)} of ${filteredShipTo.length} records`}
                </Typography>
                {shipToRowsPerPage !== "All" && (
                  <CustomPagination
                    count={totalShipToPages}
                    page={shipToPage}
                    onChange={(_, val) => setShipToPage(val)}
                    size="small"
                  />
                )}
              </Box>
            </>
          )}
        </Box>

        {/* BILL TO TAB CONTENT */}
        <Box sx={{ display: tabValue === 1 ? "block" : "none" }}>
          {/* Top Bar */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2, flexWrap: "wrap", gap: 2 }}>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", flexGrow: 1 }}>
              <TextField
                variant="outlined"
                size="small"
                placeholder="Search by Name, Address, Ref No, NTN, STRN..."
                value={billToSearch}
                onChange={(e) => setBillToSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  minWidth: 260,
                  maxWidth: 400,
                  flexGrow: 1,
                  "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                  "& input::placeholder": { fontSize: "0.8rem", opacity: 1 },
                }}
              />
              <TextField
                select
                label="Rows per page"
                size="small"
                value={billToRowsPerPage}
                onChange={(e) => {
                  const val = e.target.value;
                  setBillToRowsPerPage(val === "All" ? "All" : Number(val));
                }}
                sx={{ minWidth: 120 }}
              >
                {[5, 10, 20, 50, "All"].map((num) => (
                  <MenuItem key={num} value={num}>
                    {num}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleOpenAddModal("BILL")}
              sx={{ borderRadius: "8px", textTransform: "none", fontWeight: 600 }}
            >
              + ADD BILL TO
            </Button>
          </Box>

          {/* Table Area */}
          {billToLoading || buyersLoading ? (
            <TablePlaceholder columnsCount={7} />
          ) : paginatedBillTo.length === 0 ? (
            <EmptyState message="No Bill To records found" />
          ) : (
            <>
              <TableContainer component={Paper} elevation={3} sx={{ borderRadius: 3, overflow: "hidden" }}>
                <Table size="small" sx={{ minWidth: 800, "& .MuiTableCell-root": { py: 1.5, px: 2 } }}>
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#EDEDED" }}>
                      {["S.No", "Name", "Address", "Ref No", "NTN", "STRN", "Actions"].map((col) => (
                        <TableCell key={col} sx={{ fontWeight: "bold", fontSize: 13 }}>
                          {col}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedBillTo.map((item, index) => (
                      <TableRow key={item.id} sx={{ "&:hover": { backgroundColor: "#EDEDED", transition: "background-color 0.2s" } }}>
                        <TableCell sx={{ fontWeight: 700 }}>
                          {billToRowsPerPage === "All" ? index + 1 : (billToPage - 1) * billToRowsPerPage + index + 1}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <span>{item.name}</span>
                            {item.isBuyer && (
                              <Chip
                                label="Buyer"
                                size="small"
                                color="primary"
                                variant="outlined"
                                sx={{ height: 20, fontSize: "0.65rem", fontWeight: 700 }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>{item.address}</TableCell>
                        <TableCell>{item.refNo}</TableCell>
                        <TableCell>{item.ntn}</TableCell>
                        <TableCell>{item.strn}</TableCell>
                        <TableCell>
                          <Box display="flex" gap={1}>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => handleOpenEditModal("BILL", item)}
                              sx={{ py: 0.2, px: 1, minWidth: "auto", fontSize: 11 }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              size="small"
                              onClick={() => handleDelete("BILL", item.id, item)}
                              sx={{ py: 0.2, px: 1, minWidth: "auto", fontSize: 11 }}
                            >
                              Delete
                            </Button>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {billToRowsPerPage === "All"
                    ? `Showing all ${filteredBillTo.length} records`
                    : `Showing ${(billToPage - 1) * billToRowsPerPage + 1} to ${Math.min(billToPage * billToRowsPerPage, filteredBillTo.length)} of ${filteredBillTo.length} records`}
                </Typography>
                {billToRowsPerPage !== "All" && (
                  <CustomPagination
                    count={totalBillToPages}
                    page={billToPage}
                    onChange={(_, val) => setBillToPage(val)}
                    size="small"
                  />
                )}
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* --- ADD / EDIT FROSTED GLASS MODAL --- */}
      {isModalOpen && (
        <>
          {/* Animated liquid background behind modal */}
          <Box
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              zIndex: 1299,
              background: `
                radial-gradient(circle at 10% 70%, rgba(120, 119, 198, 0.25) 0%, transparent 60%),
                radial-gradient(circle at 90% 10%, rgba(119, 167, 255, 0.25) 0%, transparent 60%)
              `,
              animation: "liquidFloat 8s ease-in-out infinite alternate",
              "@keyframes liquidFloat": {
                "0%": { transform: "scale(1) rotate(0deg)" },
                "100%": { transform: "scale(1.05) rotate(1deg)" },
              },
            }}
          />

          {/* Main Dialog Modal */}
          <Box
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              backgroundColor: "rgba(0, 0, 0, 0.25)",
              backdropFilter: "blur(6px)",
              zIndex: 1300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: { xs: 1, sm: 2 },
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseModal();
            }}
          >
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, sm: 3 },
                width: { xs: "95%", sm: "80%", md: "60%" },
                maxWidth: 450,
                borderRadius: 3,
                position: "relative",
                backgroundColor: "rgba(255, 255, 255, 0.65)",
                backdropFilter: "blur(25px) saturate(190%)",
                border: "1px solid rgba(255, 255, 255, 0.4)",
                boxShadow: `
                  0 12px 36px rgba(0, 0, 0, 0.15),
                  0 4px 12px rgba(0, 0, 0, 0.1),
                  inset 0 1px 0 rgba(255, 255, 255, 0.7)
                `,
                animation: "modalSlideUp 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                "@keyframes modalSlideUp": {
                  "0%": { opacity: 0, transform: "translateY(25px) scale(0.96)" },
                  "100%": { opacity: 1, transform: "translateY(0) scale(1)" },
                },
              }}
            >
              {/* Close Button */}
              <IconButton
                onClick={handleCloseModal}
                sx={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  backgroundColor: "rgba(0, 0, 0, 0.05)",
                  color: "#555",
                  width: 32,
                  height: 32,
                  "&:hover": {
                    backgroundColor: "rgba(0, 0, 0, 0.1)",
                    transform: "scale(1.1)",
                  },
                  transition: "all 0.2s ease-in-out",
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>

              {/* Title */}
              <Typography
                variant="h5"
                fontWeight={600}
                align="center"
                sx={{ mb: 3, color: "#111", fontSize: "1.25rem", letterSpacing: "-0.01em" }}
              >
                {editingRecord
                  ? `Edit ${modalType === "SHIP" ? "Ship To" : "Bill To"}`
                  : `Add ${modalType === "SHIP" ? "Ship To" : "Bill To"}`}
              </Typography>

              {modalError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                  {modalError}
                </Alert>
              )}

              {/* Forms */}
              <Box component="form" onSubmit={handleSave} noValidate>
                <Stack spacing={2}>
                  {modalType === "SHIP" ? (
                    <>
                      {/* SHIP TO FORM */}
                      <TextField
                        fullWidth
                        size="small"
                        label="Name"
                        value={shipForm.name}
                        onChange={(e) => setShipForm({ ...shipForm, name: e.target.value })}
                        error={!!validationErrors.name}
                        helperText={validationErrors.name}
                        required
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        rows={2}
                        label="Address"
                        value={shipForm.address}
                        onChange={(e) => setShipForm({ ...shipForm, address: e.target.value })}
                        error={!!validationErrors.address}
                        helperText={validationErrors.address}
                        required
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Contact Person"
                        value={shipForm.contactPerson}
                        onChange={(e) => setShipForm({ ...shipForm, contactPerson: e.target.value })}
                        error={!!validationErrors.contactPerson}
                        helperText={validationErrors.contactPerson}
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Contact No"
                        value={shipForm.contactNo}
                        onChange={(e) => setShipForm({ ...shipForm, contactNo: e.target.value })}
                        error={!!validationErrors.contactNo}
                        helperText={validationErrors.contactNo}
                        placeholder="e.g. 03001234567"
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="CNIC"
                        value={shipForm.cnic}
                        onChange={(e) => setShipForm({ ...shipForm, cnic: e.target.value })}
                        error={!!validationErrors.cnic}
                        helperText={validationErrors.cnic}
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="NTN"
                        value={shipForm.ntn}
                        onChange={(e) => setShipForm({ ...shipForm, ntn: e.target.value })}
                        error={!!validationErrors.ntn}
                        helperText={validationErrors.ntn}
                        sx={frostedFieldStyles}
                      />
                    </>
                  ) : (
                    <>
                      {/* BILL TO FORM */}
                      <TextField
                        fullWidth
                        size="small"
                        label="Name"
                        value={billForm.name}
                        onChange={(e) => setBillForm({ ...billForm, name: e.target.value })}
                        error={!!validationErrors.name}
                        helperText={validationErrors.name}
                        required
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        multiline
                        rows={2}
                        label="Address"
                        value={billForm.address}
                        onChange={(e) => setBillForm({ ...billForm, address: e.target.value })}
                        error={!!validationErrors.address}
                        helperText={validationErrors.address}
                        required
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="Ref No"
                        value={billForm.refNo}
                        onChange={(e) => setBillForm({ ...billForm, refNo: e.target.value })}
                        error={!!validationErrors.refNo}
                        helperText={validationErrors.refNo}
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="NTN"
                        value={billForm.ntn}
                        onChange={(e) => setBillForm({ ...billForm, ntn: e.target.value })}
                        error={!!validationErrors.ntn}
                        helperText={validationErrors.ntn}
                        sx={frostedFieldStyles}
                      />
                      <TextField
                        fullWidth
                        size="small"
                        label="STRN"
                        value={billForm.strn}
                        onChange={(e) => setBillForm({ ...billForm, strn: e.target.value })}
                        error={!!validationErrors.strn}
                        helperText={validationErrors.strn}
                        sx={frostedFieldStyles}
                      />
                    </>
                  )}

                  {/* Actions */}
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    <Button
                      type="submit"
                      variant="contained"
                      fullWidth
                      disabled={isSubmitting}
                      sx={{
                        backgroundColor: "#007AFF",
                        color: "white",
                        fontWeight: 600,
                        py: 1,
                        borderRadius: 2,
                        textTransform: "none",
                        boxShadow: "0 4px 20px rgba(0, 122, 255, 0.25)",
                        "&:hover": {
                          backgroundColor: "#0056CC",
                          transform: "translateY(-1px)",
                          boxShadow: "0 6px 25px rgba(0, 122, 255, 0.35)",
                        },
                        transition: "all 0.2s ease-in-out",
                      }}
                    >
                      {isSubmitting ? (
                        <CircularProgress size={20} sx={{ color: "white" }} />
                      ) : (
                        "Save"
                      )}
                    </Button>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={handleCloseModal}
                      sx={{
                        color: "#555",
                        borderColor: "rgba(0, 0, 0, 0.15)",
                        borderRadius: 2,
                        py: 1,
                        textTransform: "none",
                        "&:hover": {
                          backgroundColor: "rgba(0, 0, 0, 0.05)",
                          borderColor: "rgba(0, 0, 0, 0.25)",
                        },
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Paper>
          </Box>
        </>
      )}
    </TenantSelectionPrompt>
  );
}

// --- Styles & Helper Components ---

const frostedFieldStyles = {
  "& .MuiOutlinedInput-root": {
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    borderRadius: 2,
    "& fieldset": { borderColor: "rgba(0, 0, 0, 0.12)" },
    "&:hover fieldset": { borderColor: "rgba(0, 0, 0, 0.25)" },
    "&.Mui-focused fieldset": { borderColor: "#007AFF", borderWidth: 2 },
  },
  "& .MuiInputLabel-root": { color: "#333", fontWeight: 500 },
};

function TablePlaceholder({ columnsCount }) {
  return (
    <TableContainer component={Paper} elevation={3} sx={{ borderRadius: 3, overflow: "hidden" }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ backgroundColor: "#EDEDED" }}>
            {[...Array(columnsCount)].map((_, i) => (
              <TableCell key={i}>
                <Skeleton variant="text" width={80} height={24} />
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {[...Array(5)].map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {[...Array(columnsCount)].map((_, colIndex) => (
                <TableCell key={colIndex}>
                  <Skeleton variant="text" width={colIndex === 0 ? 30 : 100} height={18} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function EmptyState({ message }) {
  return (
    <Paper
      elevation={2}
      sx={{
        textAlign: "center",
        py: 8,
        color: "#90a4ae",
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SentimentDissatisfiedIcon sx={{ fontSize: 60, mb: 2, color: "#b0bec5" }} />
      <Typography variant="h6" sx={{ fontWeight: 700, color: "#78909c" }}>
        {message}
      </Typography>
      <Typography variant="body2" sx={{ color: "#90a4ae", mt: 0.5 }}>
        Try adjusting your search criteria or add a new record.
      </Typography>
    </Paper>
  );
}
