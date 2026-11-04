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
2. **Group creation, invitations, and capacity** — add group-specific schema/RLS, transaction-safe create/invite/accept/decline/expire/leave operations, contact picker, push notifications, and the hard 10-person limit.
3. **Agora group media and incoming invitation experience** — group-aware credential endpoint, participant join/leave/reconnect, explicit incoming group call screen with all joined profiles, and host-independent session lifetime.
4. **Group call screen and controls** — responsive participant roster, independent audio tracks, speaking indicators, existing voice-call controls, and realtime roster recovery.
5. **Targeted reactions, security hardening, and verification** — mandatory recipient selection, multi-recipient targeted delivery, RLS/API abuse tests, 10-person concurrency tests, network/reconnect tests, and regression checks for existing 1-to-1 voice/video calls.

## Part 1 acceptance record

- Repository inspected on main.
- Supabase project inspected directly; existing calls columns, RLS policies, indexes, and Realtime publication membership checked.
- Existing call endpoints, push path, incoming modal, global provider, call engine, and reaction broadcast path inspected.
- No production database schema or existing call behavior was changed in Part 1.
- No claim of end-to-end group-call functionality is made yet. The actual feature starts in Part 2 after this compatibility design is locked.
