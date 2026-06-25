create table if not exists public.pricebook_data (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pricebook_data enable row level security;

drop policy if exists "Authenticated users can read pricebook data" on public.pricebook_data;
drop policy if exists "Authenticated users can insert pricebook data" on public.pricebook_data;
drop policy if exists "Authenticated users can update pricebook data" on public.pricebook_data;
drop policy if exists "Authenticated users can delete pricebook data" on public.pricebook_data;

create policy "Authenticated users can read pricebook data"
on public.pricebook_data
for select
to authenticated
using (true);

create policy "Authenticated users can insert pricebook data"
on public.pricebook_data
for insert
to authenticated
with check (true);

create policy "Authenticated users can update pricebook data"
on public.pricebook_data
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete pricebook data"
on public.pricebook_data
for delete
to authenticated
using (true);
