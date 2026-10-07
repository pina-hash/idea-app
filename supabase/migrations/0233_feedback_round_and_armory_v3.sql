-- ===== PART feedback-edits BEGIN =====
-- ===========================================================================
-- PART 30. FEEDBACK EDITS (report d362bfb3, Mr. Pina, 2026-10-07; decision D2
-- of the round: site admins only; kind, message and what-you-tried; every edit
-- a numbered revision; the reporter's original stays and is one tap away).
--
-- WHAT THIS DOES NOT DO IS THE POINT OF IT. 0053 made app_feedback an
-- append-only log on purpose ("a truer record than a silently edited one"),
-- and CLAUDE.md lists it among the tables where editing INSERTS a superseding
-- row. So the reporter's own columns (kind, message, tried, meta) are never
-- updated by anything here. A correction is a ROW in app_feedback_edits keyed
-- (feedback_id, revision); the latest one is projected beside the original by
-- the console read, and the console, the exports and the round digest read the
-- latest through one reader each (rowMessage, rowKind and rowTried in
-- src/lib/feedback/console.ts).
--
-- THE CHECKS USE THE REGEX OPERATOR AND NO FUNCTION, so the CHECK-runs-as-the-
-- writing-role trap (0131) cannot open: there is no predicate to grant.
--
-- WHAT UNDOES IT, by hand in the SQL editor: drop the function
-- public.app_feedback_edit(uuid, text, text, text, integer) and the table
-- public.app_feedback_edits, then re-paste 0230's definition of the wide
-- app_feedback_admin_list(text, integer, text) to put the list back without
-- the edit key. No existing row is changed by this part.
-- ===========================================================================

create table if not exists public.app_feedback_edits (
	feedback_id uuid not null references public.app_feedback (id) on delete cascade,
	revision integer not null,
	kind text not null,
	message text not null,
	tried text,
	edited_by text not null,
	edited_at timestamptz not null default now(),
	constraint app_feedback_edits_pkey primary key (feedback_id, revision),
	constraint app_feedback_edits_revision_positive check (revision >= 1),
	constraint app_feedback_edits_kind check (kind in ('bug', 'idea', 'praise', 'other')),
	-- A blank of newlines and tabs is empty to the admin who typed it, which is
	-- why this is the regex and not a btrim length (CLAUDE.md, SQL traps).
	constraint app_feedback_edits_message_shape check (message ~ '\S' and char_length(message) <= 2000),
	constraint app_feedback_edits_tried_shape check (tried is null or (tried ~ '\S' and char_length(tried) <= 1000)),
	constraint app_feedback_edits_editor check (edited_by <> '')
);

-- NO POLICY AND NO CLIENT GRANT. Nothing reads this table but the definer
-- console read below and nothing writes it but app_feedback_edit, so either
-- missing piece denies on its own.
alter table public.app_feedback_edits enable row level security;
revoke all on table public.app_feedback_edits from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The one writer. Structured refusals for what an admin can fix in the form;
-- raises for misuse (no session, not an admin, no such report).
-- ---------------------------------------------------------------------------
create or replace function public.app_feedback_edit(
	p_id uuid,
	p_kind text,
	p_message text,
	p_tried text,
	p_base_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fe$
declare
	v_kind text := lower(public._app_feedback_trim(p_kind));
	v_message text := public._app_feedback_trim(p_message);
	v_tried text := nullif(public._app_feedback_trim(p_tried), '');
	v_row public.app_feedback%rowtype;
	v_rev integer;
	v_cur_kind text;
	v_cur_message text;
	v_cur_tried text;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can edit feedback.';
	end if;

	-- THE ROW LOCK SERIALIZES TWO ADMINS EDITING ONE REPORT, so the revision
	-- read below is the one the insert follows. The primary key is the backstop.
	select * into v_row from public.app_feedback f where f.id = p_id for update;
	if not found then
		raise exception 'That feedback does not exist.';
	end if;

	if v_kind not in ('bug', 'idea', 'praise', 'other') then
		return jsonb_build_object('ok', false, 'reason', 'kind');
	end if;
	if v_message = '' then
		return jsonb_build_object('ok', false, 'reason', 'empty');
	end if;
	if char_length(v_message) > public._app_feedback_message_max() then
		return jsonb_build_object('ok', false, 'reason', 'too_long', 'max', public._app_feedback_message_max());
	end if;
	if v_tried is not null and char_length(v_tried) > public._app_feedback_tried_max() then
		return jsonb_build_object('ok', false, 'reason', 'tried_too_long', 'max', public._app_feedback_tried_max());
	end if;

	-- WHAT THE REPORT SAYS NOW: the latest revision, else the reporter's own
	-- words at revision 0, read the way the console reads them (the column,
	-- then the meta blob a pre-0170 path left the answer in).
	select e.revision, e.kind, e.message, e.tried
	into v_rev, v_cur_kind, v_cur_message, v_cur_tried
	from public.app_feedback_edits e
	where e.feedback_id = p_id
	order by e.revision desc
	limit 1;
	if not found then
		v_rev := 0;
		v_cur_kind := v_row.kind;
		v_cur_message := public._app_feedback_trim(v_row.message);
		v_cur_tried := coalesce(
			nullif(public._app_feedback_trim(v_row.tried), ''),
			nullif(public._app_feedback_trim(v_row.meta ->> 'tried'), '')
		);
	end if;

	-- A SAVE THAT CHANGES NOTHING STAMPS NOTHING, whatever revision the form
	-- was opened on. Asked BEFORE the staleness test on purpose: a retry of a
	-- save whose answer was lost on the way back finds its own words already
	-- there and is told so, rather than being told somebody else got in first.
	if v_kind is not distinct from v_cur_kind
		and v_message is not distinct from v_cur_message
		and v_tried is not distinct from v_cur_tried then
		return jsonb_build_object('ok', true, 'changed', false, 'id', p_id, 'revision', v_rev);
	end if;

	-- SOMEBODY ELSE SAVED FIRST. The form was opened on an older revision, so
	-- writing over it would discard their correction without anyone seeing it.
	if p_base_revision is distinct from v_rev then
		return jsonb_build_object('ok', false, 'reason', 'stale', 'revision', v_rev);
	end if;

	insert into public.app_feedback_edits (feedback_id, revision, kind, message, tried, edited_by)
	values (p_id, v_rev + 1, v_kind, v_message, v_tried, public.current_user_email());

	return jsonb_build_object('ok', true, 'changed', true, 'id', p_id, 'revision', v_rev + 1);
end;
$fe$;

revoke all on function public.app_feedback_edit(uuid, text, text, text, integer)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_edit(uuid, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The console read, the WIDE form, replaced at its own signature (same three
-- parameter names, still NO defaults, still jsonb), so the narrow two-argument
-- wrapper 0230 left standing delegates to it unchanged and inherits the key.
-- Its body is 0230's verbatim plus the lateral read of the latest revision.
-- EVERY ROW CARRIES `edit`, null when never edited: the key's presence is the
-- client's proof that this part is applied, which is what licenses the Edit
-- control. message, kind and tried stay the reporter's own.
-- ---------------------------------------------------------------------------
create or replace function public.app_feedback_admin_list(p_app text, p_limit integer, p_horizon text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fe$
declare
	v_app text := nullif(btrim(coalesce(p_app, '')), '');
	v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
	v_h text := nullif(lower(btrim(coalesce(p_horizon, ''))), '');
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can read the feedback queue.';
	end if;
	if v_h is not null and v_h not in ('now', 'long_term') then
		raise exception 'Horizon must be now or long_term.';
	end if;

	return coalesce((
		select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
		from (
			select f.id, f.app, f.context, f.kind, f.message, f.meta,
				f.status, f.created_at, f.reviewed_at, f.reviewed_by,
				-- Stated, not inferred (0127).
				(f.user_id is null) as anonymous,
				-- What somebody typed, never a verified identity (0127).
				f.contact,
				-- 0170: what they tried, and the key of the one screenshot.
				f.tried,
				f.screenshot_path,
				-- 0230: fold in soon, or a big idea for later.
				f.horizon,
				case when f.user_id is null then null else
					coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''),
						split_part(coalesce(p.email, ''), '@', 1))
				end as submitter_name,
				case when f.user_id is null then null else p.email end as submitter_email,
				-- 0233: an admin's correction, the latest revision, or null.
				case when le.revision is null then null else
					jsonb_build_object(
						'revision', le.revision,
						'kind', le.kind,
						'message', le.message,
						'tried', le.tried,
						'edited_by', le.edited_by,
						'edited_at', le.edited_at
					)
				end as edit
			from public.app_feedback f
			left join public.profiles p on p.id = f.user_id
			left join lateral (
				select e.revision, e.kind, e.message, e.tried, e.edited_by, e.edited_at
				from public.app_feedback_edits e
				where e.feedback_id = f.id
				order by e.revision desc
				limit 1
			) le on true
			where (v_app is null or f.app = v_app)
				and (v_h is null or f.horizon = v_h)
			order by f.created_at desc
			limit v_limit
		) t
	), '[]'::jsonb);
end;
$fe$;

revoke all on function public.app_feedback_admin_list(text, integer, text)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_admin_list(text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The part's own self-check, BY NAME over its own objects and nothing else.
-- ---------------------------------------------------------------------------
do $fe$
declare
	v_rls boolean;
	v_policies integer;
	v_overloads integer;
	v_priv text;
	v_role text;
	v_src text;
begin
	select c.relrowsecurity into v_rls
	from pg_catalog.pg_class c
	join pg_catalog.pg_namespace n on n.oid = c.relnamespace
	where n.nspname = 'public' and c.relname = 'app_feedback_edits' and c.relkind = 'r';
	if v_rls is null then
		raise exception '0233 feedback-edits: table public.app_feedback_edits is missing.';
	end if;
	if not v_rls then
		raise exception '0233 feedback-edits: public.app_feedback_edits does not have row level security enabled.';
	end if;

	select count(*) into v_policies
	from pg_catalog.pg_policies p
	where p.schemaname = 'public' and p.tablename = 'app_feedback_edits';
	if v_policies <> 0 then
		raise exception '0233 feedback-edits: public.app_feedback_edits carries % policy/policies; it must have none.', v_policies;
	end if;

	foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
		foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'] loop
			if has_table_privilege(v_role, 'public.app_feedback_edits', v_priv) then
				raise exception '0233 feedback-edits: % holds % on public.app_feedback_edits; the revoke must name the roles.', v_role, v_priv;
			end if;
		end loop;
	end loop;

	select count(*) into v_overloads
	from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'app_feedback_edit';
	if v_overloads <> 1 then
		raise exception '0233 feedback-edits: app_feedback_edit has % overloads; it must have exactly one.', v_overloads;
	end if;
	if has_function_privilege('anon', 'public.app_feedback_edit(uuid, text, text, text, integer)', 'execute') then
		raise exception '0233 feedback-edits: anon can execute app_feedback_edit; revoke from anon BY NAME, per 0166.';
	end if;
	if not has_function_privilege('authenticated', 'public.app_feedback_edit(uuid, text, text, text, integer)', 'execute') then
		raise exception '0233 feedback-edits: authenticated cannot execute app_feedback_edit; the grant is missing.';
	end if;

	select count(*) into v_overloads
	from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'app_feedback_admin_list';
	if v_overloads <> 2 then
		raise exception '0233 feedback-edits: app_feedback_admin_list has % overloads; it must have exactly two.', v_overloads;
	end if;
	if to_regprocedure('public.app_feedback_admin_list(text, integer)') is null then
		raise exception '0233 feedback-edits: the narrow app_feedback_admin_list(text, integer) is gone; the deployed console calls it.';
	end if;
	if (select p.pronargdefaults from pg_catalog.pg_proc p
		where p.oid = 'public.app_feedback_admin_list(text, integer, text)'::regprocedure) <> 0 then
		raise exception '0233 feedback-edits: the wide app_feedback_admin_list declares a default; no payload may bind to both forms.';
	end if;
	select p.prosrc into v_src from pg_catalog.pg_proc p
	where p.oid = 'public.app_feedback_admin_list(text, integer, text)'::regprocedure;
	if position('app_feedback_edits' in v_src) = 0 then
		raise exception '0233 feedback-edits: the wide app_feedback_admin_list does not read the edits.';
	end if;
	if has_function_privilege('anon', 'public.app_feedback_admin_list(text, integer, text)', 'execute') then
		raise exception '0233 feedback-edits: anon can execute the wide app_feedback_admin_list.';
	end if;
	if not has_function_privilege('authenticated', 'public.app_feedback_admin_list(text, integer, text)', 'execute') then
		raise exception '0233 feedback-edits: authenticated cannot execute the wide app_feedback_admin_list.';
	end if;

	raise notice '0233 feedback-edits: % edit revision(s) over % report(s); app_feedback_edit and the wide list checked.',
		(select count(*) from public.app_feedback_edits),
		(select count(distinct e.feedback_id) from public.app_feedback_edits e);
end;
$fe$;
-- ===== PART feedback-edits END =====
