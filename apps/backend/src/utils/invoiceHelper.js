/**
 * Generates a completely random 15-digit numeric string
 * @returns {string} 15-digit random numeric string
 */
const generateRandom15Digits = () => {
  let digits = "";
  // Ensure the first digit is 1-9 so it remains exactly 15 digits
  digits += Math.floor(Math.random() * 9 + 1).toString();
  for (let i = 1; i < 15; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  return digits;
};

/**
 * Generates a unique 15-digit source invoice number.
 * If the generated number exists in the DB or in the excludeSet (for bulk operations),
 * it recursively regenerates and checks again.
 *
 * @param {import('sequelize').Model} InvoiceModel - Sequelize Invoice model
 * @param {Set<string>} [excludeSet] - Optional set of already-generated keys in the current batch
 * @returns {Promise<string>} Unique 15-digit source invoice number
 */
export const generateUniqueSourceInvoiceNo = async (InvoiceModel, excludeSet = new Set()) => {
  const sourceInvoiceNo = generateRandom15Digits();

  // 1. Check if the generated code is already present in the batch set (to prevent collision within the same batch/file)
  if (excludeSet.has(sourceInvoiceNo)) {
    console.warn(`Intra-batch collision detected for sourceInvoiceNo: ${sourceInvoiceNo}. Regenerating...`);
    return await generateUniqueSourceInvoiceNo(InvoiceModel, excludeSet);
  }

  try {
    // 2. Check if the generated code is already present in the database table
    const existing = await InvoiceModel.findOne({
      where: { sourceInvoiceNo },
      attributes: ["id"],
      raw: true,
    });

    // 3. If duplicate exists, automatically regenerate a new one by recalling the same function
    if (existing) {
      console.warn(`Database duplicate detected for sourceInvoiceNo: ${sourceInvoiceNo}. Regenerating...`);
      return await generateUniqueSourceInvoiceNo(InvoiceModel, excludeSet);
    }

    // 4. Mark as used in current batch and return
    excludeSet.add(sourceInvoiceNo);
    return sourceInvoiceNo;
  } catch (error) {
    console.error("Error generating unique sourceInvoiceNo:", error);
    throw error;
  }
};
