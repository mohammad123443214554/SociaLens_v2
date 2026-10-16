-- Part 4: let signed-in clients read normalized labels for ranking public posts.
-- The taste profile itself remains user-scoped; post labels contain no user taste data.
grant select on table public.post_content_analysis_labels to authenticated;
drop policy if exists "Authenticated users can read post recommendation labels" on public.post_content_analysis_labels;
create policy "Authenticated users can read post recommendation labels"
  on public.post_content_analysis_labels for select to authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_content_analysis_labels.post_id
  ));
