// tests/dom/class-quick-posts-mount.test.ts
//
// QUICK POSTS (ledger 0360, report R22), ON THE REAL COMPONENTS.
//
// Mr. Pina asked for notices that students see at the top of the class and
// that "disappear on their own", posted to one class or many with as few steps
// as possible. What would regress SILENTLY, and is therefore asserted here
// where effects really run:
//
//   1. A notice still showing after its end. A timer that never armed renders
//      exactly the page load's answer, which is what somebody checking by eye
//      expects to see -- so the vanish is asserted a tick either side of the
//      end, with ZERO reads in between (an end needs no network).
//   2. A poll that silently stopped, and a live notice that never re-reads.
//   3. Take down firing on the first press, or a Take down offered to a
//      student, or to a surface with no write transport.
//   4. The shortest post being longer than three actions: open, type, Post,
//      with the default end and the current class.
//
// Structure, events and call counts only (happy-dom has no layout engine).
// Geometry, contrast and tap targets are tools/browser-verify/routes/class-header*.mjs.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuickPosts from '../../src/lib/classroom/QuickPosts.svelte';
import {
	QUICK_POSTS_POLL_MS,
	quickPostExpiry,
	type QuickPost,
	type QuickPostBoard,
	type QuickPostTransports
} from '../../src/lib/classroom/quick-posts';
import { createMemoryClassroomLive } from '../../src/lib/classroom/live';
import { _resetPollSession } from '../../src/lib/classroom/poll-session';
import type { ClassroomSection } from '../../src/lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';
import { dropEvent } from './drag-events';
import type { UploadOutcome } from '../../src/lib/classroom/file-upload';

const NOW = Date.parse('2026-09-24T17:00:00.000Z'); // Thu 10:00 AM Pacific
const iso = (ms: number) => new Date(ms).toISOString();

const post = (id: string, over: Partial<QuickPost> = {}): QuickPost => ({
	id,
	body: `Notice ${id}`,
	created_at: iso(NOW - 60_000),
	expires_at: null,
	section_ids: null,
	can_take_down: false,
	...over
});
const boardOf = (posts: QuickPost[], manages = false): QuickPostBoard => ({ manages, now: iso(NOW), posts });

interface Fake {
	transports: QuickPostTransports;
	reads: number;
	creates: [string[], string, string | null][];
	takeDowns: string[];
	next: QuickPostBoard;
}
function fake(next: QuickPostBoard): Fake {
	const f: Fake = { transports: {} as QuickPostTransports, reads: 0, creates: [], takeDowns: [], next };
	f.transports = {
		async read() {
			f.reads += 1;
			return { ok: true, board: f.next };
		},
		async create(ids, body, expiresAt) {
			f.creates.push([ids, body, expiresAt]);
			return { ok: true, id: 'new-1', section_ids: ids, created_at: iso(Date.now()), expires_at: expiresAt };
		},
		async takeDown(id) {
			f.takeDowns.push(id);
			return { ok: true, already: false, section_ids: ['s-2', 's-4'] };
		}
	};
	return f;
}

const course = { id: 'c', code: 'IDEA100', title: 'Intro to IDEA', active: true };
const SECTIONS: ClassroomSection[] = [
	{ id: 's-2', course_id: 'c', label: '2', block: '1', teacher_email: 'apina@boscotech.edu', active: true, course },
	{ id: 's-4', course_id: 'c', label: '4', block: '3', teacher_email: 'apina@boscotech.edu', active: true, course }
];

let mounted: Mounted | null = null;
beforeEach(() => {
	vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
	vi.setSystemTime(NOW);
	vi.spyOn(Math, 'random').mockReturnValue(0.5);
	_resetPollSession();
});
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	vi.restoreAllMocks();
	vi.useRealTimers();
});

function mountPosts(props: Record<string, unknown>): Mounted {
	mounted = mountInto(QuickPosts as never, { sectionId: 's-2', ...props });
	return mounted;
}
async function drain(m: Mounted) {
	m.flush();
	await vi.advanceTimersByTimeAsync(0);
	m.flush();
}
const notices = (m: Mounted) => m.all('[data-testid="quick-post"]').length;

