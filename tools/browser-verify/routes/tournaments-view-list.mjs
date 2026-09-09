/**
 * THE ARENA BOARD, SIGNED OUT (prompt 0110, item 3).
 *
 * The REAL TournamentBoard the /tournaments route mounts, inside the room at
 * the `tnm-page wide` measure, over the harness's five-tournament fixture:
 * one live (with a match on the floor, so the marquee has a pair), one open
 * for entry (teams of up to 3), one seeding, two finished with champions.
 * This is the SPECTATOR reading: nobody is signed in, so every tournament
 * still offers a way to watch, the open one says "Sign in to enter" rather
 * than "Register", and nothing on the page manages or deletes anything.
 *
 * THE ROWS EVERY BOARD VARIANT SHARES ARE EXPORTED FROM HERE, and the
 * signed-in and admin specs import them rather than retyping them: three
 * copies of "one emerald element" is three things that stop agreeing. The
 * loader reads only `default` and `order` off a route file, so the named
 * exports cost nothing (routes.mjs).
 */

/** The board's structure: one marquee, four cards, four lanes, one LIVE chip. */
export const BOARD_PRESENCE = [
	{ selector: '[data-testid="tournament-board"]', label: 'the board mounted in the room', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
	{ selector: '[data-testid="board-marquee"]', label: 'one marquee (the first live tournament)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
	/* THE ONE EMERALD ELEMENT. The marquee's chip is the dominant one and the
	   whole board carries exactly one `.tnm-status.live`: the fixture has
	   one live tournament, so a second chip anywhere is a second emerald
	   element on the screen (the room's own hard rule). Both rows, so a chip
	   that moved OUT of the marquee reddens on the first and a chip that was
	   ADDED elsewhere reddens on the second. */
	{ selector: '[data-testid="board-marquee"] .tnm-status.live', label: 'the LIVE chip inside the marquee', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
	{ selector: '[data-testid="tournament-board"] .tnm-status.live', label: 'LIVE chips on the whole board (the one emerald element)', expectPresent: 1, maxPresent: 1 },
	{ selector: '[data-testid="board-card"]', label: 'cards under the marquee (open, seeding, two finished)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
	{ selector: '[data-testid^="board-lane-"]', label: 'lanes (live, open, upcoming, finished; an empty lane renders nothing)', expectPresent: 4, maxPresent: 4 },
	{ selector: '[data-testid="board-lane-open"] .tnm-status.open', label: 'the Open chip', expectPresent: 1, maxPresent: 1 },
	{ selector: '[data-testid="board-lane-finished"] .tnm-status.done', label: 'the two Final chips', expectPresent: 2, maxPresent: 2 },
	{ selector: '[data-testid="board-marquee"] [data-testid="event-rail"]', label: 'the marquee event rail', expectPresent: 1, maxPresent: 1 },
	{ selector: '[data-testid="board-marquee"] .mq-pair .entry-banner', label: 'the in-progress pair on the marquee', expectPresent: 2, maxPresent: 2 },
	/* THE SPECTATOR GUARANTEE: a way to watch for EVERY tournament, whoever
	   is looking. Five tournaments, five `data-watch` links (Watch on the
	   live, open and upcoming ones, Results on the finished ones). */
	{ selector: '[data-testid="tournament-board"] a[data-watch]', label: 'a Watch / Results link per tournament (the spectator guarantee: 5 of 5)', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
	{ selector: '.board-card .title, .board-marquee .title', label: 'one title link per card and the marquee', expectPresent: 5, maxPresent: 5 }
];

/** Lanes render in the order a person can act on them; the marquee leads. */
export const BOARD_ORDER = [
	{ before: '[data-testid="board-lane-live"]', after: '[data-testid="board-lane-open"]', label: 'live before open' },
	{ before: '[data-testid="board-lane-open"]', after: '[data-testid="board-lane-upcoming"]', label: 'open before upcoming' },
	{ before: '[data-testid="board-lane-upcoming"]', after: '[data-testid="board-lane-finished"]', label: 'upcoming before finished' },
	{ before: '[data-testid="board-marquee"]', after: '[data-testid="board-card"]', label: 'the marquee precedes every card' }
];

/** Every word on the board against the panel it sits on. */
export const BOARD_CONTRAST = [
	{ selector: '.lane-label', label: 'lane labels (mono, ink-dim)', min: 4.5 },
	{ selector: '.lane-label .count', label: 'lane counts', min: 4.5 },
	{ selector: '.board-marquee .mq-name', label: 'marquee name', min: 4.5 },
	{ selector: '.board-card .title h3', label: 'card names', min: 4.5 },
	{ selector: '.board-marquee .tnm-status.live', label: 'the LIVE chip (accent on its wash)', min: 4.5 },
	{ selector: '[data-testid="board-lane-open"] .tnm-status.open', label: 'the Open chip', min: 4.5 },
	{ selector: '[data-testid="board-lane-finished"] .tnm-status.done', label: 'the Final chip (gold)', min: 4.5 },
	{ selector: '[data-testid="board-lane-upcoming"] .tnm-status', label: 'the Seeding chip (plain)', min: 4.5 },
	{ selector: '.board-card .desc', label: 'card description', min: 4.5 },
	{ selector: '.board-card .meta .m-item', label: 'card meta (entry count, team size)', min: 4.5 },
	{ selector: '.board-card .champ', label: 'Champion line (gold, placement only)', min: 4.5 },
	{ selector: '.board-marquee .mq-floor-label', label: 'marquee floor label', min: 4.5 },
	{ selector: '[data-testid="tournament-board"] a[data-watch]', label: 'Watch / Results links', min: 4.5 },
	{ selector: '[data-testid="tournament-board"] .tnm-actions .btn.secondary', label: 'secondary actions (TV mode, Watch, Results)', min: 4.5 }
];

/** Every action on a student-facing surface clears 44px; a title is a link too. */
export const BOARD_TAPS = [
	{ selector: '.board-card .btn', label: 'card actions', min: 44 },
	{ selector: '[data-testid="board-marquee"] .tnm-actions .btn', label: 'marquee actions (Watch, TV mode)', min: 44 },
	{ selector: '.board-card .title, .board-marquee .title', label: 'title links (the whole name is the link)', min: 44 }
];

/* THE CHIP'S OWN PULSE IS OUT OF THIS INSTRUMENT'S REACH, AND THE RAIL'S IS
   NOT. `motion` discovers with `Element.getAnimations()` and no `subtree`,
   and the LIVE chip's dot is `.tnm-live::before` (tournaments-theme.css), so
   a `motion` row on the chip reads "0 animated" about a pulse that is
   running and fails its own positive control (see the note in
   tournaments.mjs). The marquee's rail live cell animates the ELEMENT, in
   the same stylesheet under the same reduced-motion gate, so it is the
   measured one; the probe below proves the chip's pulse exists at all. */
export const BOARD_MOTION = [
	{ selector: '[data-testid="board-marquee"] [data-testid="event-rail"] .cell.live', label: 'marquee rail live cell pulse', expect: 'gated' }
];

export const BOARD_PROBES = [
	{
		/* The chip: a glyph AND a word, and the glyph is running. The word is
		   the signal (colour is never the only one); the pulse is read off
		   the pseudo-element with `subtree: true`, which `motion` cannot do. */
		evaluate: () => {
			const chip = document.querySelector('[data-testid="board-marquee"] .tnm-status.live');
			if (!chip) return ['chip:MISSING'];
			const anims = chip.getAnimations({ subtree: true });
			const pulse = anims.filter((a) => a.animationName === 'tnm-live-pulse');
			const onBefore = pulse.some((a) => a.effect && a.effect.pseudoElement === '::before');
			const word = (chip.textContent || '').replace(/\s+/g, ' ').trim();
			return [
				'chip:present',
				pulse.length ? 'pulse:running' : 'pulse:NOT-RUNNING',
				onBefore ? 'pulse-on:::before' : 'pulse-on:' + (pulse[0]?.effect?.pseudoElement ?? 'element'),
				'word:' + word
			];
		},
		expected: ['chip:present', 'pulse:running', 'pulse-on:::before', 'word:Live'],
		label: 'the marquee LIVE chip carries the word and its ::before pulse is running'
	},
	{
		/* Every chip on the board says a word once its glyph is stripped:
		   a chip that lost its text and kept its `+` or `✦` is present,
		   coloured and mute. */
		evaluate: () => {
			const chips = Array.from(document.querySelectorAll('[data-testid="tournament-board"] .tnm-status'));
			const words = chips.map((c) => {
				const clone = c.cloneNode(true);
				clone.querySelectorAll('[aria-hidden="true"]').forEach((g) => g.remove());
				return (clone.textContent || '').replace(/\s+/g, ' ').trim();
			});
			const glyphs = chips.filter((c) => c.querySelector('.g:not([aria-hidden="true"])')).length;
			return [
				'chips:' + chips.length,
				words.every((w) => w.length > 0) ? 'every-chip-has-a-word:yes' : 'every-chip-has-a-word:NO(' + words.join('|') + ')',
				'unhidden-glyphs:' + glyphs,
				'words:' + Array.from(new Set(words)).sort().join('/')
			];
		},
		expected: ['chips:5', 'every-chip-has-a-word:yes', 'unhidden-glyphs:0', 'words:Final/Live/Open/Seeding'],
		label: 'five chips, each with a word after its aria-hidden glyph is stripped'
	}
];

export const BOARD_WORDS = [
	{ selector: '[data-testid="board-marquee"] .tnm-status.live', label: 'the live chip carries the word', must: ['Live'] },
	{ selector: '[data-testid="board-lane-open"] .tnm-status.open', label: 'the open chip carries the word', must: ['Open'] },
	{ selector: '[data-testid="board-lane-finished"] .tnm-status.done', label: 'the final chip carries the word', must: ['Final'] },
	{ selector: '[data-testid="board-lane-upcoming"] .tnm-status', label: 'the upcoming chip carries the status word', must: ['Seeding'] },
	{ selector: '.lane-label', label: 'the four lane labels', must: ['Live now', 'Open for entry', 'Coming up', 'Finished'] },
	{ selector: '[data-testid="board-lane-finished"] .champ', label: 'the champion is named in the finished lane', must: ['Champion:'] },
	{ selector: '[data-testid="board-lane-open"] .meta', label: 'the team size is stated on the open card', must: ['teams of up to 3'] },
	{ selector: '[data-testid="board-marquee"] .tnm-actions', label: 'the marquee offers Watch and TV mode', must: ['Watch', 'TV mode'] }
];

export default {
	path: '/dev/tournaments?view=list',
	label: 'The arena board, signed out: spectate everything, enter nothing',
	settleMs: 900,
	presence: [
		...BOARD_PRESENCE,
		/* Signed out: the open card asks for a sign-in and nothing manages.
		   The three absences sit beside the register link itself (present,
		   reading "Sign in to enter") and the Watch links above as their
		   positive controls. */
		{ selector: '[data-testid="board-lane-open"] a[data-register]', label: 'the enter link on the open card (reads Sign in to enter)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="tournament-board"] [data-manage]', label: 'Manage links for a signed-out viewer', expectPresent: 0 },
		{ selector: '[data-testid="tournament-board"] .card-admin', label: 'delete controls with no ondelete transport', expectPresent: 0 },
		{ selector: '[data-testid="board-invites"]', label: 'an invites section for a signed-out viewer', expectPresent: 0 }
	],
	domOrder: BOARD_ORDER,
	contrast: [
		...BOARD_CONTRAST,
		{ selector: '[data-testid="board-lane-open"] a[data-register]', label: 'Sign in to enter', min: 4.5 }
	],
	tapTargets: BOARD_TAPS,
	motion: BOARD_MOTION,
	orderResult: BOARD_PROBES,
	textContains: [
		...BOARD_WORDS,
		/* BOTH DIRECTIONS. A signed-out board says "Sign in to enter" and
		   never "Register"; `mustNot` is what catches a card that kept the
		   sentence and added the control. Scoped to the board so the hero's
		   own lead copy ("Sign in to enter or to host") is not what passes it. */
		{ selector: '[data-testid="board-lane-open"] .tnm-actions', label: 'the open card asks for a sign-in, never offers Register', must: ['Sign in to enter', 'Watch'], mustNot: ['Register'] },
		{ selector: '[data-testid="tournament-board"]', label: 'nothing on the board manages, deletes or hosts', mustNot: ['Register', 'Manage', 'Delete tournament', 'You host this'], must: ['Watch'] }
	]
};
