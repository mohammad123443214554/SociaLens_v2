-- Identify which participant initiated hold/resume so only the remote participant hears the announcement.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS hold_initiated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;
