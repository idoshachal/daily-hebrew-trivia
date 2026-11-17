create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 40),
  body text not null check (char_length(body) between 10 and 2000),
  created_at timestamptz not null default now()
);

alter table public.submissions enable row level security;

revoke all on table public.submissions from anon, authenticated;
grant insert on table public.submissions to anon, authenticated;

drop policy if exists "anyone can submit" on public.submissions;
create policy "anyone can submit"
  on public.submissions
  for insert
  to anon, authenticated
  with check (
    char_length(display_name) between 2 and 40
    and char_length(body) between 10 and 2000
  );
