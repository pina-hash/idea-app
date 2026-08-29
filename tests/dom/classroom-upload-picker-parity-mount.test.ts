// tests/dom/classroom-upload-picker-parity-mount.test.ts
//
// THE DRAG, THE DROP, THE PASTE AND THE RETRY, DRIVEN.
//
// `tests/classroom-upload-picker-parity.test.ts` is the other half and stays
// exactly as it is: it asserts that the served markup still carries the plain
// picker, unfiltered and un-disabled, on all three surfaces, and that the drop
// overlay is not in the initial render. Those are claims about what a browser
// RECEIVES. In its own words about why it stopped there:
//
//     "the real shipped components, server-rendered (`svelte/server`, the
//      classroom-manager-spec-visibility.test.ts pattern -- this repo has no
//      DOM/event-dispatch harness, so an SSR structural assertion is the
//      strongest claim available without one)"
//
// `src/lib/file-drop.ts` says the same thing in its own header, which is why
// its stateful half was split into plain functions a node test could drive.
// That split is still right and `createDropController` still has its own
// coverage; what neither reaches is the ACTION -- the listeners it registers
// on a real node, the class it flips, and what the panel does with the files
// it is handed.
//
// THREE THINGS THIS ADDS, and the third is the one that was unasserted end to
// end:
//
//   1. A REAL DRAG SEQUENCE. `dragenter` -> the overlay and the outline class
//      appear; `dragleave` -> they go. Today only the ABSENCE before a drag is
//      asserted anywhere, which a component that never showed the overlay at
//      all would satisfy perfectly.
//   2. A REAL DROP AND A REAL PASTE reaching `stage` -- the SAME function the
//      picker's `onchange` calls, which is the whole "a second way in, never a
//      second upload path" claim -- and a plain-TEXT paste passing straight
//      through untouched.
//   3. RETRY AFTER A PARTIAL FAILURE RETRYING EXACTLY THE REMAINDER. This is
//      the component's headline rule -- "EVERY FILE IS ATTEMPTED", "A FAILED
//      FILE STAYS STAGED" -- written to replace an engine-side loop that
//      `return`ed on the first failure and silently abandoned the rest with
//      nothing left staged to retry. Nothing in the suite proved it, in either
//      direction. It is measured here as the ARGUMENT LISTS the transport was
//      called with, so "retried the remainder" and "retried everything again"
//      are different results rather than the same green tick.
//
// MUTATION-CHECKED, both directions; see this bundle's history entry.
//
// NO GEOMETRY IS ASSERTED HERE. The overlay is checked for PRESENCE and for
// its `aria-hidden`, never for where it sits or how big it is -- happy-dom has
// no layout engine, so "it occupies no layout space" is a `verify:browser`
// claim and is not made here. See `tests/dom/mount.ts`.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import FileUploadPanel from '$lib/classroom/FileUploadPanel.svelte';
import { mountInto } from './mount';
import {
	dragEvent,
	dropEvent,
	imagePasteEvent,
	textDragEvent,
	textPasteEvent
} from './drag-events';
import type { UploadOutcome } from '$lib/classroom/file-upload';

const Panel = FileUploadPanel as unknown as Component<Record<string, unknown>>;

const txt = (name: string) => new File([name], name, { type: 'text/plain' });

/**
 * A transport that records every filename it is asked for and refuses the ones
 * named in `refuse`, with the SERVER'S OWN wording shape (a message naming its
 * gate, never "Upload failed").
 *
 * `refuse` is a live Set, so a test can stop refusing between the first attempt
 * and the retry -- which is what a person pressing Retry after fixing
 * something is doing.
 */
function recordingUpload(refuse: Set<string>) {
	const attempts: string[] = [];
	const upload = async ({ file }: { file: File }): Promise<UploadOutcome> => {
		attempts.push(file.name);
		if (refuse.has(file.name)) {
			// `too_large` is a REAL member of `UploadGate`, and the message has the
			// shape the shared vocabulary produces: the size AND the limit, never
			// a bare "Upload failed". A fixture its real producer could not emit
			// is a green test over a case that cannot happen.
			return {
				ok: false,
				gate: 'too_large',
				message: `${file.name} is 210 MB. The limit is 200 MB.`,
				retryable: true
			};
		}
		return { ok: true, storageKey: `item-1/${file.name}` };
	};
	return { attempts, upload };
}

