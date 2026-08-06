-- 0064_tournament_entry_styles.sql
-- IDEA Tournaments, Phase 2b: per-entry banner customization.
--
-- One optional style row per entry. Absent = the entry renders with the plain
-- Phase 1 treatment (display name + thumbnail), which is what every entry
-- looks like until its owner customizes it. Nothing here is ever required.
--
-- Naming: the spec's bare `entry_styles` / `set_entry_style` are prefixed
-- tournament_* for the same reason 0062 prefixed everything else -- the
-- public schema and PostgREST's RPC namespace are both global.
--
-- Access model, unchanged from 0062: PUBLIC SELECT to anon and authenticated
-- (a banner is a spectator-facing thing; the TV projector has no session),
-- and ZERO client write path. The single writer is the SECURITY DEFINER RPC
-- tournament_set_entry_style, which re-checks the caller:
--   * the entry's own LINKED user (entries.user_id = auth.uid()), or
--   * a HOST of the tournament, but only for an UNLINKED walk-up entry
--     (entries.user_id is null). A host deliberately cannot restyle a
--     registered player's banner: it is that player's identity, and the
--     host already controls seeding, matches and removal.
--
-- IDENTITY RULE (0062) still holds: nothing here touches profiles, Google
-- names or avatars. A style decorates entries.display_name; it never
-- replaces or reveals an account identity.
--
-- Background images reuse the EXISTING public 'tournament-thumbs' bucket
-- from 0062 (own-<uid>/-folder writes, public read). No new bucket: banner
-- art and entry thumbnails have identical visibility and identical
-- ownership rules, so a second bucket would only be a second set of
-- policies to keep in sync.
--
-- FLOURISHES ARE COSMETIC ONLY. They are stored and rendered as decoration;
-- no RPC, view or match rule reads them, and match state keeps its own
-- visual language (status, winner_id, the live indicator).
--
-- Apply manually in the Supabase SQL editor, after 0063. Idempotent where
-- practical.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.tournament_entry_styles (
	-- One style per entry: the entry IS the key.
	entry_id uuid primary key references public.tournament_entries (id) on delete cascade,
	-- Denormalized for the realtime filter (the TV view and the live page both
	-- subscribe filtered on tournament_id) -- the tournament_match_games
	-- convention from 0062.
	tournament_id uuid not null references public.tournaments (id) on delete cascade,

	background_type text check (background_type in ('solid', 'gradient', 'image')),
	-- Shape follows background_type (validated in the RPC, which is the only
	-- writer):
	--   solid    -> a json string, '#rrggbb'
	--   gradient -> a json array of exactly two '#rrggbb' strings
	--   image    -> a json string, an https:// URL (<= 600 chars, matching the
	--               entries.thumbnail_url cap)
	-- Null exactly when background_type is null.
	background_value jsonb,

	accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'),
	-- Preset icon id; see BADGE_IDS below. Null = no badge.
	badge text,
	-- Preset cosmetic effect id; see FLOURISH_IDS below. Null = none.
	flourish text,
	tagline text check (tagline is null or char_length(tagline) between 1 and 48),

	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now(),

	-- background_value is present exactly when a background is configured.
	constraint tournament_entry_styles_bg_pair
		check ((background_type is null) = (background_value is null))
);

create index if not exists tournament_entry_styles_tournament_idx
	on public.tournament_entry_styles (tournament_id);

-- The allowlists live here as CHECK constraints so the database, not the
-- client, is the authority on what a badge or flourish may be. The TS
-- registry in src/lib/tournaments/entry-styles.ts mirrors these lists for
-- display (label + artwork); keep the two in sync in the same change (the
-- greenline economy.ts precedent).
do $$
begin
	if not exists (
		select 1 from pg_constraint where conname = 'tournament_entry_styles_badge_ck'
	) then
		alter table public.tournament_entry_styles
			add constraint tournament_entry_styles_badge_ck
			check (badge is null or badge in (
				'bolt', 'flame', 'star', 'shield', 'gear', 'skull', 'crown', 'rocket'
			));
	end if;
	if not exists (
		select 1 from pg_constraint where conname = 'tournament_entry_styles_flourish_ck'
	) then
		alter table public.tournament_entry_styles
			add constraint tournament_entry_styles_flourish_ck
			check (flourish is null or flourish in (
				'glow-pulse', 'particle-trail', 'screen-shake-on-elimination', 'confetti-on-win'
			));
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Privileges + RLS: public read, zero client writes (the 0062 doctrine).
-- ---------------------------------------------------------------------------

revoke all on public.tournament_entry_styles from anon, authenticated;
grant select on public.tournament_entry_styles to anon, authenticated;
alter table public.tournament_entry_styles enable row level security;

drop policy if exists "public read" on public.tournament_entry_styles;
create policy "public read"
	on public.tournament_entry_styles
	for select
	to anon, authenticated
	using (true);

-- ---------------------------------------------------------------------------
-- 3. Validation helper (internal: no grants, definer-only callers)
-- ---------------------------------------------------------------------------

