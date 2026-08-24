-- ============================================================================
-- Lightweight, self-hosted visit tracking.
--
-- The public site records each page view through record_view() (a SECURITY
-- DEFINER RPC, so the anon client never touches the table directly). Staff read
-- aggregates through get_view_stats(); the raw rows are staff-only via RLS, so
-- visitor identifiers are never exposed to the public.
--
-- "Visitor" is a random id the browser keeps in localStorage — enough to
-- separate unique visitors from raw page views, with no personal data and no
-- cookies.
-- ============================================================================

set check_function_bodies = off;

create table if not exists public.page_views (
  id         bigint generated always as identity primary key,
  path       text not null,
  visitor    text,
  referrer   text,
  created_at timestamptz not null default now()
);
alter table public.page_views enable row level security;
create index if not exists page_views_created_idx on public.page_views (created_at);
create index if not exists page_views_path_idx on public.page_views (path);

-- Staff may read; nobody inserts directly (that goes through record_view()).
drop policy if exists "page_views: staff read" on public.page_views;
create policy "page_views: staff read" on public.page_views for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Record a view. Callable by anyone; values are length-capped defensively.
-- ---------------------------------------------------------------------------
create or replace function public.record_view(
  p_path text,
  p_visitor text default null,
  p_ref text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_path), '') = '' then return; end if;
  insert into public.page_views (path, visitor, referrer)
  values (left(p_path, 300), nullif(left(coalesce(p_visitor, ''), 64), ''), nullif(left(coalesce(p_ref, ''), 300), ''));
end; $$;

grant execute on function public.record_view(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aggregated stats for the admin. Staff-only (checked inside, since the
-- function is SECURITY DEFINER). Returns totals, a per-day series, and the
-- most-viewed paths within the last p_days.
-- ---------------------------------------------------------------------------
create or replace function public.get_view_stats(p_days int default 30)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_days  int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_since timestamptz := now() - make_interval(days => v_days);
  v jsonb;
begin
  if not public.is_staff() then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'days', v_days,
    'total_all_time', (select count(*) from public.page_views),
    'total', (select count(*) from public.page_views where created_at >= v_since),
    'visitors', (select count(distinct visitor) from public.page_views
                 where created_at >= v_since and visitor is not null),
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'views', c) order by d), '[]'::jsonb)
      from (
        select (date_trunc('day', created_at))::date d, count(*) c
        from public.page_views where created_at >= v_since
        group by 1
      ) t
    ),
    'top_paths', (
      select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', c) order by c desc), '[]'::jsonb)
      from (
        select path, count(*) c
        from public.page_views where created_at >= v_since
        group by path order by c desc limit 12
      ) t
    )
  ) into v;

  return v;
end; $$;

grant execute on function public.get_view_stats(int) to authenticated;
