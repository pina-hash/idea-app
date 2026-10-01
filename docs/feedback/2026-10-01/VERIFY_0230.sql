/* 0230 post-apply check. READ-ONLY: one select, writes nothing, and never errors
   (an object 0230 did not create reads MISSING instead). Every row should read ok = true.
   This file carries no line comment, so it still runs if a paste loses its line breaks. */
with fns(sig, signed_in) as (values
	('classroom_quick_posts(uuid)', true),
	('classroom_quick_post_create(uuid[],text,timestamptz)', true),
	('classroom_quick_post_take_down(uuid)', true),
	('_classroom_quick_post_can_take_down(uuid,text)', false),
	('_foundry_site_closed()', false),
	('foundry_set_site_open(boolean,text)', true),
	('foundry_section_access()', true),
	('foundry_play_start(uuid,uuid)', true),
	('foundry_publisher_status()', true),
	('foundry_publisher_apply(jsonb)', true),
	('foundry_publisher_applications(text)', true),
	('foundry_publisher_pending_count()', true),
	('foundry_publisher_decide(uuid,text,text)', true),
	('foundry_publisher_questions_admin()', true),
	('foundry_publisher_set_questions(jsonb)', true),
	('foundry_game_requests(boolean)', true),
	('foundry_game_request_post(text,text,text)', true),
	('foundry_game_request_close(uuid,text)', true),
	('foundry_game_request_set_hidden(uuid,boolean)', true),
	('app_feedback_set_horizon(uuid,text)', true),
	('app_feedback_admin_list(text,integer)', true),
	('app_feedback_admin_list(text,integer,text)', true),
	('app_feedback_submit(text,text,text,text,jsonb,text,text,text,text)', false)
), tabs(n) as (values
	('classroom_quick_posts'), ('classroom_quick_post_sections'), ('foundry_site_settings'),
	('foundry_publisher_questions'), ('foundry_publisher_applications'), ('foundry_game_requests')
)
select 'function ' || f.sig as check_name,
	coalesce(
		to_regprocedure('public.' || f.sig) is not null
		and not has_function_privilege('anon', to_regprocedure('public.' || f.sig), 'execute')
		and has_function_privilege('authenticated', to_regprocedure('public.' || f.sig), 'execute') = f.signed_in,
		false) as ok,
	case when to_regprocedure('public.' || f.sig) is null then 'MISSING'
		else 'anon ' || has_function_privilege('anon', to_regprocedure('public.' || f.sig), 'execute')
			|| ', signed in ' || has_function_privilege('authenticated', to_regprocedure('public.' || f.sig), 'execute')
			|| ' (should be ' || f.signed_in || ')' end as detail
from fns f
union all
select 'table ' || t.n,
	coalesce(
		c.relrowsecurity
		and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.n) = 0
		and not exists (
			select 1 from (values ('anon'), ('authenticated')) r(role),
				(values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) v(priv)
			where has_table_privilege(r.role, c.oid, v.priv)),
		false),
	case when c.oid is null then 'MISSING' else 'rls ' || c.relrowsecurity || ', policies '
		|| (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.n) end
from tabs t
left join pg_class c on c.oid = to_regclass('public.' || t.n)
union all
select 'app_feedback.horizon: NOT NULL, default now, checked',
	exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'app_feedback' and column_name = 'horizon'
			and is_nullable = 'NO' and column_default like '''now''%')
		and exists (select 1 from pg_constraint where conname = 'app_feedback_horizon_check'),
	case when not exists (select 1 from information_schema.columns
			where table_schema = 'public' and table_name = 'app_feedback' and column_name = 'horizon') then 'MISSING'
		else (xpath('/row/x/text()', query_to_xml(
			'select ''now '' || count(*) filter (where horizon = ''now'') || '', long_term '' || count(*) filter (where horizon = ''long_term'') as x from public.app_feedback',
			false, true, '')))[1]::text end
union all
select 'app_feedback_admin_list: two forms, the wide one with no defaults',
	(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'app_feedback_admin_list') = 2
	and coalesce((select pronargdefaults = 0 from pg_proc where oid = to_regprocedure('public.app_feedback_admin_list(text,integer,text)')), false)
	and coalesce((select pronargdefaults = 2 from pg_proc where oid = to_regprocedure('public.app_feedback_admin_list(text,integer)')), false),
	(select string_agg(p.oid::regprocedure::text || ' defaults ' || p.pronargdefaults, '; ')
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = 'app_feedback_admin_list')
union all
select 'one overload each of the three other re-created functions',
	(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname in ('foundry_section_access', 'foundry_play_start', 'app_feedback_submit')) = 3,
	'foundry_section_access, foundry_play_start, app_feedback_submit'
union all
select 'the bundle gate can read the switch (service role SELECT, nothing else)',
	coalesce(has_table_privilege('service_role', to_regclass('public.foundry_site_settings'), 'select')
		and not has_table_privilege('service_role', to_regclass('public.foundry_site_settings'), 'insert'), false),
	case when to_regclass('public.foundry_site_settings') is null then 'MISSING' else '' end
union all
select 'the Foundry switch row',
	coalesce(case when to_regclass('public.foundry_site_settings') is null then false
		else (xpath('/row/x/text()', query_to_xml('select count(*) = 1 as x from public.foundry_site_settings', false, true, '')))[1]::text = 'true' end, false),
	case when to_regclass('public.foundry_site_settings') is null then 'MISSING'
		else (xpath('/row/x/text()', query_to_xml(
			'select case when closed_at is null then ''Foundry is ON'' else ''Foundry is OFF since '' || closed_at end as x from public.foundry_site_settings limit 1',
			false, true, '')))[1]::text end
union all
select 'the drafted publisher questions (6, two of them tricks)',
	coalesce(case when to_regclass('public.foundry_publisher_questions') is null then false
		else (xpath('/row/x/text()', query_to_xml(
			'select count(*) >= 6 and count(*) filter (where is_trick) >= 2 as x from public.foundry_publisher_questions',
			false, true, '')))[1]::text = 'true' end, false),
	case when to_regclass('public.foundry_publisher_questions') is null then 'MISSING'
		else (xpath('/row/x/text()', query_to_xml(
			'select count(*) || '' questions, '' || count(*) filter (where is_trick) || '' trick, '' || count(*) filter (where active) || '' active'' as x from public.foundry_publisher_questions',
			false, true, '')))[1]::text end
union all
select 'the history row (tools/apply-migration.mjs writes it; false only means it was pasted by hand)',
	coalesce(case when to_regclass('supabase_migrations.schema_migrations') is null then false
		else (xpath('/row/x/text()', query_to_xml(
			'select count(*) = 1 as x from supabase_migrations.schema_migrations where version = ''0230''',
			false, true, '')))[1]::text = 'true' end, false),
	case when to_regclass('supabase_migrations.schema_migrations') is null then 'no history table' else '' end;
