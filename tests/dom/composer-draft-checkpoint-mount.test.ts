// tests/dom/composer-draft-checkpoint-mount.test.ts
//
// 0061: "I click save draft and instead of just saving one draft it starts
// making infinite copies of that draft", and "Homework progress didn't save".
//
// ONE DEFECT, TWO SYMPTOMS, and this file is where that claim is measured. The
// composer's draft save used to do two things that only make sense at the END
// of a composing session: it dropped the handle to the row it had just created
// (`createdItemId = null`) and it emptied every field. So the writing vanished
// out of the box -- which is what "did not save" looks like from a chair -- and
// the next press had no record to add to, so it created another one.
//
// WHY IT IS A `tests/dom/` FILE. The guarantee is about what the COMPONENT
// decides to issue, which is a count of transport calls on a real mounted
// component with real effects -- and `tests/dom` is the only project where
// `mount()` runs an effect at all. Whether those decisions become rows is the
// database's answer and lives in `tests/db/classroom-draft-checkpoint.test.ts`.
// Nothing here measures a box, a ratio or a tap target: happy-dom has no
// layout engine and every such read there is a vacuous zero.
//
// THE ASSERTIONS ARE THE CONTRACT, NOT THE CURRENT BEHAVIOUR. "Exactly one row
// exists after a save" passes trivially on a working save and says nothing
// about a loop, so what is pinned is N presses (N well over two) against one
// create, and one press plus M tab switches against one create.
//
// MEASURED IN BOTH DIRECTIONS, by hand, against a scratch copy of the
// component with each half of the fix reverted -- the numbers are in this
// bundle's history entry. Restoring the copy went through `cp` and an md5
// check, never `git checkout --`.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import { driveDraftSaves } from './composer-draft-drive';
import {
	EMPTY_COMPOSER_DRAFT,
	composerDraftSignature,
	saveTarget,
	type ComposerDraft
} from '$lib/classroom/composer-staging';

const Composer = ContentComposer as unknown as Component<Record<string, unknown>>;

describe('Save draft is a checkpoint', () => {
	it('five presses issue ONE create and four updates of the row it made', async () => {
		const r = await driveDraftSaves(Composer, { presses: 5 });

		// The positive control, first: a drive that silently pressed nothing
		// would satisfy every "did not duplicate" assertion below.
		expect(r.creates.length + r.updates.length).toBe(5);

		// THE CONTRACT. One row, however many times the button is pressed.
		expect(r.creates).toHaveLength(1);
		expect(r.updates).toHaveLength(4);

		// And every update names the SAME row the create returned -- four
		// updates spread over four ids would count identically here and still
		// be four rows.
		expect(new Set(r.updates.map((u) => u.itemId)).size).toBe(1);
		expect(r.updates.every((u) => u.itemId === 'item-1')).toBe(true);
	});

	it('leaves the writing in the box, which is the other half of the report', async () => {
		const r = await driveDraftSaves(Composer, { presses: 1 });
		// A checkpoint that kept the handle but emptied the form would pass the
		// count assertion above and still lose the work in front of somebody.
		expect(r.titleAfter).toBe('Bridge lab writeup');
		// Every press carries the writing, so an update can never blank the row.
		const second = await driveDraftSaves(Composer, { presses: 3 });
		expect(second.updates.map((u) => u.title)).toEqual([
			'Bridge lab writeup',
			'Bridge lab writeup'
		]);
	});

	it('says a draft was saved, and does not claim a second post was made', async () => {
		// The acknowledgement has to survive the act it reports and has to be
		// TRUE: a second checkpoint that still read "saved as a draft to 1
		// class" would describe a post nobody made.
		const first = await driveDraftSaves(Composer, { presses: 1 });
		expect(first.message).toMatch(/saved as a draft to 1 class/i);
		const second = await driveDraftSaves(Composer, { presses: 2 });
		expect(second.message).toMatch(/updated \(draft\)/i);
	});

	it('a PUBLISH still ends the session, because that is the deliberate finish', async () => {
		const r = await driveDraftSaves(Composer, { presses: 2, publish: true });
		// Two posts is the correct answer to two presses of Post now: the first
		// one is live, so the second is a genuinely new item. The reset is not
		// removed, it is moved behind the button that means "finished".
		expect(r.creates).toHaveLength(2);
		expect(r.updates).toHaveLength(0);
		// And the form is cleared for the next post.
		expect(r.titleAfter).toBe('');
	});
});

