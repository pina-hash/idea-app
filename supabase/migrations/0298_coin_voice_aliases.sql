-- 0298_coin_voice_aliases.sql
--
-- VOICE TO ACTION FOR IDEA COINS (ledger 0432, feedback fba5bfcd). Mr. Pina
-- logs coins by voice through Haiku on his phone, in his own words with a
-- number. The connector's coin tool works out the student, award, fine or
-- purchase, and the category from his words; this file holds what it learns.
--
-- THE AMOUNT RULE, his correction of 2026-10-23, word for word in effect:
-- a known item or category with a listed amount uses that amount; a new
-- phrase with a number saves the phrase with that number as its default; a
-- later number for the same phrase replaces the default; no number and no
-- listed amount asks for the number and writes nothing. The asking happens in
-- the connector (src/lib/server/connector/coin-voice.ts); this file stores the
-- phrases and logs only what it is handed.
--
--   * coin_phrase_aliases: a phrase (lowercase words) to a category, with the
--     default amount he last gave for it (null: the category's own listed
--     amount). Seeded with the everyday words for the existing categories
--     ("phone" is the Off-Task fine), amounts null, so a seed never sets a
--     price. Admin-editable from coin settings; source says where each came
--     from. RLS on, no client grant: reads and writes are the functions below.
--   * Custom Award, Custom Fine and Custom Purchase: variable categories for
--     a phrase that matches nothing, with his words as the reason.
--   * coin_voice_catalog(): the loggable award, fine and purchase categories
--     and every phrase, for coin staff.
--   * coin_voice_log(email, category, amount, note, phrase): logs one record
--     through coin_log_transaction (every gate, cap and price check there
--     applies unchanged) and, when a phrase and an amount are given and the
--     category's price is not set, saves the phrase with that amount as its
--     default. A full coin admin's phrases only: section coin staff log
--     through it but teach it nothing.
--   * coin_alias_list(), coin_alias_set_amount(id, amount),
--     coin_alias_promote(id, name), coin_alias_delete(id): the coin settings
--     list, for a full coin admin. Promote makes the phrase an official flat
--     category at its default amount and points the phrase at it.
--
--   * Twelve saved requests for the new connector tools (connector_evals),
--     so the nightly replay checks their routes.
--
-- ADDITIVE, NO ORDERING. IDEMPOTENT: if not exists, create or replace, and
-- every seed is "on conflict do nothing", inside do blocks.
--
-- WHAT UNDOES IT: drop the seven functions and the table coin_phrase_aliases;
-- set the three custom categories inactive. Coin records already logged stay.

do $pre$
begin
	if to_regprocedure('public.coin_log_transaction(text, text, numeric, numeric, text)') is null
		or to_regprocedure('public._coin_full_staff()') is null or to_regprocedure('public._coin_staff()') is null then
		raise exception '0298 cannot apply: coin_log_transaction or the coin staff gates are missing. Apply 0244 and 0251 first.';
	end if;
end
$pre$;

create table if not exists public.coin_phrase_aliases (
	id uuid primary key default gen_random_uuid(),
	phrase text not null check (phrase ~ '^[a-z0-9]+( [a-z0-9]+)*$' and char_length(phrase) between 1 and 120),
	kind text not null check (kind in ('award', 'fine', 'purchase')),
	category_id text not null references public.coin_categories (id) on update cascade,
	amount numeric(12, 2) check (amount is null or (amount > 0 and amount <= 1000)),
	source text not null default 'voice' check (source in ('seed', 'voice', 'staff')),
	uses integer not null default 0,
	last_used_at timestamptz,
	created_by text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	constraint coin_phrase_aliases_one unique (phrase, kind)
);
alter table public.coin_phrase_aliases enable row level security;
revoke all on table public.coin_phrase_aliases from public, anon, authenticated, service_role;

do $seed$
declare
	v_custom integer;
	v_seeded integer;
