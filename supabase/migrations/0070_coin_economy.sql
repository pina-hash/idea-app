-- 0070_coin_economy.sql
-- IDEA Coin economy: the real Supabase foundation, replacing the Google
-- Sheets / Apps Script ledger as the source of truth. FOUNDATION ONLY --
-- schema, pricing, and the enforcement rules, plus the admin balance-linking
-- tool. NOT the entry UI (the student/teacher-facing logging surface is a
-- later pass that will be rebuilt on top of what's here) and NOT wired to
-- coin-entry.html, static/coins/index.html, or any /api/coin-ledger/* route
-- -- those keep talking to the Sheets ledger exactly as before. This is a
-- second, independent coin system living alongside the old one until the
-- entry tool is rebuilt on it.
--
-- Every category name, price, and rule below is pulled directly from
-- docs/coin-economy/idea_coin_economy_draft_v3.md and
-- idea_coin_quick_reference.md (the "v3, zero-disruption pass" documents).
-- Read those before changing a price here -- this migration is a straight
-- transcription of Parts 2-5, not a reinterpretation.
--
-- ---------------------------------------------------------------------------
-- DESIGN DOCTRINE
-- ---------------------------------------------------------------------------
--
-- 1. BALANCE IS DERIVED, NEVER STORED. coin_balances is a view over
--    coin_transactions (sum of signed amount, grouped by email), not a
--    mutable row anyone writes to directly. This is the same tradeoff the
--    rest of this codebase makes for anything ledger-shaped (gauntlet
--    leaderboards, GREENLINE's reward ledger): every coin a student has is
--    traceable to exactly one insert with an actor, a reason, and a
--    timestamp, and there is no second number that could drift from the
--    ledger's own sum.
--
-- 2. KEYED BY LOWERCASED EMAIL, NOT USER ID -- the app_admins idiom (0067).
--    coin_transactions.student_email is plain text, not a foreign key to
--    auth.users. This is what makes "attach a balance to an email before
--    that student has ever logged in" free: a balance is just whatever the
--    ledger sums to for that email string, and the ledger can hold rows for
--    an email that has no auth.users row yet. The moment that student signs
--    in for the first time, coin_balances already has their row -- there is
--    no separate linking step, because nothing was ever keyed by user id in
--    the first place. Docs Part 8's "attach a balance to an email
--    independent of login status" requirement falls out of this for free;
--    the one piece of NEW surface it needed is the admin adjustment RPC
--    below (coin_admin_adjust_balance), which is how a legacy Sheets balance
--    gets its starting entry.
--
-- 3. is_admin() GATES EVERY WRITE, PER THE PROMPT'S OWN INSTRUCTION. Real
--    value sits behind every balance (Part 8: "tight as Fort Knox"), and
--    since 0067 is_teacher() means "is an admin", not "is a teacher" --
--    every write RPC below calls is_admin() directly and none call
--    is_teacher(). This is a deliberate scope boundary, not an oversight:
--    the OLD Sheets-backed /api/coin-ledger/teacher route is gated on
--    profiles.role = 'teacher' (a session check, not is_admin()), because
--    that tool predates 0067 and is explicitly untouched by this migration.
--    When the entry tool is rebuilt on this schema in a later pass, whether
--    it should loosen to a teacher-role check (matching the old tool's
--    reach) or stay admin-only is that pass's call, not this one's --
--    starting admin-only is the safe default for a brand-new write surface
--    holding real value.
--
-- 4. PRICING SHAPES. The docs price things four different ways, and
--    coin_categories.pricing_model names each shape explicitly rather than
--    forcing everything into "amount":
--      - 'flat'     a fixed price (most fines, most awards, a few purchases)
--      - 'range'    admin picks any integer within [min_amount, max_amount]
--                   (Above and Beyond 1-3i¢, Platform Cosmetic Unlock 15-25i¢)
--      - 'per_unit' amount is a RATE, multiplied by an admin-entered
--                   quantity (Extra Credit 2i¢/point, Text Printing
--                   1i¢/4-page block)
--      - 'variable' no lookup at all -- the admin enters the whole amount
--                   at logging time (Contract Completion, Competition
--                   Winnings, Donate Supplies (Large), Physical Coin
--                   Submission, Coin Payout, Balance Correction) -- this is
--                   the prompt's own explicit instruction for Contract
--                   Completion / Competition Winnings, generalized to every
--                   other "admin's judgment call, no fixed number" item
--      - 'formula'  needs real computed logic beyond a lookup (Perfect
--                   Score's round(points/25) min 1, Pay Raise's
--                   40 x new tier, Property Damage (Careless)'s base + a
--                   $0.25-per-i¢ exchange rate, 3D Printing's material +
--                   time-band charge, Extra Credit's cap enforcement).
--                   Formula categories are refused by the generic
--                   coin_log_transaction and each gets its own dedicated
--                   RPC below.
--
-- 5. A HANDFUL OF CATEGORIES ARE MECHANISMS, NOT PER-STUDENT MONEY, AND ARE
--    MARKED loggable = false: Mint Tampering (Suspect Unknown) is a
--    section-wide mint freeze with no coin amount at all, and
--    eating_pass_revoked is a system-only event the eating-violation logic
--    inserts itself on a third strike. Both stay in the category table (the
--    prompt asks for "every fine, award, and purchase from the docs") but
--    coin_log_transaction refuses to log them directly.
--
-- Apply manually in the Supabase SQL editor, after 0069.

-- ===========================================================================
-- 0. Semester key -- a pure function of the calendar, not a config table.
--
-- Extra Credit's cap and Eating Pass's strike count are both "per semester".
-- Building a real semester-boundary config table (with someone having to
-- keep it current every term) is more machinery than a foundation pass
-- needs; a deterministic Jan-Jun / Jul-Dec split, in the spirit of 0001's
-- role_for_email(), gives every category that needs a semester scope a
-- stable, parameter-free key with nothing to maintain. If real term dates
-- ever need to override this, that's a small follow-up (a config table this
-- function reads first, falling back to the calendar split) -- not a
-- redesign of anything built on top of it.
-- ===========================================================================
create or replace function public.coin_semester_key(p_at timestamptz default now())
returns text
language sql
stable
set search_path = ''
as $$
	select extract(year from p_at)::text
		|| case when extract(month from p_at) between 1 and 6 then '-spring' else '-fall' end;
$$;

revoke all on function public.coin_semester_key(timestamptz) from public;
grant execute on function public.coin_semester_key(timestamptz) to authenticated;

-- ===========================================================================
-- 1. Categories -- the price list. Server-authoritative; a future entry UI
--    reads this table directly rather than hardcoding prices client-side.
-- ===========================================================================
create table if not exists public.coin_categories (
	id text primary key check (id = lower(id) and id ~ '^[a-z0-9_]+$'),
	name text not null,
	kind text not null check (kind in ('fine', 'award', 'purchase', 'adjustment')),
	-- 'core' applies to every IDEA class; '209h' is restricted to that course
	-- (Weekly Role Stipend, Extra Credit) per docs Part 5. Informational only
	-- in this pass -- a future entry UI is what actually filters by it.
	scope text not null default 'core' check (scope in ('core', '209h')),
	pricing_model text not null check (pricing_model in ('flat', 'range', 'per_unit', 'variable', 'formula')),
	-- Unsigned magnitude in i¢. Meaning depends on pricing_model: the fixed
	-- price for 'flat', the per-unit rate for 'per_unit'. Null otherwise.
	amount integer check (amount is null or amount >= 0),
	min_amount integer check (min_amount is null or min_amount >= 0),
	max_amount integer check (max_amount is null or max_amount >= 0),
	-- What one 'per_unit' unit is, for display ('point', '4 pages').
	unit_label text,
	-- Discriminator a dedicated RPC below switches on. Never looked up as a
	-- price directly -- coin_log_transaction refuses 'formula' categories.
	formula_key text,
	-- Extra Credit only: the cumulative point ceiling per student per
	-- semester (21 for 209H, from docs Part 5's 2%-of-1050 calculation).
	semester_point_cap integer check (semester_point_cap is null or semester_point_cap > 0),
	-- Cadence cap on calendar boundaries, never a rolling window (Quality
	-- Desktop Background's explicit "fixed monthly reset date, not a
	-- rolling 30-day window" requirement; Correct Answer in Class's
	-- once-a-day cap uses the same mechanism).
	cap_period text check (cap_period in ('day', 'month')),
	cap_count integer check (cap_count is null or cap_count > 0),
	-- False for mechanism-only rows (a section-wide freeze, a system-
	-- inserted revoke event) that must never be logged directly.
	loggable boolean not null default true,
	active boolean not null default true,
	sort_order integer not null default 0,
	notes text,
	check ((cap_period is null) = (cap_count is null)),
	check (
		(pricing_model = 'flat'
			and amount is not null and min_amount is null and max_amount is null and formula_key is null)
		or (pricing_model = 'range'
			and min_amount is not null and max_amount is not null and min_amount <= max_amount
			and amount is null and formula_key is null)
		or (pricing_model = 'per_unit'
			and amount is not null and unit_label is not null
			and min_amount is null and max_amount is null and formula_key is null)
		or (pricing_model = 'variable'
			and amount is null and min_amount is null and max_amount is null and formula_key is null)
		or (pricing_model = 'formula'
			and formula_key is not null and amount is null and min_amount is null and max_amount is null)
	)
);

revoke all on public.coin_categories from anon, authenticated;
grant select on public.coin_categories to authenticated;
alter table public.coin_categories enable row level security;

drop policy if exists "read coin categories" on public.coin_categories;
create policy "read coin categories"
	on public.coin_categories
	for select
	to authenticated
	using (true);

-- No insert/update/delete policies: the price list is edited by hand in the
-- SQL editor for now (like the GAUNTLET item prices before their own admin
-- UI existed), not through a client write path.

-- ---------------------------------------------------------------------------
-- Seed: every fine, award, and purchase from the quick reference, verbatim.
-- ---------------------------------------------------------------------------
insert into public.coin_categories
	(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, loggable, sort_order, notes)
values
	-- Fines
	('shop_safety_violation', 'Shop Safety Violation', 'fine', 'core', 'flat', 12, null, null, null, null, null, null, null, true, 100, 'Real physical injury risk, priced at the top on purpose.'),
	('shop_not_cleaned_up', 'Shop Not Cleaned Up', 'fine', 'core', 'flat', 12, null, null, null, null, null, null, null, true, 101, 'Full parity with Shop Safety Violation: a hazard for the next student.'),
	('coin_theft', 'Coin Theft', 'fine', 'core', 'flat', 12, null, null, null, null, null, null, null, true, 102, 'Attacks the currency itself.'),
	('mint_tampering_known', 'Mint Tampering (Suspect Known)', 'fine', 'core', 'flat', 12, null, null, null, null, null, null, null, true, 103, 'Counterfeiting risk to the whole system.'),
	('mint_tampering_unknown', 'Mint Tampering (Suspect Unknown)', 'fine', 'core', 'flat', 0, null, null, null, null, null, null, null, false, 104, 'Mechanism, not a fine: section-wide mint privilege freeze until resolved. No coin amount; cannot fine a student who has not been identified.'),
	('classmate_trust_violation', 'Classmate Trust Violation', 'fine', 'core', 'flat', 5, null, null, null, null, null, null, null, true, 105, 'Covers framing a classmate or tampering with their computer.'),
	('eating_violation', 'Eating Violation', 'fine', 'core', 'flat', 5, null, null, null, null, null, null, null, true, 106, 'Eating with no pass, or breaking pass conduct rules badly enough to strike. A third strike while holding a pass revokes it (see coin_log_transaction).'),
	('leaving_without_permission', 'Leaving Without Permission', 'fine', 'core', 'flat', 5, null, null, null, null, null, null, null, true, 107, 'Real accountability and safety issue.'),
	('disruptive_behavior', 'Disruptive Behavior', 'fine', 'core', 'flat', 3, null, null, null, null, null, null, null, true, 108, 'Covers outbursts, arguing, and general disruption.'),
	('printer_not_reset', '3D Printer Not Reset', 'fine', 'core', 'flat', 3, null, null, null, null, null, null, null, true, 109, 'Includes the printer''s flash drive going missing.'),
	('long_bathroom_break', 'Long Bathroom Break', 'fine', 'core', 'flat', 2, null, null, null, null, null, null, null, true, 110, 'Minor time/honesty issue.'),
	('off_task_device_use', 'Off-Task Device Use', 'fine', 'core', 'flat', 2, null, null, null, null, null, null, null, true, 111, 'Bypasses acceptable use.'),
	('unauthorized_printing', 'Unauthorized Printing', 'fine', 'core', 'flat', 2, null, null, null, null, null, null, null, true, 112, 'Unauthorized use of a shared resource.'),
	('classroom_standards_violation', 'Classroom Standards Violation', 'fine', 'core', 'flat', 1, null, null, null, null, null, null, null, true, 113, 'Desktop background, seating, furniture, general tidiness, any non-printer flash drive.'),
	('property_damage_careless', 'Property Damage (Careless)', 'fine', 'core', 'formula', null, null, null, null, 'property_damage_careless', null, null, null, true, 114, '3i¢ flat plus 1i¢ per $0.25 of repair/replacement cost. Use coin_log_property_damage_careless.'),
	('property_damage_first_accident', 'Property Damage (First Accident)', 'fine', 'core', 'flat', 0, null, null, null, null, null, null, null, true, 115, 'No charge for a first accidental incident in a semester; logged, not billed.'),
	('property_damage_repeat_accident', 'Property Damage (Repeat Accident)', 'fine', 'core', 'flat', 5, null, null, null, null, null, null, null, true, 116, 'Second-plus accidental incident in the same semester; flat, unrelated to replacement cost.'),
	('eating_pass_revoked', 'Eating Pass Revoked (system)', 'adjustment', 'core', 'flat', 0, null, null, null, null, null, null, null, false, 117, 'System-only: inserted automatically by coin_log_transaction on a third eating-pass strike. Never logged directly.'),

	-- Awards
	('highest_grade_weekly', 'Highest Grade in Section (Weekly)', 'award', 'core', 'flat', 1, null, null, null, null, null, null, null, true, 200, 'Matches the wage exactly; the top student that week gets double pay.'),
	('perfect_score_graded_work', 'Perfect Score on Graded Work', 'award', 'core', 'formula', null, null, null, null, 'perfect_score', null, null, null, true, 201, 'round(points / 25)i¢, minimum 1i¢. Use coin_log_perfect_score.'),
	('quality_desktop_background', 'Quality Desktop Background', 'award', 'core', 'flat', 3, null, null, null, null, null, 'month', 1, true, 202, 'Once per calendar month, resetting on the 1st, not a rolling 30 days from last submission.'),
	('above_and_beyond', 'Above and Beyond', 'award', 'core', 'range', null, 1, 3, null, null, null, null, null, true, 203, 'Instructor discretion. Also covers genuine peer-teaching moments.'),
	('weekly_role_stipend', 'Weekly Role Stipend', 'award', '209h', 'flat', 2, null, null, null, null, null, null, null, true, 204, 'Shop Steward / Quartermaster / Safety Officer / Lab Tech, while holding the role. Stacks with Weekly Wage and Highest Grade on purpose -- they measure different things.'),
	('donate_supplies_small', 'Donate Supplies (Small, ~$1-5)', 'award', 'core', 'flat', 1, null, null, null, null, null, null, null, true, 205, 'A tissue box shouldn''t pay like a case of gloves.'),
	('donate_supplies_medium', 'Donate Supplies (Medium, ~$5-15)', 'award', 'core', 'flat', 3, null, null, null, null, null, null, null, true, 206, null),
	('donate_supplies_large', 'Donate Supplies (Large, $15+)', 'award', 'core', 'variable', null, null, null, null, null, null, null, null, true, 207, 'Case-by-case, instructor sign-off.'),
	('correct_answer_in_class', 'Correct Answer in Class', 'award', 'core', 'flat', 1, null, null, null, null, null, 'day', 1, true, 208, 'Must be correct AND actually reasoned, not a lucky guess or a bare right word. Capped once per day.'),
	('contract_completion', 'Contract Completion', 'award', 'core', 'variable', null, null, null, null, null, null, null, null, true, 209, 'No fixed price: the admin enters the amount at logging time. Priced like a job posting (guideline: ~1i¢/hour, +50% for specialized skill), not looked up.'),
	('competition_winnings', 'Competition Winnings', 'award', 'core', 'variable', null, null, null, null, null, null, null, null, true, 210, 'No fixed price: purely tournament-dependent, entered by the admin at logging time.'),
	('weekly_wage', 'Weekly Wage', 'award', 'core', 'flat', 1, null, null, null, null, null, null, null, true, 211, 'The floor, not the engine: guaranteed just for being enrolled.'),
	('physical_coin_submission', 'Physical Coin Submission', 'award', 'core', 'variable', null, null, null, null, null, null, null, null, true, 212, 'Credited at whatever is submitted.'),

	-- Purchases
	('eating_pass', 'Eating Pass', 'purchase', 'core', 'flat', 150, null, null, null, null, null, null, null, true, 300, 'One tier, conduct rules attached. At most one active pass per student; see coin_log_transaction.'),
	('extra_credit', 'Extra Credit', 'purchase', '209h', 'per_unit', 2, null, null, 'point', null, 21, null, null, true, 301, 'Cumulative per student per semester, capped at 2% of course semester points (21 for 209H). Restricted to Unit Labs, Unit Assignments, and Documentation checks. Use coin_log_extra_credit.'),
	('platform_cosmetic_unlock', 'Platform Cosmetic Unlock', 'purchase', 'core', 'range', null, 15, 25, null, null, null, null, null, true, 302, 'GAUNTLET / VANGUARD / GREENLINE platform engagement, not course content.'),
	('coin_payout', 'Coin Payout', 'purchase', 'core', 'variable', null, null, null, null, null, null, null, null, true, 303, 'Converts digital balance to physical coins handed over.'),
	('three_d_printing', '3D Printing', 'purchase', 'core', 'formula', null, null, null, null, 'three_d_printing', null, null, null, true, 304, 'Material 1i¢/10g + a time band (free under 1hr, 2i¢ 1-3hr, 4i¢ 3-6hr, 6i¢ 6hr+, free overnight). Use coin_log_three_d_printing.'),
	('text_printing', 'Text Printing (B&W, per 4 pages)', 'purchase', 'core', 'per_unit', 1, null, null, '4 pages', null, null, null, null, true, 305, 'Images are no longer purchasable at all.'),
	('song_request', 'Song Request', 'purchase', 'core', 'flat', 3, null, null, null, null, null, null, null, true, 306, 'Approval-gated: nothing plays until reviewed. The price is for the request, not a guarantee it gets played.'),
	('pay_raise', 'Pay Raise', 'purchase', 'core', 'formula', null, null, null, null, 'pay_raise', null, null, null, true, 307, '40i¢ x the new tier being purchased; permanently raises the weekly wage rate. Use coin_log_pay_raise.'),

	-- Adjustment (admin-only correction / refund / legacy-balance link)
	('balance_correction', 'Balance Correction / Refund', 'adjustment', 'core', 'variable', null, null, null, null, null, null, null, null, true, 900, 'Admin-entered, signed amount with a required reason. Also how a legacy Sheets balance is attached to an email (see coin_admin_adjust_balance).')
on conflict (id) do update set
	name = excluded.name,
	kind = excluded.kind,
	scope = excluded.scope,
	pricing_model = excluded.pricing_model,
	amount = excluded.amount,
	min_amount = excluded.min_amount,
	max_amount = excluded.max_amount,
	unit_label = excluded.unit_label,
	formula_key = excluded.formula_key,
	semester_point_cap = excluded.semester_point_cap,
	cap_period = excluded.cap_period,
	cap_count = excluded.cap_count,
	loggable = excluded.loggable,
	sort_order = excluded.sort_order,
	notes = excluded.notes;

-- ===========================================================================
-- 2. Wage tiers -- Pay Raise's one genuinely stateful piece.
--
-- Everything else in this migration is derivable from coin_transactions
-- alone, but "permanently raises that student's weekly wage rate going
-- forward" (the prompt's own wording) is a current TIER, not a coin amount
-- -- there is nothing to sum. Tier 1 is the base rate every student starts
-- at; a Pay Raise purchase increments it. Keyed by email like everything
-- else here, so a tier can be pre-provisioned the same way a balance can.
-- ===========================================================================
create table if not exists public.coin_wage_tiers (
	student_email text primary key check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	tier integer not null default 1 check (tier >= 1),
	updated_at timestamptz not null default now()
);

revoke all on public.coin_wage_tiers from anon, authenticated;
grant select on public.coin_wage_tiers to authenticated;
alter table public.coin_wage_tiers enable row level security;

drop policy if exists "read own or admin wage tier" on public.coin_wage_tiers;
create policy "read own or admin wage tier"
	on public.coin_wage_tiers
	for select
	to authenticated
	using (student_email = public.current_user_email() or public.is_admin());

-- No insert/update/delete policies: only coin_log_pay_raise writes.

-- ===========================================================================
-- 3. Transactions -- the ledger. This is the ONLY thing that ever changes a
--    balance; coin_balances (section 4) is a pure sum over it.
-- ===========================================================================
create table if not exists public.coin_transactions (
	id uuid primary key default gen_random_uuid(),
	student_email text not null check (student_email = lower(btrim(student_email)) and student_email like '%@%'),
	category_id text not null references public.coin_categories (id),
	-- SIGNED i¢ delta: negative for fines/purchases, positive for awards,
	-- either sign for adjustments. balance = sum(amount) for the email.
	amount integer not null,
	-- Optional audit quantity behind the amount (points, grams, hours,
	-- dollars, 4-page blocks) -- what coin_log_extra_credit sums to enforce
	-- the semester cap, and otherwise just a record of what was entered.
	quantity numeric,
	note text check (note is null or char_length(note) <= 500),
	-- Structured extras a formula category needs to remember (the eating
	-- violation's strike flag, 3D printing's material/time breakdown, extra
	-- credit's grading-category bucket, pay raise's tier change).
	meta jsonb not null default '{}'::jsonb,
	-- Who logged it (the admin's own email, from current_user_email()),
	-- never client-supplied -- the correction audit trail docs Part 8 asks for.
	actor_email text not null,
	-- Stamped at insert so semester-scoped queries (Extra Credit's cap,
	-- Eating Pass's strike window) stay stable even if coin_semester_key()'s
	-- own logic is later swapped for a real term-boundary table.
	semester_key text not null default public.coin_semester_key(),
	created_at timestamptz not null default now()
);

create index if not exists coin_transactions_student_idx
	on public.coin_transactions (student_email, created_at desc);
create index if not exists coin_transactions_category_idx
	on public.coin_transactions (category_id, student_email, semester_key);

revoke all on public.coin_transactions from anon, authenticated;
grant select on public.coin_transactions to authenticated;
alter table public.coin_transactions enable row level security;

drop policy if exists "read own or admin coin transactions" on public.coin_transactions;
create policy "read own or admin coin transactions"
	on public.coin_transactions
	for select
	to authenticated
	using (student_email = public.current_user_email() or public.is_admin());

-- No insert/update/delete policies: every write goes through the SECURITY
-- DEFINER functions in sections 6-8, all gated on is_admin().

-- ===========================================================================
-- 4. Balances -- derived, not stored. security_invoker so a student sees
--    only their own row (via the transactions RLS policy above) and an
--    admin sees everyone's, with no separate predicate to keep in sync
--    (the 0033 pattern, not the owner-privileged 0004/0060 one -- here the
--    per-row visibility the base table already enforces is exactly what
--    this view should show, not something to bypass).
-- ===========================================================================
create or replace view public.coin_balances
with (security_invoker = true) as
select
	student_email,
	sum(amount)::integer as balance,
	max(created_at) as last_activity_at,
	count(*)::integer as transaction_count
from public.coin_transactions
group by student_email;

grant select on public.coin_balances to authenticated;

-- ===========================================================================
-- 5. Eating Pass state -- also derived, not stored. "Active" is whichever
--    of the two event types (a purchase, or the system revoke event) is
--    most recent; "strikes" counts eating_violation rows flagged as a
--    strike since the most recent purchase, so the count naturally resets
--    the moment a NEW pass is bought (a permanently-revoked pass can still
--    be re-earned and re-purchased later at full price -- the "permanently"
--    in the docs describes the revocation itself being irreversible and
--    unrefunded, not a lifetime ban on ever holding a pass again).
-- ===========================================================================
create or replace function public.coin_eating_pass_active(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select coalesce(
		(
			select t.category_id = 'eating_pass'
			from public.coin_transactions t
			where t.student_email = lower(btrim(p_email))
				and t.category_id in ('eating_pass', 'eating_pass_revoked')
			order by t.created_at desc, t.id desc
			limit 1
		),
		false
	);
$$;

revoke all on function public.coin_eating_pass_active(text) from public;

create or replace function public.coin_eating_pass_strikes(p_email text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
	select count(*)::integer
	from public.coin_transactions t
	where t.student_email = lower(btrim(p_email))
		and t.category_id = 'eating_violation'
		and (t.meta ->> 'strike')::boolean is true
		and t.created_at >= coalesce(
			(
				select max(t2.created_at)
				from public.coin_transactions t2
				where t2.student_email = lower(btrim(p_email)) and t2.category_id = 'eating_pass'
			),
			'-infinity'::timestamptz
		);
$$;

revoke all on function public.coin_eating_pass_strikes(text) from public;

-- ===========================================================================
-- 6. Internal insert helper. Not granted to anyone -- every public write RPC
--    below funnels through this so the row shape (actor, semester_key,
--    meta) is set in exactly one place. Mirrors the `_tournament_*` /
--    `_coin_`-prefixed internal-helper convention: owned by the migration
--    role, callable from other SECURITY DEFINER functions with no explicit
--    grant needed.
-- ===========================================================================
create or replace function public._coin_insert(
	p_email text,
	p_category_id text,
	p_signed_amount integer,
	p_quantity numeric,
	p_note text,
	p_meta jsonb
)
returns public.coin_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_row public.coin_transactions;
begin
	insert into public.coin_transactions
		(student_email, category_id, amount, quantity, note, meta, actor_email, semester_key)
	values
		(p_email, p_category_id, p_signed_amount, p_quantity, p_note,
		 coalesce(p_meta, '{}'::jsonb), public.current_user_email(), public.coin_semester_key())
	returning * into v_row;
	return v_row;
end;
$$;

revoke all on function public._coin_insert(text, text, integer, numeric, text, jsonb) from public;

-- ===========================================================================
-- 7. The generic logger. Handles every 'flat', 'range', 'per_unit', and
--    'variable' category. 'formula' categories (and Extra Credit
--    specifically, even though it is 'per_unit', because it needs the cap
--    check) are refused here and must go through their own dedicated RPC
--    in section 8.
--
-- Refusal shape: business-rule stops a caller needs to display gracefully
-- (debt, an already-active pass, a day/month cap already hit) return
-- structured {ok:false, reason:...} jsonb, the same convention
-- greenline_purchase_item uses. Genuine misuse (bad params, an unknown
-- category, a non-admin caller) raises an exception instead.
-- ===========================================================================
create or replace function public.coin_log_transaction(
	p_email text,
	p_category_id text,
	p_amount integer default null,
	p_quantity numeric default null,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_cat public.coin_categories;
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_magnitude integer;
	v_signed integer;
	v_balance integer;
	v_pass_active boolean;
	v_strike boolean := false;
	v_meta jsonb := '{}'::jsonb;
	v_strikes integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;

	select * into v_cat from public.coin_categories where id = p_category_id;
	if v_cat.id is null then
		raise exception 'Unknown coin category "%".', p_category_id;
	end if;
	if not v_cat.active or not v_cat.loggable then
		raise exception '"%" cannot be logged directly.', v_cat.name;
	end if;
	if v_cat.pricing_model = 'formula' then
		raise exception '"%" needs its dedicated logging function, not coin_log_transaction.', v_cat.name;
	end if;
	if v_cat.id = 'extra_credit' then
		raise exception 'Use coin_log_extra_credit for Extra Credit (it enforces the semester cap).';
	end if;

	if v_cat.pricing_model = 'flat' then
		v_magnitude := v_cat.amount;
	elsif v_cat.pricing_model = 'range' then
		if p_amount is null then
			raise exception '"%" needs an amount between %i¢ and %i¢.', v_cat.name, v_cat.min_amount, v_cat.max_amount;
		end if;
		if p_amount < v_cat.min_amount or p_amount > v_cat.max_amount then
			raise exception '"%" must be between %i¢ and %i¢ (got %i¢).', v_cat.name, v_cat.min_amount, v_cat.max_amount, p_amount;
		end if;
		v_magnitude := p_amount;
	elsif v_cat.pricing_model = 'per_unit' then
		if p_quantity is null or p_quantity <= 0 then
			raise exception '"%" needs a positive quantity (%).', v_cat.name, coalesce(v_cat.unit_label, 'units');
		end if;
		v_magnitude := round(v_cat.amount * p_quantity)::integer;
	elsif v_cat.pricing_model = 'variable' then
		if v_cat.kind = 'adjustment' then
			if p_amount is null or p_amount = 0 then
				raise exception 'A balance adjustment needs a non-zero amount.';
			end if;
			if v_note is null then
				raise exception 'A balance adjustment needs a note explaining why.';
			end if;
			v_signed := p_amount;
		else
			if p_amount is null or p_amount <= 0 then
				raise exception '"%" needs a positive amount.', v_cat.name;
			end if;
			if v_note is null then
				raise exception '"%" needs a note.', v_cat.name;
			end if;
			v_magnitude := p_amount;
		end if;
	end if;

	if v_signed is null then
		v_signed := case v_cat.kind
			when 'fine' then -v_magnitude
			when 'purchase' then -v_magnitude
			else v_magnitude
		end;
	end if;

	-- Cadence cap, evaluated on calendar boundaries (never a rolling window).
	if v_cat.cap_period is not null then
		if v_cat.cap_period = 'day' then
			if (
				select count(*) from public.coin_transactions t
				where t.student_email = v_email and t.category_id = v_cat.id
					and t.created_at::date = current_date
			) >= v_cat.cap_count then
				return jsonb_build_object('ok', false, 'reason', 'cap_reached', 'cap_period', 'day');
			end if;
		elsif v_cat.cap_period = 'month' then
			if (
				select count(*) from public.coin_transactions t
				where t.student_email = v_email and t.category_id = v_cat.id
					and date_trunc('month', t.created_at) = date_trunc('month', now())
			) >= v_cat.cap_count then
				return jsonb_build_object('ok', false, 'reason', 'cap_reached', 'cap_period', 'month');
			end if;
		end if;
	end if;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;

	-- Debt lockout: only while ALREADY negative, and only for purchases.
	-- Fines and adjustments still apply past zero with no cap (the docs'
	-- own framing); a purchase that would itself dip a non-negative balance
	-- into the negative is allowed, matching the docs' literal condition.
	if v_cat.kind = 'purchase' and v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'debt', 'balance', v_balance);
	end if;

	if v_cat.id = 'eating_pass' then
		if public.coin_eating_pass_active(v_email) then
			return jsonb_build_object('ok', false, 'reason', 'pass_already_active');
		end if;
	elsif v_cat.id = 'eating_violation' then
		v_pass_active := public.coin_eating_pass_active(v_email);
		v_strike := v_pass_active;
		v_meta := jsonb_build_object('strike', v_strike);
	end if;

	v_row := public._coin_insert(v_email, v_cat.id, v_signed, p_quantity, v_note, v_meta);

	if v_strike then
		v_strikes := public.coin_eating_pass_strikes(v_email);
		if v_strikes >= 3 then
			perform public._coin_insert(
				v_email, 'eating_pass_revoked', 0, null,
				'Automatically revoked: third eating-pass violation since this pass was purchased.',
				jsonb_build_object('strikes', v_strikes)
			);
		end if;
	end if;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;

	return jsonb_build_object(
		'ok', true,
		'transaction_id', v_row.id,
		'category_id', v_cat.id,
		'amount', v_signed,
		'strike', v_strike,
		'balance', v_balance
	);
end;
$$;

revoke all on function public.coin_log_transaction(text, text, integer, numeric, text) from public;
grant execute on function public.coin_log_transaction(text, text, integer, numeric, text) to authenticated;

-- ===========================================================================
-- 8. Dedicated RPCs for the five 'formula' categories.
-- ===========================================================================

-- Perfect Score on Graded Work: round(points / 25)i¢, minimum 1i¢.
create or replace function public.coin_log_perfect_score(
	p_email text,
	p_points integer,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_magnitude integer;
	v_balance integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if p_points is null or p_points <= 0 then
		raise exception 'Enter the number of points the graded work was worth.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'perfect_score_graded_work' and active) then
		raise exception 'The Perfect Score category is not configured.';
	end if;

	v_magnitude := greatest(1, round(p_points / 25.0)::integer);

	v_row := public._coin_insert(
		v_email, 'perfect_score_graded_work', v_magnitude, p_points,
		nullif(btrim(coalesce(p_note, '')), ''), jsonb_build_object('points', p_points)
	);

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	return jsonb_build_object('ok', true, 'transaction_id', v_row.id, 'amount', v_magnitude, 'balance', v_balance);
end;
$$;

revoke all on function public.coin_log_perfect_score(text, integer, text) from public;
grant execute on function public.coin_log_perfect_score(text, integer, text) to authenticated;

-- Pay Raise: 40i¢ x the new tier, and it permanently raises the wage tier.
create or replace function public.coin_log_pay_raise(
	p_email text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_current_tier integer;
	v_new_tier integer;
	v_cost integer;
	v_balance integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'pay_raise' and active) then
		raise exception 'The Pay Raise category is not configured.';
	end if;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	if v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'debt', 'balance', v_balance);
	end if;

	insert into public.coin_wage_tiers (student_email) values (v_email) on conflict (student_email) do nothing;
	select tier into v_current_tier from public.coin_wage_tiers where student_email = v_email for update;

	v_new_tier := v_current_tier + 1;
	v_cost := 40 * v_new_tier;

	v_row := public._coin_insert(
		v_email, 'pay_raise', -v_cost, null, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object('previous_tier', v_current_tier, 'new_tier', v_new_tier, 'cost', v_cost)
	);

	update public.coin_wage_tiers set tier = v_new_tier, updated_at = now() where student_email = v_email;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id,
		'previous_tier', v_current_tier, 'new_tier', v_new_tier, 'cost', v_cost,
		'balance', v_balance
	);
end;
$$;

revoke all on function public.coin_log_pay_raise(text, text) from public;
grant execute on function public.coin_log_pay_raise(text, text) to authenticated;

-- Property Damage (Careless): 3i¢ flat + 1i¢ per $0.25 of repair/replacement
-- cost. A note describing the incident is required.
create or replace function public.coin_log_property_damage_careless(
	p_email text,
	p_cost_dollars numeric,
	p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_note text := nullif(btrim(coalesce(p_note, '')), '');
	v_base constant integer := 3;
	v_exchange integer;
	v_magnitude integer;
	v_balance integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'property_damage_careless' and active) then
		raise exception 'The Property Damage (Careless) category is not configured.';
	end if;
	if p_cost_dollars is null or p_cost_dollars < 0 then
		raise exception 'Enter the repair/replacement cost in dollars (0 if none).';
	end if;
	if v_note is null then
		raise exception 'Property Damage (Careless) needs a note describing the incident.';
	end if;

	v_exchange := round(p_cost_dollars / 0.25)::integer;
	v_magnitude := v_base + v_exchange;

	v_row := public._coin_insert(
		v_email, 'property_damage_careless', -v_magnitude, p_cost_dollars, v_note,
		jsonb_build_object('cost_dollars', p_cost_dollars, 'base', v_base, 'exchange', v_exchange)
	);

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id, 'amount', -v_magnitude,
		'base', v_base, 'exchange', v_exchange, 'balance', v_balance
	);
end;
$$;

revoke all on function public.coin_log_property_damage_careless(text, numeric, text) from public;
grant execute on function public.coin_log_property_damage_careless(text, numeric, text) to authenticated;

-- 3D Printing: material (1i¢/10g, slicer's exact weight) + a time band
-- (free under 1hr, 2i¢ 1-3hr, 4i¢ 3-6hr, 6i¢ 6hr+, free if overnight).
create or replace function public.coin_log_three_d_printing(
	p_email text,
	p_grams numeric,
	p_hours numeric,
	p_overnight boolean default false,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_material integer;
	v_time integer;
	v_magnitude integer;
	v_balance integer;
	v_row public.coin_transactions;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if not exists (select 1 from public.coin_categories where id = 'three_d_printing' and active) then
		raise exception 'The 3D Printing category is not configured.';
	end if;
	if p_grams is null or p_grams < 0 then
		raise exception 'Enter the slicer''s reported weight in grams.';
	end if;
	if p_hours is null or p_hours < 0 then
		raise exception 'Enter the slicer''s reported print time in hours.';
	end if;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	if v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'debt', 'balance', v_balance);
	end if;

	v_material := round(p_grams / 10.0)::integer;
	v_time := case
		when p_overnight then 0
		when p_hours < 1 then 0
		when p_hours < 3 then 2
		when p_hours < 6 then 4
		else 6
	end;
	v_magnitude := v_material + v_time;

	v_row := public._coin_insert(
		v_email, 'three_d_printing', -v_magnitude, p_grams, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object(
			'grams', p_grams, 'hours', p_hours, 'overnight', coalesce(p_overnight, false),
			'material_ic', v_material, 'time_ic', v_time
		)
	);

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id, 'amount', -v_magnitude,
		'material_ic', v_material, 'time_ic', v_time, 'balance', v_balance
	);
end;
$$;

revoke all on function public.coin_log_three_d_printing(text, numeric, numeric, boolean, text) from public;
grant execute on function public.coin_log_three_d_printing(text, numeric, numeric, boolean, text) to authenticated;

-- Extra Credit (209H only): 2i¢/point, hard-capped at 21 points (2% of the
-- course's 1,050 semester points) cumulative per student per semester,
-- restricted to Unit Labs / Unit Assignments / Documentation checks.
create or replace function public.coin_log_extra_credit(
	p_email text,
	p_points integer,
	p_grading_category text,
	p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_cat public.coin_categories;
	v_grading text := lower(btrim(coalesce(p_grading_category, '')));
	v_used numeric;
	v_cap integer;
	v_cost integer;
	v_balance integer;
	v_row public.coin_transactions;
	v_sem text := public.coin_semester_key();
begin
	if not public.is_admin() then
		raise exception 'Only site admins can log IDEA Coin transactions.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid student email.';
	end if;
	if p_points is null or p_points <= 0 then
		raise exception 'Enter a positive number of extra credit points.';
	end if;
	if v_grading not in ('unit_labs', 'unit_assignments', 'documentation') then
		raise exception 'Extra Credit only applies to Unit Labs, Unit Assignments, or Documentation checks (got "%").', p_grading_category;
	end if;

	select * into v_cat from public.coin_categories where id = 'extra_credit';
	if v_cat.id is null or not v_cat.active then
		raise exception 'The Extra Credit category is not configured.';
	end if;
	v_cap := v_cat.semester_point_cap;

	select coalesce(sum(quantity), 0) into v_used
	from public.coin_transactions
	where student_email = v_email and category_id = 'extra_credit' and semester_key = v_sem;

	if v_cap is not null and v_used + p_points > v_cap then
		return jsonb_build_object(
			'ok', false, 'reason', 'cap_exceeded',
			'cap_points', v_cap, 'used_points', v_used, 'remaining_points', greatest(v_cap - v_used, 0)
		);
	end if;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	if v_balance < 0 then
		return jsonb_build_object('ok', false, 'reason', 'debt', 'balance', v_balance);
	end if;

	v_cost := round(v_cat.amount * p_points)::integer;

	v_row := public._coin_insert(
		v_email, 'extra_credit', -v_cost, p_points, nullif(btrim(coalesce(p_note, '')), ''),
		jsonb_build_object('grading_category', v_grading)
	);

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	return jsonb_build_object(
		'ok', true, 'transaction_id', v_row.id, 'points', p_points, 'cost', v_cost,
		'used_points', v_used + p_points, 'cap_points', v_cap,
		'remaining_points', greatest(coalesce(v_cap, 0) - (v_used + p_points), 0),
		'balance', v_balance
	);
end;
$$;

revoke all on function public.coin_log_extra_credit(text, integer, text, text) from public;
grant execute on function public.coin_log_extra_credit(text, integer, text, text) to authenticated;

-- ===========================================================================
-- 9. Admin tool surface: attach/adjust a balance by email, and look one up.
--    This is the "/admin pattern" extension the prompt asks for -- both
--    gated on is_admin(), same as everything above.
-- ===========================================================================

-- Attaches or adjusts a balance for an email, whether or not that email has
-- ever signed in. A thin, descriptively-named wrapper over the generic
-- logger under the 'balance_correction' adjustment category, so every
-- correction is an ordinary, auditable ledger row (actor + required reason)
-- rather than a second code path. This is also how a legacy Sheets balance
-- gets its starting entry: whatever the old balance was becomes p_amount,
-- no conversion math, per docs Part 8.
create or replace function public.coin_admin_adjust_balance(
	p_email text,
	p_amount integer,
	p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
	return public.coin_log_transaction(lower(btrim(coalesce(p_email, ''))), 'balance_correction', p_amount, null, p_note);
end;
$$;

revoke all on function public.coin_admin_adjust_balance(text, integer, text) from public;
grant execute on function public.coin_admin_adjust_balance(text, integer, text) to authenticated;

-- Read-side helper for the admin page: balance, wage tier, eating-pass
-- status, and recent history for one email, in one round trip.
create or replace function public.coin_admin_lookup(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
	v_email text := lower(btrim(coalesce(p_email, '')));
	v_balance integer;
	v_wage_tier integer;
	v_recent jsonb;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can look up IDEA Coin balances.';
	end if;
	if v_email = '' or v_email not like '%@%' then
		raise exception 'Enter a valid email.';
	end if;

	select coalesce(sum(amount), 0) into v_balance from public.coin_transactions where student_email = v_email;
	select coalesce(tier, 1) into v_wage_tier from public.coin_wage_tiers where student_email = v_email;

	select coalesce(jsonb_agg(row_to_json(r) order by r.created_at desc), '[]'::jsonb) into v_recent
	from (
		select t.id, t.category_id, c.name as category_name, t.amount, t.quantity, t.note,
			t.actor_email, t.created_at
		from public.coin_transactions t
		join public.coin_categories c on c.id = t.category_id
		where t.student_email = v_email
		order by t.created_at desc
		limit 25
	) r;

	return jsonb_build_object(
		'email', v_email,
		'balance', v_balance,
		'wage_tier', coalesce(v_wage_tier, 1),
		'eating_pass_active', public.coin_eating_pass_active(v_email),
		'eating_pass_strikes', public.coin_eating_pass_strikes(v_email),
		'recent_transactions', v_recent
	);
end;
$$;

revoke all on function public.coin_admin_lookup(text) from public;
grant execute on function public.coin_admin_lookup(text) to authenticated;
