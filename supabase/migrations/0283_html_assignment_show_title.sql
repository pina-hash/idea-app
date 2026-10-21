-- 0283_html_assignment_show_title.sql
--
-- Feedback 8812b4ba. A ported HTML assignment repeats its own title inside the
-- document, so the post's title banner above it is a duplicate. The page now
-- hides the post title for an HTML assignment by default; this adds the
-- per-post switch that turns it back on.
--
-- WHAT IT ADDS
--   1. classroom_html_assignments.show_title, boolean, default false. False is
--      the new behaviour (title hidden), so every existing row changes with
--      no backfill.
--   2. classroom_html_set_show_title(p_item_id, p_show), the one write. It
--      re-checks that the caller manages the item and takes no identity
--      parameter.
--
-- DEPLOY ORDER: either order. The page reads the column on its own rung and
-- falls back to "title hidden, no switch" when the column is not there yet.
--
-- WHAT UNDOES IT
--   drop function if exists public.classroom_html_set_show_title(uuid, boolean);
--   alter table public.classroom_html_assignments drop column if exists show_title;

do $pre$
begin
	if to_regclass('public.classroom_html_assignments') is null then
		raise exception '0283 cannot apply: classroom_html_assignments does not exist. Apply 0195 first.';
	end if;
	if to_regprocedure('public._classroom_manages_item(uuid)') is null then
		raise exception '0283 cannot apply: _classroom_manages_item(uuid) does not exist. Apply 0085 first.';
	end if;
end
$pre$;

alter table public.classroom_html_assignments
	add column if not exists show_title boolean not null default false;

drop function if exists public.classroom_html_set_show_title(uuid, boolean);

create function public.classroom_html_set_show_title(
	p_item_id uuid,
	p_show boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if p_show is null then
		raise exception 'Say whether the title is shown.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can change it.';
	end if;

	update public.classroom_html_assignments
		set show_title = p_show
		where item_id = p_item_id;
	if not found then
		raise exception 'That item is not an HTML assignment.';
	end if;

	return jsonb_build_object('ok', true, 'show_title', p_show);
end;
$$;

revoke all on function public.classroom_html_set_show_title(uuid, boolean)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_html_set_show_title(uuid, boolean) to authenticated;

do $post$
begin
	if not exists (select 1 from information_schema.columns
		where table_schema = 'public' and table_name = 'classroom_html_assignments'
			and column_name = 'show_title') then
		raise exception '0283 self-check failed: show_title column is missing.';
	end if;
	if has_function_privilege('anon', 'public.classroom_html_set_show_title(uuid, boolean)', 'execute') then
		raise exception '0283 self-check failed: anon can execute classroom_html_set_show_title.';
	end if;
	raise notice '0283: % HTML assignment rows, all default to title hidden',
		(select count(*) from public.classroom_html_assignments);
end
$post$;
