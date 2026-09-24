import React, { useEffect, useState } from "react";
import { api } from "../API/Api";
import BuyerModal from "../component/BuyerModal";
import BuyerUploader from "../component/BuyerUploader";
import { toast } from "react-toastify";
import Swal from "sweetalert2";
import BuyerTable from "../component/BuyerTable";
import { Button } from "@mui/material";
import TenantSelectionPrompt from "../component/TenantSelectionPrompt";
import { useTenantSelection } from "../Context/TenantSelectionProvider";
import PermissionGate from "../component/PermissionGate";

const Buyers = () => {
  const { selectedTenant } = useTenantSelection();
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploaderOpen, setIsUploaderOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [filter, setFilter] = useState("All");

  const openModal = (buyer = null) => {
    setSelectedBuyer(buyer);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedBuyer(null);
    setIsModalOpen(false);
  };

  const openUploader = () => {
    setIsUploaderOpen(true);
  };

  const closeUploader = () => {
    setIsUploaderOpen(false);
  };

  const handleSave = async (buyerData) => {
    try {
      const transformedData = {
        buyerNTNCNIC: buyerData.buyerNTNCNIC,
        buyerBusinessName: buyerData.buyerBusinessName,
        buyerProvince: buyerData.buyerProvince,
        buyerAddress: buyerData.buyerAddress,
        buyerRegistrationType: buyerData.buyerRegistrationType,
        buyerPhoneNumber: buyerData.buyerPhoneNumber,
      };

      if (selectedBuyer) {
        const response = await api.put(
          `/tenant/${selectedTenant.tenant_id}/buyers/${selectedBuyer.id}`,
          transformedData
        );
        
        // Check if confirmation is required for posted invoices
        if (response.data.success && response.data.requiresConfirmation) {
          const result = await Swal.fire({
            title: "Update Posted Invoices?",
            html: `
              <div style="text-align: center; padding: 10px;">
                <p style="font-size: 16px; margin-bottom: 15px;">
                  This buyer is associated with ${response.data.totalInvoicesCount} invoice(s), including ${response.data.postedInvoicesCount} posted invoice(s) that have been submitted to FBR.
                </p>
                <p style="color: #d32f2f; font-size: 14px; font-weight: bold;">
                  ⚠️ Updating this buyer will update all related invoices, including posted ones.
                </p>
                <p style="margin-top: 15px; font-size: 14px;">
                  Do you want to proceed?
                </p>
              </div>
            `,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#3085d6",
            cancelButtonColor: "#d33",
            confirmButtonText: "Yes, update all invoices",
            cancelButtonText: "Cancel",
            reverseButtons: true,
            allowOutsideClick: false,
            allowEscapeKey: false,
            backdrop: true,
            didOpen: () => {
              // Ensure Swal appears on top of all modals
              const swalContainer = document.querySelector('.swal2-container');
              if (swalContainer) {
                swalContainer.style.zIndex = '99999';
              }
              const swalBackdrop = document.querySelector('.swal2-backdrop-show');
              if (swalBackdrop) {
                swalBackdrop.style.zIndex = '99998';
              }
            }
          });

          if (result.isConfirmed) {
            // Retry the update with confirmation flag
            const confirmResponse = await api.put(
              `/tenant/${selectedTenant.tenant_id}/buyers/${selectedBuyer.id}`,
              { ...transformedData, updatePostedInvoices: true }
            );
            
            setBuyers(
              buyers.map((b) =>
                b.id === selectedBuyer.id ? confirmResponse.data.data : b
              )
            );
            toast.success(
              `Buyer updated successfully! ${confirmResponse.data.updatedInvoicesCount || 0} invoice(s) have been updated.`
            );
            closeModal();
          } else {
            // User cancelled - don't update, keep modal open
            return;
          }
        } else if (response.data.success) {
          // Normal update without posted invoices
          setBuyers(
            buyers.map((b) =>
              b.id === selectedBuyer.id ? response.data.data : b
            )
          );
          toast.success(
            response.data.message || "Buyer updated successfully! The changes have been saved."
          );
          closeModal();
        } else {
          // Handle error case
          throw new Error(response.data.message || "Failed to update buyer");
        }
      } else {
        const response = await api.post(
          `/tenant/${selectedTenant.tenant_id}/buyers`,
          transformedData
        );
        setBuyers([...buyers, response.data.data]);
        toast.success(
          "Buyer added successfully! The buyer has been added to your system."
        );
      }
      closeModal();
    } catch (error) {
      console.error("Error saving buyer:", error);
      let errorMessage = "Error saving buyer.";
      if (error.response) {
        const { status, data } = error.response;
        if (status === 400) {
          if (data.message && data.message.includes("already exists")) {
            errorMessage = data.message;
          } else if (data.message && data.message.includes("validation")) {
            errorMessage =
              "Please check your input data. Some fields may be invalid or missing.";
          } else {
            errorMessage =
              data.message || "Invalid data provided. Please check all fields.";
          }
        } else if (status === 409) {
          errorMessage = data.message || "This buyer already exists in our system.";
        } else if (status === 500) {
          errorMessage = "Server error occurred. Please try again later.";
        } else {
          errorMessage =
            data.message || "An error occurred while saving the buyer.";
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast.error(errorMessage);
    }
  };

  const handleBulkUpload = async (buyersData) => {
    try {
      const response = await api.post(
        `/tenant/${selectedTenant.tenant_id}/buyers/bulk`,
        { buyers: buyersData }
      );
      const newBuyers = response.data.data.created;
      setBuyers([...buyers, ...newBuyers]);
      const { summary, errors } = response.data.data;
      if (summary.failed > 0) {
        let errorDetails = errors
          .slice(0, 5)
          .map((err) => `Row ${err.row}: ${err.error}`)
          .join("\n");
        if (errors.length > 5) {
          errorDetails += `\n... and ${errors.length - 5} more errors`;
        }
        toast.warning(
          `Upload completed with issues: ${summary.successful} buyers added, ${summary.failed} failed. Check the details for more information.`,
          {
            autoClose: 8000,
            closeOnClick: false,
            pauseOnHover: true,
          }
        );
        console.error("Upload errors:", errors);
      } else {
        toast.success(
          `Successfully uploaded ${summary.successful} buyers! All buyers have been added to your system.`
        );
      }
      return response.data;
    } catch (error) {
      console.error("Error in bulk upload:", error);
      let errorMessage = "Error uploading buyers.";
      if (error.response) {
        const { status, data } = error.response;
        if (status === 400) {
          errorMessage =
            data.message ||
            "Invalid data provided. Please check your file format.";
        } else if (status === 500) {
          errorMessage = "Server error occurred. Please try again later.";
        } else {
          errorMessage =
            data.message || "An error occurred while uploading buyers.";
        }
      }
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleDelete = async (buyerId) => {
    Swal.fire({
      title: "Are you sure?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await api.delete(
            `/tenant/${selectedTenant.tenant_id}/buyers/${buyerId}`
          );
          setBuyers(buyers.filter((b) => b.id !== buyerId));
          toast.success(
            "Buyer deleted successfully! The buyer has been removed from your system."
          );
        } catch (error) {
          console.error("Error deleting buyer:", error);
          toast.error("Error deleting buyer.");
        }
      }
    });
  };

  useEffect(() => {
    const fetchBuyers = async () => {
      if (!selectedTenant) {
        setLoading(false);
        return;
      }

      try {
        // Use the optimized endpoint that returns all buyers without pagination
        const response = await api.get(
          `/tenant/${selectedTenant.tenant_id}/buyers/all`
        );
        
        if (response.data.success) {
          setBuyers(response.data.data.buyers || []);
          console.log("BUYERS loaded:", response.data.data.buyers?.length || 0, "records");
        } else {
          console.error("Failed to fetch buyers:", response.data.message);
          setBuyers([]);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error fetching buyers:", error);
        toast.error("Error fetching buyers.");
        setLoading(false);
      }
    };

    fetchBuyers();
  }, [selectedTenant]);

  const filteredBuyers =
    filter === "All"
      ? buyers
      : buyers.filter((b) => b.buyerRegistrationType === filter);

  return (
    <TenantSelectionPrompt>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 16,
          }}
        ></div>
        <BuyerTable
          buyers={filteredBuyers}
          loading={loading}
          onEdit={openModal}
          onDelete={handleDelete}
          onAdd={openModal}
          onUpload={openUploader}
          selectedTenant={selectedTenant}
          onBulkDeleted={(ids) =>
            setBuyers((prev) => prev.filter((b) => !ids.includes(b.id)))
          }
        />
        <BuyerModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSave={handleSave}
          buyer={selectedBuyer}
        />
        <BuyerUploader
          isOpen={isUploaderOpen}
          onClose={closeUploader}
          onUpload={handleBulkUpload}
          selectedTenant={selectedTenant}
        />
      </div>
    </TenantSelectionPrompt>
  );
};

export default Buyers;
