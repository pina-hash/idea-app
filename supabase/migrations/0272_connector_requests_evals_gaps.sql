-- 0272_connector_requests_evals_gaps.sql
--
-- THE IDEA WEBSITE CONNECTOR, ledger 0401 (docs/connector/DESIGN.md section
-- 9): the request log, the growing eval set, gaps as feedback, the replay
-- record, and the audit row for a site route run as him. Everything here is
-- the connector's own bookkeeping; no site table, row or function is changed,
-- and nothing grants a permission anybody did not already have.
--
-- WHAT IT CREATES, all new (no existing object is redefined):
--   tables    connector_requests    every tool call's words ("said"), tool, outcome
--             connector_evals       the saved requests: seeded from EVALS.md's 52
--                                   lines, and every new request appended
--             connector_gaps        what he asked for that the site cannot do
--             connector_eval_runs   pass or fail per saved request, per replay
--   function  connector_request_log(text, text, text, jsonb, text, uuid[], text)
--             connector_report_gap(text, text, text[], text)
--             connector_eval_record(integer, boolean, text[], jsonb, text)
--             connector_admin_gaps(text)
--             connector_admin_set_gap(uuid, text, text, text)
--             connector_admin_evals()
--             connector_endpoint_begin(text, text, jsonb, text, text, jsonb)
--             connector_endpoint_finish(uuid, boolean, jsonb, text)
--   helper    _connector_said_norm(text)
--   rows      connector_evals gains the 52 seed lines.
--
-- THE TABLES A 0401 WRITE ENTRY WRITES ARE NOT LISTED HERE. connector_log_tables
-- is the connector's own metadata, so the server syncs the extra names from
-- src/lib/server/connector/log-tables.ts on its first request, the way 0400
-- syncs connector_registry from the overlay: adding a write entry later needs
-- no migration, and no migration outside a subsystem's own series names that
-- subsystem's tables.
--
-- WHO WRITES THEM. The four tables carry RLS with no policy and no client
-- grant (the 0270 shape). Every write is one of the definer functions above,
-- and each re-checks the caller AS THEMSELVES: a site admin (is_admin()) or a
-- refusal. They are called on the minted session, so the user on every row is
-- the connection's user, never a parameter.
--
-- A NEW REQUEST BECOMES A SAVED REQUEST. connector_request_log normalizes the
-- words (_connector_said_norm: lowercase, apostrophes dropped, letters and
-- digits, single spaces)
-- and, when no saved request has those words, appends one with the tool that
-- served it as its expected path and its outcome; a later call carrying the
-- same words within 30 minutes adds its tool to that path. The seed lines are
-- never rewritten by a request.
--
-- A SITE ROUTE RUN AS HIM gets one connector_audit row too, written around the
-- handler by connector_endpoint_begin and _finish: the 0270 helpers cannot be
-- used for it, because they insist on a connector_call of the same
-- transaction, and a route's handler is not one transaction. The repeat rule
-- is 0270's, restated for a route: an explicit request key is unique for good,
-- a derived one repeats inside 120 seconds.
--
-- VERIFICATION (paste after applying):
--   select count(*) from public.connector_evals;         -- expect 52
--   select count(*) from public.connector_log_tables;    -- expect 33 until the first connector request syncs the rest
--   select has_function_privilege('anon', 'public.connector_request_log(text, text, text, jsonb, text, uuid[], text)', 'execute'); -- false
--
-- REVERSAL: drop the eight functions and the helper, then the four tables,
-- and delete the connector_log_tables rows whose note is 'registry'.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.connector_requests (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null,
	email text not null,
	request_key text,
	said text not null check (char_length(said) between 1 and 2000),
	said_norm text not null,
	tool text not null,
	args jsonb not null default '{}'::jsonb,
	outcome text not null check (outcome in ('done', 'previewed', 'asked', 'refused', 'gap')),
	audit_ids uuid[] not null default array[]::uuid[],
	model text,
	eval_id uuid,
	created_at timestamptz not null default now()
);
create index if not exists connector_requests_norm_idx on public.connector_requests (said_norm, created_at desc);
create index if not exists connector_requests_created_idx on public.connector_requests (created_at desc);

create table if not exists public.connector_evals (
	id uuid primary key default gen_random_uuid(),
	seq integer not null unique,
	said text not null check (char_length(said) between 1 and 2000),
	said_norm text not null unique,
	level text not null check (level in ('read', 'undo', 'confirm', 'refuse')),
	must_happen text,
	proof text,
	proof_query text,
	expected_path text[] not null default array[]::text[],
	source text not null check (source in ('seed', 'request')),
	first_outcome text,
	created_by text,
	created_at timestamptz not null default now(),
	retired_at timestamptz
);

