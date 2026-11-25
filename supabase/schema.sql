-- ============================================================================
-- SCHEMA SUPABASE — RANKING GLOBAL GENIUS 3D WEB (UNICAP)
-- Execute este script uma única vez no SQL Editor do seu projeto Supabase.
-- ============================================================================

create table if not exists public.ranking_genius (
  id bigint generated always as identity primary key,
  apelido text not null check (char_length(trim(apelido)) between 1 and 16),
  pontos integer not null check (pontos between 1 and 999),
  dificuldade text not null check (dificuldade in ('facil', 'medio', 'dificil')),
  criado_em timestamptz not null default now()
);

-- Índice para consultas rápidas de Top 15 (geral e por dificuldade)
create index if not exists idx_ranking_genius_pontos
  on public.ranking_genius (pontos desc, criado_em asc);

create index if not exists idx_ranking_genius_dif_pontos
  on public.ranking_genius (dificuldade, pontos desc, criado_em asc);

-- Ativa Row Level Security (RLS) e permissões explícitas para anon/authenticated
alter table public.ranking_genius enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert on table public.ranking_genius to anon, authenticated;
grant usage, select on sequence public.ranking_genius_id_seq to anon, authenticated;

-- Permite leitura pública do ranking (SELECT)
drop policy if exists "Leitura publica do ranking" on public.ranking_genius;
create policy "Leitura publica do ranking"
  on public.ranking_genius
  for select
  to anon, authenticated
  using (true);

-- Permite inserção pública validada (INSERT) — bloqueia UPDATE e DELETE
drop policy if exists "Insercao publica validada no ranking" on public.ranking_genius;
create policy "Insercao publica validada no ranking"
  on public.ranking_genius
  for insert
  to anon, authenticated
  with check (
    char_length(trim(apelido)) between 1 and 16
    and pontos between 1 and 999
    and dificuldade in ('facil', 'medio', 'dificil')
  );
