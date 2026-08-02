-- Fluent schema: documents, positions, reading_sessions, highlights
-- All tables are per-user with Row Level Security.

create extension if not exists pgcrypto;

-- ============ documents ============
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled',
  author text,
  source_type text not null default 'manual' check (source_type in ('url','pdf','epub','docx','txt','md','paste','manual','sample')),
  source_url text,
  content text not null default '',
  excerpt text,
  cover_url text,
  favicon_url text,
  word_count integer not null default 0,
  status text not null default 'unread' check (status in ('unread','reading','finished','archived')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_user_updated_idx on public.documents (user_id, updated_at desc);
create index if not exists documents_user_status_idx on public.documents (user_id, status);

-- ============ positions (cross-device resume) ============
create table if not exists public.positions (
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_index integer not null default 0,
  wpm integer not null default 300,
  updated_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

-- ============ reading_sessions (stats) ============
create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  wpm integer not null default 0,
  words_read integer not null default 0,
  duration_ms integer not null default 0,
  started_at timestamptz not null default now()
);

create index if not exists sessions_user_started_idx on public.reading_sessions (user_id, started_at desc);

-- ============ highlights ============
create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  text text not null,
  word_index integer not null default 0,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists highlights_user_doc_idx on public.highlights (user_id, document_id);

-- ============ updated_at trigger ============
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
  for each row execute function public.set_updated_at();

drop trigger if exists positions_touch on public.positions;
create trigger positions_touch before update on public.positions
  for each row execute function public.set_updated_at();

-- ============ Row Level Security ============
alter table public.documents enable row level security;
alter table public.positions enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.highlights enable row level security;

drop policy if exists "own documents" on public.documents;
create policy "own documents" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own positions" on public.positions;
create policy "own positions" on public.positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own sessions" on public.reading_sessions;
create policy "own sessions" on public.reading_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own highlights" on public.highlights;
create policy "own highlights" on public.highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ grants (RLS still applies row filtering) ============
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.positions to authenticated;
grant select, insert, update, delete on public.reading_sessions to authenticated;
grant select, insert, update, delete on public.highlights to authenticated;
