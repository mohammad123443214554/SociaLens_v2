-- Poll deletion is tied to story deletion; do not allow clients to orphan a published overlay.
revoke delete on table public.story_polls from authenticated;
