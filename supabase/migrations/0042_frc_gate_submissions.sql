-- 0042_frc_gate_submissions.sql
-- FRC Training modeling-gate submissions: the student-submitted model + the
-- teacher review that leads to completion. This is the auto-gate for the five
-- MODELING units (MDM-4 through MDM-8), the counterpart to the knowledge-quiz
-- gate (0040) for the knowledge units.
--
-- One row per (user, unit): a link to the student's pack-and-go / model, notes,
-- a status (submitted | approved | needs_revision), the reviewer's feedback,
-- and submitted/reviewed timestamps. The student owns their row and may
-- resubmit while it is not yet approved; teachers read all and set status +
-- feedback.
--
-- IMPORTANT: this table NEVER writes completion. Approving a submission
-- completes the unit ONLY by the teacher calling frc_mark_complete (0041), the
-- single completion-write path; this table just records the submission and the
-- review decision. There is no trigger and no completion RPC here.
--
-- Personal-data RLS, riding the own-row pattern (0039 / 0040): a student reads
-- and writes their OWN row; a teacher reads all and updates status/feedback.
-- The student can only ever set status='submitted' (WITH CHECK), so a student
-- can never self-approve; and only while the current row is not 'approved'
-- (USING), so an approved unit cannot be silently re-opened by the student.
--
-- Everything fails soft on the web side until this is applied: loadSubmission /
-- loadPendingSubmissions swallow the missing-table error and report
-- ready=false, so the unit's Gate shows an apply-migration note and the teacher
-- completion override on the dashboard still works.
--
-- Apply manually in the Supabase SQL editor, after 0039/0040/0041.

create table if not exists public.frc_gate_submissions (
	user_id uuid not null references auth.users (id) on delete cascade,
	unit_id text not null,
	link text not null default '',
	notes text not null default '',
	status text not null default 'submitted'
		check (status in ('submitted', 'approved', 'needs_revision')),
	reviewer_feedback text not null default '',
	submitted_at timestamptz not null default now(),
	reviewed_at timestamptz,
	primary key (user_id, unit_id)
);

create index if not exists frc_gate_submissions_status_idx
	on public.frc_gate_submissions (status, submitted_at);

-- Clients read/insert/update; visibility + write authority are enforced by the
-- RLS policies below. No DELETE grant (a submission is resubmitted, not deleted).
revoke all on public.frc_gate_submissions from anon, authenticated;
grant select, insert, update on public.frc_gate_submissions to authenticated;

alter table public.frc_gate_submissions enable row level security;

-- SELECT: own rows.
drop policy if exists "frc gate select own" on public.frc_gate_submissions;
create policy "frc gate select own"
	on public.frc_gate_submissions
	for select
	to authenticated
	using (user_id = (select auth.uid()));

-- SELECT: teachers read all (the dashboard review queue).
drop policy if exists "frc gate select teacher" on public.frc_gate_submissions;
create policy "frc gate select teacher"
	on public.frc_gate_submissions
	for select
	to authenticated
	using (public.is_teacher());

-- INSERT: a student creates their OWN submission, always as 'submitted'
-- (never self-approving).
drop policy if exists "frc gate insert own" on public.frc_gate_submissions;
create policy "frc gate insert own"
	on public.frc_gate_submissions
	for insert
	to authenticated
	with check (user_id = (select auth.uid()) and status = 'submitted');

-- UPDATE: a student may resubmit their OWN row while it is not yet approved,
-- and only back to 'submitted' (so they can never set 'approved' /
-- 'needs_revision' themselves).
drop policy if exists "frc gate update own" on public.frc_gate_submissions;
create policy "frc gate update own"
	on public.frc_gate_submissions
	for update
	to authenticated
	using (user_id = (select auth.uid()) and status <> 'approved')
	with check (user_id = (select auth.uid()) and status = 'submitted');

-- UPDATE: teachers set status (approve / needs_revision) and feedback on any
-- row. Completion itself is written separately via frc_mark_complete, never here.
drop policy if exists "frc gate update teacher" on public.frc_gate_submissions;
create policy "frc gate update teacher"
	on public.frc_gate_submissions
	for update
	to authenticated
	using (public.is_teacher())
	with check (public.is_teacher());
