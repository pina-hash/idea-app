/* NO `order` EXPORT -- see routes.mjs. */

/**
 * TAKING A GRADE BACK (ledger 0392, migration 0265, report 6bedda49): "add an
 * undo function for grading. I want to be able to revoke a grade entirely at
 * any point in time".
 *
 * Ben is the harness's returned student. The steps press what a teacher
 * presses, in order, and each `until` is the evidence the press landed:
 *
 *   1. open Ben: Undo return and Revoke grade are offered, Restore is not;
 *   2. Revoke grade: a confirm opens that NAMES the cost (his score), and
 *      nothing is revoked yet;
 *   3. Revoke the grade: the grade is off and Restore is offered;
 *   4. Restore: the grade is back, RETURNED exactly as it was, so Undo return
 *      is offered again;
 *   5. Undo return: the grade stays as a draft, Ben (who handed it in) is back
 *      in To grade, and Undo return goes away.
 *
 * The harness's in-memory transports answer the way 0265 does; the database
 * half is `tests/db/classroom-grade-revoke.test.ts`. What only a browser can
 * say is that the controls are reachable 44px keys in the score card, and that
 * each press changes what is on screen.
 */
import { WIDTHS } from './_shared.mjs';

const BEN = `[...document.querySelectorAll('.roster-list .roster-row')].find((r) => /Ben Okafor/.test(r.textContent ?? ''))`;

export default {
	path: '/dev/grading-bulk?state=undo',
	aliasOf: '/dev/grading-bulk',
	label: 'Grading console: undo a return, revoke a grade, restore it',
	widths: WIDTHS,
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length > 0', label: 'the roster has loaded' },
		{
			evaluate: `() => { ${BEN}?.click(); }`,
			until: '() => !!document.querySelector("[data-testid=grade-unreturn]") && !!document.querySelector("[data-testid=grade-revoke]") && !document.querySelector("[data-testid=grade-restore]")',
			attempts: 8,
			waitMs: 300,
			label: 'open Ben (returned): Undo return and Revoke are offered, Restore is not'
		},
		{
			click: '[data-testid="grade-revoke"]',
			until: '() => /score 15/.test(document.querySelector("[data-testid=grade-revoke-confirm]")?.textContent ?? "") && !!document.querySelector("[data-testid=grade-unreturn]")',
			label: 'Revoke grade arms a confirm that names the score it takes, and nothing is revoked yet'
		},
		{
			click: '[data-testid="grade-revoke-go"]',
			until: '() => !!document.querySelector("[data-testid=grade-restore]") && !document.querySelector("[data-testid=grade-revoke]") && !document.querySelector("[data-testid=grade-unreturn]")',
			label: 'confirm: the grade is off, nothing is returned, and Restore is offered'
		},
		{
			click: '[data-testid="grade-restore"]',
			until: '() => !!document.querySelector("[data-testid=grade-unreturn]") && !document.querySelector("[data-testid=grade-restore]") && /Restored Ben/.test(document.querySelector(".feedback.ok")?.textContent ?? "")',
			label: 'Restore: the RETURNED grade is back exactly, so Undo return is offered again'
		},
		{
			click: '[data-testid="grade-unreturn"]',
			until: '() => !document.querySelector("[data-testid=grade-unreturn]") && !!document.querySelector("[data-testid=grade-revoke]") && /Taken back from Ben/.test(document.querySelector(".feedback.ok")?.textContent ?? "")',
			label: 'Undo return: the grade stays as a draft, the return is gone, and the console says so'
		}
	],
	presence: [
		{ selector: '[data-testid="grade-undo"]', label: 'the undo row, in the score card', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grade-unreturn"]', label: 'no Undo return once the grade is not returned', expectPresent: 0 },
		{ selector: '[data-testid="grade-revoke"]', label: 'Revoke grade, still offered on the draft grade', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grade-restore"]', label: 'no Restore once nothing is waiting', expectPresent: 0 },
		{ selector: '[data-testid="grade-revoke-confirm"]', label: 'no armed confirm left open', expectPresent: 0 }
	],
	tapTargets: [
		{ selector: '[data-testid="grade-revoke"]', label: 'Revoke grade', min: 44 }
	],
	textContains: [
		{ selector: '.feedback.ok', label: 'the restore is acknowledged in words', must: ['Taken back from Ben', 'draft only you can see', 'back in To grade'] }
	]
};
