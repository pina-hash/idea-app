-- 0218_classroom_create_item_unit.sql
--
-- A UNIT AT CREATION TIME.
--
-- Filing an item into a unit has worked since 0111 -- a row menu, a bulk move
-- and a drag onto a group header, all three through `classroom_set_item_unit`
-- -- but only AFTER the item exists. Creation had no channel for it at any
-- layer, so every assignment landed unfiled and somebody had to go and file it
-- as a second deliberate act. Mr. Pina reported it twice, on 2026-09-10 and
-- again on 2026-09-12 ("I still have no way of organizing assignments into a
-- unit folder upon creating it").
--
-- WHAT THIS FILE DOES: one parameter, `p_unit_id`, on
-- `classroom_create_item`. Everything else about that function is reproduced
-- from 0176 unchanged, statement for statement.
--
-- THE SIGNATURE TRAP, AND WHY THE DROP IS SAFE HERE.
-- `create or replace` keys on the parameter list, so merely adding one would
-- leave 0176's twelve-argument form standing as a SECOND OVERLOAD -- and two
-- overloads differing only by a defaulted trailing parameter make PostgREST
-- unable to resolve the call AT ALL, which would break every item creation
-- rather than quietly ignoring the unit. So the old arity is dropped at its
-- exact argument types first.
--
-- THAT DROP COSTS NO DEPLOY ORDERING, which is the reason it is available
-- here and is not available every time. PostgREST resolves a call by the set
-- of NAMED KEYS it was sent, not by position: the deployed client sends eleven
-- keys and no `p_unit_id`, and the wide form accepts exactly that call because
-- the new parameter is defaulted. So the running client keeps working the
-- moment this is applied, the new client works too, and the migration and the
-- deploy are independent events in either order. Nothing but a positional
-- twelve-argument call could tell the difference, and no client makes one.
--
-- A WRONG UNIT IS REFUSED, NEVER SILENTLY DROPPED, AND THE RULE IS 0111'S OWN.
-- `classroom_set_item_unit` refuses a unit whose course no section of the item
-- shares, and calls that `wrong_course`. The same rule is applied here to the
-- sections the item is ABOUT to be posted to, which is the same set of facts
-- one moment earlier. What differs is the SHAPE of the refusal, deliberately:
-- 0111 answers a structured `{ok:false, reason:'wrong_course'}` because the
-- item already exists and stays exactly where it was, so there is a consistent
-- world to report back about. Here there is no item, and this function's
-- return value is what carries the new item's id -- so a second return shape
-- would be indistinguishable to its caller from a failure to create. Every
-- other user-correctable refusal on this function is already a raise whose
-- sentence the composer displays verbatim (`You must be signed in.`, the
-- field checks, the publish-target check), so the unit refusal is one too.
-- Inventing a structured return on a create function would be the second
-- behaviour, not the raise.
--
-- AND A MULTI-COURSE POST IS AN `exists`, NOT AN `all`, because that is what
-- 0111 already decided. An item posted to two courses at once is filed into a
-- unit of one of them; it groups under that unit for that course and reads as
-- unfiled for the other, which `classGroups` already handles by treating a
-- unit id the reader cannot see as unfiled. One value, on the canonical
-- record, never one per posting.
--
-- GRANTS FOLLOW 0166's SHAPE AND NAME THE ROLES. A hosted Supabase project
-- bootstraps default privileges that write a DIRECT `anon` grant into every
-- new function at creation time, and the new arity IS a create -- so
-- `revoke ... from public` alone would leave it anon-executable. The roles are
-- named. `service_role` is left exactly as the project's defaults leave it,
-- matching 0176, which this file re-signs rather than re-authorizes.

begin;

-- ---------------------------------------------------------------------------
-- 1. The old arity goes, at its exact twelve argument types.
-- ---------------------------------------------------------------------------

drop function if exists public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb,
	timestamptz);

-- ---------------------------------------------------------------------------
-- 2. The same function, plus p_unit_id.
-- ---------------------------------------------------------------------------

