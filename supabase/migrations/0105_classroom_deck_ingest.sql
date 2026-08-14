-- 0105_classroom_deck_ingest.sql
-- Deck ingestion in bounded STAGES, because doing it in one request does not
-- finish.
--
-- WHAT FAILED. 0101/0102 unpack a deck inside a single POST /api/classroom/deck:
-- download the staged zip from Drive, and push every file back to Drive one at a
-- time. A real 43 MB export carrying three 5-8 MB gifs is well over a minute of
-- round trips to Google, so the serverless function's DURATION limit -- not
-- memory, which 0101 already bounded to one file -- kills the request partway
-- and the browser sees a dropped connection after a upload that actually
-- succeeded. Raising a timeout is not available: the ceiling is the platform's.
--
-- SO NO SINGLE REQUEST HAS TO FINISH THE JOB. A job row holds the plan and the
-- manifest so far; the client calls back until the plan is exhausted, and each
-- call does as much as fits in its own time budget. That makes the work
-- RESUMABLE by construction: an interrupted stage loses at most the file it was
-- in the middle of, and the next call picks up from files_done.
--
-- NOTHING ABOUT WHAT IS STORED CHANGES. The same planner decides the same
-- files (standalone/template renderings skipped, the hidden
-- .image-slots.state.json kept, a traversing path refused), the same
-- classroom_replace_deck writes the same manifest, and the deck a student ends
-- up reading is byte-identical to the one the single-request path produced.
-- Only WHEN the work happens moved.
--
-- THE JOB IS NOT A SECOND AUTHORIZATION. It can only be minted against an
-- upload slot (0102) that this caller has already SPENT on this exact Drive
-- file, and every stage re-asks _classroom_manages_item -- so an ingest cannot
-- outlive the authority that started it, which matters more here than it did
-- before precisely because the work now spans minutes and several requests.
--
-- CLEANUP IS THE ROUTE'S, REPORTED FROM HERE -- the 0101 `orphaned` convention.
-- Postgres cannot delete a Drive file, so abandoning a job hands back the two
-- ids that have to go: the deck folder (whose deletion takes every file
-- uploaded under it, recorded or not, so a crashed stage cannot leave a stray)
-- and the staged zip.
--
-- ZERO CLIENT WRITE GRANTS, as everywhere in this module.
--
-- Apply manually in the Supabase SQL editor, after 0104.

-- ---------------------------------------------------------------------------
-- 1. The job.
-- ---------------------------------------------------------------------------

create table if not exists public.classroom_deck_ingest_jobs (
	id uuid primary key default gen_random_uuid(),
	-- The spent slot this job came from. One job per slot: a slot is single-use,
	-- so a second job against it would be a second ingest of one authorization.
	upload_id uuid not null unique
		references public.classroom_deck_uploads (id) on delete cascade,
	item_id uuid not null references public.classroom_items (id) on delete cascade,
	created_by text not null,
	title text not null,
	-- The staged archive being unpacked, deleted when the job ends either way.
	drive_zip_file_id text not null,
	-- Where the unpacked files are going. Deleting it sweeps them all.
	drive_folder_id text not null,
	-- The planner's whole answer: entry path, thumbnail, state-file flag,
	-- slides, warnings, and the file list with each entry's offsets. Stored so
	-- later stages need not re-read the archive's directory (and, more to the
	-- point, so they cannot re-plan it differently).
	plan jsonb not null,
	total_files integer not null check (total_files >= 0),
	files_done integer not null default 0 check (files_done >= 0),
	-- What has actually been uploaded, in plan order. The manifest
	-- classroom_replace_deck is finally handed.
	manifest jsonb not null default '[]'::jsonb,
	state text not null default 'uploading'
		check (state in ('uploading', 'done', 'abandoned')),
	-- Set when a stage takes work and cleared when it reports back. TRUE on
	-- arrival means the previous stage did not finish, which is the signal to
	-- reconcile against Drive before uploading anything again.
	stage_open boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	-- Long enough for a 150 MB deck on school wifi, short enough that an
	-- abandoned job is not mistaken for a live one.
	expires_at timestamptz not null default (now() + interval '2 hours'),
	constraint classroom_deck_ingest_done_is_complete
		check (state <> 'done' or files_done = total_files)
);

