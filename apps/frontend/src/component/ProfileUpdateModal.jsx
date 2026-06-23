import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Stack,
  Divider,
} from "@mui/material";

export default function ProfileUpdateModal({
  open,
  onClose,
  onSave,
  isSaving = false,
  initialTenant,
}) {
  const [sellerBusinessName, setSellerBusinessName] = useState("");
  const [sellerFullNTN, setSellerFullNTN] = useState("");
  const [telNo, setTelNo] = useState("");
  const [mobNo, setMobNo] = useState("");
  const [strn, setStrn] = useState("");
  const [email, setEmail] = useState("");
  const [sellerProvince, setSellerProvince] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");

  useEffect(() => {
    if (initialTenant) {
      setSellerBusinessName(initialTenant.sellerBusinessName || "");
      setSellerFullNTN(initialTenant.sellerFullNTN || "");
      setTelNo(initialTenant.telNo || "");
      setMobNo(initialTenant.mobNo || "");
      setStrn(initialTenant.strn || "");
      setEmail(initialTenant.email || "");
      setSellerProvince(initialTenant.sellerProvince || "");
      setSellerAddress(initialTenant.sellerAddress || "");
    }
  }, [initialTenant]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      sellerBusinessName: sellerBusinessName?.trim(),
      sellerFullNTN: sellerFullNTN?.trim(),
      telNo: telNo?.trim(),
      mobNo: mobNo?.trim(),
      strn: strn?.trim(),
      email: email?.trim(),
      sellerProvince: sellerProvince?.trim(),
      sellerAddress: sellerAddress?.trim(),
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Update Company Profile</DialogTitle>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              label="Seller Business Name"
              value={sellerBusinessName}
              onChange={(e) => setSellerBusinessName(e.target.value)}
              fullWidth
            />
            <TextField
              label="Seller Full NTN"
              value={sellerFullNTN}
              onChange={(e) => setSellerFullNTN(e.target.value)}
              fullWidth
            />
            <TextField
              label="Tel No"
              value={telNo}
              onChange={(e) => setTelNo(e.target.value)}
              fullWidth
            />
            <TextField
              label="Mob No"
              value={mobNo}
              onChange={(e) => setMobNo(e.target.value)}
              fullWidth
            />
            <TextField
              label="STRN"
              value={strn}
              onChange={(e) => setStrn(e.target.value)}
              fullWidth
            />
            <TextField
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              fullWidth
            />
            <TextField
              label="Seller Province"
              value={sellerProvince}
              onChange={(e) => setSellerProvince(e.target.value)}
              fullWidth
            />
            <TextField
              label="Seller Address"
              value={sellerAddress}
              onChange={(e) => setSellerAddress(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="contained" type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
