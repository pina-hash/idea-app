-- 0170_feedback_tried_and_screenshot.sql
-- The feedback form gains "What did you try?" and a screenshot.
--
-- ---------------------------------------------------------------------------
-- WHY
--
-- The 2026-08-31 triage of forty-five reports produced several that could not
-- be specified ("more refined", "go crazy, think big", a request for a control
-- that already existed in three places). The row records WHERE the reporter
-- was (route, path, role, section, viewport, user agent, build -- all of
-- `captureMeta` in src/lib/feedback/context.ts) and nothing about what they
-- were LOOKING AT or what they TRIED. One item became a whole audit question
-- that a screenshot would have answered in a second.
--
-- This file adds two things to `app_feedback`, both OPTIONAL, both prose or a
-- pointer to bytes the reporter chose, neither authoritative:
--
--   tried            What the reporter tried before writing in. A REAL COLUMN,
--                    not a key in `meta`, because the CHECK constraint is the
--                    boundary and 0053 documents `meta` as client-reported and
--                    never authoritative. Capped at 1000 characters (half the
--                    message cap: an account of what was tried is shorter than
--                    an account of what happened).
--   screenshot_path  The key of ONE image in the new PRIVATE `feedback-media`
--                    bucket, or null. The CHECK on this column ties the key's
--                    first segment to the row's author (see section 1), so a
--                    signed-in row cannot name another person's object and an
--                    anonymous row cannot name a person's folder at all.
--
-- ---------------------------------------------------------------------------
-- THE BUCKET, AND WHAT IT ADMITS
--
-- `feedback-media` is PRIVATE (no public URL exists for any object), capped at
-- 8 MiB per object (8388608 bytes, enforced by Storage on the upload itself
-- and so not talkable past from a client), and admits exactly three declared
-- types: image/png, image/jpeg, image/webp. 0168's instrument, applied to a
-- new bucket rather than to an old one: a CONCRETE RASTER LIST, never
-- `image/*`.
--
--   image/png    What every screenshot tool emits.
--   image/jpeg   What a phone camera and most re-encoders emit.
--   image/webp   What Android share sheets and some capture tools emit.
--
-- REFUSED, each for its own reason:
--   image/svg+xml  A DOCUMENT, not a picture: script, external references,
--                  event handlers. 0168's whole finding.
--   image/heic, image/heif  Refused HERE where 0168 admitted them for
--                  maps-media, and the difference is the surface: a maps photo
--                  is taken standing at a toolbox where a bucket refusal is the
--                  one failure the person cannot work around, so 0168 admitted
--                  HEIC and named the cost. A screenshot is taken at a
--                  computer, Chrome and Firefox do not decode HEIC, and the
--                  triage console is the one reader. A HEIC nobody can open is
--                  a broken thumbnail on the one screen that needed it, so the
--                  client tells the reporter before the upload and this list
--                  refuses it after.
--   image/gif, image/bmp, image/tiff, image/avif  No producer on this path.
--   the wildcard   Admits svg+xml and every type invented after this file.
--
-- WHAT THE LIST REACHES AND DOES NOT (0168's own caveat, restated because it
-- is still true): Storage enforces `allowed_mime_types` at UPLOAD against the
-- request's DECLARED content type. It does not inspect bytes. The client
-- therefore sniffs the first bytes of the file and refuses anything that is
-- not a PNG, JPEG or WebP signature BEFORE choosing the content type it
-- declares -- so the declared type is derived from the bytes, never read off
-- `File.type`. And the bucket is private: nothing here is ever navigated to as
-- a document, the console reads objects through signed URLs carrying
-- `download=`, which is the same property that makes the classroom buckets
-- safe (CLAUDE.md, "three properties pay for the missing list").
--
-- ---------------------------------------------------------------------------
-- WHO MAY WRITE AND READ AN OBJECT
--
-- Four storage policies, all `to authenticated`, none `to anon`:
--   insert own folder   `<uid>/<uuid>.<ext>` -- 0020's avatars shape.
--   select own folder   a reporter can read back their own screenshot.
--   select as admin     `public.is_admin()` -- the triage console's read.
--   delete own folder   so a client can clean up an object whose row insert
--                       was refused afterwards.
-- No UPDATE policy: an object is written once. No anon policy of any kind.
--
-- ANONYMOUS REPORTERS CANNOT ATTACH A SCREENSHOT, AND THAT IS A DECISION
-- RATHER THAN AN OMISSION. The anonymous write path is `POST /api/feedback`
-- (src/routes/api/feedback/+server.ts), which caps its JSON body at 16 KB and
-- was OUT OF SCOPE for the bundle that wrote this file. The only in-scope way
-- to let a signed-out browser put bytes in this bucket would be an `anon`
-- INSERT policy on storage.objects -- an unauthenticated, unrate-limited public
-- write of 8 MiB objects, keyed by nothing, which is exactly the kind of
-- surface 0126 spent a salted hash and a rate table avoiding for a 2000-byte
-- message. So the form says screenshots are signed-in only, and the function
-- below STILL accepts `p_screenshot_path` on the anonymous branch (under the
-- `anon/<uuid>.<ext>` shape the CHECK admits) so that the route bundle which
-- eventually uploads on the server's behalf, rate limited, needs no second
-- migration. No caller in the tree passes it today.
--
-- ---------------------------------------------------------------------------
-- THE FUNCTION, AND THE SIGNATURE TRAP
--
-- `app_feedback_submit` gains two parameters. Per CLAUDE.md the old arity is
-- `drop function`ed at its exact 7-argument signature FIRST, and the new
-- 9-argument form defaults both new parameters to null. That is the ADDITIVE
-- shape: the deployed route calls with seven named keys and resolves to the
-- one function that exists, so the migration and the client deploy are
-- independent events and either may go first. Section 7 asserts exactly one
-- pg_proc row.
--
-- `p_tried` IS ALSO READ FROM `p_meta->>'tried'` WHEN THE PARAMETER IS NULL,
-- and the key is then REMOVED from the stored meta. This is a BRIDGE for one
-- caller: the anonymous route forwards `meta` verbatim and does not name
-- `p_tried`, and it could not be edited by this bundle. The signed-out form
-- therefore carries the answer inside `meta.tried`, and this function lifts it
-- into the column so every row has ONE spelling. The day the route names
-- `p_tried`, the bridge is dead code and can go in that file's own migration.
-- Until then a row written by either path reads identically to the console.
--
-- `app_feedback_admin_list` is replaced with the same signature (0127's body
-- plus two projected columns), so `create or replace` is correct and no
-- overload can survive.
--
-- A NEW FUNCTION IS NOT COVERED BY 0137 AND REVOKES FOR ITSELF, naming the
-- roles: `_app_feedback_tried_max` is granted to nobody, `app_feedback_submit`
-- to `service_role` alone, `app_feedback_admin_list` to `authenticated`.
--
-- Requires 0126 (the anonymous path) and 0127 (the console read this replaces).
-- Apply manually in the Supabase SQL editor, after 0169. Re-pasting is
-- ordinary and lands the same end state.
--
-- ---------------------------------------------------------------------------
-- TO UNDO, in this order:
--   drop policy "feedback media insert own folder" on storage.objects;
--   drop policy "feedback media read own folder" on storage.objects;
--   drop policy "feedback media admin read" on storage.objects;
--   drop policy "feedback media delete own folder" on storage.objects;
--   -- The bucket row can be deleted only once it holds no objects; list them
--   -- first (select name from storage.objects where bucket_id =
--   -- 'feedback-media') and remove them through the Storage API, because
--   -- deleting the rows here would not remove the bytes.
--   delete from storage.buckets where id = 'feedback-media';
--   drop function public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text);
--   -- then re-paste 0126 section 4 (the 7-argument function and its grants)
--   -- and 0127 (the console read), which restores both bodies exactly;
--   drop function public._app_feedback_tried_max();
--   alter table public.app_feedback
--     drop constraint app_feedback_tried_len,
--     drop constraint app_feedback_screenshot_path_shape,
--     drop column tried,
--     drop column screenshot_path;
-- Dropping the two columns discards what reporters typed and every pointer to
-- their screenshots. Nothing else in this file changes any existing row.
-- ---------------------------------------------------------------------------

