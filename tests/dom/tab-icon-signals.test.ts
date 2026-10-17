// tests/dom/tab-icon-signals.test.ts
//
// THE SIGNALS THE LIVE TAB ICON IS WIRED TO (ledger 0396), each on the real
// code that raises it, asserted in both directions: the status is raised while
// the thing is happening and is GONE once it ends. A status left raised after
// its raiser finished would paint a lamp or a hairline on every page until a
// reload, with nothing on the page to explain it, so every ending is driven.
//
//   - FeedbackPanel: an open note this side has not seen is unread, with the
//     count; the seen stamp, a resolved note and an unmount each end it.
//   - The deck upload's own XHR: the hairline follows the bytes, and a load, a
//     dropped connection, a timeout and a cancel each clear it.
//   - MatchDetail: a match in progress is live; a decided one raises nothing.
//
// The save state and the classroom file upload have their own files
// (`tab-icon-save-state.test.ts`, `tab-icon-upload-progress.test.ts`), and the
// certification unread count rides the root layout (`TabIcon.svelte`). The
// GAUNTLET room's live round is the MatchDetail pattern on a page that needs a
// session and a live room to mount, and is not driven here (the history entry
// says so).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import FeedbackPanel from '../../src/lib/classroom/feedback/FeedbackPanel.svelte';
import { FeedbackSession } from '../../src/lib/classroom/feedback/session.svelte';
import { createMemoryFeedback } from '../../src/lib/classroom/feedback/transports';
import type { FeedbackThread } from '../../src/lib/classroom/feedback/notes';
import { DeckUploadCancelled, postDeckZip } from '../../src/lib/classroom/deck-upload';
import MatchDetail from '../../src/lib/tournaments/MatchDetail.svelte';
import { buildSim, eventsFor, startNext } from '../../src/routes/dev/tournaments/sim';
import type { Tournament } from '../../src/lib/tournaments/tournaments';
import { clearAllTabStatuses, currentTabStatus } from '../../src/lib/tab-icon/live';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted[] = [];
beforeEach(() => clearAllTabStatuses());
afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
	clearAllTabStatuses();
});

/* ---- FeedbackPanel ------------------------------------------------------ */

const at = (min: number) => new Date(Date.parse('2026-10-14T17:00:00Z') + min * 60_000).toISOString();
const STUDENT = 'ana@boscotech.net';
const MANIFEST = { modules: [{ id: 'm1', title: 'Sketch', blocks: [{ id: 'b-why', field: 'why', prompt: 'Why?' }] }] };

function note(id: string, over: Partial<FeedbackThread> = {}): FeedbackThread {
	return {
		id,
		itemId: 'i1',
		itemTitle: 'Bracket',
		studentEmail: STUDENT,
		studentName: 'Ana Reyes',
		blockId: 'b-why',
		fileId: null,
		marks: null,
		authorName: 'Mr. Pina',
		createdAt: at(0),
		updatedAt: at(1),
		editedAt: null,
		fixedAt: null,
		resolvedAt: null,
		studentSeenAt: null,
		teacherSeenAt: at(1),
		viewer: 'teacher',
		sections: ['s1'],
		messages: [{ id: `${id}-m`, role: 'teacher', name: 'Mr. Pina', body: 'Say why.', createdAt: at(1), editedAt: null, mine: true }],
		...over
	};
}

async function studentPanel(seed: FeedbackThread[]) {
	const memory = createMemoryFeedback({ seed });
	const session = new FeedbackSession({ transports: memory.student(STUDENT), side: 'student', itemId: 'i1' });
	await session.refresh();
	const m = mountInto(FeedbackPanel as never, { session, manifest: MANIFEST });
	mounted.push(m);
	await m.settle();
	return { m, session, memory };
}

describe('FeedbackPanel: an unseen note lights the unread lamp', () => {
	it('two unseen open notes are unread 2; the seen stamp clears it', async () => {
		const { m, session, memory } = await studentPanel([note('t1'), note('t2', { blockId: null })]);
		expect(session.unseenCount).toBe(2);
		expect(currentTabStatus()).toEqual({ kind: 'unread', n: 2 });
		// The panel's own stamp fires after the list has been on screen.
		await new Promise((r) => setTimeout(r, 1400));
		m.flush();
		expect(memory.calls.filter((c) => c === 'student:seen').length).toBe(1);
		expect(session.unseenCount).toBe(0);
		expect(currentTabStatus().kind).toBe('none');
	});

	it('a resolved note is not counted, a seen one is not counted, and unmounting clears', async () => {
		const { m, session } = await studentPanel([
			note('open-unseen'),
			note('resolved-unseen', { resolvedAt: at(2), updatedAt: at(2) }),
			note('open-seen', { studentSeenAt: at(5) })
		]);
		// The session counts both unseen threads; the tab counts only the open one.
		expect(session.unseenCount).toBe(2);
		expect(currentTabStatus()).toEqual({ kind: 'unread', n: 1 });
		await m.stop();
		expect(currentTabStatus().kind).toBe('none');
	});

	it('a student with nothing unseen raises nothing (the negative control)', async () => {
		await studentPanel([note('seen', { studentSeenAt: at(5) })]);
		expect(currentTabStatus().kind).toBe('none');
	});
});

