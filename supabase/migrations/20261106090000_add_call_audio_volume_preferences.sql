alter table public.profiles
  add column if not exists call_output_volume smallint not null default 100
    check (call_output_volume between 0 and 100),
  add column if not exists call_input_volume smallint not null default 100
    check (call_input_volume between 0 and 200);
