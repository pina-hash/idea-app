-- 0009_gauntlet_authoring.sql
-- IDEA // GAUNTLET: the teacher-facing web authoring tool. Replaces hand-edited
-- SQL seeds with create / edit / publish / delete through SECURITY DEFINER RPCs.
--
--   1. A `status` column (draft | published | archived). `published` is kept as a
--      TRIGGER-DERIVED boolean (`published = status = 'published'`) so every
--      existing RLS policy, the leaderboard view, the play RPCs, and the
--      published-filtered list queries keep working UNCHANGED. New challenges
--      default to draft; students only ever see published (drafts and archived
--      have published=false). Archived is the soft-delete state.
--   2. Direct client INSERT/UPDATE/DELETE on challenges is revoked: all writes go
--      through the authoring RPCs below, which re-check the teacher role and
--      validate required fields per mode before a challenge can publish.
--   3. A public Storage bucket `gauntlet` for uploaded drawings/references
--      (teachers upload; everyone reads via the public URL). Gated drawings
--      (Speedrun, Feature Golf) still live in the hidden `answer` column, so only
--      the reveal RPC hands back their (unguessable, random-path) URL.
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- 1. Status column + derived `published`
-- ---------------------------------------------------------------------------
alter table public.challenges
	add column if not exists status text not null default 'draft'
	check (status in ('draft', 'published', 'archived'));

-- Backfill from the existing boolean (seeds were published).
update public.challenges
	set status = case when published then 'published' else 'draft' end;

-- Keep `published` in lock-step with `status` so all existing published-based
-- gating (RLS, view, play RPCs, list queries) continues to work untouched.
create or replace function public.gauntlet_sync_published()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.published := (new.status = 'published');
	return new;
end;
$$;

drop trigger if exists challenges_sync_published on public.challenges;
create trigger challenges_sync_published
	before insert or update on public.challenges
	for each row execute function public.gauntlet_sync_published();

-- Clients may read `status`; the answer column stays withheld.
grant select (status) on public.challenges to authenticated;

