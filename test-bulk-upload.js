// Test script to verify bulk upload fixes
const testBulkUpload = async () => {
  const testInvoices = [
    {
      invoiceType: "Sale Invoice",
      invoiceDate: "45902", // Excel serial date for 2025-09-02
      companyInvoiceRefNo: "123",
      internalInvoiceNo: "INT-1",
      buyerBusinessName: "Asghar Ali",
      buyerProvince: "SINDH",
      buyerNTNCNIC: "0000000000000",
      buyerAddress: "karachi",
      buyerRegistrationType: "Unregistered",
      sellerNTNCNIC: "6386420",
      sellerFullNTN: "343243242",
      sellerBusinessName: "Innovative Network",
      sellerProvince: "SINDH",
      sellerAddress: "Karachi",
      items: [
        {
          item_hsCode: "8432.1010",
          item_rate: "1%",
          item_productName: "Nuclear EDIT",
          item_productDescription: "Nuclear Powers",
          item_quantity: "10000",
          item_unitPrice: "10",
          item_totalValues: "101020",
          item_uoM: "Numbers, pieces, units",
          item_saleType: "Goods at Reduced Rate",
          item_salesTaxApplicable: "1000",
          item_salesTaxWithheldAtSource: "10",
          item_sroScheduleNo: "EIGHTH SCHEDULE Table 1",
          item_sroItemSerialNo: "70",
          item_discount: "10",
          item_extraTax: "0",
          item_furtherTax: "10",
          item_fedPayable: "10",
          item_valueSalesExcludingST: "100000",
          transctypeId: "24 - Goods at Reduced Rate",
        },
      ],
    },
  ];

  try {
    console.log(
      "🧪 Testing bulk upload with Excel dates and internal invoice numbers..."
    );
    console.log("📊 Test data:", {
      totalInvoices: testInvoices.length,
      sampleInvoice: testInvoices[0],
    });

    const response = await fetch(
      "https://rajbytextileind.inplsoftwares.online/api/tenant/tenant_1756409312403_uo1hmt4tz/invoices/bulk",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          "x-tenant-id": "tenant_1756409312403_uo1hmt4tz",
        },
        body: JSON.stringify({
          invoices: testInvoices,
          chunkSize: 500,
        }),
      }
    );

    const result = await response.json();

    console.log("📋 Response:", {
      success: result.success,
      message: result.message,
      summary: result.data?.summary,
      errors: result.data?.errors?.length || 0,
      warnings: result.data?.warnings?.length || 0,
    });

    if (result.success) {
      console.log("✅ Bulk upload test PASSED!");
      console.log(`📊 Created ${result.data.summary.successful} invoices`);
    } else {
      console.log("❌ Bulk upload test FAILED!");
      console.log("Error:", result.error);
      console.log("Errors:", result.data?.errors);
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }
};

// Run the test
testBulkUpload();
