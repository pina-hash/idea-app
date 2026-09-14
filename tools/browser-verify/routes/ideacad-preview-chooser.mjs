/**
 * THE IDEACAD CHOOSER, MEASURED. Ledger 0264.
 *
 * WHY THIS FILE EXISTS. `/ideacad` opens on the chooser, so it is the first
 * screen anybody using IdeaCAD sees, and until this run it had never been
 * measured at any width. `tests/ideacad-chooser.test.ts` proves the arithmetic
 * and `tests/ideacad-chooser-render.test.ts` proves which controls reach the
 * page; neither can see a box, a ratio or a tap target -- there is no layout
 * engine on either path, so a measurement taken there reads zero and passes
 * vacuously. That is what this file is for and it is the only thing it claims.
 *
 * THE PATH IS NOT UNDER `/dev`, AND IT IS THE FIRST ROUTE HERE THAT IS NOT.
 * Every property the `/dev` convention stands for holds: the page 404s outside
 * `dev`, it needs no session, it touches no Supabase (an inert client is handed
 * in, and `createIdeacadLive` builds its channels lazily so nothing is called),
 * and it mounts the REAL `IdeaCadApp` rather than a copy of its markup.
 * IdeaCAD's own harness routes have lived under `/ideacad/preview/` since the
 * subsystem was built, and moving them is a different lane's change.
 *
 * TAP TARGETS ARE MEASURED AT 44px WITH NO 24px RELIEF. This is a student
 * surface at every width -- a student picking their own document -- so
 * `IDEA_INTERFACE_STANDARDS` 10's floor is 44, the instructor-console
 * exemption does not apply, and the page declares no class claiming it.
 * `ideacad.css`'s `.ic-dense` relief is the EDITOR's and stops at the editor.
 *
 * THE FIXTURE IS CHOSEN SO NO COUNT CAN PASS VACUOUSLY. Eight documents (past
 * `IDEACAD_CHOOSER_CONTROLS_AT`, so the search, the four filters and the sort
 * are all drawn), three of them the viewer's own and five somebody else's, one
 * archived, two with no readable profile, and four manageable -- so every
 * presence count below is a NUMBER a fixture change would move rather than a
 * selector that merely matched something.
 */
