// tests/dom/bulk-file-download-student-mount.test.ts
//
// LEDGER 0360, REPORT f09ccabd: ONE STUDENT'S FILES, BESIDE EVERYONE'S.
//
// Mounts the REAL `BulkFileDownload`. Both directions: with a student open
// there is exactly one "Files: <name> (N)" key whose count is that student's
// own files, with nobody open there is none and a sentence says how to get one,
// and "Download all files" is there, unchanged, in both.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import BulkFileDownload from '$lib/classroom/BulkFileDownload.svelte';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const SECTION = { id: 's1', label: 'Period 1', course: { code: 'IDEA100', title: 'Design' } };
const ITEM = { id: 'i1', kind: 'assignment', title: 'Bridge Sketch', points: 10 };
const ROSTER = [
	{ section_id: 's1', student_email: 'ana@x.net', display_name: 'Ana Reyes', active: true },
	{ section_id: 's1', student_email: 'ben@x.net', display_name: 'Ben Okafor', active: true },
	{ section_id: 's1', student_email: 'cruz@x.net', display_name: 'Cruz Delgado', active: true }
];
const file = (id: string, sub: string) => ({
	id,
	submission_id: sub,
	block_id: null,
	caption: null,
	filename: `${id}.png`,
	mime_type: 'application/octet-stream',
	size_bytes: 10
});
const DATA = {
	roster: ROSTER,
	submissions: [
		{ id: 'sa', item_id: 'i1', student_email: 'ana@x.net', state: 'draft' },
		{ id: 'sb', item_id: 'i1', student_email: 'ben@x.net', state: 'draft' }
	],
	responses: [],
	files: [file('a1', 'sa'), file('a2', 'sa'), file('b1', 'sb')],
	approvals: []
};
const SOURCE = {
	blocks: new Map(),
	fetchFile: async () => ({ ok: true as const, bytes: new Uint8Array([1, 2, 3]) })
};

function mountWith(student: { email: string; displayName: string } | null): Mounted {
	return mountInto(BulkFileDownload as unknown as Component<Record<string, unknown>>, {
		source: SOURCE,
		item: ITEM,
		data: DATA,
		sections: [SECTION],
		scopeSection: SECTION,
		selected: [],
		student,
		outOf: 10,
		save: () => {}
	});
}

describe('one student’s files', () => {
	it('with a student open: one key, their own count, and everyone’s key unchanged', async () => {
		mounted = mountWith({ email: 'ana@x.net', displayName: 'Ana Reyes' });
		await mounted.settle();
		const keys = mounted.all('[data-testid="bulk-files-student"]');
		expect(keys).toHaveLength(1);
		expect(keys[0].textContent?.replace(/\s+/g, ' ').trim()).toBe('Files: Ana Reyes (2)');
		expect(keys[0].getAttribute('aria-disabled')).toBe('false');
		expect(mounted.all('[data-testid="bulk-files-student-hint"]')).toHaveLength(0);
		// EVERYONE'S IS UNCHANGED: one key, the class count.
		expect(mounted.all('[data-testid="bulk-files-download"]')).toHaveLength(1);
		expect(mounted.one('[data-testid="bulk-files-count"]').textContent).toContain('3 files from 2 students');
	});

	it('a student with nothing handed in reads (0) and the key explains rather than vanishing', async () => {
		mounted = mountWith({ email: 'cruz@x.net', displayName: 'Cruz Delgado' });
		await mounted.settle();
		const k = mounted.one('[data-testid="bulk-files-student"]');
		expect(k.textContent?.replace(/\s+/g, ' ').trim()).toBe('Files: Cruz Delgado (0)');
		expect(k.getAttribute('aria-disabled')).toBe('true');
	});

	it('with nobody open: no key, and the sentence that says how to get one', async () => {
		mounted = mountWith(null);
		await mounted.settle();
		expect(mounted.all('[data-testid="bulk-files-student"]')).toHaveLength(0);
		expect(mounted.one('[data-testid="bulk-files-student-hint"]').textContent?.trim()).toBe(
			'Open a student to download only their files.'
		);
		expect(mounted.all('[data-testid="bulk-files-download"]')).toHaveLength(1);
	});
});
