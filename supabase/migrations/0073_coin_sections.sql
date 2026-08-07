-- 0073_coin_sections.sql
-- Coin sections: the foundation the roles/contracts work builds on next, plus
-- a real fix for "logging Weekly Wage means one email at a time, 10-20 times."
--
-- ---------------------------------------------------------------------------
-- THE RELATIONSHIP BETWEEN A COIN SECTION AND src/lib/curriculum.ts
-- ---------------------------------------------------------------------------
--
-- curriculum.ts is already the canonical list of what classes exist
-- (IDEA100-1/2/3, 209H-Sophomore/Junior/Senior, ...). Duplicating that list
-- into a second, DB-side table would give the two a chance to drift the
-- moment someone edits one and forgets the other. So coin_sections does NOT
-- store a title, course, year, or instructor -- it stores only what the coin
-- economy needs that curriculum.ts has no business knowing about: a COLOR
-- (the legacy Sheets tool had per-section colors) and an optional NOTE.
--
-- `coin_sections.id` is normalized the same way a curriculum Section.id
-- already looks (lowercased, trimmed) so that in the common case it IS one --
-- the coin-desk UI's "from curriculum" picker inserts a section keyed on the
-- exact Section.id from curriculum.ts, and the display name is then resolved
-- CLIENT-SIDE via sectionById() rather than stored here. This mirrors the
-- 0003 profiles.section_id decision exactly (free-form text, not a FK, so
-- curriculum.ts can change in code with no migration) and extends it to a
-- second, independent concern: a coin section can exist for an id curriculum
-- has never heard of (a combined class, a one-off group), in which case the
-- optional `label` column is what renders instead of a curriculum lookup.
--
-- Assignment (which student is in which section) is EMAIL-KEYED, the same
-- pattern coin_transactions and coin_wage_tiers already use (0070) and the
-- reason the balance pre-provisioning in /admin works before a student has
-- ever signed in: profiles.section_id is only ever populated for a student
-- who has signed in and self-selected a class, so it cannot be what bulk
-- coin logging targets. coin_section_students is therefore its own table,
-- independent of profiles.section_id, settable by an admin regardless of
-- login status, exactly like a coin balance can be attached to an email that
-- has never signed in.
--
-- ---------------------------------------------------------------------------
-- THE BULK LOGGING RPC
-- ---------------------------------------------------------------------------
--
-- coin_bulk_log_section is ONE round trip, ONE server-side transaction that
-- logs a category against every student in a section -- not a client-side
-- loop calling coin_log_transaction N times. A client-side loop has two real
-- problems: it can be interrupted partway (a closed tab, a dropped network
-- call) leaving an AMBIGUOUS state where nobody can tell how many of the 20
-- students actually got logged, and every one of those N round trips is a
-- chance for the admin to lose track of which succeeded. Moving the loop
-- server-side removes both: the whole batch is one request, and the response
-- is a STRUCTURED per-student result array (mirroring the {ok:false,
-- reason:...} convention every other refusal in this schema already uses),
-- so a debt-lockout refusal on student #7 never obscures whether the other
-- 19 succeeded.
--
-- It does NOT reimplement any business rule. Per student, it calls the
-- EXISTING coin_log_transaction (the same function /coin-desk's single-
-- student flow calls, and the same one coin_admin_adjust_balance already
-- wraps in 0070) -- so the debt lockout, calendar-boundary caps, and Eating
-- Pass strike/revoke logic all apply exactly as they do for a single-student
-- entry, with zero duplicated logic to drift out of sync. SECURITY DEFINER
-- nesting does not change who is_admin()/current_user_email() resolve to --
-- both read auth.uid() from the session's JWT claims, not the executing
-- role -- so the inner call is authorized as the SAME admin who called the
-- outer function, exactly as coin_admin_adjust_balance already relies on.
--
-- SCOPE, DELIBERATELY NARROW: only 'flat', 'range', and 'variable' pricing
-- models are bulk-loggable (Weekly Wage, the actual convenience gap, is
-- flat). 'per_unit' (Extra Credit, Text Printing) and 'formula' (Perfect
-- Score, Pay Raise, Property Damage, 3D Printing) categories need a REAL
-- per-student input -- a quantity, points, grams, hours -- that cannot be one
-- uniform number typed once for a whole section. Building a per-student
-- input grid for those is real, separate work for a later pass; bulk-logging
-- them today would either silently apply the wrong quantity to everyone or
-- require a UI this migration does not build. Extra Credit is named
-- explicitly (rather than relying on its per_unit exclusion alone) because
-- it is the category the prompt calls out by name.
--
-- Each per-student call is wrapped in its own exception handler so a
-- genuinely unexpected error for one student (not just the structured
-- refusals coin_log_transaction already returns as jsonb) still can't abort
-- the rest of the section -- it becomes one more {ok:false, reason:'error'}
-- row in the results array instead of aborting the whole batch.
--
-- Apply manually in the Supabase SQL editor, after 0072.

