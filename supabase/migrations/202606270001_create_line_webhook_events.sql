create table if not exists public.line_webhook_events (
  event_id text primary key,
  status text not null check (status in ('processing', 'completed')),
  claimed_at timestamptz not null default now(),
  processed_at timestamptz null
);

alter table public.line_webhook_events enable row level security;

comment on table public.line_webhook_events is
  'LINE webhook processing leases and completed event IDs. Only the service role may access this table.';

create index if not exists line_webhook_events_processing_claimed_at_idx
  on public.line_webhook_events (claimed_at)
  where status = 'processing';

create index if not exists line_webhook_events_completed_processed_at_idx
  on public.line_webhook_events (processed_at)
  where status = 'completed';

create or replace function public.claim_line_webhook_event(p_event_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  claimed boolean;
begin
  delete from public.line_webhook_events
  where status = 'completed'
    and processed_at < now() - interval '30 days';

  insert into public.line_webhook_events (
    event_id,
    status,
    claimed_at,
    processed_at
  )
  values (p_event_id, 'processing', now(), null)
  on conflict (event_id) do update
  set claimed_at = now(),
      processed_at = null
  where line_webhook_events.status = 'processing'
    and line_webhook_events.claimed_at < now() - interval '5 minutes'
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.complete_line_webhook_event(p_event_id text)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  update public.line_webhook_events
  set status = 'completed',
      processed_at = now()
  where event_id = p_event_id
    and status = 'processing';
$$;

create or replace function public.release_line_webhook_event(p_event_id text)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  delete from public.line_webhook_events
  where event_id = p_event_id
    and status = 'processing';
$$;

revoke execute on function public.claim_line_webhook_event(text)
  from public, anon, authenticated;
revoke execute on function public.complete_line_webhook_event(text)
  from public, anon, authenticated;
revoke execute on function public.release_line_webhook_event(text)
  from public, anon, authenticated;

grant execute on function public.claim_line_webhook_event(text)
  to service_role;
grant execute on function public.complete_line_webhook_event(text)
  to service_role;
grant execute on function public.release_line_webhook_event(text)
  to service_role;
