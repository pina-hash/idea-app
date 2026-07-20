-- 0053_app_feedback.sql
-- Shared in-app feedback / suggestion box, backing src/lib/feedback/.
--
-- Deliberately APP-AGNOSTIC (one table, an `app` discriminator column) rather
-- than one table per game: GREENLINE is the first consumer and VANGUARD is the
-- intended second, and a single queue is what makes "what are players telling
-- us this week" one query instead of a union that grows with every new surface.
--
-- Write model: a feedback row is a comment about YOURSELF. Nothing here is
-- forgeable — there is no score, no grade, no cross-user effect — so this is a
-- direct RLS-scoped insert with NO RPC (the fsp_item_opens / fsp_frc_interest
-- doctrine, not the gauntlet_submit one). The WITH CHECK pins user_id to
-- auth.uid(), so a client cannot file feedback as somebody else.
--
-- No UPDATE or DELETE grant at all: feedback is an append-only log. A player
-- who wants to correct themselves sends a second note (the box offers exactly
-- that), which is also a truer record than a silently edited one.
--
-- Reads: own rows, plus teachers read everything (is_teacher(), from 0001) so
-- the queue can be surfaced on the dashboard later. No admin UI ships with this
-- migration; the table is the deliverable.
--
-- Apply manually in the Supabase SQL editor, after 0052.

create table if not exists public.app_feedback (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	created_at timestamptz not null default now(),
	-- Which app ('greenline', 'vanguard', ...). Free-form text, the track_id
	-- doctrine: the catalog of apps lives in code and grows without a migration.
	app text not null check (length(trim(app)) > 0),
	-- Which surface within that app ('title', 'garage', 'race', 'results').
	context text,
	-- Kept deliberately short; mirrored by FEEDBACK_KINDS in feedback.ts.
	kind text not null check (kind in ('bug', 'idea', 'praise', 'other')),
	-- The length cap mirrors FEEDBACK_MAX_LEN client-side (which is convenience;
	-- this CHECK is the boundary).
	message text not null check (
		length(trim(message)) > 0 and length(message) <= 2000
	),
	-- Free-form context the calling surface attaches (build, track, screen
	-- state). A debugging aid only: it is client-reported, never authoritative.
	meta jsonb not null default '{}'::jsonb
);

create index if not exists app_feedback_queue_idx
	on public.app_feedback (app, created_at desc);

create index if not exists app_feedback_user_idx
	on public.app_feedback (user_id, created_at desc);

revoke all on public.app_feedback from anon, authenticated;
grant select, insert on public.app_feedback to authenticated;

alter table public.app_feedback enable row level security;

drop policy if exists "insert own feedback" on public.app_feedback;
create policy "insert own feedback"
	on public.app_feedback
	for insert
	to authenticated
	with check (user_id = (select auth.uid()));

drop policy if exists "select own feedback" on public.app_feedback;
create policy "select own feedback"
	on public.app_feedback
	for select
	to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "teachers select all feedback" on public.app_feedback;
create policy "teachers select all feedback"
	on public.app_feedback
	for select
	to authenticated
	using (public.is_teacher());

-- No UPDATE / DELETE policies: append-only by design.
