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
import { flushSync, mount, unmount } from 'svelte';
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

// ---------------------------------------------------------------------------
// THE STAGED LIST IS ORDERED AND EDITABLE (prompt 0118, the FOUR file half).
//
// Three things about a staged row that did not exist before, each measured
// through the panel's own exported `files()` because that is the array the
// composer reads for its draft signature and the picture picker, and the
// order `runAll` uploads in:
//
//   - RENAME: the entry's `File` is replaced by a new handle under the typed
//     name, same bytes, same type, same lastModified.
//   - REORDER: ArrowDown on a grip and the worded Move buttons both reorder
//     `files()`, through `sortDrag`'s keyboard path and the panel's one
//     `moveEntry`.
//   - `runAll` IS SEQUENTIAL, IN LIST ORDER. The record RPC assigns
//     `sort_order = max + 1`, so arrival order is the stored order; concurrent
//     uploads arrived in whatever order the network finished them. Measured
//     here as an ARGUMENT LIST plus a concurrency high-water mark: a
//     `Promise.all` that happened to resolve in order would pass the list and
//     fail the mark.
//
// These mount with `mount()` directly rather than `mountInto`, because the
// claims are about the component's EXPORTS (`add`, `files`, `runAll`) and the
// shared instrument does not hand the exports back.
// ---------------------------------------------------------------------------

interface PanelExports {
	add(list: File[]): void;
	files(): File[];
	count(): number;
	runAll(target: string): Promise<string[]>;
}

function mountPanel(upload: (args: { file: File }) => Promise<UploadOutcome>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(Panel, {
		target,
		props: { role: 'attachment', itemId: 'item-1', upload }
	}) as unknown as PanelExports;
	flushSync();
	const all = <T extends Element>(s: string) => Array.from(target.querySelectorAll(s)) as T[];
	return {
		app,
		target,
		all,
		flush: () => flushSync(),
		async settle() {
			flushSync();
			await new Promise((r) => setTimeout(r, 30));
			flushSync();
		},
		async stop() {
			await unmount(app as unknown as Record<string, unknown>);
			target.remove();
		}
	};
}

const keyOn = (el: Element, k: string) =>
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

const fileNames = (p: { app: PanelExports }) => p.app.files().map((f) => f.name);

