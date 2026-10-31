-- Sync call hold state so the remote participant can receive the hold announcement.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS is_on_hold boolean NOT NULL DEFAULT false;
