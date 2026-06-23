import React, { useState } from "react";
import ProfileUpdateModal from "./ProfileUpdateModal";
import { useAuth } from "../Context/AuthProvider";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import { api } from "../API/Api";

export default function UserProfileMenuMount({ open, setOpen }) {
  const { user } = useAuth();
  const { selectedTenant, selectTenant } = useTenantSelection();
  const [saving, setSaving] = useState(false);

  const handleSave = async (data) => {
    try {
      setSaving(true);
      // Update tenant details only
      if (selectedTenant?.tenant_id) {
        // Determine the appropriate endpoint based on user type
        const endpoint =
          user?.role === "admin"
            ? `/admin/tenants/${selectedTenant.tenant_id}`
            : `/user/tenants/${selectedTenant.tenant_id}`;

        const resp = await api.put(endpoint, {
          sellerBusinessName: data.sellerBusinessName,
          sellerFullNTN: data.sellerFullNTN,
          sellerProvince: data.sellerProvince,
          sellerAddress: data.sellerAddress,
          telNo: data.telNo,
          mobNo: data.mobNo,
          strn: data.strn,
          email: data.email,
        });
        if (resp.data?.success && resp.data?.data) {
          // refresh selected tenant in context
          await selectTenant({ ...selectedTenant, ...resp.data.data });
        }
      }
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfileUpdateModal
      open={open}
      onClose={() => setOpen(false)}
      onSave={handleSave}
      isSaving={saving}
      initialTenant={selectedTenant}
    />
  );
}
