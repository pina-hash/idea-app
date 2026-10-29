-- 0327_connector_gaps_request_id.sql
--
-- A GAP IS DEDUPED ON ITS REQUEST, NEVER ON HIS WORDS ALONE (ledger 0458,
-- report 0a569932, gap 02743baf).
--
-- 0272's `connector_report_gap` treated a second report carrying the same
-- words as the same gap while the first was open. A chat that files several
-- gaps for ONE request sends the same `said` with each, so on 2026-10-28 three
-- of the four gaps the IDEA209H Unit 4 chat filed in one request were folded
-- into the first and lost. Now:
--
--   1. `connector_gaps.request_id` holds the chat's own request id;
--   2. a report is the same gap only when it carries the request id of an
--      open gap (a retry of the same call), or carries his same words AND the
--      same missing sentence while that gap is open (the same gap said twice,
--      which is what the site_call path and an explicit report_gap do when both
--      fire for one ask). Different missing sentences are different gaps.
--
-- DEPLOY ORDERING: the function gains `p_request_id`, defaulted, and the old
-- four-argument form is dropped first so PostgREST has one form to choose.
-- A deployed client calling with four named arguments still lands on the new
-- form (the fifth defaults), and the new client names `p_request_id` only
-- when a request id was given and retries without it if this file has not
-- landed yet, so either may go first.
--
-- WHAT UNDOES IT, a person's paste: re-run 0272's `connector_report_gap`
-- (its body, its revoke and its grant), then
--   drop function if exists public.connector_report_gap(text, text, text[], text, text);
-- The column may stay; nothing else reads it.

alter table public.connector_gaps add column if not exists request_id text
	check (request_id is null or char_length(request_id) between 1 and 200);

create index if not exists connector_gaps_request_idx
	on public.connector_gaps (request_id) where request_id is not null;

drop function if exists public.connector_report_gap(text, text, text[], text);

create or replace function public.connector_report_gap(
	p_said text,
	p_missing text,
	p_tried text[],
	p_model text,
	p_request_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_said text := left(btrim(coalesce(p_said, '')), 2000);
	v_missing text := left(btrim(coalesce(p_missing, '')), 2000);
	v_norm text := public._connector_said_norm(p_said);
	v_request text := nullif(left(btrim(coalesce(p_request_id, '')), 200), '');
	v_id uuid;
	v_eval uuid;
begin
	perform public._connector_admin_or_refuse();
	if v_said = '' or v_norm = '' then
		raise exception 'A gap needs his words.';
	end if;
	if v_missing = '' then
		raise exception 'A gap needs what is missing.';
	end if;
	-- 0327: the same REQUEST (a retry), or the same words saying the same
	-- missing thing, while the first is open. Never the words alone.
	select g.id into v_id from public.connector_gaps g
	where g.status = 'open'
		and (
			(v_request is not null and g.request_id = v_request)
			or (g.said_norm = v_norm and lower(btrim(g.missing)) = lower(v_missing))
		)
	order by g.created_at desc limit 1;
	if v_id is not null then
		update public.connector_gaps g
		set tried = (select coalesce(array_agg(distinct x), array[]::text[]) from unnest(g.tried || coalesce(p_tried, array[]::text[])) x),
			updated_at = now()
		where g.id = v_id;
		return jsonb_build_object('gap_id', v_id, 'repeated', true);
	end if;
	select e.id into v_eval from public.connector_evals e where e.said_norm = v_norm;
	insert into public.connector_gaps (user_id, email, said, said_norm, missing, tried, eval_id, model, request_id)
	values (auth.uid(), public.current_user_email(), v_said, v_norm, v_missing,
		coalesce(p_tried, array[]::text[]), v_eval, nullif(left(btrim(coalesce(p_model, '')), 100), ''), v_request)
	returning id into v_id;
	return jsonb_build_object('gap_id', v_id, 'repeated', false);
end;
$$;
revoke all on function public.connector_report_gap(text, text, text[], text, text) from public, anon, authenticated, service_role;
grant execute on function public.connector_report_gap(text, text, text[], text, text) to authenticated;

do $report$
begin
	raise notice '0327: % open gaps; each keeps its row, and only new reports are judged by the new rule.',
		(select count(*) from public.connector_gaps where status = 'open');
end
$report$;
