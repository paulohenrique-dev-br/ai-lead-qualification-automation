-- AI Lead Qualification Automation
-- PostgreSQL / Supabase schema (versioned migration)
-- Run this in the Supabase SQL editor or with psql against PostgreSQL 14+.

create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null unique,
  name text not null,
  email text not null,
  company text not null default '',
  company_size numeric,
  budget numeric,
  message text not null,
  source text not null default 'unknown',
  intent text not null,
  service text not null,
  qualification text not null,
  priority text not null,
  lead_score smallint not null,
  human_review boolean not null default true,
  qualification_reason text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  constraint chk_leads_intent check (
    intent in ('sales', 'support', 'partnership', 'other')
  ),
  constraint chk_leads_service check (
    service in ('ai_automation', 'api_integration', 'web_development', 'other')
  ),
  constraint chk_leads_qualification check (
    qualification in ('qualified', 'needs_review', 'unqualified')
  ),
  constraint chk_leads_priority check (
    priority in ('high', 'medium', 'low')
  ),
  constraint chk_leads_score check (lead_score between 0 and 100)
);

create index if not exists idx_leads_created_at
  on public.leads (created_at desc);

create index if not exists idx_leads_qualification
  on public.leads (qualification);

create table if not exists public.workflow_errors (
  id bigint generated always as identity primary key,
  submission_id text,
  stage text not null,
  error_type text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_workflow_errors_submission_id
  on public.workflow_errors (submission_id);

create index if not exists idx_workflow_errors_created_at
  on public.workflow_errors (created_at desc);

-- ---------------------------------------------------------------------------
-- Security: deny-by-default for Supabase Data API roles.
--
-- The n8n server uses service_role as a backend secret. The demo browser only
-- posts to n8n and never receives a database key. Enabling RLS with no anon
-- or authenticated policies keeps leads and workflow_errors private by
-- default; service_role still bypasses RLS on the server side.
-- ---------------------------------------------------------------------------

alter table public.leads enable row level security;
alter table public.workflow_errors enable row level security;

revoke all on table public.leads from anon, authenticated;
revoke all on table public.workflow_errors from anon, authenticated;

grant select, insert, update, delete on table public.leads to service_role;
grant select, insert, update, delete on table public.workflow_errors to service_role;
