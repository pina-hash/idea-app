-- 0127_app_feedback_console_anonymous.sql
-- The triage console's read, over a table that can now hold an authorless row.
--
-- WHY THIS EXISTS AT ALL. 0126 made an anonymous report writable and said, in
-- its own header, that giving such a row a name on screen was the console's
-- bundle rather than its own. This is that bundle. Without it the console has
-- no way to tell an anonymous report from a signed-in one except by both
-- identity fields coming back empty, and no way to show the optional contact
-- 0126 collects -- which would make that field a promise the app never keeps.
--
-- THREE CHANGES, ALL TO ONE FUNCTION, AND NONE OF THEM TO A SIGNED-IN ROW:
--
--   1. `anonymous`, stated rather than inferred. A reader guessing from two
--      empty strings would also call a signed-in report whose profile row is
--      missing anonymous, and "we do not know who this is" and "nobody signed
--      this" are different sentences to put in front of an admin.
--   2. `contact`, the free-form string an anonymous reporter may leave. It is
--      NOT an identity: nothing verified it, nobody signed in to type it, and
--      the console renders it as what somebody typed. Returning it is what
--      makes the field honest; the console's job is to not dress it up.
--   3. An authorless row's submitter_name comes back NULL rather than the
--      empty string today's expression produces (split_part('', '@', 1)), so a
--      console can branch on absence instead of on falsiness. Keyed on
--      `f.user_id is null` alone, so a signed-in row's two identity fields are
--      byte-for-byte what they were.
--
-- WHAT IS DELIBERATELY NOT RETURNED: reporter_hash. It is a salted digest of an
-- address and it is here to be counted, not read. There is no screen it
-- improves, and a column that reaches a console is a column that reaches an
-- export, a paste and a screenshot. Widening a payload is a disclosure
-- decision; this one is declined.
--
-- SIGNATURE UNCHANGED -- (text, integer) in, jsonb out -- so `create or
-- replace` is correct here and the signature trap does not apply: no parameter
-- is added, so no old arity can survive as a second overload. Re-applying the
-- file is ordinary and lands the same function.
--
-- Apply manually in the Supabase SQL editor, after 0126.
--
-- TO UNDO: re-apply 0085's definition of app_feedback_admin_list, which is the
-- text this replaces. Nothing else in this file changes any table, grant or
-- policy, so that restores the pre-0127 behaviour exactly.

begin;

create or replace function public.app_feedback_admin_list(
	p_app text default null,
	p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_app text := nullif(btrim(coalesce(p_app, '')), '');
	v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can read the feedback queue.';
	end if;

	return coalesce((
		select jsonb_agg(row_to_json(t)::jsonb order by t.created_at desc)
		from (
			select f.id, f.app, f.context, f.kind, f.message, f.meta,
				f.status, f.created_at, f.reviewed_at, f.reviewed_by,
				-- Stated, not inferred. See the header.
				(f.user_id is null) as anonymous,
				-- What somebody typed, never a verified identity.
				f.contact,
				case when f.user_id is null then null else
					coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(p.full_name), ''),
						split_part(coalesce(p.email, ''), '@', 1))
				end as submitter_name,
				case when f.user_id is null then null else p.email end as submitter_email
			from public.app_feedback f
			left join public.profiles p on p.id = f.user_id
			where v_app is null or f.app = v_app
			order by f.created_at desc
			limit v_limit
		) t
	), '[]'::jsonb);
end;
$$;

-- Restated with the definition, not because anything changed: `create or
-- replace` keeps the existing grants, and stating them here means a reader of
-- this file does not have to go and check 0085 to know who may call it.
revoke all on function public.app_feedback_admin_list(text, integer) from public;
grant execute on function public.app_feedback_admin_list(text, integer) to authenticated;

commit;
