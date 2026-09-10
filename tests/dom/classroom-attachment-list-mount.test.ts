// tests/dom/classroom-attachment-list-mount.test.ts
//
// THE ATTACHMENT LIST'S THREE OPTIONAL CONTROLS (0193), DRIVEN BY REAL EVENTS:
// reorder (a grip driven by `sortDrag`'s arrow keys, and the worded Move up /
// Move down pair), rename (an inline input with Save / Cancel, Enter and
// Escape), and the sentence that blocks a rename.
//
// WHY A MOUNT. Every claim here is about what happens AFTER an event reaches
// a handler: which id array `onreorder` is handed, which arguments `onrename`
// is called with, whether a refusal's message lands in the row. An SSR render
// runs no handler. `tests/classroom-attachment-layout.test.ts` keeps the pure
// arithmetic (`reorderIds`, the refusal predicates); what is pinned HERE is
// the wiring: that ArrowDown on the first grip reaches the parent as
// `['a-2','a-1','a-3']` and that the list itself moves nothing.
//
// ABSENCE IS THE MECHANISM, AND IT IS COUNTED BOTH WAYS. Every "with the prop"
// count is paired with the same fixture mounted WITHOUT it reading zero of
// that control and three of the rows, so an absence can never be a list that
// failed to render.
//
// NO GEOMETRY IS ASSERTED HERE -- happy-dom has no layout engine (see
// `tests/dom/mount.ts`). The 44px floors are `verify:browser`'s
// (`classroom-upload.mjs`).

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import AttachmentList from '$lib/classroom/AttachmentList.svelte';
import type { ClassroomAttachment, TxResult } from '$lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';

const List = AttachmentList as unknown as Component<Record<string, unknown>>;

const rows = (): ClassroomAttachment[] => [
	{ id: 'a-1', filename: 'notes.pdf', mime_type: 'application/octet-stream', size_bytes: 100 },
	{ id: 'a-2', filename: 'figure.png', mime_type: 'application/octet-stream', size_bytes: 200 },
	{ id: 'a-3', filename: 'bracket.sldprt', mime_type: 'application/octet-stream', size_bytes: 300 }
];

/** A data: URI for the one image row, so no `<img>` here names a proxy URL. */
const PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const resolveSrc = (a: ClassroomAttachment) => (a.id === 'a-2' ? PNG : `#${a.id}`);

function key(el: Element, k: string) {
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}

/** The filename on each row -- the link's own text, without the kind chip
 *  (`PDF`, `CAD`) the link also carries for a non-image. */
function names(m: Mounted): string[] {
	return m.all('.attach-name').map((n) =>
		Array.from(n.childNodes)
			.filter((c) => c.nodeType === 3)
			.map((c) => c.textContent ?? '')
			.join('')
			.trim()
	);
}

