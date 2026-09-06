<script lang="ts">
	/**
	 * WHAT A DISCARDED TAB TAKES WITH IT, in a real browser.
	 *
	 * 0070's report is "Homework progress didn't save", and the shape of it is
	 * invisible to a type check and to a node test: `AssignmentEngine` autosaves
	 * on an 800ms debounce that every keystroke cancels and re-arms, so a whole
	 * sentence exists in one `$state` record and nowhere else until the student
	 * stops typing. Measured against this component before the mirror: sixty
	 * characters at 110ms a character, ZERO dispatches over 6694ms, ZERO bytes
	 * in `localStorage`.
	 *
	 * WHAT THE TRANSPORTS ARE. In-memory stand-ins with a switch for the case
	 * the defect actually needs: a write that is DISPATCHED AND NEVER SETTLES.
	 * That is not a contrivance -- it is the ordinary shape of this on a phone.
	 * Backgrounding fires `visibilitychange`, `SaveState` flushes, the request
	 * leaves, and then the page is frozen and the browser abandons it. A
	 * transport that answered `ok` there would be modelling the case that works.
	 *
	 * THE THREE COLUMNS ARE THE THREE ANSWERS. "Dispatched" is what the
	 * component decided to send; "acknowledged" is what a database would be
	 * left holding; "in this browser" is the mirror, which is the only one of
	 * the three that survives the tab.
	 *
	 * THE ORACLE IS NOT HERE. This page reports raw counts and raw storage; the
	 * judgements live in `tools/browser-verify/routes/assignment-mirror.mjs`,
	 * so the harness cannot satisfy an assertion by agreeing with itself.
	 * Nothing here measures geometry: `npm run verify:browser` does that.
	 */
	import AssignmentEngine from '$lib/classroom/AssignmentEngine.svelte';
	import {
		ASSIGNMENT_MIRROR_PREFIX,
		type AssignmentMirror
	} from '$lib/classroom/assignment-draft-mirror';
	import type {
		AssignmentEngineTransports,
		AssignmentSpec,
		ResponseRow,
		ResponseValue,
		StudentEngineData
	} from '$lib/classroom/assignment-spec';
	import type { ClassroomItem } from '$lib/classroom/classroom';

	let { data }: { data: { claims: { sub: string } } } = $props();

	const ITEM_ID = 'item-bridge-1';
	const BLOCK = 'b-why';

	const SPEC = {
		version: '1.1',
		kind: 'assignment',
		meta: { assignmentId: 'idea100-bridge-01', title: 'Bridge lab', totalPoints: 10 },
		modules: [
			{
				id: 'm1',
				title: 'Analysis',
				blocks: [
					{ type: 'instructions', content: 'Answer in two or three sentences.' },
					{ type: 'textField', id: BLOCK, prompt: 'What failed first, and why?' }
				]
			}
		]
	} as unknown as AssignmentSpec;

	const ITEM = {
		id: ITEM_ID,
		kind: 'assignment',
		title: 'Bridge lab writeup',
		attachments: []
	} as unknown as ClassroomItem;

	/** What the server holds. Empty is the state a lost write leaves it in. */
	let serverRows = $state<ResponseRow[]>([]);
	/** Bumped to remount the engine: a reload, without leaving the page. */
	let mountKey = $state(0);
	/** Does a dispatched write ever settle? */
	let hangWrites = $state(true);

	let dispatched = $state<{ blockId: string; text: string }[]>([]);
	let acknowledged = $state<{ blockId: string; text: string }[]>([]);

	const engineData: StudentEngineData = $derived({
		spec: SPEC,
		rubric: null,
		submission: null,
		responses: serverRows,
		files: [],
		approvals: []
	});

	function summarize(value: ResponseValue): string {
		return (value.text ?? '').slice(0, 60);
	}

	const transports = {
		async saveResponse(_itemId: string, blockId: string, value: ResponseValue) {
			dispatched = [...dispatched, { blockId, text: summarize(value) }];
			if (hangWrites) return new Promise<never>(() => {});
			acknowledged = [...acknowledged, { blockId, text: summarize(value) }];
			serverRows = [
				...serverRows.filter((r) => r.block_id !== blockId),
				{
					item_id: ITEM_ID,
					student_email: 'student@boscotech.net',
					block_id: blockId,
					value
				}
			];
			return { ok: true as const, data: { ok: true } };
		},
		async reloadStudent() {
			return { ok: true as const, data: engineData };
		},
		async submitAssignment() {
			return { ok: true as const, data: { ok: true } };
		},
		async unsubmitAssignment() {
			return { ok: true as const, data: { ok: true } };
		},
		async uploadSubmissionFile() {
			return { ok: false as const, message: 'Uploads are not part of this harness.' };
		},
		async deleteSubmissionFile() {
			return { ok: true as const, data: { ok: true } };
		},
		async setFileCaption() {
			return { ok: true as const, data: { ok: true } };
		}
	} as unknown as AssignmentEngineTransports;

	// ------------------------------------------------------------------
	// The storage read. Polled rather than derived: `localStorage` is not
	// reactive, and the whole point of this page is what is in it right now.
	// ------------------------------------------------------------------
	let slots = $state<{ key: string; text: string }[]>([]);

	function readSlots(): { key: string; text: string }[] {
		const out: { key: string; text: string }[] = [];
		try {
			for (let i = 0; i < localStorage.length; i++) {
				const key = localStorage.key(i);
				if (!key?.startsWith(ASSIGNMENT_MIRROR_PREFIX)) continue;
				const raw = localStorage.getItem(key);
				if (!raw) continue;
				try {
					const m = JSON.parse(raw) as AssignmentMirror;
					out.push({ key, text: m.values?.[BLOCK]?.text ?? '' });
				} catch {
					out.push({ key, text: '(unreadable)' });
				}
			}
		} catch {
			return out;
		}
		return out.sort((a, b) => a.key.localeCompare(b.key));
	}

	$effect(() => {
		const tick = setInterval(() => {
			slots = readSlots();
		}, 150);
		return () => clearInterval(tick);
	});

	/** Background the tab, the way a phone does when the student switches apps. */
	function hideTab() {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
		Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
	}

	/** Throw the page away and open it again, which is the whole question. */
	function reload() {
		mountKey += 1;
	}

	/** The student carried on somewhere else, and THAT answer reached the server. */
	function serverMovedOn() {
		serverRows = [
			{
				item_id: ITEM_ID,
				student_email: 'student@boscotech.net',
				block_id: BLOCK,
				value: { text: 'Written on the laptop, and saved.' }
			}
		];
	}

	function reset() {
		dispatched = [];
		acknowledged = [];
		serverRows = [];
		try {
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith(ASSIGNMENT_MIRROR_PREFIX)) localStorage.removeItem(key);
			}
		} catch {
			// Nothing to do, and the page still works without it.
		}
		mountKey += 1;
	}
