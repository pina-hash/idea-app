<script lang="ts">
	import './coin-page.css';
	import { coins } from '$lib/coin-format';
	import { coinWhen, type CoinBackground, type CoinBackgroundRules } from '$lib/coin-balance';
	import { backgroundRefusalWords, type CoinActionResult } from './extras';
	import {
		coinBackgroundProblem,
		coinFileSize,
		coinUploadRefusal,
		measureImage,
		type CoinUploadResult
	} from './uploads';

	/**
	 * A DESKTOP BACKGROUND (2.6, 0245). The guidance and the prompt are the
	 * settings Mr. Pina writes; the approved background is drawn from a signed
	 * URL the route minted (the bucket is private). A new one is measured in
	 * the browser and refused here, in words, when it is not 16:9, too small or
	 * too compressed, before anything is uploaded; the database applies the
	 * same three checks again.
	 *
	 * Both `upload` and `submit` are needed to send; without them the panel
	 * shows the rules and the current background only.
	 */
	let {
		rules,
		background,
		backgroundUrl = null,
		upload = null,
		submit = null,
		ondone = null
	}: {
		rules: CoinBackgroundRules;
		background: CoinBackground | null;
		backgroundUrl?: string | null;
		upload?: ((file: Blob & { name?: string }) => Promise<CoinUploadResult>) | null;
		submit?: ((path: string, width: number, height: number) => Promise<CoinActionResult>) | null;
		ondone?: (() => void) | null;
	} = $props();

	let file = $state<File | null>(null);
	let size = $state<{ width: number; height: number } | null>(null);
	let problem = $state<string | null>(null);
	let measuring = $state(false);
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let picks = 0;

	const canSend = $derived(!!upload && !!submit);
	const ready = $derived(!!file && !!size && !problem && !measuring);

	async function picked(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0] ?? null;
		outcome = null;
		file = f;
		size = null;
		problem = null;
		if (!f) return;
		const refusal = coinUploadRefusal(f);
		if (refusal) {
			problem = refusal;
			return;
		}
		const mine = ++picks;
		measuring = true;
		const m = await measureImage(f);
		if (mine !== picks) return;
		measuring = false;
		if (!m) {
			problem = coinBackgroundProblem(0, 0, f.size, rules);
			return;
		}
		size = m;
		problem = coinBackgroundProblem(m.width, m.height, f.size, rules);
	}

	async function send() {
		if (!upload || !submit || !file || !size || problem || busy) return;
		busy = true;
		try {
			const up = await upload(file);
			if (!up.ok) {
				outcome = { ok: false, text: up.words };
				return;
			}
			const r = await submit(up.path, size.width, size.height);
			if (r.ok) {
				outcome = {
					ok: true,
					text: `Sent. Your teacher checks it${rules.award !== null ? `, and it pays ${coins(rules.award)} when approved` : ''}. You can see where it stands under Your submissions.`
				};
				file = null;
				size = null;
				if (inputEl) inputEl.value = '';
				ondone?.();
			} else {
				outcome = { ok: false, text: backgroundRefusalWords(r) };
			}
		} catch {
			outcome = { ok: false, text: backgroundRefusalWords({ reason: 'error' }) };
		} finally {
			busy = false;
		}
	}
</script>

<section class="card cpx-card cpx-panel" aria-labelledby="cpx-h-bg" data-testid="coin-background">
	<h2 id="cpx-h-bg">Desktop background</h2>
	<p class="cpx-lead" data-testid="bg-guidance">{rules.guidance}</p>
	<ul class="cpx-limits">
		<li>16:9, at least {rules.min_width} by {rules.min_height} pixels, saved at high quality.</li>
		<li>
			One every {rules.days_between} days{#if rules.award !== null}, and it pays <strong>{coins(rules.award)}</strong> when approved{/if}.
		</li>
		<li>Your teacher approves it before it pays. If it is denied, the reason is shown under Your submissions.</li>
	</ul>
	{#if rules.prompt}
		<h3>A prompt to start from</h3>
		<p class="cpx-prompt" data-testid="bg-prompt">{rules.prompt}</p>
	{/if}

	<h3>Your approved background</h3>
	{#if background}
		{#if backgroundUrl}
			<img
				class="cpx-pic"
				src={backgroundUrl}
				alt="Your approved desktop background"
				width={background.width ?? 16}
				height={background.height ?? 9}
				loading="lazy"
				data-testid="bg-current"
			/>
		{/if}
		<p class="cpx-note">
			Approved{#if background.approved_at}{' '}{coinWhen(background.approved_at)}{/if}{#if background.width && background.height}, {background.width} by {background.height}{/if}.
			{#if !backgroundUrl}The picture could not be loaded right now.{/if}
		</p>
	{:else}
		<p class="cpx-note" data-testid="bg-none">None yet.</p>
	{/if}

	{#if canSend}
		<h3>Send a new one</h3>
		<label class="cpx-field">
			<span>Pick the picture</span>
			<input type="file" accept="image/*" onchange={picked} bind:this={inputEl} data-testid="bg-file" />
		</label>
		{#if measuring}
			<p class="cpx-note">Measuring the picture...</p>
		{:else if file && size}
			<p class="cpx-note" data-testid="bg-measured">
				{size.width} by {size.height}, {coinFileSize(file.size)}.
			</p>
		{/if}
		{#if problem}<p class="cpx-why" data-testid="bg-problem">{problem}</p>{/if}
		<button
			type="button"
			class="btn cpx-key"
			aria-disabled={!ready || busy ? 'true' : undefined}
			data-testid="bg-send"
			onclick={send}>{busy ? 'Sending...' : 'Send for approval'}</button
		>
		{#if !file && !problem}<p class="cpx-note">Pick a picture first.</p>{/if}
	{/if}
	<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="bg-outcome">
		{outcome?.text ?? ''}
	</p>
</section>
