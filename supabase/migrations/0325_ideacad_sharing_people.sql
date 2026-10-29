-- 0325_ideacad_sharing_people.sql
--
-- IDEACAD SHARING YOU CAN PICK, SEE AND CONFIRM (ledger 0470, report 155bba3d,
-- a student: "sharing sucks. theres no confirmation and typing manually sucks.
-- just pickl and share. simple. smooth experience. and ensure many users per
-- file").
--
-- WHAT WAS THERE. 0217's ideacad_share_direct_document grants ONE typed
-- address at a time (owner only, any account that has signed in, any number of
-- grants per model: the key is (document_id, grantee_email) and nothing caps
-- it), 0205's ideacad_unshare_document removes one, and 0205's
-- ideacad_document_grants returns the grant rows with their addresses. The
-- launch page called the first two from one email box and called nothing that
-- listed who already had the model.
--
-- WHAT THIS ADDS, three functions and two private helpers. NOTHING EXISTING
-- CHANGES: no table, no policy, no signature, no body. Sharing still lands in
-- ideacad_grants through 0217's and 0205's own functions, called per person.
--
--   ideacad_share_people(document, query)   the picker's directory
--   ideacad_direct_document_access(document) who has this model
--   ideacad_set_direct_document_access(document, changes)
--                                           share, change and remove many
--                                           people in one call, with an undo
--
-- WHAT A STUDENT MAY SEARCH, AND WHY THAT IS THE MINIMUM (the decision this
-- file carries, written into docs/history/ideacad-sharing-0470.md too):
--
--   * ONLY WHILE SHARING THEIR OWN MODEL. The directory takes the document and
--     answers only its owner, so it is not a general people search: a student
--     reaches it by opening Share on a model that is theirs, and nobody else
--     can call it for that model.
--   * ONLY BOSCO TECH ACCOUNTS THAT HAVE SIGNED IN (boscotech.net and
--     boscotech.edu). A visitor account is never listed; a typed address still
--     shares with any signed-in account, exactly as 0217 always allowed.
--   * TWO LETTERS FIRST, TWELVE RESULTS AT MOST, teammates then classmates then
--     the rest of the school, so the list is a pick rather than a directory.
--   * A NAME AND A PICTURE, NEVER AN ADDRESS. The directory and the access
--     list return the name a person shows, their picture, Staff or not, how
--     they relate to the caller and their access to this model. No email
--     leaves either function; a person is named by an opaque key (their
--     account id, already present in every uploaded picture's path).
--   * A CHOSEN IDENTITY REPLACES THE ACCOUNT IDENTITY COMPLETELY (CLAUDE.md).
--     The shown name is the chosen display name, else the account name. A
--     person with a chosen name is found by THAT name or by their full
--     address typed exactly, never by their account name or a part of their
--     address, so a search cannot reveal who is behind a chosen name. The
--     Google photo is shown only for a person who chose neither a name nor a
--     picture.
--
-- PROBING REVEALS NOTHING. A document that does not exist and one that is not
-- yours answer the same sentence from all three functions. A typed address
-- that has never signed in answers 0217's own sentence, so this file adds no
-- question an owner could not already ask.
--
-- DEPLOY ORDERING: none. Every function is new; the client degrades on
-- PGRST202 alone and says so in one sentence.
--
-- WHAT UNDOES IT, a person's paste:
--   drop function if exists public.ideacad_set_direct_document_access(uuid, jsonb),
--     public.ideacad_direct_document_access(uuid),
--     public.ideacad_share_people(uuid, text),
--     public._ideacad_share_person_json(uuid, text, text, timestamptz),
--     public._ideacad_share_circle(text);
-- Grants made through the new function are ordinary ideacad_grants rows and
-- stay, exactly as if each had been typed into the old box.

do $pre$
begin
	if to_regprocedure('public.ideacad_share_direct_document(uuid, text, text)') is null then
		raise exception '0325 cannot apply: ideacad_share_direct_document does not exist. Apply 0217 first.';
	end if;
	if to_regprocedure('public.ideacad_unshare_document(uuid, text)') is null then
		raise exception '0325 cannot apply: ideacad_unshare_document does not exist. Apply 0205 first.';
	end if;
	if to_regclass('public.classroom_team_members') is null then
		raise exception '0325 cannot apply: classroom_team_members does not exist. Apply 0223 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. THE CALLER'S CIRCLE: who is a teammate (2) and who is a classmate (1).
--
--    A teammate shares a team in a draw that is showing to the class right
--    now (0223's own visibility rule, _classroom_team_set_visible) in a class
--    both are actively enrolled in. A classmate is actively enrolled in a
--    class the caller is actively enrolled in, or is the teacher of record of
--    one, or is a student in a class the caller is the teacher of record of.
--    Teacher of record, never classroom_manages_section: an admin manages
--    every section, which would make the whole school "in your class".
--
--    Set-returning and computed once per call, so the directory ranks every
--    candidate against one set rather than asking per row.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_share_circle(p_email text)
returns table (email text, relation integer)
language sql
stable
security definer
set search_path = ''
as $circle$
	with me as (select lower(btrim(coalesce(p_email, ''))) as e),
	mine as (
		select ce.section_id from public.classroom_enrollments ce, me
		where ce.student_email = me.e and ce.active
		union
		select s.id from public.classroom_sections s, me where s.teacher_email = me.e
	),
	mates as (
		select ce.student_email as email, 1 as relation
		from public.classroom_enrollments ce
		where ce.active and ce.section_id in (select section_id from mine)
		union
		select s.teacher_email, 1 from public.classroom_sections s
		where s.id in (select section_id from mine)
	),
	team as (
		select b.student_email as email, 2 as relation
		from me
		join public.classroom_team_members a on a.student_email = me.e
		join public.classroom_team_members b on b.team_id = a.team_id and b.team_set_id = a.team_set_id
		join public.classroom_team_sets ts on ts.id = a.team_set_id
		where public._classroom_team_set_visible(ts.id)
			and exists (select 1 from public.classroom_enrollments x
				where x.section_id = ts.section_id and x.student_email = me.e and x.active)
			and exists (select 1 from public.classroom_enrollments y
				where y.section_id = ts.section_id and y.student_email = b.student_email and y.active)
	)
	select u.email, max(u.relation)::integer
	from (select * from mates union all select * from team) u, me
	where u.email <> me.e
	group by u.email;
$circle$;

-- ---------------------------------------------------------------------------
-- 2. ONE PERSON, AS A SHARING SURFACE SHOWS THEM. The one statement of the
--    identity rule above, called by the directory and the access list alike,
--    so the two cannot disagree about a name or a picture.
--
--    p_user_id null is a grant whose account no longer exists (0205's grants
--    have no key to auth.users). There is no chosen identity to protect, so
--    the row says what it is in words and keeps no name.
-- ---------------------------------------------------------------------------

create or replace function public._ideacad_share_person_json(
	p_user_id uuid,
	p_email text,
	p_role text,
	p_granted_at timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $person$
	select case when p.id is null then jsonb_build_object(
		'key', 'grant:' || md5(lower(btrim(coalesce(p_email, '')))),
		'name', 'An account that no longer signs in',
		'avatar', null, 'avatarUrl', null, 'staff', false,
		'role', p_role, 'grantedAt', p_granted_at)
	else jsonb_build_object(
		'key', p.id::text,
		'name', coalesce(
			nullif(regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g'), ''),
			nullif(regexp_replace(coalesce(p.full_name, ''), '^\s+|\s+$', '', 'g'), ''),
			split_part(lower(p.email), '@', 1)),
		'avatar', p.avatar,
		'avatarUrl', case
			when p.avatar is null
				and nullif(regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g'), '') is null
			then p.avatar_url end,
		'staff', public.role_for_email(p.email) = 'teacher',
		'role', p_role, 'grantedAt', p_granted_at)
	end
	from (select 1) one
	left join public.profiles p on p.id = p_user_id;
$person$;

-- ---------------------------------------------------------------------------
-- 3. THE PICKER'S DIRECTORY.
--
--    An empty query answers the caller's teammates only (at most twelve), so
--    the picker can suggest the people a student most often shares with the
--    moment the box takes focus. Anything shorter than two letters otherwise
--    answers nothing.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_share_people(p_document_id uuid, p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $people$
declare
	v_me text := public.current_user_email();
	v_q text := lower(regexp_replace(coalesce(p_query, ''), '^\s+|\s+$', '', 'g'));
	v_like text;
begin
	if coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	if not exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id and d.model_format = 'solid-v1'
			and d.student_email = v_me and d.deleted_at is null
	) then
		raise exception 'You can only share your own document.';
	end if;
	if v_q <> '' and char_length(regexp_replace(v_q, '\s', '', 'g')) < 2 then
		return '[]'::jsonb;
	end if;
	v_like := '%' || replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
	return coalesce((
		select jsonb_agg((r.person - 'role' - 'grantedAt') || jsonb_build_object(
				'relation', case r.relation when 2 then 'teammate' when 1 then 'classmate' else 'school' end,
				'access', r.access)
			order by r.relation desc, r.starts desc, r.person->>'name', r.person->>'key')
		from (
			select public._ideacad_share_person_json(p.id, p.email, null, null) as person,
				coalesce(c.relation, 0) as relation,
				g.role as access,
				(lower(x.shown) like v_q || '%' or lower(p.email) like v_q || '%') as starts
			from public.profiles p
			cross join lateral (
				select coalesce(
					nullif(regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g'), ''),
					nullif(regexp_replace(coalesce(p.full_name, ''), '^\s+|\s+$', '', 'g'), ''),
					split_part(lower(p.email), '@', 1)) as shown,
					nullif(regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g'), '') is not null as chosen
			) x
			left join public._ideacad_share_circle(v_me) c on c.email = lower(p.email)
			left join public.ideacad_grants g on g.document_id = p_document_id and g.grantee_email = lower(p.email)
			where p.email is not null
				and lower(p.email) <> v_me
				and (lower(p.email) like '%@boscotech.net' or lower(p.email) like '%@boscotech.edu')
				and (
					(v_q = '' and c.relation = 2)
					or (v_q <> '' and (
						lower(x.shown) like v_like
						or lower(p.email) = v_q
						or (not x.chosen and lower(p.email) like replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%')
					))
				)
			order by 2 desc, 4 desc, x.shown, p.id
			limit 12
		) r), '[]'::jsonb);
end
$people$;

-- ---------------------------------------------------------------------------
-- 4. WHO HAS THIS MODEL. The owner, and a teacher of record of the
--    assignment it is linked to (0216's _ideacad_direct_manager, the reach
--    0205's ideacad_document_grants already gives a manager), read the whole
--    list; only the owner may change it, which canChange says.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_direct_document_access(p_document_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $access$
declare
	v_me text := public.current_user_email();
	d public.ideacad_documents;
	v_found boolean;
	v_owner boolean;
begin
	if coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id and model_format = 'solid-v1';
	v_found := found;
	v_owner := v_found and d.student_email = v_me;
	if not coalesce(v_owner, false) and not (v_found and public._ideacad_direct_manager(d.id)) then
		raise exception 'That document does not exist.';
	end if;
	return jsonb_build_object(
		'ok', true,
		'canChange', v_owner and d.deleted_at is null,
		'count', (select count(*) from public.ideacad_grants g where g.document_id = d.id),
		'people', coalesce((
			select jsonb_agg(x.person order by x.person->>'name', x.person->>'key')
			from (
				select public._ideacad_share_person_json(u.id, g.grantee_email, g.role, g.granted_at) as person
				from public.ideacad_grants g
				left join auth.users u on lower(u.email) = g.grantee_email
				where g.document_id = d.id
			) x), '[]'::jsonb)
	);
end
$access$;

-- ---------------------------------------------------------------------------
-- 5. SHARE, CHANGE AND REMOVE MANY PEOPLE IN ONE CALL.
--
--    p_changes is a list of {key | email, role}, role one of viewer, editor
--    or none (none removes). A key is a person key from the directory or the
--    access list; an email is an address typed by hand. At most 100 per call;
--    there is no cap on how many people a model is shared with.
--
--    EVERY ROW GOES THROUGH THE SINGLE-ROW FUNCTION, so every rule (owner
--    only, not trashed, not yourself, an account that has signed in) is still
--    0217's and 0205's and is stated nowhere here. One round trip, one
--    transaction, a per-row handler so one refusal never hides whether the
--    rest landed (database.md, Refusals): the answer is {total, succeeded,
--    refused, results, undo, access}.
--
--    UNDO IS THE INVERSE CHANGE LIST, computed from what each person held
--    before, for exactly the rows that changed. Handing it back to this same
--    function puts every one of them back; a second undo of an undo puts the
--    change back again.
--
--    The same person twice in one call (a key and their typed address) is one
--    person: the list is resolved to addresses, deduplicated keeping the last
--    instruction, and acted on in address order.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_set_direct_document_access(p_document_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $setaccess$
declare
	v_me text := public.current_user_email();
	d public.ideacad_documents;
	v_item jsonb;
	v_index integer;
	v_key text;
	v_role text;
	v_email text;
	v_uid uuid;
	v_before text;
	v_plan jsonb := '{}'::jsonb;
	v_results jsonb := '[]'::jsonb;
	v_undo jsonb := '[]'::jsonb;
	v_ok integer := 0;
	v_refused integer := 0;
	r record;
begin
	if coalesce(v_me, '') = '' then
		raise exception 'You must be signed in.';
	end if;
	select * into d from public.ideacad_documents where id = p_document_id;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> v_me then
		raise exception 'You can only share your own document.';
	end if;
	if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) = 0 then
		raise exception 'Choose who to share with.';
	end if;
	if jsonb_array_length(p_changes) > 100 then
		raise exception 'Share with at most 100 people at a time.';
	end if;

	for v_item, v_index in select e.value, e.ordinality::integer from jsonb_array_elements(p_changes) with ordinality e loop
		v_role := case when jsonb_typeof(v_item) = 'object' then v_item->>'role' end;
		v_key := case when jsonb_typeof(v_item) = 'object' then nullif(btrim(coalesce(v_item->>'key', '')), '') end;
		v_email := null; v_uid := null;
		if v_role is null or v_role not in ('viewer', 'editor', 'none') then
			v_results := v_results || jsonb_build_object('index', v_index - 1, 'ok', false,
				'reason', 'Choose Can view, Can edit or Remove.');
			v_refused := v_refused + 1;
			continue;
		end if;
		if v_key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
			select u.id, lower(u.email) into v_uid, v_email from auth.users u where u.id = v_key::uuid;
		elsif v_key like 'grant:%' then
			select g.grantee_email into v_email from public.ideacad_grants g
			where g.document_id = d.id and md5(g.grantee_email) = substr(v_key, 7);
		elsif v_key is null and jsonb_typeof(v_item->'email') = 'string' then
			v_email := lower(btrim(v_item->>'email'));
			select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
		end if;
		if coalesce(v_email, '') = '' then
			v_results := v_results || jsonb_build_object('index', v_index - 1, 'ok', false,
				'reason', case when v_key is null
					then 'Choose the email address of someone who has signed in.'
					else 'That person is not available to share with.' end);
			v_refused := v_refused + 1;
			continue;
		end if;
		-- Keyed by address, so a later instruction for the same person replaces
		-- an earlier one rather than acting twice.
		v_plan := (v_plan - v_email) || jsonb_build_object(v_email,
			jsonb_build_object('idx', v_index - 1, 'role', v_role, 'uid', v_uid));
	end loop;

	for r in select p.key as email, (p.value->>'idx')::integer as idx, p.value->>'role' as role,
			nullif(p.value->>'uid', '')::uuid as uid
		from jsonb_each(v_plan) p order by p.key loop
		select g.role into v_before from public.ideacad_grants g
		where g.document_id = d.id and g.grantee_email = r.email;
		begin
			if r.role = 'none' then
				-- 0205's removal is quiet about a grant that is not there; this
				-- function is not, so an owner never reads "removed" for nothing.
				-- 0205 re-checks ownership, but not the trash; 0217's share does.
				if d.deleted_at is not null then
					raise exception 'Restore the document from the trash before sharing it.';
				end if;
				if v_before is not null then
					perform public.ideacad_unshare_document(d.id, r.email);
				end if;
			else
				perform public.ideacad_share_direct_document(d.id, r.email, r.role);
			end if;
			v_results := v_results || (
				public._ideacad_share_person_json(r.uid, r.email, nullif(r.role, 'none'), null)
				- 'grantedAt' - 'avatar' - 'avatarUrl' - 'staff'
				|| jsonb_build_object('index', r.idx, 'ok', true, 'before', v_before,
					'changed', v_before is distinct from nullif(r.role, 'none')));
			v_ok := v_ok + 1;
			if v_before is distinct from nullif(r.role, 'none') then
				v_undo := v_undo || jsonb_build_object(
					'key', coalesce(r.uid::text, 'grant:' || md5(r.email)),
					'role', coalesce(v_before, 'none'));
			end if;
		exception when others then
			v_results := v_results || jsonb_build_object('index', r.idx, 'ok', false, 'reason', sqlerrm);
			v_refused := v_refused + 1;
		end;
	end loop;

	return jsonb_build_object(
		'ok', true,
		'total', jsonb_array_length(p_changes),
		'succeeded', v_ok,
		'refused', v_refused,
		'results', (select coalesce(jsonb_agg(x order by (x->>'index')::integer), '[]'::jsonb) from jsonb_array_elements(v_results) x),
		'undo', v_undo,
		'access', public.ideacad_direct_document_access(d.id)
	);
end
$setaccess$;

-- ---------------------------------------------------------------------------
-- 6. THE GRANTS, in 0166's shape: every revoke names the roles, and each
--    function is granted back to exactly who calls it. The two helpers are
--    reached only from SECURITY DEFINER bodies, as the owner, so no client
--    role holds them.
-- ---------------------------------------------------------------------------

revoke all on function
	public._ideacad_share_circle(text),
	public._ideacad_share_person_json(uuid, text, text, timestamptz),
	public.ideacad_share_people(uuid, text),
	public.ideacad_direct_document_access(uuid),
	public.ideacad_set_direct_document_access(uuid, jsonb)
	from public, anon, authenticated, service_role;

grant execute on function
	public.ideacad_share_people(uuid, text),
	public.ideacad_direct_document_access(uuid),
	public.ideacad_set_direct_document_access(uuid, jsonb)
	to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. SELF-CHECK over this file's own names: nothing is open to anon, the
--    helpers are closed to authenticated, the three entry points are open to
--    it, and each has exactly one form.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_fn text;
begin
	foreach v_fn in array array[
		'public._ideacad_share_circle(text)',
		'public._ideacad_share_person_json(uuid, text, text, timestamptz)',
		'public.ideacad_share_people(uuid, text)',
		'public.ideacad_direct_document_access(uuid)',
		'public.ideacad_set_direct_document_access(uuid, jsonb)'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0325: % is executable by anon.', v_fn;
		end if;
	end loop;
	foreach v_fn in array array[
		'public._ideacad_share_circle(text)',
		'public._ideacad_share_person_json(uuid, text, text, timestamptz)'
	] loop
		if has_function_privilege('authenticated', v_fn, 'execute') then
			raise exception '0325: % is executable by authenticated.', v_fn;
		end if;
	end loop;
	foreach v_fn in array array[
		'public.ideacad_share_people(uuid, text)',
		'public.ideacad_direct_document_access(uuid)',
		'public.ideacad_set_direct_document_access(uuid, jsonb)'
	] loop
		if not has_function_privilege('authenticated', v_fn, 'execute') then
			raise exception '0325: % is not executable by authenticated.', v_fn;
		end if;
	end loop;
	foreach v_fn in array array['ideacad_share_people', 'ideacad_direct_document_access', 'ideacad_set_direct_document_access'] loop
		if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = v_fn) <> 1 then
			raise exception '0325: % does not have exactly one form.', v_fn;
		end if;
	end loop;
	raise notice '0325: ideacad sharing people, access list and batch share ready; % grants on file across % models.',
		(select count(*) from public.ideacad_grants),
		(select count(distinct document_id) from public.ideacad_grants);
end
$check$;