-- Raises unless p_value is the right shape for p_type. Returns the value
-- normalized (hex lowercased, whitespace trimmed).
create or replace function public._tournament_normalize_background(
	p_type text,
	p_value jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
	v_a text;
	v_b text;
	v_url text;
begin
	if p_type is null then
		return null;
	end if;

	if p_type = 'solid' then
		if jsonb_typeof(p_value) <> 'string' then
			raise exception 'A solid background needs one color.';
		end if;
		v_a := lower(btrim(p_value #>> '{}'));
		if v_a !~ '^#[0-9a-f]{6}$' then
			raise exception 'Background color must be a hex value like #1f6feb.';
		end if;
		return to_jsonb(v_a);

	elsif p_type = 'gradient' then
		if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) <> 2 then
			raise exception 'A gradient background needs exactly two colors.';
		end if;
		v_a := lower(btrim((p_value -> 0) #>> '{}'));
		v_b := lower(btrim((p_value -> 1) #>> '{}'));
		if v_a !~ '^#[0-9a-f]{6}$' or v_b !~ '^#[0-9a-f]{6}$' then
			raise exception 'Gradient colors must be hex values like #1f6feb.';
		end if;
		return jsonb_build_array(v_a, v_b);

	elsif p_type = 'image' then
		if jsonb_typeof(p_value) <> 'string' then
			raise exception 'An image background needs an image URL.';
		end if;
		v_url := btrim(p_value #>> '{}');
		if v_url !~ '^https://' then
			raise exception 'Background image must be an https:// URL.';
		end if;
		if char_length(v_url) > 600 then
			raise exception 'Background image URL is too long.';
		end if;
		return to_jsonb(v_url);
	end if;

	raise exception 'Unknown background type: %', p_type;
end;
$$;

revoke all on function public._tournament_normalize_background(text, jsonb) from public;

-- ---------------------------------------------------------------------------
-- 4. The one write path
-- ---------------------------------------------------------------------------

-- FULL REPLACEMENT of an entry's style, one call (the
-- tournament_set_reward_rules convention): every field is written from the
-- arguments, so omitting one clears it. An all-empty call DELETES the row,
-- returning the entry to the default treatment -- that is the reset.
--
-- Returns the entry id (null when the style was cleared).
create or replace function public.tournament_set_entry_style(
	p_entry_id uuid,
	p_background_type text default null,
	p_background_value jsonb default null,
	p_accent_color text default null,
	p_badge text default null,
	p_flourish text default null,
	p_tagline text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_e public.tournament_entries;
	v_bg_type text := nullif(btrim(coalesce(p_background_type, '')), '');
	v_bg jsonb;
	v_accent text := nullif(lower(btrim(coalesce(p_accent_color, ''))), '');
	v_badge text := nullif(btrim(coalesce(p_badge, '')), '');
	v_flourish text := nullif(btrim(coalesce(p_flourish, '')), '');
	v_tagline text := nullif(btrim(coalesce(p_tagline, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in to customize an entry.';
	end if;

	select * into v_e from public.tournament_entries where id = p_entry_id;
	if not found then
		raise exception 'Entry not found.';
	end if;

	-- Authorization: the entry's own player, or a host standing in for an
	-- unlinked walk-up. A host may NOT restyle a linked player's banner.
	if v_e.user_id is not null then
		if v_e.user_id <> v_uid then
			raise exception 'Only the player who owns this entry can customize it.';
		end if;
	else
		if not exists (
			select 1 from public.tournament_hosts
			where tournament_id = v_e.tournament_id and user_id = v_uid
		) then
			raise exception 'Only a host can customize a walk-up entry.';
		end if;
	end if;

	v_bg := public._tournament_normalize_background(v_bg_type, p_background_value);

	if v_accent is not null and v_accent !~ '^#[0-9a-f]{6}$' then
		raise exception 'Accent color must be a hex value like #1f6feb.';
	end if;
	if v_badge is not null and v_badge not in (
		'bolt', 'flame', 'star', 'shield', 'gear', 'skull', 'crown', 'rocket'
	) then
		raise exception 'Unknown badge: %', v_badge;
	end if;
	if v_flourish is not null and v_flourish not in (
		'glow-pulse', 'particle-trail', 'screen-shake-on-elimination', 'confetti-on-win'
	) then
		raise exception 'Unknown flourish: %', v_flourish;
	end if;
	if v_tagline is not null and char_length(v_tagline) > 48 then
		raise exception 'Tagline must be 48 characters or fewer.';
	end if;

	-- Nothing set at all: clear the row, back to the default treatment.
	if v_bg_type is null and v_accent is null and v_badge is null
		and v_flourish is null and v_tagline is null then
		delete from public.tournament_entry_styles where entry_id = p_entry_id;
		return null;
	end if;

	insert into public.tournament_entry_styles as s (
		entry_id, tournament_id, background_type, background_value,
		accent_color, badge, flourish, tagline, updated_by, updated_at
	)
	values (
		p_entry_id, v_e.tournament_id, v_bg_type, v_bg,
		v_accent, v_badge, v_flourish, v_tagline, v_uid, now()
	)
	on conflict (entry_id) do update set
		background_type = excluded.background_type,
		background_value = excluded.background_value,
		accent_color = excluded.accent_color,
		badge = excluded.badge,
		flourish = excluded.flourish,
		tagline = excluded.tagline,
		updated_by = excluded.updated_by,
		updated_at = excluded.updated_at
	where s.entry_id = p_entry_id;

	return p_entry_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.tournament_set_entry_style(
	uuid, text, jsonb, text, text, text, text
) from public;
grant execute on function public.tournament_set_entry_style(
	uuid, text, jsonb, text, text, text, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Realtime: a banner edit shows up live on the public view and the TV
-- projector. Public-select, so signed-out spectators get the stream too.
-- ---------------------------------------------------------------------------

do $$
begin
	if not exists (
		select 1 from pg_publication_tables
		where pubname = 'supabase_realtime'
			and schemaname = 'public'
			and tablename = 'tournament_entry_styles'
	) then
		alter publication supabase_realtime add table public.tournament_entry_styles;
	end if;
end
$$;
