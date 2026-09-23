<script lang="ts">
	import { untrack } from 'svelte';
	import { PRESENCE_POLL_MS, type PresencePayload } from '$lib/classroom/presence/state';
	import type { PresenceTransports } from '$lib/classroom/presence/transports';
	import type { ClassroomLive } from '$lib/classroom/live';
	import { CLASSROOM_LIVE_DEBOUNCE_MS } from '$lib/classroom/hall-pass';
	import { liveCountOf, type LiveItemChoice } from './grid';

	/**
	 * THE WAY IN FROM THE CLASS PAGE, and the count that makes it worth taking.
	 *
	 * Presence used to live only inside the grading console, which nothing on
	 * the class page pointed at: Mr. Cosso never found it. This sits in the class
	 * tools row beside the hall pass -- the control he did find unaided, because
	 * it is the first thing in the class pane -- and says, before anybody opens
	 * anything, how many students are on today's assignment right now. It leads
	 * to the Live tab with that assignment already chosen.
	 *
	 * A MANAGER-ONLY MOUNT, decided by the caller (the class layout mounts it for
	 * a manager and hands a student nothing), and the count is `liveCountOf`, the
	 * grid's own rule judged at the server's own read instant, so the door and
	 * the grid cannot disagree about who is "on the page".
	 *
	 * NULL IS A NORMAL ANSWER. No assignment to watch, a deployment without
	 * presence, or a read that failed all render the door with no count: it is
	 * still the way to the Live tab, and a zero it cannot vouch for would read as
	 * "nobody is working".
	 */
	let {
		href,
		sectionId,
		choice,
		presence = null,
		live = null
	}: {
		href: string;
		sectionId: string;
		/** The assignment the Live tab would open on, or null. */
		choice: LiveItemChoice | null;
		presence?: PresenceTransports | null;
		live?: ClassroomLive | null;
	} = $props();

	let payload = $state<PresencePayload | null>(null);
	const count = $derived(liveCountOf(payload));
	const target = $derived(choice ? `${href}?item=${encodeURIComponent(choice.id)}` : href);

	async function read(itemId: string) {
		const t = presence;
		if (!t) return;
		try {
			const next = await t.loadPresence(itemId, sectionId);
			if (choice?.id === itemId) payload = next;
		} catch {
			/* Best effort: the door stays a door. */
		}
	}

	$effect(() => {
		const itemId = choice?.signal ? choice.id : null;
		const t = presence;
		if (!itemId || !t) {
			untrack(() => (payload = null));
			return;
		}
		queueMicrotask(() => void read(itemId));
		const timer = setInterval(() => {
			if (typeof document !== 'undefined' && document.hidden) return;
			void read(itemId);
		}, PRESENCE_POLL_MS);
		return () => clearInterval(timer);
	});

	$effect(() => {
		const bus = live;
		const itemId = choice?.signal ? choice.id : null;
		if (!bus || !itemId) return;
		let debounce: ReturnType<typeof setTimeout> | null = null;
		const unsubscribe = untrack(() =>
			bus.subscribe(sectionId, (topic) => {
				if (topic !== 'presence') return;
				if (debounce) clearTimeout(debounce);
				debounce = setTimeout(() => void read(itemId), CLASSROOM_LIVE_DEBOUNCE_MS);
			})
		);
		return () => {
			if (debounce) clearTimeout(debounce);
			unsubscribe();
		};
	});
</script>

<a class="ld-door" href={target} data-testid="live-door">
	<span class="ld-glyph" aria-hidden="true">{count ? '●' : '○'}</span>
	<span class="ld-word">Live class</span>
	{#if count !== null && choice}
		<span class="ld-count" data-testid="live-door-count">
			{count} on <span class="ld-item">{choice.title}</span>
		</span>
	{/if}
</a>

<style>
	.ld-door {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 44px;
		min-width: 0;
		padding: 0 0.85rem;
		box-sizing: border-box;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--text-1);
		text-decoration: none;
	}
	.ld-door:hover {
		border-color: var(--accent-ink);
		text-decoration: none;
	}
	.ld-glyph {
		font-family: var(--font-mono);
		color: var(--status-ok);
	}
	.ld-word {
		font-weight: 600;
		white-space: nowrap;
	}
	.ld-count {
		display: inline-flex;
		align-items: baseline;
		gap: 0.3rem;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
		overflow: hidden;
	}
	.ld-item {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
</style>
