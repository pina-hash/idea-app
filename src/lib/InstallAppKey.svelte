<script lang="ts">
	/**
	 * THE INSTALL APP KEY in the home header (ledger 0396), beside Take the tour
	 * and Sign in, for everybody, signed in or not, on a desktop or a phone.
	 *
	 * WHAT IT DOES IS `installKeyMode` IN `$lib/install-app`, the one decision:
	 * - a Chromium browser that has offered to install (desktop Chrome and Edge,
	 *   Android Chrome): the press opens the browser's own install dialog
	 *   (`promptInstall`, which hands over the one stashed event and never calls
	 *   `prompt()` twice);
	 * - iPhone and iPad, where Apple gives a page no way to install itself: the
	 *   press opens a small card with the two taps, Share then Add to Home
	 *   Screen, in the phone pop-up's own words with the Share icon drawn in;
	 *   Safari 26 and later on a Mac gets the same card for Add to Dock;
	 * - after the browser's own dialog was declined, a card pointing at the
	 *   browser's own install controls, so the key is still there for somebody
	 *   who changes their mind (the page cannot reopen that dialog until the
	 *   browser offers again);
	 * - nothing at all when the site is already running installed, after
	 *   `appinstalled`, and in a browser with no install path a page can reach.
	 *
	 * THE KEY IS THE HEADER'S OWN PLATE KEY. It wears `.auth-link`, which is on
	 * the plate's key list for `.legacy-index`, so it is the same raised key as
	 * Take the tour and Sign in, with the same 44px floor.
	 *
	 * IT GOES DOWN TO AN ICON WHEN ITS WORD DOES NOT FIT, AND THE HEADER DECIDES.
	 * The header's other controls change with who is looking (a class chip, an
	 * admin link, the quick note, the profile menu), so no breakpoint can say
	 * when "Install app" fits. `fitHomeHeader` in `$lib/home-header-fit`, on the
	 * home page's header, lays the row out every way it may go and writes
	 * `data-fit` on this key: as the window narrows the lines-of-code readout
	 * gives way first, then this key's word, then the class chip, each once,
	 * and the word only where it does not fit there or at some wider width (a
	 * teacher's phone, with no class chip, keeps it).
	 * In the icon form the word stays in the button, visually hidden, so the
	 * key's accessible name is "Install app" either way and the target stays
	 * 44px.
	 *
	 * THE CARD closes on Escape, on a tap anywhere outside it and on its Close
	 * key, and focus goes back to the key. It is a non-modal dialog positioned
	 * by `$lib/shell/anchored`, so it stays inside the window at 375px.
	 *
	 * AND IT CLOSES ONCE NOTHING IT BELONGS TO IS THERE (review round 2). Focus
	 * leaving both the card and the key, by Tab or by Shift+Tab, closes it and
	 * leaves focus where it went, so a later Escape never pulls focus back from
	 * somewhere else. And the page scrolling the key out of the window closes
	 * it: `anchored` keeps a fixed panel inside the window, so an open card used
	 * to sit 8px from the top, over the launcher, with its key 340px off screen,
	 * where the profile menu's and the quick note's panels scroll away with the
	 * header.
	 *
	 * THE CARD IS MOVED OUT OF THE HEADER, TO THE ROOM'S ROOT, AND THAT IS FORCED
	 * (review round 1). The header carries a `backdrop-filter`, which makes it
	 * the containing block of every `position: fixed` box inside it, so the
	 * viewport coordinates `anchored` writes were applied from the header's own
	 * box: after 24px of scroll the card opened 15.8px up over the key, and after
	 * 44px its title was off the top of the window (the error was the scroll
	 * offset, measured at 375 and 1440). At `.legacy-index`, the room's root, it
	 * keeps the room's tokens and the plate's panel housing, and `fixed` means
	 * the window again. It goes straight after the header, so it is next in
	 * reading order, and the Tab key is walked by hand (`onCardKeydown`,
	 * `onKeyKeydown`) so the order stays what it was in the header: the key, the
	 * card's Close, then Take the tour.
	 *
	 * WHILE THE CARD IS OPEN THE PHONE POP-UP STEPS ASIDE (`setInstallCardOpen`),
	 * so the same Share steps are never on screen twice. The pop-up's own
	 * once-and-dismissed memory is untouched: it comes back when the card closes.
	 */
	import { onMount, tick } from 'svelte';
	import { anchored } from '$lib/shell/anchored';
	import InstallSteps from '$lib/InstallSteps.svelte';
	import {
		INSTALL_COPY,
		UNKNOWN_INSTALL,
		installKeyMode,
		promptInstall,
		readInstall,
		setInstallCardOpen,
		subscribeInstall,
		type InstallSnapshot
	} from '$lib/install-app';

	const uid = $props.id();
	const cardId = `ia-card-${uid}`;
	const titleId = `ia-title-${uid}`;

	let snapshot = $state<InstallSnapshot>(UNKNOWN_INSTALL);
	const mode = $derived(installKeyMode(snapshot));
	const steps = $derived(mode === 'mac-safari' ? INSTALL_COPY.mac : INSTALL_COPY.ios);
	let open = $state(false);
	let busy = $state(false);
	let keyEl = $state<HTMLButtonElement | null>(null);
	let cardEl = $state<HTMLDivElement | null>(null);
	let closeEl = $state<HTMLButtonElement | null>(null);

	/* ONE writer of `open`, so the pop-up hears every change. */
	function setOpen(value: boolean) {
		open = value;
		setInstallCardOpen(value);
	}

	onMount(() => {
		snapshot = readInstall();
		const stop = subscribeInstall(() => {
			snapshot = readInstall();
			/* A card belongs to the mode it was opened in: if the key stops
			   having one (installed, or the browser offered again), the card is
			   closed rather than left to reappear when a card mode comes back. */
			const next = installKeyMode(snapshot);
			if (open && (next === null || next === 'prompt')) setOpen(false);
		});
		return () => {
			stop();
			if (open) setInstallCardOpen(false);
		};
	});

	const shown = $derived(open && mode !== null && mode !== 'prompt');

	async function openCard() {
		setOpen(true);
		await tick();
		closeEl?.focus({ preventScroll: true });
	}

	function closeCard(returnFocus: boolean) {
		if (!open) return;
		setOpen(false);
		if (returnFocus) keyEl?.focus({ preventScroll: true });
	}

	async function press() {
		/* While the browser's dialog is up the key already points at the menu
		   card, so the second click of a quick double click must not open that
		   card under the dialog. */
		if (busy) return;
		if (mode === 'prompt') {
			busy = true;
			try {
				await promptInstall();
			} finally {
				busy = false;
			}
			return;
		}
		if (open) closeCard(true);
		else void openCard();
	}

	/* Whether focus is on the card or on the key, the two things the card belongs to. */
	function focusIsOurs(): boolean {
		const active = document.activeElement;
		return !!active && (!!cardEl?.contains(active) || !!keyEl?.contains(active));
	}

	/* Escape gives focus back to the key when it was on the card, on the key or
	   on nothing (the page itself). Focus on any other control stays there. */
	function onKeydown(e: KeyboardEvent) {
		if (!shown || e.key !== 'Escape') return;
		const active = document.activeElement;
		const elsewhere = !!active && active !== document.body && !focusIsOurs();
		if (!elsewhere) e.preventDefault();
		closeCard(!elsewhere);
	}

	/* OUTSIDE A TAP IS `pointerdown`, NEVER `click`, and a target that has left
	   the document is ignored (CLAUDE.md, the DOM traps): otherwise the press
	   that opened the card would close it again. The key's own press toggles.
	   Focus goes back to the key unless the tap itself gave focus to something
	   (a field, a link): the browser moves focus after this handler, so the
	   check waits one task and only reclaims a focus that fell to the page. */
	function onPointerDown(e: PointerEvent) {
		if (!shown) return;
		const target = e.target as Node | null;
		if (!target || !target.isConnected) return;
		if (cardEl?.contains(target) || keyEl?.contains(target)) return;
		closeCard(false);
		setTimeout(() => {
			const active = document.activeElement;
			if (!active || active === document.body) keyEl?.focus({ preventScroll: true });
		}, 0);
	}

	/* Focus leaving the card AND the key, either way round (Tab past the card,
	   Shift+Tab past the key), closes it and leaves focus where it went. A move
	   between the two keeps it open, and so does focus leaving the window (no
	   `relatedTarget`), which is a switch of window rather than a choice. */
	function onFocusOut(e: FocusEvent) {
		if (!shown) return;
		const to = e.relatedTarget as Node | null;
		if (!to || cardEl?.contains(to) || keyEl?.contains(to)) return;
		closeCard(false);
	}

	/* THE KEY SCROLLED OUT OF THE WINDOW CLOSES THE CARD. Watched only while the
	   card is open. Focus inside the card goes back to the key without scrolling,
	   so a keyboard keeps its place in the page. */
	$effect(() => {
		const key = keyEl;
		if (!shown || !key || typeof IntersectionObserver !== 'function') return;
		const io = new IntersectionObserver((entries) => {
			const last = entries[entries.length - 1];
			if (!last || last.isIntersecting) return;
			const hadFocus = !!cardEl?.contains(document.activeElement);
			closeCard(false);
			if (hadFocus) key.focus({ preventScroll: true });
		});
		io.observe(key);
		return () => io.disconnect();
	});

	/**
	 * THE CARD'S LAYER GOES TO THE ROOM'S ROOT, straight after the header (see
	 * the top of this file for why). Only where there is a room: mounted
	 * anywhere else it stays where it is.
	 *
	 * WHAT MOVES IS NEVER THE EDGE OF A BLOCK. The layer sits inside `.ia-slot`,
	 * which stays in the header and is this component's last node, so when a
	 * block holding this component is torn down Svelte walks the slot and never
	 * the moved layer (a walk that started or ended on a node somewhere else
	 * would run on through the header's siblings). The `{#if}` inside the layer
	 * moves with it, and `destroy` takes the layer away with the component.
	 */
	function toRoom(node: HTMLElement) {
		const room = node.closest('.legacy-index');
		if (!room) return {};
		const header = node.closest('header');
		if (header && header.parentElement === room) header.after(node);
		else room.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	const TABBABLE =
		'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

	function tabbables(root: ParentNode): HTMLElement[] {
		return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
			(el) => el.tabIndex >= 0 && el.getClientRects().length > 0
		);
	}

	/* Tab from the key, with the card open, goes into the card, which is no
	   longer the key's neighbour in the document. */
	function onKeyKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab' || e.shiftKey || !shown || !cardEl) return;
		const first = tabbables(cardEl)[0];
		if (!first) return;
		e.preventDefault();
		first.focus();
	}

	/* Shift+Tab from the card's first control goes back to the key, the card
	   still open; Tab from its last goes on to whatever follows the key in the
	   header (Take the tour), and the card closes because focus left it. */
	function onCardKeydown(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !cardEl || !keyEl) return;
		const inCard = tabbables(cardEl);
		const active = document.activeElement;
		if (e.shiftKey) {
			if (active !== inCard[0]) return;
			e.preventDefault();
			keyEl.focus();
			return;
		}
		if (active !== inCard[inCard.length - 1]) return;
		const order = tabbables(document).filter((el) => !cardEl!.contains(el));
		const next = order[order.indexOf(keyEl) + 1];
		if (!next) return;
		e.preventDefault();
		next.focus();
		closeCard(false);
	}
