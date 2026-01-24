import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
  IconButton,
  Paper,
  Alert,
} from "@mui/material";
import {
  ErrorOutline as ErrorIcon,
  Close as CloseIcon,
  CheckCircle as SuccessIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from "@mui/icons-material";

const ErrorModal = ({
  open,
  onClose,
  title = "Error",
  message,
  details = [],
  type = "error", // 'error', 'success', 'warning', 'info'
  showCancelButton = false,
  confirmButtonText = "OK",
  cancelButtonText = "Cancel",
  onConfirm,
  width = "600px",
}) => {
  const getIcon = () => {
    switch (type) {
      case "success":
        return <SuccessIcon sx={{ color: "#2e7d32", fontSize: 48 }} />;
      case "warning":
        return <WarningIcon sx={{ color: "#ed6c02", fontSize: 48 }} />;
      case "info":
        return <InfoIcon sx={{ color: "#0288d1", fontSize: 48 }} />;
      default:
        return <ErrorIcon sx={{ color: "#d32f2f", fontSize: 48 }} />;
    }
  };

  const getColor = () => {
    switch (type) {
      case "success":
        return "#2e7d32";
      case "warning":
        return "#ed6c02";
      case "info":
        return "#0288d1";
      default:
        return "#d32f2f";
    }
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    } else {
      onClose();
    }
  };

  // Parse details if it's a string (for backward compatibility)
  let parsedDetails = [];
  if (Array.isArray(details)) {
    parsedDetails = details;
  } else if (typeof details === "string" && details.trim()) {
    // Try to parse item errors from string format like "Item 3: error message"
    const itemPattern = /Item\s+(\d+):\s*(.+)/gi;
    const matches = [...details.matchAll(itemPattern)];
    if (matches.length > 0) {
      parsedDetails = matches.map((match) => ({
        item: match[1],
        error: match[2],
      }));
    } else {
      // If no item pattern, split by newlines
      parsedDetails = details
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => ({ error: line.trim() }));
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          width: width,
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          pb: 1,
          borderBottom: `2px solid ${getColor()}`,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
          {getIcon()}
          <Typography variant="h5" component="div" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
        </Box>
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{
            color: (theme) => theme.palette.grey[500],
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          mt: 2,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {message && (
          <Alert
            severity={type}
            sx={{
              mb: parsedDetails.length > 0 ? 2 : 0,
              flexShrink: 0,
              "& .MuiAlert-message": {
                width: "100%",
              },
            }}
          >
            <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
              {message}
            </Typography>
          </Alert>
        )}

        {parsedDetails.length > 0 && (
          <Box
            sx={{
              mt: parsedDetails.length > 0 ? (message ? 0 : 0) : 0,
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                mb: 1,
                color: "text.primary",
                flexShrink: 0,
              }}
            >
              Error Details ({parsedDetails.length}):
            </Typography>
            <Box
              sx={{
                flex: 1,
                overflowY: "auto",
                overflowX: "hidden",
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
                pr: 1,
              }}
            >
              {parsedDetails.map((detail, index) => (
                <Paper
                  key={index}
                  variant="outlined"
                  sx={{
                    p: 2,
                    border: `1.5px solid ${getColor()}`,
                    borderRadius: 2,
                    bgcolor: type === "error" ? "#ffebee" : "background.paper",
                    flexShrink: 0,
                    "&:hover": {
                      boxShadow: 2,
                      borderColor: getColor(),
                    },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: getColor(),
                      mb: 1,
                    }}
                  >
                    {detail.item
                      ? `Item ${detail.item}`
                      : `Error ${index + 1}`}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "text.secondary",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {detail.error || detail}
                  </Typography>
                </Paper>
              ))}
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, pt: 1, flexShrink: 0 }}>
        {showCancelButton && (
          <Button onClick={onClose} color="inherit">
            {cancelButtonText}
          </Button>
        )}
        <Button
          onClick={handleConfirm}
          variant="contained"
          sx={{
            bgcolor: getColor(),
            "&:hover": {
              bgcolor: getColor(),
              opacity: 0.9,
            },
          }}
          autoFocus
        >
          {confirmButtonText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ErrorModal;