begin
	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label,
		 formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes)
	values
		('custom_award', 'Custom Award', 'award', 'core', 'variable', null, null, null, null, null, null, null, null,
		 true, true, 299, 'Ledger 0432: an award his words did not match to a category; the reason is his words.'),
		('custom_fine', 'Custom Fine', 'fine', 'core', 'variable', null, null, null, null, null, null, null, null,
		 true, true, 199, 'Ledger 0432: a fine his words did not match to a category; the reason is his words.'),
		('custom_purchase', 'Custom Purchase', 'purchase', 'core', 'variable', null, null, null, null, null, null, null, null,
		 true, true, 399, 'Ledger 0432: a purchase his words did not match to an item; the reason is his words.')
	on conflict (id) do nothing;
	get diagnostics v_custom = row_count;

	insert into public.coin_phrase_aliases (phrase, kind, category_id, amount, source, created_by)
	select s.phrase, c.kind, c.id, null, 'seed', 'system'
	from (values
		('phone', 'off_task_device_use'), ('phone out', 'off_task_device_use'), ('on his phone', 'off_task_device_use'),
		('on her phone', 'off_task_device_use'), ('games', 'off_task_device_use'), ('playing games', 'off_task_device_use'),
		('gaming', 'off_task_device_use'), ('off task', 'off_task_device_use'), ('device', 'off_task_device_use'),
		('eating', 'eating_violation'), ('eating in class', 'eating_violation'), ('food', 'eating_violation'), ('snack', 'eating_violation'),
		('profanity', 'classroom_standards_violation'), ('swearing', 'classroom_standards_violation'),
		('cursing', 'classroom_standards_violation'), ('bad language', 'classroom_standards_violation'),
		('disruptive', 'disruptive_behavior'), ('disruption', 'disruptive_behavior'), ('messing around', 'disruptive_behavior'),
		('goofing off', 'disruptive_behavior'), ('horseplay', 'disruptive_behavior'),
		('left without permission', 'leaving_without_permission'), ('leaving without permission', 'leaving_without_permission'),
		('long bathroom break', 'long_bathroom_break'), ('bathroom', 'long_bathroom_break'),
		('safety glasses', 'shop_safety_violation'), ('no safety glasses', 'shop_safety_violation'), ('shop safety', 'shop_safety_violation'),
		('did not clean up', 'shop_not_cleaned_up'), ('shop not cleaned up', 'shop_not_cleaned_up'), ('left a mess', 'shop_not_cleaned_up'),
		('printer not reset', 'printer_not_reset'), ('unauthorized printing', 'unauthorized_printing'),
		('printed without permission', 'unauthorized_printing'), ('stole coins', 'coin_theft'), ('coin theft', 'coin_theft'),
		('correct answer', 'correct_answer_in_class'), ('right answer', 'correct_answer_in_class'),
		('answered correctly', 'correct_answer_in_class'), ('above and beyond', 'above_and_beyond'),
		('competition', 'competition_winnings'), ('won the competition', 'competition_winnings'),
		('eating pass', 'eating_pass'), ('song request', 'song_request')
	) as s(phrase, category_id)
	join public.coin_categories c on c.id = s.category_id
	where c.active and c.loggable and c.kind in ('award', 'fine', 'purchase') and c.pricing_model <> 'formula'
	on conflict (phrase, kind) do nothing;
	get diagnostics v_seeded = row_count;
	raise notice '0298: % custom categories added, % everyday phrases seeded (amounts left to the categories)', v_custom, v_seeded;
end
$seed$;

