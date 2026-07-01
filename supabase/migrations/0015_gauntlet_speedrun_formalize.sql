-- 0015_gauntlet_speedrun_formalize.sql
-- IDEA // GAUNTLET: formalize the Speedrun challenge data structure and add the
-- artifact storage that backs the 3D part preview.
--
-- Governing principle: the drawing (PNG) and the 3D model (STL) are pure-geometry
-- artifacts carrying no identity or metadata. Everything else is site data.
--   * Site data stays in the challenge record (the existing prompt / answer JSONB,
--     no new columns): the Speedrun record already holds material, density, target
--     mass, canonical volume (target_volume_mm3), surface area, feature count, and
--     tolerance band. This migration formalizes the few that were missing as pure
--     site data (slug, tier, par_time) and adds the two Storage-reference fields
--     (drawing_image_path, model_path). They live in JSONB like every other
--     modeling field (see docs/GAUNTLET.md and 0004..0009), so no table rework.
--   * One GLOBAL ruleset (units label, projection, rule lines) shared across every
--     Speedrun challenge, stored ONCE (a singleton table), not repeated per record.
--   * Two Storage buckets for the artifacts. Authenticated students read; teachers
--     write. This follows the 0009 `gauntlet` bucket + teacher-write RLS pattern,
--     tightened from public read to authenticated read per the artifact policy.
--
-- Field placement (JSONB, consistent with the existing modeling shapes):
--   prompt  (public framing): slug, tier, par_time, model_path (the STL is a
--           shape-only preview, safe to show before Start), plus the existing
--           material / density / target_mass / tolerance_pct / length_unit / note.
--   answer  (hidden, revealed on Start): drawing_image_path (the dimensioned PNG,
--           gated exactly like the existing `drawing`), plus the existing
--           authoritative target_volume_mm3 / target_mass / density / tolerance_pct
--           and audit surface_area / feature_count.
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. Stable, url-safe slug identity for Speedrun challenges.
-- The slug lives in the public `prompt` (harmless to expose, like the knowledge
-- seeds' slug). A partial unique index keeps it stable and non-duplicated across
-- Speedrun challenges without forcing one onto legacy/demo rows that lack it.
-- ---------------------------------------------------------------------------
create unique index if not exists challenges_speedrun_slug_idx
	on public.challenges (lower(prompt ->> 'slug'))
	where mode = 'speedrun'::public.gauntlet_mode
		and nullif(btrim(prompt ->> 'slug'), '') is not null;

-- ---------------------------------------------------------------------------
-- 2. Reveal RPC also hands back the dimensioned drawing PNG path.
-- Unchanged behavior otherwise: still Speedrun-only, still mints a single-use,
-- ~30-minute submit code stamped with the authoritative reveal_at (see 0006).
-- The PNG lives in the hidden `answer` under a random, unguessable Storage path;
-- returning it only on Start preserves reveal-on-start for the dimensioned view.
-- The STL preview is public (prompt) and shown before Start, so it is not here.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_speedrun_reveal(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_mode public.gauntlet_mode;
	v_published boolean;
	v_drawing text;
	v_drawing_path text;
	v_asset text;
	v_code text;
	v_reveal_at timestamptz := now();
	v_expires timestamptz := now() + interval '30 minutes';
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	select c.mode, c.published, c.answer ->> 'drawing', c.answer ->> 'drawing_image_path', c.asset_ref
		into v_mode, v_published, v_drawing, v_drawing_path, v_asset
		from public.challenges c
		where c.id = p_challenge_id;

	if not found then
		raise exception 'Challenge not found.';
	end if;
	if v_mode <> 'speedrun' then
		raise exception 'Not a Speedrun challenge.';
	end if;
	if not v_published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	-- Only the latest reveal for this user+challenge stays live: retire any prior
	-- unused codes so a stale code cannot be held in reserve.
	update public.gauntlet_run_tokens
		set used_at = v_reveal_at
		where user_id = v_uid and challenge_id = p_challenge_id and used_at is null;

	-- Mint a unique code; retry on the rare PK collision.
	loop
		v_code := public.gauntlet_gen_code();
		begin
			insert into public.gauntlet_run_tokens (code, user_id, challenge_id, reveal_at, expires_at)
			values (v_code, v_uid, p_challenge_id, v_reveal_at, v_expires);
			exit;
		exception when unique_violation then
			-- collision, regenerate
		end;
	end loop;

	return jsonb_build_object(
		'drawing', v_drawing,
		'drawing_image_path', v_drawing_path,
		'asset_ref', v_asset,
		'code', v_code,
		'reveal_at', v_reveal_at,
		'expires_at', v_expires
	);
end;
$$;

revoke all on function public.gauntlet_speedrun_reveal(uuid) from public;
grant execute on function public.gauntlet_speedrun_reveal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Global Speedrun ruleset: ONE shared, teacher-editable record. The rules are
-- shown next to every Speedrun challenge, so they are stored once, not per
-- challenge. Singleton enforced by a boolean primary key fixed to true.
-- ---------------------------------------------------------------------------
create table if not exists public.gauntlet_speedrun_ruleset (
	id boolean primary key default true check (id),
	units_label text not null default 'inch, 3-place decimal',
	projection text not null default 'third angle',
	rule_lines text[] not null default array[
		'Unless noted, all edges sharp',
		'Do not scale drawing'
	],
	updated_at timestamptz not null default now()
);

-- Seed the single row with the defaults (idempotent; never overwrites edits).
insert into public.gauntlet_speedrun_ruleset (id)
values (true)
on conflict (id) do nothing;

-- Keep updated_at fresh on edit (reuses the 0004 trigger function).
drop trigger if exists gauntlet_ruleset_touch_updated_at on public.gauntlet_speedrun_ruleset;
create trigger gauntlet_ruleset_touch_updated_at
	before update on public.gauntlet_speedrun_ruleset
	for each row execute function public.touch_updated_at();

-- Everyone signed in reads the rules; only teachers edit. Unlike the answer-
-- hiding challenges table, the ruleset has no private columns and no per-mode
-- validation, so a plain teacher-gated RLS update policy is the right fit (like
-- profiles' "update own profile"), no SECURITY DEFINER RPC needed.
alter table public.gauntlet_speedrun_ruleset enable row level security;

revoke all on public.gauntlet_speedrun_ruleset from anon, authenticated;
grant select on public.gauntlet_speedrun_ruleset to authenticated;
grant update on public.gauntlet_speedrun_ruleset to authenticated;

drop policy if exists "read speedrun ruleset" on public.gauntlet_speedrun_ruleset;
create policy "read speedrun ruleset"
	on public.gauntlet_speedrun_ruleset
	for select
	to authenticated
	using (true);

drop policy if exists "teachers update speedrun ruleset" on public.gauntlet_speedrun_ruleset;
create policy "teachers update speedrun ruleset"
	on public.gauntlet_speedrun_ruleset
	for update
	to authenticated
	using (public.is_teacher())
	with check (public.is_teacher());

-- ---------------------------------------------------------------------------
-- 4. Storage: two private buckets for the geometry artifacts.
--   gauntlet-drawings : dimensioned drawing PNGs (the gated `drawing_image_path`).
--   gauntlet-models   : STL models (the `model_path` preview).
-- Private (public=false) so reads go through the authenticated-read policy;
-- teachers write. Mirrors the 0009 teacher-write RLS, tightened to authenticated
-- read. The dimensioned PNG stays gated the same way the SVG drawing is: its path
-- is random and hidden in `answer`, handed back only by the reveal RPC on Start.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
	('gauntlet-drawings', 'gauntlet-drawings', false),
	('gauntlet-models', 'gauntlet-models', false)
on conflict (id) do nothing;

drop policy if exists "read gauntlet artifacts" on storage.objects;
create policy "read gauntlet artifacts"
	on storage.objects
	for select
	to authenticated
	using (bucket_id in ('gauntlet-drawings', 'gauntlet-models'));

drop policy if exists "teachers upload gauntlet artifacts" on storage.objects;
create policy "teachers upload gauntlet artifacts"
	on storage.objects
	for insert
	to authenticated
	with check (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.is_teacher());

drop policy if exists "teachers update gauntlet artifacts" on storage.objects;
create policy "teachers update gauntlet artifacts"
	on storage.objects
	for update
	to authenticated
	using (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.is_teacher())
	with check (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.is_teacher());

drop policy if exists "teachers delete gauntlet artifacts" on storage.objects;
create policy "teachers delete gauntlet artifacts"
	on storage.objects
	for delete
	to authenticated
	using (bucket_id in ('gauntlet-drawings', 'gauntlet-models') and public.is_teacher());
