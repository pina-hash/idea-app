<script lang="ts">
	/**
	 * PRESENTATION MODE: EVERY STUDENT'S LINK, ONE AT A TIME, AT PROJECTOR SIZE
	 * (ledger 0360, Mr. Pina 2026-09-30).
	 *
	 * "Some kind of dedicated functionality for this since it is a common
	 * thing": a class hands in share links (Google Slides, Canva) and presents
	 * back to back from the projector. This is the list of who presents, in
	 * roster order, with the current presenter's name large, one big Open key,
	 * and Previous and Next. It is NOT a presentation engine -- he said that is
	 * much later -- and it plays nothing: Open hands the link to a new tab.
	 *
	 * A NATIVE `<dialog>` OPENED WITH `showModal()`, on the grading route rather
	 * than a projected route of its own, so nothing about a deploy reload or the
	 * report control's relocation applies: no navigation happens while it is
	 * open, and the console's keys stand down while a `dialog[open]` exists.
	 * The keys here are attached with `addEventListener` on the dialog itself and
	 * a close tells the parent DIRECTLY rather than through the `close` event
	 * (both the Browser-pane dialog traps, which are real browser behaviours in
	 * the pane a pass may run in).
	 *
	 * WHAT THE ROOM SEES. The screen faces the class, so it carries the current
	 * presenter's name (it is their turn) and the place their link goes, and
	 * never an address. The rest of the queue is behind a Disclosure that starts
	 * closed. A student with no link is not in the queue at all; the console's
	 * own key says how many have none.
	 */
	import { tick, untrack } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import type { PresentationEntry } from '$lib/classroom/answer-links';

	let {
		open,
		queue,
		missing = 0,
		notWorking = 0,
		scope = null,
		onclose
	}: {
		open: boolean;
		queue: readonly PresentationEntry[];
		/** Students with no link that opens, for the one sentence under the queue. */
		missing?: number;
		/** Of those, how many typed something that is not a link. */
		notWorking?: number;
		/** The Disclosure memory scope (the item id), or null. */
		scope?: string | null;
		onclose: () => void;
	} = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	let openKey = $state<HTMLAnchorElement | null>(null);
	let index = $state(0);
	let note = $state<string | null>(null);

	const current = $derived(queue[Math.min(index, Math.max(0, queue.length - 1))] ?? null);
	const atStart = $derived(index <= 0);
	const atEnd = $derived(index >= queue.length - 1);

	function go(step: -1 | 1) {
		if (!queue.length) return;
		const next = index + step;
		if (next < 0) {
			note = 'This is the first presenter.';
			return;
		}
		if (next > queue.length - 1) {
			note = 'That was the last presenter.';
			return;
		}
		note = null;
		index = next;
	}

	function jump(i: number) {
		note = null;
		index = Math.max(0, Math.min(queue.length - 1, i));
		void tick().then(() => openKey?.focus());
	}

	/** Open the dialog when `open` turns true, and close it when it turns false. */
	$effect(() => {
		const el = dialog;
		const want = open;
		if (!el) return;
		untrack(() => {
			if (want && !el.open) {
				index = 0;
				note = null;
				if (typeof el.showModal === 'function') el.showModal();
				else el.setAttribute('open', '');
				void tick().then(() => openKey?.focus());
			} else if (!want && el.open) {
				if (typeof el.close === 'function') el.close();
				else el.removeAttribute('open');
			}
		});
	});

	/**
	 * THE KEYS, ON THE DIALOG ITSELF. Left and Right move, Escape closes and says
	 * so to the parent directly. Enter is the focused control's own: on the Open
	 * key it opens the link, which is the press a presenter makes most.
	 */
	$effect(() => {
		const el = dialog;
		if (!el) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (event.key === 'ArrowRight') {
				event.preventDefault();
				go(1);
			} else if (event.key === 'ArrowLeft') {
				event.preventDefault();
				go(-1);
			} else if (event.key === 'Escape') {
				event.preventDefault();
				onclose();
			}
		};
		// The browser's own Escape fires `cancel`; it is turned into the same
		// direct notice rather than left to close the dialog behind the parent's back.
		const onCancel = (event: Event) => {
			event.preventDefault();
			onclose();
		};
		el.addEventListener('keydown', onKey);
		el.addEventListener('cancel', onCancel);
		return () => {
			el.removeEventListener('keydown', onKey);
			el.removeEventListener('cancel', onCancel);
		};
	});
</script>

