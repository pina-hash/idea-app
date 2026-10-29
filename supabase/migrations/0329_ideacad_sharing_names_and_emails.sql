-- 0329_ideacad_sharing_names_and_emails.sql
--
-- IDEACAD SHARING SHOWS A NAME AND AN EMAIL, EVERYWHERE (ledger 0471, Mr.
-- Pina's decision on 2026-10-28, docs/decisions/entries/72-*, slug
-- ideacad-sharing-shows-name-and-email). His words, answering the two
-- questions ledger 0470 left him:
--
--   "Idea can search is fine. You can already search for anyone using the
--   Gmail. Since it's an organization, you can search by anyone, for anyone by
--   name or by their email. So that is completely fine. I think it should show
--   name and email in any case. I really don't know why you would hide the
--   email. Everyone knows everyone's email already."
--
-- WHAT 0325 DID, AND WHAT THIS FILE CHANGES ABOUT IT. 0325's header carries
-- the rule lane 0470 chose to follow CLAUDE.md "A chosen public identity
-- replaces the account identity completely": the picker's directory and the
-- access list sent a name and a picture and never an address, and a person
-- with a chosen display name was found only by that name or by their whole
-- address typed exactly. 0325 is an applied record and is not edited; THIS
-- header is where its notes are corrected:
--
--   * EVERY PERSON CARRIES THEIR EMAIL. `_ideacad_share_person_json`, the one
--     statement of how a sharing surface shows a person, adds `email`, so the
--     directory, the access list and the batch share's results all carry it
--     at once. A grant whose account no longer exists carries the address the
--     grant was made to (0205's ideacad_document_grants already returned it to
--     the same readers).
--   * SEARCH MATCHES A NAME OR AN EMAIL, PART OF EITHER, FOR EVERYONE.
--     `ideacad_share_people` matches any part of the shown name, the account
--     name or the address, whether or not the person chose a display name.
--   * THE LAUNCH CARD'S OWNER LINE HAS A NAME. `ideacad_direct_documents`
--     (0217's body, word for word but for one key) adds `ownerName` on a model
--     that is not yours, from the same person function, beside the
--     `ownerEmail` it always carried.
--
-- WHAT DOES NOT MOVE. The directory still answers only the owner of the model
-- it is asked about, still lists only Bosco Tech accounts that have signed in
-- (a visitor is never listed), still needs two letters (an empty box suggests
-- teammates only) and still returns twelve at most. The access list still
-- answers "does not exist" to anyone but the owner and a teacher of record.
-- A CHOSEN PICTURE STILL REPLACES THE GOOGLE PHOTO: `avatarUrl` is sent only
-- for a person who chose neither a name nor a picture, exactly as in 0325.
-- No other surface's payload widens: this is the IdeaCAD sharing exception
-- to the chosen-identity rule and nothing else.
--
-- DEPLOY ORDERING: none. No signature changes; three bodies are replaced and
-- every new key is one a deployed client ignores.
--
-- WHAT UNDOES IT, a person's paste: re-run 0325's sections 2 and 3 and 0217's
-- ideacad_direct_documents, with their grant lines. Nothing is stored by this
-- file.

do $pre$
begin
	if to_regprocedure('public._ideacad_share_person_json(uuid, text, text, timestamptz)') is null
		or to_regprocedure('public.ideacad_share_people(uuid, text)') is null then
		raise exception '0329 cannot apply: the 0325 sharing functions do not exist. Apply 0325 first.';
	end if;
	if to_regprocedure('public.ideacad_direct_documents()') is null then
		raise exception '0329 cannot apply: ideacad_direct_documents does not exist. Apply 0217 first.';
	end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. ONE PERSON, AS A SHARING SURFACE SHOWS THEM: 0325's body plus `email`.
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
		'email', nullif(lower(btrim(coalesce(p_email, ''))), ''),
		'avatar', null, 'avatarUrl', null, 'staff', false,
		'role', p_role, 'grantedAt', p_granted_at)
	else jsonb_build_object(
		'key', p.id::text,
		'name', coalesce(
			nullif(regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g'), ''),
			nullif(regexp_replace(coalesce(p.full_name, ''), '^\s+|\s+$', '', 'g'), ''),
			split_part(lower(p.email), '@', 1)),
		'email', lower(p.email),
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
-- 2. THE PICKER'S DIRECTORY: 0325's body, matching any part of the shown
--    name, the account name or the address, for everyone. The owner check,
--    the school-only filter, the floor, the ranking and the cap are 0325's.
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
	v_esc text;
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
	v_esc := replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_');
	v_like := '%' || v_esc || '%';
	return coalesce((
		select jsonb_agg((r.person - 'role' - 'grantedAt') || jsonb_build_object(
				'relation', case r.relation when 2 then 'teammate' when 1 then 'classmate' else 'school' end,
				'access', r.access)
			order by r.relation desc, r.starts desc, r.person->>'name', r.person->>'key')
		from (
			select public._ideacad_share_person_json(p.id, p.email, null, null) as person,
				coalesce(c.relation, 0) as relation,
				g.role as access,
				(lower(x.shown) like v_esc || '%' or lower(x.account) like v_esc || '%'
					or lower(p.email) like v_esc || '%') as starts
			from public.profiles p
			cross join lateral (
				select coalesce(
					nullif(regexp_replace(coalesce(p.display_name, ''), '^\s+|\s+$', '', 'g'), ''),
					nullif(regexp_replace(coalesce(p.full_name, ''), '^\s+|\s+$', '', 'g'), ''),
					split_part(lower(p.email), '@', 1)) as shown,
					regexp_replace(coalesce(p.full_name, ''), '^\s+|\s+$', '', 'g') as account
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
						or lower(x.account) like v_like
						or lower(p.email) like v_like
					))
				)
			order by 2 desc, 4 desc, x.shown, p.id
			limit 12
		) r), '[]'::jsonb);
