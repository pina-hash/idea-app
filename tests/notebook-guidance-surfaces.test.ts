// tests/notebook-guidance-surfaces.test.ts
//
// THE CLIENT SIDE OF 0123: a check-in's guidance prompt, authored on three
// surfaces and read on three more.
//
// tests/notebook-session-guidance.test.ts already covers the migration -- who
// may write, what the shared gate refuses, that the write is narrow, that null
// clears. This file covers what the CLIENT does with it, and only the parts
// whose regression would be SILENT. Everything else about this feature (does
// the panel open, does the editor take a paste, does the counter tick) fails
// visibly the first time anyone looks and belongs in a harness.
//
// FOUR CLAIMS, and the first is the one the whole design turns on:
//
//   1. THE PROMPT IS READ THROUGH THE CHECK-IN, NEVER COPIED ONTO THE ENTRY.
//      The rejected alternative -- snapshot the guidance onto the entry when it
//      is filed -- looks identical on every screen and is wrong exactly once:
//      when an instructor CORRECTS an unclear instruction. Under the snapshot
//      design the students who already answered the unclear one keep reading it
//      forever, and nothing anywhere says so. `notebook-guidance-propagates`
//      below drives the REAL load function over a real database to prove the
//      correction reaches an entry that was filed before it.
//
//   2. PRESENCE GATES THE CONTROL. Guidance is offered only where it can be
//      WRITTEN. A field rendered on a deployment without 0123, or to somebody
//      with no transport, collects prose that goes nowhere -- and looks exactly
//      like a field that works, right up until the save.
//
//   3. THE COMPOSER'S TWO-PHASE SAVE. The check-in and its prompt are TWO
//      writes, so a save can half-land. A retry after that must write the
//      prompt onto the check-in already made; creating a second one puts a
//      second column on every affected class's grid and asks a class for the
//      same page twice. A duplicate check-in looks exactly like a successful
//      retry until somebody opens the grid.
//
//   4. THE WORD COUNTER COUNTS WHAT THE PAGE WILL SHOW, and never gates.
//
// MUTATION-CHECKED. See docs/HISTORY.md for what was mutated and what reddened,
// including the rejected alternative in claim 1.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SessionManager from '../src/lib/notebook/SessionManager.svelte';
import NotebookEntryCard from '../src/lib/notebook/NotebookEntryCard.svelte';
import {
	GUIDANCE_WORD_TARGET,
	guidanceState,
	guidanceWordCount,
	hasGuidance
} from '../src/lib/check-in-guidance';
import { instructionsWordCount, type SpecModule } from '../src/lib/classroom/assignment-spec';
import {
	applyStagedExtras,
	type StagedExtrasTransports
} from '../src/lib/classroom/composer-staging';
import { MANAGE_SESSION_SELECTS, NOTEBOOK_SESSION_SELECTS } from '../src/lib/notebook-selects';
import type { GridSession } from '../src/lib/notebook-review';
import type { TiptapNode } from '../src/lib/rich-text';
import type { NotebookEntry } from '../src/lib/notebook';
import {
	editorDoc,
	itemSchema,
	pmBold,
	pmBullets,
	pmDoc,
	pmItem,
	pmPara,
	pmText
} from './rich-text-fixtures';

// ---------------------------------------------------------------------------
// Claim 4 first, because it is pure: the word counter.
// ---------------------------------------------------------------------------

/**
 * THE EXPECTED VALUE DOES NOT COME FROM THE THING UNDER TEST.
 *
 * `instructionsWordCount` is the repo's OTHER word count -- it walks
 * `parseMarkdown`'s output for the spec instructions budget, has been in the
 * tree since long before this feature, and is fixed by its own corpus in
 * tests/spec-instructions-budget.test.ts. The two share `countWords` and
 * nothing else: one walks markdown nodes, the other walks ProseMirror JSON. So
 * putting the SAME prose through both and requiring the same number is a real
 * cross-check rather than an implementation agreeing with itself. A third
 * opinion -- the count done by hand -- is asserted beside it, so the two
 * agreeing on a wrong number cannot pass either.
 */
