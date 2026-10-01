// tests/dom/html-qa-panel-mount.test.ts
//
// LEDGER 0360, REPORT 41c7fcd5: ANSWERS BY QUESTION, MOUNTED.
//
// Mounts the REAL `HtmlQaPanel`. The silent failure here is an `href` that
// should not exist: a `javascript:` answer turned into an Open key would look
// like every other link and run in the teacher's session. So the anchors are
// counted against the URL answers in the fixture, with a valid link in the same
// fixture as the positive control, and every anchor's target and rel read.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import HtmlQaPanel from '$lib/classroom/html-assignment/HtmlQaPanel.svelte';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Pitch',
	course: 'IDEA100',
	points: 0,
	modules: [
		{
			id: 'm1',
			title: 'Deck',
			points: 0,
			blocks: [
				{ id: 'm1-why', field: 'why', type: 'longText', prompt: 'Why this design?' },
				{ id: 'm1-link', field: 'deck', type: 'text', link: 'presentation', prompt: 'Link to your deck' }
			],
			criteria: []
		}
	]
};
const student = (email: string, name: string, why: string | null, deck: string | null) => ({
	email,
	displayName: name,
	active: true,
	submission: null,
	responses: [
		...(why === null ? [] : [{ item_id: 'i', student_email: email, block_id: 'm1-why', value: { text: why } }]),
		...(deck === null ? [] : [{ item_id: 'i', student_email: email, block_id: 'm1-link', value: { text: deck } }])
	],
	files: [],
	approvals: []
});
const STUDENTS = [
	student('ana@x.net', 'Ana Reyes', 'Because it is light. See https://example.org/ref.', 'https://www.canva.com/design/a/view'),
	student('ben@x.net', 'Ben Okafor', 'javascript:alert(1)', 'javascript:alert(1)'),
	student('cruz@x.net', 'Cruz Delgado', '', null)
];

function mountPanel(onopen: (email: string) => void = () => {}): Mounted {
	return mountInto(HtmlQaPanel as unknown as Component<Record<string, unknown>>, {
		manifest: MANIFEST,
		students: STUDENTS,
		onopen,
		onexportcsv: () => {}
	});
}

describe('HtmlQaPanel', () => {
	it('lists every question with its answered count, and opens on the first', async () => {
		mounted = mountPanel();
		await mounted.settle();
		const qs = mounted.all('[data-testid="qa-question"]');
		expect(qs.map((q) => q.querySelector('.qa-label')?.textContent?.trim())).toEqual([
			'Why this design?',
			'Link to your deck'
		]);
		expect(qs.map((q) => q.querySelector('[data-testid="qa-count"]')?.textContent?.trim())).toEqual([
			'2 of 3',
			'2 of 3'
		]);
		expect(qs[0].getAttribute('aria-pressed')).toBe('true');
		expect(mounted.one('[data-testid="qa-chosen"]').textContent?.trim()).toBe('Why this design?');
		// No answer saved is told apart from left blank.
		const texts = mounted.all('[data-testid="qa-answer"]').map((a) => a.querySelector('.qa-text')?.textContent?.trim());
		expect(texts[2]).toBe('Left blank');
	});

	it('Open keys exist exactly for the http(s) links, and javascript: is text', async () => {
		mounted = mountPanel();
		await mounted.settle();
		// Question 1: Ana wrote one link in a sentence (1), Ben wrote javascript: (0).
		let anchors = mounted.all<HTMLAnchorElement>('[data-testid="answer-link-open"]');
		expect(anchors).toHaveLength(1);
		expect(anchors[0].getAttribute('href')).toBe('https://example.org/ref');
		expect(mounted.all('[data-testid="qa-answer"]')[1].textContent).toContain('javascript:alert(1)');
		// Question 2, the declared link field: Ana's Canva link opens (1); Ben's is
		// "not a working link" with what he typed and no anchor (0).
		(mounted.all('[data-testid="qa-question"]')[1] as HTMLElement).click();
		await mounted.settle();
		anchors = mounted.all<HTMLAnchorElement>('[data-testid="answer-link-open"]');
		expect(anchors).toHaveLength(1);
		expect(anchors[0].getAttribute('href')).toBe('https://www.canva.com/design/a/view');
		expect(mounted.all('[data-testid="answer-link-bad"]')).toHaveLength(1);
		for (const a of mounted.all<HTMLAnchorElement>('a')) {
			expect(a.getAttribute('href')).toMatch(/^https?:\/\//);
			expect(a.getAttribute('target')).toBe('_blank');
			expect(a.getAttribute('rel')).toContain('noopener');
			expect(a.getAttribute('rel')).toContain('noreferrer');
		}
	});

	it('a name opens that student', async () => {
		const opened: string[] = [];
		mounted = mountPanel((email) => opened.push(email));
		await mounted.settle();
		(mounted.all('[data-testid="qa-open"]')[1] as HTMLElement).click();
		expect(opened).toEqual(['ben@x.net']);
	});

	it('Up and Down move between questions and choose them, and mark the key handled', async () => {
		mounted = mountPanel();
		await mounted.settle();
		const qs = mounted.all<HTMLButtonElement>('[data-testid="qa-question"]');
		qs[0].focus();
		const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
		qs[0].dispatchEvent(down);
		await mounted.settle();
		expect(down.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(qs[1]);
		expect(mounted.one('[data-testid="qa-chosen"]').textContent?.trim()).toBe('Link to your deck');
	});
});
