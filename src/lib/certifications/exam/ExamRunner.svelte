<script lang="ts">
	/**
	 * THE EXAM RUNTIME (ledger 0391, docs/CERTIFICATIONS.md "The exam"). A
	 * student's whole exam in one component: the lobby, one question at a time
	 * with no way back, the result, and the expired release.
	 *
	 * EVERYTHING IT KNOWS IT WAS TOLD BY THE TRANSPORT, which is a prop. The
	 * route hands it `examTransportFrom(supabase.rpc)`; the harness and the
	 * tests hand it an in-memory one. The draw is stored server-side and each
	 * question arrives alone (`ExamQuestionView`, no answer field anywhere), so
	 * this file could not hold an answer key if it tried.
	 *
	 * NO BACK CONTROL EXISTS. There is one Next key and no second control
	 * that moves the index; `tests/dom/cert-exam-runner.test.ts` counts both.
	 * The server refuses an out-of-order answer anyway (`reason: "out_of_order"`),
	 * and this file answers that refusal by re-opening the exam, which resumes
	 * at the server's own current question.
	 *
	 * FULL SCREEN THE AppStage WAY: the class goes on FIRST and the Fullscreen
	 * API is asked second, inside the SAME press, so a browser that refuses
	 * (iOS has no element full screen; every engine refuses without a gesture)
	 * still lands in the same fixed layout. Leaving full screen is FLAGGED,
	 * never blocked: the proctor decides what a flag means. Nothing on any path
	 * here uses requestAnimationFrame.
	 *
	 * THE LOCKDOWN IS `attachLockdown` WHILE A QUESTION IS UP: tab, focus, full
	 * screen and window flags go to `transport.flag` with their kind, copy,
	 * paste, the context menu and selection are prevented, and the root carries
	 * `user-select: none`. A flag never blocks the student.
	 *
	 * THE CLOCK IS A `setTimeout` CHAIN reading the injected `now`, and when the
	 * deadline passes the exam submits itself once. The deploy reload is held
	 * while the exam is open.
	 *
	 * THE RESULT NAMES TOPICS, NEVER QUESTIONS. A fail lists the missed TOPICS
	 * and the cooldown's date (`COOLDOWN_SENTENCE`, `formatCertDate`: a date,
	 * never a weekday); a pass is a plain Passed panel. No question text and no
	 * option text survives into either, and the dom test holds that against the
	 * question state as its positive control.
	 *
	 * `initial` IS A HARNESS SHORTCUT: `/dev/cert-exam` shows the question, the
	 * failed, the passed and the expired states without a click. The real route
	 * passes nothing and every student starts in the lobby.
	 */
	import { onMount, untrack } from 'svelte';
	import Pending from '$lib/Pending.svelte';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import { COOLDOWN_SENTENCE, EXAM_LOCKDOWN_SENTENCE, EXAM_RELEASE_WAITING_SENTENCE } from '../copy';
	import { formatCertDate } from '../status';
	import type { ExamAnswer, ExamFlagKind, ExamQuestionView, ExamStudentResult } from '../types';
	import {
		answerIsComplete,
		deadlinePassed,
		EXAM_ANSWER_TO_GO_ON,
		EXAM_BEGIN_WORD,
		EXAM_EXPIRED_SENTENCE,
		EXAM_FAILED_SENTENCE,
		EXAM_FAILED_WORD,
		EXAM_NEXT_WORD,
		EXAM_NO_BACK_SENTENCE,
		EXAM_OPENING_LABEL,
		EXAM_PASSED_SENTENCE,
		EXAM_PASSED_WORD,
		EXAM_SUBMIT_WORD,
		EXAM_SUBMITTING_LABEL,
		EXAM_TIME_UP_SENTENCE,
		formatRemaining,
		parseNumericInput,
		parseShortInput,
		questionCounter,
		readAnswer,
		readOpen,
		readSubmit,
		type ExamTransport
	} from './exam-client';
	import { attachLockdown } from './lockdown';

	export type ExamInitial =
		| { kind: 'lobby' }
		| { kind: 'open' }
		| { kind: 'result'; result: ExamStudentResult }
		| { kind: 'expired' };

	let {
		examId,
		transport,
		now = () => new Date(),
		initial = null,
		fullscreen = true,
		topicNames = null,
		backHref = null,
		backLabel = 'Back to the certification',
		tickMs = 1000
	}: {
		examId: string;
		transport: ExamTransport;
		now?: () => Date;
		/** A harness's starting state. The route passes nothing. */
		initial?: ExamInitial | null;
		/** Ask the Fullscreen API on Begin. A stacked harness passes false. */
		fullscreen?: boolean;
		/** Topic id to the words a student reads; an id with no entry is shown as is. */
		topicNames?: Record<string, string> | null;
		/** Where the result and the expired states lead back to. */
		backHref?: string | null;
		backLabel?: string;
		tickMs?: number;
	} = $props();

	type Phase = 'lobby' | 'opening' | 'question' | 'submitting' | 'result' | 'expired';

	let phase = $state<Phase>('lobby');
	let question = $state<ExamQuestionView | null>(null);
	let total = $state(0);
	let deadline = $state<string | null>(null);
	let result = $state<ExamStudentResult | null>(null);
	let notice = $state<string | null>(null);
	let timeUp = $state(false);
	let remaining = $state('');
	let sending = $state(false);
	let flagsSent = $state(0);
	let full = $state(false);
	let native = $state(false);
	let root = $state<HTMLElement | null>(null);

	/* One draft per question type; `resetDraft` clears all three on every new question. */
	let choice = $state<string | null>(null);
	let multi = $state<string[]>([]);
	let text = $state('');

	const locked = $derived(phase === 'question' || phase === 'submitting');
	const isLast = $derived(!!question && question.index >= total - 1);

	const currentAnswer = $derived.by((): ExamAnswer => {
		if (!question) return null;
		switch (question.type) {
			case 'multiple_choice':
				return choice;
			case 'multiple_select':
				return multi;
			case 'numeric':
				return parseNumericInput(text);
			case 'short':
				return parseShortInput(text);
		}
	});
	const complete = $derived(!!question && answerIsComplete(question.type, currentAnswer));

	function resetDraft() {
		choice = null;
		multi = [];
		text = '';
	}

	function topicWords(id: string): string {
		return topicNames?.[id] ?? id;
	}

	/* ---------------------------------------------------------------------- */
	/* Full screen: class first, API as the upgrade.                           */
	/* ---------------------------------------------------------------------- */

	function enterFull() {
		full = true;
		native = false;
		if (!fullscreen) return;
		const el = root;
		if (!el || typeof el.requestFullscreen !== 'function') return;
		el.requestFullscreen().then(
			() => {
				native = true;
			},
			() => {
				native = false;
			}
		);
	}

	function leaveFull() {
		full = false;
		native = false;
		if (typeof document !== 'undefined' && document.fullscreenElement) {
			void document.exitFullscreen().catch(() => {});
		}
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		const onChange = () => {
			if (native && !document.fullscreenElement) native = false;
		};
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	});

	/* ---------------------------------------------------------------------- */
	/* The transport                                                           */
	/* ---------------------------------------------------------------------- */

	function showQuestion(q: ExamQuestionView, t: number, d: string | null) {
		question = q;
		total = t;
		if (d) deadline = d;
		resetDraft();
		phase = 'question';
	}

	function showResult(r: ExamStudentResult) {
		result = r;
		question = null;
		phase = 'result';
		leaveFull();
	}

	async function open() {
		phase = 'opening';
		notice = null;
		const reading = readOpen(await transport.open(examId));
		if (reading.kind === 'question') {
			showQuestion(reading.question, reading.exam.total, reading.exam.deadline || reading.question.deadline || null);
		} else if (reading.kind === 'done') {
			deadline = reading.exam.deadline || deadline;
			total = reading.exam.total;
			await submit();
		} else if (reading.kind === 'result') {
			showResult(reading.result);
		} else if (reading.kind === 'expired') {
			phase = 'expired';
			leaveFull();
		} else {
			notice = reading.message;
			phase = 'lobby';
			leaveFull();
		}
	}

	function begin() {
		if (phase !== 'lobby') return;
		// Both halves inside the one press, so the request carries its gesture.
		enterFull();
		void open();
	}

	async function next() {
		if (!question || !complete || sending) return;
		sending = true;
		const index = question.index;
		const reading = readAnswer(await transport.answer(examId, index, currentAnswer));
		sending = false;
		if (reading.kind === 'question') showQuestion(reading.question, total, reading.question.deadline || null);
		else if (reading.kind === 'done') await submit();
		else if (reading.kind === 'result') showResult(reading.result);
		else if (reading.reason === 'out_of_order') await open();
		else notice = reading.message;
	}

	let submitted = false;
	async function submit() {
		if (submitted) return;
		submitted = true;
		phase = 'submitting';
		const reading = readSubmit(await transport.submit(examId));
		if (reading.kind === 'result') showResult(reading.result);
		else {
			submitted = false;
			notice = reading.message;
			phase = question ? 'question' : 'lobby';
		}
	}

	function flag(kind: ExamFlagKind) {
		flagsSent++;
		try {
			void Promise.resolve(transport.flag(examId, kind)).catch(() => {});
		} catch {
			// A flag that could not be sent never reaches the student.
		}
	}

	/* ---------------------------------------------------------------------- */
	/* Lockdown, the clock and the deploy hold, each keyed on the phase.       */
	/* ---------------------------------------------------------------------- */

	$effect(() => {
		if (!locked) return;
		const el = root;
		if (!el) return;
		return untrack(() => attachLockdown(el, flag));
	});

	$effect(() => {
		if (phase === 'lobby' || phase === 'result' || phase === 'expired') return;
		const release = holdDeployReload('an exam is open');
		return release;
	});

	$effect(() => {
		if (phase !== 'question' && phase !== 'submitting') return;
		let handle: ReturnType<typeof setTimeout> | null = null;
		const beat = () => {
			handle = null;
			const t = now();
			remaining = formatRemaining(deadline, t);
			if (phase === 'question' && deadlinePassed(deadline, t)) {
				timeUp = true;
				void submit();
				return;
			}
			handle = setTimeout(beat, tickMs);
		};
		untrack(beat);
		return () => {
			if (handle !== null) clearTimeout(handle);
		};
	});

	onMount(() => {
		const init = initial;
		if (!init || init.kind === 'lobby') return;
		if (init.kind === 'open') void open();
		else if (init.kind === 'result') showResult(init.result);
		else if (init.kind === 'expired') phase = 'expired';
	});

	function toggleMulti(key: string, on: boolean) {
		multi = on ? [...new Set([...multi, key])] : multi.filter((k) => k !== key);
	}
