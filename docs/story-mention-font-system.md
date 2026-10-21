# Story Mention + Independent Text Fonts

## Architecture audit

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS.
- Auth/data: Supabase browser client, React Query, Supabase RLS.
- Photo editor: `components/stories/PhotoStoryModal.tsx`.
- Video editor: `components/stories/VideoStoryModal.tsx`; the pre-existing flow was a single video-preview/publish screen, so `Edit story` opens its new editing toolbar without adding mention controls to the initial selection state.
- Font picker: `components/stories/FontPicker.tsx`, using the existing supported font list/loader in `lib/utils/googleFonts.ts`.
- Story viewer: `components/stories/StoryViewer.tsx`.
- Story persistence: `lib/hooks/useStories.ts`; draft persistence: `lib/utils/storyDraft.ts`.

## Editor behavior

- Photo editor toolbar is Add Song, Add Text, and @ Mention; the separate Font toolbar control is removed.
- Each text layer carries an optional `fontFamily`. Missing values preserve legacy global-font behavior; explicit null means the layer uses the default font. Font menu changes target only the selected layer.
- Font panel is a right-side desktop panel and mobile bottom sheet with live text preview.
- Video's initial preview/publish screen does not expose Mention; `Edit story` opens Add Text and @ Mention tools.
- Mention stickers are stored with user ID, username snapshot, percentage-based canvas coordinates, scale, and overlay ID. Percentage coordinates preserve placement as the preview is resized.
- Story drafts persist photo/video text layers and mentions through the existing draft store.

## Mention search, persistence, privacy

- `components/stories/StoryMentionPicker.tsx` searches actual profiles with a debounce, stale-request guard, loading/no-result/error states, multi-select and duplicate prevention.
- Search results respect search privacy, suspension status and blocks in either direction.
- Published mention records are written to `public.story_mentions`; RLS requires the authenticated story owner, an active owned Story, a valid non-suspended account and no block relationship. Unique `(story_id, mentioned_user_id)` prevents duplicate mention records.
- The Story viewer fetches validated mention rows through `useStoryMentions`, resolves the current username/profile, and renders a profile link that stops pointer/click propagation so Story navigation is not triggered.
- A database trigger creates `story_mention` notifications after mention rows are inserted. It checks active Story state, blocks, private-account follow state, Story audience, muted notifications, post-notification preferences, and selected notification senders. Existing notification types were retained in the check constraint.
- Mention rows cascade with Story deletion. RLS prevents reading mention records for expired or inaccessible Stories.

## Supabase migrations

- `20261022160000_create_story_mentions.sql`
- `20261022162000_allow_story_mentions_outside_audience.sql`
- `20261022164000_enforce_story_mention_notification_privacy.sql`
- `20261022170000_respect_story_mention_notification_preferences.sql`

These migrations were applied to the connected SociaLens Supabase project and the mention table's RLS/policies, notification type constraint and trigger were read back for verification.

## Verification and known limits

- Vercel production build for commit `a70bb1e9f75ff045f30df51e211a75df2178120f` reached `READY`; build logs showed successful compilation and proceeded through TypeScript and output generation.
- Supabase schema/RLS/notification constraint checks were run after migration.
- Local `npm run lint` and browser-based authenticated end-to-end checks were not run in this environment; repository network checkout was unavailable. Do not treat build success as proof of interactive upload/publish testing.
- Inline `@` autocomplete is not included; the dedicated picker is implemented.
- Add-to-My-Story reshare is not included because the existing Story viewer has no established reshare flow to extend safely.