create or replace function public.classroom_create_item(
	p_kind text,
	p_section_ids uuid[],
	p_title text default null,
	p_body text default '',
	p_points integer default null,
	p_due_at timestamptz default null,
	p_category text default null,
	p_published boolean default true,
	p_resources jsonb default '[]'::jsonb,
	p_pinned boolean default false,
	p_body_doc jsonb default null,
	p_publish_at timestamptz default null,
	p_unit_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
	v_uid uuid := (select auth.uid());
	v_kind text := lower(btrim(coalesce(p_kind, '')));
	v_sections uuid[];
	v_section uuid;
	v_title text := nullif(btrim(coalesce(p_title, '')), '');
	v_category text := nullif(btrim(coalesce(p_category, '')), '');
	v_published boolean := coalesce(p_published, true);
	v_doc jsonb;
	v_body text;
	v_id uuid;
	v_unit_course uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	-- 0176: an item body may hold a picture. The refusal text is unchanged,
	-- because it is what a client already displays and what a student already
	-- reads; naming the image case here would mean a second sentence for the
	-- same outcome, and the browser-side normalizer already says which image
	-- and why before a request is ever made.
	if not public._classroom_doc_ok(p_body_doc, true) then
		raise exception 'That body could not be read.';
	end if;

	if p_body_doc is null or p_body_doc = 'null'::jsonb then
		v_body := coalesce(p_body, '');
		v_doc := public._classroom_doc_from_text(v_body);
	else
		v_doc := p_body_doc;
		v_body := public._classroom_doc_text(v_doc);
	end if;

	perform public._classroom_check_item_fields(
		v_kind, v_title, v_body, p_points, p_due_at, v_category);

	v_sections := public._classroom_check_publish_targets(p_section_ids);

	-- 0218. A NULL unit is the whole of the pre-0218 behaviour and skips this
	-- block entirely, which is what makes every call the deployed client makes
	-- answer exactly as it did -- refusal text and refusal ORDER included.
	if p_unit_id is not null then
		select course_id into v_unit_course
		  from public.classroom_units
		 where id = p_unit_id;
		if v_unit_course is null then
			raise exception 'That unit does not exist.';
		end if;
		-- 0111's `wrong_course` rule, asked of the sections this item is about
		-- to be posted to. An `exists` rather than an `all`: a unit belongs to
		-- one course, and an item posted across two courses is legitimately
		-- filed in a unit of one of them.
		if not exists (
			select 1
			  from public.classroom_sections s
			 where s.id = any(v_sections) and s.course_id = v_unit_course
		) then
			raise exception 'That unit belongs to a different course from the classes you are posting to. Pick a unit from one of those classes, or post it without a unit.';
		end if;
	end if;

	insert into public.classroom_items
		(kind, title, body, body_doc, points, due_at, category, author_email, author_name,
			published, pinned, publish_at, first_published_at, unit_id)
	values (v_kind, v_title, v_body, v_doc, p_points, p_due_at, v_category,
		public.current_user_email(), public._classroom_author_name(),
		v_published, coalesce(p_pinned, false), p_publish_at,
		case when v_published then now() end, p_unit_id)
	returning id into v_id;

	foreach v_section in array v_sections loop
		insert into public.classroom_postings (item_id, section_id)
		values (v_id, v_section);
	end loop;

	perform public._classroom_write_resources(v_id, p_resources);

	return jsonb_build_object(
		'item_id', v_id,
		'section_ids', to_jsonb(v_sections),
		'published', v_published,
		'live', public._classroom_item_live(v_published, p_publish_at),
		'unit_id', p_unit_id
	);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Grants, naming the roles.
-- ---------------------------------------------------------------------------

revoke all on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb,
	timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.classroom_create_item(
	text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb,
	timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-check, over the objects THIS FILE writes and nothing else.
-- ---------------------------------------------------------------------------

do $chk$
declare
	v_arities integer;
	v_wide_sig text := 'public.classroom_create_item(text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb, timestamptz, uuid)';
	v_items integer;
	v_filed integer;
begin
	select count(*) into v_arities
	  from pg_proc p
	  join pg_namespace n on n.oid = p.pronamespace
	 where n.nspname = 'public' and p.proname = 'classroom_create_item';
	if v_arities <> 1 then
		raise exception '0218: classroom_create_item has % arities, expected exactly 1. Two overloads differing only by a defaulted trailing parameter make PostgREST unable to resolve the call at all.', v_arities;
	end if;

	if has_function_privilege('anon', v_wide_sig, 'execute') then
		raise exception '0218: classroom_create_item is still executable by anon -- the revoke did not name the roles it needed to.';
	end if;
	if not has_function_privilege('authenticated', v_wide_sig, 'execute') then
		raise exception '0218: classroom_create_item is not executable by authenticated -- the grant did not land.';
	end if;

	select count(*) into v_items from public.classroom_items;
	select count(*) into v_filed from public.classroom_items where unit_id is not null;
	raise notice '0218: classroom_create_item now takes p_unit_id. % existing items, % of them already filed into a unit. Nothing was rewritten.', v_items, v_filed;
end;
$chk$;

commit;

-- ---------------------------------------------------------------------------
-- VERIFICATION. Paste this into the Supabase SQL editor AFTER the file above.
-- It returns ROWS, one per thing examined, and the editor renders the last
-- statement's result set -- a probe reporting through `raise notice` would look
-- exactly like one that never ran.
-- ---------------------------------------------------------------------------
--
-- select 'arity: exactly one classroom_create_item' as checked,
--        (select count(*) = 1 from pg_proc p
--           join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_create_item') as ok
-- union all select 'signature: the surviving one takes 13 arguments',
--        (select p.pronargs = 13 from pg_proc p
--           join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_create_item')
-- union all select 'signature: its last argument is named p_unit_id',
--        (select p.proargnames[13] = 'p_unit_id' from pg_proc p
--           join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_create_item')
-- union all select 'signature: p_unit_id is DEFAULTED, so a client that never heard of it still resolves',
--        (select p.pronargdefaults >= 11 from pg_proc p
--           join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_create_item')
-- union all select 'body: it writes unit_id on the canonical record',
--        (select position('unit_id' in p.prosrc) > 0 from pg_proc p
--           join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_create_item')
-- union all select 'grant: anon CANNOT execute it',
--        not has_function_privilege('anon',
--          'public.classroom_create_item(text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb, timestamptz, uuid)', 'execute')
-- union all select 'grant: authenticated CAN execute it',
--        has_function_privilege('authenticated',
--          'public.classroom_create_item(text, uuid[], text, text, integer, timestamptz, text, boolean, jsonb, boolean, jsonb, timestamptz, uuid)', 'execute')
-- union all select 'untouched: classroom_set_item_unit is still the post-creation path, one arity',
--        (select count(*) = 1 from pg_proc p
--           join pg_namespace n on n.oid = p.pronamespace
--          where n.nspname = 'public' and p.proname = 'classroom_set_item_unit')
-- union all select 'POSITIVE CONTROL -- app_short_link_target IS anon-executable, so a grant is visible to this query at all',
--        has_function_privilege('anon', 'public.app_short_link_target(text)', 'execute');
-- ---------------------------------------------------------------------------