</script>

<svelte:window onkeydown={onKeydown} />
<svelte:document onpointerdowncapture={onPointerDown} />

{#if mode}
	<button
		bind:this={keyEl}
		type="button"
		class="auth-link install-key"
		class:on={shown}
		data-install="key"
		data-install-mode={mode}
		data-tour="install"
		aria-haspopup={mode === 'prompt' ? undefined : 'dialog'}
		aria-expanded={mode === 'prompt' ? undefined : shown}
		aria-controls={mode === 'prompt' ? undefined : cardId}
		aria-busy={busy || undefined}
		onclick={press}
		onkeydown={onKeyKeydown}
		onfocusout={onFocusOut}
	>
		<svg class="ia-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"
			><path d="M12 3.5v10" /><path d="M7.5 9.5l4.5 4.5 4.5-4.5" /><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" /></svg
		>
		<span class="ia-word">{INSTALL_COPY.key}</span>
	</button>
{/if}
<span class="ia-slot"
	><div class="ia-layer" use:toRoom>
	{#if shown}
		<div
			bind:this={cardEl}
			class="ia-card"
			id={cardId}
			role="dialog"
			tabindex="-1"
			aria-labelledby={titleId}
			data-install="card"
			use:anchored={{ anchor: keyEl, open: shown, prefer: 'below', align: 'end', gap: 8 }}
			onfocusout={onFocusOut}
			onkeydown={onCardKeydown}
		>
			<div class="ia-card-title" id={titleId}>{INSTALL_COPY.title}</div>
			<p class="ia-card-body">
				{#if mode === 'menu'}{INSTALL_COPY.menu}{:else}<InstallSteps {steps} />{/if}
			</p>
			<div class="ia-card-actions">
				<button bind:this={closeEl} type="button" class="auth-link ia-close" onclick={() => closeCard(true)}>Close</button>
			</div>
		</div>
	{/if}
</div></span
>

<style>
	/* The key's look is the header's (`.legacy-index .auth-link` in app.css,
	   and the plate's key list). What is its own: the icon form. */
	.install-key {
		position: relative;
		gap: 0.45rem;
		justify-content: center;
	}
	.ia-glyph {
		display: none;
		width: 18px;
		height: 18px;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.install-key:global([data-fit='compact']) {
		min-width: 44px;
		padding-inline: 0;
	}
	.install-key:global([data-fit='compact']) .ia-glyph {
		display: block;
	}
	/* Visually hidden, still the button's name. */
	.install-key:global([data-fit='compact']) .ia-word {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	/* The slot and the card's layer take no box, here in the header before the
	   layer moves and at the room's root after, so neither is a flex item in
	   the header's row (no gap, no shift). */
	.ia-slot,
	.ia-layer {
		display: contents;
	}

	/* THE CARD. Its housing under the site plate is plate.css's floating
	   panel, the profile menu's and the quick note's; these are the fallbacks
	   for a page with no plate, and its own geometry. `position: fixed` from the
	   first frame, so it never takes a place in the header's row before
	   `anchored` writes its coordinates. */
	.ia-card {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 120;
		box-sizing: border-box;
		width: min(20rem, calc(100vw - 2rem));
		padding: 0.95rem 1rem 0.85rem;
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: 10px;
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
		text-align: left;
		white-space: normal;
	}
	.ia-card-title {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--green);
	}
	.ia-card-body {
		margin: 0.45rem 0 0.75rem;
		font-family: var(--font-display);
		font-size: 1rem;
		line-height: 1.45;
		color: var(--text-1);
	}
	.ia-card-actions {
		display: flex;
		justify-content: flex-end;
	}
	/* Close is the header's own key (`.auth-link`), but the card is not in the
	   header's row any more, so the row's 44px floor (app.css) does not reach
	   it: the same floor, here. */
	.ia-close {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		box-sizing: border-box;
	}
</style>
