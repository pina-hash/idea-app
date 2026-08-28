-- 0141_foundry_app_cap_and_download.sql
-- IDEA FOUNDRY: the five-app cap is removed.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE CHANGES, AND WHAT IT DELIBERATELY DOES NOT.
--
-- It replaces `foundry_create_app` with the same function minus the capacity
-- check. Nothing else about it moves: the signature, the normalizer, the slug
-- rule, the name gate, the required build notes, the returned jsonb and the
-- grants are all 0130's, verbatim. A reader diffing this against 0130 should
-- find the count, the raise, and nothing else.
--
-- WHY THE CAP GOES. Five was a guess about how many apps a student would
-- publish in a year, made before anybody had published one. It is not a
-- resource limit -- the real ceilings are per VERSION and are enforced where
-- the bytes are (50 MB zip, 75 MB unpacked, 1500 files), so a sixth app costs
-- one row and nothing else -- and it is not a moderation limit either, because
-- every app still passes through the same review queue before anything of it
-- is published. What it actually did was refuse a student a slot at the point
-- where they had already built the thing, with a message telling them to go
-- and ask an instructor for permission to have made it.
--
-- THE DOWNLOAD FEATURE THIS FILE IS NAMED FOR NEEDS NO SQL AT ALL, which is
-- worth stating because the filename promises it. A student downloading their
-- own bundle reads `student_app_files` and `foundry-bundles` through the
-- service-role client, behind `previewViewerMayRun` -- the SAME gate the
-- preview mount already uses, in the same module, with no second rule and no
-- new function. There is no migration to write for it, and inventing one would
-- have meant a second statement of who may see a build.
--
-- ---------------------------------------------------------------------------
-- THE CAPACITY LOCK STAYS, AND ITS COMMENT IS THE PART THAT CHANGES.
--
-- `perform 1 from public.profiles p where p.id = v_uid for update` was written
-- for the count: there is no child row to lock for a caller who does not hold
-- one yet, so the PERSON is the parent, and locking them is what stopped two
-- concurrent creates both counting four and both inserting. With nothing being
-- counted that job is gone, and the honest question is whether the statement
-- has another one.
--
-- IT DOES, AND IT IS NARROWER THAN IT LOOKS. The function still contains a
-- read-then-write: the `exists` check on the slug, then the insert. The lock
-- serializes that pair FOR ONE PERSON -- two tabs, one form, one address --
-- so the second caller waits, then genuinely sees the first's committed row,
-- and gets the considered refusal ("The address ... is already taken") that
-- this file's own vocabulary produces. Without it both callers pass the
-- `exists` check and the loser is answered by the unique index instead, with
-- `duplicate key value violates unique constraint "student_apps_slug_key"` --
-- a storage-vendor sentence naming a table, in front of a student, which is
-- exactly what this repo's copy rules exist to prevent.
--
-- WHAT IT IS NOT, STATED PLAINLY BECAUSE THIS IS THE MISREADING THAT WOULD
-- COST SOMETHING: **it is not how slug uniqueness is guaranteed, and it never
-- was.** The lock is on the CALLER'S OWN profile row, so two DIFFERENT people
-- racing for one address are not serialized by it at all and never have been.
-- What guarantees uniqueness is `slug text not null unique` on the column
-- (0130, section 2) -- a real unique index, which is the serialization point
-- for every caller regardless of who they are. Removing this lock would not
-- weaken that constraint by one bit; keeping it does not strengthen it by one
-- bit either. All it buys is a better sentence in the one case it covers.
--
-- The alternative that would cover BOTH cases is an exception handler around
-- the insert, re-raising the considered refusal on `unique_violation`. That is
-- a real improvement and it is deliberately NOT in this file: it changes the
-- function's error semantics for every caller, which is a decision that wants
-- its own migration and its own answer for a client already reading the
-- current messages. This file removes a check; it does not rewrite refusals.
--
-- ---------------------------------------------------------------------------
-- THE GRANTS ARE RESTATED, NAMING EVERY ROLE.
--
-- A hosted Supabase project carries `alter default privileges ... grant execute
-- on functions to anon, authenticated, service_role`, so `revoke ... from
-- public` alone is not a narrowing there (see 0137's header). This file's
-- revoke names all four so its end state is the same under either privilege
-- configuration -- which is also why it does not matter whether a
-- `create or replace` over an existing function inherits that function's ACL
-- or takes a fresh set of defaults: the two statements below decide it either
-- way. The end state is 0137's for this function: `authenticated` only.
--
-- ---------------------------------------------------------------------------
-- WHAT UNDOES THIS MIGRATION: re-apply 0130's own definition of
-- `foundry_create_app`, which restores the count and the raise. Nothing here
-- creates, drops or alters a table, a column, a policy, an index or a trigger,
-- so there is nothing else to reverse. Note that re-applying the cap over a
-- database where somebody has since created a sixth app does NOT delete
-- anything -- the check runs on CREATE only, so the existing apps stay and
-- their owner simply cannot make another until they are under five.
--
-- Apply manually in the Supabase SQL editor, after 0140.
-- ---------------------------------------------------------------------------

-- 0130's function, minus the count and the raise. Re-appliable: `create or
-- replace` over the same signature, so this file may be pasted twice.
create or replace function public.foundry_create_app(
	p_slug text,
	p_title text,
	p_build_notes text,
	p_tagline text default null,
	p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_slug text := lower(public._foundry_norm(p_slug));
	v_title text := public._foundry_norm(p_title);
	v_notes text := public._foundry_norm(p_build_notes);
	v_tagline text := nullif(public._foundry_norm(p_tagline), '');
	v_desc text := nullif(public._foundry_norm(p_description), '');
	v_id uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not public._foundry_slug_ok(v_slug) then
		raise exception 'An address is 2 to 64 characters of lowercase letters, digits and single hyphens, starting and ending with a letter or digit.';
	end if;
	if v_title = '' then
		raise exception 'Your app needs a name.';
	end if;
	if v_notes = '' then
		raise exception 'Say how you built it and which tools you used. That part is required.';
	end if;

	-- SERIALIZES ONE PERSON'S CONCURRENT CREATES, AND NOTHING WIDER. It used to
	-- be the capacity lock; the count it guarded is gone. What is left below it
	-- is still a read-then-write -- the slug `exists`, then the insert -- and
	-- this is what makes the second of one person's two tabs read the first's
	-- committed row and answer with the sentence below rather than with a
	-- unique-constraint error naming the table.
	--
	-- IT IS NOT WHAT MAKES A SLUG UNIQUE. That is the unique index on the
	-- column, which serializes every caller; this locks the CALLER'S OWN
	-- profile row and does nothing at all about two different people racing for
	-- one address. See this file's header.
	perform 1 from public.profiles p where p.id = v_uid for update;

	if exists (select 1 from public.student_apps a where a.slug = v_slug) then
		raise exception 'The address "%" is already taken.', v_slug;
	end if;

	insert into public.student_apps (owner, slug, title, tagline, description, build_notes)
	values (v_uid, v_slug, v_title, v_tagline, v_desc, v_notes)
	returning id into v_id;

	return jsonb_build_object('ok', true, 'app_id', v_id, 'slug', v_slug);
end;
$$;

-- Names every role, so the end state does not depend on which default
-- privileges this database carries. 0137's partition for this function is
-- `authenticated` only: creating an app is a signed-in act.
revoke all on function public.foundry_create_app(text, text, text, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.foundry_create_app(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK. Reports what actually landed rather than asserting that the file
-- ran: the ACL is read back from the catalog, and the cap's absence is read
-- back from the function's own source rather than from the fact that this
-- script reached the end.
-- ---------------------------------------------------------------------------
do $$
declare
	v_src text;
	v_anon boolean;
	v_auth boolean;
	v_arity integer;
begin
	select count(*) into v_arity
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'foundry_create_app';

	if v_arity <> 1 then
		raise exception 'foundry_create_app has % overloads; expected exactly 1.', v_arity;
	end if;

	select p.prosrc into v_src
	from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'foundry_create_app';

	if v_src like '%which is the limit%' then
		raise exception 'The five-app cap is still in foundry_create_app.';
	end if;
	if v_src not like '%for update%' then
		raise exception 'The per-person lock is missing from foundry_create_app.';
	end if;
	if v_src not like '%is already taken%' then
		raise exception 'The slug refusal is missing from foundry_create_app.';
	end if;

	v_anon := has_function_privilege(
		'anon', 'public.foundry_create_app(text, text, text, text, text)', 'execute');
	v_auth := has_function_privilege(
		'authenticated', 'public.foundry_create_app(text, text, text, text, text)', 'execute');

	if v_anon then
		raise exception 'foundry_create_app is executable by anon.';
	end if;
	if not v_auth then
		raise exception 'foundry_create_app is not executable by authenticated.';
	end if;

	raise notice '0141: foundry_create_app replaced. cap removed, lock kept, anon=% authenticated=%',
		v_anon, v_auth;
end;
$$;
