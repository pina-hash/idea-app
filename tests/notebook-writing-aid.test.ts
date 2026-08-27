// tests/notebook-writing-aid.test.ts
//
// THE ONE PREFERENCE behind autocorrect and the tolerance callout.
//
// WHY IT EARNS A TEST. Two silent failures. A preference that reads the wrong
// VIEWER's slot on a shared shop workstation hands one student another's
// setting, which nothing on screen reports -- it is the same defect the draft
// mirror's per-viewer key exists to prevent, one feature over. And "off means
// both, permanently" is a claim about ABSENCE: a switch that dimmed the band
// while corrections kept firing would look, to whoever built it, exactly like
// a switch that worked.
//
// The store is a Svelte 5 rune module, so it is imported through
// `.svelte.ts` and exercised against a real localStorage stand-in rather than
// a mock of its own interface -- a stub of the thing under test proves nothing
// about the thing under test.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DeclinedWords, planCorrection } from '../src/lib/notebook/autocorrect';
import { toleranceFor, type TextBlock } from '../src/lib/notebook/tolerance';

/** A real, minimal Storage: get/set/remove over a Map, and a throwing mode. */
class MemoryStorage {
	#map = new Map<string, string>();
	throwing = false;
	getItem(key: string): string | null {
		if (this.throwing) throw new DOMException('blocked');
		return this.#map.get(key) ?? null;
	}
	setItem(key: string, value: string): void {
		if (this.throwing) throw new DOMException('quota');
		this.#map.set(key, value);
	}
	removeItem(key: string): void {
		if (this.throwing) throw new DOMException('blocked');
		this.#map.delete(key);
	}
	raw(key: string): string | null {
		return this.#map.get(key) ?? null;
	}
	seed(key: string, value: string): void {
		this.#map.set(key, value);
	}
}

let store: MemoryStorage;

beforeEach(async () => {
	store = new MemoryStorage();
	vi.stubGlobal('localStorage', store);
	vi.resetModules();
});

/** Fresh module per case: the store keeps in-memory state across reads. */
async function load() {
	return import('../src/lib/notebook/writing-aid.svelte');
}

describe('the key is per viewer, the draft mirror rule', () => {
	it('carries the viewer id, and signed out takes the anon slot', async () => {
		const aid = await load();
		expect(aid.writingAidKey('student-a')).toBe('notebook_writing_aid:student-a');
		expect(aid.writingAidKey(undefined)).toBe('notebook_writing_aid:anon');
		expect(aid.writingAidKey('')).toBe('notebook_writing_aid:anon');
		// Namespaced beside the mirror's own prefix rather than colliding with it.
		expect(aid.WRITING_AID_PREFIX).toBe('notebook_writing_aid:');
	});

	// THE SHARED WORKSTATION. Two students, one browser, one switch each.
	it('one student turning it off does not turn it off for the next', async () => {
		const aid = await load();
		aid.setWritingAidEnabled('student-a', false);
		expect(aid.writingAidEnabled('student-a')).toBe(false);
		// The next person to sit down gets the default, not the last one's answer.
		expect(aid.writingAidEnabled('student-b')).toBe(true);
		// And going back reads A's own value again, not B's.
		expect(aid.writingAidEnabled('student-a')).toBe(false);
		expect(store.raw('notebook_writing_aid:student-a')).toBe('off');
		expect(store.raw('notebook_writing_aid:student-b')).toBeNull();
	});
});

describe('the default, and everything that fails soft to it', () => {
	it('is ON for a viewer who has never touched it', async () => {
		const aid = await load();
		expect(aid.WRITING_AID_DEFAULT).toBe(true);
		expect(aid.writingAidEnabled('fresh')).toBe(true);
	});

	it('an unrecognised stored value takes the default and is dropped', async () => {
		store.seed('notebook_writing_aid:x', 'maybe');
		const aid = await load();
		expect(aid.writingAidEnabled('x')).toBe(true);
		expect(store.raw('notebook_writing_aid:x')).toBeNull();
	});

	it('a blocked store costs the persistence and never the choice', async () => {
		const aid = await load();
		store.throwing = true;
		expect(aid.writingAidEnabled('y')).toBe(true);
		expect(() => aid.setWritingAidEnabled('y', false)).not.toThrow();
		expect(aid.writingAidEnabled('y')).toBe(false);
	});

	it('round trips both ways', async () => {
		const aid = await load();
		aid.setWritingAidEnabled('z', false);
		expect(store.raw('notebook_writing_aid:z')).toBe('off');
		aid.setWritingAidEnabled('z', true);
		expect(store.raw('notebook_writing_aid:z')).toBe('on');
		expect(aid.writingAidEnabled('z')).toBe(true);
	});
});