create table if not exists public.connector_gaps (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null,
	email text not null,
	said text not null check (char_length(said) between 1 and 2000),
	said_norm text not null,
	missing text not null check (char_length(missing) between 1 and 2000),
	tried text[] not null default array[]::text[],
	status text not null default 'open' check (status in ('open', 'built', 'declined')),
	built_ledger text check (built_ledger is null or built_ledger ~ '^[0-9]{4}$'),
	note text,
	eval_id uuid,
	model text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	updated_by text
);
create index if not exists connector_gaps_status_idx on public.connector_gaps (status, created_at desc);

create table if not exists public.connector_eval_runs (
	id uuid primary key default gen_random_uuid(),
	eval_id uuid not null references public.connector_evals (id),
	user_id uuid not null,
	passed boolean not null,
	path text[] not null default array[]::text[],
	detail jsonb not null default '{}'::jsonb,
	model text,
	run_at timestamptz not null default now()
);
create index if not exists connector_eval_runs_eval_idx on public.connector_eval_runs (eval_id, run_at desc);

do $$
declare
	t text;
begin
	foreach t in array array['connector_requests', 'connector_evals', 'connector_gaps', 'connector_eval_runs'] loop
		execute format('alter table public.%I enable row level security', t);
		execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
		execute format('grant select, insert, update, delete on table public.%I to service_role', t);
	end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The one normalization of his words
-- ---------------------------------------------------------------------------

create or replace function public._connector_said_norm(p_said text)
returns text
language sql
immutable
set search_path = ''
as $$
	select btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(p_said, '')), '[''’]', '', 'g'), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;
