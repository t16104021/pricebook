alter table public.line_webhook_events
  add column if not exists status text,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_token text;

update public.line_webhook_events
set status = 'completed'
where status is null;

update public.line_webhook_events
set claimed_at = coalesce(claimed_at, processed_at, now())
where claimed_at is null;

update public.line_webhook_events
set processed_at = now()
where status = 'completed'
  and processed_at is null;

update public.line_webhook_events
set claim_token = pg_catalog.gen_random_uuid()::text
where status = 'processing'
  and claim_token is null;

update public.line_webhook_events
set claim_token = null
where status = 'completed'
  and claim_token is not null;

alter table public.line_webhook_events
  alter column status set not null,
  alter column claimed_at set default now(),
  alter column claimed_at set not null,
  alter column processed_at drop default,
  alter column processed_at drop not null;

alter table public.line_webhook_events
  drop constraint if exists line_webhook_events_status_check,
  drop constraint if exists line_webhook_events_lease_check;

alter table public.line_webhook_events
  add constraint line_webhook_events_status_check
    check (status in ('processing', 'completed')),
  add constraint line_webhook_events_lease_check
    check (
      (
        status = 'processing'
        and claim_token is not null
        and processed_at is null
      )
      or
      (
        status = 'completed'
        and claim_token is null
        and processed_at is not null
      )
    );

comment on table public.line_webhook_events is
  'LINE webhook processing leases and completed event IDs. Only the service role may access this table.';

create index if not exists line_webhook_events_processing_claimed_at_idx
  on public.line_webhook_events (claimed_at)
  where status = 'processing';

create index if not exists line_webhook_events_completed_processed_at_idx
  on public.line_webhook_events (processed_at)
  where status = 'completed';

create unique index if not exists line_webhook_events_claim_token_idx
  on public.line_webhook_events (claim_token)
  where claim_token is not null;

drop function if exists public.claim_line_webhook_event(text);
drop function if exists public.complete_line_webhook_event(text);
drop function if exists public.release_line_webhook_event(text);

create function public.claim_line_webhook_event(p_event_id text)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  new_claim_token text := pg_catalog.gen_random_uuid()::text;
  claimed_token text;
begin
  delete from public.line_webhook_events
  where status = 'completed'
    and processed_at < now() - interval '30 days';

  insert into public.line_webhook_events (
    event_id,
    status,
    claimed_at,
    claim_token,
    processed_at
  )
  values (
    p_event_id,
    'processing',
    now(),
    new_claim_token,
    null
  )
  on conflict (event_id) do update
  set claimed_at = excluded.claimed_at,
      claim_token = excluded.claim_token,
      processed_at = null
  where line_webhook_events.status = 'processing'
    and line_webhook_events.claimed_at < now() - interval '5 minutes'
  returning claim_token into claimed_token;

  return claimed_token;
end;
$$;

create function public.complete_line_webhook_event(
  p_event_id text,
  p_claim_token text
)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  update public.line_webhook_events
  set status = 'completed',
      claim_token = null,
      processed_at = now()
  where event_id = p_event_id
    and claim_token = p_claim_token
    and status = 'processing';
$$;

create function public.release_line_webhook_event(
  p_event_id text,
  p_claim_token text
)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  delete from public.line_webhook_events
  where event_id = p_event_id
    and claim_token = p_claim_token
    and status = 'processing';
$$;

revoke execute on function public.claim_line_webhook_event(text)
  from public, anon, authenticated;
revoke execute on function public.complete_line_webhook_event(text, text)
  from public, anon, authenticated;
revoke execute on function public.release_line_webhook_event(text, text)
  from public, anon, authenticated;

grant execute on function public.claim_line_webhook_event(text)
  to service_role;
grant execute on function public.complete_line_webhook_event(text, text)
  to service_role;
grant execute on function public.release_line_webhook_event(text, text)
  to service_role;