describe('reorder: present with onreorder, absent without, and the list moves nothing itself', () => {
	it('with onreorder: three grips, three Move up, three Move down, three rows', async () => {
		const calls: string[][] = [];
		const m = mountInto(List, { attachments: rows(), resolveSrc, onreorder: (ids: string[]) => calls.push(ids) });
		try {
			expect(m.all('[data-testid="attach-row"]')).toHaveLength(3);
			expect(m.all('[data-testid="attach-grip"]')).toHaveLength(3);
			expect(m.all('[data-testid="attach-move-up"]')).toHaveLength(3);
			expect(m.all('[data-testid="attach-move-down"]')).toHaveLength(3);
			// The ends explain themselves rather than vanishing.
			expect(m.all('[data-testid="attach-move-up"]')[0].getAttribute('aria-disabled')).toBe('true');
			expect(m.all('[data-testid="attach-move-down"]')[2].getAttribute('aria-disabled')).toBe('true');
			expect(m.all('[data-testid="attach-move-up"]')[1].getAttribute('aria-disabled')).toBe('false');
		} finally {
			await m.stop();
		}
	});

	it('without onreorder: zero grips and zero Move controls, and STILL three rows', async () => {
		const m = mountInto(List, { attachments: rows(), resolveSrc });
		try {
			expect(m.all('[data-testid="attach-row"]')).toHaveLength(3);
			expect(names(m)).toEqual(['notes.pdf', 'figure.png', 'bracket.sldprt']);
			expect(m.all('[data-testid="attach-grip"]')).toHaveLength(0);
			expect(m.all('[data-testid="attach-move-up"]')).toHaveLength(0);
			expect(m.all('[data-testid="attach-move-down"]')).toHaveLength(0);
			expect(m.all('[data-sort-handle]')).toHaveLength(0);
		} finally {
			await m.stop();
		}
	});

	it('a single row gets no grip either: there is nothing to move past', async () => {
		const m = mountInto(List, { attachments: rows().slice(0, 1), resolveSrc, onreorder: () => {} });
		try {
			expect(m.all('[data-testid="attach-row"]')).toHaveLength(1);
			expect(m.all('[data-testid="attach-grip"]')).toHaveLength(0);
		} finally {
			await m.stop();
		}
	});

	it('ArrowDown on the first grip hands the parent [a-2, a-1, a-3], and the DOM order is untouched', async () => {
		const calls: string[][] = [];
		const m = mountInto(List, { attachments: rows(), resolveSrc, onreorder: (ids: string[]) => calls.push(ids) });
		try {
			key(m.all('[data-testid="attach-grip"]')[0], 'ArrowDown');
			m.flush();
			expect(calls).toEqual([['a-2', 'a-1', 'a-3']]);
			// THE LIST NEVER REORDERS ITSELF: the parent's array is the order,
			// and this parent did not change it.
			expect(names(m)).toEqual(['notes.pdf', 'figure.png', 'bracket.sldprt']);
		} finally {
			await m.stop();
		}
	});

	it('ArrowUp on the first grip and ArrowDown on the last hand the parent nothing', async () => {
		const calls: string[][] = [];
		const m = mountInto(List, { attachments: rows(), resolveSrc, onreorder: (ids: string[]) => calls.push(ids) });
		try {
			const grips = m.all('[data-testid="attach-grip"]');
			key(grips[0], 'ArrowUp');
			key(grips[2], 'ArrowDown');
			m.flush();
			expect(calls).toEqual([]);
			// Positive control on the same mount: a legal press does reach it.
			key(grips[2], 'ArrowUp');
			m.flush();
			expect(calls).toEqual([['a-1', 'a-3', 'a-2']]);
		} finally {
			await m.stop();
		}
	});

	it('the worded buttons are the same move: Move down on row 2 hands [a-1, a-3, a-2]', async () => {
		const calls: string[][] = [];
		const m = mountInto(List, { attachments: rows(), resolveSrc, onreorder: (ids: string[]) => calls.push(ids) });
		try {
			m.all<HTMLButtonElement>('[data-testid="attach-move-down"]')[1].click();
			m.flush();
			expect(calls).toEqual([['a-1', 'a-3', 'a-2']]);
			// The aria-disabled end is still a real button, and pressing it
			// hands nothing over rather than an out-of-range move.
			m.all<HTMLButtonElement>('[data-testid="attach-move-up"]')[0].click();
			m.flush();
			expect(calls).toHaveLength(1);
		} finally {
			await m.stop();
		}
	});
});

