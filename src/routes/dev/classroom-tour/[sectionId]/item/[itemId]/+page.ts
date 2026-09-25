import { error } from '@sveltejs/kit';
import type { AssignmentSpec, StudentEngineData } from '$lib/classroom/assignment-spec';
import type { HtmlAssignmentData } from '$lib/classroom/html-assignment/mount';
import { itemById } from '../../../../classroom-palette/fixture';
import { harnessManage } from '../../+layout.svelte';
import type { PageLoad } from './$types';

/**
 * The item load, mirroring the real one: the ITEM, and -- for the two items
 * this harness makes into work surfaces -- the same keys the real item load
 * returns for one (ledger 0298, report 25), so the shell reads the class list's
 * default off `page.data` exactly as it does on `/classroom`:
 *
 *   i-beam     a SPEC assignment: `spec` for a manager, `engine.spec` for a
 *              student, the two roles' own reads in `+page.server.ts`;
 *   i-tonight  a PORTED HTML worksheet: `assignment_schema_version: 3` on the
 *              item and `htmlAssignment` naming the dev `/hx/worksheet` fixture.
 *
 * Every other item returns the three work keys as null, which is what the real
 * load returns for a material or a plain assignment, so the specs that open
 * `i-missing` (the list-width separator) measure what they always measured.
 * The role is the harness's own latch (`?manage=1`, remembered across item
 * links that carry no query), read here because the real load's answer turns on
 * it too.
 */
const SPEC = {
	schemaVersion: 1,
	meta: { assignmentId: 'beam', title: 'Beam deflection lab', totalPoints: 30 },
	modules: [
		{
			id: 'm1',
			title: 'Deflection',
			points: 30,
			instructions: 'Load the beam in steps and record the deflection at the centre.',
			blocks: [{ type: 'textField', id: 'b1', prompt: 'What did the beam do at the last load step?' }]
		}
	]
} as unknown as AssignmentSpec;

/** The `/hx/worksheet` fixture's own fields (src/routes/hx/_documents.ts). */
const WORKSHEET = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Bridge fixture worksheet',
	course: 'IDEA209H',
	points: 10,
	modules: [
		{
			id: 'mod-1',
			title: 'One module, three block types',
			points: 10,
			blocks: [
				{ id: 'mod-1.a.team', field: 'teamName', type: 'text' },
				{ id: 'mod-1.b.reflection', field: 'reflection', type: 'longText', minSentences: 2 },
				{ id: 'mod-1.c.done', field: 'checkedOff', type: 'checkbox' }
			],
			criteria: []
		}
	]
};

export const load: PageLoad = async ({ params, url }) => {
	const found = itemById(params.itemId);
	if (!found) error(404, 'Not found');
	let item = found;
	let spec: AssignmentSpec | null = null;
	let engine: StudentEngineData | null = null;
	let htmlAssignment: HtmlAssignmentData | null = null;
	if (found.id === 'i-beam') {
		if (harnessManage(url)) spec = SPEC;
		else
			engine = {
				spec: SPEC,
				rubric: null,
				submission: null,
				responses: [],
				files: [],
				approvals: []
			} as unknown as StudentEngineData;
	} else if (found.id === 'i-tonight') {
		item = { ...found, assignment_schema_version: 3 } as typeof found;
		htmlAssignment = { documentId: 'worksheet', manifest: WORKSHEET, filename: 'worksheet.html', updatedAt: null };
	}
	return { item, spec, engine, htmlAssignment };
};