describe('a notice disappears on its own at its end', () => {
	it('showing a moment before its end, gone a moment after, with no read in between', async () => {
		const f = fake(boardOf([]));
		const m = mountPosts({
			board: boardOf([post('soon', { expires_at: iso(NOW + 5_000) }), post('stays')]),
			transports: f.transports
		});
		expect(notices(m)).toBe(2);
		expect(m.one('[data-post="soon"] [data-testid="quick-post-until"]').textContent?.trim()).toBe('Until 10:00 AM today');
		await vi.advanceTimersByTimeAsync(4_900);
		m.flush();
		expect(notices(m)).toBe(2);
		await vi.advanceTimersByTimeAsync(200);
		m.flush();
		expect(notices(m)).toBe(1);
		expect(m.all('[data-post="soon"]').length).toBe(0);
		// An end needs no network: the poll's first tick is minutes away.
		expect(f.reads).toBe(0);
	});

	it('a null board renders nothing and never asks', async () => {
		const f = fake(boardOf([post('a')]));
		const m = mountPosts({ board: null, transports: f.transports });
		expect(m.target.innerHTML.replace(/<!--.*?-->/g, '').trim()).toBe('');
		await vi.advanceTimersByTimeAsync(QUICK_POSTS_POLL_MS * 2);
		expect(f.reads).toBe(0);
	});
});

describe('an open class page hears of a new notice', () => {
	it('the floor poll brings it, out of step, and says so to a screen reader', async () => {
		const f = fake(boardOf([post('new'), post('old')]));
		const m = mountPosts({ board: boardOf([post('old')]), transports: f.transports });
		expect(notices(m)).toBe(1);
		await vi.advanceTimersByTimeAsync(QUICK_POSTS_POLL_MS / 2 - 1);
		expect(f.reads).toBe(0);
		await vi.advanceTimersByTimeAsync(1);
		await drain(m);
		expect(f.reads).toBe(1);
		expect(notices(m)).toBe(2);
		expect(m.one('[data-testid="quick-posts-said"]').textContent).toBe('A new class notice was posted.');
	});

	it('a live notice re-reads once, folding a burst', async () => {
		const live = createMemoryClassroomLive();
		const f = fake(boardOf([post('new')]));
		const m = mountPosts({ board: boardOf([]), transports: f.transports, live, noticeJitterMs: 1_000 });
		expect(live.listenerCount('s-2')).toBe(1);
		live.announce('s-2', 'quick-posts');
		live.announce('s-2', 'quick-posts');
		live.announce('s-2', 'hall-pass');
		await vi.advanceTimersByTimeAsync(1_000);
		await drain(m);
		expect(f.reads).toBe(1);
		expect(notices(m)).toBe(1);
	});
});

describe('taking a notice down', () => {
	const managed = () => boardOf([post('p1', { section_ids: ['s-2', 's-4'], can_take_down: true })], true);

	it('two presses, the second naming the classes, and one call', async () => {
		const live = createMemoryClassroomLive();
		const f = fake(boardOf([]));
		const m = mountPosts({ board: managed(), transports: f.transports, live });
		expect(m.one('[data-testid="quick-post-manage"]').textContent).toContain('Posted to 2 classes');
		m.one<HTMLButtonElement>('[data-testid="quick-post-take-down"]').click();
		await drain(m);
		expect(f.takeDowns).toEqual([]);
		const confirm = m.one<HTMLButtonElement>('[data-testid="quick-post-take-down-confirm"]');
		expect(confirm.textContent?.trim()).toBe('Take it down from 2 classes');
		confirm.click();
		await drain(m);
		expect(f.takeDowns).toEqual(['p1']);
		expect(notices(m)).toBe(0);
		expect(m.one('[data-testid="quick-post-ack"]').textContent).toBe('Notice taken down.');
		expect(live.announced.map((a) => a.sectionId).sort()).toEqual(['s-2', 's-4']);
	});

	it('no write transport, no Take down; a student never sees one either', () => {
		const withT = mountInto(QuickPosts as never, { sectionId: 's-2', board: managed(), transports: fake(boardOf([])).transports });
		const without = mountInto(QuickPosts as never, { sectionId: 's-2', board: managed(), transports: null });
		const student = mountInto(QuickPosts as never, {
			sectionId: 's-2',
			board: boardOf([post('p1')]),
			transports: fake(boardOf([])).transports
		});
		try {
			expect(withT.all('[data-testid="quick-post-take-down"]').length).toBe(1);
			expect(without.all('[data-testid="quick-post-take-down"]').length).toBe(0);
			expect(student.all('[data-testid="quick-post-take-down"]').length).toBe(0);
			expect(student.all('[data-testid="quick-post-manage"]').length).toBe(0);
			// Positive control: the student's notice IS on the page.
			expect(student.all('[data-testid="quick-post"]').length).toBe(1);
		} finally {
			void withT.stop();
			void without.stop();
			void student.stop();
		}
	});
});