begin;

-- ===========================================================================
-- 1. Two columns on app_feedback, both nullable, both additive.
-- ===========================================================================

alter table public.app_feedback add column if not exists tried text;
alter table public.app_feedback add column if not exists screenshot_path text;

comment on column public.app_feedback.tried is
	'What the reporter tried before writing in. Optional prose, 1..1000 characters or null. Client-reported, never authoritative. Added by 0170.';
comment on column public.app_feedback.screenshot_path is
	'Key of ONE object in the private feedback-media bucket, or null. Shape and ownership are pinned by app_feedback_screenshot_path_shape: <user_id>/<uuid>.<png|jpg|webp> on a signed-in row, anon/<uuid>.<ext> on an authorless one. Added by 0170.';

-- Postgres has no `add constraint if not exists`; guard on the catalog so a
-- re-paste does not raise 42710.
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conrelid = 'public.app_feedback'::regclass
			and conname = 'app_feedback_tried_len'
	) then
		alter table public.app_feedback
			add constraint app_feedback_tried_len
			check (tried is null or char_length(tried) between 1 and 1000);
	end if;

	-- THE KEY LAYOUT IS THE AUTHORIZATION, stated on the row as well as in the
	-- storage policies: a signed-in row's key starts with its own author's uuid
	-- and nothing else, and an authorless row's key starts with `anon/`. A uuid
	-- rendered as text is hex and dashes, so it is regex-safe to interpolate.
	-- The extension list is the bucket's type list one spelling over -- a `.svg`
	-- key is refused by the database even though no policy could have written
	-- the object behind it.
	if not exists (
		select 1 from pg_constraint
		where conrelid = 'public.app_feedback'::regclass
			and conname = 'app_feedback_screenshot_path_shape'
	) then
		alter table public.app_feedback
			add constraint app_feedback_screenshot_path_shape
			check (
				screenshot_path is null
				or (
					user_id is not null
					and screenshot_path ~ (
						'^' || user_id::text
						|| '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
					)
				)
				or (
					user_id is null
					and screenshot_path ~
						'^anon/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
				)
			);
	end if;
