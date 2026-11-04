-- Update theme_preference constraint to support new themes
ALTER TABLE staff DROP CONSTRAINT "staff_theme_preference_check";
ALTER TABLE staff ADD CONSTRAINT "staff_theme_preference_check" CHECK (theme_preference IN ('amber', 'blue-black', 'light-pink', 'forest-green', 'ocean-blue', 'purple', 'slate'));
