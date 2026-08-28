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
  CircularProgress,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import SentimentDissatisfiedIcon from "@mui/icons-material/SentimentDissatisfied";
import CustomPagination from "./CustomPagination";
import PermissionGate from "./PermissionGate";

export default function ProductTable({
  products,
  loading,
  onEdit,
  onDelete,
  onAdd,
  selectedTenant,
  onBulkDeleted,
  onUpload,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Filter products by search (all main fields)
  const filteredProducts = products.filter((product) => {
    const searchLower = search.trim().toLowerCase();
    return (
      (product.name || "").toLowerCase().includes(searchLower) ||
      (product.description || "").toLowerCase().includes(searchLower) ||
      (product.weight || "").toLowerCase().includes(searchLower) ||
      (product.hsCode || "").toLowerCase().includes(searchLower)
    );
  });

  // Pagination logic
  const totalPages = rowsPerPage === "All" ? 1 : Math.ceil(filteredProducts.length / rowsPerPage);
  const paginatedProducts = rowsPerPage === "All" 
    ? filteredProducts 
    : filteredProducts.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  useEffect(() => {
    setPage(1);
  }, [search, rowsPerPage]);

  if (loading) {
    return (
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
              <TableRow>
                <TableCell>S.No</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>HS Code</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {[...Array(5)].map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Skeleton variant="text" width={40} height={20} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={120} height={20} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={150} height={20} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={80} height={20} />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="text" width={80} height={20} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 3 }, maxWidth: 1200, mx: "auto" }}>
      {/* Header Section */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          mb: 3,
          flexWrap: "wrap",
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
          Products Management
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <PermissionGate permission="product.view">
          <Button
            variant="outlined"
            color="primary"
            onClick={() => {
              setSelectMode((prev) => !prev);
              if (selectMode) setSelectedIds(new Set());
            }}
            sx={{ minWidth: 80 }}
          >
            {selectMode ? "Cancel" : "Select"}
          </Button>
        </PermissionGate>
        {selectMode && (
          <PermissionGate permission="product.delete">
            <Button
              variant="outlined"
              color="error"
              disabled={bulkDeleteLoading || selectedIds.size === 0}
              onClick={async () => {
              if (!selectedTenant) return;
              const ids = Array.from(selectedIds);
              const result = await Swal.fire({
                title: "Delete Selected Products",
                text: `Are you sure you want to delete ${ids.length} selected product(s)?`,
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
                    await api.delete(
                      `/tenant/${selectedTenant.tenant_id}/products/${id}`
                    );
                    successes.push(id);
                  } catch (error) {
                    console.error(`Failed to delete product ${id}:`, error);
                    failures.push(id);
                  }
                }

                if (failures.length === 0) {
                  Swal.fire({
                    icon: "success",
                    title: "Success",
                    text: `Successfully deleted ${successes.length} product(s)`,
                    timer: 2000,
                    showConfirmButton: false,
                  });
                  onBulkDeleted(successes);
                  setSelectedIds(new Set());
                  setSelectMode(false);
                } else {
                  Swal.fire({
                    icon: "warning",
                    title: "Partial Success",
                    text: `Deleted ${successes.length} products, ${failures.length} failed.`,
                  });
                  if (successes.length > 0) {
                    onBulkDeleted(successes);
                    setSelectedIds(new Set());
                    setSelectMode(false);
                  }
                }
              } catch (error) {
                console.error("Bulk delete error:", error);
                Swal.fire({
                  icon: "error",
                  title: "Error",
                  text: "An error occurred during bulk delete",
                });
              } finally {
                setBulkDeleteLoading(false);
              }
            }}
            startIcon={
              bulkDeleteLoading ? <CircularProgress size={16} /> : null
            }
          >
            {bulkDeleteLoading
              ? "Deleting..."
              : `Delete Selected (${selectedIds.size})`}
          </Button>
          </PermissionGate>
        )}
        <PermissionGate permission="product_uploader">
          <Button
            variant="outlined"
            color="primary"
            onClick={onUpload}
            sx={{ ml: 1 }}
          >
            Upload Products
          </Button>
        </PermissionGate>
        <PermissionGate permission="product.create">
          <Button variant="contained" color="primary" onClick={onAdd}>
            Add Product
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
      {paginatedProducts.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8, color: "#90a4ae" }}>
          <SentimentDissatisfiedIcon sx={{ fontSize: 60, mb: 2 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No products found
          </Typography>
          <Typography variant="body2">
            {search
              ? "Try adjusting your search."
              : "Start by adding your first product."}
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
              aria-label="product table"
            >
              <TableHead>
                <TableRow sx={{ background: "#EDEDED" }}>
                  {selectMode && (
                    <PermissionGate permission="product.view" hide>
                      <TableCell align="center" sx={{ width: 50 }}>
                        <input
                          type="checkbox"
                          checked={
                            paginatedProducts.length > 0 &&
                            paginatedProducts.every((p) => selectedIds.has(p.id))
                          }
                          onChange={() => {
                            const allVisibleSelected = paginatedProducts.every(
                              (p) => selectedIds.has(p.id)
                            );
                            const next = new Set(selectedIds);
                            if (allVisibleSelected) {
                              paginatedProducts.forEach((p) => next.delete(p.id));
                            } else {
                              paginatedProducts.forEach((p) => next.add(p.id));
                            }
                            setSelectedIds(next);
                          }}
                        />
                      </TableCell>
                    </PermissionGate>
                  )}
                  {[
                    "S.No",
                    "Name",
                    "Description",
                    "Weight",
                    "HS Code",
                    "Created By",
                    "Actions",
                  ].map((heading) => (
                    <TableCell
                      key={heading}
                      align={
                        heading === "S.No" || heading === "Name"
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
                {paginatedProducts.map((product, index) => (
                  <TableRow
                    key={product.id || index}
                    sx={{
                      "&:hover": {
                        backgroundColor: "#EDEDED",
                        transition: "background-color 0.3s",
                      },
                    }}
                  >
                    {selectMode && (
                      <PermissionGate permission="product.view">
                        <TableCell align="center" sx={{ width: 50 }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(product.id)}
                            onChange={() => {
                              const next = new Set(selectedIds);
                              if (next.has(product.id)) next.delete(product.id);
                              else next.add(product.id);
                              setSelectedIds(next);
                            }}
                          />
                        </TableCell>
                      </PermissionGate>
                    )}
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{ fontWeight: 700, fontSize: 13 }}
                    >
                      {rowsPerPage === "All" ? index + 1 : (page - 1) * rowsPerPage + index + 1}
                    </TableCell>
                    <TableCell
                      component="th"
                      scope="row"
                      sx={{ fontWeight: 700, fontSize: 13 }}
                    >
                      {product.name}
                    </TableCell>
                    <TableCell align="left" sx={{ fontWeight: 500 }}>
                      {product.description || "-"}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 500 }}>
                      {product.weight || "-"}
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 500 }}>
                      {product.hsCode || "-"}
                    </TableCell>
                    
                    <TableCell align="center" sx={{ fontWeight: 500 }}>
                      {product.created_by_name
                        ? `${product.created_by_name} (${product.created_by_user_id || ""})`
                        : product.created_by_email || "-"}
                    </TableCell>
                    
                    <TableCell align="center">
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center",
                          gap: 1,
                        }}
                      >
                        <PermissionGate permission="product.update">
                          <Button
                            onClick={() => onEdit(product)}
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
                        <PermissionGate permission="product.delete">
                          <Button
                            onClick={() => onDelete(product.id)}
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
                ? `Showing all ${filteredProducts.length} products`
                : `Showing ${(page - 1) * rowsPerPage + 1} to ${Math.min(page * rowsPerPage, filteredProducts.length)} of ${filteredProducts.length} products`
              }
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
    </Box>
  );
}
