-- Add is_public column to exams table for tracking public visibility
ALTER TABLE public.exams 
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Add can_do_protocol column to staff table for manual protocol override
-- This allows admins to mark internal staff as "cannot do protocol" (e.g., dean)
-- External/adjunct staff still have hard rule: can NEVER do protocol
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS can_do_protocol boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.exams.is_public IS 'Whether the exam is public (with audience) or private (ohne Öffentlichkeit)';
COMMENT ON COLUMN public.staff.can_do_protocol IS 'Manual override for protocol eligibility. External/adjunct staff always false regardless of this flag.';