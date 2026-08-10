-- 0081_coin_debt_payment.sql
-- IDEA Coin debt payment: a pre-seeded category (data only, no new RPC --
-- 'variable' pricing already goes through the existing generic
-- coin_log_transaction from 0070) so a student paying down a negative
-- balance is logged distinctly from a general "Physical Coin Submission".
--
-- ---------------------------------------------------------------------------
-- SAME SHAPE AS PHYSICAL COIN SUBMISSION, DELIBERATELY A SEPARATE ROW
-- ---------------------------------------------------------------------------
-- Both are kind='award' (credits the balance, positive direction) and
-- pricing_model='variable' (the admin enters the whole amount at logging
-- time, per docs Part 3's own "no fixed amount, by design" doctrine for
-- Physical Coin Submission). Debt Payment is its OWN category id rather than
-- reusing physical_coin_submission -- filtering coin_transactions by
-- category_id = 'debt_payment' is what makes debt settlement reportable
-- separately from an ordinary coin submission, with nothing to disambiguate
-- after the fact (no note-parsing, no meta flag to remember to set).
--
-- ---------------------------------------------------------------------------
-- NOT CAPPED AT THE DEBT AMOUNT -- ON PURPOSE
-- ---------------------------------------------------------------------------
-- coin_log_transaction's own debt lockout (0070) only blocks PURCHASE-kind
-- transactions while a balance is already negative; awards (this one
-- included) still apply past zero with no cap, exactly like every other
-- award or fine. So a payment larger than the current debt is a legitimate
-- outcome (the balance goes slightly positive), never a refusal -- the UI
-- (src/lib/coin-desk/DebtPaymentPanel.svelte) suggests the exact debt amount
-- but never enforces a ceiling, matching this row's own pricing_model.
--
-- Apply manually in the Supabase SQL editor, after 0080.

insert into public.coin_categories
	(id, name, kind, scope, pricing_model, amount, min_amount, max_amount, unit_label, formula_key, semester_point_cap, cap_period, cap_count, loggable, active, sort_order, notes)
values
	(
		'debt_payment',
		'Debt Payment',
		'award',
		'core',
		'variable',
		null, null, null, null, null, null, null, null,
		true,
		true,
		213,
		'Debt settlement, logged distinctly from Physical Coin Submission so it is reportable separately. Not capped at the current debt -- a payment can be partial or can exceed it (the balance going slightly positive is correct, not an error).'
	)
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
