-- ===========================================================================
-- 0188  Two instructor requests: song links are Spotify only, and a feedback
--       report can be marked spam.
--
-- Both are POLICY changes to surfaces instructors work in every day, and both
-- are here rather than in the client because in both cases the client is not
-- the boundary: `0145` owns every rule about a song request, and `0085` owns
-- every rule about a feedback status.
--
-- ---------------------------------------------------------------------------
-- 1. THE SPOTIFY RESTRICTION, AND WHY IT IS A SECOND PREDICATE RATHER THAN A
--    NARROWING OF THE FIRST
-- ---------------------------------------------------------------------------
--
-- `0145` states, in its own header, that no service is parsed or special-cased:
-- `_classroom_song_url_ok` asks whether this is an https URL with a host and
-- never which host. THAT SENTENCE STILL DESCRIBES `_classroom_song_url_ok`.
-- What has changed is not the shape question but a POLICY question the school
-- has now answered, and the two are kept apart deliberately.
--
-- THE REASON IS THE CHECK CONSTRAINT, and it is the whole of why this file does
-- not simply tighten the existing function. `classroom_song_requests.url`
-- carries `check (... and public._classroom_song_url_ok(url))`. A CHECK is not
-- re-validated against rows already stored, but it IS re-evaluated on every
-- UPDATE of a row -- and `classroom_song_approve` UPDATEs the row it is
-- approving. So narrowing `_classroom_song_url_ok` would leave every ALREADY
-- PENDING non-Spotify request in a state where pressing Approve raises a
-- constraint violation instead of refusing in words: a raise, from inside the
-- one function in this schema that moves a coin, in front of an instructor
-- working a queue. The charge rolls back with the transaction, so no coin is
-- lost -- but "the coin is safe" is not the same as "the surface works", and a
-- SQLSTATE reaching a person is exactly what `0145`'s refusal vocabulary exists
-- to prevent.
--
-- So: `_classroom_song_url_ok` is UNTOUCHED, the constraint is UNTOUCHED, every
-- request already in the table stays approvable and rejectable exactly as it
-- was, and the new rule is asked of NEW REQUESTS ONLY, in
-- `classroom_song_request`, as an ordinary refusal beside the ones already
-- there.
--
-- THE ORDER IS THE PART THAT MATTERS FOR MONEY, AND IT IS ALREADY RIGHT.
-- `0145` moved the charge to APPROVAL and left validation at REQUEST. A link
-- this file refuses therefore never becomes a row, so it can never be approved,
-- so it can never be charged. There is no window in which a student pays for a
-- refused link -- not before this file and not after it. The refusal is added
-- ABOVE the capacity check and the insert, in the block that already holds
-- `bad_url`, so that ordering is a property of where the statement sits rather
-- than of anybody remembering it.
--
-- WHAT COUNTS AS SPOTIFY, AND WHY IT IS GENEROUS.
-- A restriction that refuses a link a student legitimately pasted teaches them
-- only that the platform is arbitrary, so the host test is deliberately wide:
--
--   * `spotify.com` and ANY subdomain of it. That is `open.spotify.com` (every
--     share link a browser or the desktop app produces), `play.spotify.com`
--     (the retired web player, still pasted), `www.spotify.com`, and every
--     `intl-<lang>` path variant, which is a PATH and so needs nothing here.
--   * `spotify.link`, the short domain the mobile app's share sheet produces.
--   * `spoti.fi`, the older branded short link, still in circulation.
--
-- Anything after the host -- `/track/<id>`, `/album/`, `/playlist/`,
-- `/artist/`, `/episode/`, `/show/`, `/intl-es/track/<id>`, a `?si=` share
-- parameter, a `?utm_source=copy-link`, a fragment -- is accepted without being
-- looked at, because `0145` stores the url exactly as typed for exactly that
-- reason: a share link's parameters are frequently the part identifying the
-- track.
--
-- WHAT IT REFUSES, AND THE ONE THAT IS NOT OBVIOUS. `spotify:track:<id>`, the
-- URI the desktop app's right-click copies, is NOT accepted -- it is not https,
-- so `_classroom_song_url_ok` already refused it before this file existed and
-- still does, with `bad_url`. The new sentence names it anyway, because a
-- student holding one needs to be told which of the two things to copy.
--
-- AND THE AUTHORITY IS PARSED, NOT SEARCHED. The pattern anchors at
-- `^https://`, allows only `[a-z0-9.-]` up to the first `/`, `?` or `#`, and
-- requires the host to END there. So `https://open.spotify.com@example.net/`
-- -- whose real host is `example.net` -- cannot match, because `@` is not in
-- the authority character set. A `like '%spotify.com%'` would have accepted it.
--
-- ---------------------------------------------------------------------------
-- 2. THE FOURTH FEEDBACK STATUS, AND WHY IT IS NOT A DELETE
-- ---------------------------------------------------------------------------
--
-- `app_feedback` has no DELETE grant and no DELETE policy for anyone, and 0085
-- is explicit that the status column does not break 0053's append-only stance
-- because nobody edits what a person wrote. A delete would break exactly that:
-- a row removed is a row no export, no count and no rate-limit forensic can
-- ever see again, on a table whose whole point is that it is the record.
--
-- A spam report is also EVIDENCE. `reporter_hash` exists to be counted (0126),
-- and a run of spam from one address is the thing that count is for; deleting
-- the rows deletes the pattern.
--
-- So `spam` is a fourth value of the status column, reached and left through
-- the SAME `app_feedback_set_status` every other status uses. THE UNDO IS FREE
-- AND NEEDS NO NEW MACHINERY: moving a row back to `new` is the same call, and
-- `reviewed_by`/`reviewed_at` record who marked it and when, in both
-- directions.
--
-- IT HIDES NOTHING BY ITSELF. The console's `all` filter still means every
-- status, and the export header still prints the filter verbatim -- so no
-- surface anywhere silently omits a spam row. What makes the feature work is
-- only that the console opens on `new`, which it already did.
--
-- ---------------------------------------------------------------------------
-- TO UNDO
-- ---------------------------------------------------------------------------
--
--   update public.app_feedback set status = 'new' where status = 'spam';
--   alter table public.app_feedback drop constraint app_feedback_status_check;
--   alter table public.app_feedback add constraint app_feedback_status_check
--     check (status in ('new', 'seen', 'resolved'));
--   -- then re-apply 0085's app_feedback_set_status and drop the song predicate:
--   drop function public._classroom_song_url_is_spotify(text);
--   -- and re-apply 0145's classroom_song_request(uuid, text, text).
--
-- The update comes FIRST: the constraint cannot be narrowed while a row holds
-- the value being removed, and a spam row moved back to `new` is recoverable
-- where a refused constraint is a failed undo.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Is this a Spotify link?
--
-- Its own predicate, named for the question it asks. `_classroom_song_url_ok`
-- asks about CONTAINMENT (is this a usable https URL) and is in the table's
-- CHECK; this asks about POLICY (may we accept this host today) and is in the
-- request path only. Two questions, two functions -- and never one function
-- answering both, which is what would make the stored rows unapprovable.
-- ---------------------------------------------------------------------------
create or replace function public._classroom_song_url_is_spotify(p_url text)
returns boolean
language sql
immutable
as $$
	-- `~*` so a pasted `HTTPS://Open.Spotify.com/...` is judged on what it means
	-- rather than on its casing, exactly as `_classroom_song_url_ok` is.
	--
	-- The authority is `[a-z0-9-]` labels separated by dots and MUST end at the
	-- first `/`, `?`, `#` or at end of string -- which is what keeps a userinfo
	-- `@` out of it, and therefore what stops
	-- `https://open.spotify.com@example.net/` from matching.
	select coalesce(p_url, '') ~*
		'^https://([a-z0-9-]+\.)*(spotify\.com|spotify\.link|spoti\.fi)([/?#].*)?$';
