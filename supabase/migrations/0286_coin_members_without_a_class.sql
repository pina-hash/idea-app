-- 0286_coin_members_without_a_class.sql
--
-- Feedback 18451adf. The IDEA Coin economy answered "not in the economy" to
-- anyone who was not an active, non-manager enrollment in a class with the
-- economy switched on, so a signed-in student between classes, a student whose
-- class has the economy off, or a visitor could see a balance page that did
-- nothing. The economy now works for any signed-in student or visitor, enrolled
-- or not.
--
-- HOW, AND WHY IT IS ONE FUNCTION. Every student-facing gate (the student seam,
-- the market, transfers, stocks, the balance page) asks one private function,
-- _coin_economy_enrollments(), whether the CALLER is in the economy. This file
-- changes only that function: it still returns every enrollment exactly as
-- before, and adds ONE extra row, for the caller themselves, when the caller
-- has a profile with the role student or visitor, is not an admin, and has no
-- enrollment row already. That row has no section (section_id is null).
--
--   - A GATE ABOUT THE CALLER (where student_email = the caller) now passes.
--   - A THING THAT NEEDS A CLASS cannot match: every class-scoped use joins on
--     section_id, and null never equals a section. Buying hall pass time,
--     class payday and a teacher's class lists are unchanged. Applying for a
--     class job is the one gate that asked only "is this person in the economy",
--     so coin_role_self_apply below is re-stated to ask for a class as well.
--   - NOBODY ELSE SEES THE MEMBER. The row exists only in the member's own
--     session (it is built from current_user_email()), so a roster, a payday,
--     the public ledger and the weekly autopay, which run as someone else or
--     with no session, read exactly what they read before. Teachers and admins
--     are never members, as before.
--
-- WHAT IT DOES NOT DO: it gives nobody coins. A member earns through the market,
-- contracts, sends from a friend and tournaments, the ways that need no class.
--
-- DEPLOY ORDER: none; the app reads the same answers. IDEMPOTENT: create or
-- replace, grants unchanged.
--
-- WHAT UNDOES IT: re-paste 0239's _coin_economy_enrollments() definition and
-- 0247's coin_role_self_apply definition.

do $pre$
begin
	if to_regprocedure('public._coin_economy_enrollments()') is null then
		raise exception '0286 cannot apply: _coin_economy_enrollments() does not exist. Apply 0239 first.';
	end if;
	if to_regprocedure('public._admin_is_email(text)') is null then
		raise exception '0286 cannot apply: _admin_is_email(text) does not exist. Apply 0138 first.';
	end if;
	if to_regprocedure('public.current_user_email()') is null then
		raise exception '0286 cannot apply: current_user_email() does not exist. Apply 0067 first.';
	end if;
end
$pre$;

create or replace function public._coin_economy_enrollments()
returns table (student_email text, section_id uuid, display_name text, enrolled_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
	with enrolled as (
		select e.student_email, e.section_id, e.display_name, e.created_at
		from public.classroom_enrollments e
		join public.classroom_sections s on s.id = e.section_id
		where e.active and s.active and s.coin_economy_on
			and not public._classroom_manages_section_email(e.section_id, e.student_email)
	)
	select x.student_email, x.section_id, x.display_name, x.created_at from enrolled x
	union all
	select public.current_user_email(), null::uuid,
		coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), '')), null::timestamptz
	from public.profiles p
	where public.current_user_email() <> ''
		and lower(btrim(coalesce(p.email, ''))) = public.current_user_email()
		and p.role in ('student', 'visitor')
		and not public._admin_is_email(public.current_user_email())
		and not exists (select 1 from enrolled y where y.student_email = public.current_user_email());
$$;
revoke all on function public._coin_economy_enrollments() from public, anon, authenticated, service_role;

-- A CLASS JOB NEEDS A CLASS. coin_role_self_apply is 0247's body with one
-- change: the gate asks for an enrollment WITH a section, so a member with no
-- class is still refused ('no_section') instead of filing an application that
-- belongs to no class. Probed against the file before this change: a member's
-- application was accepted with a null section.
create or replace function public.coin_role_self_apply(
	p_role_id text,
	p_answers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_role public.coin_role_definitions;
	v_section uuid;
	v_id uuid;
begin
	if v_email is null or v_email = '' then
		return jsonb_build_object('ok', false, 'reason', 'not_signed_in');
	end if;
	if not exists (select 1 from public._coin_economy_enrollments() x where x.student_email = v_email and x.section_id is not null) then
		return jsonb_build_object('ok', false, 'reason', 'no_section');
	end if;
	select * into v_role from public.coin_role_definitions where id = p_role_id;
	if v_role.id is null or not v_role.active then
		return jsonb_build_object('ok', false, 'reason', 'unknown_role');
	end if;
	v_section := public._coin_role_apply_section(v_email, v_role.id);
	if public._coin_role_class_cap(v_role.id, v_section) = 0 then
		return jsonb_build_object('ok', false, 'reason', 'role_off');
	end if;
	if exists (select 1 from public.coin_role_holders where student_email = v_email and role_id = v_role.id
		and revoked_at is null and (expires_at is null or expires_at > now())) then
		return jsonb_build_object('ok', false, 'reason', 'already_holds_role');
	end if;
	if exists (select 1 from public.coin_role_applications where student_email = v_email and role_id = v_role.id
		and status = 'pending') then
		return jsonb_build_object('ok', false, 'reason', 'already_applied');
	end if;
	v_id := public._coin_role_insert_application(v_email, v_role, v_section, p_answers, v_email);
	return jsonb_build_object('ok', true, 'application_id', v_id);
end;
$$;
revoke all on function public.coin_role_self_apply(text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.coin_role_self_apply(text, jsonb) to authenticated;

do $post$
begin
	if has_function_privilege('anon', 'public._coin_economy_enrollments()', 'execute')
		or has_function_privilege('authenticated', 'public._coin_economy_enrollments()', 'execute') then
		raise exception '0286 self-check failed: _coin_economy_enrollments() is executable by a client role.';
	end if;
	raise notice '0286: % student or visitor profiles are now able to use the economy without a class',
		(select count(*) from public.profiles p where p.role in ('student', 'visitor'));
end
$post$;
