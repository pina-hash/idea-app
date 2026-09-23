<script lang="ts">
	import { onMount } from 'svelte';
	import { updated } from '$app/state';
	import { activeDeployHolds, onDeployHoldsChange } from '$lib/shell/deploy-safety';
	import {
		DS_LOG_KEY,
		DS_UPLOAD_MS_KEY,
		installUploadShim,
		readLog,
		recordDocumentLoad,
		recordVerdicts,
		type DsEntry
	} from './harness';

	/**
	 * THE DEPLOY SAFETY HARNESS'S OWN CHROME: counters that survive a reload.
	 *
	 * A reload is the thing under test, so nothing that lives in a component
	 * could count it. Every fact goes into `sessionStorage` (per tab, cleared
	 * with a fresh browser context): one `document` entry per full page load,
	 * one `verdict` per navigation `DeployWatch` judged (with the rule that
	 * answered), one `ack` per acknowledged save, and the upload's start and
	 * record. THE ORACLE IS NOT HERE: `tools/browser-verify/routes/deploy-safety*`
	 * reads these raw entries and makes every judgement itself.
	 *
	 * The page-side seams are installed ONCE PER DOCUMENT on `window` and never
	 * removed, because an upload in flight must still be able to record itself
	 * after the person navigates to `/fsp/live` and this layout unmounts:
	 * `installUploadShim` answers the two classroom upload endpoints in memory
	 * (the REAL `uploadClassroomFile` runs, and its PUT goes to
	 * `/dev/deploy-safety/upload`, a real request held open), and
	 * `window.__dsFlipUpdated` writes SvelteKit's `updated.current` the one way
	 * a dev build allows, failing loudly if the kit module is not found.
	 */
	let { children } = $props();

	let log = $state<DsEntry[]>([]);
	let holds = $state<string[]>([]);
	let uploadMs = $state(0);

	function refresh() {
		log = readLog();
		holds = activeDeployHolds();
		uploadMs = Number(sessionStorage.getItem(DS_UPLOAD_MS_KEY)) || 0;
	}

	onMount(() => {
		recordDocumentLoad();
		recordVerdicts();
		installUploadShim();
		refresh();
		const stop = onDeployHoldsChange(refresh);
		const tick = setInterval(refresh, 250);
		return () => {
			stop();
			clearInterval(tick);
		};
	});

	const documents = $derived(log.filter((e) => e.kind === 'document'));
	const lastVerdict = $derived([...log].reverse().find((e) => e.kind === 'verdict') ?? null);

	function setUploadMs(ms: number) {
		sessionStorage.setItem(DS_UPLOAD_MS_KEY, String(ms));
		refresh();
	}

	function reset() {
		sessionStorage.removeItem(DS_LOG_KEY);
		refresh();
	}
</script>

<div class="ds-root cr-root">
	<header class="ds-bar" data-testid="ds-bar">
		<span class="ds-chip" data-testid="ds-documents">documents {documents.length}</span>
		<span class="ds-chip" data-testid="ds-updated">updated {updated.current ? 'yes' : 'no'}</span>
		<span class="ds-chip" data-testid="ds-holds">holds {holds.length}</span>
		<span class="ds-chip" data-testid="ds-verdict">
			last verdict {lastVerdict ? `${lastVerdict.reason}` : 'none'}
		</span>
		<label class="ds-switch">
			<input
				type="checkbox"
				data-testid="ds-slow-uploads"
				checked={uploadMs > 0}
				onchange={(e) => setUploadMs(e.currentTarget.checked ? 6000 : 0)}
			/>
			<span>Slow uploads</span>
		</label>
		<button type="button" class="btn secondary tap-44" onclick={reset}>Reset counters</button>
	</header>
	{@render children()}
</div>

<style>
	.ds-root {
		min-height: 100dvh;
	}
	.ds-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--boundary);
		background: var(--bg1);
	}
	.ds-chip {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.05em;
		color: var(--text-1);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}
	.ds-switch {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		font-size: 0.82rem;
		color: var(--text-1);
	}
	.ds-switch input {
		accent-color: var(--green);
	}
</style>
