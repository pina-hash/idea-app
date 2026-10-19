-- 0282_app_feedback_file.sql
--
-- A SIGNED-IN FEEDBACK REPORT AS ONE FUNCTION (ledger 0416, connector gap
-- ae4a495d).
--
-- The site's Send feedback box files a signed-in report as a direct insert
-- into app_feedback under 0053's and 0126's insert policy (user_id must be the
-- caller). The IDEA Website connector reaches functions only, so until now a
-- connector bug could be filed only as a connector gap, never as a site report
-- in the one feedback list. app_feedback_file is that same insert as a
-- function: SECURITY INVOKER, so the insert policy decides exactly as it does
-- for the box (a report is the caller's own, and nobody files one as somebody
-- else), and every CHECK on the table still applies. It widens nothing: any
-- signed-in account can already insert this row directly.
--
-- What it writes is what the box writes: app, kind, message, the optional
-- "what did you try", the horizon (fix soon or a long term idea) and context,
-- with meta saying where it came from. No screenshot: the box uploads one to
-- its own folder first, which a chat cannot do.
--
-- UNDO: drop function public.app_feedback_file(text, text, text, text, text, text, jsonb);
-- (the rows it filed are ordinary reports and stay).

create or replace function public.app_feedback_file(
	p_app text,
	p_kind text,
	p_message text,
	p_tried text default null,
	p_horizon text default null,
	p_context text default null,
	p_meta jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fb$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
	v_kind text := lower(btrim(coalesce(p_kind, '')));
	v_h text := coalesce(nullif(lower(btrim(coalesce(p_horizon, ''))), ''), 'now');
	v_msg text := btrim(coalesce(p_message, ''));
	v_tried text := nullif(btrim(coalesce(p_tried, '')), '');
begin
	if v_uid is null then
		raise exception 'You must be signed in to send feedback.';
	end if;
	if v_kind not in ('bug', 'idea', 'praise', 'other') then
		raise exception 'A report is a bug, an idea, praise or other.';
	end if;
	if v_h not in ('now', 'long_term') then
		raise exception 'A report is fix soon (now) or a long term idea (long_term).';
	end if;
	if v_msg = '' then
		raise exception 'Say what happened.';
	end if;
	insert into public.app_feedback (user_id, app, context, kind, message, meta, tried, horizon)
	values (
		v_uid,
		coalesce(nullif(btrim(coalesce(p_app, '')), ''), 'portal'),
		nullif(btrim(coalesce(p_context, '')), ''),
		v_kind,
		v_msg,
		coalesce(p_meta, '{}'::jsonb) || jsonb_build_object('filed_by', 'app_feedback_file'),
		v_tried,
		v_h
	)
	returning id into v_id;
	return jsonb_build_object('ok', true, 'id', v_id, 'kind', v_kind, 'horizon', v_h);
end;
$fb$;

revoke all on function public.app_feedback_file(text, text, text, text, text, text, jsonb)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_file(text, text, text, text, text, text, jsonb) to authenticated;

comment on function public.app_feedback_file(text, text, text, text, text, text, jsonb) is
'File a signed-in feedback report as the caller, exactly as the Send feedback box does (0416). Security invoker: the app_feedback insert policy decides.';

do $chk$
declare
	v_bad text[] := '{}';
	v_sig text := 'public.app_feedback_file(text, text, text, text, text, text, jsonb)';
begin
	if has_function_privilege('anon', v_sig, 'execute') then
		v_bad := array_append(v_bad, 'anon executes app_feedback_file');
	end if;
	if not has_function_privilege('authenticated', v_sig, 'execute') then
		v_bad := array_append(v_bad, 'a signed-in account cannot execute app_feedback_file');
	end if;
	if (select p.prosecdef from pg_proc p where p.oid = v_sig::regprocedure) then
		v_bad := array_append(v_bad, 'app_feedback_file must be security invoker');
	end if;
	if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'app_feedback_file') <> 1 then
		v_bad := array_append(v_bad, 'app_feedback_file has more than one form');
	end if;
	if array_length(v_bad, 1) is not null then
		raise exception '0282 self-check refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0282: app_feedback_file is in place; % reports in app_feedback.', (select count(*) from public.app_feedback);
end
$chk$;