-- All writes go through the authoring RPCs (security definer). Block direct DML.
revoke insert, update, delete on public.challenges from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Validation helpers
-- ---------------------------------------------------------------------------
-- Safe numeric extraction from a JSONB payload (null on missing/non-numeric).
create or replace function public.gauntlet_jnum(p jsonb, k text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
	return (p ->> k)::numeric;
exception when others then
	return null;
end;
$$;

-- Returns an error message if (mode, prompt, answer) is not complete enough to
-- PUBLISH, else null. Drafts skip this so work-in-progress can be saved.
create or replace function public.gauntlet_publish_blocker(
	p_mode public.gauntlet_mode,
	p_prompt jsonb,
	p_answer jsonb
)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
	if p_mode in ('speedrun', 'reverse_engineer', 'feature_golf') then
		if coalesce(public.gauntlet_jnum(p_answer, 'target_volume_mm3'), 0) <= 0 then
			return 'Canonical volume (mm3) is required to publish.';
		end if;
		if public.gauntlet_jnum(p_answer, 'tolerance_pct') is null then
			return 'A tolerance band is required to publish.';
		end if;
		if coalesce(public.gauntlet_jnum(p_answer, 'target_mass'), 0) <= 0 then
			return 'Target mass is required to publish.';
		end if;
		if coalesce(public.gauntlet_jnum(p_answer, 'density'), 0) <= 0 then
			return 'Density is required to publish.';
		end if;
		if coalesce(btrim(p_prompt ->> 'material'), '') = '' then
			return 'Material is required to publish.';
		end if;
		if p_mode in ('speedrun', 'feature_golf')
			and coalesce(btrim(p_answer ->> 'drawing'), '') = '' then
			return 'A drawing is required; it is hidden and revealed on Start.';
		end if;
		if p_mode = 'reverse_engineer' then
			if coalesce(public.gauntlet_jnum(p_answer, 'target_surface_area_mm2'), 0) <= 0 then
				return 'Surface area (mm2) is required for Reverse Engineer.';
			end if;
			if coalesce(btrim(p_prompt ->> 'reference'), '') = '' then
				return 'A reference (drawing or image) is required for Reverse Engineer.';
			end if;
		end if;
	else
		-- knowledge modes
		if coalesce(btrim(p_prompt ->> 'question'), '') = '' then
			return 'A question is required to publish.';
		end if;
		if coalesce(btrim(p_answer ->> 'correct'), '') = '' then
			return 'A correct answer is required to publish.';
		end if;
		if p_prompt ? 'options' then
			if coalesce(jsonb_array_length(p_prompt -> 'options'), 0) < 2 then
				return 'Provide at least two answer options.';
			end if;
			if not exists (
				select 1 from jsonb_array_elements(p_prompt -> 'options') o
				where o ->> 'id' = p_answer ->> 'correct'
			) then
				return 'The correct answer must match one of the option ids.';
			end if;
		end if;
		if (p_answer ->> 'type') = 'numeric'
			and public.gauntlet_jnum(p_answer, 'correct') is null then
			return 'The correct numeric answer must be a number.';
		end if;
	end if;
	return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Authoring RPCs (security definer, teacher-gated). The only write path.
-- ---------------------------------------------------------------------------
-- Full challenge (including the hidden answer) for the edit form.
create or replace function public.gauntlet_author_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v jsonb;
begin
	if not public.is_teacher() then
		raise exception 'Only teachers can view challenge details.';
	end if;
	select jsonb_build_object(
		'id', id, 'mode', mode, 'title', title, 'difficulty', difficulty,
		'status', status, 'prompt', prompt, 'answer', answer
	) into v
	from public.challenges where id = p_id;
	if v is null then
		raise exception 'Challenge not found.';
	end if;
	return v;
end;
$$;

-- Create (p_id null) or edit a challenge. Publishing validates per mode.
create or replace function public.gauntlet_author_upsert(
	p_id uuid,
	p_mode public.gauntlet_mode,
	p_title text,
	p_difficulty smallint,
	p_status text,
	p_prompt jsonb,
	p_answer jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id uuid;
	v_block text;
begin
	if not public.is_teacher() then
		raise exception 'Only teachers can author challenges.';
	end if;
	if coalesce(btrim(p_title), '') = '' then
		raise exception 'A title is required.';
	end if;
	if p_difficulty is null or p_difficulty < 1 or p_difficulty > 5 then
		raise exception 'Difficulty must be 1 to 5.';
	end if;
	if p_status not in ('draft', 'published', 'archived') then
		raise exception 'Invalid status.';
	end if;
	if p_status = 'published' then
		v_block := public.gauntlet_publish_blocker(
			p_mode, coalesce(p_prompt, '{}'::jsonb), coalesce(p_answer, '{}'::jsonb));
		if v_block is not null then
			raise exception '%', v_block;
		end if;
	end if;

	if p_id is null then
		insert into public.challenges (mode, title, difficulty, prompt, answer, status, author_id)
		values (p_mode, btrim(p_title), p_difficulty,
			coalesce(p_prompt, '{}'::jsonb), coalesce(p_answer, '{}'::jsonb),
			p_status, (select auth.uid()))
		returning id into v_id;
	else
		update public.challenges
			set mode = p_mode, title = btrim(p_title), difficulty = p_difficulty,
				prompt = coalesce(p_prompt, '{}'::jsonb), answer = coalesce(p_answer, '{}'::jsonb),
				status = p_status
			where id = p_id
			returning id into v_id;
		if v_id is null then
			raise exception 'Challenge not found.';
		end if;
	end if;
	return v_id;
end;
$$;

-- Publish / unpublish / archive. Publishing re-validates completeness.
create or replace function public.gauntlet_author_set_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_ch public.challenges%rowtype;
	v_block text;
begin
	if not public.is_teacher() then
		raise exception 'Only teachers can change a challenge status.';
	end if;
	if p_status not in ('draft', 'published', 'archived') then
		raise exception 'Invalid status.';
	end if;
	select * into v_ch from public.challenges where id = p_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;
	if p_status = 'published' then
		v_block := public.gauntlet_publish_blocker(
			v_ch.mode, coalesce(v_ch.prompt, '{}'::jsonb), coalesce(v_ch.answer, '{}'::jsonb));
		if v_block is not null then
			raise exception '%', v_block;
		end if;
	end if;
	update public.challenges set status = p_status where id = p_id;
end;
$$;

-- Delete: hard-delete only when there is no board history; otherwise soft-delete
-- (archive) so existing submissions are never orphaned. Returns which happened.
create or replace function public.gauntlet_author_delete(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
	if not public.is_teacher() then
		raise exception 'Only teachers can delete challenges.';
	end if;
	if not exists (select 1 from public.challenges where id = p_id) then
		raise exception 'Challenge not found.';
	end if;
	if exists (select 1 from public.submissions where challenge_id = p_id) then
		update public.challenges set status = 'archived' where id = p_id;
		return 'archived';
	end if;
	delete from public.challenges where id = p_id;
	return 'deleted';
end;
$$;

revoke all on function public.gauntlet_author_get(uuid) from public;
revoke all on function public.gauntlet_author_upsert(uuid, public.gauntlet_mode, text, smallint, text, jsonb, jsonb) from public;
revoke all on function public.gauntlet_author_set_status(uuid, text) from public;
revoke all on function public.gauntlet_author_delete(uuid) from public;
grant execute on function public.gauntlet_author_get(uuid) to authenticated;
grant execute on function public.gauntlet_author_upsert(uuid, public.gauntlet_mode, text, smallint, text, jsonb, jsonb) to authenticated;
grant execute on function public.gauntlet_author_set_status(uuid, text) to authenticated;
grant execute on function public.gauntlet_author_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage: public bucket for uploaded drawings / reference images.
-- Teachers upload; everyone reads via the public URL. Gated drawings still live
-- in the hidden `answer` column (random path, unguessable, revealed on Start).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('gauntlet', 'gauntlet', true)
on conflict (id) do nothing;

drop policy if exists "teachers upload gauntlet assets" on storage.objects;
create policy "teachers upload gauntlet assets"
	on storage.objects
	for insert
	to authenticated
	with check (bucket_id = 'gauntlet' and public.is_teacher());

drop policy if exists "teachers update gauntlet assets" on storage.objects;
create policy "teachers update gauntlet assets"
	on storage.objects
	for update
	to authenticated
	using (bucket_id = 'gauntlet' and public.is_teacher())
	with check (bucket_id = 'gauntlet' and public.is_teacher());
