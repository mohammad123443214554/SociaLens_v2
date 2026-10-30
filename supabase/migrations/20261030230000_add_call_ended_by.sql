alter table public.calls
  add column if not exists ended_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calls_ended_by_participant_check'
      and conrelid = 'public.calls'::regclass
  ) then
    alter table public.calls
      add constraint calls_ended_by_participant_check
      check (ended_by is null or ended_by in (caller_id, callee_id));
  end if;
end $$;
