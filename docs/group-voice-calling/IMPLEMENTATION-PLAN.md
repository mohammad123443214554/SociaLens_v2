# SociaLens Group Voice Calling

## Product decisions (confirmed 2026-11-04)

- Group voice calls only in this feature; existing 1-to-1 audio and video calls must remain unchanged.
- Any participant who has actually joined the group call may invite additional SociaLens users.
- Hard maximum: 10 participants total, including the person who created the call.
- Invitation selection supports multiple users from the current user's message-list contacts.
- An invitee must see an explicit **Incoming Group Voice Call** label and the profiles of all participants who have already joined.
- The active group call screen shows each joined participant's profile photo and username, with a speaking indicator.
- Sending a reaction always requires a recipient-selection step. One or multiple currently joined participants can be selected; only those selected users receive the reaction.
- If the creator leaves, the remaining joined participants keep the call alive.
- Declined, offline, busy, or expired invitations must not end the call for other participants.

## Part 1 — Architecture audit (completed)

### Existing call architecture

- lib/hooks/useCall.ts owns the current 1-to-1 call lifecycle and transport.
- components/call/CallProvider.tsx mounts the call engine globally, owns call reaction Broadcast channels, and renders the incoming and active call overlays.
- components/call/IncomingCallModal.tsx currently represents one caller and one callee.
- components/call/CallScreen.tsx currently receives one peerName, one peerAvatar, and one remoteStream.
- app/api/calls/connect/route.ts validates that the authenticated user is either calls.caller_id or calls.callee_id, then issues an Agora or Daily credential.
- app/api/push/notify-call/route.ts currently notifies exactly one callee_id.
- app/api/calls/end/route.ts currently authorizes exactly the two call-row participants.
- The existing call reaction channel is call-reactions:<callId> and currently broadcasts to every subscribed call participant without a recipient list.
- The Agora client already subscribes to remote users, but remoteStreamObjRef stores a single audio and video track. That representation is not sufficient for a multi-person roster or independent participant audio tracks.
- The Daily fallback room is currently created with max_participants: 2; that must be addressed before Daily can be used for group calls.
- The existing calls table is in Supabase Realtime and contains 141 historical rows at the time of this audit. Its caller/callee shape and existing RLS policies are relied on by the 1-to-1 flow.

### Why group calls must use a separate data model

Do not convert the existing calls row into a group record and do not add multiple users into callee_id. The current lifecycle, notification, chat logging, reconnect, hold, and permission code all assume one caller and one callee. Reinterpreting those columns would risk breaking existing 1-to-1 voice and video calls.

The group feature will use new additive tables and new group-specific API routes. Existing calls rows, endpoints, and one-to-one behavior remain intact.

### Proposed group data model

#### public.group_calls

One row per group voice session:

- id UUID primary key
- created_by UUID references auth.users
- chat_id nullable UUID, retained when launched from a direct chat context
- type constrained to audio for this first group feature
- status constrained to ringing, active, ended
- provider and room_name for server-issued Agora/Daily room credentials
- created_at, started_at, ended_at, and nullable ended_by

#### public.group_call_participants

One row per user per group call:

- id UUID primary key
- group_call_id references group_calls
- user_id references auth.users
- invited_by references auth.users
- status constrained to invited, ringing, joined, declined, left, missed, removed
- invited_at, joined_at, left_at, created_at, updated_at
- Unique constraint on (group_call_id, user_id) to prevent duplicate invitations/membership rows.

The creator is inserted as the first joined participant. The 10-person capacity is enforced atomically on the server/database, not just by disabling a client button. Pending invitations reserve capacity so several participants cannot all accept past the limit. Declined/expired invitations release their reservation.

### Authorization and concurrency requirements

- Every group table has RLS enabled.
- Reads are limited to members/invitees of that group call, according to status.
- Only an authenticated, currently joined participant may invite another user.
- Invitee may accept/decline only their own pending invitation.
- Only a joined participant may leave; no participant may impersonate another user.
- Group call creation, invitation insertion, and invitation acceptance must use transaction-safe server/database operations with a row lock on the parent group call before checking the 10-person cap.
- Never trust a client-supplied caller ID, participant status, Agora UID, room name, provider, or recipient list without server-side validation.
- Use TO authenticated and explicit ownership/membership predicates in policies; do not copy the existing TO public policy pattern from calls.
- Do not add broad SECURITY DEFINER RPCs in the exposed public schema. Prefer authenticated API routes using the user's Supabase session and narrowly scoped database operations; if an elevated function becomes necessary, isolate it in a private schema and explicitly restrict EXECUTE.

### Realtime and media decisions

