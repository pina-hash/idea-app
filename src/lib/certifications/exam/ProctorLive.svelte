<script lang="ts">
	/**
	 * THE PROCTOR'S LIVE VIEW (ledger 0391, docs/CERTIFICATIONS.md "Sittings":
	 * "run a live sitting: release each student, watch focus flags live, and
	 * see results"). One card per exam released today or in progress, read off
	 * `cert_exam_live` rows the PAGE polls (`startExamLivePoller` in
	 * `./live-poll.ts`, five seconds, on `startPoller`) and hands down as
	 * `rows`. This component asks the database nothing itself.
	 *
	 * WHAT A CARD SAYS, IN WORDS BESIDE EVERY TONE: the student's name, the
	 * certification, the state as a readout with a tone, "Question 4 of 20",
	 * the time remaining, the flag count as a readout (bad tone when above
	 * zero) and the flag list (kind and time) in a Disclosure, closed. An
	 * in-progress exam carries an End exam key, two-step (arm, then confirm)
	 * because it submits the student's answers as they stand; it is offered only
	 * while `onend` was handed in. An expired release carries Release again
	 * only while `onrelease` was handed in. Absence is the mechanism.
	 *
	 * The clock is a `setTimeout` chain on the injected `now`, so the remaining
	 * time moves between polls without a second request.
	 */
	import { onMount } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import Pending from '$lib/Pending.svelte';
	import { formatCertTime } from '../status';
	import type { ExamLiveRow } from '../types';
	import { EXAM_END_REASON, EXAM_STATE_WORDS, FLAG_WORDS, formatRemaining, questionCounter } from './exam-client';

	let {
		rows,
		onrelease = null,
		onend = null,
		loading = false,
		failed = false,
		now = () => new Date(),
		tickMs = 1000
	}: {
		rows: ExamLiveRow[];
		/** Release the exam again for an expired release, by exam id. Absent: no key. */
		onrelease?: ((examId: string) => void | Promise<void>) | null;
		/** End an in-progress exam from the proctor's side, by exam id with the reason in words. Absent: no key. */
		onend?: ((examId: string, reason: string) => void | Promise<void>) | null;
		loading?: boolean;
		/** The last read failed; the rows shown may be stale. */
		failed?: boolean;
		now?: () => Date;
		tickMs?: number;
	} = $props();

	let clock = $state<Date>(new Date(0));
	let armed = $state<string | null>(null);
	let busy = $state<string | null>(null);

	onMount(() => {
		let handle: ReturnType<typeof setTimeout> | null = null;
		const beat = () => {
			clock = now();
			handle = setTimeout(beat, tickMs);
		};
		beat();
		return () => {
			if (handle !== null) clearTimeout(handle);
		};
	});

	const live = $derived(clock.getTime() === 0 ? now() : clock);

	function studentWords(row: ExamLiveRow): string {
		return row.student.name ?? row.student.email ?? 'Unnamed student';
	}

	function stateOf(row: ExamLiveRow): { word: string; tone: 'ok' | 'warn' | 'bad' | 'info' } {
		if (row.state === 'submitted') {
			if (row.passed === true) return { word: 'Passed', tone: 'ok' };
			if (row.passed === false) return { word: 'Not passed', tone: 'bad' };
		}
		return EXAM_STATE_WORDS[row.state] ?? { word: row.state, tone: 'info' };
	}

	async function end(row: ExamLiveRow) {
		if (!onend || busy) return;
		busy = row.exam_id;
		try {
			await onend(row.exam_id, EXAM_END_REASON);
		} finally {
			busy = null;
			armed = null;
		}
	}

	async function release(row: ExamLiveRow) {
		if (!onrelease || busy) return;
		busy = row.exam_id;
		try {
			await onrelease(row.exam_id);
		} finally {
			busy = null;
		}
	}
</script>

