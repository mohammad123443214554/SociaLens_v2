drop policy if exists "Users can read own Studio projects" on public.studio_projects;
create policy "Users can read own Studio projects" on public.studio_projects for select to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
drop policy if exists "Users can create own Studio projects" on public.studio_projects;
create policy "Users can create own Studio projects" on public.studio_projects for insert to authenticated
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
drop policy if exists "Users can update own Studio projects" on public.studio_projects;
create policy "Users can update own Studio projects" on public.studio_projects for update to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false')
with check ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
drop policy if exists "Users can delete own Studio projects" on public.studio_projects;
create policy "Users can delete own Studio projects" on public.studio_projects for delete to authenticated
using ((select auth.uid()) = user_id and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');
drop policy if exists "Users manage own Studio project assets" on storage.objects;
create policy "Users manage own Studio project assets" on storage.objects for all to authenticated
using (bucket_id = 'studio-projects' and (storage.foldername(name))[1] = (select auth.uid())::text and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false')
with check (bucket_id = 'studio-projects' and (storage.foldername(name))[1] = (select auth.uid())::text and coalesce((select auth.jwt()->>'is_anonymous'), 'false') = 'false');