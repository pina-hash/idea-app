/*
 * A DIRECT, INDEPENDENT MEASUREMENT OF ONE QUESTION, kept apart from the
 * round-trip file so the answer does not depend on that file's fixtures being
 * right: can a schema-3 ported assignment's answer reach `classroom_responses`
 * through `classroom_save_response`, which is the function prompt 0134 names
 * as the whole write path?
 *
 * THIS FILE IS A PROBE, NOT A GUARANTEE. It exists to be read once, by a
 * person deciding whether the feature can land. If the gate below is ever
 * widened, this file is deleted rather than inverted.
 */
import { describe, expect, it } from 'vitest';
import { startTestDb } from './harness.ts';

/* The same chain the round-trip file boots, so the probe reads the function as
   a deployment carrying 0195 actually has it. */
const CHAIN = [
	'0001_profiles.sql',
	'0003_profile_section.sql',
	'0020_profiles_identity.sql',
	'0053_app_feedback.sql',
	'0067_admin_tier.sql',
	'0082_classroom.sql',
	'0083_classroom_management.sql',
	'0085_classroom_canonical_items.sql',
	'0086_classroom_assignment_engine.sql',
	'0090_classroom_instructor_materials.sql',
	'0092_classroom_reference_specs.sql',
	'0095_classroom_leveled_rubrics.sql',
	'0104_classroom_edit_visibility.sql',
	'0108_classroom_rich_body.sql',
	'0109_classroom_scheduled_posting.sql',
	'0110_classroom_content_revisions.sql',
	'0122_rich_text_nested_lists.sql',
	'0133_classroom_storage_attachments.sql',
	'0134_classroom_submission_open_race.sql',
	'0135_classroom_instructor_storage_and_public_attachments.sql',
	'0137_anon_execute_sweep.sql',
	'0176_classroom_item_images.sql',
	'0195_classroom_html_assignments.sql'
] as const;

describe('can a ported assignment save an answer at all', () => {
	it('reports what classroom_save_response does with no spec row', async () => {
		const db = await startTestDb(CHAIN);
		try {
			// The three things the gate reads, taken straight from 0086's source
			// rather than from anything this bundle wrote.
			const { rows: fn } = await db.sql(
				"select prosrc as src from pg_proc where proname = 'classroom_save_response'"
			);
			const src: string = fn[0].src;
			const readsSpec = src.includes('from public.classroom_assignment_specs');
			const raisesNoSpec = src.includes('This assignment has no interactive spec.');
			const resolvesBlockAgainstSpec = src.includes("v_spec->'modules'");
			const typeGate = /v_type not in \(([^)]*)\)/.exec(src)?.[1] ?? '(none)';

			console.log('--- classroom_save_response, as applied ---');
			console.log('  reads classroom_assignment_specs :', readsSpec);
			console.log('  raises "no interactive spec"      :', raisesNoSpec);
			console.log('  resolves block against the spec   :', resolvesBlockAgainstSpec);
			console.log('  accepts block types               :', typeGate);
			console.log('  manifest block types              :',
				"'text', 'longText', 'checkbox', 'radio', 'image', 'table'");

			expect(readsSpec).toBe(true);
			expect(raisesNoSpec).toBe(true);
			expect(resolvesBlockAgainstSpec).toBe(true);

			// The vocabularies overlap on ONE name. Even handed a spec row, five of
			// the six block types a manifest can declare are refused by the type
			// gate above, so "give the item a spec too" is not a repair either.
			const accepted = typeGate.split(',').map((s) => s.trim().replace(/'/g, ''));
			const manifestTypes = ['text', 'longText', 'checkbox', 'radio', 'image', 'table'];
			const overlap = manifestTypes.filter((t) => accepted.includes(t));
			console.log('  overlap                           :', overlap.join(', ') || '(none)');
			expect(overlap).toEqual(['table']);

			// And there is no other granted write into classroom_responses.
			const { rows } = await db.sql(
				`select p.proname from pg_proc p
					join pg_namespace n on n.oid = p.pronamespace
				 where n.nspname = 'public'
					and (p.prosrc like '%insert into public.classroom_responses%'
						or p.prosrc like '%update public.classroom_responses%')
				 order by p.proname`
			);
			console.log('  functions that write responses    :',
				rows.map((r) => String(r.proname)).join(', '));
			expect(rows.length).toBeGreaterThan(0);
		} finally {
			await db.stop();
		}
	});
});
