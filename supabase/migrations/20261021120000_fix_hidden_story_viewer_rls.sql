-- Ensure story-hidden checks can see the owner's hidden-viewer rows even
-- when the story SELECT is performed by the hidden viewer. The helper is
-- SECURITY DEFINER so the table's owner-only RLS policy cannot mask matches.
CREATE OR REPLACE FUNCTION public.is_story_hidden_from_viewer(
  story_owner_id uuid,
  story_viewer_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.story_hidden_viewers AS hidden
    WHERE hidden.owner_id = story_owner_id
      AND hidden.hidden_user_id = story_viewer_id
  );
$function$;

REVOKE ALL ON FUNCTION public.is_story_hidden_from_viewer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_story_hidden_from_viewer(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Stories respect owner audience choice" ON public.stories;

CREATE POLICY "Stories respect owner audience choice"
ON public.stories
FOR SELECT
TO public
USING (
  expires_at > now()
  AND (
    auth.uid() = user_id
    OR (
      NOT public.is_story_hidden_from_viewer(user_id, auth.uid())
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = stories.user_id
            AND profiles.is_private = true
        )
        OR EXISTS (
          SELECT 1 FROM public.follows
          WHERE follows.follower_id = auth.uid()
            AND follows.following_id = stories.user_id
            AND follows.status = 'accepted'
        )
      )
      AND (
        COALESCE(visibility, 'everyone') = 'everyone'
        OR (
          visibility = 'followers'
          AND EXISTS (
            SELECT 1 FROM public.follows
            WHERE follows.follower_id = auth.uid()
              AND follows.following_id = stories.user_id
              AND follows.status = 'accepted'
          )
        )
        OR (
          visibility = 'following'
          AND EXISTS (
            SELECT 1 FROM public.follows
            WHERE follows.follower_id = stories.user_id
              AND follows.following_id = auth.uid()
              AND follows.status = 'accepted'
          )
        )
        OR (
          visibility = 'selected'
          AND auth.uid() = ANY(visibility_selected_ids)
        )
      )
    )
  )
);
