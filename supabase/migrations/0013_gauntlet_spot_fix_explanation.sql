-- 0013_gauntlet_spot_fix_explanation.sql
-- IDEA // GAUNTLET: correct one stale explanation in the 0012 Spot the Error seed.
--
-- The 'spot-undefined-datum' challenge was seeded with an explanation naming
-- "Callout 1" while its correct answer is callout 4. The option rebalance
-- renumbered the answer but missed the prose. Grading is unaffected (it keys on
-- answer->>'correct' = '4'); only the displayed explanation was wrong. 0012 is
-- idempotent on slug, so re-running it will not self-correct this row.
--
-- This patches ONLY answer.explanation on that single row. jsonb_set preserves
-- every other key in answer (correct, type), and the slug filter scopes it to
-- the one challenge. Idempotent: re-running sets the same value.
--
-- Apply manually in the Supabase SQL editor.

update public.challenges
set answer = jsonb_set(
	answer,
	'{explanation}',
	to_jsonb('Callout 4 references datum D, but the part defines only datums A, B, and C. A frame cannot reference a datum that is never established on the part.'::text)
)
where prompt->>'slug' = 'spot-undefined-datum';
