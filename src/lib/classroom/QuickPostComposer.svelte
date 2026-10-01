<script lang="ts">
	import { untrack } from 'svelte';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import type { ClassroomSection } from '$lib/classroom/classroom';
	import {
		QUICK_POST_DEFAULT_PRESET,
		QUICK_POST_MAX_CHARS,
		QUICK_POST_PRESETS,
		quickPostPresetHint,
		quickPostSendCheck,
		quickPostSendLabel,
		quickPostTargets,
		type QuickPostCreateResult,
		type QuickPostPresetId,
		type QuickPostTargetMode,
		type QuickPostTransports
	} from '$lib/classroom/quick-posts';
	import { SCHOOL_LOCALE } from '$lib/classroom/school-calendar';

	/**
	 * WRITING A QUICK POST (ledger 0360, report R22), IN AS FEW ACTIONS AS IT CAN
	 * TAKE: the header's Quick post key opens this with the box focused, the
	 * defaults are THIS class until the END OF THE SCHOOL DAY, and Post (or
	 * Ctrl+Enter) sends it. Every other choice is one press: another end, "All
	 * my classes", or a hand-picked set.
	 *
	 * EACH END SAYS WHAT IT MEANS RIGHT NOW beside its label ("3:00 PM today"),
	 * from the same clock-injected function that resolves it, so the words on
	 * the key and the instant the database stores cannot disagree.
	 *
	 * ONE PREDICATE DRIVES POST (`quickPostSendCheck`): its `aria-disabled` and
	 * its handler read the same answer, and a press while it is not ready says
	 * why in words instead of doing nothing. A refusal from the database renders
	 * here verbatim, in the same line.
	 *
	 * WRITING IN THE BOX HOLDS A DEPLOY RELOAD (`holdDeployReload`), the rule
	 * every surface holding unsent work follows: a new version of the site must
	 * not arrive in the middle of a notice somebody is typing.
	 */
	let {
		sections,
		currentSectionId,
		viewerEmail = null,
		create,
		oncreated,
		oncancel,
		clock = () => Date.now()
	}: {
		/** The sections the page already loaded for this manager. */
		sections: ClassroomSection[];
		currentSectionId: string;
		/** Whose classes "All my classes" means (by `teacher_email`). */
		viewerEmail?: string | null;
		create: QuickPostTransports['create'];
		/** Told once, after the database said yes, with the body it was sent. */
		oncreated: (result: Extract<QuickPostCreateResult, { ok: true }>, body: string) => void;
		oncancel: () => void;
		/** The clock the ends are resolved against; a test pins it. */
		clock?: () => number;
	} = $props();

	let body = $state('');
	let preset = $state<QuickPostPresetId>(QUICK_POST_DEFAULT_PRESET);
	let custom = $state('');
	let mode = $state<QuickPostTargetMode>('this');
	// svelte-ignore state_referenced_locally
	let chosen = $state<string[]>([currentSectionId]);
	let busy = $state(false);
	let refusal = $state<string | null>(null);
	let discardArmed = $state(false);
	let textEl = $state<HTMLTextAreaElement | null>(null);
	const uid = $props.id();

	/** The resolved hints move with the clock while the box is open; no network. */
	// svelte-ignore state_referenced_locally
	let nowMs = $state(clock());
	$effect(() => {
		const read = clock;
		const timer = setInterval(() => {
			nowMs = untrack(() => read());
		}, 30_000);
		return () => clearInterval(timer);
	});

	const targets = $derived(quickPostTargets(sections, viewerEmail, currentSectionId));
	/** "All my classes" only when it means more than this class. */
	const offerMine = $derived(
		targets.mine.length > 1 || (targets.mine.length === 1 && targets.mine[0].id !== currentSectionId)
	);
	const offerChoose = $derived(targets.choices.length > 1);
	const sectionIds = $derived(
		mode === 'mine' ? targets.mine.map((t) => t.id) : mode === 'choose' ? chosen : [currentSectionId]
	);
	const check = $derived(quickPostSendCheck({ body, preset, custom, sectionIds }, nowMs));
	const count = $derived(new Set(sectionIds).size);
	const tooLong = $derived(body.trim().length > QUICK_POST_MAX_CHARS);

	// An autofocus keyed on the ELEMENT, not on mount (CLAUDE.md).
	$effect(() => {
		textEl?.focus();
	});

	$effect(() => {
		if (body.trim() === '') return;
		return holdDeployReload('an unsaved quick post', { warnOnUnload: true });
	});

	function toggleChosen(id: string, on: boolean) {
		chosen = on ? [...new Set([...chosen, id])] : chosen.filter((x) => x !== id);
	}

	async function post() {
		if (busy) return;
		nowMs = clock();
		const c = quickPostSendCheck({ body, preset, custom, sectionIds }, nowMs);
		if (!c.ok) {
			refusal = c.reason;
			return;
		}
		busy = true;
		refusal = null;
		try {
			const res = await create(c.sectionIds, c.body, c.expiresAt);
			if (!res.ok) {
				refusal = res.message;
				return;
			}
			body = '';
			oncreated(res, c.body);
		} catch {
			refusal = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
		}
	}

	function cancel() {
		if (body.trim() !== '' && !discardArmed) {
			discardArmed = true;
			return;
		}
		body = '';
		oncancel();
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			void post();
		}
	}
</script>

