-- Private per-user storage for uploaded call ringtones.
-- profiles.call_ringtone stores "custom:<storage path>" for a user's own uploaded sound.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'call-ringtones',
  'call-ringtones',
  false,
  10485760,
  array[
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
    'audio/webm'
  ]::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "SociaLens users read own call ringtones" on storage.objects;
create policy "SociaLens users read own call ringtones"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'call-ringtones'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "SociaLens users upload own call ringtones" on storage.objects;
create policy "SociaLens users upload own call ringtones"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'call-ringtones'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "SociaLens users update own call ringtones" on storage.objects;
create policy "SociaLens users update own call ringtones"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'call-ringtones'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'call-ringtones'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "SociaLens users delete own call ringtones" on storage.objects;
create policy "SociaLens users delete own call ringtones"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'call-ringtones'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
