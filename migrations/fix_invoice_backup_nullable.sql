-- Migration: Make original_invoice_id nullable in invoice_backups table
-- This allows creating backups for FBR submissions that don't have a linked invoice yet

-- For each tenant database, run this migration
-- Replace 'tenant_database_name' with the actual tenant database name

USE tenant_database_name;

-- Alter the column to allow NULL values
ALTER TABLE invoice_backups 
MODIFY COLUMN original_invoice_id INT NULL 
COMMENT 'ID of the original invoice';

-- Verify the change
DESCRIBE invoice_backups;