create index if not exists classroom_deck_ingest_item_idx
	on public.classroom_deck_ingest_jobs (item_id, state);

revoke all on public.classroom_deck_ingest_jobs from anon, authenticated;
grant select on public.classroom_deck_ingest_jobs to authenticated;
alter table public.classroom_deck_ingest_jobs enable row level security;

-- Own rows only. Nothing in the app reads this table directly -- every stage
-- goes through an RPC -- so the grant exists only so a job is inspectable by
-- the person running it.
drop policy if exists "classroom deck ingest jobs are your own" on public.classroom_deck_ingest_jobs;
create policy "classroom deck ingest jobs are your own"
	on public.classroom_deck_ingest_jobs
	for select
	to authenticated
	using (created_by = public.current_user_email());

-- ---------------------------------------------------------------------------
-- 2. Stages.
-- ---------------------------------------------------------------------------

-- The one authorization every stage re-runs: this job is mine, it is still
-- live, and I still manage every class its item is posted to.
create or replace function public._classroom_deck_job(p_job_id uuid)
returns public.classroom_deck_ingest_jobs
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_job public.classroom_deck_ingest_jobs%rowtype;
begin
	if (select auth.uid()) is null then
		raise exception 'You must be signed in.';
	end if;
	select * into v_job from public.classroom_deck_ingest_jobs
	where id = p_job_id and created_by = public.current_user_email();
	if not found then
		-- "Not yours" and "no such job" answer the same, so probing learns
		-- nothing (the 0102 claim convention).
		raise exception 'That deck upload could not be found. Start the upload again.';
	end if;
	if not public._classroom_manages_item(v_job.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can attach a deck here.';
	end if;
	return v_job;
end;
$$;

revoke all on function public._classroom_deck_job(uuid) from public;

-- Opens the job, once the route has spent a slot, proved the file and planned
-- the archive.
--
-- Refuses unless the slot is one THIS caller claimed FOR THIS FILE: the job
-- carries the item, and taking it from a spent slot rather than from the
-- request is what stops a job being pointed somewhere its authorization never
-- covered.
--
-- Any earlier live job on the same item is abandoned and its Drive ids come
-- back for the route to sweep -- a teacher who gave up halfway and started
-- again must not leave the first attempt's folder behind.
create or replace function public.classroom_deck_ingest_begin(
	p_upload_id uuid,
	p_drive_file_id text,
	p_drive_folder_id text,
	p_title text,
	p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_email text;
	v_slot public.classroom_deck_uploads%rowtype;
	v_title text := left(btrim(coalesce(p_title, '')), 200);
	v_folder text := btrim(coalesce(p_drive_folder_id, ''));
	v_file text := btrim(coalesce(p_drive_file_id, ''));
	v_total integer;
	v_id uuid;
	v_superseded jsonb := '[]'::jsonb;
begin
	if v_uid is null then
		raise exception 'You must be signed in.';
	end if;
	v_email := public.current_user_email();

	select * into v_slot from public.classroom_deck_uploads
	where id = p_upload_id and created_by = v_email;
	if not found or v_slot.claimed_at is null or v_slot.drive_file_id is distinct from v_file then
		raise exception 'That deck upload could not be found. Start the upload again.';
	end if;
	if not public._classroom_manages_item(v_slot.item_id) then
		raise exception 'Only the teacher of record for every class this is posted to can attach a deck here.';
	end if;
	if v_folder = '' then
		raise exception 'A Drive folder id is required.';
	end if;
	if jsonb_typeof(coalesce(p_plan->'files', 'null'::jsonb)) <> 'array' then
		raise exception 'The deck plan must carry a list of files.';
	end if;
	v_total := jsonb_array_length(p_plan->'files');
	if v_total = 0 then
		raise exception 'A deck must contain at least one file.';
	end if;
	if v_total > 500 then
		raise exception 'A deck may contain at most 500 files (this one has %).', v_total;
	end if;
	if v_title = '' then
		v_title := 'Presentation';
	end if;

	-- Whatever the previous attempt on this item left behind.
	select coalesce(jsonb_agg(jsonb_build_object(
		'drive_folder_id', j.drive_folder_id,
		'drive_zip_file_id', j.drive_zip_file_id
	)), '[]'::jsonb)
	into v_superseded
	from public.classroom_deck_ingest_jobs j
	where j.item_id = v_slot.item_id and j.state = 'uploading';

	update public.classroom_deck_ingest_jobs
	set state = 'abandoned', stage_open = false, updated_at = now()
	where item_id = v_slot.item_id and state = 'uploading';

	insert into public.classroom_deck_ingest_jobs
		(upload_id, item_id, created_by, title, drive_zip_file_id, drive_folder_id, plan, total_files)
	values (p_upload_id, v_slot.item_id, v_email, v_title, v_file, v_folder, p_plan, v_total)
	returning id into v_id;

	return jsonb_build_object(
		'ok', true,
		'job_id', v_id,
		'item_id', v_slot.item_id,
		'total_files', v_total,
		'superseded', v_superseded
	);
end;
$$;

revoke all on function public.classroom_deck_ingest_begin(uuid, text, text, text, jsonb) from public;
grant execute on function public.classroom_deck_ingest_begin(uuid, text, text, text, jsonb) to authenticated;

-- Takes the next slice of work: what is left to upload, and where from.
--
-- Marks the stage OPEN, so the next caller can tell an interrupted stage from a
-- clean one and reconcile against Drive before re-uploading anything.
create or replace function public.classroom_deck_ingest_claim_stage(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_job public.classroom_deck_ingest_jobs%rowtype;
	v_resuming boolean;
begin
	v_job := public._classroom_deck_job(p_job_id);
	if v_job.state = 'done' then
		return jsonb_build_object('ok', false, 'reason', 'already_finished');
	end if;
	if v_job.state <> 'uploading' then
		return jsonb_build_object('ok', false, 'reason', 'abandoned');
	end if;
	if v_job.expires_at <= now() then
		return jsonb_build_object('ok', false, 'reason', 'expired');
	end if;

	v_resuming := v_job.stage_open;

	update public.classroom_deck_ingest_jobs
	set stage_open = true, updated_at = now()
	where id = p_job_id;

	return jsonb_build_object(
		'ok', true,
		'job_id', v_job.id,
		'item_id', v_job.item_id,
		'drive_zip_file_id', v_job.drive_zip_file_id,
		'drive_folder_id', v_job.drive_folder_id,
		'plan', v_job.plan,
		'files_done', v_job.files_done,
		'total_files', v_job.total_files,
		-- TRUE when the previous stage never reported back.
		'resuming', v_resuming
	);
end;
$$;

revoke all on function public.classroom_deck_ingest_claim_stage(uuid) from public;
grant execute on function public.classroom_deck_ingest_claim_stage(uuid) to authenticated;

-- Records files this stage actually stored, in plan order, and closes the
-- stage.
--
-- files_done is advanced by what ARRIVED rather than set from a number the
-- caller reports, so the manifest and the counter cannot drift: the manifest IS
-- the progress.
create or replace function public.classroom_deck_ingest_record(
	p_job_id uuid,
	p_files jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_job public.classroom_deck_ingest_jobs%rowtype;
	v_added integer;
	v_done integer;
begin
	v_job := public._classroom_deck_job(p_job_id);
	if v_job.state <> 'uploading' then
		return jsonb_build_object('ok', false, 'reason', 'not_open');
	end if;
	if jsonb_typeof(coalesce(p_files, 'null'::jsonb)) <> 'array' then
		raise exception 'Recorded deck files must be a list.';
	end if;
	v_added := jsonb_array_length(p_files);
	v_done := v_job.files_done + v_added;
	if v_done > v_job.total_files then
		raise exception 'This deck upload recorded more files than it planned.';
	end if;

	update public.classroom_deck_ingest_jobs
	set manifest = v_job.manifest || p_files,
		files_done = v_done,
		stage_open = false,
		updated_at = now()
	where id = p_job_id;

	return jsonb_build_object(
		'ok', true,
		'files_done', v_done,
		'total_files', v_job.total_files,
		'complete', v_done = v_job.total_files
	);
end;
$$;

revoke all on function public.classroom_deck_ingest_record(uuid, jsonb) from public;
grant execute on function public.classroom_deck_ingest_record(uuid, jsonb) to authenticated;

-- The last stage: hands the accumulated manifest to classroom_replace_deck.
--
-- NESTED SECURITY DEFINER, the coin-economy convention: _classroom_manages_item
-- and current_user_email() read the session's JWT claims rather than the
-- executing role, so the inner call is authorized as the same teacher -- and
-- asks a THIRD time, which is the point of doing it through the real RPC
-- instead of writing the rows here.
--
-- Refuses an incomplete job outright: half a deck stored as a whole one is the
-- exact failure staging exists to make impossible.
create or replace function public.classroom_deck_ingest_finish(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_job public.classroom_deck_ingest_jobs%rowtype;
	v_result jsonb;
begin
	v_job := public._classroom_deck_job(p_job_id);
	if v_job.state = 'done' then
		return jsonb_build_object('ok', false, 'reason', 'already_finished');
	end if;
	if v_job.state <> 'uploading' then
		return jsonb_build_object('ok', false, 'reason', 'abandoned');
	end if;
	if v_job.files_done <> v_job.total_files then
		return jsonb_build_object(
			'ok', false, 'reason', 'incomplete',
			'files_done', v_job.files_done, 'total_files', v_job.total_files
		);
	end if;

	v_result := public.classroom_replace_deck(
		v_job.item_id,
		v_job.title,
		v_job.plan->>'entryPath',
		v_job.drive_folder_id,
		v_job.manifest,
		nullif(v_job.plan->>'thumbnailPath', ''),
		coalesce((v_job.plan->>'hasStateFile')::boolean, false),
		case when jsonb_typeof(coalesce(v_job.plan->'slides', 'null'::jsonb)) = 'array'
			then v_job.plan->'slides' else '[]'::jsonb end
	);

	update public.classroom_deck_ingest_jobs
	set state = 'done', stage_open = false, updated_at = now()
	where id = p_job_id;

	-- The staged zip rides back so the route sweeps it on the same trip it
	-- sweeps whatever deck this one replaced.
	return v_result || jsonb_build_object('drive_zip_file_id', v_job.drive_zip_file_id);
end;
$$;

revoke all on function public.classroom_deck_ingest_finish(uuid) from public;
grant execute on function public.classroom_deck_ingest_finish(uuid) to authenticated;

-- Gives up on a job and reports what Drive still holds.
--
-- Deleting the deck FOLDER is what makes "no orphaned Drive files" true rather
-- than approximately true: it takes every file uploaded under it, including any
-- a stage stored just before it was interrupted and never got to record.
--
-- Idempotent and quiet -- someone whose browser has already gone cannot act on
-- a failure here -- and deliberately callable on a job that is already done, in
-- which case it reports only the zip, never the folder a live deck now depends
-- on.
create or replace function public.classroom_deck_ingest_abandon(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_job public.classroom_deck_ingest_jobs%rowtype;
begin
	v_job := public._classroom_deck_job(p_job_id);

	if v_job.state = 'uploading' then
		update public.classroom_deck_ingest_jobs
		set state = 'abandoned', stage_open = false, updated_at = now()
		where id = p_job_id;
	end if;

	return jsonb_build_object(
		'ok', true,
		'abandoned', v_job.state = 'uploading',
		'drive_zip_file_id', v_job.drive_zip_file_id,
		-- Never the folder of a finished job: those files ARE the deck now.
		'drive_folder_id', case when v_job.state = 'done' then null else v_job.drive_folder_id end
	);
end;
$$;

revoke all on function public.classroom_deck_ingest_abandon(uuid) from public;
grant execute on function public.classroom_deck_ingest_abandon(uuid) to authenticated;