- Add the two new tables to the Supabase Realtime publication only after their RLS policies are in place.
- Treat the participant table as the source of truth for the roster; realtime is a fast update channel, with a fresh database read on initial load/reconnect.
- Agora's group room uses one server-minted UID/token per authenticated participant. Keep the room name stable for the lifetime of the group call.
- Refactor remote media from one shared MediaStream into a map keyed by Agora remote UID/user ID, so each participant's audio can play independently and their profile tile can be bound to the correct participant.
- Preserve microphone, speaker, hold, reconnect, network quality, and cleanup behavior, but make cleanup participant-scoped. A participant leaving must not terminate the shared room.
- Keep provider fallback safe: Daily rooms must be provisioned with a group-appropriate maximum (10) before Daily is allowed for group calls. Do not accidentally reuse the existing two-person room creation setting.
- Push notifications must be sent to each invitee with explicit group-call wording and a group call identifier. The current single-callee push route must not be reused without group authorization.

### Targeted reaction contract

- Continue using ephemeral Supabase Broadcast; do not store call reactions in chat history or in the group call tables.
- Reaction send requires a non-empty list of selected participant user IDs.
- Server/receiver validation checks that sender and every recipient are currently joined in the same group call, and the sender cannot send to stale/non-member IDs.
- Broadcast payload contains a reaction event ID, reaction ID, sender ID, and recipient IDs. Each client renders it only if its own user ID is in the recipient list.
- Recipient selection UI lists only currently joined participants and requires an explicit Done action every time.

## Five implementation parts

1. **Architecture audit and safe foundation** — completed by this document. Confirm the current call model, identify compatibility constraints, and lock the group-call data/authorization/media architecture before schema or UI changes.
2. **Group creation, invitations, and capacity** — completed backend foundation: additive schema/RLS, transaction-safe create/invite/accept/decline/leave RPCs, authenticated API routes, message-list contact lookup, generic invite push notifications, and hard 10-person reservation limit. The visual contact-selection popup and actionable incoming-call UI are intentionally in Part 3.
3. **Agora group media and incoming invitation experience** — group-aware credential endpoint, participant join/leave/reconnect, explicit incoming group call screen with all joined profiles, and host-independent session lifetime.
4. **Group call screen and controls** — responsive participant roster, independent audio tracks, speaking indicators, existing voice-call controls, and realtime roster recovery.
5. **Targeted reactions, security hardening, and verification** — mandatory recipient selection, multi-recipient targeted delivery, RLS/API abuse tests, 10-person concurrency tests, network/reconnect tests, and regression checks for existing 1-to-1 voice/video calls.

## Part 2 — Backend foundation (implemented; client UI follows in Part 3)\n\n- Added `public.group_calls` and `public.group_call_participants` without modifying `public.calls`.\n- Added RLS policies, a private membership-check helper, authenticated-only RPC execution, fixed function search paths, and read-only table grants.\n- Added transaction-safe group create, multi-invite, accept/decline, and participant leave RPCs. All invite/accept operations lock the parent group-call row before checking the 10-person capacity; pending invitations reserve a slot.\n- Invites are restricted to users already present in the inviter's direct message list, and bilateral blocks are checked before invitation.\n- Added authenticated API routes for contact lookup, group creation, invitations, invite responses, and leaving.\n- Added generic push notifications for group invitations. They intentionally do not use the existing one-to-one call action payload; actionable incoming group-call handling belongs to Part 3.\n- Enabled Supabase Realtime publication for both new tables.\n- Applied three Supabase migrations and saved the matching SQL files under `supabase/migrations/`.\n- Verification confirmed both tables exist with RLS enabled, six policies exist, four RPCs are installed, both tables are in Realtime, and anonymous users cannot execute the RPCs. Authenticated users can execute only the intended RPCs.\n- Supabase Security Advisor flags the four narrowly scoped authenticated SECURITY DEFINER RPCs. They explicitly check `auth.uid()`, validate membership and invite-list relationships, serialize capacity changes with a parent-row lock, use a fixed search path, and revoke PUBLIC/anon execution. This warning is recorded for review rather than hidden.\n- No authenticated end-to-end API/UI test has yet been run; the visual picker, incoming call page, and actual media joining are Part 3.\n\n## Part 1 acceptance record

- Repository inspected on main.
- Supabase project inspected directly; existing calls columns, RLS policies, indexes, and Realtime publication membership checked.
- Existing call endpoints, push path, incoming modal, global provider, call engine, and reaction broadcast path inspected.
- No production database schema or existing call behavior was changed in Part 1.
- No claim of end-to-end group-call functionality is made yet. The actual feature starts in Part 2 after this compatibility design is locked.


## Part 3 — Group Agora connection and invitation experience (implemented; verification pending)