describe('posting in three actions', () => {
	function type(m: Mounted, text: string) {
		const box = m.one<HTMLTextAreaElement>('[data-testid="quick-post-text"]');
		box.value = text;
		box.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		return box;
	}

	it('open, type, Post: this class, until the end of the school day, then the board says so', async () => {
		const live = createMemoryClassroomLive();
		const f = fake(boardOf([]));
		const closed = vi.fn();
		const m = mountPosts({
			board: boardOf([], true),
			transports: f.transports,
			live,
			composing: true,
			oncomposerclose: closed,
			sections: SECTIONS,
			viewerEmail: 'apina@boscotech.edu'
		});
		expect(m.all('[data-testid="quick-post-composer"]').length).toBe(1);
		// The default end is pressed and says what it means.
		const pressed = m.all<HTMLButtonElement>('[data-testid="quick-post-preset"][aria-pressed="true"]');
		expect(pressed.map((b) => b.dataset.preset)).toEqual(['school-day']);
		expect(pressed[0].textContent).toContain('3:00 PM today');
		// Post is not ready with nothing written, and says why when pressed.
		const send = m.one<HTMLButtonElement>('[data-testid="quick-post-send"]');
		expect(send.getAttribute('aria-disabled')).toBe('true');
		send.click();
		await drain(m);
		expect(f.creates).toEqual([]);
		expect(m.one('[data-testid="quick-post-refusal"]').textContent).toBe('Write something to post first.');

		type(m, '  Special schedule: shop first.  ');
		expect(send.getAttribute('aria-disabled')).toBe('false');
		expect(send.textContent?.trim()).toBe('Post to 1 class');
		send.click();
		await drain(m);
		const end = quickPostExpiry('school-day', NOW);
		expect(f.creates).toEqual([[['s-2'], 'Special schedule: shop first.', end.ok ? end.expiresAt : 'x']]);
		expect(closed).toHaveBeenCalledTimes(1);
		expect(m.one('[data-testid="quick-post-ack"]').textContent).toBe('Posted to 1 class, until 3:00 PM today.');
		expect(live.announced).toEqual([{ sectionId: 's-2', topic: 'quick-posts' }]);
	});

	it('All my classes is one more press, and Ctrl+Enter posts', async () => {
		const f = fake(boardOf([]));
		const m = mountPosts({
			board: boardOf([], true),
			transports: f.transports,
			composing: true,
			sections: SECTIONS,
			viewerEmail: 'apina@boscotech.edu'
		});
		m.one<HTMLButtonElement>('[data-testid="quick-post-target-mine"]').click();
		m.flush();
		const box = type(m, 'Fire drill third block.');
		expect(m.one('[data-testid="quick-post-send"]').textContent?.trim()).toBe('Post to 2 classes');
		box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
		await drain(m);
		expect(f.creates.map((c) => c[0])).toEqual([['s-2', 's-4']]);
	});

	it('a student is never handed the composer, whatever the flag says', () => {
		const m = mountPosts({ board: boardOf([post('a')], false), transports: fake(boardOf([])).transports, composing: true });
		expect(m.all('[data-testid="quick-post-composer"]').length).toBe(0);
		expect(m.all('[data-testid="quick-post"]').length).toBe(1);
	});
});

/*
 * 0233 (ledger 0368, report R04): a long notice folds, a notice carries its
 * files, and a teacher attaches them in the same Post. Structure and call
 * counts only; the heights, tiles and the Lightbox are
 * tools/browser-verify/routes/class-header-*-long-1-files-*.mjs.
 */
