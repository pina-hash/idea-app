// tests/dom/cert-student-submission-form.test.ts
//
// THE HAND-IN FORM'S SUBMIT KEY (ledger 0391), on the REAL `SubmissionForm`
// mounted with an in-memory uploader and an in-memory action post:
//
//   - Submit is `aria-disabled` (never `disabled`) until every REQUIRED
//     evidence item has a value and every self-inspection box is ticked, and
//     the reasons are listed beside it in words;
//   - an uploaded file lands in the form's value only when the uploader says
//     it did; a refused one stays staged with its message and counts for
//     nothing;
//   - a press before the form is complete posts NOTHING; a press after posts
//     the `submit` action once, with the evidence jsonb built from the values.
//
// Why a test and not only a harness: a key that posted an incomplete hand-in
// would be refused by `cert_submit` and look like a working control, and a key
// that never lit would look like a rule. Structure and events only; geometry
// is the browser pass's (happy-dom has no layout engine).
import { afterEach, describe, expect, it } from 'vitest';
import SubmissionForm from '../../src/lib/certifications/student/SubmissionForm.svelte';
import type { CertActionPost } from '../../src/lib/certifications/student/actions';
import type { EvidenceUploader } from '../../src/lib/certifications/student/evidence-upload';
import type { EvidenceItem } from '../../src/lib/certifications/types';
import { mountInto, type Mounted } from './mount';

const ATTEMPT = '2f1a9c5e-7b3d-4e2a-8c1f-0d9e8b7a6c02';
const EVIDENCE: EvidenceItem[] = [
	{ kind: 'photo', label: 'The finished block beside the drawing', required: true },
	{ kind: 'text', label: 'Your measured dimensions', required: true },
	{ kind: 'youtube', label: 'A short clip of the last pass', required: false }
];
const SELF = ['I measured every dimension on the drawing', 'I deburred every edge'];

const uploader: EvidenceUploader = async (file) => {
	await new Promise((r) => setTimeout(r, 5));
	if (/refuse/i.test(file.name)) return { ok: false, message: 'That file is 61.0 MB, and the limit is 50 MB.', retryable: false };
	return { ok: true, file: { path: `${ATTEMPT}/${file.name.replace(/\W/g, '')}.jpg`, name: file.name, size: file.size } };
};

const posts: { action: string; fields: Record<string, string> }[] = [];
const post: CertActionPost = async (action, fields) => {
	posts.push({ action, fields });
	return { ok: true };
};

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	posts.length = 0;
});

function mountForm(props: Record<string, unknown> = {}) {
	mounted = mountInto(SubmissionForm as never, { attemptId: ATTEMPT, part: 'guided', evidence: EVIDENCE, selfInspection: SELF, upload: uploader, post, ...props });
	return mounted;
}

const submitKey = (m: Mounted) => m.one<HTMLButtonElement>('[data-testid="cert-submit"]');
const problems = (m: Mounted) => m.all<HTMLLIElement>('[data-testid="cert-submit-problems"] li').map((li) => li.textContent?.trim() ?? '');

