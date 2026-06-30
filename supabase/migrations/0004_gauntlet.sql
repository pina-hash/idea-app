-- 0004_gauntlet.sql
-- IDEA // GAUNTLET: the CAD skills dojo data model.
--
-- One schema serves all six challenge modes (see docs/GAUNTLET.md) so later
-- modes need no rework. Two mode families:
--   modeling  (speedrun, reverse_engineer, feature_golf) -- geometry from the
--             SolidWorks macro, later prompt; manual mass entry MVP first.
--   knowledge (drawing_reading, gdt_tolerance, spot_the_error) -- web only,
--             answer graded. Drawing Reading is built first and seeded below.
--
-- Security model:
--   * The challenge prompt (question/drawing/options) is readable by signed-in
--     students; the challenge ANSWER is withheld from clients entirely (a
--     column-level grant), so quiz answers cannot be read. Grading reads the
--     answer server-side in the gauntlet_submit SECURITY DEFINER RPC.
--   * Submissions are written ONLY by gauntlet_submit, never by direct client
--     insert, so is_correct / score cannot be forged.
--   * Teachers (profiles.role) author challenges, gated by RLS. is_teacher()
--     from 0001 is reused.
--
-- Apply manually in the Supabase SQL editor. Idempotent where practical.

-- ---------------------------------------------------------------------------
-- Mode enum (matches GauntletModeId in src/lib/gauntlet.ts)
-- ---------------------------------------------------------------------------
do $$
begin
	if not exists (select 1 from pg_type where typname = 'gauntlet_mode') then
		create type public.gauntlet_mode as enum (
			'speedrun',
			'reverse_engineer',
			'feature_golf',
			'drawing_reading',
			'gdt_tolerance',
			'spot_the_error'
		);
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- challenges
-- The single JSONB payload from the spec is split into `prompt` (public) and
-- `answer` (never granted to clients) so the answer can be hidden per column.
-- ---------------------------------------------------------------------------
create table if not exists public.challenges (
	id uuid primary key default gen_random_uuid(),
	mode public.gauntlet_mode not null,
	title text not null,
	difficulty smallint not null default 1 check (difficulty between 1 and 5),
	-- Optional pointer to an external drawing/asset. Inline-SVG challenges leave
	-- it null and carry the art in prompt->>'drawing'.
	asset_ref text,
	-- Public: question, drawing, options, display-only modeling data.
	prompt jsonb not null default '{}'::jsonb,
	-- Private (no client grant): correct key + explanation for knowledge modes;
	-- canonical volume / surface area / feature count / tolerances for modeling.
	answer jsonb not null default '{}'::jsonb,
	author_id uuid references auth.users (id) on delete set null,
	published boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists challenges_mode_published_idx
	on public.challenges (mode)
	where published;

-- Keep updated_at fresh on edit (authoring is a later prompt; cheap to add now).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

drop trigger if exists challenges_touch_updated_at on public.challenges;
create trigger challenges_touch_updated_at
	before update on public.challenges
	for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- submissions
-- score_metric is a single number where LOWER ranks better (elapsed seconds for
-- timed/knowledge modes, feature count for Feature Golf). is_correct carries
-- pass/fail; richer raw values live in `value` for audit.
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users (id) on delete cascade,
	challenge_id uuid not null references public.challenges (id) on delete cascade,
	mode public.gauntlet_mode not null,
	value jsonb not null default '{}'::jsonb,
	is_correct boolean,
	score_metric numeric,
	created_at timestamptz not null default now()
);

create index if not exists submissions_challenge_idx on public.submissions (challenge_id);
create index if not exists submissions_user_idx on public.submissions (user_id);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
-- challenges: students read published prompts (NOT the answer column); teachers
-- author (RLS limits writes to teachers). Explicit column list on SELECT keeps
-- the answer unreadable even to a crafted client query.
revoke all on public.challenges from anon, authenticated;
grant select
	(id, mode, title, difficulty, asset_ref, prompt, author_id, published, created_at, updated_at)
	on public.challenges to authenticated;