</script>

<svelte:head><title>Assignment draft mirror</title></svelte:head>

<main class="harness cr-root">
	<h1>A discarded tab, and what it takes with it</h1>
	<p class="lede">
		The real <code>AssignmentEngine</code>. Type an answer, press
		<strong>Hide the tab</strong>, then <strong>Reload the page</strong>. The autosave debounce is
		800ms and every keystroke re-arms it, so nothing has been acknowledged: the answer comes back
		only if this browser kept a copy of it.
	</p>

	<div class="panel" data-testid="mirror-counters">
		<div class="counters">
			<span class="counter" data-testid="count-dispatched">dispatched {dispatched.length}</span>
			<span class="counter" data-testid="count-acknowledged">
				acknowledged {acknowledged.length}
			</span>
			<span class="counter" data-testid="count-slots">in this browser {slots.length}</span>
			<span class="counter" data-testid="count-viewer">viewer {data.claims.sub}</span>
		</div>
		<div class="controls">
			<label class="switch">
				<input type="checkbox" bind:checked={hangWrites} data-testid="hang-writes" />
				<span>Never settle a write (the request leaves, the frozen page abandons it)</span>
			</label>
			<button type="button" class="btn secondary tap-44" onclick={hideTab} data-testid="hide-tab">
				Hide the tab
			</button>
			<button type="button" class="btn secondary tap-44" onclick={reload} data-testid="reload-page">
				Reload the page
			</button>
			<button
				type="button"
				class="btn secondary tap-44"
				onclick={serverMovedOn}
				data-testid="server-moved"
			>
				A newer answer reached the server
			</button>
			<button type="button" class="btn secondary tap-44" onclick={reset} data-testid="reset-all">
				Reset
			</button>
		</div>
		<p class="server-state" data-testid="server-state">
			on the server: <span class="slot-text">{serverRows.find((r) => r.block_id === BLOCK)
				?.value.text ?? '(nothing)'}</span>
		</p>
		<ul class="slot-list" data-testid="slot-list">
			{#each slots as s (s.key)}
				<li class="slot"><code>{s.key}</code> <span class="slot-text">{s.text}</span></li>
			{/each}
		</ul>
		<p class="viewer-links">
			Two students, one machine:
			<a href="/dev/assignment-mirror?viewer=a">student-a</a> ·
			<a href="/dev/assignment-mirror?viewer=b">student-b</a>
		</p>
	</div>

	<div class="engine-box card" data-testid="engine-here">
		{#key `${mountKey}:${data.claims.sub}`}
			<AssignmentEngine item={ITEM} data={engineData} {transports} uploadEnabled={false} />
		{/key}
	</div>
</main>

<style>
	.harness {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-4) var(--space-3) var(--space-6);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	h1 {
		margin: 0;
		font-size: 1.3rem;
	}
	.lede {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
		max-width: var(--measure-reading, 46rem);
	}
	.panel {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		background: var(--bg1);
	}
	.counters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.counter {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.05em;
		color: var(--text-1);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.switch {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.82rem;
		color: var(--text-1);
		min-height: 44px;
	}
	.switch input {
		accent-color: var(--green);
	}
	.slot-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.slot {
		font-size: 0.78rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.slot-text {
		color: var(--text-2);
	}
	.server-state {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.viewer-links {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.engine-box {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		background: var(--bg1);
	}
</style>