-- Words as the alias table keeps them: lowercase letters and digits, single spaces.
create or replace function public._coin_phrase(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
	select nullif(left(btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', ' ', 'g')), 120), '');
$$;
revoke all on function public._coin_phrase(text) from public, anon, authenticated, service_role;

create or replace function public.coin_voice_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can log IDEA Coin transactions.';
	end if;
	return jsonb_build_object(
		'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'kind', c.kind,
			'pricing_model', c.pricing_model, 'amount', c.amount, 'min_amount', c.min_amount, 'max_amount', c.max_amount)
			order by c.sort_order, c.id)
			from public.coin_categories c
			where c.active and c.loggable and c.kind in ('award', 'fine', 'purchase')
				and c.pricing_model in ('flat', 'range', 'variable') and c.id <> 'extra_credit'), '[]'::jsonb),
		'aliases', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'phrase', a.phrase, 'kind', a.kind,
			'category_id', a.category_id, 'amount', a.amount) order by char_length(a.phrase) desc, a.phrase)
			from public.coin_phrase_aliases a
			join public.coin_categories c on c.id = a.category_id and c.active and c.loggable), '[]'::jsonb));
end;
$$;
revoke all on function public.coin_voice_catalog() from public, anon, authenticated, service_role;
grant execute on function public.coin_voice_catalog() to authenticated;

create or replace function public.coin_voice_log(
	p_email text,
	p_category_id text,
	p_amount numeric default null,
	p_note text default null,
	p_phrase text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cat public.coin_categories;
	v_phrase text := public._coin_phrase(p_phrase);
	v_result jsonb;
	v_alias jsonb := null;
	v_prev numeric;
	v_row public.coin_phrase_aliases;
begin
	if not public._coin_staff() then
		raise exception 'Only coin staff can log IDEA Coin transactions.';
	end if;
	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null or v_cat.kind not in ('award', 'fine', 'purchase') then
		raise exception 'Unknown coin category "%".', p_category_id;
	end if;
	v_result := public.coin_log_transaction(p_email, p_category_id,
		case when v_cat.pricing_model = 'flat' then null else p_amount end, null, p_note);
	if coalesce((v_result ->> 'ok')::boolean, false) and v_phrase is not null and public._coin_full_staff() then
		select * into v_row from public.coin_phrase_aliases where phrase = v_phrase and kind = v_cat.kind for update;
		v_prev := v_row.amount;
		if v_cat.pricing_model <> 'flat' and p_amount is not null and p_amount > 0 then
			insert into public.coin_phrase_aliases (phrase, kind, category_id, amount, source, created_by, uses, last_used_at)
			values (v_phrase, v_cat.kind, v_cat.id, round(p_amount, 2), 'voice', public.current_user_email(), 1, now())
			on conflict (phrase, kind) do update
				set category_id = excluded.category_id, amount = excluded.amount, uses = public.coin_phrase_aliases.uses + 1,
					last_used_at = now(), updated_at = now();
			v_alias := jsonb_build_object('phrase', v_phrase, 'amount', round(p_amount, 2), 'previous_amount', v_prev,
				'saved', v_row.id is null, 'changed', v_row.id is not null and v_prev is distinct from round(p_amount, 2));
		elsif v_row.id is not null then
			update public.coin_phrase_aliases set uses = uses + 1, last_used_at = now() where id = v_row.id;
		end if;
	end if;
	return v_result || jsonb_build_object('category', v_cat.name) ||
		case when v_alias is null then '{}'::jsonb else jsonb_build_object('phrase', v_alias) end;
end;
$$;
revoke all on function public.coin_voice_log(text, text, numeric, text, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_voice_log(text, text, numeric, text, text) to authenticated;

create or replace function public.coin_alias_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can see the coin phrases.';
	end if;
	return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'phrase', a.phrase, 'kind', a.kind,
		'category_id', a.category_id, 'category', c.name, 'pricing_model', c.pricing_model, 'category_amount', c.amount,
		'amount', a.amount, 'source', a.source, 'uses', a.uses, 'last_used_at', a.last_used_at, 'created_at', a.created_at)
		order by a.last_used_at desc nulls last, a.phrase)
		from public.coin_phrase_aliases a join public.coin_categories c on c.id = a.category_id), '[]'::jsonb);