describe('off means BOTH, and it is the same switch', () => {
	// The callout takes `enabled` straight from the same accessor the plugin's
	// `enabled()` closure reads, so the two cannot disagree about whether the
	// feature is running. These assert the two halves of what `false` buys.

	const note: TextBlock[] = [
		{
			text: 'I definately had to seperate teh two halves and then I I filed the the edge down flat.',
			kind: 'p'
		},
		{ text: 'It took most of the period to get the bracket to sit flat on the table.', kind: 'p' }
	];

	it('the note used here really does land in a band when the aid is on', () => {
		// THE POSITIVE CONTROL. Without it, "renders nothing when off" would pass
		// against a note that renders nothing at all.
		const reading = toleranceFor(note);
		expect(reading).not.toBeNull();
		expect(reading!.issues.total).toBeGreaterThan(0);
		expect(reading!.band.label).not.toBe('IN SPEC');
	});

	it('and really does correct when the aid is on', () => {
		const declined = new DeclinedWords();
		expect(planCorrection('I had to seperate ', 18, declined)?.replacement).toBe('separate');
	});

	// The callout's own gate: `enabled` false short-circuits before the
	// arithmetic runs, so there is no reading and therefore no element.
	it('off renders nothing: the component computes no reading at all', async () => {
		const source = await import('node:fs').then((fs) =>
			fs.readFileSync('src/lib/notebook/ToleranceCallout.svelte', 'utf8')
		);
		// One expression decides it, and `null` is what the markup's `{#if}`
		// tests -- so "off" and "too short" produce the identical no-element.
		expect(source).toContain('enabled ? toleranceForNote(doc) : null');
		expect(source).toContain('{#if reading}');
	});

	// The plugin's own gate: `enabled()` is the first line of
	// `appendTransaction`, ahead of every other refusal, so nothing is planned
	// and nothing is dispatched.
	it('off corrects nothing: the plugin returns before planning anything', async () => {
		const source = await import('node:fs').then((fs) =>
			fs.readFileSync('src/lib/notebook/autocorrect-plugin.ts', 'utf8')
		);
		const body = source.slice(source.indexOf('appendTransaction(trs'));
		expect(body.indexOf('if (!enabled()) return null;')).toBeGreaterThan(-1);
		// It is FIRST: no plan is computed, no ledger is armed, no decoration is
		// added before the switch has been consulted.
		expect(body.indexOf('if (!enabled()) return null;')).toBeLessThan(body.indexOf('planCorrection'));
		expect(body.indexOf('if (!enabled()) return null;')).toBeLessThan(body.indexOf('ledger.arm'));
	});

	// NO REMINDER TO TURN IT BACK ON. Off is an answer, not a state to be
	// nagged out of.
	//
	// ASSERTED OVER THE COPY AND THE MODULE'S SURFACE, never over the source's
	// comments -- a sweep for the word "reminder" matches this file's own
	// sentence saying there must not be one, which is a test that reads
	// documentation and reports it as a defect. (It did, twice, before this was
	// written the right way round.)
	it('the off state is a statement, not an invitation', async () => {
		const aid = await load();
		const visible = [aid.WRITING_AID_LABEL, aid.WRITING_AID_ON_NOTE, aid.WRITING_AID_OFF_NOTE]
			.join(' ')
			.toLowerCase();
		// The positive control: the copy really was collected.
		expect(visible).toContain('spelling help');
		expect(visible).toContain('off.');
		// It says what the state IS. It does not ask for it back.
		for (const phrase of ['turn it back on', 'enable it', 'switch it on', 'we recommend']) {
			expect(visible, `the copy says "${phrase}"`).not.toContain(phrase);
		}
	});

	// And there is no machinery that COULD re-prompt: no timer, no counter, no
	// dismissal state. The module holds one boolean per viewer and nothing else.
	it('the store has no timer, counter or dismissal state to nag from', async () => {
		const source = await import('node:fs').then((fs) =>
			fs.readFileSync('src/lib/notebook/writing-aid.svelte.ts', 'utf8')
		);
		// COMMENTS STRIPPED FIRST. `count` as a bare substring matches the word
		// "account" in this module's own explanation of why the preference is
		// not per account, which is prose and not machinery.
		const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
		// The positive control: stripping left the real code behind.
		expect(code).toContain('localStorage.setItem');
		for (const machinery of ['setTimeout', 'setInterval', 'Date.now', 'count', 'dismiss']) {
			expect(code, `the store uses ${machinery}`).not.toContain(machinery);
		}
	});
});
