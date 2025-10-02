-- Add phone number field to buyers table
-- This script adds the missing phone number field to the buyers table

-- Add buyerPhoneNumber column
ALTER TABLE `buyers` 
ADD COLUMN `buyerPhoneNumber` VARCHAR(20) NULL AFTER `buyerRegistrationType`;

-- Add index for better performance
CREATE INDEX `idx_buyer_phone` ON `buyers` (`buyerPhoneNumber`);

-- Update existing records to have empty strings instead of NULL for consistency
UPDATE `buyers` SET `buyerPhoneNumber` = '' WHERE `buyerPhoneNumber` IS NULL;
