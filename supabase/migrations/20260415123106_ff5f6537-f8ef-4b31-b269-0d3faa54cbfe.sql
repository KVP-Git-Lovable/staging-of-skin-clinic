
ALTER TABLE public.role_module_permissions 
  ADD COLUMN IF NOT EXISTS can_create boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false;

-- Default: set can_create and can_delete to match can_edit for existing rows
UPDATE public.role_module_permissions 
SET can_create = can_edit, can_delete = can_edit;
