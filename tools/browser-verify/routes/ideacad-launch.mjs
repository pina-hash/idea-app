/**
 * THE IDEACAD FRONT DOOR, MEASURED. Ledger 0273.
 *
 * `/dev/ideacad-launch` mounts the REAL `LaunchPage` over an in-memory api
 * (`launch/memory.ts`) seeded with `launch/fixture.ts`: seven documents in
 * the live view (five the viewer's own, one shared, one managed; one of the
 * own five is linked to an assignment), two folders, one archived document
 * under the Archived view, and one in the trash. Every count below is a
 * number the fixture would move.
 *
 * THE TWO SENTENCES THAT MUST DIFFER. Archive keeps a model readable and
 * listed; the trash names the document and says it goes for good after
 * thirty days. The prepare steps arm the trash on "Spur gear 24T" and read
 * the confirmation, so the confirm NAMES the document, and the linked
 * assignment row shows decision 29's sentence in place of a trash control.
 *
 * THE BAND AND THE FRONT DOOR'S OWN CLAIMS (ledger 0296). The site logo links
 * home beside the IdeaCAD lockup, the page's controls share that one band,
 * every bordered control keeps its word off its border, the first model is in
 * the top half of the first screen, and the folder rail folds into one row on
 * a phone. Those are `_ideacad-launch.mjs`'s probe, shared with the naming
 * state, because two of them depend on the width and a presence row cannot.
 */
import { LAUNCH_CLAIMS, LAUNCH_VERDICTS, UNFOLDED_INTERACTIVE } from './_ideacad-launch.mjs';

export default {
	path: '/dev/ideacad-launch',
	label: 'IdeaCAD: the launch page (folders, tags, archive and trash)',
	prepare: [
		{ waitFor: '() => document.querySelectorAll(\'[data-testid="model-card"]\').length >= 7' },
		{ click: '[data-testid="model-card"][data-id="doc-spur"] [data-testid="manage"]', until: '() => !!document.querySelector(\'[data-testid="model-card"][data-id="doc-spur"] [data-testid="trash"]\')', attempts: 10, gapMs: 200 },
		/* The block with the sentence is on the card from the first frame; the CONFIRM control is what arming adds, so it is what the click waits for. */
		{ click: '[data-testid="model-card"][data-id="doc-spur"] [data-testid="trash"]', until: '() => !!document.querySelector(\'[data-testid="trash-confirm"]\')', attempts: 10, gapMs: 200 }
	],
	presence: [
		{ selector: '[data-testid="model-card"]', label: 'document cards in the live view (7)', expectPresent: 7, maxPresent: 7 },
		{ selector: '[data-testid="new-model"]', label: 'the New model control', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="view-trash"]', label: 'the Trash view control', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="view-archived"]', label: 'the Archived view control', expectPresent: 1, expectVisible: 1 },
		/* Present at every width; DRAWN only at 960px and wider, because below it the rail folds into one row. That
		   width-dependent half is the front-door probe's `the folders fold` claim, which asserts both directions. */
		{ selector: '[data-testid="folder"]', label: 'folder filters (2), drawn or folded by width', expectPresent: 2, maxPresent: 2, expectVisible: 0 },
		/* The armed confirmation, on one card only, naming the document. */
		{ selector: '[data-testid="trash-block"]', label: 'the trash confirmation, on the armed card only (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="trash-confirm"]', label: 'the trash confirm control (1)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* No purge confirm is armed in the live view. */
		{ selector: '[data-testid="purge-confirm"]', label: 'a purge confirmation, absent in the live view', expectPresent: 0 },
		/* The band: the site's own logo, home, and the IdeaCAD lockup as the page heading. */
		{ selector: '.launch .masthead a.site-logo[href="/"]', label: 'the site logo, linking home', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.launch .masthead h1 svg', label: 'the IdeaCAD cube in the page heading', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	orderResult: [{ label: 'the front door: the band, the words off their borders, the models first', evaluate: LAUNCH_VERDICTS, expected: LAUNCH_CLAIMS }],
	textContains: [
		{ selector: '[data-testid="trash-block"]', label: 'the trash confirmation names the document and the window', must: ['Spur gear 24T', '30 days'] },
		{ selector: '[data-testid="model-card"][data-id="doc-spur"]', label: 'the armed card still shows its title', must: ['Spur gear 24T'] }
	],
	contrast: [
		{ selector: '[data-testid="model-card"] h3 .title', label: 'a document title on its card', min: 4.5 },
		{ selector: '[data-testid="trash-block"] p', label: 'the trash confirmation sentence', min: 4.5 },
		{ selector: '[data-testid="new-model"]', label: 'the New model control', min: 4.5 },
		{ selector: '.launch .ic-logo .word', label: 'the IdeaCAD wordmark on the band', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.launch button, .launch a, .launch select, .launch input', label: 'every control on the launch page', min: 44 }
	],
	layoutSanity: [{ root: '.launch', label: 'the launch page', reserved: null, interactive: UNFOLDED_INTERACTIVE }],
	ignoreConsole: []
};