grant insert, update, delete on public.challenges to authenticated;
-- NOTE for the future authoring UI: because `answer` is withheld from the
-- SELECT grant above, a teacher insert/update must not request the `answer`
-- column back (e.g. `.insert(row).select('id')`, not `.select()`), or PostgREST
-- will raise "permission denied for column answer". The write itself is allowed.

-- submissions: clients read (own + teacher-all via RLS) but never insert
-- directly. Writes go through gauntlet_submit so scores cannot be forged.
revoke all on public.submissions from anon, authenticated;
grant select on public.submissions to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.challenges enable row level security;

drop policy if exists "read published challenges" on public.challenges;
create policy "read published challenges"
	on public.challenges
	for select
	to authenticated
	using (published or public.is_teacher());

drop policy if exists "teachers insert challenges" on public.challenges;
create policy "teachers insert challenges"
	on public.challenges
	for insert
	to authenticated
	with check (public.is_teacher());

drop policy if exists "teachers update challenges" on public.challenges;
create policy "teachers update challenges"
	on public.challenges
	for update
	to authenticated
	using (public.is_teacher())
	with check (public.is_teacher());

drop policy if exists "teachers delete challenges" on public.challenges;
create policy "teachers delete challenges"
	on public.challenges
	for delete
	to authenticated
	using (public.is_teacher());

alter table public.submissions enable row level security;

drop policy if exists "read own submissions" on public.submissions;
create policy "read own submissions"
	on public.submissions
	for select
	to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "teachers read all submissions" on public.submissions;
create policy "teachers read all submissions"
	on public.submissions
	for select
	to authenticated
	using (public.is_teacher());
-- No INSERT / UPDATE / DELETE policy on submissions: the only writer is the
-- gauntlet_submit RPC (security definer), so clients cannot forge a score.

-- ---------------------------------------------------------------------------
-- Leaderboard view (a view, not a stored table)
-- Best submission per user per challenge, then ranked within the challenge.
-- It runs with the view OWNER's privileges (the default, NOT security_invoker)
-- so every authenticated player can read the whole board; only board-safe
-- columns are exposed (player name, correctness, metric, rank), never raw
-- answer values. This is intentional and is why no `value` column is selected.
-- Because owner privileges bypass RLS, the published filter is applied
-- explicitly so draft (unpublished) challenges never surface a board.
-- ---------------------------------------------------------------------------
create or replace view public.gauntlet_leaderboard as
select
	best.challenge_id,
	best.mode,
	best.user_id,
	coalesce(p.full_name, 'Player') as player,
	best.is_correct,
	best.score_metric,
	best.created_at,
	rank() over (
		partition by best.challenge_id
		order by best.is_correct desc nulls last, best.score_metric asc nulls last, best.created_at asc
	) as rank
from (
	select distinct on (s.user_id, s.challenge_id)
		s.user_id,
		s.challenge_id,
		s.mode,
		s.is_correct,
		s.score_metric,
		s.created_at
	from public.submissions s
	order by s.user_id, s.challenge_id, s.is_correct desc nulls last, s.score_metric asc nulls last, s.created_at asc
) best
join public.profiles p on p.id = best.user_id
join public.challenges c on c.id = best.challenge_id
where c.published;

grant select on public.gauntlet_leaderboard to authenticated;

