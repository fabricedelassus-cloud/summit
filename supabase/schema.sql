-- ============================================================
-- SUMMIT — schéma Postgres + policies RLS
-- À exécuter dans Supabase : Dashboard > SQL Editor > New query.
-- Idempotent : réexécutable sans dommage.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Réglages généraux (début de bloc, numéro de bloc)
--    Ne figure pas dans la liste du brief, mais l'état global
--    doit bien vivre quelque part : c'est l'ancien summit:state.
-- ------------------------------------------------------------
create table if not exists public.app_state (
  user_id     uuid primary key references auth.users on delete cascade,
  bloc_start  date        not null,
  bloc        integer     not null default 1,
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. Journal quotidien — ancien summit:day:YYYY-MM-DD
-- ------------------------------------------------------------
create table if not exists public.daily_log (
  user_id     uuid        not null references auth.users on delete cascade,
  d           date        not null,
  mob         boolean     not null default false,
  seance      boolean     not null default false,
  crea        boolean     not null default false,
  kcal        boolean     not null default false,
  prot        boolean[]   not null default '{false,false,false,false}',
  sommeil     numeric(3,1),
  pas         integer,
  note        text,
  pick        smallint,   -- séance choisie (0-6) ; null = celle du calendrier
  updated_at  timestamptz not null default now(),
  primary key (user_id, d),
  constraint pick_valide check (pick is null or (pick >= 0 and pick <= 6))
);

-- ------------------------------------------------------------
-- 3. Séances enregistrées — ancien summit:wk:YYYY-MM-DD
--    La contrainte porte sur (jour, code) et non sur le jour seul :
--    depuis le sélecteur de séance, deux séances différentes peuvent
--    tomber le même jour.
-- ------------------------------------------------------------
create table if not exists public.sessions_log (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users on delete cascade,
  d           date        not null,
  code        text        not null,   -- J1 J2 J3 J4 J5 S D
  kind        text        not null,   -- muscu | cardio
  exercices   jsonb,                  -- {"j1a":{"s":[18,16,15],"rir":"1"}, ...}
  cardio      jsonb,                  -- {"kind":"Z2 vélo","min":45,"fc":118,...}
  updated_at  timestamptz not null default now(),
  unique (user_id, d, code),
  constraint kind_valide check (kind in ('muscu','cardio'))
);
create index if not exists sessions_log_user_date on public.sessions_log (user_id, d desc);

-- ------------------------------------------------------------
-- 4. Mesures — ancien summit:mesures
--    taille = TOUR de taille, en cm.
-- ------------------------------------------------------------
create table if not exists public.mesures (
  user_id     uuid        not null references auth.users on delete cascade,
  d           date        not null,
  poids       numeric(4,1),
  taille      numeric(4,1),
  sol         numeric(4,1),
  updated_at  timestamptz not null default now(),
  primary key (user_id, d)
);

-- ------------------------------------------------------------
-- 5. Tests de fin de bloc — ancien summit:tests
-- ------------------------------------------------------------
create table if not exists public.tests (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users on delete cascade,
  d           date        not null,
  bloc        integer     not null,
  pompes      integer,
  tractions   integer,
  hang        integer,       -- dead hang, en secondes
  sol         numeric(4,1),
  taille      numeric(4,1),
  updated_at  timestamptz not null default now(),
  unique (user_id, bloc)
);

-- ============================================================
-- RLS : rien n'est lisible ni modifiable sans être le propriétaire.
-- Le rôle anon (clé publiable seule, sans connexion) n'obtient RIEN :
-- aucune policy ne le vise, et RLS refuse par défaut.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['app_state','daily_log','sessions_log','mesures','tests'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists proprietaire_select on public.%I', t);
    execute format('drop policy if exists proprietaire_insert on public.%I', t);
    execute format('drop policy if exists proprietaire_update on public.%I', t);
    execute format('drop policy if exists proprietaire_delete on public.%I', t);

    execute format($f$create policy proprietaire_select on public.%I
                       for select to authenticated using (auth.uid() = user_id)$f$, t);
    execute format($f$create policy proprietaire_insert on public.%I
                       for insert to authenticated with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy proprietaire_update on public.%I
                       for update to authenticated using (auth.uid() = user_id)
                       with check (auth.uid() = user_id)$f$, t);
    execute format($f$create policy proprietaire_delete on public.%I
                       for delete to authenticated using (auth.uid() = user_id)$f$, t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- updated_at tenu à jour automatiquement : sert d'arbitre au
-- moment de la synchronisation après une coupure réseau.
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['app_state','daily_log','sessions_log','mesures','tests'] loop
    execute format('drop trigger if exists touch_%s on public.%I', t, t);
    execute format($f$create trigger touch_%s before update on public.%I
                       for each row execute function public.touch_updated_at()$f$, t, t);
  end loop;
end $$;
