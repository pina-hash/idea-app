-- 0220_profile_identity_style.sql
-- Ledger 0289, report 15: a person's own identity customization, on the
-- profile rather than on a tournament entry.
--
-- WHAT THIS IS. Six nullable columns on public.profiles carrying the same six
-- fields a tournament entry style has carried since 0064: a background, an
-- accent, a badge, a flourish and a tagline. All null (the default for every
-- row that exists today) renders exactly as it renders now -- there is no
-- backfill, no default value and nothing to undo for a person who customizes
-- nothing.
--
-- COLUMNS ON profiles, NOT A profile_styles TABLE, AND THE REASON IS THE GATE
-- RATHER THAN THE SHAPE. profiles already carries the two policies this
-- feature needs and 0001 wrote both: "update own profile"
-- (using id = auth.uid()) lets a student write their own row, and "teachers
-- update any profile" lets staff write anybody's. The read side is the same
-- pair: "select own profile" and "teachers select all profiles". A separate
-- table would mean restating all four, which is a second authorization model
-- for one person's identity -- and 0038 (pathway) and 0045 (tour_completed_at)
-- both took the column route on exactly this argument, each saying so in its
-- own header. So this migration adds NO policy, NO grant and NO function. If
-- that sentence ever stops being true, the shape was wrong.
--
-- WHICH ALSO MEANS THERE IS NO SECURITY DEFINER RPC IN FRONT OF THE WRITE,
-- and that is the one real difference from 0064. A tournament style has
-- exactly one writer (tournament_set_entry_style) which validates before it
-- inserts; here the student's own browser writes the row directly under RLS.
-- So VALIDATION IS THE DATABASE'S, as CHECK constraints, and it has to be
-- complete rather than advisory: there is no function to put it in. Every
-- constraint below mirrors one the RPC performs, and `backgroundCss` in
-- src/lib/identity-style.ts re-validates a third time at the point the value
-- is interpolated into a style attribute.
--
-- AN IMAGE BACKGROUND IS REFUSED HERE, AND THIS IS THE DELIBERATE NARROWING
-- AGAINST 0064. A tournament banner may carry `image` because its URL arrives
-- through the RPC and points into the public 'tournament-thumbs' bucket that
-- the same student owns a folder in. A profile is written directly, so an
-- `image` background would be an ARBITRARY https URL that every viewer's
-- browser fetches automatically, on every surface that person appears on --
-- which hands their IP and Referer to whatever host a classmate named, before
-- anybody decided anything. That is precisely the img-src-is-not-an-href rule
-- the classroom already enforces with `resolveFigureSrc` (same-origin only).
-- Solid and gradient are colours and carry no request. If a profile background
-- image is ever wanted, it needs an upload path into a bucket we own and a
-- proxy in front of it -- which is a bundle, not a relaxed CHECK.
--
-- ONLY THE AMBIENT FLOURISHES ARE ACCEPTED, for a simpler reason: an event
-- flourish names a decisive moment ('confetti-on-win') that a tournament has
-- and a profile does not, so storing one would be a value no surface can ever
-- play. PROFILE_FLOURISHES in src/lib/identity-style.ts is derived by
-- filtering on kind, so the registry and this list cannot drift silently;
-- tests/identity-style-shared.test.ts reconciles them.
--
-- NOTHING HERE TOUCHES tournament_entry_styles, and nothing joins the two.
-- 0062's identity rule is unchanged: a tournament entry's public identity is
-- still the entry's own display name and thumbnail, its style still dies with
-- the entry, and a profile style is not visible from any tournament surface.
-- The two systems now share ARITHMETIC (one TypeScript module) and share no
-- data, no table and no permission.
--
-- WHAT UNDOES IT: `alter table public.profiles drop column if exists
-- style_background_type, drop column if exists style_background_value, drop
-- column if exists style_accent_color, drop column if exists style_badge,
-- drop column if exists style_flourish, drop column if exists style_tagline;`
-- which also drops the constraints, since every one of them is attached to
-- these columns and to nothing else. No policy, view, index or function names
-- them, so there is nothing else to restore. It loses whatever people had
-- customized and nothing more.
--
-- Apply manually in the Supabase SQL editor. Idempotent: re-pasting is a
-- no-op.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.profiles
	-- 'solid' or 'gradient' only; see the header for why 'image' is refused.
	add column if not exists style_background_type text,
	-- Shape follows style_background_type, checked below:
	--   solid    -> a json string, '#rrggbb'
	--   gradient -> a json array of exactly two '#rrggbb' strings
	-- Null exactly when style_background_type is null.
	add column if not exists style_background_value jsonb,
	add column if not exists style_accent_color text,
	-- Preset icon id; the allowlist is a constraint below. Null = no badge.
	add column if not exists style_badge text,
	-- Preset ambient effect id. Null = none.
	add column if not exists style_flourish text,
	add column if not exists style_tagline text;

