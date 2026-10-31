# SociaLens call announcement audio

Place the following MP3 files directly in this folder. Keep the filenames exactly as written; the app loads them from `/audio/calls/<filename>`.

## Connected to the call flow

- `call-unanswered.mp3` — played when the outgoing call times out without an answer.
- `call-rejected.mp3` — played when the callee explicitly declines.
- `call-user-busy.mp3` — played when the callee is already in another SociaLens call and a second call is declined as busy.
- `call-on-hold.mp3` — played to the caller when the other participant places the active call on hold.

## Reserved for future presence / reachability detection

- `call-network-unavailable.mp3`
- `call-not-logged-in.mp3`
- `call-device-switched-off.mp3`

These last three clips are not triggered yet. The current calling backend cannot reliably distinguish a switched-off device, a signed-out user, and a device with no network. Do not play a specific status announcement unless the app can verify that status; otherwise it could tell callers something inaccurate.

Use the same licensed female English voice for every clip. MP3 is recommended.