end
$people$;

-- ---------------------------------------------------------------------------
-- 3. THE LAUNCH PAGE'S LIST: 0217's body, word for word but for `ownerName`
--    on a model that is not yours, named by the same person function the
--    sharing surfaces use.
-- ---------------------------------------------------------------------------

create or replace function public.ideacad_direct_documents()
returns jsonb language sql stable security definer set search_path = ''
as $fgdirectlist$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id',d.id,'title',d.title,'itemId',d.item_id,'ownerEmail',d.student_email,
		'ownerName',case when d.student_email = public.current_user_email() then null
			else public._ideacad_share_person_json(
				(select p.id from public.profiles p where lower(p.email) = d.student_email order by p.id limit 1),
				d.student_email, null, null)->>'name' end,
		'isOwn',d.student_email = public.current_user_email(),'updatedAt',d.updated_at,'createdAt',d.created_at,
		'archivedAt',d.archived_at,'modelFormat',d.model_format,'format',c.features->>'format',
		'canWrite',public._ideacad_direct_can_write(d.id),
		'canArchive',(d.item_id is null and d.student_email = public.current_user_email()) or public._ideacad_direct_manager(d.id),
		'canTrash',d.item_id is null and d.student_email = public.current_user_email(),
		'role',case when d.student_email = public.current_user_email() then 'owner'
			when public._ideacad_direct_manager(d.id) then 'manager'
			else public._ideacad_document_role(d.id) end,
		'bodyCount',coalesce(jsonb_array_length(c.features->'bodies'),0),
		'featureCount',coalesce(jsonb_array_length(c.features->'features'),0),
		'folderId',case when d.student_email = public.current_user_email() then d.folder_id end,
		'tags',case when d.student_email = public.current_user_email() then to_jsonb(d.tags) else '[]'::jsonb end,
		'thumbnail',d.thumbnail
	) order by d.updated_at desc,d.id),'[]'::jsonb)
	from public.ideacad_documents d
	left join public.ideacad_concepts c on c.id = d.active_concept_id and c.document_id = d.id and c.deleted_at is null
	where d.model_format = 'solid-v1' and d.deleted_at is null and public._ideacad_can_read_document(d.id);
$fgdirectlist$;

-- ---------------------------------------------------------------------------
-- 4. THE GRANTS, restated in 0166's shape over exactly what this file
--    replaced: the helper to no client role, the two entry points to
--    authenticated and service_role, as 0325 and 0217 granted them.
-- ---------------------------------------------------------------------------

revoke all on function
	public._ideacad_share_person_json(uuid, text, text, timestamptz),
	public.ideacad_share_people(uuid, text),
	public.ideacad_direct_documents()
	from public, anon, authenticated, service_role;

grant execute on function
	public.ideacad_share_people(uuid, text),
	public.ideacad_direct_documents()
	to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. SELF-CHECK over this file's own names.
-- ---------------------------------------------------------------------------

do $check$
declare
	v_fn text;
begin
	foreach v_fn in array array[
		'public._ideacad_share_person_json(uuid, text, text, timestamptz)',
		'public.ideacad_share_people(uuid, text)',
		'public.ideacad_direct_documents()'
	] loop
		if has_function_privilege('anon', v_fn, 'execute') then
			raise exception '0329: % is executable by anon.', v_fn;
		end if;
	end loop;
	if has_function_privilege('authenticated', 'public._ideacad_share_person_json(uuid, text, text, timestamptz)', 'execute') then
		raise exception '0329: _ideacad_share_person_json is executable by authenticated.';
	end if;
	if not has_function_privilege('authenticated', 'public.ideacad_share_people(uuid, text)', 'execute')
		or not has_function_privilege('authenticated', 'public.ideacad_direct_documents()', 'execute') then
		raise exception '0329: a sharing entry point is not executable by authenticated.';
	end if;
	foreach v_fn in array array['_ideacad_share_person_json', 'ideacad_share_people', 'ideacad_direct_documents'] loop
		if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			where n.nspname = 'public' and p.proname = v_fn) <> 1 then
			raise exception '0329: % does not have exactly one form.', v_fn;
		end if;
	end loop;
	raise notice '0329: IdeaCAD sharing now shows a name and an email; % grants on file across % models.',
		(select count(*) from public.ideacad_grants),
		(select count(distinct document_id) from public.ideacad_grants);
end
$check$;
