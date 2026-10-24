create table if not exists public.story_quizzes (
  id uuid primary key,
  story_id uuid not null references public.stories(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  question text not null check (char_length(trim(question)) between 1 and 180),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 5),
  correct_option_id text not null,
  color text not null default '#7c3aed',
  created_at timestamptz not null default now()
);
create table if not exists public.story_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.story_quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (quiz_id, user_id)
);
alter table public.story_quizzes enable row level security;
alter table public.story_quiz_answers enable row level security;
create policy "Authenticated users can read story quizzes" on public.story_quizzes for select to authenticated using (true);
create policy "Story owners can create quizzes" on public.story_quizzes for insert to authenticated with check (auth.uid() = owner_id and exists (select 1 from public.stories s where s.id = story_id and s.user_id = auth.uid()));
create policy "Story owners can update quizzes" on public.story_quizzes for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Authenticated users can read quiz answers" on public.story_quiz_answers for select to authenticated using (true);
create policy "Users can submit their own quiz answer" on public.story_quiz_answers for insert to authenticated with check (auth.uid() = user_id and exists (select 1 from public.story_quizzes q join public.stories s on s.id = q.story_id where q.id = quiz_id and s.expires_at > now()));
create policy "Users can change their own quiz answer" on public.story_quiz_answers for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and exists (select 1 from public.story_quizzes q join public.stories s on s.id = q.story_id where q.id = quiz_id and s.expires_at > now()));
grant select, insert, update on public.story_quizzes to authenticated;
grant select, insert, update on public.story_quiz_answers to authenticated;