function pickFile(m: Mounted, name: string) {
	const input = m.one<HTMLInputElement>('[data-testid="cert-evidence-input"]');
	const file = new File(['bytes'], name, { type: '' });
	Object.defineProperty(input, 'files', { value: [file], configurable: true });
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

function typeText(m: Mounted, value: string) {
	const ta = m.one<HTMLTextAreaElement>('[data-testid="cert-evidence-text"]');
	ta.value = value;
	ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function tickAll(m: Mounted) {
	for (const box of m.all<HTMLInputElement>('[data-testid="cert-inspection-box"]')) {
		box.checked = true;
		box.dispatchEvent(new Event('change', { bubbles: true }));
	}
}

describe('Submit is aria-disabled until everything required is in', () => {
	it('arrives dark with three reasons: two required items and two unticked boxes as one line', () => {
		const m = mountForm();
		const key = submitKey(m);
		expect(key.getAttribute('aria-disabled')).toBe('true');
		expect(key.hasAttribute('disabled')).toBe(false);
		expect(key.dataset.complete).toBe('no');
		expect(problems(m)).toEqual([
			'The finished block beside the drawing is required',
			'Your measured dimensions is required',
			'2 self-inspection boxes still unticked'
		]);
		// The optional YouTube item is not among the reasons.
		expect(problems(m).join(' ')).not.toContain('clip');
	});

	it('each requirement met removes its own reason, and the last one lights the key', async () => {
		const m = mountForm();
		typeText(m, 'Length 2.999');
		m.flush();
		expect(problems(m)).toEqual(['The finished block beside the drawing is required', '2 self-inspection boxes still unticked']);

		pickFile(m, 'block.jpg');
		await m.settle();
		expect(m.all('[data-testid="cert-evidence-file"][data-state="landed"]').length).toBe(1);
		expect(problems(m)).toEqual(['2 self-inspection boxes still unticked']);
		expect(submitKey(m).getAttribute('aria-disabled')).toBe('true');

		tickAll(m);
		m.flush();
		expect(submitKey(m).getAttribute('aria-disabled')).toBe('false');
		expect(submitKey(m).dataset.complete).toBe('yes');
		expect(problems(m)).toEqual(['Everything is in. Submit when you are ready.']);
	});

	it('a refused upload stays staged with its message and counts for nothing', async () => {
		const m = mountForm();
		pickFile(m, 'refuse-me.jpg');
		await m.settle();
		const rows = m.all<HTMLLIElement>('[data-testid="cert-evidence-file"]');
		expect(rows.length).toBe(1);
		expect(rows[0].dataset.state).toBe('failed');
		expect(rows[0].textContent).toContain('the limit is 50 MB');
		expect(m.all('[data-testid="cert-evidence-file"][data-state="landed"]').length).toBe(0);
		expect(problems(m)[0]).toBe('The finished block beside the drawing is required');
		expect(submitKey(m).getAttribute('aria-disabled')).toBe('true');
	});

	it('a malformed optional YouTube link is a reason too, and a real one is not', () => {
		const m = mountForm();
		const yt = m.one<HTMLInputElement>('[data-testid="cert-evidence-youtube"]');
		yt.value = 'https://example.com/not-a-video';
		yt.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(problems(m)).toContain('A short clip of the last pass: that is not a YouTube link');
		yt.value = 'https://youtu.be/dQw4w9WgXcQ';
		yt.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(problems(m).join(' ')).not.toContain('not a YouTube link');
		expect(m.one('[data-testid="cert-evidence-youtube-check"]').textContent).toContain('YouTube video dQw4w9WgXcQ');
	});
});

describe('a press posts only when the form is complete', () => {
	it('incomplete: nothing is posted and the reasons are shown', async () => {
		const m = mountForm();
		const form = m.one<HTMLFormElement>('[data-testid="cert-submission-form"]');
		const ev = new Event('submit', { bubbles: true, cancelable: true });
		form.dispatchEvent(ev);
		await m.settle();
		expect(ev.defaultPrevented).toBe(true);
		expect(posts).toEqual([]);
		expect(m.all('[data-testid="cert-submission-landed"]').length).toBe(0);
	});

	it('complete: one submit action with the evidence jsonb built from the values, then the landed notice', async () => {
		const m = mountForm();
		typeText(m, 'Length 2.999\nStep 0.503');
		pickFile(m, 'block.jpg');
		await m.settle();
		tickAll(m);
		m.flush();
		const form = m.one<HTMLFormElement>('[data-testid="cert-submission-form"]');
		form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await m.settle();
		expect(posts.length).toBe(1);
		expect(posts[0].action).toBe('submit');
		expect(posts[0].fields.attempt_id).toBe(ATTEMPT);
		expect(posts[0].fields.part).toBe('guided');
		const evidence = JSON.parse(posts[0].fields.evidence) as { text: string; links: string[]; youtube_id: string | null; files: { path: string; name: string }[] };
		expect(evidence.text).toBe('Length 2.999\nStep 0.503');
		expect(evidence.youtube_id).toBeNull();
		expect(evidence.links).toEqual([]);
		expect(evidence.files.map((f) => f.name)).toEqual(['block.jpg']);
		expect(evidence.files[0].path.startsWith(`${ATTEMPT}/`)).toBe(true);
		const inspection = JSON.parse(posts[0].fields.self_inspection) as { item: string; checked: boolean }[];
		expect(inspection).toEqual(SELF.map((item) => ({ item, checked: true })));
		expect(m.all('[data-testid="cert-submission-landed"]').length).toBe(1);
	});

	it('a refusal from the action renders verbatim where the form is', async () => {
		const refusing: CertActionPost = async () => ({ ok: false, message: 'Your hand-in is waiting for review. Hand in again once it is returned.', reason: 'pending' });
		const m = mountForm({ post: refusing });
		typeText(m, 'Length 2.999');
		pickFile(m, 'block.jpg');
		await m.settle();
		tickAll(m);
		m.flush();
		m.one<HTMLFormElement>('[data-testid="cert-submission-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await m.settle();
		expect(m.one('[data-testid="cert-submission-refusal"]').textContent).toContain('Your hand-in is waiting for review. Hand in again once it is returned.');
		expect(m.all('[data-testid="cert-submission-landed"]').length).toBe(0);
	});

	it('with no uploader the picker is not offered, and the form says to sign in', () => {
		const m = mountForm({ upload: null });
		expect(m.all('[data-testid="cert-evidence-input"]').length).toBe(0);
		expect(m.one('[data-testid="cert-evidence-uploader"]').textContent).toContain('Sign in to add photos');
		// The positive control: with the uploader there is one picker and one camera.
		const withUpload = mountInto(SubmissionForm as never, { attemptId: ATTEMPT, part: 'guided', evidence: EVIDENCE, selfInspection: SELF, upload: uploader, post });
		expect(withUpload.all('[data-testid="cert-evidence-input"]').length).toBe(1);
		expect(withUpload.all('[data-testid="cert-evidence-camera"]').length).toBe(1);
		void withUpload.stop();
	});
});
