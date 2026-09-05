<script lang="ts">
	/**
	 * HOW MANY ROWS ONE COMPOSING SESSION WRITES, in a real browser.
	 *
	 * 0061's report is a COUNT -- "instead of just saving one draft it starts
	 * making infinite copies of that draft" -- and a count is the one thing the
	 * real classroom shell hides: it closes the composer on a successful save,
	 * so the presses that pile the copies up all happen on a form somebody has
	 * to reopen. This page mounts the REAL `ContentComposer` and leaves it
	 * open, so the writes are visible as a running list rather than inferred.
	 *
	 * WHAT THE TRANSPORTS ARE. In-memory stand-ins that record every call and
	 * hand back an item id, plus a switch for the case the defect actually
	 * needed: a create that COMMITS AND THEN FAILS. That is not a contrivance,
	 * it is the ordinary shape of this on a phone -- backgrounding a tab aborts
	 * the in-flight fetch, so the abort and the `visibilitychange` that used to
	 * re-issue the whole create are the same event.
	 *
	 * THE SERVER COLUMN IS THE ONE THAT MATTERS. "Calls" is what the component
	 * decided to do; "rows" is what a database would be left holding, which is
	 * what a teacher counts in their class stream.
	 *
	 * Nothing here measures geometry: `npm run verify:browser` does that, and
	 * its route module is `tools/browser-verify/routes/composer-draft.mjs`.
	 */
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import type { ClassroomComposerTransports, ClassroomSection } from '$lib/classroom/classroom';

	const SECTION: ClassroomSection = {
		id: 'sec-1',
		course_id: 'course-1',
		label: 'Block 3',
		block: '3',
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	};

	type Call = { n: number; what: 'create' | 'update'; itemId: string; title: string | null };

	let calls = $state<Call[]>([]);
	/** What a database would hold: one entry per create that actually committed. */
	let rows = $state<string[]>([]);
	/** Does a create commit and then report failure? The false-negative switch. */
	let loseTheResponse = $state(false);
	let seq = 0;

	const creates = $derived(calls.filter((c) => c.what === 'create').length);
	const updates = $derived(calls.filter((c) => c.what === 'update').length);

	const transports = {
		async createItem(
			_kind: string,
			_ids: string[],
			input: { title: string | null },
			_published: boolean
		) {
			seq += 1;
			const itemId = `item-${seq}`;
			// The row is written FIRST, exactly as the RPC commits before the
			// response is on the wire. That ordering is the whole point.
			rows = [...rows, itemId];
			calls = [...calls, { n: calls.length + 1, what: 'create', itemId, title: input.title }];
			if (loseTheResponse) {
				return { ok: false as const, message: 'Save failed. (the response was lost)' };
			}
			return { ok: true as const, data: { itemId } };
		},
		async updateItem(itemId: string, input: { title: string | null }, _published: boolean) {
			calls = [...calls, { n: calls.length + 1, what: 'update', itemId, title: input.title }];
			return { ok: true as const, data: { itemId } };
		},
		async loadCategorySuggestions() {
			return { ok: true as const, data: [] as string[] };
		}
	} as unknown as ClassroomComposerTransports;

	function reset() {
		calls = [];
		rows = [];
		seq = 0;
	}

	/**
	 * The durability net's trigger, driven by hand. A real tab switch is what
	 * fires this; the button is here so the check does not depend on the
	 * harness being able to background a window.
	 */
	function hideTab() {
		Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
		Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
		document.dispatchEvent(new Event('visibilitychange'));
	}
</script>

<svelte:head><title>Composer draft saves</title></svelte:head>

<main class="harness">
	<h1>One composing session, counted</h1>
	<p class="lede">
		The real <code>ContentComposer</code> in create mode, left open. Type a title, then press
		<strong>Save draft</strong> as many times as you like. One composing session must leave one row,
		however many presses it takes and however many times the tab is hidden.
	</p>

	<div class="panel" data-testid="draft-counters">
		<div class="counters">
			<span class="counter" data-testid="count-rows">rows {rows.length}</span>
			<span class="counter" data-testid="count-creates">creates {creates}</span>
			<span class="counter" data-testid="count-updates">updates {updates}</span>
		</div>
		<div class="controls">
			<label class="switch">
				<input type="checkbox" bind:checked={loseTheResponse} data-testid="lose-response" />
				<span>Lose the response (the row commits, the client is told it failed)</span>
			</label>
			<button type="button" class="btn secondary tap-44" onclick={hideTab} data-testid="hide-tab">
				Hide the tab
			</button>
			<button type="button" class="btn secondary tap-44" onclick={reset} data-testid="reset-counts">
				Reset counts
			</button>
		</div>
		<ol class="calls" data-testid="call-log">
			{#each calls as c (c.n)}
				<li><code>{c.what}</code> {c.itemId} &mdash; {c.title ?? '(no title)'}</li>
			{:else}
				<li class="none">Nothing written yet.</li>
			{/each}
		</ol>
	</div>

	<section class="card" data-testid="composer-here">
		<ContentComposer
			mode="create"
			kind="assignment"
			sections={[SECTION]}
			initialTargets={[SECTION.id]}
			{transports}
			onsaved={() => {}}
		/>
	</section>
</main>

<style>
	.harness {
		max-width: 72rem;
		margin: 0 auto;
		padding: var(--space-3) var(--space-3) var(--space-5);
	}
	h1 {
		font-family: var(--font-display);
		margin: 0 0 var(--space-2);
	}
	.lede {
		color: var(--text-2);
		max-width: var(--measure-reading, 42rem);
		margin: 0 0 var(--space-3);
	}
	.panel {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		margin-bottom: var(--space-3);
		background: var(--bg1);
	}
	.counters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.counter {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1);
		padding: 0.35rem 0.6rem;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-2);
	}
	.switch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.calls {
		margin: 0;
		padding-left: 1.4rem;
		font-size: 0.88rem;
		color: var(--text-2);
		max-height: 12rem;
		overflow-y: auto;
	}
	.calls .none {
		list-style: none;
		margin-left: -1.4rem;
		color: var(--text-3);
	}
	.card {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2);
		padding: var(--space-3);
		background: var(--bg1);
	}
</style>
