-- 0102_classroom_deck_uploads.sql
-- Direct-to-Drive deck uploads: the authorization + single-use record behind
-- them. Ingestion, storage, serving and the viewer are 0101's and are untouched
-- -- only how the ZIP GETS FROM THE BROWSER TO THE SERVER changes.
--
-- WHY THE TRANSPORT HAD TO CHANGE. 0101 uploaded the zip as a multipart body to
-- /api/classroom/deck. On Vercel a serverless function's request body is capped
-- at ~4.5 MB, and a real Claude Design export measures 23.5 MB of KEPT files
-- (after the standalone/template renderings are dropped), so every real deck
-- failed at the platform before any of our code ran. That ceiling is not ours to
-- raise, so the bytes stop passing through us: the browser uploads the zip
-- straight to Drive and hands the server back only the resulting file id.
--
-- WHICH MEANS A CREDENTIAL LEAVES THE SERVER, and this migration exists to make
-- that credential narrow and single-use rather than merely short.
--
--   * WHAT THE BROWSER GETS is a Google RESUMABLE UPLOAD SESSION URI, minted
--     server-side by the school account. It can do exactly one thing: put bytes
--     into the ONE file that session creates. It cannot list, read, overwrite or
--     delete anything else in the shared drive, and it is not the refresh token
--     nor an access token -- it carries no scope and authorizes no other Drive
--     API call. See src/lib/server/notebook-drive.ts (startResumableUpload) for
--     the mechanics and for the one honest caveat: THE DRIVE API HAS NO WAY TO
--     SET A SESSION URI'S LIFETIME. Google documents them as valid for about a
--     week, and that is the narrowest available option -- so the app-side window
--     below is what actually bounds the flow, and the session URI is worth no
--     more than the ability to fill one already-authorized upload slot.
--
--   * WHAT THIS TABLE ADDS is everything the URI itself cannot carry: WHO was
--     authorized, for WHICH item, until WHEN, and whether the slot has already
--     been spent. A row is minted only after _classroom_manages_item passes, is
--     claimable exactly once, and expires on its own.
--
-- THE FILE ID IS NOT TRUSTED FROM THE CLIENT, and the claim below is only half
-- of why. A caller could name any Drive file id it liked; the row proves only
-- that this caller holds an unspent slot. So the ingest route ALSO reads the
-- file's Drive metadata and requires its NAME and PARENT to be the ones the
-- server itself set when it minted the session (deckUploadName / the deck
-- uploads staging folder) -- values a client never supplies and cannot change,
-- since a resumable PUT carries bytes only. Both halves have to agree.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere in this module: SELECT on your own
-- rows, and every write a SECURITY DEFINER RPC that re-checks the caller in its
-- own body.
--
-- Apply manually in the Supabase SQL editor, after 0101.

