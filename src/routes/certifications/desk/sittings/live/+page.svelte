<script lang="ts">
	/**
	 * THE LIVE VIEW: `ProctorLive` (surface e's component) over rows this page
	 * refreshes every five seconds through `startPoller`, the one classroom
	 * poller (CLAUDE.md, LIVE POLLS): out of step, one call in flight, paused
	 * while hidden, stopped on a lost session. `?pollMs=` lets a harness count.
	 * End exam posts the page's own action through fetch and re-reads at once.
	 * A flag is information; the proctor in the room decides.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { deserialize } from '$app/forms';
	import ProctorLive from '$lib/certifications/exam/ProctorLive.svelte';
	import type { ExamLiveRow } from '$lib/certifications/types';
	import { isSignedOutFailure, startPoller, type Poller } from '$lib/classroom/poll';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let rows = $state<ExamLiveRow[]>(data.rows);
	let loading = $state(false);
	/** The last poll did not answer: the live view says so rather than showing a stale list as fresh. */
	let failed = $state(false);
	let endResult = $state<{ ok: boolean; message: string } | null>(null);
	const LIVE_POLL_MS = 5000;

	async function readLive(): Promise<'ok' | 'failed' | 'signed-out'> {
		const supabase = page.data.supabase;
		if (!supabase) return 'failed';
		loading = true;
		try {
			const { data: answer, error, status } = await supabase.rpc('cert_exam_live', { p_cert: null });
			if (error) {
				failed = true;
				return isSignedOutFailure(error, status) ? 'signed-out' : 'failed';
			}
			if (Array.isArray(answer)) rows = answer as ExamLiveRow[];
			failed = false;
			return 'ok';
		} catch {
			failed = true;
			return 'failed';
		} finally {
			loading = false;
		}
	}

	let poller: Poller | null = null;
	onMount(() => {
		const param = Number(page.url.searchParams.get('pollMs'));
		poller = startPoller({ intervalMs: Number.isFinite(param) && param >= 1000 ? param : LIVE_POLL_MS, run: readLive });
		return () => poller?.stop();
	});

	async function end(examId: string, reason: string) {
		const body = new FormData();
		body.set('exam_id', examId);
		body.set('reason', reason);
		try {
			const res = await fetch('?/end', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true', accept: 'application/json' } });
			const result = deserialize(await res.text());
			if (result.type === 'success' || result.type === 'failure') {
				const d = (result.data ?? {}) as { ok?: boolean; message?: string };
				endResult = { ok: d.ok === true, message: d.message ?? (d.ok ? 'Ended.' : 'The exam was not ended.') };
			} else {
				endResult = { ok: false, message: 'The exam was not ended: the server answered unexpectedly.' };
			}
		} catch (e) {
			endResult = { ok: false, message: (e as Error)?.message || 'The exam was not ended: the server could not be reached.' };
		}
		await readLive();
	}
</script>

<p class="cert-notice cert-notice-quiet" data-testid="cert-live-note">
	<span class="cert-notice-glyph" aria-hidden="true">i</span>
	<span>A flag is information, not a verdict: it says the student's tab, window or full screen changed, with the time. You are in the room; you decide what it means. This list refreshes itself every few seconds.</span>
</p>

{#if data.unavailable}
	<p class="cert-notice cert-notice-quiet" data-testid="cert-not-available">
		<span class="cert-notice-glyph" aria-hidden="true">i</span>
		<span>This part of IDEA Certifications is not available yet.</span>
	</p>
{:else}
	{#if endResult}
		<p class="cert-notice {endResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-live-end-result">
			<span class="cert-notice-glyph" aria-hidden="true">{endResult.ok ? '✓' : '!'}</span>
			<span>{endResult.message}</span>
		</p>
	{/if}
	<ProctorLive {rows} {loading} {failed} onend={end} />
{/if}