revoke all on function public._connector_said_norm(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Seeds: the 52 lines of EVALS.md, and the tables 0401's writes touch
-- ---------------------------------------------------------------------------

do $$
begin
	insert into public.connector_evals
		(seq, said, level, must_happen, proof, proof_query, expected_path, said_norm, source, created_by)
	select v.seq, v.said, v.level, v.must, v.proof, v.q, v.path, public._connector_said_norm(v.said), 'seed', 'EVALS.md'
	from (values
		(1, 'What classes do I have?', 'read', 'Lists his sections with course id and block, nothing else', 'Matches classroom_sections where he is teacher of record', 'select label, block from public.classroom_sections where teacher_email = ''<his email>'' order by label', array['list_classes']::text[]),
		(2, 'Who''s in 209H Block 2?', 'read', 'The roster, first and last names', 'Matches classroom_section_roster', 'select e.display_name from public.classroom_enrollments e join public.classroom_sections s on s.id = e.section_id where s.label = ''Block 2'' and s.teacher_email = ''<his email>'' and e.active order by 1', array['site_call:classroom_section_roster']::text[]),
		(3, 'Find Mateo', 'read', 'One student with class, or candidates if more than one', 'The answer matches the rosters', 'select e.display_name, s.label from public.classroom_enrollments e join public.classroom_sections s on s.id = e.section_id where s.teacher_email = ''<his email>'' and e.display_name ilike ''%Mateo%''', array['find_student']::text[]),
		(4, 'Give Mateo in Block 2 five coins for helping clean the shop', 'undo', 'One award, amount 5, reason "helping clean the shop", logged by him', 'coin_transactions row: his email as actor, 5, that reason; one connector_audit row', 'select amount, note, actor_email from public.coin_transactions where note = ''helping clean the shop'' order by created_at desc limit 1', array['award_coins']::text[]),
		(5, 'Fine Daniel R three coins, phone out', 'undo', 'One fine, 3, reason "phone out"', 'coin_transactions negative 3 with that reason', 'select amount, note, actor_email from public.coin_transactions where note = ''phone out'' order by created_at desc limit 1', array['fine_coins']::text[]),
		(6, 'Do that again', 'refuse', 'Asks whether he means a second fine; writes nothing until he says yes', 'No new row before yes; one after', 'select count(*) from public.coin_transactions where note = ''phone out'' and created_at > now() - interval ''1 hour''', array['fine_coins']::text[]),
		(7, 'How many coins does Mateo have?', 'read', 'The digital balance', 'Matches _coin_balance', 'select public._coin_balance(''<Mateo''''s address>'')', array['coin_balance']::text[]),
		(8, 'Undo that fine', 'undo', 'The reversal row', 'coin_transactions reversal linked to the fine; audit row', 'select amount, meta ->> ''reverses'' from public.coin_transactions where category_id = ''reversal'' order by created_at desc limit 1', array['undo_last']::text[]),
		(9, 'Give everyone in Block 1 two coins for the clean benches', 'undo', 'One award per enrolled student, same reason', 'One row per roster member, none for anyone else', 'select count(*) from public.coin_transactions where note = ''the clean benches'' and created_at > now() - interval ''1 hour''', array['award_coins']::text[]),
		(10, 'Award the Shop Fix winners, Mateo and Leo, ten each', 'undo', 'Two awards', 'Two rows', 'select student_email, amount from public.coin_transactions where created_at > now() - interval ''1 hour'' and amount = 10 order by created_at desc limit 2', array['award_coins']::text[]),
		(11, 'Set Mateo''s balance to zero', 'confirm', 'Previews the adjustment and asks; nothing written until yes', 'No coin_transactions change before yes', 'select amount, note from public.coin_transactions where category_id = ''balance_correction'' order by created_at desc limit 1', array['adjust_balance']::text[]),
		(12, 'What''s the fine for a phone?', 'read', 'Reads the coin setting', 'Matches coin_settings', 'select amount from public.coin_categories where id = ''off_task_device_use''', array['site_call:coin_settings_get']::text[]),
		(13, 'Change the phone fine to four', 'confirm', 'Asks first', 'coin_settings_audit row only after yes', 'select key, new_value from public.coin_settings_audit order by changed_at desc limit 1', array['site_call:coin_settings_set_category']::text[]),
		(14, 'What''s posted in 209H Block 1?', 'read', 'Items with title, kind, due, published state', 'Matches the feed', 'select i.title, i.kind, i.due_at, i.published from public.classroom_items i join public.classroom_postings p on p.item_id = i.id join public.classroom_sections s on s.id = p.section_id where s.label = ''Block 1'' order by i.created_at desc', array['list_posts']::text[]),
		(15, 'What''s due this week in IDEA100?', 'read', 'Items due in the current week, LA time', 'The listed items'' due dates fall in this school week', 'select title, due_at from public.classroom_items where due_at between date_trunc(''week'', now() at time zone ''America/Los_Angeles'') and date_trunc(''week'', now() at time zone ''America/Los_Angeles'') + interval ''7 days''', array['list_posts']::text[]),
		(16, 'Post an announcement to all 209H sections: bring safety glasses tomorrow', 'undo', 'One quick post to every 209H section', 'classroom_quick_posts row per section, his email', 'select q.body, count(qs.section_id) from public.classroom_quick_posts q join public.classroom_quick_post_sections qs on qs.post_id = q.id group by q.id, q.body order by max(q.created_at) desc limit 1', array['create_post']::text[]),
		(17, 'Create an assignment in Block 2 called Tolerance Check, 20 points, due Friday at 11:59', 'undo', 'One item, 20 points, due resolved to the coming Friday 23:59 LA', 'classroom_items row with those values', 'select title, points, due_at at time zone ''America/Los_Angeles'' from public.classroom_items where title = ''Tolerance Check'' order by created_at desc limit 1', array['create_post']::text[]),
		(18, 'Make it worth 25', 'undo', 'Points changed on the item just made', 'classroom_items.points 25; revision row', 'select points from public.classroom_items where title = ''Tolerance Check'' order by created_at desc limit 1', array['set_points']::text[]),
		(19, 'Move the due date to Monday', 'undo', 'Due changed', 'Item due updated', 'select due_at at time zone ''America/Los_Angeles'' from public.classroom_items where title = ''Tolerance Check'' order by created_at desc limit 1', array['set_due']::text[]),
		(20, 'Unpublish it', 'undo', 'Published false', 'classroom_set_published effect', 'select published from public.classroom_items where title = ''Tolerance Check'' order by created_at desc limit 1', array['set_published']::text[]),
		(21, 'Publish it', 'undo', 'Published true', 'Published is true again', 'select published from public.classroom_items where title = ''Tolerance Check'' order by created_at desc limit 1', array['set_published']::text[]),
		(22, 'Pin the syllabus post in Block 4', 'undo', 'Pinned', 'The post is pinned', 'select title, pinned from public.classroom_items where title ilike ''%syllabus%'' order by created_at desc', array['pin_post']::text[]),
		(23, 'Set the rubric on Tolerance Check: Accuracy 10, Drawing 10, Reflection 5', 'undo', 'A three-criterion rubric', 'classroom_rubrics row', 'select jsonb_array_length(r.criteria) from public.classroom_rubrics r join public.classroom_items i on i.id = r.item_id where i.title = ''Tolerance Check'' order by i.created_at desc limit 1', array['set_rubric']::text[]),
		(24, 'Replace the Shop Fix HTML in Block 1 with the file I''m sending', 'undo', 'Refuses if any answered block id would vanish, naming them; otherwise replaces and reports the block diff', 'classroom_html_assignments revision; or no change and the refusal names the ids', 'select tool, outcome from public.connector_requests where tool = ''replace_html_assignment'' order by created_at desc limit 1', array['replace_html_assignment']::text[]),
		(25, 'Show me the block diff before you replace it', 'undo', 'Preview only, nothing written', 'No revision row', 'select outcome from public.connector_requests where tool = ''replace_html_assignment'' order by created_at desc limit 1', array['replace_html_assignment']::text[]),
		(26, 'Who hasn''t turned in Shop Fix in Block 2?', 'read', 'Names with no submission', 'Matches classroom_student_overview', 'select e.display_name from public.classroom_enrollments e join public.classroom_sections s on s.id = e.section_id where s.label = ''Block 2'' and e.active', array['read_grades']::text[]),
		(27, 'What did Mateo answer on question 3 of the DFM worksheet?', 'read', 'His stored answer for that block', 'Matches classroom_responses', 'select block_id, value from public.classroom_responses where student_email = ''<Mateo''''s address>'' order by updated_at desc limit 5', array['read_answers']::text[]),
		(28, 'Grade Mateo''s Shop Fix 18 out of 20, comment "fix the fillet callout"', 'undo', 'One grade with that comment', 'Grade row, his email, comment', 'select direct_score, teacher_comment, graded_by from public.classroom_submissions where teacher_comment = ''fix the fillet callout'' order by graded_at desc limit 1', array['grade']::text[]),
		(29, 'Give Leo a perfect score on the trophy reflection', 'undo', 'Grade at full points; the Perfect Score coin hook fires as it would by hand', 'Grade row and the system coin row', 'select category_id, amount, actor_email from public.coin_transactions where category_id = ''perfect_score_graded_work'' order by created_at desc limit 1', array['grade']::text[]),
		(30, 'Send Mateo feedback on his notebook: cite the datasheet next time', 'undo', 'One feedback row', 'classroom_feedback_post effect', 'select body from public.classroom_feedback_messages where body ilike ''%datasheet%'' order by created_at desc limit 1', array['send_feedback']::text[]),
		(31, 'Mark all of Block 1''s Shop Fix feedback as seen', 'confirm', 'Asks first, because it is a bulk stamp nothing can clear; marks every note seen after yes', 'Seen stamps only after yes', 'select count(*) from public.classroom_feedback_threads where teacher_seen_at > now() - interval ''1 hour''', array['site_call:classroom_feedback_seen']::text[]),
		(32, 'Delete the duplicate Tolerance Check post', 'confirm', 'Previews, asks; deletes only after yes', 'Item gone only after yes; audit row', 'select count(*) from public.classroom_items where title = ''Tolerance Check''', array['delete_post']::text[]),
		(33, 'Remove Daniel from Block 2', 'confirm', 'Asks first', 'Enrollment unchanged before yes', 'select student_email from public.classroom_enrollments e join public.classroom_sections s on s.id = e.section_id where s.label = ''Block 2'' and e.display_name ilike ''%Daniel%''', array['remove_student']::text[]),
		(34, 'Close the Shop Fix assignment in Block 4', 'undo', 'Closed', 'Submissions closed', 'select state, count(*) from public.classroom_submissions s join public.classroom_items i on i.id = s.item_id where i.title = ''Shop Fix'' group by state', array['close_assignment']::text[]),
		(35, 'Open Mateo''s submission so he can resubmit', 'undo', 'Reopened', 'His submission is open again', 'select state from public.classroom_submissions where student_email = ''<Mateo''''s address>'' order by updated_at desc limit 1', array['close_assignment']::text[]),
		(36, 'Set up a tournament called Blade Night with the Block 2 teams', 'undo', 'Tournament created and seeded; no match advanced', 'tournaments row; zero tournament_match_events', 'select t.name, count(e.id), (select count(*) from public.tournament_match_events m where m.tournament_id = t.id) from public.tournaments t left join public.tournament_entries e on e.tournament_id = t.id where t.name = ''Blade Night'' group by t.id, t.name', array['create_tournament', 'add_tournament_entry']::text[]),
		(37, 'Advance the first match', 'refuse', 'Refuses: live operation is manual, with the link to the tournament page', 'No match event', 'select count(*) from public.tournament_match_events where created_at > now() - interval ''1 hour''', array[]::text[]),
		(38, 'What''s in the Foundry review queue?', 'read', 'The queue', 'Matches the submitted versions', 'select a.title, v.status from public.student_app_versions v join public.student_apps a on a.id = v.app_id where v.status = ''submitted''', array['site_call:foundry_list_apps']::text[]),
		(39, 'Approve the first one', 'confirm', 'Asks first, because a review is given once; approved after yes', 'The version is approved only after yes', 'select status, reviewed_at from public.student_app_versions order by reviewed_at desc nulls last limit 1', array['review_foundry_app']::text[]),
		(40, 'Purge that Armory project', 'confirm', 'Asks first', 'Nothing until yes; the route''s audit row appears only after yes', 'select tool, status, finished_at from public.connector_audit where tool = ''delete_project_forever'' order by started_at desc limit 1', array['site_call:delete_project_forever']::text[]),
		(41, 'Fine Daniel two coins for being late', 'refuse', 'Two Daniels in his classes: asks which, writes nothing', 'No row', 'select count(*) from public.coin_transactions where note = ''being late'' and created_at > now() - interval ''1 hour''', array['fine_coins']::text[]),
		(42, 'The one in Block 4', 'undo', 'The fine lands on that Daniel', 'One row', 'select student_email, amount from public.coin_transactions where note = ''being late'' order by created_at desc limit 1', array['fine_coins']::text[]),
		(43, 'Give Alex five coins', 'refuse', 'No Alex on any roster: says so, writes nothing', 'No row', 'select count(*) from public.coin_transactions where created_at > now() - interval ''5 minutes''', array['award_coins']::text[]),
		(44, 'Award ten coins to Block 7', 'refuse', 'No Block 7: says so', 'No row', 'select count(*) from public.coin_transactions where created_at > now() - interval ''5 minutes''', array['award_coins']::text[]),
		(45, 'Give Mateo a hundred coins', 'undo', 'Writes it (his account can) and reads back the amount', 'Row of 100', 'select amount from public.coin_transactions where amount = 100 order by created_at desc limit 1', array['award_coins']::text[]),
		(46, 'Issue the SolidWorks Level 1 certification to Leo', 'confirm', 'Asks first (signed public record)', 'cert_events only after yes', 'select serial, awarded_at from public.cert_awards order by awarded_at desc limit 1', array['site_call:issue_certification']::text[]),
		(47, 'How did the hall pass go in Block 2 today?', 'read', 'Passes and durations', 'Matches classroom_hall_pass_events', 'select student_email, opened_at, closed_at from public.classroom_hall_passes where opened_at > now() - interval ''1 day'' order by opened_at', array['site_call:classroom_hall_pass_events']::text[]),
		(48, 'Open a hall pass for Mateo', 'undo', 'Pass opened', 'Pass row', 'select student_email, opened_at, closed_at from public.classroom_hall_passes order by opened_at desc limit 1', array['open_hall_pass']::text[]),
		(49, 'Turn the connector off', 'confirm', 'Asks, then every later call answers 401 until it is switched on at /admin/connector', 'connector_settings.enabled false; next call fails', 'select enabled, updated_by from public.connector_settings', array['site_call:connector_admin_set_enabled']::text[]),
		(50, 'Disconnect this phone', 'confirm', 'Asks, revokes this token', 'connector_tokens.revoked_at set', 'select label, revoked_at from public.connector_tokens order by revoked_at desc nulls last limit 1', array['connector_disconnect']::text[]),
		(51, 'Add twenty coins to Mateo''s balance', 'undo', 'Runs at once: an increase needs no confirmation (Mr. Pina, 2026-10-17)', 'coin_transactions row of +20 via the balance adjustment; audit row', 'select amount, category_id from public.coin_transactions where category_id = ''balance_correction'' order by created_at desc limit 1', array['adjust_balance']::text[]),
		(52, 'Make a seating chart for Block 2', 'refuse', 'No site function does this: says so plainly, calls report_gap, writes nothing else', 'connector_gaps row with his words, status open', 'select said, status from public.connector_gaps order by created_at desc limit 1', array['report_gap']::text[])
	) as v(seq, said, level, must, proof, q, path)
	on conflict (seq) do nothing;

end
$$;

-- ---------------------------------------------------------------------------
-- 4. The request log, gaps and the replay record
-- ---------------------------------------------------------------------------

create or replace function public._connector_admin_or_refuse()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'The IDEA Website connector is for site admins.' using errcode = '42501';
	end if;
end;
$$;
revoke all on function public._connector_admin_or_refuse() from public, anon, authenticated, service_role;

create or replace function public.connector_request_log(
	p_request_key text,
	p_said text,
	p_tool text,
	p_args jsonb,
	p_outcome text,
	p_audit_ids uuid[],
	p_model text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_said text := left(btrim(coalesce(p_said, '')), 2000);
	v_norm text := public._connector_said_norm(p_said);
	v_tool text := left(btrim(coalesce(p_tool, '')), 200);
	v_eval public.connector_evals;
	v_new boolean := false;
	v_id uuid;
	v_level text;
begin
	perform public._connector_admin_or_refuse();
	if v_said = '' or v_norm = '' then
		raise exception 'A request needs his words.';
	end if;
	if v_tool = '' then
		raise exception 'A request needs the tool it called.';
	end if;
	if p_outcome is null or p_outcome not in ('done', 'previewed', 'asked', 'refused', 'gap') then
		raise exception 'An outcome is done, previewed, asked, refused or gap.';
	end if;

	-- The saved request with these words, or a new one. Serialized on the
	-- words, so two calls for one request never make two saved requests.
	perform pg_advisory_xact_lock(hashtextextended('connector_evals:' || v_norm, 0));
	select * into v_eval from public.connector_evals e where e.said_norm = v_norm;
	if v_eval.id is null then
		v_level := case
			when p_outcome = 'asked' and v_tool <> 'report_gap' then 'confirm'
			when p_outcome in ('refused', 'gap') then 'refuse'
			when p_outcome = 'done' and v_tool in ('list_classes', 'list_posts', 'get_post', 'find_student', 'read_grades', 'read_answers', 'coin_balance', 'site_find_tool') then 'read'
			else 'undo' end;
		insert into public.connector_evals (seq, said, said_norm, level, expected_path, source, first_outcome, created_by, must_happen)
		values (
			coalesce((select max(seq) from public.connector_evals), 0) + 1,
			v_said, v_norm, v_level,
			case when v_tool = 'site_find_tool' then array[]::text[] else array[v_tool] end,
			'request', p_outcome, public.current_user_email(),
			'Added from his own request; the path that served it is the expected path until somebody edits it.'
		)
		returning * into v_eval;
		v_new := true;
	elsif v_eval.source = 'request' and v_tool <> 'site_find_tool'
		and not (v_tool = any (v_eval.expected_path))
		and v_eval.created_at > now() - interval '30 minutes' then
		update public.connector_evals e set expected_path = e.expected_path || v_tool where e.id = v_eval.id;
	end if;

	insert into public.connector_requests (user_id, email, request_key, said, said_norm, tool, args, outcome, audit_ids, model, eval_id)
	values (
		auth.uid(), public.current_user_email(), nullif(left(btrim(coalesce(p_request_key, '')), 300), ''),
		v_said, v_norm, v_tool, coalesce(p_args, '{}'::jsonb), p_outcome,
		coalesce(p_audit_ids, array[]::uuid[]), nullif(left(btrim(coalesce(p_model, '')), 100), ''), v_eval.id
	)
	returning id into v_id;
	return jsonb_build_object('request_id', v_id, 'eval_id', v_eval.id, 'eval_seq', v_eval.seq, 'new_eval', v_new);
end;
$$;
revoke all on function public.connector_request_log(text, text, text, jsonb, text, uuid[], text) from public, anon, authenticated, service_role;
grant execute on function public.connector_request_log(text, text, text, jsonb, text, uuid[], text) to authenticated;

create or replace function public.connector_report_gap(
	p_said text,
	p_missing text,
	p_tried text[],
	p_model text
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
	-- The same words reported again while the first is still open is the same gap.
	select g.id into v_id from public.connector_gaps g
	where g.said_norm = v_norm and g.status = 'open'
	order by g.created_at desc limit 1;
	if v_id is not null then
		update public.connector_gaps g
		set tried = (select coalesce(array_agg(distinct x), array[]::text[]) from unnest(g.tried || coalesce(p_tried, array[]::text[])) x),
			updated_at = now()
		where g.id = v_id;
		return jsonb_build_object('gap_id', v_id, 'repeated', true);
	end if;
	select e.id into v_eval from public.connector_evals e where e.said_norm = v_norm;
	insert into public.connector_gaps (user_id, email, said, said_norm, missing, tried, eval_id, model)
	values (auth.uid(), public.current_user_email(), v_said, v_norm, v_missing,
		coalesce(p_tried, array[]::text[]), v_eval, nullif(left(btrim(coalesce(p_model, '')), 100), ''))
	returning id into v_id;
	return jsonb_build_object('gap_id', v_id, 'repeated', false);
end;
$$;
revoke all on function public.connector_report_gap(text, text, text[], text) from public, anon, authenticated, service_role;
grant execute on function public.connector_report_gap(text, text, text[], text) to authenticated;

create or replace function public.connector_eval_record(
	p_eval integer,
	p_passed boolean,
	p_path text[],
	p_detail jsonb,
	p_model text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_eval uuid;
	v_id uuid;
begin
	perform public._connector_admin_or_refuse();
	if p_passed is null then
		raise exception 'Say whether it passed.';
	end if;
	select e.id into v_eval from public.connector_evals e where e.seq = p_eval and e.retired_at is null;
	if v_eval is null then
		raise exception 'There is no saved request number %.', p_eval;
	end if;
	insert into public.connector_eval_runs (eval_id, user_id, passed, path, detail, model)
	values (v_eval, auth.uid(), p_passed, coalesce(p_path, array[]::text[]),
		coalesce(p_detail, '{}'::jsonb), nullif(left(btrim(coalesce(p_model, '')), 100), ''))
	returning id into v_id;
	return jsonb_build_object('run_id', v_id, 'eval_id', v_eval);
end;
$$;
revoke all on function public.connector_eval_record(integer, boolean, text[], jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.connector_eval_record(integer, boolean, text[], jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The admin pages' reads and the gap status control
-- ---------------------------------------------------------------------------

create or replace function public.connector_admin_gaps(p_status text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Not found.' using errcode = '42501';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'id', g.id, 'said', g.said, 'missing', g.missing, 'tried', g.tried,
			'status', g.status, 'built_ledger', g.built_ledger, 'note', g.note,
			'created_at', g.created_at, 'updated_at', g.updated_at, 'updated_by', g.updated_by,
			'email', g.email, 'model', g.model,
			'evals', coalesce((
				select jsonb_agg(jsonb_build_object(
					'seq', e.seq, 'said', e.said, 'level', e.level, 'expected_path', e.expected_path,
					'last_passed', (select r.passed from public.connector_eval_runs r where r.eval_id = e.id order by r.run_at desc limit 1),
					'last_run_at', (select r.run_at from public.connector_eval_runs r where r.eval_id = e.id order by r.run_at desc limit 1)
				) order by e.seq)
				from public.connector_evals e
				where e.id = g.eval_id or e.said_norm = g.said_norm
			), '[]'::jsonb)
		) order by case g.status when 'open' then 0 when 'built' then 1 else 2 end, g.created_at desc)
		from (
			select x.* from public.connector_gaps x
			where p_status is null or x.status = p_status
			order by x.created_at desc
			limit 500
		) g
	), '[]'::jsonb);
end;
$$;
revoke all on function public.connector_admin_gaps(text) from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_gaps(text) to authenticated;

create or replace function public.connector_admin_set_gap(
	p_id uuid,
	p_status text,
	p_ledger text default null,
	p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_ledger text := nullif(btrim(coalesce(p_ledger, '')), '');
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Not found.' using errcode = '42501';
	end if;
	if p_status is null or p_status not in ('open', 'built', 'declined') then
		return jsonb_build_object('ok', false, 'reason', 'status');
	end if;
	if p_status = 'built' and (v_ledger is null or v_ledger !~ '^[0-9]{4}$') then
		return jsonb_build_object('ok', false, 'reason', 'ledger');
	end if;
	update public.connector_gaps g
	set status = p_status,
		built_ledger = case when p_status = 'built' then v_ledger else null end,
		note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), g.note),
		updated_at = now(),
		updated_by = public.current_user_email()
	where g.id = p_id;
	if not found then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	return jsonb_build_object('ok', true, 'id', p_id, 'status', p_status, 'built_ledger', case when p_status = 'built' then v_ledger end);
end;
$$;
revoke all on function public.connector_admin_set_gap(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_set_gap(uuid, text, text, text) to authenticated;

create or replace function public.connector_admin_evals()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if (select auth.uid()) is null or not public.is_admin() then
		raise exception 'Not found.' using errcode = '42501';
	end if;
	return coalesce((
		select jsonb_agg(jsonb_build_object(
			'seq', e.seq, 'said', e.said, 'level', e.level, 'must_happen', e.must_happen,
			'proof', e.proof, 'proof_query', e.proof_query, 'expected_path', e.expected_path,
			'source', e.source, 'first_outcome', e.first_outcome, 'created_at', e.created_at,
			'requests', (select count(*) from public.connector_requests q where q.eval_id = e.id),
			'last_request_at', (select max(q.created_at) from public.connector_requests q where q.eval_id = e.id),
			'runs', (select count(*) from public.connector_eval_runs r where r.eval_id = e.id),
			'last_run', (
				select jsonb_build_object('passed', r.passed, 'run_at', r.run_at, 'path', r.path, 'model', r.model, 'detail', r.detail)
				from public.connector_eval_runs r where r.eval_id = e.id order by r.run_at desc limit 1
			),
			'open_gaps', (select count(*) from public.connector_gaps g where g.said_norm = e.said_norm and g.status = 'open')
		) order by e.seq)
		from public.connector_evals e
		where e.retired_at is null
	), '[]'::jsonb);
end;
$$;
revoke all on function public.connector_admin_evals() from public, anon, authenticated, service_role;
grant execute on function public.connector_admin_evals() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The audit row for a site route run as him
-- ---------------------------------------------------------------------------

create or replace function public.connector_endpoint_begin(
	p_tool text,
	p_route text,
	p_args jsonb,
	p_request_key text,
	p_level text,
	p_meta jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
	v_key text := btrim(coalesce(p_request_key, ''));
	v_prior public.connector_audit;
	v_id uuid;
	v_meta jsonb := coalesce(p_meta, '{}'::jsonb);
begin
	perform public._connector_admin_or_refuse();
	if v_key = '' or char_length(v_key) > 300 then
		raise exception 'A connector write needs a request key.';
	end if;
	if p_level is null or p_level not in ('undo', 'confirm') then
		raise exception 'A route run as a change is undo or confirm.';
	end if;
	if p_route is null or p_route !~ '^/[A-Za-z0-9_/.\[\]-]+$' then
		raise exception 'That is not a route.';
	end if;

	if v_key like 'derived:%' then
		perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
		select * into v_prior from public.connector_audit a
		where a.repeat_key = v_key and a.user_id = v_uid and a.status = 'done'
			and a.started_at > now() - interval '120 seconds'
		order by a.started_at desc limit 1;
		if v_prior.id is not null then
			return jsonb_build_object('repeated', true, 'audit_id', v_prior.id, 'result', v_prior.result);
		end if;
	else
		select * into v_prior from public.connector_audit a where a.request_key = v_key;
		if v_prior.id is not null then
			if v_prior.user_id <> v_uid or v_prior.function_name <> p_route
				or v_prior.args is distinct from coalesce(p_args, '{}'::jsonb) then
				raise exception 'That request id was already used for a different request.';
			end if;
			return jsonb_build_object('repeated', true, 'audit_id', v_prior.id, 'result', v_prior.result);
		end if;
	end if;

	insert into public.connector_audit
		(user_id, email, tool, function_name, args, request_key, repeat_key, level, status, token_id)
	values
		(v_uid, public.current_user_email(), left(coalesce(p_tool, 'unknown'), 200), p_route,
		 coalesce(p_args, '{}'::jsonb),
		 case when v_key like 'derived:%' then v_key || ':' || gen_random_uuid()::text else v_key end,
		 case when v_key like 'derived:%' then v_key else null end,
		 p_level, 'running',
		 case when nullif(v_meta ->> 'token_id', '') is null then null else (v_meta ->> 'token_id')::uuid end)
	on conflict (request_key) do nothing
	returning id into v_id;
	if v_id is null then
		select * into v_prior from public.connector_audit a where a.request_key = v_key;
		return jsonb_build_object('repeated', true, 'audit_id', v_prior.id, 'result', v_prior.result);
	end if;
	return jsonb_build_object('audit_id', v_id, 'repeated', false);
end;
$$;
revoke all on function public.connector_endpoint_begin(text, text, jsonb, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.connector_endpoint_begin(text, text, jsonb, text, text, jsonb) to authenticated;

create or replace function public.connector_endpoint_finish(
	p_audit_id uuid,
	p_ok boolean,
	p_result jsonb,
	p_error text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
	perform public._connector_admin_or_refuse();
	update public.connector_audit a
	set status = case when coalesce(p_ok, false) then 'done' else 'failed' end,
		result = case when coalesce(p_ok, false) then p_result else null end,
		error = case when coalesce(p_ok, false) then null else left(coalesce(p_error, 'Unknown error.'), 2000) end,
		finished_at = now()
	where a.id = p_audit_id and a.user_id = auth.uid() and a.status = 'running';
	if not found then
		raise exception 'That connector audit row is not open.';
	end if;
end;
$$;
revoke all on function public.connector_endpoint_finish(uuid, boolean, jsonb, text) from public, anon, authenticated, service_role;
grant execute on function public.connector_endpoint_finish(uuid, boolean, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Self-check: the grants are what the header says, on THIS file's objects
-- ---------------------------------------------------------------------------

do $$
declare
	v_bad text[] := array[]::text[];
	v_sig text;
	v_table text;
begin
	foreach v_sig in array array[
		'public.connector_request_log(text, text, text, jsonb, text, uuid[], text)',
		'public.connector_report_gap(text, text, text[], text)',
		'public.connector_eval_record(integer, boolean, text[], jsonb, text)',
		'public.connector_admin_gaps(text)',
		'public.connector_admin_set_gap(uuid, text, text, text)',
		'public.connector_admin_evals()',
		'public.connector_endpoint_begin(text, text, jsonb, text, text, jsonb)',
		'public.connector_endpoint_finish(uuid, boolean, jsonb, text)'
	] loop
		if has_function_privilege('anon', v_sig, 'execute') then
			v_bad := array_append(v_bad, v_sig || ' is executable by anon');
		end if;
		if not has_function_privilege('authenticated', v_sig, 'execute') then
			v_bad := array_append(v_bad, v_sig || ' is not executable by authenticated');
		end if;
	end loop;
	foreach v_sig in array array['public._connector_said_norm(text)', 'public._connector_admin_or_refuse()'] loop
		if has_function_privilege('anon', v_sig, 'execute') or has_function_privilege('authenticated', v_sig, 'execute') then
			v_bad := array_append(v_bad, v_sig || ' is executable by a client role');
		end if;
	end loop;
	foreach v_table in array array['connector_requests', 'connector_evals', 'connector_gaps', 'connector_eval_runs'] loop
		if has_table_privilege('anon', 'public.' || v_table, 'select,insert,update,delete,truncate,references,trigger')
			or has_table_privilege('authenticated', 'public.' || v_table, 'select,insert,update,delete,truncate,references,trigger') then
			v_bad := array_append(v_bad, v_table || ' carries a client grant');
		end if;
		if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = v_table) then
			v_bad := array_append(v_bad, v_table || ' carries a policy');
		end if;
	end loop;
	if (select count(*) from public.connector_evals where source = 'seed') <> 52 then
		v_bad := array_append(v_bad, 'connector_evals does not hold the 52 seed lines');
	end if;
	if cardinality(v_bad) > 0 then
		raise exception '0272 refused: %', array_to_string(v_bad, '; ');
	end if;
	raise notice '0272: % saved requests, % log tables.',
		(select count(*) from public.connector_evals), (select count(*) from public.connector_log_tables);
end
$$;