const READY = { filesReady: true, limits: { maxChars: 4000, maxFiles: 10, maxBytes: 47185920 } };
const LONG = 'Bring safety glasses and your bridge. '.repeat(12).trim();

describe('a long notice shows a lead and folds the rest, a short one does not fold', () => {
	it('one closed fold for the long notice, with the rest still in the DOM, and none for the short one', () => {
		const m = mountPosts({ board: boardOf([post('long', { body: LONG }), post('short')]) });
		const folds = m.all('[data-post="long"] [data-testid="quick-post-more"]');
		expect(folds.length).toBe(1);
		expect(m.all('[data-post="short"] [data-testid="quick-post-more"]').length).toBe(0);
		expect(m.expanded('quick-post-more')).toBe('false');
		const lead = m.one('[data-post="long"] [data-testid="quick-post-body"]').textContent ?? '';
		const rest = m.one('[data-post="long"] [data-testid="quick-post-rest"]').textContent ?? '';
		expect(lead.length).toBeGreaterThan(0);
		expect(lead.length).toBeLessThanOrEqual(281);
		// Nothing is lost between the two halves.
		expect(`${lead} ${rest}`.replace(/\s+/g, ' ').trim()).toBe(LONG);
		// The short notice is whole, in the one paragraph.
		expect(m.one('[data-post="short"] [data-testid="quick-post-body"]').textContent?.trim()).toBe('Notice short');
	});
});

describe("a notice's files", () => {
	it('pictures are tiles that open the viewer, other files are download rows, through the notice-file route', () => {
		const files = [
			{ id: 'f1', filename: 'rig.jpg', size_bytes: 1000 },
			{ id: 'f2', filename: 'span.png', size_bytes: 1000 },
			{ id: 'f3', filename: 'failure.jpeg', size_bytes: 1000 },
			{ id: 'f4', filename: 'load-sheet.pdf', size_bytes: 1000 },
			{ id: 'f5', filename: 'gusset.SLDPRT', size_bytes: 1000 }
		];
		const m = mountPosts({ board: boardOf([post('p', { files }), post('plain', { files: [] })]) });
		expect(m.all('[data-post="p"] [data-testid="attach-gallery-tile"]').length).toBe(3);
		expect(m.all('[data-post="p"] [data-testid="attach-row"]').length).toBe(2);
		const hrefs = m.all<HTMLAnchorElement>('[data-post="p"] a.attach-name').map((a) => a.getAttribute('href'));
		expect(hrefs).toEqual(['/api/classroom/quick-post-file/f4', '/api/classroom/quick-post-file/f5']);
		// No files, no strip at all.
		expect(m.all('[data-post="plain"] [data-testid="quick-post-files"]').length).toBe(0);
		expect(m.all('[data-post="p"] [data-testid="quick-post-files"]').length).toBe(1);
	});
});

describe('the picker is offered only where files are possible', () => {
	const uploads: string[] = [];
	const withUpload = (): QuickPostTransports => {
		const t = fake(boardOf([])).transports;
		t.uploadFile = async (postId, file) => {
			uploads.push(`${postId}:${file.name}`);
			return { ok: true, storageKey: `${postId}/x`, row: { id: `up-${file.name}`, filename: file.name, size_bytes: file.size } };
		};
		return t;
	};
	const inputs = (board: QuickPostBoard, transports: QuickPostTransports) => {
		const m = mountInto(QuickPosts as never, { sectionId: 's-2', board, transports, composing: true, sections: SECTIONS, viewerEmail: 'apina@boscotech.edu' });
		try {
			return m.all('[data-testid="quick-post-composer"] input[type="file"]').length;
		} finally {
			void m.stop();
		}
	};

	it('1 file input with files_ready and an upload transport; 0 without either, 0 on a database without 0233', () => {
		expect(inputs({ ...boardOf([], true), ...READY }, withUpload())).toBe(1);
		expect(inputs({ ...boardOf([], true), ...READY }, fake(boardOf([])).transports)).toBe(0);
		expect(inputs({ ...boardOf([], true), ...READY, filesReady: false }, withUpload())).toBe(0);
		expect(inputs(boardOf([], true), withUpload())).toBe(0);
	});

	it('the counter counts to the database ceiling: 4,000 with 0233, 1,000 without', () => {
		const count = (board: QuickPostBoard) => {
			const m = mountInto(QuickPosts as never, { sectionId: 's-2', board, transports: withUpload(), composing: true, sections: SECTIONS });
			try {
				return m.one('[data-testid="quick-post-count"]').textContent?.replace(/\s+/g, ' ').trim();
			} finally {
				void m.stop();
			}
		};
		expect(count({ ...boardOf([], true), ...READY })).toMatch(/^0 of 4,000 characters/);
		expect(count(boardOf([], true))).toMatch(/^0 of 1,000 characters/);
	});
});