-- ---------------------------------------------------------------------------
-- 2. The allowlists and the shape rules.
--
-- Postgres has no `add constraint if not exists`, and a blind drop-then-add
-- raises 42710 on the second run, so each one is guarded on pg_constraint.
-- ---------------------------------------------------------------------------

do $$
begin
	-- Background type: the two that carry no network request.
	if not exists (select 1 from pg_constraint where conname = 'profiles_style_bg_type_ck') then
		alter table public.profiles
			add constraint profiles_style_bg_type_ck
			check (style_background_type is null or style_background_type in ('solid', 'gradient'));
	end if;

	-- A background value is present exactly when a background is configured.
	if not exists (select 1 from pg_constraint where conname = 'profiles_style_bg_pair_ck') then
		alter table public.profiles
			add constraint profiles_style_bg_pair_ck
			check ((style_background_type is null) = (style_background_value is null));
	end if;

	/* THE VALUE'S SHAPE MUST MATCH ITS TYPE, and this is the constraint that
	   earns the most care, because it is the one a hand-written client write
	   can get wrong in a way nothing else catches.

	   `jsonb_typeof(x) <> 'string'` IS NULL -- NOT TRUE -- FOR AN ABSENT KEY,
	   and in a boolean gate that NULL propagates out and a CHECK constraint
	   treats a NULL result as SATISFIED. That is the fall-through that
	   ACCEPTS the write, and it is written up in CLAUDE.md as having bitten
	   three times. There is no absent key here (the value is a scalar, not an
	   object), but the same hazard arrives through the `is null` arm: every
	   branch below is therefore written so the whole expression is TRUE or
	   FALSE and never NULL -- the `style_background_type is null` arm returns
	   true outright, and the two typed arms compare `jsonb_typeof` with `=`
	   against a literal, which is never null for a non-null jsonb. */
	if not exists (select 1 from pg_constraint where conname = 'profiles_style_bg_value_ck') then
		alter table public.profiles
			add constraint profiles_style_bg_value_ck
			check (
				style_background_type is null
				or (
					style_background_type = 'solid'
					and jsonb_typeof(style_background_value) = 'string'
					and (style_background_value #>> '{}') ~* '^#[0-9a-f]{6}$'
				)
				or (
					style_background_type = 'gradient'
					and jsonb_typeof(style_background_value) = 'array'
					and jsonb_array_length(style_background_value) = 2
					and (style_background_value ->> 0) ~* '^#[0-9a-f]{6}$'
					and (style_background_value ->> 1) ~* '^#[0-9a-f]{6}$'
				)
			);
	end if;

	/* CASE-INSENSITIVE, WHERE 0064's EQUIVALENT IS LOWERCASE-ONLY, AND THE
	   DIFFERENCE IS THE WRITE PATH AGAIN. 0064 can afford `~ '^#[0-9a-f]{6}$'`
	   because its RPC lowercases the value before it ever reaches the column.
	   Nothing lowercases a direct RLS write, and the TypeScript side's own
	   HEX test has always been case-insensitive -- so a strict constraint here
	   would refuse '#AABBCC', a value every part of the client considers
	   valid, with a raw constraint violation and no sentence a student could
	   act on. The client normalizes to lowercase on the way out; this accepts
	   either, so the two cannot disagree about what is valid. */
	if not exists (select 1 from pg_constraint where conname = 'profiles_style_accent_ck') then
		alter table public.profiles
			add constraint profiles_style_accent_ck
			check (style_accent_color is null or style_accent_color ~* '^#[0-9a-f]{6}$');
	end if;

	-- The badge allowlist, mirroring 0064's eight ids and BADGES in
	-- src/lib/identity-style.ts. Adding one means editing all three.
	if not exists (select 1 from pg_constraint where conname = 'profiles_style_badge_ck') then
		alter table public.profiles
			add constraint profiles_style_badge_ck
			check (style_badge is null or style_badge in (
				'bolt', 'flame', 'star', 'shield', 'gear', 'skull', 'crown', 'rocket'
			));
	end if;

	-- AMBIENT ONLY. See the header: an event flourish has no moment to play
	-- at on a profile surface.
	if not exists (select 1 from pg_constraint where conname = 'profiles_style_flourish_ck') then
		alter table public.profiles
			add constraint profiles_style_flourish_ck
			check (style_flourish is null or style_flourish in ('glow-pulse', 'particle-trail'));
	end if;

	-- 1..48 characters, matching 0064's tagline cap exactly. The lower bound
	-- is what stops an empty string being stored as a tagline: the client
	-- writes null for "no tagline", and a whitespace-only value trimmed to
	-- nothing is null too.
	if not exists (select 1 from pg_constraint where conname = 'profiles_style_tagline_ck') then
		alter table public.profiles
			add constraint profiles_style_tagline_ck
			check (style_tagline is null or char_length(style_tagline) between 1 and 48);
	end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Report what landed.
--
-- `raise notice` is invisible in the Supabase SQL editor, which renders only
-- the LAST statement's result set, so the report is a select rather than a
-- notice. It names every object this file creates and is a row per object, not
-- a count: a bare number cannot say WHICH constraint is missing.
-- ---------------------------------------------------------------------------

select
	'column' as kind,
	c.column_name as name,
	c.data_type as detail,
	true as present
from information_schema.columns c
where c.table_schema = 'public'
	and c.table_name = 'profiles'
	and c.column_name like 'style\_%'
union all
select
	'constraint',
	expected.conname,
	coalesce(pg_get_constraintdef(pc.oid), '** MISSING **'),
	pc.oid is not null
from (values
	('profiles_style_bg_type_ck'),
	('profiles_style_bg_pair_ck'),
	('profiles_style_bg_value_ck'),
	('profiles_style_accent_ck'),
	('profiles_style_badge_ck'),
	('profiles_style_flourish_ck'),
	('profiles_style_tagline_ck')
) as expected(conname)
left join pg_constraint pc
	on pc.conname = expected.conname
	and pc.conrelid = 'public.profiles'::regclass
order by 1, 2;

-- ---------------------------------------------------------------------------
-- 4. VERIFICATION, commented. Paste this block on its own AFTER the apply.
--
-- READ-ONLY IN THE STRONGEST SENSE: it writes nothing and opens no
-- transaction. It reads the deployed constraint definitions back out of
-- pg_catalog and checks each one CONTAINS the rule it is supposed to carry,
-- so what is verified is the gate the database is actually enforcing rather
-- than the text of this file.
--
-- IT RETURNS ROWS, ONE PER RULE, NEVER A COUNT. A bare number cannot say
-- which rule is missing, and a zero is exactly what a query pointed at the
-- wrong table also returns.
--
-- THE POSITIVE CONTROL IS THE LAST ROW AND IT MUST READ **FAIL**. It looks
-- for a rule no constraint here carries ("image" among the accepted
-- background types, which section 1 refuses on purpose). A run in which
-- every row reads PASS, that one included, is a run whose matcher is not
-- looking at anything -- which is how a verification query certifies an
-- apply that never happened. Read it every time: 15 PASS and 1 **FAIL**,
-- and the **FAIL** is the control.
--
-- NO DOLLAR QUOTE OF ANY KIND APPEARS BELOW, in a comment line or a code
-- line, and nothing here needs one. The Supabase editor splits statements
-- client-side and a dollar-quote token inside a comment balances in Postgres
-- but not in that splitter, which cost 0194 a full apply cycle; the way past
-- it is not to check the pairs but to have none.
-- ---------------------------------------------------------------------------

-- select
-- 	probe.rule,
-- 	probe.conname,
-- 	coalesce(pg_get_constraintdef(pc.oid), '** CONSTRAINT MISSING **') as deployed,
-- 	case
-- 		when pc.oid is null then '**FAIL** (no such constraint)'
-- 		when pg_get_constraintdef(pc.oid) ilike probe.must_contain then 'PASS'
-- 		else '**FAIL** (rule not present)'
-- 	end as verdict
-- from (values
-- 	('solid is an accepted background',   'profiles_style_bg_type_ck',   '%solid%'),
-- 	('gradient is an accepted background','profiles_style_bg_type_ck',   '%gradient%'),
-- 	('type and value appear together',    'profiles_style_bg_pair_ck',   '%is null%'),
-- 	('a solid value must be a string',    'profiles_style_bg_value_ck',  '%string%'),
-- 	('a gradient value must be an array', 'profiles_style_bg_value_ck',  '%array%'),
-- 	('a gradient holds exactly two',      'profiles_style_bg_value_ck',  '%= 2%'),
-- 	('background colours are hex',        'profiles_style_bg_value_ck',  '%[0-9a-f]{6}%'),
-- 	('the accent is hex',                 'profiles_style_accent_ck',    '%[0-9a-f]{6}%'),
-- 	('the accent match is insensitive',   'profiles_style_accent_ck',    '%~*%'),
-- 	('the badge list is closed',          'profiles_style_badge_ck',     '%rocket%'),
-- 	('glow-pulse is an allowed flourish', 'profiles_style_flourish_ck',  '%glow-pulse%'),
-- 	('particle-trail is allowed',         'profiles_style_flourish_ck',  '%particle-trail%'),
-- 	('confetti is NOT allowed',           'profiles_style_flourish_ck',  '%glow-pulse%'),
-- 	('the tagline is capped at 48',       'profiles_style_tagline_ck',   '%48%'),
-- 	('the tagline refuses empty',         'profiles_style_tagline_ck',   '%1 AND 48%'),
-- 	-- THE PLANTED CONTROL. Section 1 refuses image backgrounds, so this rule
-- 	-- is absent by design and this row MUST read **FAIL**.
-- 	('CONTROL, must FAIL: image accepted', 'profiles_style_bg_type_ck',  '%image%')
-- ) as probe(rule, conname, must_contain)
-- left join pg_constraint pc
-- 	on pc.conname = probe.conname
-- 	and pc.conrelid = 'public.profiles'::regclass
-- order by probe.conname, probe.rule;
