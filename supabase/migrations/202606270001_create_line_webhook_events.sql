create table if not exists public.line_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.line_webhook_events enable row level security;

comment on table public.line_webhook_events is
  'Processed LINE webhook event IDs. Only the service role may access this table.';

create index if not exists line_webhook_events_processed_at_idx
  on public.line_webhook_events (processed_at);