-- ---------------------------------------------------------------------------
-- 1. The table.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_deck_uploads (
	id uuid primary key default gen_random_uuid(),
	-- The item this slot was authorized FOR. Ingestion reads the target from
	-- HERE, never from the request, so a claim cannot be pointed at a second
	-- item after the fact.
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	created_by text not null,
	created_at timestamptz not null default now(),
	-- The window that actually bounds the flow (the session URI's own lifetime
	-- is Google's and is far longer -- see the header). Two hours is long
	-- enough for a large deck on school wifi, including a resumed upload.
	expires_at timestamptz not null default (now() + interval '2 hours'),
	-- Exactly one terminal state, or none.
	claimed_at timestamptz,
	cancelled_at timestamptz,
	-- Recorded AT CLAIM, because a resumable upload does not mint its file id
	-- until the last byte lands -- there is nothing to record any earlier.
	drive_file_id text,
	constraint classroom_deck_uploads_one_outcome
		check (claimed_at is null or cancelled_at is null),
	constraint classroom_deck_uploads_file_needs_claim
		check (drive_file_id is null or claimed_at is not null)
);

-- One Drive file may back at most one claim: a second caller naming the same
-- id is refused by the index even if it somehow got past everything else.
create unique index if not exists classroom_deck_uploads_file_idx
	on public.classroom_deck_uploads (drive_file_id)
	where drive_file_id is not null;

create index if not exists classroom_deck_uploads_item_idx
	on public.classroom_deck_uploads (item_id);

revoke all on public.classroom_deck_uploads from anon, authenticated;
grant select on public.classroom_deck_uploads to authenticated;
alter table public.classroom_deck_uploads enable row level security;

-- Own rows only. Nothing in the app reads this table today; the grant exists so
-- a slot is inspectable by the person who made it and by nobody else.
drop policy if exists "classroom deck uploads are your own" on public.classroom_deck_uploads;
create policy "classroom deck uploads are your own"
	on public.classroom_deck_uploads
	for select
	to authenticated
	using (created_by = public.current_user_email());

-- ---------------------------------------------------------------------------
-- 2. Writes.
-- ---------------------------------------------------------------------------

-- Authorizes ONE direct-to-Drive deck upload against one item.
--
-- The bar is _classroom_manages_item -- manage EVERY class the item is posted
-- to -- exactly the bar classroom_replace_deck already takes, because this is
-- the same act begun a step earlier. Passing it here does not excuse checking
-- again at ingest: authority can change while a 100 MB upload runs, and
-- classroom_replace_deck asks a second time when the deck actually lands.
create or replace function public.classroom_deck_upload_start(p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_id uuid;
	v_expires timestamptz;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if not exists (select 1 from public.classroom_items where id = p_item_id) then
		raise exception 'That item does not exist.';
	end if;
	if not public._classroom_manages_item(p_item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can attach a deck here.';
	end if;

	insert into public.classroom_deck_uploads (item_id, created_by)
	values (p_item_id, public.current_user_email())
	returning id, expires_at into v_id, v_expires;

	return jsonb_build_object('ok', true, 'upload_id', v_id, 'expires_at', v_expires);
end;
$$;

revoke all on function public.classroom_deck_upload_start(uuid) from public;
grant execute on function public.classroom_deck_upload_start(uuid) to authenticated;

-- Spends the slot, binding it to the Drive file the browser just finished
-- writing, and hands back the item it was authorized for.
--
-- ONE CONDITIONAL UPDATE does the whole thing, so two claims racing the same
-- slot cannot both win: the second matches no row and reads as already used.
-- The distinction between "no such slot" and "not yours" is deliberately NOT
-- drawn -- both answer not_found, so probing an id learns nothing.
--
-- Refusals are STRUCTURED ({ok:false, reason:...}), the convention this schema
-- uses for everything a caller has to display: an expired or already-spent slot
-- is an ordinary outcome of a long upload, not misuse.
create or replace function public.classroom_deck_upload_claim(
	p_upload_id uuid,
	p_drive_file_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_email text;
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_row public.classroom_deck_uploads%rowtype;
	v_item uuid;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	if v_file = '' or char_length(v_file) > 200 then
		raise exception 'A Drive file id is required.';
	end if;
	v_email := public.current_user_email();

	update public.classroom_deck_uploads u
	set claimed_at = now(), drive_file_id = v_file
	where u.id = p_upload_id
		and u.created_by = v_email
		and u.claimed_at is null
		and u.cancelled_at is null
		and u.expires_at > now()
	returning u.item_id into v_item;

	if v_item is null then
		-- Say WHICH ordinary thing went wrong, but only for a row this caller
		-- owns; anything else is indistinguishable from a wrong id.
		select * into v_row from public.classroom_deck_uploads
		where id = p_upload_id and created_by = v_email;
		if not found then
			return jsonb_build_object('ok', false, 'reason', 'not_found');
		end if;
		if v_row.cancelled_at is not null then
			return jsonb_build_object('ok', false, 'reason', 'cancelled');
		end if;
		if v_row.claimed_at is not null then
			return jsonb_build_object('ok', false, 'reason', 'already_used');
		end if;
		return jsonb_build_object('ok', false, 'reason', 'expired');
	end if;

	-- Asked again on purpose: the slot was authorized when the upload STARTED,
	-- and a teacher can lose a section while one runs.
	if not public._classroom_manages_item(v_item) then
		return jsonb_build_object('ok', false, 'reason', 'not_allowed');
	end if;

	return jsonb_build_object('ok', true, 'item_id', v_item);
end;
$$;

revoke all on function public.classroom_deck_upload_claim(uuid, text) from public;
grant execute on function public.classroom_deck_upload_claim(uuid, text) to authenticated;

-- Closes an unspent slot (the browser cancelled, or the upload failed for
-- good). Nothing on Drive to clean here: a resumable session that never
-- finished has produced no file, and the route deletes the zip itself in the
-- one case where one exists.
--
-- Idempotent and quiet: cancelling something already cancelled, already
-- claimed, or not yours is not an error worth surfacing to someone who has
-- already navigated away.
create or replace function public.classroom_deck_upload_cancel(p_upload_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_cancelled boolean := false;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;

	update public.classroom_deck_uploads u
	set cancelled_at = now()
	where u.id = p_upload_id
		and u.created_by = public.current_user_email()
		and u.claimed_at is null
		and u.cancelled_at is null;
	v_cancelled := found;

	return jsonb_build_object('ok', true, 'cancelled', v_cancelled);
end;
$$;

revoke all on function public.classroom_deck_upload_cancel(uuid) from public;
grant execute on function public.classroom_deck_upload_cancel(uuid) to authenticated;