</script>

<div
	class="exam-root"
	class:is-full={full}
	class:is-native={native}
	class:is-locked={locked}
	bind:this={root}
	data-testid="cert-exam-runner"
	data-phase={phase}
	data-flags={flagsSent}
>
	<div class="exam-measure">
		{#if phase === 'lobby' || phase === 'opening'}
			<section class="cert-panel exam-lobby" data-testid="cert-exam-lobby">
				<h2>Your exam</h2>
				<p class="exam-lead" data-testid="cert-exam-waiting">{EXAM_RELEASE_WAITING_SENTENCE}</p>
				<p class="exam-lead" data-testid="cert-exam-lockdown-words">{EXAM_LOCKDOWN_SENTENCE}</p>
				{#if notice}
					<div class="cert-notice cert-notice-bad" role="alert" data-testid="cert-exam-notice">
						<span class="cert-notice-glyph" aria-hidden="true">!</span>
						<div>{notice}</div>
					</div>
				{/if}
				<div class="cert-actions">
					<button
						type="button"
						class="btn cert-btn exam-begin"
						aria-disabled={phase === 'opening'}
						onclick={begin}
						data-testid="cert-exam-begin">{EXAM_BEGIN_WORD}</button
					>
					{#if phase === 'opening'}
						<Pending label={EXAM_OPENING_LABEL} variant="inline" />
					{/if}
				</div>
			</section>
		{:else if phase === 'question' && question}
			<section class="cert-panel exam-q" data-testid="cert-exam-question" aria-labelledby="exam-prompt">
				<header class="exam-q-head">
					<p class="exam-counter" data-testid="cert-exam-counter">{questionCounter(question.index, total)}</p>
					<p class="cert-readout exam-clock" data-testid="cert-exam-remaining">
						<span aria-hidden="true">⏱</span>
						<span>{remaining} left</span>
					</p>
				</header>
				<h2 class="exam-prompt" id="exam-prompt" data-testid="cert-exam-prompt">{question.prompt}</h2>
				{#if question.type === 'multiple_choice' && question.options}
					<fieldset class="exam-options" data-testid="cert-exam-options">
						<legend class="exam-legend">Pick one</legend>
						{#each question.options as o (o.key)}
							<label class="exam-option" class:is-picked={choice === o.key} data-testid="cert-exam-option">
								<input type="radio" name="exam-choice-{question.index}" value={o.key} checked={choice === o.key} onchange={() => (choice = o.key)} />
								<span class="exam-option-key" aria-hidden="true">{o.key.toUpperCase()}</span>
								<span class="exam-option-text">{o.text}</span>
							</label>
						{/each}
					</fieldset>
				{:else if question.type === 'multiple_select' && question.options}
					<fieldset class="exam-options" data-testid="cert-exam-options">
						<legend class="exam-legend">Pick every answer that applies</legend>
						{#each question.options as o (o.key)}
							<label class="exam-option" class:is-picked={multi.includes(o.key)} data-testid="cert-exam-option">
								<input type="checkbox" value={o.key} checked={multi.includes(o.key)} onchange={(e) => toggleMulti(o.key, (e.currentTarget as HTMLInputElement).checked)} />
								<span class="exam-option-key" aria-hidden="true">{o.key.toUpperCase()}</span>
								<span class="exam-option-text">{o.text}</span>
							</label>
						{/each}
					</fieldset>
				{:else if question.type === 'numeric'}
					<label class="cert-field exam-field" data-testid="cert-exam-numeric">
						<span>Your answer{question.unit ? `, in ${question.unit}` : ''}</span>
						<span class="exam-input-row">
							<input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" bind:value={text} />
							{#if question.unit}<span class="exam-unit">{question.unit}</span>{/if}
						</span>
					</label>
				{:else}
					<label class="cert-field exam-field" data-testid="cert-exam-short">
						<span>Your answer</span>
						<input type="text" autocomplete="off" spellcheck="false" bind:value={text} />
					</label>
				{/if}
				{#if notice}
					<div class="cert-notice cert-notice-bad" role="alert" data-testid="cert-exam-notice">
						<span class="cert-notice-glyph" aria-hidden="true">!</span>
						<div>{notice}</div>
					</div>
				{/if}
				<div class="cert-actions exam-nav">
					<button
						type="button"
						class="btn cert-btn exam-next"
						aria-disabled={!complete || sending}
						onclick={next}
						data-testid="cert-exam-next">{isLast ? EXAM_SUBMIT_WORD : EXAM_NEXT_WORD}</button
					>
					<span class="cert-help exam-nav-note" data-testid="cert-exam-nav-note">{complete ? EXAM_NO_BACK_SENTENCE : EXAM_ANSWER_TO_GO_ON}</span>
				</div>
			</section>
		{:else if phase === 'submitting'}
			<section class="cert-panel" data-testid="cert-exam-submitting">
				{#if timeUp}<p class="exam-lead">{EXAM_TIME_UP_SENTENCE}</p>{/if}
				<Pending label={EXAM_SUBMITTING_LABEL} />
			</section>
		{:else if phase === 'result' && result}
			{#if result.passed}
				<section class="cert-panel exam-result is-passed" data-testid="cert-exam-passed">
					<p class="cert-readout is-ok exam-verdict"><span aria-hidden="true">✓</span><span>{EXAM_PASSED_WORD}</span></p>
					<h2 class="exam-result-h">{EXAM_PASSED_WORD}</h2>
					<p class="exam-lead">{EXAM_PASSED_SENTENCE}</p>
					<p class="exam-score" data-testid="cert-exam-score">{result.correct} of {result.total} correct.</p>
				</section>
			{:else}
				<section class="cert-panel exam-result is-failed" data-testid="cert-exam-failed">
					<p class="cert-readout is-bad exam-verdict"><span aria-hidden="true">✕</span><span>{EXAM_FAILED_WORD}</span></p>
					<h2 class="exam-result-h">{EXAM_FAILED_WORD}</h2>
					{#if timeUp}<p class="exam-lead">{EXAM_TIME_UP_SENTENCE}</p>{/if}
					<p class="exam-lead" data-testid="cert-exam-score">{EXAM_FAILED_SENTENCE(result.correct, result.total)}</p>
					{#if result.missed_topics.length}
						<h3 class="cert-section-h">Topics to review</h3>
						<ul class="cert-well exam-topics" data-testid="cert-exam-topics">
							{#each result.missed_topics as topic (topic)}
								<li class="exam-topic">{topicWords(topic)}</li>
							{/each}
						</ul>
					{/if}
					{#if result.cooldown_until}
						<p class="exam-lead" data-testid="cert-exam-cooldown">{COOLDOWN_SENTENCE(formatCertDate(result.cooldown_until))}</p>
					{/if}
				</section>
			{/if}
			{#if backHref}
				<div class="cert-actions"><a class="btn cert-btn secondary" href={backHref} data-testid="cert-exam-back-link">{backLabel}</a></div>
			{/if}
		{:else if phase === 'expired'}
			<section class="cert-panel exam-expired" data-testid="cert-exam-expired">
				<p class="cert-readout is-warn exam-verdict"><span aria-hidden="true">!</span><span>Release expired</span></p>
				<h2 class="exam-result-h">Not open</h2>
				<p class="exam-lead" data-testid="cert-exam-expired-words">{EXAM_EXPIRED_SENTENCE}</p>
			</section>
			{#if backHref}
				<div class="cert-actions"><a class="btn cert-btn secondary" href={backHref} data-testid="cert-exam-back-link">{backLabel}</a></div>
			{/if}
		{/if}
	</div>
</div>

<style>
	.exam-root {
		color: var(--text-1);
	}
	/* THE OVERLAY IS THE FLOOR, NATIVE IS THE UPGRADE: the same fixed box
	   whether or not the API said yes. Under the overlay path a sticky portal
	   header (z-index 2, a sibling of `main`) can still paint over the top of
	   this box, which sits inside `main`'s own stacking context, so the content
	   starts below the bar's height; in native full screen the root is in the
	   top layer and the bar is not on screen. */
	.exam-root.is-full {
		position: fixed;
		inset: 0;
		z-index: 50;
		overflow: auto;
		background: var(--surface-0, var(--bg0));
		padding: 1.25rem var(--cert-gutter, 1rem) 3rem;
	}
	.exam-root.is-full:not(.is-native) {
		padding-top: calc(var(--cert-bar-h, 4.25rem) + 1rem);
	}
	.exam-root.is-locked {
		user-select: none;
		-webkit-user-select: none;
	}
	.exam-measure {
		max-width: var(--measure-reading, 46rem);
		margin: 0 auto;
	}
	.exam-lead {
		line-height: 1.5;
		margin: 0 0 0.85rem;
	}
	.exam-q-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		margin: 0 0 0.75rem;
	}
	.exam-counter {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.exam-clock {
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.exam-prompt {
		font-family: var(--font-display);
		font-size: clamp(1.15rem, 1.1vw + 0.9rem, 1.5rem);
		font-weight: 700;
		line-height: 1.3;
		margin: 0 0 1rem;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-1);
	}
	.exam-options {
		display: grid;
		gap: 0.5rem;
		margin: 0 0 1rem;
		padding: 0;
		border: 0;
		min-width: 0;
	}
	.exam-legend {
		font-family: var(--font-mono);
		font-size: 0.76rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
		margin: 0 0 0.35rem;
		padding: 0;
	}
	/* AN OPTION ROW IS THE TAP TARGET: the whole label, 44px and up. A picked
	   row shows the native control's own mark AND a lit edge, so the pick is
	   never color alone. */
	.exam-option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 44px;
		padding: 0.55rem 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 4px);
		background: var(--surface-1, var(--bg1));
		cursor: pointer;
		line-height: 1.35;
	}
	.exam-option.is-picked {
		border-color: var(--green);
		box-shadow: inset 0 0 0 1px var(--green);
	}
	.exam-option input {
		width: 1.25rem;
		height: 1.25rem;
		margin: 0;
		flex: 0 0 auto;
		accent-color: var(--green);
	}
	.exam-option-key {
		flex: 0 0 auto;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.exam-option-text {
		color: var(--text-1);
	}
	.exam-field {
		margin-bottom: 1rem;
	}
	.exam-input-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.exam-input-row input {
		flex: 1 1 auto;
		min-width: 0;
	}
	.exam-unit {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.exam-nav {
		align-items: center;
	}
	.exam-nav-note {
		font-size: 0.86rem;
	}
	.exam-begin,
	.exam-next {
		min-width: 11rem;
	}
	.exam-begin[aria-disabled='true'],
	.exam-next[aria-disabled='true'] {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.exam-verdict {
		font-size: 0.9rem;
		margin: 0 0 0.5rem;
	}
	.exam-result-h {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 2vw + 0.8rem, 2.2rem);
		font-weight: 700;
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-1);
		margin: 0 0 0.6rem;
	}
	.exam-score {
		font-family: var(--font-mono);
		color: var(--text-2);
		margin: 0;
	}
	.exam-topics {
		padding: 0.15rem 0.75rem;
	}
	.exam-topic {
		min-height: 44px;
		display: flex;
		align-items: center;
		padding: 0.5rem 0;
	}
</style>
