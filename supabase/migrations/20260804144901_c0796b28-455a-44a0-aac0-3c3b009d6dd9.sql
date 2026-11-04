-- Add theme_preference column to staff table
ALTER TABLE staff ADD COLUMN theme_preference TEXT DEFAULT 'amber' CHECK (theme_preference IN ('amber', 'blue-black', 'light-pink'));