end
$$;

-- ===========================================================================
-- 2. The bucket. Private, 8 MiB, three declared types. `on conflict do update`
--    so a re-paste REASSERTS every property rather than accepting what is there.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'feedback-media', 'feedback-media', false, 8388608,
	array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
	set public = false,
		file_size_limit = 8388608,
		allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- ===========================================================================
-- 3. Storage policies. The 0020 avatars shape, minus the public read, plus an
--    admin read. NOTHING `to anon`, NOTHING for update.
-- ===========================================================================

drop policy if exists "feedback media insert own folder" on storage.objects;
create policy "feedback media insert own folder"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'feedback-media'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

drop policy if exists "feedback media read own folder" on storage.objects;
create policy "feedback media read own folder"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'feedback-media'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- The triage console's read. `is_admin()` is evaluated as the querying role
-- (authenticated), which holds EXECUTE on it since 0067 -- the same way the
-- 0053 read policy already calls is_teacher().
drop policy if exists "feedback media admin read" on storage.objects;
create policy "feedback media admin read"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'feedback-media'
		and public.is_admin()
	);

drop policy if exists "feedback media delete own folder" on storage.objects;
create policy "feedback media delete own folder"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'feedback-media'
		and (storage.foldername(name))[1] = (select auth.uid())::text
	);

-- ===========================================================================
-- 4. The cap, as a function, the 0126 way: the CHECK is the boundary and this
--    exists so the write function can refuse GRACEFULLY with a reason a client
--    can render. Mirrored by FEEDBACK_TRIED_MAX in src/lib/feedback/feedback.ts.
-- ===========================================================================

create or replace function public._app_feedback_tried_max()
returns integer language sql immutable as $$ select 1000 $$;

revoke all on function public._app_feedback_tried_max()
	from public, anon, authenticated, service_role;

-- ===========================================================================
-- 5. The write function, widened. THE SIGNATURE TRAP: the old arity is dropped
--    at its exact signature first, so exactly one function stands afterwards.
-- ===========================================================================

drop function if exists public.app_feedback_submit(text, text, text, text, jsonb, text, text);