<div class="card qp-compose" role="group" aria-label="Quick post" data-testid="quick-post-composer">
	<label class="qp-field">
		<span class="qp-label">Quick post</span>
		<textarea
			bind:this={textEl}
			bind:value={body}
			class="qp-text"
			rows="3"
			placeholder="A schedule change, a link, a reminder"
			aria-describedby={`${uid}-count`}
			data-testid="quick-post-text"
			oninput={() => {
				refusal = null;
				discardArmed = false;
			}}
			onkeydown={keydown}
		></textarea>
	</label>
	<p class="qp-hint" id={`${uid}-count`} class:over={tooLong} data-testid="quick-post-count">
		{body.trim().length.toLocaleString(SCHOOL_LOCALE)} of {QUICK_POST_MAX_CHARS.toLocaleString(SCHOOL_LOCALE)}
		characters. Links become buttons. Ctrl+Enter posts.
	</p>

	<div class="qp-choice" role="group" aria-label="Show until" data-testid="quick-post-presets">
		<span class="qp-label">Show until</span>
		<div class="qp-keys">
			{#each QUICK_POST_PRESETS as p (p.id)}
				<button
					type="button"
					class="btn secondary tiny qp-key"
					aria-pressed={preset === p.id}
					data-preset={p.id}
					data-testid="quick-post-preset"
					onclick={() => {
						preset = p.id;
						refusal = null;
					}}
				>
					<span class="qp-key-word">{p.label}</span>
					<span class="qp-key-hint">{quickPostPresetHint(p.id, nowMs)}</span>
				</button>
			{/each}
		</div>
		{#if preset === 'custom'}
			<label class="qp-when">
				<span class="qp-label">Date and time, school time (Pacific)</span>
				<input
					type="datetime-local"
					class="qp-input"
					bind:value={custom}
					data-testid="quick-post-custom"
					oninput={() => (refusal = null)}
				/>
			</label>
		{/if}
	</div>

	{#if offerMine || offerChoose}
		<div class="qp-choice" role="group" aria-label="Post to" data-testid="quick-post-targets">
			<span class="qp-label">Post to</span>
			<div class="qp-keys">
				<button
					type="button"
					class="btn secondary tiny qp-key"
					aria-pressed={mode === 'this'}
					data-testid="quick-post-target-this"
					onclick={() => (mode = 'this')}>This class</button
				>
				{#if offerMine}
					<button
						type="button"
						class="btn secondary tiny qp-key"
						aria-pressed={mode === 'mine'}
						data-testid="quick-post-target-mine"
						onclick={() => (mode = 'mine')}>All my classes ({targets.mine.length})</button
					>
				{/if}
				{#if offerChoose}
					<button
						type="button"
						class="btn secondary tiny qp-key"
						aria-pressed={mode === 'choose'}
						data-testid="quick-post-target-choose"
						onclick={() => (mode = 'choose')}>Choose classes</button
					>
				{/if}
			</div>
			{#if mode === 'choose'}
				<ul class="qp-classes" data-testid="quick-post-classes">
					{#each targets.choices as t (t.id)}
						<li>
							<label class="qp-class">
								<input
									type="checkbox"
									checked={chosen.includes(t.id)}
									onchange={(e) => toggleChosen(t.id, e.currentTarget.checked)}
								/>
								<span>{t.label}</span>
							</label>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<div class="qp-send">
		<button
			type="button"
			class="btn tiny qp-post"
			aria-disabled={!check.ok || busy}
			data-testid="quick-post-send"
			onclick={() => void post()}
		>
			{busy ? 'Posting' : quickPostSendLabel(count)}
		</button>
		<button type="button" class="btn secondary tiny" data-testid="quick-post-cancel" onclick={cancel}>
			{discardArmed ? 'Discard what you wrote' : 'Cancel'}
		</button>
	</div>
	{#if refusal}
		<p class="qp-refusal" role="alert" data-testid="quick-post-refusal">{refusal}</p>
	{/if}
</div>

<style>
	.qp-compose {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		padding: var(--space-3);
		min-width: 0;
	}
	.qp-field,
	.qp-when {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.qp-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-1);
	}
	.qp-text,
	.qp-input {
		box-sizing: border-box;
		width: 100%;
		min-height: 44px;
		padding: var(--space-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 6px);
		background: var(--surface-0, var(--bg0));
		color: var(--text-1);
		font: inherit;
		font-family: var(--font-display);
		font-size: 1rem;
	}
	.qp-text {
		resize: vertical;
		line-height: 1.4;
	}
	.qp-text:focus-visible,
	.qp-input:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.qp-hint {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-2);
	}
	.qp-hint.over {
		color: var(--text-1);
		font-weight: 600;
	}
	.qp-choice {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.qp-keys {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		min-width: 0;
	}
	.qp-compose :global(.btn.tiny) {
		font-size: 0.6875rem;
	}
	.qp-key {
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 0.1rem;
		max-width: 100%;
		text-align: left;
	}
	.qp-key-word {
		white-space: normal;
	}
	.qp-key-hint {
		font-size: 0.75rem;
		letter-spacing: 0.02em;
		text-transform: none;
		opacity: 1;
	}
	.qp-classes {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.qp-class {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 44px;
		color: var(--text-1);
		cursor: pointer;
	}
	.qp-class input {
		width: 1.1rem;
		height: 1.1rem;
		flex: none;
	}
	.qp-send {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		align-items: center;
	}
	.qp-post[aria-disabled='true'] {
		cursor: not-allowed;
	}
	.qp-refusal {
		margin: 0;
		padding-left: 0.5rem;
		border-left: 3px solid var(--amber);
		color: var(--text-1);
	}
</style>
