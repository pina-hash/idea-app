<script lang="ts" module>
	export interface FspQuestion {
		id: string;
		question: string;
		session_id: string;
		created_at: string;
		answered: boolean;
	}
</script>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

	/**
	 * FspLiveFeed — the Supabase Realtime question feed for FSP live Q&A, factored
	 * out of /fsp/live so it can be embedded without rebuilding. It owns ONLY the
	 * feed: loading unanswered questions for a session, the Realtime subscription
	 * (INSERT adds a card, a soft-clear UPDATE removes it), the relative-time
	 * clock, and the card list + empty state. The chrome around it (auth gate,
	 * session controls, panel frame) belongs to the parent.
	 *
	 * Used in two places from ONE source:
	 *   - /fsp/live      — the staff presenter console (variant="console")
	 *   - /fsp/day1      — slide 13 of the Day 1 deck (variant="slide")
	 *
	 * Session resolution: pass `session` to filter on a specific session and the
	 * feed reacts to changes (the console drives this as staff switch sessions).
	 * Leave it undefined and the feed resolves the active session from fsp_config
	 * itself (the deck embed just wants "whatever is live now").
	 *
	 * Harness/no-DB: pass `sampleQuestions` with `supabase = null` to render a
	 * static preview with no network (the /dev harness relies on this).
	 */

	let {
		supabase = null,
		session = undefined,
		sampleQuestions = null,
		variant = 'console',
		count = $bindable(0)
	}: {
		supabase?: SupabaseClient | null;
		/** Explicit session to filter on. Undefined = resolve from fsp_config. */
		session?: string | null | undefined;
		/** Static questions for the no-Supabase harness preview. */
		sampleQuestions?: FspQuestion[] | null;
		variant?: 'console' | 'slide';
		/** Live count of unanswered questions on screen (for parent chrome). */
		count?: number;
	} = $props();

	let questions = $state<FspQuestion[]>([]);
	let ready = $state(false);
	let feedError = $state('');
	let resolvedSession = $state<string | null>(null);

	let channel: RealtimeChannel | null = null;
	let now = $state(Date.now());
	let clockTimer: ReturnType<typeof setInterval> | null = null;
	let reduced = $state(false);

	const usingSample = $derived(!supabase && !!sampleQuestions);
	// When `session` is passed use it (and react to it); otherwise use whatever
	// we resolved from fsp_config.
	const effectiveSession = $derived(session !== undefined ? session : resolvedSession);

	async function loadFeed(s: string) {
		if (!supabase) return;
		const { data: rows, error } = await supabase
			.from('fsp_questions')
			.select('id, question, session_id, created_at, answered')
			.eq('session_id', s)
			.eq('answered', false)
			.order('created_at', { ascending: false });
		if (error) {
			feedError = error.message;
			questions = [];
			return;
		}
		feedError = '';
		questions = (rows ?? []) as FspQuestion[];
	}

	function subscribe(s: string) {
		if (!supabase) return;
		teardown();
		channel = supabase
			.channel(`fsp-live-${s}`)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'fsp_questions', filter: `session_id=eq.${s}` },
				(payload) => {
					const row = payload.new as FspQuestion;
					if (row.answered) return;
					if (questions.some((q) => q.id === row.id)) return;
					questions = [row, ...questions];
				}
			)
			.on(
				'postgres_changes',
				{ event: 'UPDATE', schema: 'public', table: 'fsp_questions', filter: `session_id=eq.${s}` },
				(payload) => {
					const row = payload.new as FspQuestion;
					// A soft clear (answered = true) removes the card from the feed.
					if (row.answered) questions = questions.filter((q) => q.id !== row.id);
				}
			)
			.subscribe();
	}

	function teardown() {
		if (channel && supabase) supabase.removeChannel(channel);
		channel = null;
	}

	function relTime(iso: string): string {
		const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
		if (secs < 5) return 'just now';
		if (secs < 60) return `${secs}s ago`;
		const mins = Math.floor(secs / 60);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		return `${hrs}h ago`;
	}

	onMount(async () => {
		reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		clockTimer = setInterval(() => (now = Date.now()), 1000);

		if (usingSample) {
			questions = sampleQuestions ?? [];
			ready = true;
			return;
		}
		// Self-resolve the active session only when the parent didn't pass one.
		if (session === undefined && supabase) {
			const { data: cfg } = await supabase
				.from('fsp_config')
				.select('value')
				.eq('key', 'active_session')
				.maybeSingle();
			resolvedSession = cfg?.value ?? 'Day1-A';
		}
	});

	// (Re)load + (re)subscribe whenever the effective session changes.
	$effect(() => {
		const s = effectiveSession;
		if (!supabase || !s) return;
		loadFeed(s).then(() => (ready = true));
		subscribe(s);
		return () => teardown();
	});

	// Keep the parent's chrome (LIVE dot, count) in sync with the feed.
	$effect(() => {
		count = questions.length;
	});

	onDestroy(() => {
		teardown();
		if (clockTimer) clearInterval(clockTimer);
	});