function markdownModule(md: string): SpecModule {
	return { blocks: [{ type: 'instructions', content: md }] } as SpecModule;
}

/**
 * `editorDoc` answers ProseMirror's OWN serialization as an untyped record --
 * deliberately, so a fixture cannot smuggle in a key the editor would never
 * emit. The counter takes the app's `TiptapNode`, and this is the one place the
 * two meet. It is a cast and not a rebuild: rebuilding the object here would
 * throw away exactly the guarantee `editorDoc` exists to provide.
 */
const asEditorDoc = (json: Record<string, unknown>) => json as unknown as TiptapNode;

describe('the guidance word count', () => {
	it('agrees with the spec instructions counter on the same prose', () => {
		const prose = 'Photograph both pages of your teardown notes, flat and in focus.';
		const doc = editorDoc(itemSchema, pmDoc(pmPara(pmText(prose))));
		expect(guidanceWordCount(asEditorDoc(doc))).toBe(instructionsWordCount(markdownModule(prose)));
		expect(guidanceWordCount(asEditorDoc(doc))).toBe(11);
	});

	/**
	 * WITHIN a block, adjacent runs are joined before counting. ProseMirror
	 * splits "un**bold**ed" into three text nodes, and counting them separately
	 * charges the author three words for one.
	 */
	it('joins runs inside one block, so a bolded fragment is not a second word', () => {
		const doc = editorDoc(
			itemSchema,
			pmDoc(pmPara(pmText('un'), pmText('bold', [pmBold]), pmText('ed')))
		);
		expect(guidanceWordCount(asEditorDoc(doc))).toBe(1);
	});

	/**
	 * ACROSS blocks it must NOT join, and this is the half with history: the
	 * notebook normalizer joined across a structural boundary on real content
	 * and turned two list items into one unreadable one. Two one-word items are
	 * two words, not one.
	 */
	it('never joins across a structural boundary, so two list items are two words', () => {
		const doc = editorDoc(
			itemSchema,
			pmDoc(pmBullets(pmItem(pmPara(pmText('bore'))), pmItem(pmPara(pmText('OD')))))
		);
		expect(guidanceWordCount(asEditorDoc(doc))).toBe(2);
	});

	it('counts an empty or absent document as nothing', () => {
		expect(guidanceWordCount(null)).toBe(0);
		expect(guidanceWordCount(asEditorDoc(editorDoc(itemSchema, pmDoc(pmPara()))))).toBe(0);
	});

	/**
	 * THE TARGET IS A TARGET. Asserted as the RULE -- nothing that decides
	 * whether a write happens reads the count -- rather than as a list of
	 * states, so adding a fourth advisory state does not break this and adding
	 * a gate does.
	 */
	it('never reaches a state that could gate a save', () => {
		expect(guidanceState(0)).toBe('empty');
		expect(guidanceState(GUIDANCE_WORD_TARGET)).toBe('within');
		expect(guidanceState(GUIDANCE_WORD_TARGET + 1)).toBe('over');
		const field = readFileSync(
			new URL('../src/lib/CheckInGuidance.svelte', import.meta.url),
			'utf8'
		);
		expect(field).toContain('guidance-word-count');
		expect(field).not.toMatch(/disabled=\{[^}]*(words|countState)/);
		expect(field).not.toMatch(/if\s*\([^)]*\bwords\b\s*[><]/);
	});
});

// ---------------------------------------------------------------------------
// The three shapes that all mean "no prompt".
// ---------------------------------------------------------------------------