describe('rename: an inline input with Save / Cancel, the refusal verbatim, and the block ahead of the input', () => {
	type Rename = (a: ClassroomAttachment, filename: string) => Promise<TxResult<{ filename: string }>>;

	it('without onrename: zero Rename controls, three rows', async () => {
		const m = mountInto(List, { attachments: rows(), resolveSrc, onreorder: () => {} });
		try {
			expect(m.all('[data-testid="attach-row"]')).toHaveLength(3);
			expect(m.all('[data-testid="attach-rename-start"]')).toHaveLength(0);
			expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(0);
		} finally {
			await m.stop();
		}
	});

	it('Rename opens an input seeded with the current name; Enter calls onrename with the row and the new name', async () => {
		const calls: [string, string][] = [];
		const onrename: Rename = async (a, filename) => {
			calls.push([a.id, filename]);
			return { ok: true, data: { filename } };
		};
		const m = mountInto(List, { attachments: rows(), resolveSrc, onrename });
		try {
			expect(m.all('[data-testid="attach-rename-start"]')).toHaveLength(3);
			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[0].click();
			m.flush();
			const input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
			expect(input.value).toBe('notes.pdf');
			// The row being renamed shows the editor INSTEAD of its meta line,
			// so there is one Rename control fewer while it is open.
			expect(m.all('[data-testid="attach-rename-start"]')).toHaveLength(2);

			input.value = 'Lab notes.pdf';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			key(input, 'Enter');
			await m.settle();

			expect(calls).toEqual([['a-1', 'Lab notes.pdf']]);
			// On success the editor closes; the ROW is the parent's to update.
			expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(0);
			expect(m.all('[data-testid="attach-rename-start"]')).toHaveLength(3);
		} finally {
			await m.stop();
		}
	});

	it('Save name is the same call as Enter, and Cancel / Escape close without calling', async () => {
		const calls: [string, string][] = [];
		const onrename: Rename = async (a, filename) => {
			calls.push([a.id, filename]);
			return { ok: true, data: { filename } };
		};
		const m = mountInto(List, { attachments: rows(), resolveSrc, onrename });
		try {
			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[1].click();
			m.flush();
			let input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
			input.value = 'nope.png';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			key(input, 'Escape');
			m.flush();
			expect(calls).toEqual([]);
			expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(0);

			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[1].click();
			m.flush();
			input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
			input.value = 'also nope.png';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			m.one<HTMLButtonElement>('[data-testid="attach-rename-cancel"]').click();
			m.flush();
			expect(calls).toEqual([]);

			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[1].click();
			m.flush();
			input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
			input.value = 'diagram.png';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			m.one<HTMLButtonElement>('[data-testid="attach-rename-save"]').click();
			await m.settle();
			expect(calls).toEqual([['a-2', 'diagram.png']]);
		} finally {
			await m.stop();
		}
	});

	it('an unchanged or empty name closes the editor without calling', async () => {
		const calls: [string, string][] = [];
		const onrename: Rename = async (a, filename) => {
			calls.push([a.id, filename]);
			return { ok: true, data: { filename } };
		};
		const m = mountInto(List, { attachments: rows(), resolveSrc, onrename });
		try {
			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[0].click();
			m.flush();
			key(m.one('[data-testid="attach-rename-input"]'), 'Enter');
			await m.settle();
			expect(calls).toEqual([]);
			expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(0);

			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[0].click();
			m.flush();
			const input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
			input.value = '   ';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			key(input, 'Enter');
			await m.settle();
			expect(calls).toEqual([]);
			expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(0);
		} finally {
			await m.stop();
		}
	});

	it('a refusal shows the transport\'s message verbatim, in the row, with the draft still in the input', async () => {
		const MESSAGE = 'Another file on this item already has that name.';
		const onrename: Rename = async () => ({ ok: false, message: MESSAGE });
		const m = mountInto(List, { attachments: rows(), resolveSrc, onrename });
		try {
			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[0].click();
			m.flush();
			const input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
			input.value = 'figure.png';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			key(input, 'Enter');
			await m.settle();

			const refusal = m.all('[data-testid="attach-rename-refusal"]');
			expect(refusal).toHaveLength(1);
			expect((refusal[0].textContent ?? '').trim()).toBe(MESSAGE);
			expect(refusal[0].getAttribute('role')).toBe('alert');
			// The editor stays open with the draft, so a taken name costs one
			// edit rather than a retype.
			expect(m.one<HTMLInputElement>('[data-testid="attach-rename-input"]').value).toBe('figure.png');
		} finally {
			await m.stop();
		}
	});

	it('renameBlocked shows the sentence INSTEAD of an input for that row, and an input for the others', async () => {
		const SENTENCE =
			'This file is used as a picture in the text or as a figure in the document. Remove that first, then rename the file.';
		const calls: string[] = [];
		const onrename: Rename = async (a, filename) => {
			calls.push(a.id);
			return { ok: true, data: { filename } };
		};
		const renameBlocked = (a: ClassroomAttachment) => (a.id === 'a-2' ? SENTENCE : null);
		const m = mountInto(List, { attachments: rows(), resolveSrc, onrename, renameBlocked });
		try {
			// The blocked row: the sentence, no input, nothing called.
			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[1].click();
			m.flush();
			const blocked = m.all('[data-testid="attach-rename-blocked"]');
			expect(blocked).toHaveLength(1);
			expect((blocked[0].textContent ?? '').trim()).toContain(SENTENCE);
			expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(0);
			expect(calls).toEqual([]);
			// Dismissed with a word.
			const ok = Array.from(blocked[0].querySelectorAll('button')).find((b) =>
				/ok/i.test(b.textContent ?? '')
			);
			expect(ok).toBeDefined();
			ok!.click();
			m.flush();
			expect(m.all('[data-testid="attach-rename-blocked"]')).toHaveLength(0);

			// The positive control on the same mount: an unblocked row opens an
			// input and its rename goes through.
			m.all<HTMLButtonElement>('[data-testid="attach-rename-start"]')[0].click();
			m.flush();
			expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(1);
			expect(m.all('[data-testid="attach-rename-blocked"]')).toHaveLength(0);
			const input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
			input.value = 'renamed.pdf';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			key(input, 'Enter');
			await m.settle();
			expect(calls).toEqual(['a-1']);
		} finally {
			await m.stop();
		}
	});

	it('renameBlocked alone (no onrename) offers no Rename control at all', async () => {
		const m = mountInto(List, {
			attachments: rows(),
			resolveSrc,
			renameBlocked: () => 'blocked'
		});
		try {
			expect(m.all('[data-testid="attach-row"]')).toHaveLength(3);
			expect(m.all('[data-testid="attach-rename-start"]')).toHaveLength(0);
		} finally {
			await m.stop();
		}
	});
});

describe('the pre-0193 surface is unchanged: remove and figure reference still render as before', () => {
	it('onremove renders Remove; figureRefs renders the copy control on the image row only', async () => {
		const removed: string[] = [];
		const m = mountInto(List, {
			attachments: rows(),
			resolveSrc,
			figureRefs: true,
			onremove: (a: ClassroomAttachment) => removed.push(a.id)
		});
		try {
			const removes = m.all<HTMLButtonElement>('.attach-remove');
			expect(removes).toHaveLength(3);
			expect(m.all('[data-testid="attach-figure-ref"]')).toHaveLength(1);
			removes[2].click();
			m.flush();
			expect(removed).toEqual(['a-3']);
		} finally {
			await m.stop();
		}
	});
});