export default {
	path: '/ideacad/preview/chooser',
	label: 'IdeaCAD: the document chooser',
	presence: [
		{ selector: '[data-testid="ideacad-app"]', label: 'the app shell', expectPresent: 1, expectVisible: 1 },
		/* Eight cards, counted. A grid that rendered one looks fine to a
		   selector, which is how a list defect gets through a presence check. */
		{ selector: '.doc', label: 'document cards (8)', expectPresent: 8, expectVisible: 8 },
		{ selector: '.doc-open', label: 'open controls, one per card plus two starters (10)', expectPresent: 10, expectVisible: 10 },
		/* SIX THUMBNAILS AND TWO SAYING THERE IS NONE. The absence has its own
		   positive control on the same page: a card whose tree could not be read
		   SAYS so rather than leaving a hole where a picture goes. */
		{ selector: '.doc .thumb svg polyline', label: 'profile thumbnails drawn from a stored tree (6)', expectPresent: 6, expectVisible: 6 },
		{ selector: '.thumb-none', label: 'the no-profile note, on the two cards whose tree could not be read', expectPresent: 2, expectVisible: 2 },
		/* WHOSE WORK IT IS, BOTH DIRECTIONS. Five other people's documents carry
		   an owner line and the viewer's own three carry none -- so this count is
		   the gate rather than a headcount: 8 would mean the caller's own address
		   on their own cards, 0 would mean a manager's list of identical titles. */
		{ selector: '.doc .owner', label: 'owner lines, on somebody else’s work only (5 of 8)', expectPresent: 5, expectVisible: 5 },
		/* THE ARCHIVE CONTROL IS THE MANAGER'S, AND ITS ABSENCE IS THE FEATURE.
		   Four manageable rows draw one; the other four draw none. Both halves
		   are counted here, and `tests/ideacad-chooser-render.test.ts` pins the
		   same gate with the flag off across the whole fixture. */
		{ selector: '.doc-actions button', label: 'Archive / Restore, on the four manageable rows only', expectPresent: 4, expectVisible: 4 },
		/* NOTHING DESTRUCTIVE-LOOKING IS ONE PRESS AWAY. The confirmation is
		   armed by the control above; on the first frame there is none. */
		{ selector: '.confirm-note', label: 'the confirmation, absent until one is armed', expectPresent: 0 },
		{ selector: '.doc .chip', label: 'the Archived chip, on the one archived row', expectPresent: 1, expectVisible: 1 },
		/* The controls, drawn because the fixture is past the threshold. */
		{ selector: 'input[type="search"]', label: 'the search box', expectPresent: 1, expectVisible: 1 },
		{ selector: '.filters button', label: 'the four filter tabs', expectPresent: 4, expectVisible: 4 },
		{ selector: '.sort select', label: 'the sort control', expectPresent: 1, expectVisible: 1 },
		/* No document is open, so the command bar carries no document title and
		   no refusal is on screen. Both are absences with the shell above as the
		   positive control that the page rendered at all. */
		{ selector: '[data-testid="ideacad-document-title"]', label: 'the document title, absent until one is open', expectPresent: 0 },
		{ selector: '.refusal', label: 'the refusal panel, absent with nothing refused', expectPresent: 0 },
		{ selector: '.new-grid .doc-open', label: 'the two starters', expectPresent: 2, expectVisible: 2 }
	],
	contrast: [
		{ selector: '.start-heading h1', label: 'the chooser heading', min: 4.5 },
		{ selector: '.start-heading > p:last-child', label: 'the lede on the chooser ground', min: 4.5 },
		{ selector: '.eyebrow', label: 'the IDEACAD // DOCUMENT CONTROL eyebrow', min: 4.5 },
		{ selector: '.section-label h2', label: 'a section heading', min: 4.5 },
		{ selector: '.section-label span', label: 'the count beside a section heading', min: 4.5 },
		{ selector: '.doc-body strong', label: 'a document title on its card', min: 4.5 },
		/* THE TWO THAT WERE MOST LIKELY TO BE WRONG: both are muted copy on a
		   card ground rather than on the page plate, which is the arithmetic the
		   notebook's plate rules exist about. */
		{ selector: '.doc .owner', label: 'an owner address on the card ground', min: 4.5 },
		{ selector: '.doc .meta', label: 'the edited-at and concept count on the card ground', min: 4.5, all: true },
		{ selector: '.card-code', label: 'the DOCUMENT code line on the card ground', min: 4.5 },
		{ selector: '.chip', label: 'the Archived chip', min: 4.5 },
		{ selector: '.thumb-none', label: 'the no-profile note inside the thumbnail box', min: 4.5 },
		{ selector: '.filters button', label: 'a filter tab, including the active one', min: 4.5, all: true },
		{ selector: '.sort', label: 'the Sort label', min: 4.5 },
		{ selector: '.doc-note', label: 'the sentence saying what an archived document is', min: 4.5 },
		{ selector: '.command-bar a.brand', label: 'the IDEACAD wordmark', min: 4.5 },
		{ selector: '.command-bar button', label: 'a command bar control', min: 4.5, all: true },
		{ selector: '.command-bar a.exit', label: 'Exit to IDEA', min: 4.5 },
		/* A GRAPHICAL OBJECT, SO THE FLOOR IS 3:1 RATHER THAN 4.5. The polyline
		   IS the picture; a thumbnail nobody can make out is a card that says
		   nothing about what the document is, which is item 1's whole point. */
		{ selector: '.doc .thumb svg polyline', label: 'the profile polyline against the thumbnail ground', min: 3 }
	],
	tapTargets: [
		{ selector: '.doc-open', label: 'a card’s open control' },
		{ selector: '.doc-actions button', label: 'Archive on a manageable row' },
		{ selector: '.filters button', label: 'a filter tab' },
		{ selector: 'input[type="search"]', label: 'the search box' },
		{ selector: '.sort select', label: 'the sort control' },
		{ selector: '.command-bar button', label: 'a command bar control' },
		{ selector: '.command-bar a', label: 'a command bar link' }
	],
	textContains: [
		{
			selector: '.start-card',
			/* The words, not only the counts above. A list that rendered eight
			   cards with the wrong labels satisfies every count and tells a
			   reader nothing about what they are looking at. */
			label: 'a card says what the document IS, not only its name',
			must: ['Edited', 'concepts', 'Archived', 'Shared with me', 'Last edited'],
			/* THE CHOOSER MUST NOT OFFER WHAT THE SCHEMA CANNOT DO. Rename and
			   duplicate are structurally impossible without a migration -- see
			   `src/lib/ideacad/app/types.ts`'s header -- and a control whose only
			   possible outcome is a refusal must not be drawn. */
			mustNot: ['Rename', 'Duplicate', 'Delete']
		}
	]
};