<section class="pl" data-testid="cert-live" data-count={rows.length}>
	<header class="pl-head">
		<h2 class="cert-section-h">Live exams</h2>
		{#if loading}<Pending label="Checking the room" variant="inline" />{/if}
		{#if failed}
			<p class="cert-readout is-warn" data-testid="cert-live-stale"><span aria-hidden="true">!</span><span>Last read failed; this may be stale</span></p>
		{/if}
	</header>
	{#if rows.length === 0}
		<p class="cert-help pl-empty" data-testid="cert-live-empty">No exams released today. A release shows here the moment it is pressed.</p>
	{:else}
		<ul class="pl-list">
			{#each rows as row (row.exam_id)}
				{@const st = stateOf(row)}
				<li class="cert-panel pl-card" data-testid="cert-live-row" data-state={row.state} data-flags={row.flags.length}>
					<div class="pl-top">
						<div class="pl-who">
							<h3 class="pl-name">{studentWords(row)}</h3>
							<p class="pl-cert">{row.certification.code} {row.certification.name}</p>
						</div>
						<p class="cert-readout is-{st.tone} pl-state" data-testid="cert-live-state">
							<span aria-hidden="true">{st.tone === 'ok' ? '✓' : st.tone === 'bad' ? '✕' : st.tone === 'warn' ? '!' : '•'}</span>
							<span>{st.word}</span>
						</p>
					</div>
					<div class="cert-readouts pl-facts">
						{#if row.state === 'in_progress'}
							<span class="cert-readout" data-testid="cert-live-counter">{questionCounter(Math.min(row.current_index, Math.max(0, row.total - 1)), row.total)}</span>
							<span class="cert-readout" data-testid="cert-live-remaining"><span aria-hidden="true">⏱</span><span>{formatRemaining(row.deadline, live)} left</span></span>
						{:else if row.state === 'released'}
							<span class="cert-readout" data-testid="cert-live-remaining"><span aria-hidden="true">⏱</span><span>Release ends in {formatRemaining(row.release_expires_at, live)}</span></span>
						{:else if row.state === 'submitted' && row.submitted_at}
							<span class="cert-readout">Submitted {formatCertTime(row.submitted_at)}</span>
						{/if}
						<span class="cert-readout" class:is-bad={row.flags.length > 0} data-testid="cert-live-flag-count">
							{#if row.flags.length > 0}<span aria-hidden="true">⚑</span>{/if}
							<span>{row.flags.length === 0 ? 'No flags' : `${row.flags.length} flag${row.flags.length === 1 ? '' : 's'}`}</span>
						</span>
					</div>
					{#if row.flags.length > 0}
						<Disclosure label="Flags" collapseWhen={true} testId="cert-live-flags-{row.exam_id}">
							<ol class="cert-well pl-flags" data-testid="cert-live-flags">
								{#each row.flags as f, i (i)}
									<li class="pl-flag"><span class="pl-flag-kind">{FLAG_WORDS[f.kind] ?? f.kind}</span><span class="pl-flag-at">{formatCertTime(f.at)}</span></li>
								{/each}
							</ol>
						</Disclosure>
					{/if}
					{#if row.state === 'in_progress' && onend}
						<div class="cert-actions pl-actions">
							{#if armed === row.exam_id}
								<span class="cert-help">End {studentWords(row)}'s exam now? Their answers so far are submitted as they stand.</span>
								<button type="button" class="btn cert-btn danger" aria-disabled={busy === row.exam_id} onclick={() => end(row)} data-testid="cert-live-end-confirm">End exam now</button>
								<button type="button" class="btn cert-btn secondary" onclick={() => (armed = null)} data-testid="cert-live-end-cancel">Keep going</button>
							{:else}
								<button type="button" class="btn cert-btn secondary" onclick={() => (armed = row.exam_id)} data-testid="cert-live-end">End exam</button>
							{/if}
						</div>
					{:else if row.state === 'expired' && onrelease}
						<div class="cert-actions pl-actions">
							<button type="button" class="btn cert-btn" aria-disabled={busy === row.exam_id} onclick={() => release(row)} data-testid="cert-live-release">Release again</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.pl-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		margin: 0 0 0.75rem;
	}
	.pl-head h2 {
		margin: 0;
	}
	.pl-empty {
		margin: 0;
	}
	.pl-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 1rem;
		grid-template-columns: repeat(auto-fill, minmax(min(22rem, 100%), 1fr));
	}
	.pl-card {
		margin: 0;
		display: grid;
		gap: 0.6rem;
		align-content: start;
	}
	.pl-top {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.35rem 0.75rem;
	}
	.pl-name {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-1);
	}
	.pl-cert {
		margin: 0.15rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.pl-state {
		font-size: 0.8rem;
	}
	.pl-flags {
		margin: 0.5rem 0 0;
	}
	.pl-flag {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		min-height: 2rem;
		align-items: center;
		padding: 0.3rem 0;
		font-size: 0.9rem;
	}
	.pl-flag-at {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2);
	}
	.pl-actions {
		margin-top: 0.25rem;
	}
	.pl-actions .btn[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
