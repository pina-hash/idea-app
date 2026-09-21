-- 0217: IdeaCAD feature graph storage. The version 2 document envelope, and
-- the trash, folders, tags, rename, duplicate and thumbnail the launch page
-- needs, for DIRECT documents (0216's standalone exact-solid documents).
-- Ledger 0273, branch claude/optimistic-mayer-rcq01p. Applied by hand in the
-- Supabase SQL editor; this file does not record its own application.
--
-- WHAT THIS FILE IS FOR. The solid workspace's document is a FEATURE LIST now
-- (envelope format ideacad-solid-v2): every sketch, extrude, revolve, fillet,
-- mirror, pattern and reference plane is a recorded step with its parameters
-- and what it consumed, and editing a number replays the model from that step
-- forward. 0216's envelope validator refuses any format but ideacad-solid-v1,
-- so the first save from the new client would fail on every document. Section
-- 1 widens that one function to accept BOTH formats, and changes nothing about
-- what a version 1 save must look like.
--
-- BACKWARD COMPATIBILITY IS THE FIRST REQUIREMENT AND IT COSTS NO DATA CHANGE.
-- A document saved as bodies with no feature list opens exactly as it did: the
-- client upgrades it in memory to one 'body' feature per saved body, so it
-- renders identically and every body can still be pushed, blended, mirrored
-- and patterned. Its NEXT save carries the upgrade as ordinary history actions
-- diffed from the stored version 1 tree (set /format, insert /features, ...),
-- so 0216's action log replays across the boundary and an undo can cross back.
-- Nothing in this file rewrites a stored tree, and the deployed version 1
-- client keeps saving version 1 trees against the widened validator.
--
-- DEPLOY ORDER. Apply this file BEFORE the client that emits version 2 is
-- merged. Against 0216's validator a version 2 save raises 'This IdeaCAD model
-- format is not supported.' on the very first edit of every document. Applying
-- first is safe in the other direction because the validator still accepts
-- every version 1 save the deployed client makes.
--
-- WHAT ELSE IS HERE, AND WHY ONE FILE. The ledger permitted exactly one
-- migration, so the storage the launch page needs ships beside the validator:
--   2. A TRASH for direct documents: deleted_at / deleted_by, a thirty-day
--      window, and a REAL purge. All three are the OWNER's and all three are
--      refused for a document linked to an assignment. Decision 29
--      (docs/decisions/entries/29-*) says assignment work is archived and never
--      deleted, and this file keeps that exactly: a linked document has no
--      trash path and the preserve trigger still refuses its delete. What may
--      be thrown away is a student's OWN UNLINKED scratch model, which that
--      decision never covered and which until now could only accumulate.
--      Archive stays what 0214 and 0216 made it: reversible, read-only, still
--      listed. Trash is a different door: gone from the list, restorable for
--      thirty days, then purged by the next trash write or on demand.
--   3. FOLDERS (ideacad_folders, one owner each, a document sits in at most
--      one), TAGS on the document row, a RENAME that writes a history row
--      rather than editing the stored tree behind the log's back, DUPLICATE,
--      and a THUMBNAIL column the workspace fills after a save.
--
-- THE ROW'S FORMAT COLUMN DOES NOT MOVE. ideacad_documents.model_format stays
-- 'solid-v1' for a version 2 document. That column is the FAMILY discriminator
-- every 0216 predicate keys on (direct versus blade); the envelope's own
-- 'format' string says which version of the family the tree is in. A third
-- value there would mean touching every predicate for no new information.
--
-- THE PURGE GOES THROUGH THE PRESERVE TRIGGER, NOT AROUND IT. 0216's trigger
-- refuses every delete of a direct document. It now admits ONE shape: a row
-- that is in the trash, is not linked, and is being deleted by
-- ideacad_purge_direct_document or the expiry sweep, both of which say so
-- through a TRANSACTION-LOCAL setting (ideacad.purge) the trigger reads and
-- which they clear again before returning. A raw delete of a live document,
-- of a trashed LINKED document, or from any other path is refused as before.
-- The setting is read through coalesce, because an unset custom setting reads
-- as NULL and a NULL inside the trigger's condition would ADMIT the delete.
--
-- GRANTS FOLLOW 0166: every function revokes from public, anon and
-- authenticated BY NAME and grants back exactly who should hold it, because
-- this project's default privileges hand every new function a direct anon
-- grant that a revoke from public alone never touches. The folders table
-- likewise: revoke all, grant SELECT to authenticated, RLS on.
--
-- IDEMPOTENT. Every statement is create-or-replace, if-not-exists, or guarded
-- on the catalog; the self-check at the end raises on anything missing and
-- prints counts; a re-paste reports the same objects and changes no row.
--
-- UNDO, in order: drop the thirteen client functions and three private
-- helpers named in section 6; re-paste 0216's definitions of
-- _ideacad_direct_validate_model, _ideacad_direct_can_write,
-- _ideacad_direct_payload, ideacad_direct_documents,
-- ideacad_set_direct_document_archived, ideacad_link_direct_document,
-- ideacad_share_direct_document and _ideacad_preserve_direct_document; then
-- drop the five columns and the folders table. Dropping the columns discards
-- trash state, folder placement, tags and thumbnails; it discards no document
-- and no geometry. A document already purged is gone, which is what a purge is.

begin;

-- ---------------------------------------------------------------------------
-- 1. THE ENVELOPE VALIDATOR, WIDENED TO TWO FORMATS.
--
--    Version 1 is checked exactly as 0216 checked it, plus two optional body
--    fields both versions may carry (color, fixed). Version 2 adds the feature
--    list: an array of objects with a unique string id, a lower-case type
--    name, a name of at most 120 characters and an optional boolean
--    'suppressed'. That is a PERSISTENCE check and deliberately not a geometry
--    one: which types exist and what their parameters mean is the worker's
--    contract (src/lib/ideacad/solid/features), and a validator that listed
--    the types would refuse the next feature the workspace learns, in a
--    migration, for no gain. Sketches stay validated by 0216's own sketch
--    validator on both versions; a version 2 tree stores its sketches as
--    features and leaves that array empty.
-- ---------------------------------------------------------------------------
create or replace function public._ideacad_direct_validate_model(p_model jsonb)
returns void language plpgsql immutable security definer set search_path = ''
as $fgvalidate$
declare b jsonb; f jsonb; fmt text;
begin
	fmt := p_model->>'format';
	if jsonb_typeof(p_model) is distinct from 'object'
		or fmt is null or fmt not in ('ideacad-solid-v1','ideacad-solid-v2')
		or p_model->>'units' is distinct from 'in'
		or jsonb_typeof(p_model->'title') is distinct from 'string'
		or length(btrim(p_model->>'title')) not between 1 and 120
		or p_model->>'kernel' is distinct from 'remus-f7907f5-2.130.20'
		or jsonb_typeof(p_model->'bodies') is distinct from 'array'
		or jsonb_typeof(p_model->'sketches') is distinct from 'array'
		or jsonb_typeof(p_model->'addons') is distinct from 'object'
		or jsonb_typeof(p_model->'addons'->'ideaBlade') is distinct from 'boolean' then
		raise exception 'This IdeaCAD model format is not supported.';
	end if;
	for b in select value from jsonb_array_elements(p_model->'bodies') loop
		if jsonb_typeof(b) is distinct from 'object'
			or jsonb_typeof(b->'id') is distinct from 'string' or length(b->>'id') = 0
			or jsonb_typeof(b->'name') is distinct from 'string' or length(b->>'name') = 0
			or not (b ? 'materialId') or jsonb_typeof(b->'materialId') not in ('null','string')
			or b->>'role' is null or b->>'role' not in ('part','hex-core','collar','spin-bolt','blade')
			or (b ? 'topologyEpoch' and (jsonb_typeof(b->'topologyEpoch') is distinct from 'string' or b->>'topologyEpoch' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'))
			or jsonb_typeof(b->'artifact') is distinct from 'string'
			or b->>'artifact' !~ '^[0-9a-f]{64}$' then
			raise exception 'A body needs a stable ID and a BREP artifact reference.';
		end if;
		if b ? 'massG' and jsonb_typeof(b->'massG') <> 'null' then
			if jsonb_typeof(b->'massG') <> 'number' or (b->>'massG')::numeric < 0
				or (b->>'massG')::double precision in ('Infinity'::double precision,'NaN'::double precision) then
				raise exception 'Part mass must be a finite, nonnegative number.';
			end if;
			if jsonb_typeof(b->'massSource') is distinct from 'string' then raise exception 'Part mass needs its measurement source.'; end if;
		end if;
		if b ? 'massSource' and (jsonb_typeof(b->'massSource') is distinct from 'string' or b->>'massSource' not in ('measured','bambu-studio')) then
			raise exception 'Choose scale measurement or Bambu Studio estimate for part mass.';
		end if;
		if b ? 'color' and jsonb_typeof(b->'color') <> 'null'
			and (jsonb_typeof(b->'color') is distinct from 'string' or b->>'color' !~ '^#[0-9a-f]{6}$') then
			raise exception 'A body colour must be a six-digit hex colour.';
		end if;
		if b ? 'fixed' and jsonb_typeof(b->'fixed') is distinct from 'boolean' then
			raise exception 'A body is either fixed or not.';
		end if;
	end loop;
	if (select count(*) from jsonb_array_elements(p_model->'bodies')) <>
		(select count(distinct value->>'id') from jsonb_array_elements(p_model->'bodies')) then
		raise exception 'Body IDs must be unique.';
	end if;
	if fmt = 'ideacad-solid-v2' then
		if jsonb_typeof(p_model->'features') is distinct from 'array' then
			raise exception 'A version 2 document needs its feature list.';
		end if;
		for f in select value from jsonb_array_elements(p_model->'features') loop
			if jsonb_typeof(f) is distinct from 'object'
				or jsonb_typeof(f->'id') is distinct from 'string' or length(f->>'id') not between 1 and 80
				or jsonb_typeof(f->'type') is distinct from 'string' or f->>'type' !~ '^[a-z][a-z0-9-]{0,39}$'
				or jsonb_typeof(f->'name') is distinct from 'string' or length(f->>'name') > 120
				or (f ? 'suppressed' and jsonb_typeof(f->'suppressed') is distinct from 'boolean') then
				raise exception 'A feature needs a stable ID, a type and a name.';
			end if;
		end loop;
		if (select count(*) from jsonb_array_elements(p_model->'features')) <>
			(select count(distinct value->>'id') from jsonb_array_elements(p_model->'features')) then
			raise exception 'Feature IDs must be unique.';
		end if;
	elsif p_model ? 'features' then
		raise exception 'A version 1 document carries no feature list.';
	end if;
	perform public._ideacad_direct_validate_sketches(p_model);
end;
$fgvalidate$;

-- ---------------------------------------------------------------------------
-- 2. THE COLUMNS AND THE FOLDERS TABLE.
--
--    ideacad_folders comes first because folder_id references it. A folder
--    belongs to exactly one owner and is read through its own RLS policy, so a
--    shared document's folderId names a folder its reader cannot see; the
--    client renders an unknown folder as no folder. Deleting a folder sets
--    every document's folder_id to null (on delete set null) and deletes no
--    document: a folder is filing, not work, which is the same rule notebook
--    folders follow.
--
--    The thumbnail is a small data URL and is CHECKED on the column as well as
--    in its RPC, so no server-side path can store a document-sized string in a
--    row every chooser load reads. Tags are capped at twelve on the column for
--    the same reason.
-- ---------------------------------------------------------------------------
create table if not exists public.ideacad_folders (
	id uuid primary key default gen_random_uuid(),
	owner_email text not null,
	name text not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (owner_email, name)
);
do $fgfolders$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'public.ideacad_folders'::regclass and conname = 'ideacad_folders_name_check') then
		alter table public.ideacad_folders add constraint ideacad_folders_name_check check (length(btrim(name)) between 1 and 80 and name = btrim(name));
	end if;
end;
$fgfolders$;
drop trigger if exists ideacad_folders_touch on public.ideacad_folders;
create trigger ideacad_folders_touch before update on public.ideacad_folders
	for each row execute function public.touch_updated_at();
alter table public.ideacad_folders enable row level security;
drop policy if exists "owners read their ideacad folders" on public.ideacad_folders;
create policy "owners read their ideacad folders" on public.ideacad_folders
	for select to authenticated using (owner_email = public.current_user_email());
revoke all on table public.ideacad_folders from public, anon, authenticated;
grant select on table public.ideacad_folders to authenticated;
grant all on table public.ideacad_folders to service_role;

alter table public.ideacad_documents
	add column if not exists deleted_at timestamptz,
	add column if not exists deleted_by text,
	add column if not exists folder_id uuid references public.ideacad_folders(id) on delete set null,
	add column if not exists tags text[] not null default '{}',
	add column if not exists thumbnail text;
do $fgcolumns$
begin
	if not exists (select 1 from pg_constraint where conrelid = 'public.ideacad_documents'::regclass and conname = 'ideacad_documents_thumbnail_check') then
		alter table public.ideacad_documents add constraint ideacad_documents_thumbnail_check
			check (thumbnail is null or (length(thumbnail) <= 60000 and thumbnail ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));
	end if;
	if not exists (select 1 from pg_constraint where conrelid = 'public.ideacad_documents'::regclass and conname = 'ideacad_documents_tags_check') then
		alter table public.ideacad_documents add constraint ideacad_documents_tags_check check (cardinality(tags) <= 12);
	end if;
	if not exists (select 1 from pg_constraint where conrelid = 'public.ideacad_documents'::regclass and conname = 'ideacad_documents_trash_unlinked_check') then
		-- The trash is for unlinked direct documents only. The RPCs refuse a
		-- linked one; the constraint is what makes the refusal a property of
		-- the row rather than of whichever function was called.
		alter table public.ideacad_documents add constraint ideacad_documents_trash_unlinked_check
			check (deleted_at is null or (item_id is null and model_format = 'solid-v1'));
	end if;
end;
$fgcolumns$;
create index if not exists ideacad_documents_trashed_idx on public.ideacad_documents (deleted_at) where deleted_at is not null;
create index if not exists ideacad_documents_folder_idx on public.ideacad_documents (folder_id) where folder_id is not null;

-- ---------------------------------------------------------------------------
-- 3. THE TRASH.
-- ---------------------------------------------------------------------------
-- The window is written down once. The trash listing shows it as purgeAt and
-- the expiry sweep reads it, so the sentence on screen and the row that goes
-- cannot disagree.
create or replace function public._ideacad_trash_window()
returns interval language sql immutable set search_path = ''
as $fgwindow$ select interval '30 days'; $fgwindow$;

create or replace function public._ideacad_preserve_direct_document()
returns trigger language plpgsql security definer set search_path = ''
as $fgpreserve$
begin
	if old.model_format = 'solid-v1' then
		if old.deleted_at is not null and old.item_id is null
			and coalesce(current_setting('ideacad.purge', true), '') = 'allow' then
			return old;
		end if;
		if old.item_id is null then
			raise exception 'Move this model to the trash first. Only a trashed model can be removed, and only by its owner.';
		end if;
		raise exception 'This assignment has IdeaCAD documents. Archive the work instead of deleting it.';
	end if;
	return old;
end;
$fgpreserve$;
drop trigger if exists ideacad_preserve_direct_document on public.ideacad_documents;
create trigger ideacad_preserve_direct_document before delete on public.ideacad_documents
	for each row execute function public._ideacad_preserve_direct_document();

-- The lazy sweep. There is no cron on this project, so expiry is enforced by
-- the next trash write, restore, purge or trash listing, each of which calls
-- this first. It opens the trigger for the duration of its one delete and
-- closes it again before returning, so nothing later in the same transaction
-- inherits the licence.
create or replace function public._ideacad_purge_expired_direct_documents()
returns integer language plpgsql security definer set search_path = ''
as $fgexpire$
declare n integer;
begin
	perform set_config('ideacad.purge', 'allow', true);
	delete from public.ideacad_documents d
		where d.model_format = 'solid-v1' and d.item_id is null and d.deleted_at is not null
			and d.deleted_at < now() - public._ideacad_trash_window();
	get diagnostics n = row_count;
	perform set_config('ideacad.purge', '', true);
	return n;
end;
$fgexpire$;

create or replace function public.ideacad_trash_direct_document(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $fgtrash$
declare d public.ideacad_documents; e text := public.current_user_email(); swept integer;
begin
	if auth.uid() is null or coalesce(e, '') = '' then raise exception 'You must be signed in.'; end if;
	swept := public._ideacad_purge_expired_direct_documents();
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> e then raise exception 'That document does not exist.'; end if;
	if d.item_id is not null then raise exception 'This model is linked to an assignment, so it is kept. Archive it instead.'; end if;
	if d.deleted_at is null then
		update public.ideacad_documents set deleted_at = now(), deleted_by = e, updated_at = now() where id = d.id returning * into d;
	end if;
	return jsonb_build_object('ok', true, 'id', d.id, 'title', d.title, 'deletedAt', d.deleted_at,
		'purgeAt', d.deleted_at + public._ideacad_trash_window(), 'swept', swept);
end;
$fgtrash$;

create or replace function public.ideacad_restore_direct_document(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $fgrestore$
declare d public.ideacad_documents; e text := public.current_user_email();
begin
	if auth.uid() is null or coalesce(e, '') = '' then raise exception 'You must be signed in.'; end if;
	perform public._ideacad_purge_expired_direct_documents();
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> e then raise exception 'That document does not exist.'; end if;
	if d.deleted_at is not null then
		update public.ideacad_documents set deleted_at = null, deleted_by = null, updated_at = now() where id = d.id;
	end if;
	return public._ideacad_direct_payload(d.id);
end;
$fgrestore$;

create or replace function public.ideacad_purge_direct_document(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $fgpurge$
declare d public.ideacad_documents; e text := public.current_user_email();
begin
	if auth.uid() is null or coalesce(e, '') = '' then raise exception 'You must be signed in.'; end if;
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> e then raise exception 'That document does not exist.'; end if;
	if d.item_id is not null then raise exception 'This model is linked to an assignment, so it is kept. Archive it instead.'; end if;
	if d.deleted_at is null then raise exception 'Move this model to the trash first.'; end if;
	perform set_config('ideacad.purge', 'allow', true);
	delete from public.ideacad_documents where id = d.id;
	perform set_config('ideacad.purge', '', true);
	return jsonb_build_object('ok', true, 'purged', true, 'id', d.id, 'title', d.title);
end;
$fgpurge$;

create or replace function public.ideacad_direct_trash()
returns jsonb language plpgsql volatile security definer set search_path = ''
as $fgtrashlist$
declare e text := public.current_user_email();
begin
	if auth.uid() is null or coalesce(e, '') = '' then return '[]'::jsonb; end if;
	perform public._ideacad_purge_expired_direct_documents();
	return coalesce((select jsonb_agg(jsonb_build_object(
		'id', d.id, 'title', d.title, 'deletedAt', d.deleted_at,
		'purgeAt', d.deleted_at + public._ideacad_trash_window(),
		'updatedAt', d.updated_at, 'folderId', d.folder_id, 'tags', to_jsonb(d.tags), 'thumbnail', d.thumbnail,
		'bodyCount', coalesce(jsonb_array_length(c.features->'bodies'), 0),
		'featureCount', coalesce(jsonb_array_length(c.features->'features'), 0)
	) order by d.deleted_at desc, d.id)
	from public.ideacad_documents d
	left join public.ideacad_concepts c on c.id = d.active_concept_id and c.document_id = d.id and c.deleted_at is null
	where d.model_format = 'solid-v1' and d.student_email = e and d.deleted_at is not null), '[]'::jsonb);
end;
$fgtrashlist$;

-- 0216's write gate, with the trash term. A trashed document is read-only for
-- its owner and invisible to everyone else (below), so nothing can be typed
-- into a model that is about to be purged.
create or replace function public._ideacad_direct_can_write(p_document_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $fgdirectwrite$
	select exists (
		select 1 from public.ideacad_documents d
		where d.id = p_document_id and d.model_format = 'solid-v1' and d.archived_at is null and d.deleted_at is null
	)
	and (coalesce(public._ideacad_document_role(p_document_id) in ('owner','editor'), false)
		or public._ideacad_direct_manager(p_document_id));
$fgdirectwrite$;

-- 0216's payload, with one refusal added: a trashed document opens for its
-- owner only (the workspace shows it read-only with an In-the-trash label), and
-- answers 'does not exist' to a grantee, exactly as a document that was never
-- shared would. to_jsonb(d) carries the five new columns, less the two that are
-- the owner's own filing (tags, folder_id) for any other reader.
create or replace function public._ideacad_direct_payload(p_document_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $fgpayload$
declare d public.ideacad_documents; c public.ideacad_concepts; r text; hashes text[];
begin
	if not public._ideacad_can_read_document(p_document_id) then raise exception 'That document does not exist.'; end if;
	select * into d from public.ideacad_documents where id = p_document_id and model_format = 'solid-v1';
	if not found then raise exception 'This is a legacy IdeaCAD document.'; end if;
	if d.deleted_at is not null and d.student_email is distinct from public.current_user_email() then raise exception 'That document does not exist.'; end if;
	select * into c from public.ideacad_concepts where id = d.active_concept_id and document_id = d.id and deleted_at is null;
	if not found then raise exception 'The document has no active model.'; end if;
	r := public._ideacad_document_role(d.id);
	if r is distinct from 'owner' and public._ideacad_direct_manager(d.id) then r := 'manager'; end if;
	select array_agg(value->>'artifact') into hashes from jsonb_array_elements(c.features->'bodies');
	return jsonb_build_object('document',case when d.student_email = public.current_user_email() then to_jsonb(d) else to_jsonb(d) - 'tags' - 'folder_id' end,'concept',to_jsonb(c),'role',r,
		'canWrite',public._ideacad_direct_can_write(d.id),'archivedAt',d.archived_at,'deletedAt',d.deleted_at,
		'artifacts',public.ideacad_read_brep_artifacts(d.id,coalesce(hashes,'{}'::text[])));
end;
$fgpayload$;

-- 0216's chooser list, minus the trash and plus the launch page's fields.
-- Still summaries only: no BREP bytes and no history until a document opens.
-- FILING IS THE OWNER'S: a grantee, a classmate under a section grant and a
-- manager see a shared document with NO folder and NO tags (section 4), so the
-- two are masked for everyone but the owner here and in the open payload.
create or replace function public.ideacad_direct_documents()
returns jsonb language sql stable security definer set search_path = ''
as $fgdirectlist$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id',d.id,'title',d.title,'itemId',d.item_id,'ownerEmail',d.student_email,
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

-- 0216's three owner actions that must not act on a trashed row, each
-- re-stated byte for byte from 0216 with exactly one line added. Diffed
-- against the source rather than reconstructed, so the refusal text and order
-- a deployed client already sees do not move.
create or replace function public.ideacad_set_direct_document_archived(p_document_id uuid,p_archived boolean)
returns jsonb language plpgsql security definer set search_path = ''
as $archivedirect$
declare d public.ideacad_documents; e text := public.current_user_email();
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or coalesce(e,'') = '' or not (
		(d.item_id is null and d.student_email = e) or public._ideacad_direct_manager(d.id)
	) then raise exception 'That document does not exist.'; end if;
	if p_archived is null then raise exception 'Choose archive or restore.'; end if;
	if d.deleted_at is not null then raise exception 'Restore the document from the trash first.'; end if;
	if p_archived then
		update public.ideacad_documents set archived_at = coalesce(archived_at,now()), archived_by = coalesce(archived_by,e), updated_at = now() where id = d.id;
	else
		delete from public.ideacad_section_grants where document_id = d.id;
		update public.ideacad_documents set archived_at = null,archived_by = null,updated_at = now() where id = d.id;
	end if;
	return public._ideacad_direct_payload(d.id);
end;
$archivedirect$;

create or replace function public.ideacad_link_direct_document(p_document_id uuid,p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $linkdirect$
declare d public.ideacad_documents; i public.classroom_items; e public.ideacad_editors; sections uuid[]; email text := public.current_user_email();
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> email or coalesce(email,'') = '' then
		raise exception 'You can only link your own document.';
	end if;
	if d.archived_at is not null then raise exception 'Restore the document before linking it.'; end if;
	if d.deleted_at is not null then raise exception 'Restore the document from the trash before linking it.'; end if;
	if d.item_id = p_item_id then return public._ideacad_direct_payload(d.id); end if;
	if d.item_id is not null then raise exception 'This document is already linked. Make a copy for another assignment.'; end if;
	if not public.classroom_can_read_item(p_item_id) then raise exception 'Choose an available IdeaCAD assignment.'; end if;
	select * into i from public.classroom_items where id = p_item_id and kind = 'assignment' for share;
	if not found then raise exception 'Choose an available IdeaCAD assignment.'; end if;
	select * into e from public.ideacad_editors where item_id = p_item_id for share;
	if not found then raise exception 'Choose an available IdeaCAD assignment.'; end if;
	select array_agg(distinct cp.section_id) into sections
	from public.classroom_postings cp
	where cp.item_id = p_item_id and (
		exists(select 1 from public.classroom_enrollments ce where ce.section_id = cp.section_id and ce.student_email = email and ce.active)
		or public.classroom_manages_section(cp.section_id)
	);
	if sections is null then raise exception 'Choose an IdeaCAD assignment in your classes.'; end if;
	if exists(select 1 from public.ideacad_documents x where x.item_id = p_item_id and x.student_email = email and x.id <> d.id) then
		raise exception 'You already have a document linked to that assignment.';
	end if;
	update public.ideacad_documents set item_id = p_item_id,linked_at = now(),
		assignment_context = jsonb_build_object('version',1,'itemId',i.id,'title',i.title,'editor',e.editor,'config',e.config,'sectionIds',to_jsonb(sections)),
		updated_at = now() where id = d.id;
	insert into public.ideacad_assignment_sections(document_id,section_id)
		select d.id, unnest(sections) on conflict do nothing;
	return public._ideacad_direct_payload(d.id);
end;
$linkdirect$;

create or replace function public.ideacad_share_direct_document(p_document_id uuid,p_grantee_email text,p_role text)
returns jsonb language plpgsql security definer set search_path = ''
as $sharedirect$
declare d public.ideacad_documents; g public.ideacad_grants; e text := public.current_user_email(); target text := lower(btrim(coalesce(p_grantee_email,'')));
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or d.student_email <> e or coalesce(e,'') = '' then raise exception 'You can only share your own document.'; end if;
	if p_role is null or p_role not in ('viewer','editor') then raise exception 'Share as a viewer or editor.'; end if;
	if d.deleted_at is not null then raise exception 'Restore the document from the trash before sharing it.'; end if;
	if target = e then raise exception 'This document is already yours.'; end if;
	if not exists(select 1 from auth.users u where lower(u.email) = target) then raise exception 'Choose the email address of someone who has signed in.'; end if;
	insert into public.ideacad_grants(document_id,grantee_email,role,granted_by)
		values(d.id,target,p_role,e) on conflict(document_id,grantee_email)
		do update set role = excluded.role,granted_by = excluded.granted_by returning * into g;
	return to_jsonb(g);
end;
$sharedirect$;

-- ---------------------------------------------------------------------------
-- 4. FOLDERS, PLACEMENT AND TAGS. All owner-only: filing is the owner's
--    library, and a grantee sees a shared document in their own list with no
--    folder and no tags.
-- ---------------------------------------------------------------------------
create or replace function public.ideacad_direct_folders()
returns jsonb language sql stable security definer set search_path = ''
as $fgfolderlist$
	select coalesce(jsonb_agg(jsonb_build_object(
		'id', f.id, 'name', f.name, 'createdAt', f.created_at,
		'documentCount', (select count(*) from public.ideacad_documents d where d.folder_id = f.id and d.deleted_at is null)
	) order by f.name, f.id), '[]'::jsonb)
	from public.ideacad_folders f where f.owner_email = public.current_user_email() and public.current_user_email() <> '';
$fgfolderlist$;

create or replace function public.ideacad_create_folder(p_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $fgcreatefolder$
declare f public.ideacad_folders; e text := public.current_user_email(); n text := btrim(coalesce(p_name, ''));
begin
	if auth.uid() is null or coalesce(e, '') = '' then raise exception 'You must be signed in.'; end if;
	if length(n) not between 1 and 80 then raise exception 'Name the folder using 1 to 80 characters.'; end if;
	if exists (select 1 from public.ideacad_folders x where x.owner_email = e and lower(x.name) = lower(n)) then
		raise exception 'You already have a folder with that name.';
	end if;
	insert into public.ideacad_folders (owner_email, name) values (e, n) returning * into f;
	return jsonb_build_object('id', f.id, 'name', f.name, 'createdAt', f.created_at, 'documentCount', 0);
end;
$fgcreatefolder$;

create or replace function public.ideacad_rename_folder(p_folder_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = ''
as $fgrenamefolder$
declare f public.ideacad_folders; e text := public.current_user_email(); n text := btrim(coalesce(p_name, ''));
begin
	select * into f from public.ideacad_folders where id = p_folder_id for update;
	if not found or coalesce(e, '') = '' or f.owner_email <> e then raise exception 'That folder does not exist.'; end if;
	if length(n) not between 1 and 80 then raise exception 'Name the folder using 1 to 80 characters.'; end if;
	if exists (select 1 from public.ideacad_folders x where x.owner_email = e and lower(x.name) = lower(n) and x.id <> f.id) then
		raise exception 'You already have a folder with that name.';
	end if;
	update public.ideacad_folders set name = n where id = f.id returning * into f;
	return jsonb_build_object('id', f.id, 'name', f.name, 'createdAt', f.created_at,
		'documentCount', (select count(*) from public.ideacad_documents d where d.folder_id = f.id and d.deleted_at is null));
end;
$fgrenamefolder$;

create or replace function public.ideacad_delete_folder(p_folder_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $fgdeletefolder$
declare f public.ideacad_folders; e text := public.current_user_email(); n integer;
begin
	select * into f from public.ideacad_folders where id = p_folder_id for update;
	if not found or coalesce(e, '') = '' or f.owner_email <> e then raise exception 'That folder does not exist.'; end if;
	select count(*) into n from public.ideacad_documents d where d.folder_id = f.id;
	delete from public.ideacad_folders where id = f.id;
	return jsonb_build_object('ok', true, 'id', f.id, 'name', f.name, 'movedOut', n);
end;
$fgdeletefolder$;

create or replace function public.ideacad_move_direct_document(p_document_id uuid, p_folder_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $fgmove$
declare d public.ideacad_documents; e text := public.current_user_email();
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or coalesce(e, '') = '' or d.student_email <> e then raise exception 'That document does not exist.'; end if;
	if d.deleted_at is not null then raise exception 'Restore this model from the trash first.'; end if;
	if p_folder_id is not null and not exists (select 1 from public.ideacad_folders f where f.id = p_folder_id and f.owner_email = e) then
		raise exception 'That folder does not exist.';
	end if;
	update public.ideacad_documents set folder_id = p_folder_id where id = d.id;
	return jsonb_build_object('ok', true, 'id', d.id, 'folderId', p_folder_id);
end;
$fgmove$;

-- Tags are normalised in one place: trimmed, lower-cased, de-duplicated,
-- sorted, empties dropped. Then checked: 1 to 30 characters each, no commas
-- (the chooser joins them with commas), at most twelve.
create or replace function public._ideacad_clean_tags(p_tags text[])
returns text[] language plpgsql immutable set search_path = ''
as $fgcleantags$
declare cleaned text[]; t text;
begin
	select coalesce(array_agg(distinct x.t order by x.t), '{}'::text[]) into cleaned
		from (select lower(btrim(v)) as t from unnest(coalesce(p_tags, '{}'::text[])) as v) x where x.t <> '';
	foreach t in array cleaned loop
		if length(t) > 30 or position(',' in t) > 0 or t ~ '[[:cntrl:]]' then
			raise exception 'A tag is 1 to 30 characters with no commas.';
		end if;
	end loop;
	if cardinality(cleaned) > 12 then raise exception 'Use at most 12 tags.'; end if;
	return cleaned;
end;
$fgcleantags$;

create or replace function public.ideacad_tag_direct_document(p_document_id uuid, p_tags text[])
returns jsonb language plpgsql security definer set search_path = ''
as $fgtag$
declare d public.ideacad_documents; e text := public.current_user_email(); cleaned text[];
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or d.model_format <> 'solid-v1' or coalesce(e, '') = '' or d.student_email <> e then raise exception 'That document does not exist.'; end if;
	if d.deleted_at is not null then raise exception 'Restore this model from the trash first.'; end if;
	cleaned := public._ideacad_clean_tags(p_tags);
	update public.ideacad_documents set tags = cleaned where id = d.id;
	return jsonb_build_object('ok', true, 'id', d.id, 'tags', to_jsonb(cleaned));
end;
$fgtag$;

-- ---------------------------------------------------------------------------
-- 5. RENAME, DUPLICATE, THUMBNAIL.
--
--    RENAME WRITES A HISTORY ROW. The title lives inside the stored tree and
--    ideacad_documents.title mirrors it; 0209's whole argument is that the
--    tree is the fold of its action log, so a rename that edited the tree
--    without a row would be a revision the log cannot replay to, and the
--    client's replay check would refuse to open the document. So it appends
--    one 'set /title' action through the same applier the save path uses,
--    stamps it as an operation of its own (label Rename, a receipt hash, the
--    resulting revision) and bumps the revision exactly as a save would. Any
--    writer may rename; it is a model edit.
--
--    DUPLICATE IS ANY READER'S. A copy is a new unlinked document owned by
--    the caller, carrying the source's active tree (renamed), the artifacts
--    that tree names, and the thumbnail. History is not copied: the copy's
--    origin row is the tree it starts from, written by 0209's trigger. Folder
--    and tags are copied only when the caller owns the source, since both are
--    the owner's filing.
--
--    A THUMBNAIL IS NOT AN EDIT. Setting one writes no history row and does
--    not bump the revision; it is a picture of a revision, taken by the
--    workspace right after a save lands. (updated_at does move, because 0201's
--    touch trigger stamps every update of the row; the save it follows has
--    just stamped it anyway, so the chooser's order does not change.)
-- ---------------------------------------------------------------------------
create or replace function public.ideacad_rename_direct_document(p_document_id uuid, p_title text)
returns jsonb language plpgsql security definer set search_path = ''
as $fgrename$
declare
	d public.ideacad_documents; c public.ideacad_concepts;
	t text := btrim(coalesce(p_title, ''));
	seq bigint; op uuid := gen_random_uuid(); before_title jsonb; state jsonb; fingerprint text;
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or not public._ideacad_direct_can_write(p_document_id) then raise exception 'You cannot edit this document.'; end if;
	if length(t) not between 1 and 120 then raise exception 'Name the document using 1 to 120 characters.'; end if;
	select * into c from public.ideacad_concepts where id = d.active_concept_id and document_id = d.id and deleted_at is null for update;
	if not found then raise exception 'The document has no active model.'; end if;
	if c.features->>'title' = t and d.title = t then
		return public._ideacad_direct_payload(d.id) || jsonb_build_object('ok', true, 'noop', true, 'acceptedRevision', c.revision);
	end if;
	before_title := c.features->'title';
	state := public._ideacad_direct_apply_action(c.features, jsonb_build_object('kind', 'set', 'path', '/title', 'before', before_title, 'after', to_jsonb(t)));
	perform public._ideacad_direct_validate_model(state);
	select coalesce(max(h.seq), 0) + 1 into seq from public.ideacad_history h where h.concept_id = c.id;
	fingerprint := encode(sha256(convert_to(jsonb_build_object('rename', op, 'base', c.revision, 'title', t)::text, 'UTF8')), 'hex');
	insert into public.ideacad_history (concept_id, seq, kind, path, before_value, after_value, undoes_seq, actor,
		operation_id, operation_start, operation_label, request_hash, result_revision)
	values (c.id, seq, 'set', '/title', before_title, to_jsonb(t), null, public.current_user_email(),
		op, true, 'Rename', fingerprint, c.revision + 1);
	update public.ideacad_concepts set features = state, revision = c.revision + 1, updated_at = now() where id = c.id returning * into c;
	update public.ideacad_documents set title = t, updated_at = now() where id = d.id;
	return public._ideacad_direct_payload(d.id) || jsonb_build_object('ok', true, 'noop', false, 'acceptedRevision', c.revision, 'seq', seq);
end;
$fgrename$;

create or replace function public.ideacad_duplicate_direct_document(p_document_id uuid, p_title text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $fgduplicate$
declare
	d public.ideacad_documents; c public.ideacad_concepts; nd public.ideacad_documents; nc public.ideacad_concepts;
	e text := public.current_user_email(); t text; m jsonb; copied integer;
begin
	if auth.uid() is null or coalesce(e, '') = '' then raise exception 'You must be signed in.'; end if;
	if not public._ideacad_can_read_document(p_document_id) then raise exception 'That document does not exist.'; end if;
	select * into d from public.ideacad_documents where id = p_document_id and model_format = 'solid-v1' for share;
	if not found then raise exception 'That document does not exist.'; end if;
	-- A trashed document is invisible to every reader but its owner (the payload
	-- and the list both say 'does not exist'); a reader learns nothing here either.
	if d.deleted_at is not null and d.student_email is distinct from e then raise exception 'That document does not exist.'; end if;
	if d.deleted_at is not null then raise exception 'Restore this model from the trash first.'; end if;
	select * into c from public.ideacad_concepts where id = d.active_concept_id and document_id = d.id and deleted_at is null;
	if not found then raise exception 'The document has no active model.'; end if;
	t := btrim(coalesce(p_title, left('Copy of ' || d.title, 120)));
	if length(t) not between 1 and 120 then raise exception 'Name the document using 1 to 120 characters.'; end if;
	m := jsonb_set(c.features, '{title}', to_jsonb(t), false);
	perform public._ideacad_direct_validate_model(m);
	insert into public.ideacad_documents (item_id, student_email, model_format, title, folder_id, tags, thumbnail)
		values (null, e, 'solid-v1', t,
			case when d.student_email = e then d.folder_id end,
			case when d.student_email = e then d.tags else '{}'::text[] end,
			d.thumbnail)
		returning * into nd;
	insert into public.ideacad_concepts (document_id, name, position, features) values (nd.id, 'Model', 1, m) returning * into nc;
	update public.ideacad_documents set active_concept_id = nc.id where id = nd.id;
	insert into public.ideacad_brep_artifacts (document_id, hash, kernel, bytes)
		select nd.id, a.hash, a.kernel, a.bytes from public.ideacad_brep_artifacts a
		where a.document_id = d.id and a.hash in (
			select value->>'artifact' from jsonb_array_elements(m->'bodies')
			union select value->>'artifact' from jsonb_array_elements(coalesce(m->'features', '[]'::jsonb)) where value->>'artifact' is not null
		);
	get diagnostics copied = row_count;
	return public._ideacad_direct_payload(nd.id) || jsonb_build_object('ok', true, 'copiedArtifacts', copied, 'sourceId', d.id);
end;
$fgduplicate$;

create or replace function public.ideacad_set_direct_document_thumbnail(p_document_id uuid, p_thumbnail text)
returns jsonb language plpgsql security definer set search_path = ''
as $fgthumbnail$
declare d public.ideacad_documents;
begin
	select * into d from public.ideacad_documents where id = p_document_id for update;
	if not found or not public._ideacad_direct_can_write(p_document_id) then raise exception 'You cannot edit this document.'; end if;
	if p_thumbnail is not null and (length(p_thumbnail) > 60000 or p_thumbnail !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$') then
		raise exception 'A thumbnail is a PNG, JPEG or WebP data URL of at most 60000 characters.';
	end if;
	update public.ideacad_documents set thumbnail = p_thumbnail where id = d.id;
	return jsonb_build_object('ok', true, 'id', d.id, 'bytes', coalesce(length(p_thumbnail), 0));
end;
$fgthumbnail$;

-- ---------------------------------------------------------------------------
-- 6. GRANTS, 0166 SHAPE. Client functions to authenticated and service_role;
--    private helpers to service_role alone. The four 0216 functions replaced
--    above are re-stated here because create-or-replace under this project's
--    default privileges can hand a replaced function a fresh anon grant.
-- ---------------------------------------------------------------------------
revoke all on function
	public.ideacad_trash_direct_document(uuid),
	public.ideacad_restore_direct_document(uuid),
	public.ideacad_purge_direct_document(uuid),
	public.ideacad_direct_trash(),
	public.ideacad_direct_folders(),
	public.ideacad_create_folder(text),
	public.ideacad_rename_folder(uuid,text),
	public.ideacad_delete_folder(uuid),
	public.ideacad_move_direct_document(uuid,uuid),
	public.ideacad_tag_direct_document(uuid,text[]),
	public.ideacad_rename_direct_document(uuid,text),
	public.ideacad_duplicate_direct_document(uuid,text),
	public.ideacad_set_direct_document_thumbnail(uuid,text),
	public.ideacad_direct_documents(),
	public.ideacad_set_direct_document_archived(uuid,boolean),
	public.ideacad_link_direct_document(uuid,uuid),
	public.ideacad_share_direct_document(uuid,text,text)
	from public, anon, authenticated;
grant execute on function
	public.ideacad_trash_direct_document(uuid),
	public.ideacad_restore_direct_document(uuid),
	public.ideacad_purge_direct_document(uuid),
	public.ideacad_direct_trash(),
	public.ideacad_direct_folders(),
	public.ideacad_create_folder(text),
	public.ideacad_rename_folder(uuid,text),
	public.ideacad_delete_folder(uuid),
	public.ideacad_move_direct_document(uuid,uuid),
	public.ideacad_tag_direct_document(uuid,text[]),
	public.ideacad_rename_direct_document(uuid,text),
	public.ideacad_duplicate_direct_document(uuid,text),
	public.ideacad_set_direct_document_thumbnail(uuid,text),
	public.ideacad_direct_documents(),
	public.ideacad_set_direct_document_archived(uuid,boolean),
	public.ideacad_link_direct_document(uuid,uuid),
	public.ideacad_share_direct_document(uuid,text,text)
	to authenticated, service_role;
revoke all on function
	public._ideacad_trash_window(),
	public._ideacad_purge_expired_direct_documents(),
	public._ideacad_clean_tags(text[]),
	public._ideacad_direct_validate_model(jsonb),
	public._ideacad_direct_can_write(uuid),
	public._ideacad_direct_payload(uuid),
	public._ideacad_preserve_direct_document()
	from public, anon, authenticated;
grant execute on function
	public._ideacad_trash_window(),
	public._ideacad_purge_expired_direct_documents(),
	public._ideacad_clean_tags(text[]),
	public._ideacad_direct_validate_model(jsonb),
	public._ideacad_direct_can_write(uuid),
	public._ideacad_direct_payload(uuid),
	public._ideacad_preserve_direct_document()
	to service_role;

-- ---------------------------------------------------------------------------
-- 7. SELF-CHECK, over this file's own objects and nothing else (0206's rule:
--    a guard that sweeps a subsystem holds somebody else's ground). Raises on
--    anything missing, so a partial paste rolls back whole; prints the counts
--    the operator can check against the app.
-- ---------------------------------------------------------------------------
do $fgcheck$
declare
	sig text; missing text[] := '{}';
	v_docs bigint; v_trashed bigint; v_folders bigint; v_tagged bigint; v_thumbs bigint; v_v2 bigint;
begin
	foreach sig in array array[
		'public.ideacad_trash_direct_document(uuid)', 'public.ideacad_restore_direct_document(uuid)',
		'public.ideacad_purge_direct_document(uuid)', 'public.ideacad_direct_trash()',
		'public.ideacad_direct_folders()', 'public.ideacad_create_folder(text)',
		'public.ideacad_rename_folder(uuid,text)', 'public.ideacad_delete_folder(uuid)',
		'public.ideacad_move_direct_document(uuid,uuid)', 'public.ideacad_tag_direct_document(uuid,text[])',
		'public.ideacad_rename_direct_document(uuid,text)', 'public.ideacad_duplicate_direct_document(uuid,text)',
		'public.ideacad_set_direct_document_thumbnail(uuid,text)',
		'public.ideacad_direct_documents()', 'public.ideacad_set_direct_document_archived(uuid,boolean)',
		'public.ideacad_link_direct_document(uuid,uuid)', 'public.ideacad_share_direct_document(uuid,text,text)'
	] loop
		if to_regprocedure(sig) is null or has_function_privilege('anon', sig, 'execute')
			or not has_function_privilege('authenticated', sig, 'execute') then
			missing := array_append(missing, sig);
		end if;
	end loop;
	foreach sig in array array[
		'public._ideacad_trash_window()', 'public._ideacad_purge_expired_direct_documents()', 'public._ideacad_clean_tags(text[])',
		'public._ideacad_direct_validate_model(jsonb)', 'public._ideacad_direct_can_write(uuid)',
		'public._ideacad_direct_payload(uuid)', 'public._ideacad_preserve_direct_document()'
	] loop
		if to_regprocedure(sig) is null or has_function_privilege('anon', sig, 'execute')
			or has_function_privilege('authenticated', sig, 'execute') then
			missing := array_append(missing, sig);
		end if;
	end loop;
	foreach sig in array array['deleted_at', 'deleted_by', 'folder_id', 'tags', 'thumbnail'] loop
		if not exists (select 1 from pg_attribute where attrelid = 'public.ideacad_documents'::regclass and attname = sig and not attisdropped) then
			missing := array_append(missing, 'ideacad_documents.' || sig);
		end if;
	end loop;
	if to_regclass('public.ideacad_folders') is null then missing := array_append(missing, 'table ideacad_folders'); end if;
	if not exists (select 1 from pg_trigger where tgrelid = 'public.ideacad_documents'::regclass and tgname = 'ideacad_preserve_direct_document' and tgenabled = 'O') then
		missing := array_append(missing, 'trigger ideacad_preserve_direct_document');
	end if;
	if (select position('ideacad-solid-v2' in p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_ideacad_direct_validate_model') = 0 then
		missing := array_append(missing, 'validator does not accept ideacad-solid-v2');
	end if;
	if (select position('ideacad.purge' in p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_ideacad_preserve_direct_document') = 0 then
		missing := array_append(missing, 'preserve trigger admits no purge');
	end if;
	if cardinality(missing) > 0 then
		raise exception '0217: not applied cleanly, rolling back. Missing or mis-granted: %', array_to_string(missing, ', ');
	end if;
	select count(*), count(*) filter (where deleted_at is not null), count(*) filter (where cardinality(tags) > 0), count(*) filter (where thumbnail is not null)
		into v_docs, v_trashed, v_tagged, v_thumbs from public.ideacad_documents where model_format = 'solid-v1';
	select count(*) into v_folders from public.ideacad_folders;
	select count(*) into v_v2 from public.ideacad_documents d join public.ideacad_concepts c on c.id = d.active_concept_id
		where d.model_format = 'solid-v1' and c.features->>'format' = 'ideacad-solid-v2';
	raise notice '0217: % direct document(s), % of them version 2, % in the trash, % tagged, % with a thumbnail; % folder(s). Validator accepts ideacad-solid-v1 and ideacad-solid-v2; trash window %.',
		v_docs, v_v2, v_trashed, v_tagged, v_thumbs, v_folders, public._ideacad_trash_window();
end;
$fgcheck$;

commit;

-- ---------------------------------------------------------------------------
-- 8. READINESS, AS ROWS. The SQL editor shows no notices, so this is the
--    reading a person takes after the paste: every row should show ok = true.
--    Two rows are NEGATIVE CONTROLS with expected = false, so a reader can see
--    the instrument distinguishes a true from a false rather than printing
--    true for everything it is asked. Read-only; safe to run again any time.
-- ---------------------------------------------------------------------------
with client_functions(signature) as (values
	('public.ideacad_trash_direct_document(uuid)'), ('public.ideacad_restore_direct_document(uuid)'),
	('public.ideacad_purge_direct_document(uuid)'), ('public.ideacad_direct_trash()'),
	('public.ideacad_direct_folders()'), ('public.ideacad_create_folder(text)'),
	('public.ideacad_rename_folder(uuid,text)'), ('public.ideacad_delete_folder(uuid)'),
	('public.ideacad_move_direct_document(uuid,uuid)'), ('public.ideacad_tag_direct_document(uuid,text[])'),
	('public.ideacad_rename_direct_document(uuid,text)'), ('public.ideacad_duplicate_direct_document(uuid,text)'),
	('public.ideacad_set_direct_document_thumbnail(uuid,text)'), ('public.ideacad_direct_documents()'),
	('public.ideacad_set_direct_document_archived(uuid,boolean)'), ('public.ideacad_link_direct_document(uuid,uuid)'),
	('public.ideacad_share_direct_document(uuid,text,text)')
), private_functions(signature) as (values
	('public._ideacad_trash_window()'), ('public._ideacad_purge_expired_direct_documents()'), ('public._ideacad_clean_tags(text[])'),
	('public._ideacad_direct_validate_model(jsonb)'), ('public._ideacad_direct_can_write(uuid)'),
	('public._ideacad_direct_payload(uuid)'), ('public._ideacad_preserve_direct_document()')
), columns(name) as (values ('deleted_at'), ('deleted_by'), ('folder_id'), ('tags'), ('thumbnail')
), checks(examined, expected, actual) as (
	select 'client function: ' || signature, true,
		to_regprocedure(signature) is not null and has_function_privilege('authenticated', signature, 'execute') and not has_function_privilege('anon', signature, 'execute')
	from client_functions
	union all select 'private function: ' || signature, true,
		to_regprocedure(signature) is not null and not has_function_privilege('authenticated', signature, 'execute') and not has_function_privilege('anon', signature, 'execute')
	from private_functions
	union all select 'column ideacad_documents.' || name, true,
		exists (select 1 from pg_attribute where attrelid = 'public.ideacad_documents'::regclass and attname = name and not attisdropped)
	from columns
	union all select 'table ideacad_folders: RLS on, authenticated SELECT only, anon nothing', true,
		(select relrowsecurity and has_table_privilege('authenticated', oid, 'select') and not has_table_privilege('authenticated', oid, 'insert')
			and not has_table_privilege('authenticated', oid, 'update') and not has_table_privilege('authenticated', oid, 'delete')
			and not has_table_privilege('anon', oid, 'select') from pg_class where oid = 'public.ideacad_folders'::regclass)
	union all select 'validator accepts ideacad-solid-v2', true,
		(select position('ideacad-solid-v2' in p.prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_ideacad_direct_validate_model')
	union all select 'preserve trigger present and admits only a purge', true,
		exists (select 1 from pg_trigger where tgrelid = 'public.ideacad_documents'::regclass and tgname = 'ideacad_preserve_direct_document' and tgenabled = 'O')
		and (select position('ideacad.purge' in p.prosrc) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_ideacad_preserve_direct_document')
	union all select 'trash is unlinked-only on the row (constraint ideacad_documents_trash_unlinked_check)', true,
		exists (select 1 from pg_constraint where conrelid = 'public.ideacad_documents'::regclass and conname = 'ideacad_documents_trash_unlinked_check')
	union all select 'NEGATIVE CONTROL (expected false): anon may call ideacad_purge_direct_document', false,
		has_function_privilege('anon', 'public.ideacad_purge_direct_document(uuid)', 'execute')
	union all select 'NEGATIVE CONTROL (expected false): a column this file never adds exists', false,
		exists (select 1 from pg_attribute where attrelid = 'public.ideacad_documents'::regclass and attname = 'never_added_by_0217')
)
select examined, expected, actual, expected = actual as ok from checks order by ok, examined;