<dialog class="pl-dialog" bind:this={dialog} aria-labelledby="pl-title" data-testid="present-dialog">
	{#if open}
		<div class="pl-stage">
			<header class="pl-top">
				<h2 class="pl-title" id="pl-title">Presentations</h2>
				<button type="button" class="btn secondary pl-close" data-testid="present-close" onclick={() => onclose()}>
					Close
				</button>
			</header>

			{#if current}
				<section class="pl-now" aria-live="polite">
					<p class="pl-position" data-testid="present-position">{index + 1} of {queue.length}</p>
					<p class="pl-name" data-testid="present-name">{current.displayName}</p>
					<p class="pl-host" data-testid="present-host">{current.links[0]?.host ?? ''}</p>
					{#if current.links[0]?.url}
						<a
							class="btn pl-open"
							href={current.links[0].url}
							target="_blank"
							rel="noopener noreferrer"
							bind:this={openKey}
							data-testid="present-open"
						>
							Open {current.links[0].host || 'the link'}
						</a>
					{/if}
					{#if current.links.length > 1}
						<ul class="pl-more" data-testid="present-more">
							{#each current.links.slice(1) as link, i (`${link.url}:${i}`)}
								<li>
									<a
										class="btn secondary pl-more-open"
										href={link.url}
										target="_blank"
										rel="noopener noreferrer">Open {link.host}</a
									>
									<span class="pl-more-label">{link.label}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</section>

				<nav class="pl-nav" aria-label="Presenters">
					<!-- aria-disabled, never disabled, at the ends: a disabled key swallows
					     its own press and could never say why nothing happened. -->
					<button
						type="button"
						class="btn secondary pl-step"
						aria-disabled={atStart}
						data-testid="present-prev"
						onclick={() => go(-1)}
					>
						&lsaquo; Previous
					</button>
					<button
						type="button"
						class="btn secondary pl-step"
						aria-disabled={atEnd}
						data-testid="present-next"
						onclick={() => go(1)}
					>
						Next &rsaquo;
					</button>
				</nav>
				{#if note}<p class="pl-note" role="status" data-testid="present-note">{note}</p>{/if}
			{:else}
				<p class="pl-empty" data-testid="present-empty">Nobody has handed in a link that opens yet.</p>
			{/if}

			<div class="pl-queue">
				<Disclosure label="Everyone presenting" {scope} collapseWhen testId="present-queue">
					{#snippet meta()}
						<span class="pl-count">{queue.length}</span>
					{/snippet}
					<ol class="pl-list">
						{#each queue as entry, i (entry.email)}
							<li>
								<button
									type="button"
									class="btn secondary pl-jump"
									class:on={i === index}
									aria-current={i === index ? 'true' : undefined}
									onclick={() => jump(i)}
								>
									{i + 1}. {entry.displayName}
								</button>
							</li>
						{/each}
					</ol>
				</Disclosure>
				{#if missing > 0}
					<p class="pl-missing" data-testid="present-missing">
						{missing}
						{missing === 1 ? 'student has' : 'students have'} no link that opens{notWorking > 0
							? `, and ${notWorking} of them typed something that is not a link`
							: ''}. They are not in this list.
					</p>
				{/if}
			</div>
		</div>
	{/if}
</dialog>

<style>
	/* THE WHOLE VIEWPORT, because it is on a projector. The dialog is in the top
	   layer, so nothing behind it competes, and its DOM position inside the
	   classroom room is what gives it the room's tokens in every theme. */
	.pl-dialog {
		width: 100vw;
		height: 100dvh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: var(--surface-0, var(--bg0));
		color: var(--text-1);
	}
	.pl-dialog::backdrop {
		background: rgba(0, 0, 0, 0.6);
	}
	.pl-stage {
		box-sizing: border-box;
		min-height: 100%;
		display: flex;
		flex-direction: column;
		gap: clamp(1rem, 3vh, 2.5rem);
		padding: clamp(1rem, 4vw, 3rem);
	}
	.pl-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.pl-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 1rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.pl-close,
	.pl-step,
	.pl-open,
	.pl-jump,
	.pl-more-open {
		min-height: 44px;
	}
	.pl-now {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: clamp(0.5rem, 2vh, 1.25rem);
	}
	.pl-position {
		margin: 0;
		font-family: var(--font-mono);
		font-size: clamp(1rem, 2vw, 1.4rem);
		color: var(--text-2);
	}
	/* READ FROM THE BACK OF THE ROOM: the name is the largest thing on the wall. */
	.pl-name {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(2.5rem, 7vw, 6rem);
		line-height: 1.05;
		overflow-wrap: anywhere;
		color: var(--text-1);
	}
	.pl-host {
		margin: 0;
		font-family: var(--font-mono);
		font-size: clamp(1.1rem, 2.2vw, 1.6rem);
		color: var(--text-2);
	}
	.pl-open {
		font-size: clamp(1.1rem, 2.4vw, 1.6rem);
		padding: 0.6em 1.4em;
		text-decoration: none;
	}
	.pl-more {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem 1rem;
	}
	.pl-more li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.pl-more-label {
		font-size: 0.95rem;
		color: var(--text-2);
	}
	.pl-nav {
		display: flex;
		justify-content: center;
		gap: 1rem;
	}
	.pl-step {
		font-size: clamp(1rem, 1.8vw, 1.3rem);
		padding-inline: 1.4em;
	}
	.pl-note,
	.pl-empty,
	.pl-missing {
		margin: 0;
		text-align: center;
		font-size: 1rem;
		color: var(--text-2);
	}
	.pl-queue {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.pl-count {
		font-family: var(--font-mono);
		color: var(--text-2);
	}
	.pl-list {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
</style>