/* ---- The deck upload ---------------------------------------------------- */

class FakeXhr {
	static last: FakeXhr | null = null;
	upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
		onprogress: null
	};
	onerror: (() => void) | null = null;
	ontimeout: (() => void) | null = null;
	onload: (() => void) | null = null;
	timeout = 0;
	status = 0;
	responseText = '';
	aborted = false;
	constructor() {
		FakeXhr.last = this;
	}
	open() {}
	send() {}
	abort() {
		this.aborted = true;
	}
}

describe('the deck upload drives the progress hairline', () => {
	const realXhr = globalThis.XMLHttpRequest;
	beforeEach(() => {
		(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
	});
	afterEach(() => {
		(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = realXhr;
	});

	const post = (signal?: AbortSignal) => postDeckZip({ form: new FormData(), total: 100, url: '/x', signal });

	it('raises at 0, follows the bytes, and clears on load (a refusal resolves and clears too)', async () => {
		const done = post();
		const xhr = FakeXhr.last as FakeXhr;
		expect(currentTabStatus()).toEqual({ kind: 'progress', p: 0 });
		xhr.upload.onprogress?.({ lengthComputable: true, loaded: 25, total: 100 });
		expect(currentTabStatus()).toEqual({ kind: 'progress', p: 0.25 });
		xhr.upload.onprogress?.({ lengthComputable: false, loaded: 90, total: 0 });
		expect(currentTabStatus()).toEqual({ kind: 'progress', p: 0.25 });
		xhr.status = 422;
		xhr.responseText = '{"error":"no index.html","code":"no_entry"}';
		xhr.onload?.();
		const answer = await done;
		expect(answer.ok).toBe(false);
		expect(currentTabStatus().kind).toBe('none');
	});

	it('a dropped connection, a timeout and a cancel each clear', async () => {
		const a = post();
		(FakeXhr.last as FakeXhr).onerror?.();
		await expect(a).rejects.toThrow(/connection dropped/);
		expect(currentTabStatus().kind).toBe('none');

		const b = post();
		expect(currentTabStatus().kind).toBe('progress');
		(FakeXhr.last as FakeXhr).ontimeout?.();
		await expect(b).rejects.toThrow(/did not finish/);
		expect(currentTabStatus().kind).toBe('none');

		const ctl = new AbortController();
		const c = post(ctl.signal);
		expect(currentTabStatus().kind).toBe('progress');
		ctl.abort();
		await expect(c).rejects.toBeInstanceOf(DeckUploadCancelled);
		expect((FakeXhr.last as FakeXhr).aborted).toBe(true);
		expect(currentTabStatus().kind).toBe('none');
	});
});

/* ---- MatchDetail -------------------------------------------------------- */

function tournamentOf(status: Tournament['status']): Tournament {
	return {
		id: 'sim',
		name: 'Harness Invitational',
		description: '',
		config: {},
		status,
		champion_entry_id: null,
		created_by: null,
		created_at: at(0),
		updated_at: at(0)
	} as Tournament;
}

describe('MatchDetail: a match in progress is live', () => {
	it('live while the match is in progress, nothing for a decided one, and unmounting clears', async () => {
		const sim = buildSim(8);
		expect(startNext(sim)).toBe(true);
		const running = sim.matches.find((m) => m.status === 'in_progress');
		expect(running, 'the sim started a match').toBeTruthy();
		const props = (match: typeof running) => ({
			tournament: tournamentOf('live'),
			kind: 'bracket',
			match,
			entries: sim.entries,
			styles: Object.values(sim.styles),
			events: eventsFor(sim, match!.id),
			games: sim.games.filter((g) => g.bracket_match_id === match!.id),
			siblings: sim.matches,
			ledger: [],
			members: sim.members
		});
		const live = mountInto(MatchDetail as never, props(running));
		mounted.push(live);
		live.flush();
		expect(currentTabStatus().kind).toBe('live');
		await live.stop();
		expect(currentTabStatus().kind).toBe('none');

		// The negative control: the same component on a match not in progress.
		const idle = sim.matches.find((m) => m.status !== 'in_progress');
		const quiet = mountInto(MatchDetail as never, props(idle));
		mounted.push(quiet);
		quiet.flush();
		expect(currentTabStatus().kind).toBe('none');
	});
});