create or replace function public.app_feedback_submit(
	p_app text,
	p_kind text,
	p_message text,
	p_context text default null,
	p_meta jsonb default '{}'::jsonb,
	p_contact text default null,
	p_address_hash text default null,
	p_tried text default null,
	p_screenshot_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_app text := nullif(public._app_feedback_trim(p_app), '');
	v_kind text := lower(public._app_feedback_trim(p_kind));
	v_message text := public._app_feedback_trim(p_message);
	v_context text := nullif(public._app_feedback_trim(p_context), '');
	v_contact text := nullif(public._app_feedback_trim(p_contact), '');
	v_supplied text := nullif(public._app_feedback_trim(p_address_hash), '');
	-- THE PARAMETER FIRST, THEN THE BRIDGE. See the header: the anonymous
	-- route forwards meta verbatim and does not name p_tried yet, so the
	-- signed-out form carries the answer inside meta.tried. Either way the
	-- stored row has ONE spelling: the column.
	v_tried text := coalesce(
		nullif(public._app_feedback_trim(p_tried), ''),
		nullif(public._app_feedback_trim(coalesce(p_meta, '{}'::jsonb) ->> 'tried'), '')
	);
	v_meta jsonb := coalesce(p_meta, '{}'::jsonb) - 'tried';
	v_shot text := nullif(public._app_feedback_trim(p_screenshot_path), '');
	v_hash text;
	v_recent integer;
	v_id uuid;
begin
	-- Our own caller's job to get right.
	if v_app is null then
		raise exception 'A feedback app id is required.';
	end if;
	if v_kind not in ('bug', 'idea', 'praise', 'other') then
		raise exception 'Unknown feedback kind.';
	end if;

	if v_uid is null then
		-- The anonymous path. An unattributable write is not on offer.
		if v_supplied is null then
			raise exception 'An anonymous report needs a reporter address hash.';
		end if;
		-- Salted here, which is what makes the column unable to hold an address:
		-- whatever arrived, what is stored is a digest of it.
		v_hash := md5(
			(select s.salt from public.app_feedback_reporter_secret s where s.id limit 1)
			|| v_supplied
		);
	end if;
	-- A signed-in call ignores p_address_hash entirely. See 0126's XOR
	-- constraint for why an account is never stored beside an address hash.

	-- What a person could have caused.
	if v_message = '' then
		return jsonb_build_object('ok', false, 'reason', 'message_empty');
	end if;
	if char_length(v_message) > public._app_feedback_message_max() then
		return jsonb_build_object('ok', false, 'reason', 'message_too_long');
	end if;
	if v_contact is not null and char_length(v_contact) > public._app_feedback_contact_max() then
		return jsonb_build_object('ok', false, 'reason', 'contact_too_long');
	end if;
	if v_tried is not null and char_length(v_tried) > public._app_feedback_tried_max() then
		return jsonb_build_object('ok', false, 'reason', 'tried_too_long');
	end if;
	-- A screenshot path of the wrong shape is NOT refused gracefully: no person
	-- types one, so a bad value is a bug in our own caller, and the CHECK on the
	-- column raises 23514 exactly as it would for a direct insert.

	if v_hash is not null then
		-- Age out first. A row older than the window can never affect a decision
		-- again, and the window is therefore also the retention.
		delete from public.app_feedback_rate r
		where r.created_at < now() - public._app_feedback_rate_window();

		select count(*) into v_recent
		from public.app_feedback_rate r
		where r.reporter_hash = v_hash
			and r.created_at > now() - public._app_feedback_rate_window();

		if v_recent >= public._app_feedback_rate_cap() then
			return jsonb_build_object('ok', false, 'reason', 'rate_limited');
		end if;
	end if;

	insert into public.app_feedback
		(user_id, app, context, kind, message, meta, contact, reporter_hash, tried, screenshot_path)
	values (
		v_uid, v_app, v_context, v_kind, v_message,
		v_meta, v_contact, v_hash, v_tried, v_shot
	)
	returning id into v_id;

	if v_hash is not null then
		insert into public.app_feedback_rate (reporter_hash) values (v_hash);
	end if;

	return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)
	from public, anon, authenticated;
grant execute on function public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)
	to service_role;

-- ===========================================================================
-- 6. The console read: 0127's body verbatim plus the two new columns.
--    Same signature, so this is a body change and carries no signature trap.
-- ===========================================================================

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
				-- Stated, not inferred (0127).
				(f.user_id is null) as anonymous,
				-- What somebody typed, never a verified identity (0127).
				f.contact,
				-- 0170: what they tried, and the key of the one screenshot.
				f.tried,
				f.screenshot_path,
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

-- Named roles, not `from public` alone (CLAUDE.md: `revoke ... from public`
-- does not close a function on this project). service_role is left as it is,
-- 0137's rule.
revoke all on function public.app_feedback_admin_list(text, integer)
	from public, anon, authenticated;
grant execute on function public.app_feedback_admin_list(text, integer) to authenticated;

-- ===========================================================================
-- 7. Self-check: every claim above read back out of the catalog. Raises, and
--    so rolls the whole file back, if any of them is false.
-- ===========================================================================

