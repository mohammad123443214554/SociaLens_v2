-- Replace retired generated ringtone IDs with the first bundled SociaLens ringtone.
-- The 50 audio files are served from public/audio/ringtones.
alter table public.profiles
  alter column call_ringtone set default 'ringtone-01';

update public.profiles
set call_ringtone = 'ringtone-01'
where call_ringtone is null
   or call_ringtone !~ '^ringtone-(0[1-9]|[1-4][0-9]|50)$';