function openPanel(upload: (args: { file: File }) => Promise<UploadOutcome>) {
	return mountInto(Panel, {
		role: 'submission',
		itemId: 'item-1',
		upload,
		autoStart: true
	});
}

const names = (m: { all<T extends Element>(s: string): T[] }) =>
	m.all('.fup-name').map((n) => (n.textContent ?? '').trim());

describe('the drop overlay exists only while a drag is over the surface', () => {
	it('appears on dragenter and goes on dragleave', async () => {
		const { upload } = recordingUpload(new Set());
		const m = openPanel(upload);
		try {
			const root = m.one<HTMLElement>('.fup');

			// Before: the state the SSR file already pins, re-read live.
			expect(m.all('.fup-drop-overlay')).toHaveLength(0);
			expect(root.classList.contains('is-drop-active')).toBe(false);

			const enter = dragEvent('dragenter');
			root.dispatchEvent(enter);
			m.flush();

			// DURING. This half had no assertion anywhere before this file.
			const overlay = m.all('.fup-drop-overlay');
			expect(overlay).toHaveLength(1);
			expect(overlay[0].getAttribute('aria-hidden')).toBe('true');
			expect(root.classList.contains('is-drop-active')).toBe(true);
			// `preventDefault` on the drag is what tells the browser this target
			// accepts a drop at all; without it no `drop` event ever fires.
			expect(enter.defaultPrevented).toBe(true);

			root.dispatchEvent(dragEvent('dragleave'));
			m.flush();
			expect(m.all('.fup-drop-overlay')).toHaveLength(0);
			expect(root.classList.contains('is-drop-active')).toBe(false);
		} finally {
			await m.stop();
		}
	});

	it('stays dark for a drag carrying no files', async () => {
		// A text or link drag must not light the whole surface up. This is the
		// `isFileDrag` rule, reaching the class rather than the controller.
		const { upload } = recordingUpload(new Set());
		const m = openPanel(upload);
		try {
			const root = m.one<HTMLElement>('.fup');
			const enter = textDragEvent('dragenter');
			root.dispatchEvent(enter);
			m.flush();
			expect(m.all('.fup-drop-overlay')).toHaveLength(0);
			expect(root.classList.contains('is-drop-active')).toBe(false);
			expect(enter.defaultPrevented).toBe(false);
		} finally {
			await m.stop();
		}
	});
});

describe('a drop and a paste reach the same staging the picker reaches', () => {
	it('a drop stages and uploads every file it carried', async () => {
		const { attempts, upload } = recordingUpload(new Set());
		const m = openPanel(upload);
		try {
			m.one<HTMLElement>('.fup').dispatchEvent(dropEvent([txt('a.txt'), txt('b.txt')]));
			await m.settle();

			expect(attempts).toEqual(['a.txt', 'b.txt']);
			// Everything landed, so nothing is left staged.
			expect(m.all('.fup-row')).toHaveLength(0);
		} finally {
			await m.stop();
		}
	});

	it('a pasted image is staged; a pasted line of text is left completely alone', async () => {
		const { attempts, upload } = recordingUpload(new Set());
		const m = openPanel(upload);
		try {
			const root = m.one<HTMLElement>('.fup');

			const image = imagePasteEvent();
			root.dispatchEvent(image);
			await m.settle();
			expect(attempts).toHaveLength(1);
			expect(attempts[0]).toMatch(/\.png$/);
			expect(image.defaultPrevented).toBe(true);

			// A plain-text paste is not intercepted: no `preventDefault`, no
			// staging. Typing into a nearby field has to keep working.
			const text = textPasteEvent();
			root.dispatchEvent(text);
			await m.settle();
			expect(attempts).toHaveLength(1);
			expect(text.defaultPrevented).toBe(false);
		} finally {
			await m.stop();
		}
	});

	it('a drop carrying nothing stages nothing rather than clearing the list', async () => {
		const refuse = new Set(['b.txt']);
		const { attempts, upload } = recordingUpload(refuse);
		const m = openPanel(upload);
		try {
			m.one<HTMLElement>('.fup').dispatchEvent(dropEvent([txt('a.txt'), txt('b.txt')]));
			await m.settle();
			expect(names(m)).toEqual(['b.txt']);

			attempts.length = 0;
			m.one<HTMLElement>('.fup').dispatchEvent(dropEvent([]));
			await m.settle();
			expect(attempts).toEqual([]);
			// The failure is still staged with its handle. An empty drop that
			// cleared the list would lose a file somebody has to go and find.
			expect(names(m)).toEqual(['b.txt']);
		} finally {
			await m.stop();
		}
	});
});

