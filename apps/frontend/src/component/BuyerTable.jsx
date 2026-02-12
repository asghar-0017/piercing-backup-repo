import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import { api } from "../API/Api";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  InputAdornment,
  MenuItem,
  Skeleton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import CustomPagination from "./CustomPagination";
import PermissionGate from "./PermissionGate";

export default function BuyerTable({
  buyers,
  loading,
  onEdit,
  onDelete,
  onAdd,
  onUpload,
  selectedTenant,
  onBulkDeleted,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [goToPage, setGoToPage] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Filter buyers by search (all main fields)
  const filteredBuyers = buyers.filter((buyer) => {
    const searchLower = search.trim().toLowerCase();
    return (
      (buyer.buyerNTNCNIC || "").toLowerCase().includes(searchLower) ||
      (buyer.buyerBusinessName || "").toLowerCase().includes(searchLower) ||
      (buyer.buyerProvince || "").toLowerCase().includes(searchLower) ||
      (buyer.buyerAddress || "").toLowerCase().includes(searchLower) ||
      (buyer.buyerRegistrationType || "").toLowerCase().includes(searchLower)
    );
  });

  // Pagination logic
  const totalPages =
    rowsPerPage === "All" ? 1 : Math.ceil(filteredBuyers.length / rowsPerPage);
  const paginatedBuyers =
    rowsPerPage === "All"
      ? filteredBuyers
      : filteredBuyers.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [search, rowsPerPage]);

  return (
    <Box sx={{ p: { xs: 1, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
      {loading ? (
        <Box sx={{ p: { xs: 1, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
          {/* Header Section Skeleton */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 3,
            }}
          >
            <Skeleton variant="text" width={200} height={40} />
            <Box sx={{ flexGrow: 1 }} />
            <Skeleton variant="rounded" width={120} height={36} />
          </Box>

          {/* Search and Controls Skeleton */}
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <Skeleton variant="rounded" width={260} height={40} />
            <Skeleton variant="rounded" width={120} height={40} />
          </Box>

          {/* Table Skeleton */}
          <TableContainer
            component={Paper}
            elevation={4}
            sx={{ borderRadius: 3, overflow: "hidden", boxShadow: 4 }}
          >
            <Table
              size="small"
              sx={{
                minWidth: 650,
                "& .MuiTableCell-root": { py: 1.9, px: 1, fontSize: 12 },
                "& .MuiTableCell-head": {
                  py: 0.75,
                  fontSize: 13,
                  fontWeight: 700,
                },
              }}
            >
              <TableHead>
                <TableRow sx={{ background: "#EDEDED" }}>
                  {[...Array(7)].map((_, index) => (
                    <TableCell key={index}>
                      <Skeleton variant="text" width={80} height={20} />
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {[...Array(5)].map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {[...Array(7)].map((_, colIndex) => (
                      <TableCell key={`${rowIndex}-${colIndex}`}>
                        <Skeleton
                          variant="text"
                          width={colIndex === 6 ? 120 : 100}
                          height={16}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Pagination Skeleton */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mt: 2,
            }}
          >
            <Skeleton variant="text" width={200} height={20} />
            <Skeleton variant="rounded" width={300} height={32} />
          </Box>
        </Box>
      ) : (
        <>
          {/* Header Section */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              mb: 3,
            }}
          >
            <Typography
              variant="h4"
              sx={{
                fontWeight: 600,
                letterSpacing: 1,
                textShadow: "0 2px 8px #e3e3e3",
              }}
            >
              Buyer Management
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <PermissionGate permission="buyer_uploader">
              <Button
                variant="outlined"
                color="primary"
                onClick={() => onUpload()}
                sx={{ mr: 1 }}
              >
                Upload CSV
              </Button>
            </PermissionGate>
            <PermissionGate permission="buyer.delete">
              <Button
                variant="outlined"
                color="primary"
                onClick={() => {
                  setSelectMode((prev) => !prev);
                  if (selectMode) setSelectedIds(new Set());
                }}
                sx={{ mr: 1, minWidth: 80 }}
              >
                {selectMode ? "Cancel" : "Select"}
              </Button>
            </PermissionGate>
            {selectMode && (
              <PermissionGate permission="buyer.delete">
                <Button
                  variant="outlined"
                  color="error"
                  disabled={bulkDeleteLoading || selectedIds.size === 0}
                  onClick={async () => {
                    if (!selectedTenant) return;
                    const ids = Array.from(selectedIds);
                    const result = await Swal.fire({
                      title: "Delete Selected Buyers",
                      text: `Are you sure you want to delete ${ids.length} selected buyer(s)?`,
                      icon: "warning",
                      showCancelButton: true,
                      confirmButtonColor: "#d33",
                      cancelButtonColor: "#3085d6",
                      confirmButtonText: "Yes, delete",
                      cancelButtonText: "Cancel",
                      reverseButtons: true,
                    });
                    if (!result.isConfirmed) return;
                    try {
                      setBulkDeleteLoading(true);
                      const successes = [];
                      const failures = [];
                      for (const id of ids) {
                        try {
                          const response = await api.delete(
                            `/tenant/${selectedTenant.tenant_id}/buyers/${id}`,
                          );
                          if (response.data?.success) successes.push(id);
                          else
                            failures.push({
                              id,
                              message: response.data?.message || "Failed",
                            });
                        } catch (err) {
                          failures.push({
                            id,
                            message:
                              err.response?.data?.message ||
                              err.message ||
                              "Error",
                          });
                        }
                      }
                      if (successes.length > 0) {
                        onBulkDeleted && onBulkDeleted(successes);
                      }
                      if (failures.length === 0) {
                        Swal.fire({
                          icon: "success",
                          title: "Deleted",
                          text: `${successes.length} buyer(s) deleted.`,
                          confirmButtonColor: "#28a745",
                        });
                      } else if (successes.length === 0) {
                        Swal.fire({
                          icon: "error",
                          title: "Deletion Failed",
                          text: failures.map((f) => f.message).join("\n"),
                          confirmButtonColor: "#d33",
                        });
                      } else {
                        Swal.fire({
                          icon: "warning",
                          title: "Partial Delete",
                          text: `${successes.length} deleted, ${failures.length} failed.`,
                          confirmButtonColor: "#ff9800",
                        });
                      }
                      setSelectedIds(new Set());
                      setSelectMode(false);
                    } finally {
                      setBulkDeleteLoading(false);
                    }
                  }}
                >
                  {bulkDeleteLoading ? "Deleting..." : "Delete Selected"}
                </Button>
              </PermissionGate>
            )}
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => {
                // Define headers for the CSV
                const headers = [
                  "S.No",
                  "NTN/CNIC",
                  "Business Name",
                  "Phone Number",
                  "Province",
                  "Address",
                  "Registration Type",
                  "Created By",
                ];

                // Map buyers data to rows
                const rows = buyers.map((buyer, index) => [
                  index + 1,
                  buyer.buyerNTNCNIC || "",
                  buyer.buyerBusinessName || "",
                  buyer.buyerPhoneNumber || "",
                  buyer.buyerProvince || "",
                  buyer.buyerAddress || "",
                  buyer.buyerRegistrationType || "",
                  buyer.created_by_name
                    ? `${buyer.created_by_name} (${buyer.created_by_user_id || ""})`
                    : buyer.created_by_email || "-",
                ]);

                // Combine headers and rows
                const csvContent = [
                  headers.join(","),
                  ...rows.map((row) =>
                    row
                      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
                      .join(","),
                  ),
                ].join("\n");

                // Create a blob and trigger download
                const blob = new Blob([csvContent], {
                  type: "text/csv;charset=utf-8;",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.setAttribute("href", url);
                link.setAttribute(
                  "download",
                  `buyers_export_${new Date().toISOString().slice(0, 10)}.csv`,
                );
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              sx={{ mr: 1 }}
            >
              Export Buyers
            </Button>
            <PermissionGate permission="buyer.create">
              <Button
                variant="contained"
                color="primary"
                onClick={() => onAdd()}
              >
                Add Buyer
              </Button>
            </PermissionGate>
          </Box>

          {/* Search and Controls */}
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
            <TextField
              variant="outlined"
              size="small"
              placeholder="Search by any field"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{
                minWidth: 260,
                "& .MuiOutlinedInput-root": { borderRadius: "8px" },
                "& input::placeholder": { fontSize: "0.8rem", opacity: 1 },
              }}
            />
            <TextField
              select
              label="Rows per page"
              size="small"
              value={rowsPerPage}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "All") {
                  setRowsPerPage("All");
                } else {
                  setRowsPerPage(Number(value));
                }
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

          {/* Empty State or Table */}
          {paginatedBuyers.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 8, color: "#90a4ae" }}>
              <SentimentDissatisfiedIcon sx={{ fontSize: 60, mb: 2 }} />
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                No buyers found
              </Typography>
              <Typography variant="body2">
                Try adjusting your search.
              </Typography>
            </Box>
          ) : (
            <>
              <TableContainer
                component={Paper}
                elevation={4}
                sx={{ borderRadius: 3, overflow: "hidden", boxShadow: 4 }}
              >
                <Table
                  size="small"
                  sx={{
                    minWidth: 650,
                    "& .MuiTableCell-root": { py: 1.9, px: 1, fontSize: 12 },
                    "& .MuiTableCell-head": {
                      py: 0.75,
                      fontSize: 13,
                      fontWeight: 700,
                    },
                  }}
                  aria-label="buyer table"
                >
                  <TableHead>
                    <TableRow sx={{ background: "#EDEDED" }}>
                      {selectMode && (
                        <TableCell align="center" sx={{ width: 50 }}>
                          <input
                            type="checkbox"
                            checked={
                              paginatedBuyers.length > 0 &&
                              paginatedBuyers.every((b) =>
                                selectedIds.has(b.id),
                              )
                            }
                            onChange={() => {
                              const allVisibleSelected = paginatedBuyers.every(
                                (b) => selectedIds.has(b.id),
                              );
                              const next = new Set(selectedIds);
                              if (allVisibleSelected) {
                                paginatedBuyers.forEach((b) =>
                                  next.delete(b.id),
                                );
                              } else {
                                paginatedBuyers.forEach((b) => next.add(b.id));
                              }
                              setSelectedIds(next);
                            }}
                          />
                        </TableCell>
                      )}
                      {[
                        "S.No",
                        "NTN/CNIC",
                        "Business Name",
                        "Province",
                        "Address",
                        "Registration Type",
                        "Created By",
                        "Actions",
                      ].map((heading) => (
                        <TableCell
                          key={heading}
                          align={
                            heading === "S.No" ||
                            heading === "NTN/CNIC" ||
                            heading === "Business Name"
                              ? "left"
                              : "center"
                          }
                          sx={{
                            fontWeight: "bold",
                            fontSize: 13,
                            letterSpacing: 0.3,
                          }}
                        >
                          {heading}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedBuyers.map((buyer, index) => (
                      <TableRow
                        key={buyer.id || index}
                        sx={{
                          "&:hover": {
                            backgroundColor: "#EDEDED",
                            transition: "background-color 0.3s",
                          },
                        }}
                      >
                        {selectMode && (
                          <TableCell align="center" sx={{ width: 50 }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(buyer.id)}
                              onChange={() => {
                                const next = new Set(selectedIds);
                                if (next.has(buyer.id)) next.delete(buyer.id);
                                else next.add(buyer.id);
                                setSelectedIds(next);
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{ fontWeight: 700, fontSize: 13 }}
                        >
                          {rowsPerPage === "All"
                            ? index + 1
                            : (page - 1) * rowsPerPage + index + 1}
                        </TableCell>
                        <TableCell
                          component="th"
                          scope="row"
                          sx={{ fontWeight: 700, fontSize: 13 }}
                        >
                          {buyer.buyerNTNCNIC}
                        </TableCell>
                        <TableCell align="left" sx={{ fontWeight: 500 }}>
                          {buyer.buyerBusinessName}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 500 }}>
                          {buyer.buyerProvince}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 500 }}>
                          {buyer.buyerAddress}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 500 }}>
                          {buyer.buyerRegistrationType}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 500 }}>
                          {buyer.created_by_name
                            ? `${buyer.created_by_name} (${buyer.created_by_user_id || ""})`
                            : buyer.created_by_email || "-"}
                        </TableCell>
                        <TableCell align="center">
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "center",
                              gap: 1,
                            }}
                          >
                            <PermissionGate permission="buyer.update">
                              <Button
                                onClick={() => onEdit(buyer)}
                                variant="outlined"
                                color="primary"
                                size="small"
                                sx={{
                                  px: 0.75,
                                  py: 0.25,
                                  minWidth: "auto",
                                  fontSize: 11,
                                  lineHeight: 1.4,
                                  "&:hover": {
                                    backgroundColor: "primary.main",
                                    color: "primary.contrastText",
                                    borderColor: "primary.main",
                                  },
                                }}
                              >
                                Edit
                              </Button>
                            </PermissionGate>
                            <PermissionGate permission="buyer.delete">
                              <Button
                                onClick={() => onDelete(buyer.id)}
                                variant="outlined"
                                color="error"
                                size="small"
                                sx={{
                                  px: 0.75,
                                  py: 0.25,
                                  minWidth: "auto",
                                  fontSize: 11,
                                  lineHeight: 1.4,
                                  "&:hover": {
                                    backgroundColor: "error.main",
                                    color: "error.contrastText",
                                    borderColor: "error.main",
                                  },
                                }}
                              >
                                Delete
                              </Button>
                            </PermissionGate>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination Controls */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mt: 2,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {rowsPerPage === "All"
                    ? `Showing all ${filteredBuyers.length} buyers`
                    : `Showing ${(page - 1) * rowsPerPage + 1} to ${Math.min(page * rowsPerPage, filteredBuyers.length)} of ${filteredBuyers.length} buyers`}
                </Typography>
                {rowsPerPage !== "All" && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <CustomPagination
                      count={totalPages}
                      page={page}
                      onChange={(_, value) => setPage(value)}
                      showFirstButton
                      showLastButton
                      size="small"
                    />
                  </Box>
                )}
              </Box>
            </>
          )}
        </>
      )}
    </Box>
  );
}