describe('Post makes the notice once, then attaches its files to it', () => {
	function type(m: Mounted, text: string) {
		const box = m.one<HTMLTextAreaElement>('[data-testid="quick-post-text"]');
		box.value = text;
		box.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
	}
	function stage(m: Mounted, names: string[]) {
		const input = m.one<HTMLInputElement>('[data-testid="quick-post-composer"] input[type="file"]');
		const dt = new DataTransfer();
		for (const n of names) dt.items.add(new File(['bytes'], n));
		Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
		input.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
	}

	it('a file that fails stays, Attach the rest goes to the SAME notice, and nothing posts twice', async () => {
		const live = createMemoryClassroomLive();
		const f = fake(boardOf([]));
		let failOnce = true;
		const uploads: string[] = [];
		f.transports.uploadFile = async (postId, file): Promise<UploadOutcome> => {
			uploads.push(`${postId}:${file.name}`);
			if (file.name === 'b.pdf' && failOnce) {
				failOnce = false;
				return { ok: false, gate: 'network', message: 'The connection dropped while "b.pdf" was uploading. It is still here.', retryable: true };
			}
			return { ok: true, storageKey: `${postId}/k`, row: { id: `id-${file.name}`, filename: file.name, size_bytes: file.size } };
		};
		const closed = vi.fn();
		const m = mountPosts({
			board: { ...boardOf([], true), ...READY },
			transports: f.transports,
			live,
			composing: true,
			oncomposerclose: closed,
			sections: SECTIONS,
			viewerEmail: 'apina@boscotech.edu'
		});
		type(m, 'Photos from the test.');
		stage(m, ['a.jpg', 'b.pdf']);
		expect(m.all('[data-testid="fup-row"]').length).toBe(2);
		m.one<HTMLButtonElement>('[data-testid="quick-post-send"]').click();
		for (let i = 0; i < 4; i++) await drain(m);
		expect(f.creates.length).toBe(1);
		expect(uploads).toEqual(['new-1:a.jpg', 'new-1:b.pdf']);
		expect(m.one('[data-testid="quick-post-posted"]').textContent).toContain('1 file did not attach');
		expect(m.all('[data-testid="fup-row"]').length).toBe(1);
		expect(closed).toHaveBeenCalledTimes(0);
		// The landed picture is already on the notice, and the classes heard.
		expect(m.all('[data-post="new-1"] [data-testid="attach-gallery-tile"]').length).toBe(1);
		expect(live.announced).toEqual([{ sectionId: 's-2', topic: 'quick-posts' }]);

		m.one<HTMLButtonElement>('[data-testid="quick-post-attach-rest"]').click();
		for (let i = 0; i < 4; i++) await drain(m);
		expect(f.creates.length).toBe(1);
		expect(uploads).toEqual(['new-1:a.jpg', 'new-1:b.pdf', 'new-1:b.pdf']);
		expect(closed).toHaveBeenCalledTimes(1);
		expect(m.all('[data-post="new-1"] [data-testid="attach-row"]').length).toBe(1);
	});

	it('a drop on the composer card stages there and does not bubble on as a new drop', () => {
		const t = fake(boardOf([])).transports;
		t.uploadFile = async () => ({ ok: true, storageKey: 'x' });
		const m = mountPosts({ board: { ...boardOf([], true), ...READY }, transports: t, composing: true, sections: SECTIONS });
		const card = m.one('[data-testid="quick-post-text"]');
		const drop = dropEvent([new File(['x'], 'dropped.png')]);
		card.dispatchEvent(drop);
		m.flush();
		expect(drop.defaultPrevented).toBe(true);
		expect(m.all('.fup-name').map((n) => n.textContent?.trim())).toEqual(['dropped.png']);
	});
});