end;
$$;
revoke all on function public.coin_alias_list() from public, anon, authenticated, service_role;
grant execute on function public.coin_alias_list() to authenticated;

create or replace function public.coin_alias_set_amount(p_id uuid, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.coin_phrase_aliases;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change the coin phrases.';
	end if;
	if p_amount is not null and (p_amount <= 0 or p_amount > 1000) then
		return jsonb_build_object('ok', false, 'reason', 'amount');
	end if;
	select * into v from public.coin_phrase_aliases where id = p_id for update;
	if v.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	update public.coin_phrase_aliases set amount = round(p_amount, 2), source = case when source = 'seed' then 'staff' else source end,
		updated_at = now() where id = p_id;
	return jsonb_build_object('ok', true, 'id', p_id, 'amount', round(p_amount, 2), 'previous_amount', v.amount);
end;
$$;
revoke all on function public.coin_alias_set_amount(uuid, numeric) from public, anon, authenticated, service_role;
grant execute on function public.coin_alias_set_amount(uuid, numeric) to authenticated;

create or replace function public.coin_alias_promote(p_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v public.coin_phrase_aliases;
	v_name text := nullif(btrim(coalesce(p_name, '')), '');
	v_id text;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can make a phrase an official category.';
	end if;
	select * into v from public.coin_phrase_aliases where id = p_id for update;
	if v.id is null then
		return jsonb_build_object('ok', false, 'reason', 'not_found');
	end if;
	if v.amount is null or v.amount <> trunc(v.amount) then
		return jsonb_build_object('ok', false, 'reason', 'needs_whole_amount');
	end if;
	if v_name is null or char_length(v_name) > 80 then
		return jsonb_build_object('ok', false, 'reason', 'name');
	end if;
	v_id := left(regexp_replace(lower(v_name), '[^a-z0-9]+', '_', 'g'), 60);
	v_id := btrim(v_id, '_');
	if v_id = '' or exists (select 1 from public.coin_categories where id = v_id) then
		return jsonb_build_object('ok', false, 'reason', 'name_taken');
	end if;
	insert into public.coin_categories (id, name, kind, scope, pricing_model, amount, loggable, active, sort_order, notes)
	values (v_id, v_name, v.kind, 'core', 'flat', v.amount::integer, true, true,
		case v.kind when 'fine' then 150 when 'award' then 250 else 350 end,
		'Made official from the spoken phrase "' || v.phrase || '" (ledger 0432).');
	update public.coin_phrase_aliases set category_id = v_id, amount = null, source = 'staff', updated_at = now() where id = p_id;
	return jsonb_build_object('ok', true, 'category_id', v_id, 'name', v_name, 'amount', v.amount);
end;
$$;
revoke all on function public.coin_alias_promote(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.coin_alias_promote(uuid, text) to authenticated;

create or replace function public.coin_alias_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_n integer;
begin
	if not public._coin_full_staff() then
		raise exception 'Only a full coin admin can change the coin phrases.';
	end if;
	delete from public.coin_phrase_aliases where id = p_id;
	get diagnostics v_n = row_count;
	return jsonb_build_object('ok', v_n = 1, 'deleted', v_n);
end;
$$;
revoke all on function public.coin_alias_delete(uuid) from public, anon, authenticated, service_role;
grant execute on function public.coin_alias_delete(uuid) to authenticated;

-- SAVED REQUESTS FOR THE NEW TOOLS (ledger 0432), beside the first fifty,
-- so the nightly replay checks their routes and a run on Haiku can be scored
-- against them. Inserted once each, keyed on the normalized words.
do $evals$
declare
	v_n integer;
begin
	if to_regclass('public.connector_evals') is null or to_regprocedure('public._connector_said_norm(text)') is null then
		raise notice '0298: no saved request list on this database; none added';
		return;
	end if;
	insert into public.connector_evals (seq, said, said_norm, level, must_happen, proof, expected_path, source, created_by)
	select (select coalesce(max(seq), 0) from public.connector_evals) + v.n, v.said, public._connector_said_norm(v.said), v.level, v.must, v.proof, v.path, 'seed', 'ledger 0432'
	from (values
		(1, 'Fine Daniel R, phone out', 'undo', 'One Off-Task Device Use fine at its set amount, reason "phone out", in one call', 'coin_transactions row for that Daniel only, the set amount, that reason', array['coin_transact']::text[]),
		(2, 'Give Mateo 10 coins for hitting a sick trick shot', 'undo', 'One Custom Award of 10 with his words as the reason; the phrase is saved at 10', 'coin_transactions custom_award 10; coin_phrase_aliases row at 10', array['coin_transact']::text[]),
		(3, 'Give Leo coins for hitting a sick trick shot', 'undo', 'Uses the saved 10 for the phrase, one call', 'coin_transactions custom_award 10 for Leo', array['coin_transact']::text[]),
		(4, 'Give Mateo coins for fixing the bandsaw guard', 'refuse', 'Asks how many coins; writes nothing', 'No coin_transactions row and no phrase before he answers', array['coin_transact']::text[]),
		(5, 'Leo bought an eating pass', 'undo', 'One Eating Pass purchase at its listed price', 'coin_transactions eating_pass row for Leo', array['coin_transact']::text[]),
		(6, 'Mark those 22 reports as spam', 'undo', 'One call moves every named report to spam, with one undo', 'app_feedback status spam for exactly those ids; one connector_audit row', array['list_site_feedback', 'mark_feedback']::text[]),
		(7, 'Resolve every new Armory incident from version 0.3.3', 'undo', 'One call resolves every new incident from 0.3.3 and no other', 'armory_app_incidents status resolved for exactly those', array['mark_feedback']::text[]),
		(8, 'Any new Armory incidents?', 'read', 'The open incidents with counts by status and version', 'Matches armory_app_incidents_admin_list', array['list_armory_reports']::text[]),
		(9, 'Read the newest Armory slow pass report', 'read', 'The whole report, events, phase timings and log lines', 'Matches the report JSON of that incident', array['list_armory_reports', 'read_armory_incident']::text[]),
		(10, 'Show me the Block 2 roster', 'read', 'The roster, first and last names', 'Matches classroom_section_roster', array['class_roster']::text[]),
		(11, 'What can''t the connector do yet?', 'read', 'The open gaps', 'Matches connector_gaps with status open', array['list_gaps']::text[]),
		(12, 'Who should I fine for feedback spam?', 'read', 'The ready fines with their evidence; nothing is fined', 'No coin_transactions row', array['site_call:app_feedback_spam_review']::text[])
	) as v(n, said, level, must, proof, path)
	on conflict (said_norm) do nothing;
	get diagnostics v_n = row_count;
	raise notice '0298: % saved requests added for the new tools', v_n;
end
$evals$;

do $post$
declare
	f text;
begin
	foreach f in array array['public.coin_voice_catalog()', 'public.coin_voice_log(text, text, numeric, text, text)',
		'public.coin_alias_list()', 'public.coin_alias_set_amount(uuid, numeric)', 'public.coin_alias_promote(uuid, text)',
		'public.coin_alias_delete(uuid)']
	loop
		if has_function_privilege('anon', f, 'execute') then
			raise exception '0298 self-check failed: % is executable by anon.', f;
		end if;
	end loop;
	if has_function_privilege('authenticated', 'public._coin_phrase(text)', 'execute') then
		raise exception '0298 self-check failed: the phrase helper is executable by a client.';
	end if;
	if has_table_privilege('authenticated', 'public.coin_phrase_aliases', 'select') then
		raise exception '0298 self-check failed: the phrase table is readable by a client.';
	end if;
end
$post$;
