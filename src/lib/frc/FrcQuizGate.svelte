<script lang="ts">
	import { onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	/**
	 * Knowledge-gate quiz flow for a unit. Talks to a server endpoint that is the
	 * sole authority: Start serves stems + shuffled options (NO answer key),
	 * Submit is graded server-side. The client only ever holds its own chosen
	 * option per question. On a pass the server records completion (markUnitComplete);
	 * this component refreshes progression and shows the unlocked next unit. On a
	 * fail it shows the missed TOPIC names (never answers) and the cooldown timer.
	 */
	interface Question {
		stem: string;
		options: string[];
	}
	let {
		endpoint,
		domainId,
		nextUnit,
		initial,
		onPass
	}: {
		endpoint: string;
		domainId: string;
		nextUnit: { n: number; title: string } | null;
		initial: {
			testLength: number;
			passPercent: number;
			unitComplete: boolean;
			cooldownRemainingSec: number;
		};
		/** Optional hook (dev harness); production refreshes via invalidateAll. */
		onPass?: () => void;
	} = $props();

	type Phase = 'idle' | 'active' | 'result';
	let phase = $state<Phase>('idle');
	let questions = $state<Question[]>([]);
	let answers = $state<(number | null)[]>([]);
	let attemptId = $state('');
	let busy = $state(false);
	let errorMsg = $state('');
	let result = $state<{ passed: boolean; score: number; missedTopics: string[] } | null>(null);
	let cooldown = $state(initial.cooldownRemainingSec);
	let cleared = $state(initial.unitComplete);

	const allAnswered = $derived(
		questions.length > 0 && answers.every((a) => a !== null)
	);

	// Cooldown countdown timer.
	let timer: ReturnType<typeof setInterval> | undefined;
	function startTimer() {
		clearInterval(timer);
		if (cooldown <= 0) return;
		timer = setInterval(() => {
			cooldown = Math.max(0, cooldown - 1);
			if (cooldown === 0) clearInterval(timer);
		}, 1000);
	}
	$effect(() => {
		if (cooldown > 0) startTimer();
	});
	onDestroy(() => clearInterval(timer));

	const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

	async function post(payload: Record<string, unknown>) {
		const res = await fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		});
		return (await res.json()) as Record<string, unknown>;
	}

	async function start() {
		busy = true;
		errorMsg = '';
		result = null;
		try {
			const r = await post({ action: 'start' });
			if (r.ok) {
				questions = r.questions as Question[];
				answers = Array(questions.length).fill(null);
				attemptId = r.attemptId as string;
				phase = 'active';
			} else if (r.reason === 'cooldown') {
				cooldown = Number(r.remainingSec) || 0;
				startTimer();
			} else {
				errorMsg = 'The quiz is not available right now.';
			}
		} catch {
			errorMsg = 'Could not reach the gate. Try again.';
		}
		busy = false;
	}

	async function submit() {
		if (!allAnswered || busy) return;
		busy = true;
		errorMsg = '';
		try {
			const r = await post({ action: 'submit', attemptId, answers });
			if (r.ok) {
				result = {
					passed: !!r.passed,
					score: Number(r.score) || 0,
					missedTopics: (r.missedTopics as string[]) ?? []
				};
				phase = 'result';
				if (r.passed) {
					cleared = true;
					onPass?.();
					invalidateAll();
				} else {
					cooldown = Number(r.cooldownRemainingSec) || 0;
					startTimer();
				}
			} else if (r.reason === 'no_attempt') {
				errorMsg = 'That attempt expired. Start a new one.';
				phase = 'idle';
			} else {
				errorMsg = 'The gate could not grade this attempt.';
			}
		} catch {
			errorMsg = 'Could not submit. Try again.';
		}
		busy = false;
	}

	function backToIdle() {
		phase = 'idle';
		result = null;
		questions = [];
		answers = [];
	}
</script>