describe('an empty prompt and no prompt are one state', () => {
	it('reads null, an empty document and a document of empty blocks the same way', () => {
		expect(hasGuidance(null)).toBe(false);
		expect(hasGuidance([])).toBe(false);
		expect(hasGuidance([{ type: 'p', runs: [{ text: '   ' }] }])).toBe(false);
		// The positive controls, so the three above cannot be passing vacuously.
		expect(hasGuidance([{ type: 'p', runs: [{ text: 'Photograph both pages.' }] }])).toBe(true);
		// A list counts on its items, having no top-level runs of its own.
		expect(hasGuidance([{ type: 'ul', items: [[{ text: 'bore' }]] }])).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Claim 2: presence gates the control, on the two surfaces that render without
// a browser. Each absence is paired with a present counterpart, so a control
// that never rendered at all cannot pass as a gate.
// ---------------------------------------------------------------------------

const SECTION = {
	id: 'sec-a',
	course_code: 'IDEA209H',
	course_title: 'Engineering',
	label: 'Section 1',
	block: '2',
	teacher_email: 'teacher@boscotech.edu'
};

function gridSession(over: Partial<GridSession> = {}): GridSession {
	return {
		id: 'ses-1',
		unit_number: 3,
		session_date: '2026-08-07',
		session_label: 'Bearing teardown',
		section_ids: ['sec-a'],
		guidance_doc: null,
		...over
	};
}

function managerHtml(props: Record<string, unknown> = {}): string {
	return render(SessionManager, {
		props: {
			sectionId: 'sec-a',
			sections: [SECTION],
			sessions: [gridSession()],
			onSave: async () => ({ ok: true, value: { session_id: 'ses-1' } }),
			onDelete: async () => ({ ok: true, value: { detached_entries: 0 } }),
			onAddSections: async () => ({ ok: true, value: { added: 0 } }),
			onRemoveSection: async () => ({ ok: true, value: { ok: true } }),
			...props
		} as never
	}).body;
}

const writeGuidance = async () => ({ ok: true as const, value: { cleared: false } });

describe('the review console offers guidance only where it can be written', () => {
	it('renders no guidance control with the transport omitted', () => {
		const html = managerHtml();
		expect(html).not.toContain('data-testid="session-guidance-open"');
		// The positive control on the SAME render: the row and its other controls
		// are there, so the absence above is about guidance rather than about the
		// component failing to render at all.
		expect(html).toContain('Bearing teardown');
		expect(html).toContain('Classes');
	});

	it('...and renders one the moment a transport is handed in', () => {
		const html = managerHtml({ onSetGuidance: writeGuidance });
		expect(html).toContain('data-testid="session-guidance-open"');
	});

	/**
	 * The control SAYS whether a prompt is already written, so an instructor
	 * scanning a term of check-ins can see which carry one without opening eight
	 * panels. The WORD is on the button in both states: the mark is the
	 * shorthand, never the only signal.
	 */
	it('marks a check-in that already carries a prompt, and keeps the word either way', () => {
		const without = managerHtml({ onSetGuidance: writeGuidance });
		const withDoc = managerHtml({
			onSetGuidance: writeGuidance,
			sessions: [
				gridSession({ guidance_doc: [{ type: 'p', runs: [{ text: 'Photograph both pages.' }] }] })
			]
		});
		expect(without).toContain('Guidance');
		expect(withDoc).toContain('Guidance');
		expect(withDoc).not.toEqual(without);
	});
});

// ---------------------------------------------------------------------------
// The written entry: the prompt renders on the work that answered it.
// ---------------------------------------------------------------------------

const PROMPT = [{ type: 'p' as const, runs: [{ text: 'Photograph both pages.' }] }];

function entry(over: Partial<NotebookEntry> = {}): NotebookEntry {
	return {
		id: 'e-1',
		session_id: 'ses-1',
		section_id: 'sec-a',
		folder_id: null,
		pinned_at: null,
		custom_label: 'Teardown notes',
		upload_timestamp: '2026-08-08T13:20:00Z',
		submitted_at: '2026-08-08T13:20:00Z',
		status: 'compliant',
		flag_reason: null,
		instructor_comment: null,
		session: {
			session_label: 'Bearing teardown',
			unit_number: 3,
			session_date: '2026-08-07',
			guidance_doc: null
		},
		photos: [],
		notes: [],
		...over
	} as NotebookEntry;
}

function cardHtml(e: NotebookEntry): string {
	return render(NotebookEntryCard, {
		props: {
			entry: e,
			folders: [],
			variant: 'full',
			collapsed: false,
			onToggle: () => {}
		} as never
	}).body;
}

describe('a filed entry carries what was asked for', () => {
	it('renders no guidance panel when the check-in has no prompt', () => {
		const html = cardHtml(entry());
		expect(html).not.toContain('data-testid="entry-guidance"');
		// Positive control: the check-in line IS there, so the absence is about
		// the prompt and not about the session block failing to render.
		expect(html).toContain('Unit 3');
	});

	it('...and renders one, through ItemBody, when it does', () => {
		const html = cardHtml(
			entry({
				session: {
					session_label: 'Bearing teardown',
					unit_number: 3,
					session_date: '2026-08-07',
					guidance_doc: PROMPT
				}
			})
		);
		expect(html).toContain('data-testid="entry-guidance"');
		expect(html).toContain('Photograph both pages.');
		// The shared Disclosure, not a local one: a real button carrying a word.
		expect(html).toContain('aria-expanded');
		expect(html).toContain('What was asked for');
	});

	/**
	 * HIDDEN, NEVER REMOVED. `collapseWhen` is true on a filed entry -- the work
	 * is emphatically started -- so the panel opens collapsed. It must still be
	 * IN the markup: that is what makes it one press away rather than one load
	 * away, and what would let it print the day the notebook prints.
	 */
	it('keeps the collapsed prompt in the DOM rather than removing it', () => {
		const html = cardHtml(
			entry({
				session: {
					session_label: 'Bearing teardown',
					unit_number: 3,
					session_date: '2026-08-07',
					guidance_doc: PROMPT
				}
			})
		);
		expect(html).toContain('data-open="false"');
		expect(html).toContain('Photograph both pages.');
	});
});

// ---------------------------------------------------------------------------
// Claim 3: the composer's two-phase save.
// ---------------------------------------------------------------------------

const DRAFT = {
	unit_number: 3,
	session_date: '2026-08-07',
	session_label: 'Bearing teardown',
	guidance: asEditorDoc(editorDoc(itemSchema, pmDoc(pmPara(pmText('Photograph both pages.')))))
};

function extrasTransports(over: Partial<StagedExtrasTransports> = {}): StagedExtrasTransports {
	return {
		deck: null,
		setSpec: null,
		setReferenceSpec: null,
		createCheckIn: async () => ({ ok: true, sessionId: 'ses-made' }),
		setGuidance: async () => ({ ok: true }),
		...over
	};
}

const NOTHING = { deck: null, spec: null, specKind: null } as const;

describe('the composer applies a staged prompt in the same action', () => {
	it('creates the check-in and writes its prompt against the id it reports', async () => {
		const calls: { id: string; doc: unknown }[] = [];
		const res = await applyStagedExtras(
			'item-1',
			{ ...NOTHING, checkIn: DRAFT, checkInSessionId: null },
			extrasTransports({
				setGuidance: async (id, doc) => {
					calls.push({ id, doc });
					return { ok: true };
				}
			})
		);
		expect(res.failures).toEqual([]);
		expect(calls).toHaveLength(1);
		expect(calls[0].id).toBe('ses-made');
		expect(res.checkIn).toBeNull();
		expect(res.checkInSessionId).toBeNull();
	});

	it('writes no prompt at all when none was staged', async () => {
		let called = 0;
		const res = await applyStagedExtras(
			'item-1',
			{ ...NOTHING, checkIn: { ...DRAFT, guidance: null }, checkInSessionId: null },
			extrasTransports({
				setGuidance: async () => {
					called += 1;
					return { ok: true };
				}
			})
		);
		expect(called).toBe(0);
		expect(res.failures).toEqual([]);
		expect(res.checkIn).toBeNull();
	});

	/**
	 * THE HALF-LANDED SAVE, and the retry that must not duplicate.
	 *
	 * A duplicate check-in is invisible from the composer: the save reports
	 * success, the class page looks right, and the damage is a second column on
	 * every affected grid asking a class for a page they already filed. So the
	 * failure NAMES the prompt (not the check-in, which landed), keeps the draft
	 * staged, and carries the created id back.
	 */
	it('keeps the prompt staged when only IT fails, and names what did land', async () => {
		const res = await applyStagedExtras(
			'item-1',
			{ ...NOTHING, checkIn: DRAFT, checkInSessionId: null },
			extrasTransports({ setGuidance: async () => ({ ok: false, message: 'refused' }) })
		);
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]).toContain('Bearing teardown');
		expect(res.failures[0]).toContain('it was scheduled');
		expect(res.checkIn).not.toBeNull();
		expect(res.checkInSessionId).toBe('ses-made');
	});

	it('the retry writes the prompt onto the check-in already made, never a second one', async () => {
		let creates = 0;
		const guidanceCalls: string[] = [];
		const res = await applyStagedExtras(
			'item-1',
			{ ...NOTHING, checkIn: DRAFT, checkInSessionId: 'ses-made' },
			extrasTransports({
				createCheckIn: async () => {
					creates += 1;
					return { ok: true, sessionId: 'ses-SECOND' };
				},
				setGuidance: async (id) => {
					guidanceCalls.push(id);
					return { ok: true };
				}
			})
		);
		expect(creates).toBe(0);
		expect(guidanceCalls).toEqual(['ses-made']);
		expect(res.failures).toEqual([]);
		expect(res.checkIn).toBeNull();
		expect(res.checkInSessionId).toBeNull();
	});

	/**
	 * A DEPLOYMENT WITHOUT 0123 still schedules the check-in. The prompt is what
	 * is reported as not landing, in words that say which half worked -- the
	 * difference between "go and retype a paragraph" and "go and schedule the
	 * whole thing again".
	 */
	it('schedules the check-in and reports only the prompt when the column is missing', async () => {
		const res = await applyStagedExtras(
			'item-1',
			{ ...NOTHING, checkIn: DRAFT, checkInSessionId: null },
			extrasTransports({ setGuidance: null })
		);
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]).toContain('it was scheduled');
		expect(res.checkInSessionId).toBe('ses-made');
	});

	/**
	 * A CREATE THAT FAILED IS NOT A HALF-LANDED SAVE. Nothing exists, so nothing
	 * may be remembered as existing -- carrying an id here would make the next
	 * retry write a prompt against a check-in that was never made.
	 */
	it('remembers no check-in when the create itself failed', async () => {
		const res = await applyStagedExtras(
			'item-1',
			{ ...NOTHING, checkIn: DRAFT, checkInSessionId: null },
			extrasTransports({ createCheckIn: async () => ({ ok: false, message: 'refused' }) })
		);
		expect(res.failures).toHaveLength(1);
		expect(res.checkIn).not.toBeNull();
		expect(res.checkInSessionId).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// The ladders. Each new rung is the one beneath it plus the column, asserted as
// the rule rather than as a list.
// ---------------------------------------------------------------------------

describe('the guidance ladders narrow strictly', () => {
	it('adds guidance_doc on its own rung, and never on the one below', () => {
		const ladders = [NOTEBOOK_SESSION_SELECTS, MANAGE_SESSION_SELECTS];
		// The sweep's own case count, so a ladder list that came back empty
		// cannot pass this vacuously.
		expect(ladders).toHaveLength(2);
		for (const ladder of ladders) {
			expect(ladder).toHaveLength(2);
			const [wide, narrow] = ladder;
			expect(wide.capability).toBe('guidance');
			expect(narrow.capability).toBeNull();
			expect(wide.select).toContain('guidance_doc');
			expect(narrow.select).not.toContain('guidance_doc');
			// The wide rung is the narrow one PLUS the column: every field the
			// narrow rung names is still named, so degrading costs exactly the
			// prompt and nothing an unrelated surface depends on.
			const fields = narrow.select
				.split(/[,()]/)
				.map((s) => s.trim())
				.filter(Boolean);
			expect(fields.length).toBeGreaterThan(1);
			for (const field of fields) expect(wide.select).toContain(field);
		}
	});
});