$$;

comment on function public._classroom_song_url_is_spotify(text) is
'Is this url a Spotify link? Accepts spotify.com and any subdomain of it (open., play., www.), plus the spotify.link and spoti.fi short domains, with any path, query or fragment. Refuses everything else, including the spotify: URI form, which is not https and which _classroom_song_url_ok already refuses.

THIS IS POLICY, NOT SHAPE, AND IT IS DELIBERATELY NOT IN THE TABLE CHECK. _classroom_song_url_ok stays the containment rule and stays in the constraint, so every request stored before this predicate existed remains approvable -- a CHECK is re-evaluated on UPDATE, and classroom_song_approve updates the row it approves.';

revoke all on function public._classroom_song_url_is_spotify(text)
	from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The request path asks it, before anything is written and long before
--    anything is charged.
--
-- `create or replace` at the IDENTICAL signature -- no parameter is added, so
-- the signature trap does not apply and no drop is needed. The body below is
-- `0145`'s verbatim with ONE block inserted; everything else, comments
-- included, is unchanged so the two files diff cleanly.
-- ---------------------------------------------------------------------------
create or replace function public.classroom_song_request(
	p_section_id uuid,
	p_url text,
	p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
	v_email text := public.current_user_email();
	v_url text := btrim(coalesce(p_url, ''));
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_cap integer := public._classroom_song_pending_cap();
	v_pending integer;
	v_id uuid;
	v_created timestamptz;
begin
	if v_email = '' then
		raise exception 'You must be signed in.';
	end if;

	-- A section this caller cannot see and one that does not exist answer the
	-- same way, so an id cannot be probed through the write path either.
	if p_section_id is null or not public.classroom_can_read_section(p_section_id) then
		raise exception 'That class does not exist.';
	end if;

	-- AN INSTRUCTOR DOES NOT REQUEST A SONG, and this is not covered by the
	-- enrollment check below: instructors enroll themselves to see a class the
	-- way a student does, and roster imports sweep them in (`0138`). So the
	-- manage question is asked separately and first. An instructor who wants a
	-- song plays one; there is nobody to charge and nobody to review it.
	if public.classroom_manages_section(p_section_id) then
		return jsonb_build_object('ok', false, 'reason', 'not_a_student');
	end if;

	if not public.classroom_is_enrolled(p_section_id) then
		raise exception 'Only a student enrolled in this class can request a song.';
	end if;

	-- A REFUSAL, NOT A RAISE. A mistyped link is an ordinary thing that happens
	-- to somebody mid-task, and the surface has to render it where they are
	-- working rather than as an error.
	if not public._classroom_song_url_ok(v_url) then
		return jsonb_build_object('ok', false, 'reason', 'bad_url');
	end if;
	-- ------------------------------------------------------------------
	-- 0188: THE SPOTIFY RULE, ASKED HERE AND NOWHERE ELSE.
	--
	-- ABOVE the capacity check, above the lock and above the insert, so a
	-- refused link never becomes a row -- which is what makes it impossible
	-- for one to reach `classroom_song_approve` and be charged for. The
	-- charge lives at approval (`0145`), and there is no path from here to
	-- there that does not go through the insert below.
	--
	-- AFTER `bad_url`, so somebody who pasted something that is not a link
	-- at all is told that rather than being told it is not Spotify.
	-- ------------------------------------------------------------------
	if not public._classroom_song_url_is_spotify(v_url) then
		return jsonb_build_object('ok', false, 'reason', 'not_spotify');
	end if;
	if char_length(v_url) > 2000 then
		return jsonb_build_object('ok', false, 'reason', 'url_too_long', 'max', 2000);
	end if;
	if v_note is not null and char_length(v_note) > 300 then
		return jsonb_build_object('ok', false, 'reason', 'note_too_long', 'max', 300);
	end if;

	-- ------------------------------------------------------------------
	-- THE CAPACITY CHECK. See `0145`'s header: this is the enforcement, not
	-- the UI, and the LOCK is what makes it one.
	--
	-- The enrollment row is the parent, it is guaranteed to exist (the
	-- composite foreign key on this table requires it), and holding it for
	-- the rest of the transaction is what serializes two submits from the
	-- same student. The count is taken AFTER the lock, never before: under
	-- READ COMMITTED the statement after the wait gets a fresh snapshot, so
	-- it genuinely sees the winner's committed row.
	-- ------------------------------------------------------------------
	perform 1 from public.classroom_enrollments e
	where e.section_id = p_section_id and e.student_email = v_email
	for update;

	select count(*)::integer into v_pending
	from public.classroom_song_requests r
	where r.section_id = p_section_id and r.student_email = v_email and r.decided_at is null;

	if v_pending >= v_cap then
		-- THE NUMBERS RIDE ALONG so the sentence can name the cap. A refusal that
		-- says only "no" leaves a student guessing at a rule nothing states.
		return jsonb_build_object(
			'ok', false, 'reason', 'pending_cap', 'cap', v_cap, 'pending', v_pending
		);
	end if;

	insert into public.classroom_song_requests (section_id, student_email, url, note)
	values (p_section_id, v_email, v_url, v_note)
	returning id, created_at into v_id, v_created;

	return jsonb_build_object(
		'ok', true,
		'request_id', v_id,
		'section_id', p_section_id,
		'url', v_url,
		'note', v_note,
		'created_at', v_created,
		'status', 'pending',
		'pending', v_pending + 1,
		'cap', v_cap
	);
end;
$$;

comment on function public.classroom_song_request(uuid, text, text) is
'Files one song request for the calling student in the named section, or refuses.

TAKES NO IDENTITY PARAMETER: the requester is current_user_email(), so "can only ask as yourself" is a property of the signature. Refuses not_a_student for anyone who manages the section, pending_cap at the per-student cap (holding the enrollment row so two submits cannot both pass), and note_too_long / url_too_long over the caps.

THE LINK IS JUDGED TWICE, BY TWO DIFFERENT QUESTIONS. _classroom_song_url_ok asks whether it is a usable https URL and answers bad_url; _classroom_song_url_is_spotify (0188) asks whether the school accepts that host and answers not_spotify. Both are asked BEFORE the insert, so a refused link never becomes a row, never reaches classroom_song_approve, and can never be charged for -- the charge is at approval, and there is no other way in.';

revoke all on function public.classroom_song_request(uuid, text, text)
	from public, anon, authenticated, service_role;
grant execute on function public.classroom_song_request(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The fourth feedback status.
--
-- The constraint is dropped and re-added rather than guarded on the catalog,
-- because unlike 0126 and 0170 this is not an ADD of a constraint that may
-- already be there -- it is a REPLACEMENT of one that certainly is, and
-- `drop constraint if exists` before `add constraint` is idempotent on its own.
-- The name is 0085's own, which Postgres derived from the column.
--
-- NOTHING IS BACKFILLED. No row can already hold 'spam', so the widened
-- constraint validates against the live table with nothing to strand -- which
-- is the direction a status widening always goes, and the reason it needs no
-- count and no refusal the way a narrowing would.
-- ---------------------------------------------------------------------------
do $$
begin
	if not exists (
		select 1 from pg_constraint
		where conrelid = 'public.app_feedback'::regclass
			and conname = 'app_feedback_status_check'
	) then
		raise exception
			'0188: app_feedback_status_check is not on app_feedback -- 0085 section 13 has not been applied, or the constraint was renamed. Refusing rather than adding a second, differently named status check beside whatever is really there.';
	end if;
end;
$$;

alter table public.app_feedback drop constraint if exists app_feedback_status_check;
alter table public.app_feedback
	add constraint app_feedback_status_check
	check (status in ('new', 'seen', 'resolved', 'spam'));

-- `create or replace` at the identical signature. 0085's body verbatim with the
-- fourth value in both the guard and its sentence.
create or replace function public.app_feedback_set_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_status text := lower(btrim(coalesce(p_status, '')));
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	if not public.is_admin() then
		raise exception 'Only a site admin can triage feedback.';
	end if;
	-- 0188 adds `spam`. It is a status like the other three and NOT a delete:
	-- the row stays, the export can still be pointed at it, and moving it back
	-- to `new` is this same call with a different argument.
	if v_status not in ('new', 'seen', 'resolved', 'spam') then
		raise exception 'Status must be new, seen, resolved or spam.';
	end if;

	update public.app_feedback
	set status = v_status,
		reviewed_at = now(),
		reviewed_by = public.current_user_email()
	where id = p_id;
	if not found then
		raise exception 'That feedback does not exist.';
	end if;

	return jsonb_build_object('ok', true, 'id', p_id, 'status', v_status);
end;
$$;

comment on function public.app_feedback_set_status(uuid, text) is
'Moves one feedback report between new, seen, resolved and spam (0188). Admin only, and the ONLY write path for the column -- app_feedback carries no update grant and no update policy for anyone.

SPAM IS A STATUS, NOT A DELETE. The row is not removed and cannot be: this table has no delete grant, its rows are the record, and a reporter_hash that exists to be counted is only countable while its rows are there. Marking spam is reversible by this same call, and reviewed_by/reviewed_at record who did it in either direction.';

revoke all on function public.app_feedback_set_status(uuid, text)
	from public, anon, authenticated, service_role;
grant execute on function public.app_feedback_set_status(uuid, text) to authenticated;

-- ===========================================================================
-- 4. Self-check: every claim above read back out of the catalog, plus a
--    behavioural probe of the new predicate over the forms this file promises
--    to accept and refuse. Raises, and so rolls the whole file back, if any of
--    them is false.
--
-- THE PREDICATE IS PROBED RATHER THAN INSPECTED. Reading the function's source
-- back would only prove the text landed; putting the real share-link forms
-- through it is what proves the pattern says what the header claims.
-- ===========================================================================
do $$
declare
	v_accept constant text[] := array[
		'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
		'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3',
		'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
		'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
		'https://open.spotify.com/episode/512ojhOuo1ktJprKbVcKyQ',
		'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk',
		'https://open.spotify.com/intl-es/track/4cOdK2wGLETKBW3PvgPWqT',
		'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123def456',
		'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=a&utm_source=copy-link',
		'https://spotify.link/aBcDeFgHiJ',
		'https://spoti.fi/3xYzAbC',
		'https://play.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
		'https://www.spotify.com/us/premium/',
		'https://spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
		-- Casing is judged on meaning, exactly as `_classroom_song_url_ok` does.
		'HTTPS://Open.Spotify.COM/track/4cOdK2wGLETKBW3PvgPWqT'
	];
	v_refuse constant text[] := array[
		'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
		'https://youtu.be/dQw4w9WgXcQ',
		'https://soundcloud.com/artist/track',
		'https://music.apple.com/us/album/x/1',
		-- Not https, so `_classroom_song_url_ok` refuses it first anyway. Named
		-- here so the two predicates are known to agree about it.
		'spotify:track:4cOdK2wGLETKBW3PvgPWqT',
		-- THE LOOKALIKES. Each of these contains the string `spotify.com` and
		-- none of them is Spotify.
		'https://open.spotify.com@example.net/track/1',
		'https://open.spotify.com.example.net/track/1',
		'https://notspotify.com/track/1',
		'https://example.net/https://open.spotify.com/track/1',
		'https://spotify.com.br.example.net/',
		'',
		null
	];
	v_url text;
	v_n integer;
	v_bad text;
begin
	-- The new predicate exists and is closed to every client role.
	if not exists (
		select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.proname = '_classroom_song_url_is_spotify'
	) then
		raise exception '0188: _classroom_song_url_is_spotify was not created.';
	end if;
	if has_function_privilege('anon', 'public._classroom_song_url_is_spotify(text)', 'execute')
	or has_function_privilege('authenticated', 'public._classroom_song_url_is_spotify(text)', 'execute') then
		raise exception '0188: _classroom_song_url_is_spotify must not be granted to a client role.';
	end if;

	-- Exactly one arity of the request function, so nothing resolves to an old
	-- overload that never learned the rule.
	select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
	where n.nspname = 'public' and p.proname = 'classroom_song_request';
	if v_n <> 1 then
		raise exception '0188: expected exactly one classroom_song_request, found %.', v_n;
	end if;

	-- THE BEHAVIOURAL PROBE, both directions.
	foreach v_url in array v_accept loop
		if not public._classroom_song_url_is_spotify(v_url) then
			raise exception '0188: the Spotify predicate refuses a link it must accept: %', v_url;
		end if;
		-- And every accepted form must still be a usable https url, or the
		-- request path would refuse it one line earlier with `bad_url`.
		if not public._classroom_song_url_ok(v_url) then
			raise exception '0188: _classroom_song_url_ok refuses an accepted Spotify form: %', v_url;
		end if;
	end loop;
	foreach v_url in array v_refuse loop
		if coalesce(public._classroom_song_url_is_spotify(v_url), false) then
			raise exception '0188: the Spotify predicate accepts a link it must refuse: %', v_url;
		end if;
	end loop;

	-- THE CONSTRAINT NOW ADMITS FOUR VALUES AND STILL REFUSES A FIFTH. Read as
	-- the definition rather than by writing rows, so the probe cannot leave one
	-- behind on a re-apply.
	select pg_get_constraintdef(oid) into v_bad from pg_constraint
	where conrelid = 'public.app_feedback'::regclass and conname = 'app_feedback_status_check';
	if v_bad is null then
		raise exception '0188: app_feedback_status_check is missing after the replacement.';
	end if;
	if v_bad not like '%spam%' or v_bad not like '%resolved%'
		or v_bad not like '%seen%' or v_bad not like '%new%' then
		raise exception '0188: app_feedback_status_check does not admit all four statuses: %', v_bad;
	end if;

	-- The status RPC is still admin-only and still granted the same way.
	if has_function_privilege('anon', 'public.app_feedback_set_status(uuid, text)', 'execute') then
		raise exception '0188: app_feedback_set_status must not be granted to anon.';
	end if;
	if not has_function_privilege('authenticated', 'public.app_feedback_set_status(uuid, text)', 'execute') then
		raise exception '0188: app_feedback_set_status must stay granted to authenticated.';
	end if;

	select count(*) into v_n from public.app_feedback where status = 'spam';
	raise notice '0188: applied. Spotify forms probed: % accepted, % refused. Feedback rows already marked spam: % (expected 0 on a first apply).',
		array_length(v_accept, 1), array_length(v_refuse, 1), v_n;
end;
$$;