</script>

<div class="feed-root {variant}">
	{#if feedError}
		<p class="err">{feedError}</p>
	{/if}

	{#if !ready && !usingSample}
		<div class="empty">
			{#if variant === 'slide'}
				<span class="cursor"></span>
				<span class="waiting">CONNECTING…</span>
			{:else}
				<p>Loading…</p>
			{/if}
		</div>
	{:else if questions.length === 0}
		<div class="empty">
			{#if variant === 'slide'}
				<span class="cursor"></span>
				<span class="waiting">WAITING FOR SUBMISSIONS</span>
			{:else}
				<p>No questions yet. They appear here live as they come in.</p>
			{/if}
		</div>
	{:else}
		<div class="cards">
			{#each questions as q (q.id)}
				<article class="qcard" in:fly={{ y: reduced ? 0 : -14, duration: reduced ? 0 : 260 }}>
					<p class="qtext">{q.question}</p>
					<span class="qtime">{relTime(q.created_at)}</span>
				</article>
			{/each}
		</div>
	{/if}
</div>

<style>
	.feed-root {
		width: 100%;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.err {
		color: var(--crimson, #ff6b6b);
		font-size: 0.9rem;
		padding: 0.4rem 0.6rem;
		margin: 0;
	}
	.cards {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}
	.empty {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.6rem;
		text-align: center;
	}
	.qcard {
		background: #101610;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-left: 3px solid var(--green, #00ff41);
		border-radius: 12px;
		padding: 1rem 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.qtext {
		margin: 0;
		line-height: 1.35;
		color: var(--white, #e8ffe8);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.qtime {
		font-family: 'Share Tech Mono', monospace;
		color: var(--cyan, #00f0ff);
		align-self: flex-end;
	}

	/* --- console variant (the /fsp/live presenter page) --- */
	.feed-root.console .cards {
		max-width: 900px;
		margin: 0 auto;
		padding: 1rem 1.2rem 4rem;
		width: 100%;
	}
	.console .qtext {
		font-size: 1.4rem;
	}
	.console .qtime {
		font-size: 0.78rem;
	}
	.console .empty {
		color: #4a7a52;
		padding: 3rem 1rem;
	}
	.console .empty p {
		font-size: 1.1rem;
		margin: 0;
	}
	@media (max-width: 560px) {
		.console .qtext {
			font-size: 1.2rem;
		}
	}

	/* --- slide variant (deck slide 13, 1440x1080 fixed stage) --- */
	.feed-root.slide {
		padding: 26px 30px;
	}
	.slide .cards {
		gap: 18px;
		padding-right: 8px;
	}
	.slide .qcard {
		border-radius: 6px;
		padding: 22px 28px;
		gap: 8px;
	}
	.slide .qtext {
		font-size: 34px;
		line-height: 1.28;
	}
	.slide .qtime {
		font-size: 20px;
	}
	.slide .empty .waiting {
		font-family: 'Share Tech Mono', monospace;
		font-size: 26px;
		letter-spacing: 0.2em;
		color: var(--dim, #4a7a52);
	}
	.slide .cursor {
		width: 18px;
		height: 34px;
		background: var(--green, #00ff41);
		box-shadow: var(--glow-green, 0 0 12px rgba(0, 255, 65, 0.8));
		animation: feed-blink 1.2s steps(1) infinite;
	}
	@keyframes feed-blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0.1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.slide .cursor {
			animation: none;
		}
	}
</style>