- Added an authenticated group-call Agora credential endpoint. It verifies the current user is a joined participant, requires an active group session, persists one stable Agora room name, and mints a server-side UID/token pair. The existing one-to-one credential endpoint and room sizing remain untouched.
- Added an incoming-invitation lookup endpoint that returns only active invitations visible to the authenticated invitee, together with the profiles of already-joined participants.
- Added a global group-call experience mounted alongside (not inside) the existing one-to-one engine. It polls as a recovery fallback and subscribes to participant-row Realtime changes for incoming invitations and roster updates.
- Added an incoming invitation screen labelled **Incoming Group Voice Call**, with profile photos/names of all participants already joined and Join/Decline actions.
- Added a group-call creation picker based on the authenticated user's message-list contacts, with a maximum of 9 invitees plus the creator. A joined participant can invite more contacts during the session; server-side capacity checks remain authoritative.
- Added an Agora audio-only room join/publish/subscribe path with participant-scoped leave/cleanup. Leaving calls the group-specific RPC and does not end the room while other joined participants remain.
- Existing one-to-one call engine, calls table, and existing connect endpoint were not modified.
- Current Part 3 verification is limited to repository/deployment build verification. Real two-device/multi-device audio, background notification wake-up, reconnect, and 10-user concurrency testing remain required before production acceptance.
- The first iteration exposes a dedicated Group call launcher while no one-to-one call is active. The richer in-call 3-dot integration, polished multi-participant roster/speaking indicators, and recipient-targeted reactions remain follow-up work in Parts 4–5.


## Part 4 — Group call screen and controls (implemented; live-device verification pending)

- Reworked the group call's expanded view into a responsive participant grid, with a compact floating view retained for minimized use.
- Every joined participant is shown with their profile photo/fallback, display name, and connection state. Pending invitees are shown separately so they are not confused with joined participants.
- Enabled Agora audio volume indication and map each server-minted participant UID back to the corresponding SociaLens user ID. Active speakers receive a live speaking ring/icon and a "Speaking" state on their participant tile.
- Added group-call controls for microphone mute/unmute, speaker playback-level mode, hold/resume, invite more participants, and leave. Hold disables the local microphone and suppresses remote playback locally; resuming restores both according to mute/speaker settings.
- Added a realtime subscription for both participant roster changes and group-call end state, plus a 12-second roster recovery refresh to cover missed Realtime updates.
- Added rollback cleanup if the database accepts a participant but Agora media connection fails, preventing the failed client from remaining marked as joined when the leave endpoint is reachable.
- Reset mute/hold/speaker/speaking state between sessions so controls from a previous call cannot leak into the next call.
- Existing one-to-one CallScreen and useCall engine remain unchanged.
- Speaker mode changes the Agora playback level; actual physical output-device routing remains governed by the browser/OS because browser audio output routing is not consistently exposed across desktop, mobile and Capacitor WebViews.
- Vercel production build passed on the Part 4 production deployment. Remaining verification: at least two authenticated devices speaking/listening simultaneously, hold/resume, mute, speaker level, participant join/leave, last-participant call end, reconnect, and mobile/Capacitor layout. No claim of complete real-device verification is made until those checks pass.

## Part 5 — Targeted group-call reactions (implemented; multi-device verification pending)

- Added the existing SociaLens call-reaction catalogue to the group-call screen without changing the one-to-one reaction flow.
- Every group reaction requires two explicit steps: choose a reaction, then confirm one or more recipients in a dedicated recipient picker. The recipient picker defaults to all other currently joined participants and allows the sender to narrow the audience before pressing **Done**.
- Added an authenticated group reaction API. It validates the reaction ID, requires the sender to be joined in an active group call, rejects duplicate/self/invalid recipient IDs, and verifies that every selected recipient is still joined in the same call.
- Reactions are ephemeral and are not inserted into chat history or group-call tables. The API publishes each event to a distinct private topic scoped to both the group-call ID and recipient user ID; the payload is sent only to that recipient's topic.
- Added Supabase Realtime authorization on `realtime.messages`. A user can read only their own private reaction topic, and only while the user is a joined participant in the corresponding active group call. Clients have no INSERT policy for these reaction topics; delivery is server-side after API validation.
- Added a group-call reaction control, searchable reaction catalogue/category filters, recipient-selection modal, and incoming reaction animation with sender label. Existing one-to-one CallProvider/CallScreen reaction broadcasts remain unchanged.
- Applied the Realtime authorization migrations and saved their SQL files in `supabase/migrations/`.
- Vercel production build passed for commit `b0770adbce78ed8f10a60f42edacb3ee6e6ef69a` and the deployment is `READY`. Remaining verification: private-topic subscription from two or more authenticated accounts, prove unselected participants do not receive the payload, confirm joined recipients receive it, confirm left/non-member users are denied, and regress existing one-to-one reactions. Real multi-device verification is still required before claiming full production acceptance.

