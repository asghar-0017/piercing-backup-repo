import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  IconButton,
  CircularProgress,
  Stack,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import OptimizedHSCodeSelector from "./OptimizedHSCodeSelector";

const ProductModal = ({ isOpen, onClose, onSave, initialProduct }) => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    weight: "",
    hsCode: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setFormData(
        initialProduct
          ? {
              name: initialProduct.name || "",
              description: initialProduct.description || "",
              weight: initialProduct.weight || "",
              hsCode: initialProduct.hsCode || "",
            }
          : { name: "", description: "", weight: "", hsCode: "" }
      );
    }
  }, [isOpen, initialProduct]);

  const handleHSChange = (_index, field, value) => {
    if (field === "hsCode") {
      setFormData((p) => ({ ...p, hsCode: value }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (!formData.name || !formData.hsCode) {
        setIsSubmitting(false);
        return;
      }
      onSave({ ...formData });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Animated liquid background */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 1299,
          background: `
            radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(119, 167, 255, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 40% 40%, rgba(120, 219, 255, 0.3) 0%, transparent 50%)
          `,
          animation: "liquidFloat 6s ease-in-out infinite alternate",
          "@keyframes liquidFloat": {
            "0%": {
              transform: "scale(1) rotate(0deg)",
            },
            "100%": {
              transform: "scale(1.1) rotate(2deg)",
            },
          },
        }}
      />

      {/* Main modal backdrop */}
      <Box
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          backdropFilter: "blur(8px)",
          zIndex: 1300,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: { xs: 1, sm: 2 },
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            width: { xs: "95%", sm: "80%", md: "60%", lg: "50%" },
            maxWidth: { xs: "100%", sm: 450, md: 500 },
            maxHeight: { xs: "80vh", sm: "95vh" },
            borderRadius: { xs: 2, sm: 3 },
            position: "relative",
            // Frosted glass effect like Apple notifications
            backgroundColor: "rgba(255, 255, 255, 0.55)",
            backdropFilter: "blur(20px) saturate(180%)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: `
              0 8px 32px rgba(0, 0, 0, 0.12),
              0 2px 8px rgba(0, 0, 0, 0.08),
              inset 0 1px 0 rgba(255, 255, 255, 0.6)
            `,
            // Smooth entrance animation
            animation: "modalSlideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            "@keyframes modalSlideUp": {
              "0%": {
                opacity: 0,
                transform: "translateY(30px) scale(0.95)",
              },
              "100%": {
                opacity: 1,
                transform: "translateY(0) scale(1)",
              },
            },
          }}
        >
          {/* Close button with hover effect */}
          <IconButton
            onClick={onClose}
            sx={{
              position: "absolute",
              top: { xs: 8, sm: 12 },
              right: { xs: 8, sm: 12 },
              backgroundColor: "rgba(0, 0, 0, 0.05)",
              color: "#666",
              width: { xs: 28, sm: 32 },
              height: { xs: 28, sm: 32 },
              zIndex: 1,
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.1)",
                transform: "scale(1.1)",
              },
              transition: "all 0.2s ease-in-out",
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>

          {/* Title with modern typography */}
          <Typography
            variant="h5"
            fontWeight={600}
            align="center"
            gutterBottom
            sx={{
              color: "#1a1a1a",
              mt: { xs: 0.5, sm: 1 },
              mb: { xs: 1.5, sm: 2 },
              letterSpacing: "-0.02em",
              fontSize: { xs: "1.1rem", sm: "1.3rem" },
            }}
          >
            {initialProduct ? "Edit Product" : "Add Product"}
          </Typography>

          {/* Form container */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ width: "100%" }}
          >
            <Stack spacing={{ xs: 1, sm: 1.5 }}>
              {/* Modern text fields with frosted styling */}
              <TextField
                fullWidth
                size="small"
                label="Name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, name: e.target.value }))
                }
                required
                variant="outlined"
                placeholder="Enter product name"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    backdropFilter: "blur(10px)",
                    borderRadius: 2,
                    "& fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                      borderWidth: 1,
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.2)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#007AFF",
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#1a1a1a",
                    fontWeight: 500,
                  },
                  "& .MuiOutlinedInput-input": {
                    color: "#1a1a1a",
                    fontWeight: 400,
                  },
                }}
              />

              <TextField
                fullWidth
                multiline
                rows={2}
                size="small"
                label="Product Description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, description: e.target.value }))
                }
                variant="outlined"
                placeholder="Enter product description"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    backdropFilter: "blur(10px)",
                    borderRadius: 2,
                    "& fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.2)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#007AFF",
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#1a1a1a",
                    fontWeight: 500,
                  },
                  "& .MuiOutlinedInput-input": {
                    color: "#1a1a1a",
                  },
                }}
              />

              <TextField
                fullWidth
                size="small"
                label="Weight"
                value={formData.weight}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, weight: e.target.value }))
                }
                variant="outlined"
                placeholder="Enter weight"
                sx={{
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.6)",
                    backdropFilter: "blur(10px)",
                    borderRadius: 2,
                    "& fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.12)",
                    },
                    "&:hover fieldset": {
                      borderColor: "rgba(0, 0, 0, 0.2)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: "#007AFF",
                      borderWidth: 2,
                    },
                  },
                  "& .MuiInputLabel-root": {
                    color: "#1a1a1a",
                    fontWeight: 500,
                  },
                  "& .MuiOutlinedInput-input": {
                    color: "#1a1a1a",
                  },
                }}
              />

              <Box>
                <OptimizedHSCodeSelector
                  index={0}
                  item={{ hsCode: formData.hsCode }}
                  handleItemChange={handleHSChange}
                  environment="sandbox"
                  label="HS Code"
                  placeholder="Search HS Code..."
                />
              </Box>

              {/* Action buttons with modern styling */}
              <Stack spacing={1} sx={{ mt: { xs: 1, sm: 1.5 } }}>
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={isSubmitting}
                  size="small"
                  sx={{
                    backgroundColor: "#007AFF",
                    color: "white",
                    fontWeight: 600,
                    fontSize: { xs: "13px", sm: "14px" },
                    py: { xs: 0.8, sm: 1 },
                    borderRadius: 2,
                    textTransform: "none",
                    boxShadow: "0 4px 20px rgba(0, 122, 255, 0.3)",
                    "&:hover": {
                      backgroundColor: "#0056CC",
                      transform: "translateY(-1px)",
                      boxShadow: "0 6px 25px rgba(0, 122, 255, 0.4)",
                    },
                    "&:disabled": {
                      backgroundColor: "rgba(0, 122, 255, 0.6)",
                    },
                    transition: "all 0.2s ease-in-out",
                  }}
                >
                  {isSubmitting ? (
                    <>
                      <CircularProgress
                        size={18}
                        sx={{ mr: 1, color: "white" }}
                      />
                      Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>

                <Button
                  type="button"
                  onClick={onClose}
                  variant="outlined"
                  fullWidth
                  size="small"
                  sx={{
                    color: "#666",
                    borderColor: "rgba(0, 0, 0, 0.12)",
                    backgroundColor: "rgba(255, 255, 255, 0.4)",
                    backdropFilter: "blur(10px)",
                    fontWeight: 500,
                    fontSize: { xs: "13px", sm: "14px" },
                    py: { xs: 0.8, sm: 1 },
                    borderRadius: 2,
                    textTransform: "none",
                    "&:hover": {
                      backgroundColor: "rgba(255, 255, 255, 0.6)",
                      borderColor: "rgba(0, 0, 0, 0.2)",
                      transform: "translateY(-1px)",
                    },
                    transition: "all 0.2s ease-in-out",
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
  );
};

export default ProductModal;