do $$
declare
	v_bucket record;
	v_expected constant text[] := array['image/png', 'image/jpeg', 'image/webp'];
	v_n integer;
	v_nargs integer;
	v_with_tried integer;
	v_with_shot integer;
begin
	-- The columns.
	if not exists (
		select 1 from pg_attribute
		where attrelid = 'public.app_feedback'::regclass and attname = 'tried' and not attisdropped
	) then
		raise exception '0170: app_feedback.tried is missing.';
	end if;
	if not exists (
		select 1 from pg_attribute
		where attrelid = 'public.app_feedback'::regclass and attname = 'screenshot_path' and not attisdropped
	) then
		raise exception '0170: app_feedback.screenshot_path is missing.';
	end if;
	if (select count(*) from pg_constraint
		where conrelid = 'public.app_feedback'::regclass
			and conname in ('app_feedback_tried_len', 'app_feedback_screenshot_path_shape')) <> 2 then
		raise exception '0170: expected both CHECK constraints on app_feedback.';
	end if;

	-- The bucket.
	select public, file_size_limit, allowed_mime_types into v_bucket
	from storage.buckets where id = 'feedback-media';
	if v_bucket is null then
		raise exception '0170: the feedback-media bucket was not created.';
	end if;
	if v_bucket.public then
		raise exception '0170: feedback-media must be private.';
	end if;
	if v_bucket.file_size_limit is distinct from 8388608 then
		raise exception '0170: feedback-media file_size_limit is %, expected 8388608.', v_bucket.file_size_limit;
	end if;
	if v_bucket.allowed_mime_types is distinct from v_expected then
		raise exception '0170: feedback-media allowed_mime_types is %, expected %.',
			v_bucket.allowed_mime_types, v_expected;
	end if;
	if exists (
		select 1 from unnest(v_bucket.allowed_mime_types) t
		where lower(t) like 'image/svg%' or t like '%/*' or t = '*'
	) then
		raise exception '0170: feedback-media admits SVG or a wildcard.';
	end if;

	-- The policies: four, none of them to anon.
	select count(*) into v_n from pg_policies
	where schemaname = 'storage' and tablename = 'objects'
		and policyname like 'feedback media %';
	if v_n <> 4 then
		raise exception '0170: expected 4 feedback media policies on storage.objects, found %.', v_n;
	end if;
	if exists (
		select 1 from pg_policies
		where schemaname = 'storage' and tablename = 'objects'
			and policyname like 'feedback media %'
			and ('anon' = any (roles) or 'public' = any (roles))
	) then
		raise exception '0170: a feedback media policy admits anon.';
	end if;

	-- The function: one row, nine arguments, service_role only.
	select count(*), max(pronargs) into v_n, v_nargs from pg_proc p
	join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'app_feedback_submit';
	if v_n <> 1 or v_nargs <> 9 then
		raise exception '0170: expected exactly one app_feedback_submit with 9 arguments, found % row(s), max arity %.', v_n, v_nargs;
	end if;
	if has_function_privilege('anon',
		'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)', 'execute')
	or has_function_privilege('authenticated',
		'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)', 'execute')
	or not has_function_privilege('service_role',
		'public.app_feedback_submit(text, text, text, text, jsonb, text, text, text, text)', 'execute') then
		raise exception '0170: app_feedback_submit must be executable by service_role and nobody else.';
	end if;
	if has_function_privilege('anon', 'public.app_feedback_admin_list(text, integer)', 'execute')
	or not has_function_privilege('authenticated', 'public.app_feedback_admin_list(text, integer)', 'execute') then
		raise exception '0170: app_feedback_admin_list grants are wrong.';
	end if;
	if has_function_privilege('anon', 'public._app_feedback_tried_max()', 'execute')
	or has_function_privilege('authenticated', 'public._app_feedback_tried_max()', 'execute')
	or has_function_privilege('service_role', 'public._app_feedback_tried_max()', 'execute') then
		raise exception '0170: _app_feedback_tried_max must be granted to nobody.';
	end if;

	-- What the table holds, for the operator to check against the console.
	select count(*) filter (where tried is not null),
		count(*) filter (where screenshot_path is not null)
	into v_with_tried, v_with_shot
	from public.app_feedback;
	raise notice '0170: app_feedback has % row(s) with tried and % with a screenshot (both 0 on a first apply).',
		v_with_tried, v_with_shot;
end $$;

commit;