<div class="frc-card gate-quiz">
	<div class="gate-head">
		<span class="frc-state {cleared ? 'complete' : 'available'}">
			{#if cleared}
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<circle cx="12" cy="12" r="10" fill="#00ff41" />
					<path d="M7.5 12.5l3 3 6-6.5" stroke="#231f20" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				Gate cleared
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M12 3l7.5 3.5v5c0 4.6-3.2 7.8-7.5 9-4.3-1.2-7.5-4.4-7.5-9v-5z" />
				</svg>
				Knowledge quiz
			{/if}
		</span>
		<span class="gate-pass">
			{initial.testLength} questions &middot; pass at {initial.passPercent}%
		</span>
	</div>

	{#if errorMsg}
		<p class="gate-err">{errorMsg}</p>
	{/if}

	{#if phase === 'idle'}
		{#if cleared}
			<p class="gate-lead">
				You have cleared this gate. You can retake the quiz for review, or continue to the next
				unit.
			</p>
		{:else}
			<p class="gate-lead">
				A {initial.testLength}-question quiz, drawn at random and shuffled each attempt. Score
				{initial.passPercent}% to unlock the next unit. Grading is on the server.
			</p>
		{/if}
		{#if cooldown > 0}
			<div class="gate-cooldown" role="status">
				Locked after a failed attempt. Next try in <strong>{fmt(cooldown)}</strong>.
			</div>
		{/if}
		<div class="gate-actions">
			<button class="gate-btn primary" type="button" onclick={start} disabled={busy || cooldown > 0}>
				{busy ? 'Starting...' : cleared ? 'Retake quiz' : 'Start quiz'}
			</button>
			{#if cleared && nextUnit}
				<a class="gate-btn" href="/frc/{domainId}/{nextUnit.n}">
					Next: {nextUnit.title} &rsaquo;
				</a>
			{/if}
		</div>
	{:else if phase === 'active'}
		<ol class="qlist">
			{#each questions as q, qi (qi)}
				<li class="qitem">
					<p class="qstem"><span class="qnum">{qi + 1}.</span> {q.stem}</p>
					<div class="qopts">
						{#each q.options as opt, oi (oi)}
							<label class="qopt" class:selected={answers[qi] === oi}>
								<input
									type="radio"
									name="q{qi}"
									value={oi}
									checked={answers[qi] === oi}
									onchange={() => (answers[qi] = oi)}
								/>
								<span>{opt}</span>
							</label>
						{/each}
					</div>
				</li>
			{/each}
		</ol>
		<div class="gate-actions">
			<button class="gate-btn primary" type="button" onclick={submit} disabled={!allAnswered || busy}>
				{busy ? 'Grading...' : 'Submit for grading'}
			</button>
			<span class="qprogress">{answers.filter((a) => a !== null).length}/{questions.length} answered</span>
		</div>
	{:else if phase === 'result' && result}
		{#if result.passed}
			<div class="gate-result pass">
				<div class="result-score">{result.score}%</div>
				<div class="result-body">
					<strong>Passed. Unit complete.</strong>
					{#if nextUnit}
						<a class="gate-btn primary" href="/frc/{domainId}/{nextUnit.n}">
							Next unlocked: {nextUnit.title} &rsaquo;
						</a>
					{:else}
						<span>All units in this domain cleared.</span>
					{/if}
				</div>
			</div>
		{:else}
			<div class="gate-result fail">
				<div class="result-score">{result.score}%</div>
				<div class="result-body">
					<strong>Not yet ({initial.passPercent}% to pass).</strong>
					{#if result.missedTopics.length}
						<p class="missed-label">Review these topics:</p>
						<ul class="missed">
							{#each result.missedTopics as t (t)}
								<li>{t}</li>
							{/each}
						</ul>
					{/if}
					{#if cooldown > 0}
						<div class="gate-cooldown" role="status">
							Next attempt in <strong>{fmt(cooldown)}</strong>.
						</div>
					{/if}
					<button class="gate-btn" type="button" onclick={backToIdle} disabled={cooldown > 0}>
						{cooldown > 0 ? 'Locked' : 'Try again'}
					</button>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.gate-quiz {
		padding: 1rem 1.1rem;
		border-left: 4px solid var(--frc-blue, #0066b3);
	}
	.gate-head {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
	}
	.gate-pass {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.gate-lead {
		margin: 0 0 0.8rem;
		color: #333133;
		line-height: 1.6;
	}
	.gate-err {
		margin: 0 0 0.7rem;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--frc-red, #ed1c24);
	}
	.gate-cooldown {
		font-size: 0.85rem;
		color: var(--frc-ink, #231f20);
		background: rgba(237, 28, 36, 0.08);
		border: 1px solid rgba(237, 28, 36, 0.25);
		border-radius: 6px;
		padding: 0.5rem 0.7rem;
		margin: 0.2rem 0 0.8rem;
	}
	.gate-actions {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.gate-btn {
		display: inline-block;
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.02em;
		text-decoration: none;
		color: var(--frc-blue, #0066b3);
		background: var(--frc-surface, #fafbfd);
		border: 1px solid var(--frc-blue, #0066b3);
		border-radius: 6px;
		padding: 0.5rem 0.9rem;
		cursor: pointer;
	}
	.gate-btn:hover:not(:disabled) {
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
	}
	.gate-btn.primary {
		color: #fff;
		background: var(--frc-blue, #0066b3);
	}
	.gate-btn.primary:hover:not(:disabled) {
		background: var(--frc-blue-deep, #004f8a);
	}
	.gate-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.qprogress {
		font-size: 0.78rem;
		color: var(--frc-gray, #9a989a);
	}
	.qlist {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.qitem {
		border-top: 1px solid var(--frc-line, #dde1e8);
		padding-top: 0.9rem;
	}
	.qstem {
		margin: 0 0 0.6rem;
		color: var(--frc-ink, #231f20);
		line-height: 1.5;
		font-weight: 500;
	}
	.qnum {
		font-weight: 700;
		font-style: italic;
		color: var(--frc-blue, #0066b3);
		margin-right: 0.2rem;
	}
	.qopts {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.qopt {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 6px;
		background: var(--frc-surface, #fafbfd);
		cursor: pointer;
		font-size: 0.92rem;
		line-height: 1.45;
		color: #333133;
	}
	.qopt:hover {
		border-color: var(--frc-blue-line, rgba(0, 102, 179, 0.35));
	}
	.qopt.selected {
		border-color: var(--frc-blue, #0066b3);
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
	}
	.qopt input {
		margin-top: 0.2rem;
		accent-color: var(--frc-blue, #0066b3);
	}
	.gate-result {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}
	.result-score {
		font-family: 'Roboto', sans-serif;
		font-weight: 700;
		font-style: italic;
		font-size: 2.2rem;
		line-height: 1;
		flex-shrink: 0;
	}
	.gate-result.pass .result-score {
		color: #0b8f34;
	}
	.gate-result.fail .result-score {
		color: var(--frc-gray, #9a989a);
	}
	.result-body {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		align-items: flex-start;
	}
	.result-body strong {
		font-size: 1.05rem;
		color: var(--frc-ink, #231f20);
	}
	.missed-label {
		margin: 0;
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.missed {
		margin: 0;
		padding-left: 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.missed li {
		color: var(--frc-ink, #231f20);
		font-size: 0.92rem;
	}
</style>