-- ---------------------------------------------------------------------------
-- Grading RPC (the only writer of submissions)
-- Knowledge modes are answer-key graded; modeling modes need the macro and are
-- not gradable yet (raised explicitly). Returns the result plus the correct key
-- and explanation for post-attempt learning.
-- ---------------------------------------------------------------------------
create or replace function public.gauntlet_submit(
	p_challenge_id uuid,
	p_value jsonb,
	p_elapsed_ms integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := (select auth.uid());
	v_challenge public.challenges%rowtype;
	v_submitted text;
	v_answer_key text;
	v_correct boolean;
	v_score numeric;
begin
	if v_uid is null then
		raise exception 'You must be signed in to submit.';
	end if;

	select * into v_challenge from public.challenges where id = p_challenge_id;
	if not found then
		raise exception 'Challenge not found.';
	end if;
	if not v_challenge.published and not public.is_teacher() then
		raise exception 'Challenge is not available.';
	end if;

	if v_challenge.mode in ('drawing_reading', 'gdt_tolerance', 'spot_the_error') then
		v_submitted := nullif(p_value ->> 'answer', '');
		v_answer_key := v_challenge.answer ->> 'correct';
		v_correct := v_submitted is not null
			and v_answer_key is not null
			and v_submitted = v_answer_key;
		-- Lower-is-better rank metric: elapsed seconds. Clamp odd values.
		v_score := round(greatest(coalesce(p_elapsed_ms, 0), 0)::numeric / 1000.0, 2);
	else
		raise exception 'This mode cannot be scored yet.';
	end if;

	insert into public.submissions (user_id, challenge_id, mode, value, is_correct, score_metric)
	values (v_uid, p_challenge_id, v_challenge.mode, coalesce(p_value, '{}'::jsonb), v_correct, v_score);

	return jsonb_build_object(
		'is_correct', v_correct,
		'correct', v_challenge.answer ->> 'correct',
		'explanation', v_challenge.answer ->> 'explanation',
		'score_metric', v_score
	);
end;
$$;

revoke all on function public.gauntlet_submit(uuid, jsonb, integer) from public;
grant execute on function public.gauntlet_submit(uuid, jsonb, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: Drawing Reading challenges
-- Authored orthographic-reading questions so the mode is usable on delivery.
-- Drawings are inline SVG (single-quoted attributes; dollar-quoted JSON below).
-- Each insert is idempotent via a title guard, so re-running is safe. author_id
-- is null (seeded content).
-- ---------------------------------------------------------------------------

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'drawing_reading', 'Count the Holes', 1,
$j${"drawing":"<svg viewBox='0 0 380 230' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><text x='40' y='24' fill='var(--green)' font-size='12'>TOP</text><rect x='40' y='32' width='300' height='72' stroke='var(--white)' stroke-width='2'/><circle cx='110' cy='68' r='16' stroke='var(--ice)' stroke-width='2'/><circle cx='190' cy='68' r='16' stroke='var(--ice)' stroke-width='2'/><circle cx='270' cy='68' r='16' stroke='var(--ice)' stroke-width='2'/><text x='40' y='140' fill='var(--green)' font-size='12'>FRONT</text><rect x='40' y='148' width='300' height='56' stroke='var(--white)' stroke-width='2'/><line x1='100' y1='148' x2='100' y2='204' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='120' y1='148' x2='120' y2='204' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='180' y1='148' x2='180' y2='204' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='200' y1='148' x2='200' y2='204' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='260' y1='148' x2='260' y2='204' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='280' y1='148' x2='280' y2='204' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/></svg>","question":"How many holes pass through this plate?","instructions":"The top view shows the plate face on; the front view shows it from the front. Read both.","options":[{"id":"a","label":"2"},{"id":"b","label":"3"},{"id":"c","label":"4"},{"id":"d","label":"5"}]}$j$::jsonb,
$j${"correct":"b","explanation":"The top view shows three circles in a row, and the front view shows three pairs of hidden (dashed) lines, one pair per hole. So the plate has three through holes."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Count the Holes');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'drawing_reading', 'Read the Hole Callout', 2,
$j${"drawing":"<svg viewBox='0 0 380 220' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><text x='40' y='24' fill='var(--green)' font-size='12'>TOP</text><rect x='40' y='34' width='300' height='150' stroke='var(--white)' stroke-width='2'/><circle cx='90' cy='84' r='14' stroke='var(--ice)' stroke-width='2'/><circle cx='290' cy='84' r='14' stroke='var(--ice)' stroke-width='2'/><circle cx='90' cy='150' r='14' stroke='var(--ice)' stroke-width='2'/><circle cx='290' cy='150' r='14' stroke='var(--ice)' stroke-width='2'/><line x1='290' y1='70' x2='322' y2='40' stroke='var(--cyan)' stroke-width='1'/><text x='340' y='34' fill='var(--cyan)' font-size='13' text-anchor='end'>4X Ø8 THRU</text></svg>","question":"The callout 4X Ø8 THRU labels these holes. How many 8 mm holes does the part have?","instructions":"Read the whole callout, not just the diameter.","options":[{"id":"a","label":"1"},{"id":"b","label":"2"},{"id":"c","label":"4"},{"id":"d","label":"8"}]}$j$::jsonb,
$j${"correct":"c","explanation":"The 4X prefix is a quantity multiplier: the Ø8 THRU hole is repeated four times. Ø8 is the diameter and THRU means it passes fully through, but the count comes from 4X, so there are four holes."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Read the Hole Callout');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'drawing_reading', 'Overall Height', 1,
$j${"drawing":"<svg viewBox='0 0 320 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><rect x='90' y='120' width='170' height='80' stroke='var(--white)' stroke-width='2'/><rect x='90' y='60' width='90' height='60' stroke='var(--white)' stroke-width='2'/><line x1='70' y1='60' x2='70' y2='120' stroke='var(--cyan)' stroke-width='1'/><line x1='66' y1='60' x2='90' y2='60' stroke='var(--cyan)' stroke-width='0.75'/><line x1='66' y1='120' x2='90' y2='120' stroke='var(--cyan)' stroke-width='0.75'/><text x='62' y='95' fill='var(--cyan)' font-size='13' text-anchor='end'>15</text><line x1='44' y1='120' x2='44' y2='200' stroke='var(--cyan)' stroke-width='1'/><line x1='40' y1='120' x2='90' y2='120' stroke='var(--cyan)' stroke-width='0.75'/><line x1='40' y1='200' x2='90' y2='200' stroke='var(--cyan)' stroke-width='0.75'/><text x='36' y='165' fill='var(--cyan)' font-size='13' text-anchor='end'>20</text><text x='150' y='226' fill='var(--green)' font-size='12'>FRONT</text></svg>","question":"No overall height is dimensioned. Using the chain of dimensions, what is the overall height of the part?","instructions":"Units are millimeters. Read the dimensions on the left of the front view.","options":[{"id":"a","label":"15"},{"id":"b","label":"20"},{"id":"c","label":"35"},{"id":"d","label":"50"}]}$j$::jsonb,
$j${"correct":"c","explanation":"Sum the stacked height dimensions in the chain: 20 plus 15 equals 35 mm. When no single overall dimension is given, you add the dimensions along that direction."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Overall Height');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'drawing_reading', 'Concentric Circles', 3,
$j${"drawing":"<svg viewBox='0 0 360 250' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><text x='60' y='24' fill='var(--green)' font-size='12'>TOP</text><rect x='60' y='32' width='240' height='80' stroke='var(--white)' stroke-width='2'/><circle cx='180' cy='72' r='24' stroke='var(--ice)' stroke-width='2'/><circle cx='180' cy='72' r='12' stroke='var(--ice)' stroke-width='2'/><line x1='180' y1='20' x2='180' y2='230' stroke='var(--cyan)' stroke-width='0.75' stroke-dasharray='10 3 2 3'/><text x='60' y='150' fill='var(--green)' font-size='12'>FRONT</text><rect x='60' y='158' width='240' height='72' stroke='var(--white)' stroke-width='2'/><line x1='156' y1='158' x2='156' y2='188' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='204' y1='158' x2='204' y2='188' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='156' y1='188' x2='168' y2='188' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='192' y1='188' x2='204' y2='188' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='168' y1='188' x2='168' y2='230' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/><line x1='192' y1='188' x2='192' y2='230' stroke='var(--dim)' stroke-width='1.5' stroke-dasharray='5 4'/></svg>","question":"This feature is two concentric circles in the top view, with a flat-bottomed wider recess above a smaller through hole in the front view. What is it?","instructions":"The front view (hidden lines) tells you the recess shape.","options":[{"id":"a","label":"A plain through hole"},{"id":"b","label":"A counterbored hole"},{"id":"c","label":"A countersunk hole"},{"id":"d","label":"A tapped (threaded) hole"}]}$j$::jsonb,
$j${"correct":"b","explanation":"Two concentric circles mark a stepped-diameter hole. The flat-bottomed, straight-walled wider recess in the front view is a counterbore, which seats a socket-head cap screw. A countersink would show an angled conical recess, and a tapped hole would carry a thread note."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Concentric Circles');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'drawing_reading', 'What the Dashes Mean', 2,
$j${"drawing":"<svg viewBox='0 0 320 200' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><text x='70' y='40' fill='var(--green)' font-size='12'>FRONT</text><rect x='70' y='50' width='180' height='110' stroke='var(--white)' stroke-width='2'/><line x1='160' y1='50' x2='160' y2='160' stroke='var(--dim)' stroke-width='2' stroke-dasharray='6 5'/><line x1='160' y1='105' x2='290' y2='80' stroke='var(--cyan)' stroke-width='1'/><text x='300' y='84' fill='var(--green)' font-size='20' text-anchor='end'>?</text></svg>","question":"What does the dashed (hidden) line marked with ? represent?","instructions":"Compare it to the solid outline of the block.","options":[{"id":"a","label":"An edge or feature hidden behind the material"},{"id":"b","label":"The centerline of a hole"},{"id":"c","label":"A dimension boundary"},{"id":"d","label":"A visible front edge"}]}$j$::jsonb,
$j${"correct":"a","explanation":"Dashed hidden lines show edges that exist but are not directly visible from that viewing direction, such as the far wall of a hole or an internal step. Centerlines use a long-short dash-dot pattern, and visible edges are drawn solid."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'What the Dashes Mean');

insert into public.challenges (mode, title, difficulty, prompt, answer)
select 'drawing_reading', 'Match the Top View', 3,
$j${"drawing":"<svg viewBox='0 0 320 240' xmlns='http://www.w3.org/2000/svg' fill='none' font-family='Share Tech Mono, monospace'><polygon points='60,160 240,160 240,90 60,90' stroke='var(--white)' stroke-width='2'/><line x1='60' y1='90' x2='96' y2='64' stroke='var(--white)' stroke-width='2'/><line x1='240' y1='90' x2='276' y2='64' stroke='var(--white)' stroke-width='2'/><line x1='96' y1='64' x2='276' y2='64' stroke='var(--white)' stroke-width='2'/><line x1='240' y1='160' x2='276' y2='134' stroke='var(--white)' stroke-width='2'/><line x1='276' y1='64' x2='276' y2='134' stroke='var(--white)' stroke-width='2'/><ellipse cx='213' cy='77' rx='16' ry='9' stroke='var(--ice)' stroke-width='2' transform='rotate(-30 213 77)'/><text x='150' y='132' fill='var(--green)' font-size='12' text-anchor='middle'>FRONT</text></svg>","question":"Looking straight down on this part, which top view is correct?","instructions":"The 3D part is a block with one hole through the top face.","options":[{"id":"a","svg":"<svg viewBox='0 0 130 90' xmlns='http://www.w3.org/2000/svg' fill='none'><rect x='20' y='25' width='90' height='42' stroke='var(--white)' stroke-width='2'/><circle cx='42' cy='46' r='9' stroke='var(--ice)' stroke-width='2'/></svg>"},{"id":"b","svg":"<svg viewBox='0 0 130 90' xmlns='http://www.w3.org/2000/svg' fill='none'><rect x='20' y='25' width='90' height='42' stroke='var(--white)' stroke-width='2'/><circle cx='88' cy='46' r='9' stroke='var(--ice)' stroke-width='2'/></svg>"},{"id":"c","svg":"<svg viewBox='0 0 130 90' xmlns='http://www.w3.org/2000/svg' fill='none'><rect x='20' y='25' width='90' height='42' stroke='var(--white)' stroke-width='2'/><circle cx='65' cy='46' r='9' stroke='var(--ice)' stroke-width='2'/></svg>"},{"id":"d","svg":"<svg viewBox='0 0 130 90' xmlns='http://www.w3.org/2000/svg' fill='none'><rect x='20' y='25' width='90' height='42' stroke='var(--white)' stroke-width='2'/><circle cx='45' cy='46' r='9' stroke='var(--ice)' stroke-width='2'/><circle cx='85' cy='46' r='9' stroke='var(--ice)' stroke-width='2'/></svg>"}]}$j$::jsonb,
$j${"correct":"b","explanation":"Viewed from directly above, the block projects as a rectangle and the single hole appears as one circle. The hole sits toward the right end in the 3D view, so the matching top view has one circle near the right end. A centered, left, or doubled circle does not match the part."}$j$::jsonb
where not exists (select 1 from public.challenges where title = 'Match the Top View');