-- ===========================================================================
-- 1. Sections
-- ===========================================================================
create table if not exists public.coin_sections (
	-- Normalized like every other email/id column in this schema so a
	-- curriculum Section.id (already lowercase-hyphenated) always matches
	-- byte-for-byte, and a custom id typed with different casing still lands
	-- consistently.
	id text primary key check (id = lower(btrim(id)) and id <> '' and char_length(id) <= 100),
	-- Display override, used only when `id` has no curriculum.ts counterpart
	-- (a combined class, a one-off group). Null is the common case: the
	-- coin-desk UI resolves the name from curriculum.ts's sectionById(id).
	label text check (label is null or char_length(label) <= 200),
	-- Legacy per-section color, carried forward from the old Sheets tool.
	-- Not brand identity (unlike the app-launcher's uniform-accent rule) --
	-- this is an admin utility tool, and a color per class is purely a visual
	-- aid for telling rosters apart at a glance.
	color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
	-- Archived sections drop out of the "log against a section" picker and
	-- the "add students" curriculum dropdown, but keep their roster and
	-- transaction history -- soft state, never a delete.
	active boolean not null default true,
	note text check (note is null or char_length(note) <= 200),
	created_by text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

revoke all on public.coin_sections from anon, authenticated;
grant select on public.coin_sections to authenticated;
alter table public.coin_sections enable row level security;

drop policy if exists "admins read coin sections" on public.coin_sections;
create policy "admins read coin sections"
	on public.coin_sections
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: only coin_admin_upsert_section writes.

-- ===========================================================================
-- 2. Section assignment -- email-keyed, exactly like coin_transactions and
--    coin_wage_tiers, so an admin can place a student in a section before
--    that student has ever signed in (profiles.section_id cannot do this: it
--    is only ever populated by a signed-in student's own self-selection).
--    A student belongs to at most one coin section at a time; reassigning
--    overwrites, per the class model this mirrors (one class per student).
-- ===========================================================================
create table if not exists public.coin_section_students (
	student_email text primary key check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	section_id text not null references public.coin_sections (id) on delete cascade,
	assigned_by text not null,
	assigned_at timestamptz not null default now()
);

create index if not exists coin_section_students_section_idx
	on public.coin_section_students (section_id, student_email);

revoke all on public.coin_section_students from anon, authenticated;
grant select on public.coin_section_students to authenticated;
alter table public.coin_section_students enable row level security;

drop policy if exists "admins read coin section students" on public.coin_section_students;
create policy "admins read coin section students"
	on public.coin_section_students
	for select
	to authenticated
	using (public.is_admin());

-- No insert/update/delete policies: only the definer RPCs below write.

-- ===========================================================================
-- 3. Managing sections. Admin-only (is_admin(), the 0070 write boundary for
--    this whole economy), enforced inside the function.
-- ===========================================================================
create or replace function public.coin_admin_upsert_section(
	p_id text,
	p_label text default null,
	p_color text default null,
	p_active boolean default true,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id text := lower(nullif(btrim(coalesce(p_id, '')), ''));
	v_label text := nullif(btrim(coalesce(p_label, '')), '');
	v_color text := nullif(btrim(coalesce(p_color, '')), '');
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
	if not public.is_admin() then
		raise exception 'Only site admins can manage coin sections.';
	end if;
	if v_id is null then
		raise exception 'A section id is required -- a Section.id from src/lib/curriculum.ts for a real class, or a short custom id for a one-off group.';
	end if;
	if v_color is not null and v_color !~ '^#[0-9a-fA-F]{6}$' then
		raise exception 'Color must be a 6-digit hex value like #00FF41.';
	end if;

	insert into public.coin_sections (id, label, color, active, note, created_by)
	values (v_id, v_label, v_color, coalesce(p_active, true), v_note, public.current_user_email())
	on conflict (id) do update
		set label = excluded.label,
			color = excluded.color,
			active = excluded.active,
			note = excluded.note,
			updated_at = now();

	return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.coin_admin_upsert_section(text, text, text, boolean, text) from public;
grant execute on function public.coin_admin_upsert_section(text, text, text, boolean, text) to authenticated;

-- The section list for the coin-desk UI, with a live student count. Mirrors
-- admin_list()'s inline `where public.is_admin()` shape (0067): a non-admin
-- caller simply gets zero rows back rather than an exception, since this is
-- a plain read, not a write with something to refuse.
create or replace function public.coin_admin_list_sections()
returns table (
	id text,
	label text,
	color text,
	active boolean,
	note text,
	created_by text,
	created_at timestamptz,
	updated_at timestamptz,
	student_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
	select
		s.id, s.label, s.color, s.active, s.note, s.created_by, s.created_at, s.updated_at,
		count(cs.student_email) as student_count
	from public.coin_sections s
	left join public.coin_section_students cs on cs.section_id = s.id
	where public.is_admin()
	group by s.id, s.label, s.color, s.active, s.note, s.created_by, s.created_at, s.updated_at
	order by s.active desc, s.id;
$$;

revoke all on function public.coin_admin_list_sections() from public;
grant execute on function public.coin_admin_list_sections() to authenticated;

-- A section's roster, left-joined against profiles for a real name when the
-- student has signed in (the "profiles only has rows for students who have
-- actually logged in" doctrine already documented for the /coin-desk
-- typeahead -- a miss here just falls back to the bare email in the UI).
create or replace function public.coin_admin_list_section_students(p_section_id text)
returns table (
	student_email text,
	assigned_at timestamptz,
	display_name text,
	full_name text
)
language sql
stable
security definer
set search_path = ''
as $$
	select cs.student_email, cs.assigned_at, p.display_name, p.full_name
	from public.coin_section_students cs
	left join public.profiles p on lower(btrim(coalesce(p.email, ''))) = cs.student_email
	where public.is_admin() and cs.section_id = p_section_id
	order by coalesce(p.display_name, p.full_name, cs.student_email);
$$;

revoke all on function public.coin_admin_list_section_students(text) from public;
grant execute on function public.coin_admin_list_section_students(text) to authenticated;

-- Assign or unassign ONE student (p_section_id = null removes them). Kept
-- alongside the bulk version below for the roster panel's per-row "remove".
create or replace function public.coin_admin_set_student_section(
	p_email text,
	p_section_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_section text := lower(nullif(btrim(coalesce(p_section_id, '')), ''));
begin
	if not public.is_admin() then
		raise exception 'Only site admins can manage coin sections.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;

	if v_section is null then
		delete from public.coin_section_students where student_email = v_email;
		return jsonb_build_object('email', v_email, 'section_id', null);
	end if;

	if not exists (select 1 from public.coin_sections where id = v_section) then
		raise exception 'Unknown coin section "%".', v_section;
	end if;

	insert into public.coin_section_students (student_email, section_id, assigned_by)
	values (v_email, v_section, public.current_user_email())
	on conflict (student_email) do update
		set section_id = excluded.section_id,
			assigned_by = excluded.assigned_by,
			assigned_at = now();

	return jsonb_build_object('email', v_email, 'section_id', v_section);
end;
$$;

revoke all on function public.coin_admin_set_student_section(text, text) from public;
grant execute on function public.coin_admin_set_student_section(text, text) to authenticated;

-- Assign a whole pasted list of emails to a section in one call -- the same
-- "don't make the admin do this one at a time" reasoning driving the bulk
-- logger, applied to roster building. Invalid entries (no '@') are skipped
-- and reported, never silently dropped or allowed to abort the rest of the
-- list.
create or replace function public.coin_admin_assign_section_students(
	p_section_id text,
	p_emails text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_section text := lower(nullif(btrim(coalesce(p_section_id, '')), ''));
	v_raw text;
	v_email text;
	v_results jsonb := '[]'::jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can manage coin sections.';
	end if;
	if v_section is null then
		raise exception 'Choose a section.';
	end if;
	if not exists (select 1 from public.coin_sections where id = v_section) then
		raise exception 'Unknown coin section "%".', v_section;
	end if;

	foreach v_raw in array coalesce(p_emails, array[]::text[])
	loop
		v_email := lower(btrim(coalesce(v_raw, '')));
		if v_email = '' then
			continue;
		end if;
		if v_email not like '%@%' then
			v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_raw, 'ok', false, 'reason', 'invalid_email'));
			continue;
		end if;

		insert into public.coin_section_students (student_email, section_id, assigned_by)
		values (v_email, v_section, public.current_user_email())
		on conflict (student_email) do update
			set section_id = excluded.section_id,
				assigned_by = excluded.assigned_by,
				assigned_at = now();

		v_results := v_results || jsonb_build_array(jsonb_build_object('email', v_email, 'ok', true));
	end loop;

	return jsonb_build_object('section_id', v_section, 'results', v_results);
end;
$$;

revoke all on function public.coin_admin_assign_section_students(text, text[]) from public;
grant execute on function public.coin_admin_assign_section_students(text, text[]) to authenticated;

-- ===========================================================================
-- 4. Bulk logging. See the header for the full design rationale.
-- ===========================================================================
create or replace function public.coin_bulk_log_section(
	p_section_id text,
	p_category_id text,
	p_amount integer default null,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_section text := lower(nullif(btrim(coalesce(p_section_id, '')), ''));
	v_cat public.coin_categories;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_student record;
	v_call jsonb;
	v_entry jsonb;
	v_results jsonb := '[]'::jsonb;
	v_total integer := 0;
	v_succeeded integer := 0;
	v_refused integer := 0;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_section is null then
		raise exception 'Choose a section.';
	end if;
	if not exists (select 1 from public.coin_sections where id = v_section) then
		raise exception 'Unknown coin section "%".', v_section;
	end if;

	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null then
		raise exception 'Unknown coin category "%".', p_category_id;
	end if;
	if not v_cat.active or not v_cat.loggable then
		raise exception '"%" cannot be logged directly.', v_cat.name;
	end if;
	if v_cat.id = 'extra_credit' then
		raise exception 'Extra Credit needs a per-student point count; it cannot be bulk-logged yet.';
	end if;
	if v_cat.pricing_model not in ('flat', 'range', 'variable') then
		raise exception '"%" needs per-student input (%) and cannot be bulk-logged yet -- only flat, range, and variable (one amount applied uniformly) categories can be logged against a whole section.', v_cat.name, v_cat.pricing_model;
	end if;

	-- Shape validation up front, mirroring coin_log_transaction's own checks
	-- for these three pricing models. The amount and note are the SAME for
	-- every student in a bulk log, so a shape mistake (missing note,
	-- out-of-range amount) would fail identically for every row -- catching
	-- it once here means ONE clear error instead of the same refusal N times
	-- over in the results list.
	if v_cat.pricing_model = 'range' then
		if p_amount is null or p_amount < v_cat.min_amount or p_amount > v_cat.max_amount then
			raise exception '"%" needs an amount between %i¢ and %i¢.', v_cat.name, v_cat.min_amount, v_cat.max_amount;
		end if;
	elsif v_cat.pricing_model = 'variable' then
		if v_cat.kind = 'adjustment' then
			if p_amount is null or p_amount = 0 then
				raise exception 'A balance adjustment needs a non-zero amount.';
			end if;
			if v_note is null then
				raise exception 'A balance adjustment needs a note explaining why.';
			end if;
		else
			if p_amount is null or p_amount <= 0 then
				raise exception '"%" needs a positive amount.', v_cat.name;
			end if;
			if v_note is null then
				raise exception '"%" needs a note.', v_cat.name;
			end if;
		end if;
	end if;

	for v_student in
		select student_email from public.coin_section_students
		where section_id = v_section
		order by student_email
	loop
		v_total := v_total + 1;
		begin
			-- The EXISTING single-student RPC, nested. SECURITY DEFINER does
			-- not change what auth.uid()/current_user_email() resolve to (both
			-- read the session's JWT claims, not the executing role), so this
			-- inner call is authorized as the same admin who called us --
			-- exactly the pattern coin_admin_adjust_balance already relies on.
			v_call := public.coin_log_transaction(v_student.student_email, v_cat.id, p_amount, null, p_note);
		exception when others then
			-- A per-student failure, however unexpected, must never abort the
			-- rest of the section -- this is the entire point of moving the
			-- loop server-side: one round trip, one atomic write, but every
			-- student's own outcome is reported, never masked by whichever
			-- student happens to fail first.
			v_call := jsonb_build_object('ok', false, 'reason', 'error', 'message', sqlerrm);
		end;
		if coalesce((v_call ->> 'ok')::boolean, false) then
			v_succeeded := v_succeeded + 1;
		else
			v_refused := v_refused + 1;
		end if;
		v_entry := jsonb_build_object('email', v_student.student_email) || v_call;
		v_results := v_results || jsonb_build_array(v_entry);
	end loop;

	return jsonb_build_object(
		'ok', true,
		'section_id', v_section,
		'category_id', v_cat.id,
		'total', v_total,
		'succeeded', v_succeeded,
		'refused', v_refused,
		'results', v_results
	);
end;
$$;

revoke all on function public.coin_bulk_log_section(text, text, integer, text) from public;
grant execute on function public.coin_bulk_log_section(text, text, integer, text) to authenticated;
