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

<!--
	ONE OF THE CLASS TOOLS, AND IT READS AS ONE (ledger 0298, R21). The door
	used to set "Live class" in the display face at 600 beside a smaller mono
	count, and the bare text "{count} on" was an anonymous flex item whose
	automatic minimum is its min-content -- the word "on" alone -- so in a
	three-tool row at 871px it shrank by wrapping, "0" over "on", while the title
	was squeezed to a sliver. Now:

	  - THE WORD AND THE STATUS WEAR THE TOOL SHELL'S TYPE, the same mono,
	    uppercase word and lowercase trailing chip the hall pass and the music
	    tool beside it wear, so the row is three of one thing. The rules are
	    restated here with an `ld-` prefix because the shell's `ctool-` rules are
	    scoped to HallPass.svelte and SongQueue.svelte; the note on those two
	    names the shared home all three belong in.
	  - THE COUNT AND "on" ARE ONE UNBREAKABLE PIECE (`nowrap`, `flex: none`),
	    and the TITLE is the only thing that gives: it ellipsizes on one line.
	  - WHEN THE DOOR IS TOO NARROW FOR THE WORD AND THE STATUS SIDE BY SIDE
	    (about 195-230px: it shares a row of about 25rem with one other tool,
	    which a class list widened to 28rem or a phone near 430px produces; the
	    default 26rem list hands its row 366px and every tool gets its own
	    line), the status takes a line of its own under the word rather than
	    clipping the count, and the door grows past 44px instead of overflowing.
-->
<a class="ld-door" href={target} data-testid="live-door">
	<span class="ld-glyph" aria-hidden="true">{count ? '●' : '○'}</span>
	<span class="ld-word">Live class</span>
	{#if count !== null && choice}
		<span class="ld-status" data-testid="live-door-status">
			<span class="ld-count" data-testid="live-door-count">{count} on</span>
			<span class="ld-item" data-testid="live-door-item" title={choice.title}>{choice.title}</span>
		</span>
	{/if}
</a>

<style>
	.ld-door {
		/* The tool trigger's box: `min-height`, never a height, so a status that
		   takes its own line grows the door instead of clipping it. `flex-wrap`
		   is what lets it take that line: the status carries a small basis, so
		   it shares the word's line whenever the count and a few letters of the
		   title fit there, and moves under it only when they do not. */
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 0.6rem;
		row-gap: 0.15rem;
		min-height: 44px;
		min-width: 0;
		padding: 0.5rem 0.9rem;
		box-sizing: border-box;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-decoration: none;
	}
	.ld-door:hover {
		border-color: var(--accent-ink);
		text-decoration: none;
	}
	.ld-door:focus-visible {
		outline: 2px solid var(--accent-ink);
		outline-offset: 2px;
	}
	.ld-glyph {
		/* The width of the other tools' 18px glyphs, so the three words start at
		   the same distance from their edges. */
		flex: none;
		width: 18px;
		text-align: center;
		letter-spacing: 0;
		color: var(--status-ok);
	}
	.ld-word {
		flex: none;
		white-space: nowrap;
	}
	.ld-status {
		/* The tool chip's register: smaller, lowercase, secondary ink, pushed to
		   the trailing edge so the status lines up with the chips beside it.
		   It reads as the sentence it always was, "27 on Truss sketch", with no
		   separator spending the title's room. The basis is the count and about
		   ten letters of the title: less room than that on the word's line and
		   the status takes its own. */
		flex: 1 1 16ch;
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 0.45em;
		min-width: 0;
		font-size: 0.74rem;
		letter-spacing: 0.06em;
		text-transform: none;
		color: var(--text-2);
	}
	.ld-count {
		/* The count and "on" never part: the defect this fixes. */
		flex: none;
		white-space: nowrap;
		color: var(--text-1);
	}
	.ld-item {
		/* The one thing that gives. */
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