describe('the drop zone is present at rest, and the staged list is ordered and editable', () => {
	it('renders the dashed zone with its sentence before anything is staged', async () => {
		const { upload } = recordingUpload(new Set());
		const p = mountPanel(upload);
		try {
			expect(p.all('[data-testid="fup-zone"]')).toHaveLength(1);
			const hint = p.all('.fup-drop-hint');
			expect(hint).toHaveLength(1);
			expect(hint[0].textContent ?? '').toMatch(/drag files here.*paste an image/i);
			// And no row control over no rows.
			expect(p.all('[data-testid="fup-grip"]')).toHaveLength(0);
			expect(p.all('[data-testid="fup-rename-start"]')).toHaveLength(0);
		} finally {
			await p.stop();
		}
	});

	it('a rename replaces the handle under the new name: files()[i].name changes, bytes and type do not', async () => {
		const { upload } = recordingUpload(new Set());
		const p = mountPanel(upload);
		try {
			const original = new File(['hello'], 'a.txt', { type: 'text/plain', lastModified: 1700000000000 });
			p.app.add([original, txt('b.txt')]);
			p.flush();
			expect(fileNames(p)).toEqual(['a.txt', 'b.txt']);

			p.all<HTMLButtonElement>('[data-testid="fup-rename-start"]')[0].click();
			p.flush();
			const input = p.all<HTMLInputElement>('[data-testid="fup-rename-input"]')[0];
			expect(input, 'no rename input opened').toBeDefined();
			expect(input.value).toBe('a.txt');
			// The row being renamed shows the editor instead of its name line.
			expect(p.all('.fup-name')).toHaveLength(1);

			input.value = 'renamed.txt';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			keyOn(input, 'Enter');
			p.flush();

			expect(fileNames(p)).toEqual(['renamed.txt', 'b.txt']);
			const renamed = p.app.files()[0];
			expect(renamed).not.toBe(original);
			expect(renamed.size).toBe(original.size);
			expect(renamed.type).toBe('text/plain');
			expect(renamed.lastModified).toBe(1700000000000);
			expect(p.all('[data-testid="fup-rename-input"]')).toHaveLength(0);
			expect(p.all('.fup-name')).toHaveLength(2);
		} finally {
			await p.stop();
		}
	});

	it('Escape cancels a rename and an empty name cancels it too; the Save / Cancel buttons are the same paths', async () => {
		const { upload } = recordingUpload(new Set());
		const p = mountPanel(upload);
		try {
			p.app.add([txt('a.txt'), txt('b.txt')]);
			p.flush();

			p.all<HTMLButtonElement>('[data-testid="fup-rename-start"]')[0].click();
			p.flush();
			let input = p.all<HTMLInputElement>('[data-testid="fup-rename-input"]')[0];
			input.value = 'nope.txt';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			keyOn(input, 'Escape');
			p.flush();
			expect(fileNames(p)).toEqual(['a.txt', 'b.txt']);
			expect(p.all('[data-testid="fup-rename-input"]')).toHaveLength(0);

			p.all<HTMLButtonElement>('[data-testid="fup-rename-start"]')[0].click();
			p.flush();
			input = p.all<HTMLInputElement>('[data-testid="fup-rename-input"]')[0];
			input.value = '   ';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			p.all<HTMLButtonElement>('button').find((b) => /save name/i.test(b.textContent ?? ''))!.click();
			p.flush();
			expect(fileNames(p)).toEqual(['a.txt', 'b.txt']);

			p.all<HTMLButtonElement>('[data-testid="fup-rename-start"]')[1].click();
			p.flush();
			input = p.all<HTMLInputElement>('[data-testid="fup-rename-input"]')[0];
			input.value = 'second.txt';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			p.all<HTMLButtonElement>('button').find((b) => /save name/i.test(b.textContent ?? ''))!.click();
			p.flush();
			expect(fileNames(p)).toEqual(['a.txt', 'second.txt']);
		} finally {
			await p.stop();
		}
	});

	it('ArrowDown on a grip reorders files(); ArrowUp at the top and ArrowDown at the bottom do nothing', async () => {
		const { upload } = recordingUpload(new Set());
		const p = mountPanel(upload);
		try {
			p.app.add([txt('a.txt'), txt('b.txt'), txt('c.txt')]);
			p.flush();
			expect(p.all('[data-testid="fup-grip"]')).toHaveLength(3);

			keyOn(p.all('[data-testid="fup-grip"]')[0], 'ArrowDown');
			p.flush();
			expect(fileNames(p)).toEqual(['b.txt', 'a.txt', 'c.txt']);

			keyOn(p.all('[data-testid="fup-grip"]')[0], 'ArrowUp');
			keyOn(p.all('[data-testid="fup-grip"]')[2], 'ArrowDown');
			p.flush();
			expect(fileNames(p)).toEqual(['b.txt', 'a.txt', 'c.txt']);

			// The worded buttons are the same move.
			p.all<HTMLButtonElement>('[data-testid="fup-move-up"]')[2].click();
			p.flush();
			expect(fileNames(p)).toEqual(['b.txt', 'c.txt', 'a.txt']);
			p.all<HTMLButtonElement>('[data-testid="fup-move-down"]')[0].click();
			p.flush();
			expect(fileNames(p)).toEqual(['c.txt', 'b.txt', 'a.txt']);
			// The rows on screen follow.
			expect(p.all('.fup-name').map((n) => (n.textContent ?? '').trim())).toEqual([
				'c.txt',
				'b.txt',
				'a.txt'
			]);
		} finally {
			await p.stop();
		}
	});

	it('a single staged row has no grip and no Move: there is nothing to move past', async () => {
		const { upload } = recordingUpload(new Set());
		const p = mountPanel(upload);
		try {
			p.app.add([txt('only.txt')]);
			p.flush();
			expect(p.all('.fup-row')).toHaveLength(1);
			expect(p.all('[data-testid="fup-grip"]')).toHaveLength(0);
			expect(p.all('[data-testid="fup-move-up"]')).toHaveLength(0);
			// Rename is still offered: one row can still be misnamed.
			expect(p.all('[data-testid="fup-rename-start"]')).toHaveLength(1);
		} finally {
			await p.stop();
		}
	});

	it('runAll uploads ONE AT A TIME, in list order, after a reorder, and still attempts every file', async () => {
		// The transport holds each upload open until released, and counts how
		// many are open at once. `Promise.all` would open all three before any
		// resolved (high-water mark 3); sequential never exceeds 1.
		const started: string[] = [];
		let open = 0;
		let highWater = 0;
		const release: (() => void)[] = [];
		const upload = async ({ file }: { file: File }): Promise<UploadOutcome> => {
			started.push(file.name);
			open += 1;
			highWater = Math.max(highWater, open);
			await new Promise<void>((r) => release.push(r));
			open -= 1;
			if (file.name === 'b.txt') {
				return {
					ok: false,
					gate: 'too_large',
					message: `${file.name} is 210 MB. The limit is 200 MB.`,
					retryable: true
				};
			}
			return { ok: true, storageKey: `item-1/${file.name}` };
		};
		const p = mountPanel(upload);
		try {
			p.app.add([txt('a.txt'), txt('b.txt'), txt('c.txt')]);
			p.flush();
			// Move c to the top, so list order and staging order differ.
			p.all<HTMLButtonElement>('[data-testid="fup-move-up"]')[2].click();
			p.all<HTMLButtonElement>('[data-testid="fup-move-up"]')[1].click();
			p.flush();
			expect(fileNames(p)).toEqual(['c.txt', 'a.txt', 'b.txt']);

			const done = p.app.runAll('item-1');
			await p.settle();
			// Only the FIRST is open; the second has not been asked for yet.
			expect(started).toEqual(['c.txt']);
			expect(open).toBe(1);

			release.shift()!();
			await p.settle();
			expect(started).toEqual(['c.txt', 'a.txt']);
			release.shift()!();
			await p.settle();
			expect(started).toEqual(['c.txt', 'a.txt', 'b.txt']);
			release.shift()!();
			const failures = await done;
			await p.settle();

			expect(highWater).toBe(1);
			// EVERY FILE WAS STILL ATTEMPTED, in the order shown, and only the
			// failure stayed with its own message.
			expect(started).toEqual(['c.txt', 'a.txt', 'b.txt']);
			expect(failures).toEqual(['b.txt: b.txt is 210 MB. The limit is 200 MB.']);
			expect(fileNames(p)).toEqual(['b.txt']);
		} finally {
			await p.stop();
		}
	});

	it('a file added WHILE the batch is in flight survives it, staged (the batch is a snapshot, the list is not)', async () => {
		// THE DEFECT THIS PINS: the first runAll rebuilt `entries` from its
		// pre-batch results, so a screenshot pasted into the composer during a
		// save was silently discarded -- never uploaded, not staged, count 0.
		const release: (() => void)[] = [];
		const started: string[] = [];
		const counts: number[] = [];
		const upload = async ({ file }: { file: File }): Promise<UploadOutcome> => {
			started.push(file.name);
			await new Promise<void>((r) => release.push(r));
			return { ok: true, storageKey: `item-1/${file.name}` };
		};
		const target = document.createElement('div');
		document.body.appendChild(target);
		const app = mount(Panel, {
			target,
			props: {
				role: 'attachment',
				itemId: 'item-1',
				upload,
				oncountchange: (n: number) => counts.push(n)
			}
		}) as unknown as PanelExports;
		const settle = async () => {
			flushSync();
			await new Promise((r) => setTimeout(r, 30));
			flushSync();
		};
		try {
			app.add([txt('a.txt')]);
			flushSync();
			const done = app.runAll('item-1');
			await settle();
			expect(started).toEqual(['a.txt']);
			// Mid-batch: a second file arrives the way a pasted screenshot does.
			app.add([txt('pasted.png')]);
			await settle();
			expect(app.files().map((f) => f.name)).toEqual(['a.txt', 'pasted.png']);
			release.shift()!();
			const failures = await done;
			await settle();
			// a.txt landed and left the list AS IT LANDED; pasted.png was never
			// part of the batch and is STILL HERE, staged, for the next save.
			expect(failures).toEqual([]);
			expect(started).toEqual(['a.txt']);
			expect(app.files().map((f) => f.name)).toEqual(['pasted.png']);
			expect(counts.at(-1)).toBe(1);
			// POSITIVE CONTROL: a second save now uploads exactly the survivor.
			const again = app.runAll('item-1');
			await settle();
			release.shift()!();
			await again;
			await settle();
			expect(started).toEqual(['a.txt', 'pasted.png']);
			expect(app.files()).toEqual([]);
		} finally {
			await unmount(app as unknown as Record<string, unknown>);
			target.remove();
		}
	});

	it('a rename left open when the batch starts is COMMITTED, and a colliding one is refused BY NAME in the report', async () => {
		const started: string[] = [];
		const upload = async ({ file }: { file: File }): Promise<UploadOutcome> => {
			started.push(file.name);
			return { ok: true, storageKey: `item-1/${file.name}` };
		};
		const p = mountPanel(upload);
		try {
			p.app.add([txt('draft.txt'), txt('other.txt')]);
			p.flush();
			// Open a rename on the first row and type a new name, but do not
			// press Enter: this is the box a person leaves open when they reach
			// for Save.
			p.all<HTMLButtonElement>('[data-testid="fup-rename-start"]')[0].click();
			p.flush();
			const input = p.all<HTMLInputElement>('[data-testid="fup-rename-input"]')[0];
			input.value = 'final.txt';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			p.flush();
			let failures = await p.app.runAll('item-1');
			await p.settle();
			// The typed name is what uploaded, and nothing is reported.
			expect(started).toEqual(['final.txt', 'other.txt']);
			expect(failures).toEqual([]);
			expect(p.all('[data-testid="fup-rename-input"]')).toHaveLength(0);

			// THE ONE REFUSAL: the open rename collides with a sibling. The file
			// keeps its old name, uploads under it, and the report SAYS so.
			started.length = 0;
			p.app.add([txt('one.txt'), txt('two.txt')]);
			p.flush();
			p.all<HTMLButtonElement>('[data-testid="fup-rename-start"]')[0].click();
			p.flush();
			const again = p.all<HTMLInputElement>('[data-testid="fup-rename-input"]')[0];
			again.value = 'two.txt';
			again.dispatchEvent(new Event('input', { bubbles: true }));
			p.flush();
			failures = await p.app.runAll('item-1');
			await p.settle();
			expect(started).toEqual(['one.txt', 'two.txt']);
			expect(failures).toEqual([
				'one.txt: the new name "two.txt" was not applied, another file here already has it'
			]);
			expect(p.all('[data-testid="fup-rename-input"]')).toHaveLength(0);
		} finally {
			await p.stop();
		}
	});
});