describe('a failed file stays staged, and Retry retries EXACTLY the remainder', () => {
	it('attempts every file, keeps only the failure, and names its gate verbatim', async () => {
		const refuse = new Set(['b.txt']);
		const { attempts, upload } = recordingUpload(refuse);
		const m = openPanel(upload);
		try {
			m.one<HTMLElement>('.fup').dispatchEvent(
				dropEvent([txt('a.txt'), txt('b.txt'), txt('c.txt')])
			);
			await m.settle();

			// EVERY FILE IS ATTEMPTED: the middle one failing did not cancel the
			// third. This is the exact defect the component was written to end.
			expect(attempts).toEqual(['a.txt', 'b.txt', 'c.txt']);

			// Only what LANDED is cleared.
			expect(names(m)).toEqual(['b.txt']);

			// The message is the transport's own, rendered verbatim -- it names
			// the size and the limit, and nothing here shortened or re-toned it.
			const errors = m.all('.fup-error').map((n) => (n.textContent ?? '').trim());
			expect(errors).toEqual(['b.txt is 210 MB. The limit is 200 MB.']);
		} finally {
			await m.stop();
		}
	});

	it('pressing Retry sends the one that failed, and only that one', async () => {
		const refuse = new Set(['b.txt']);
		const { attempts, upload } = recordingUpload(refuse);
		const m = openPanel(upload);
		try {
			m.one<HTMLElement>('.fup').dispatchEvent(
				dropEvent([txt('a.txt'), txt('b.txt'), txt('c.txt')])
			);
			await m.settle();
			expect(names(m)).toEqual(['b.txt']);

			// Whatever was wrong is fixed. Press Retry.
			refuse.clear();
			attempts.length = 0;
			const retry = m
				.all<HTMLButtonElement>('button')
				.find((b) => /retry/i.test(b.textContent ?? ''));
			expect(retry, 'no Retry offered on a retryable failure').toBeDefined();
			retry!.click();
			await m.settle();

			// THE WHOLE CLAIM, AS AN ARGUMENT LIST. `['b.txt']` and not
			// `['a.txt','b.txt','c.txt']`: a retry that re-sent the landed files
			// would duplicate them, and a count-only assertion could not tell the
			// two apart.
			expect(attempts).toEqual(['b.txt']);
			expect(names(m)).toEqual([]);
		} finally {
			await m.stop();
		}
	});

	it('a second round refuses again and the file is STILL staged, with a Retry still offered', async () => {
		// The failure that does not clear itself. A component that dropped the
		// entry on a failed retry would pass the test above and lose the file
		// here.
		const refuse = new Set(['b.txt']);
		const { attempts, upload } = recordingUpload(refuse);
		const m = openPanel(upload);
		try {
			m.one<HTMLElement>('.fup').dispatchEvent(dropEvent([txt('a.txt'), txt('b.txt')]));
			await m.settle();
			expect(names(m)).toEqual(['b.txt']);

			attempts.length = 0;
			m.all<HTMLButtonElement>('button')
				.find((b) => /retry/i.test(b.textContent ?? ''))!
				.click();
			await m.settle();

			expect(attempts).toEqual(['b.txt']);
			expect(names(m)).toEqual(['b.txt']);
			expect(
				m.all<HTMLButtonElement>('button').some((b) => /retry/i.test(b.textContent ?? ''))
			).toBe(true);
		} finally {
			await m.stop();
		}
	});

	it('Remove takes the failure off the list without asking the transport anything', async () => {
		const refuse = new Set(['b.txt']);
		const { attempts, upload } = recordingUpload(refuse);
		const m = openPanel(upload);
		try {
			m.one<HTMLElement>('.fup').dispatchEvent(dropEvent([txt('a.txt'), txt('b.txt')]));
			await m.settle();
			attempts.length = 0;

			m.all<HTMLButtonElement>('button')
				.find((b) => /remove/i.test(b.textContent ?? ''))!
				.click();
			await m.settle();

			expect(names(m)).toEqual([]);
			expect(attempts).toEqual([]);
		} finally {
			await m.stop();
		}
	});
});