describe('a hidden tab never writes', () => {
	it('one press whose response is lost, then six tab switches, is still ONE row', async () => {
		const serverRows: string[] = [];
		const r = await driveDraftSaves(Composer, {
			presses: 1,
			hides: 6,
			behaviour: { kind: 'commits-then-fails' },
			serverRows
		});

		// THE DEFECT THIS PINS. `SaveState`'s durability net fires on
		// `visibilitychange` and `pagehide` whenever the machine is `dirty`, and
		// `dirty` includes `failed` -- so a create the client read as failed was
		// re-issued in full on every tab switch, screen lock and navigation,
		// with nobody having pressed anything. Every attempt that had actually
		// committed became another copy.
		expect(r.creates).toHaveLength(1);
		expect(serverRows).toHaveLength(1);
	});

	it('CONTROL: the drive really does hide the tab, and the composer really is failed', async () => {
		// Without this the assertion above passes just as well against a drive
		// whose events never fired. The failure is REPORTED in words, too --
		// a write that did not land must never be silent.
		const r = await driveDraftSaves(Composer, {
			presses: 1,
			hides: 3,
			behaviour: { kind: 'refuses', message: 'Pick at least one class to post to.' }
		});
		expect(r.creates).toHaveLength(1);
		expect(r.message).toBe('Pick at least one class to post to.');
		// Nothing was created, so nothing was handed to the parent.
		expect(r.saved).toHaveLength(0);
	});
});

describe('the draft signature and the save target, which decide all of the above', () => {
	const draft = (over: Partial<ComposerDraft> = {}): ComposerDraft => ({
		...EMPTY_COMPOSER_DRAFT,
		...over
	});

	it('is stable across renders: the same draft twice is the same string', () => {
		// A signature carrying anything regenerated per render (an object
		// identity, a date, a File) makes `dirty` permanently true, which is a
		// save loop on any surface that autosaves and a warning nobody can
		// clear on one that does not.
		const a = draft({ title: 'Bridge lab', bodyText: 'Measure at 2 N.' });
		const b = draft({ title: 'Bridge lab', bodyText: 'Measure at 2 N.' });
		expect(composerDraftSignature(a)).toBe(composerDraftSignature(b));
	});

	it('ignores what nobody typed, and notices what somebody did', () => {
		const base = draft({ title: 'Bridge lab' });
		// An empty link row added and not filled in is not an edit...
		expect(composerDraftSignature(draft({ title: 'Bridge lab', links: [{ url: '  ' }] }))).toBe(
			composerDraftSignature(base)
		);
		// ...and neither is trailing whitespace on the title.
		expect(composerDraftSignature(draft({ title: 'Bridge lab  ' }))).toBe(
			composerDraftSignature(base)
		);
		// A real word is.
		expect(composerDraftSignature(draft({ title: 'Bridge lab 2' }))).not.toBe(
			composerDraftSignature(base)
		);
	});

	it('routes a create-mode composer holding an id to an UPDATE of that id', () => {
		// This is the whole mechanism the checkpoint depends on, asserted at the
		// function rather than through the component, so a failure says which
		// half moved.
		expect(saveTarget({ mode: 'create', itemId: null, createdItemId: null, targetIds: ['s'] }))
			.toEqual({ action: 'create' });
		expect(
			saveTarget({ mode: 'create', itemId: null, createdItemId: 'item-1', targetIds: ['s'] })
		).toEqual({ action: 'update', itemId: 'item-1' });
	});
});
