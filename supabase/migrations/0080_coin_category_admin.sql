-- 0080_coin_category_admin.sql
-- Admin-managed IDEA Coin categories: create a new category, or retire
-- (never delete) an existing one, from a real UI instead of the SQL editor.
-- 0070 documented coin_categories as "the price list is edited by hand ...
-- not through a client write path" -- this migration is the first thing to
-- open a REAL, narrow write path onto it, and the narrowness is the point.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS CAN CREATE, AND WHY 'formula' IS REFUSED
-- ---------------------------------------------------------------------------
-- coin_admin_create_category can define 'flat', 'range', 'per_unit', and
-- 'variable' categories -- every pricing shape that is just DATA: a fixed
-- price, a min/max the admin picks within, a rate x an admin-entered
-- quantity, or a whole amount the admin types at logging time. It refuses
-- 'formula' outright with an exception explaining why: a formula category
-- (Perfect Score's round(points/25), Pay Raise's tier math, Property
-- Damage's $0.25-per-i¢ exchange rate, 3D Printing's material+time bands,
-- Extra Credit's semester-cap enforcement) needs bespoke plpgsql beyond a
-- lookup, and coin_log_transaction already refuses to log ANY formula
-- category directly (0070) -- it always needs its own dedicated RPC, which
-- is a code change, not something a form can produce. This migration does
-- not touch that rule; it only adds a second, narrower door onto the same
-- table for the four shapes that genuinely are configuration.
--
-- ---------------------------------------------------------------------------
-- RETIRE, NOT DELETE -- THE SAME DOCTRINE AS EVERY OTHER LEDGER-ADJACENT
-- TABLE IN THIS SCHEMA
-- ---------------------------------------------------------------------------
-- coin_admin_set_category_active only ever flips `active`. There is no
-- delete RPC and none is planned: coin_transactions.category_id references
-- coin_categories(id) with no ON DELETE clause, so a real delete would be
-- either blocked (a category with any history) or, worse, would succeed on
-- a category that happens to have none yet and orphan every future report
-- that assumes the row still exists. `active = false` is what already
-- removes a category from every loggable list -- coin_log_transaction and
-- coin_bulk_log_section both refuse `not active`, and +page.server.ts's own
-- category query for the logging dropdowns already filters on it -- while
-- the row itself, and every coin_transactions.category_id that points at
-- it, stays exactly as valid and readable as it always was. Reactivating is
-- the same function with the flag flipped back, the sections.ts "archive /
-- reactivate, never delete" convention applied here too.
--
-- ---------------------------------------------------------------------------
-- VALIDATION MIRRORS THE TABLE'S OWN CHECK CONSTRAINT, BUT DOES NOT REPLACE
-- IT
-- ---------------------------------------------------------------------------
-- The friendlier per-field messages below (e.g. "A range category needs a
-- min and max amount, with min <= max") exist so a bad submission reads as
-- a clear refusal instead of a raw constraint-violation string. The table's
-- own CHECK from 0070 -- the one true source of "is this row shape legal"
-- -- is untouched and still the real backstop if anything here ever drifts
-- from it.
--
-- Apply manually in the Supabase SQL editor, after 0079.

-- ===========================================================================
-- Create a category. loggable and active both default true -- this tool has
-- no way to create a loggable=false mechanism row (Mint Tampering Suspect
-- Unknown's section freeze, the system Eating Pass revoke event); those stay
-- hand-authored, same as before.
-- ===========================================================================
create or replace function public.coin_admin_create_category(
	p_id text,
	p_name text,
	p_kind text,
	p_scope text,
	p_pricing_model text,
	p_amount integer default null,
	p_min_amount integer default null,
	p_max_amount integer default null,
	p_unit_label text default null,
	p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id text := lower(btrim(coalesce(p_id, '')));
	v_name text := btrim(coalesce(p_name, ''));
	v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
	v_amount integer := p_amount;
	v_min_amount integer := p_min_amount;
	v_max_amount integer := p_max_amount;
	v_unit_label text := nullif(btrim(coalesce(p_unit_label, '')), '');
	v_sort_order integer;
begin
	if not public.is_admin() then
		raise exception 'Only site admins can create IDEA Coin categories.';
	end if;
	if v_id = '' or v_id !~ '^[a-z0-9_]+$' then
		raise exception 'Category id must be lowercase letters, numbers, and underscores only.';
	end if;
	if v_name = '' then
		raise exception 'Enter a category name.';
	end if;
	if p_kind not in ('fine', 'award', 'purchase', 'adjustment') then
		raise exception 'Kind must be fine, award, purchase, or adjustment.';
	end if;
	if p_scope not in ('core', '209h') then
		raise exception 'Scope must be core or 209h.';
	end if;
	if p_pricing_model = 'formula' then
		raise exception 'Formula categories need custom logic (like Perfect Score''s rounding or Extra Credit''s semester cap) and can''t be created here -- that''s a code change (a dedicated RPC), not configuration this tool can express.';
	end if;
	if p_pricing_model not in ('flat', 'range', 'per_unit', 'variable') then
		raise exception 'Pricing model must be flat, range, per_unit, or variable.';
	end if;
	if exists (select 1 from public.coin_categories where id = v_id) then
		raise exception 'A category with id "%" already exists.', v_id;
	end if;

	if p_pricing_model = 'flat' then
		if v_amount is null or v_amount < 0 then
			raise exception 'A flat category needs a non-negative amount.';
		end if;
		v_min_amount := null;
		v_max_amount := null;
		v_unit_label := null;
	elsif p_pricing_model = 'range' then
		if v_min_amount is null or v_max_amount is null or v_min_amount > v_max_amount then
			raise exception 'A range category needs a min and max amount, with min <= max.';
		end if;
		v_amount := null;
		v_unit_label := null;
	elsif p_pricing_model = 'per_unit' then
		if v_amount is null or v_amount < 0 then
			raise exception 'A per-unit category needs a non-negative rate.';
		end if;
		if v_unit_label is null then
			raise exception 'A per-unit category needs a unit label (e.g. "point", "4 pages").';
		end if;
		v_min_amount := null;
		v_max_amount := null;
	else -- variable
		v_amount := null;
		v_min_amount := null;
		v_max_amount := null;
		v_unit_label := null;
	end if;

	-- Sorts after every existing category of the same kind, so a new
	-- category lands at the end of its group in the dropdown rather than
	-- interleaving with the seeded price list's own ordering.
	select coalesce(max(sort_order), 0) + 10 into v_sort_order
	from public.coin_categories where kind = p_kind;

	insert into public.coin_categories
		(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, loggable, active, sort_order, notes)
	values
		(v_id, v_name, p_kind, p_scope, p_pricing_model, v_amount, v_min_amount, v_max_amount, v_unit_label, true, true, v_sort_order, v_notes);

	return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.coin_admin_create_category(text, text, text, text, text, integer, integer, integer, text, text) from public;
grant execute on function public.coin_admin_create_category(text, text, text, text, text, integer, integer, integer, text, text) to authenticated;

-- ===========================================================================
-- Retire / reactivate. Never deletes -- see the migration header.
-- ===========================================================================
create or replace function public.coin_admin_set_category_active(
	p_id text,
	p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_id text := lower(btrim(coalesce(p_id, '')));
	v_active boolean := coalesce(p_active, true);
begin
	if not public.is_admin() then
		raise exception 'Only site admins can retire or reactivate IDEA Coin categories.';
	end if;
	if not exists (select 1 from public.coin_categories where id = v_id) then
		raise exception 'Unknown coin category "%".', v_id;
	end if;

	update public.coin_categories set active = v_active where id = v_id;

	return jsonb_build_object('ok', true, 'id', v_id, 'active', v_active);
end;
$$;

revoke all on function public.coin_admin_set_category_active(text, boolean) from public;
grant execute on function public.coin_admin_set_category_active(text, boolean) to authenticated;
