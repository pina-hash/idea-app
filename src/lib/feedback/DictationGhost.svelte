<script lang="ts">
	/**
	 * THE WORDS STILL BEING HEARD, DRAWN IN GREY WHERE THEY WILL LAND (report
	 * 5ab3adb6: "Claude shows them grey, inline, in the field").
	 *
	 * THE FIELD IS NEVER WRITTEN. The textarea is the caller's, rendered as this
	 * component's `children` and left exactly as it is: its value, its input
	 * events, its save machine and its `maxlength` never see a word that is
	 * still a guess. What this draws is a MIRROR laid over it: an `aria-hidden`,
	 * `pointer-events: none` box with the field's own font, size, line height,
	 * padding and borders, holding the field's text in a transparent ink and
	 * then the `ghost` (the exact suffix `DictationJoin.preview` says the next
	 * final will add, a closing period and a capital included) in a dim one.
	 * The words wrap where the field's own would, so what is shown is where it
	 * lands.
	 *
	 * THE FIELD'S GROUND IS UNTOUCHED. On a plated page `plate.css` owns every
	 * textarea's background, and fighting it with a transparent field would
	 * lose; the mirror has no background of its own and simply sits above.
	 *
	 * A GUESS THAT RUNS PAST THE FIELD'S LAST LINE STAYS IN VIEW. The field can
	 * only scroll as far as its own text, so while a guess adds lines the
	 * field's height is pinned where it is and its bottom padding grows by
	 * exactly those lines: the field and the mirror then scroll as one, to the
	 * bottom, and nothing moves on the page. Both inline values are put back
	 * the moment the guess ends or the session closes (a height the person set
	 * by dragging the corner in between is theirs and is kept). The value, the
	 * ground and the border are never touched.
	 *
	 * WHEN IT CANNOT LINE UP, IT SAYS THE WORDS UNDER THE FIELD INSTEAD. No
	 * layout to read (a test DOM, a field not yet laid out) draws the same
	 * words as one line under the field rather than nothing at all.
	 *
	 * THE TEXTAREA IS FOUND, NOT HANDED IN. It is a descendant of this
	 * component's own wrapper, so every DOM call below is on local state and no
	 * effect calls a caller-supplied binding (the repo-wide effect sweep).
	 */
	import { untrack, type Snippet } from 'svelte';

	let {
		text,
		ghost,
		active,
		children
	}: {
		/** The field's current value, exactly. */
		text: string;
		/** What will be appended when the words being heard are final; '' for nothing. */
		ghost: string;
		/** Whether a dictation session is open on this field. No mirror otherwise. */
		active: boolean;
		children: Snippet;
	} = $props();

	let wrapEl = $state<HTMLDivElement | null>(null);
	let mirrorEl = $state<HTMLDivElement | null>(null);
	/** The words are drawn under the field rather than over it. */
	let below = $state(false);

	/** Every computed property that moves a glyph, copied from the field. */
	const COPIED = [
		'boxSizing',
		'fontFamily',
		'fontSize',
		'fontWeight',
		'fontStyle',
		'fontStretch',
		'fontVariant',
		'fontKerning',
		'fontFeatureSettings',
		'lineHeight',
		'letterSpacing',
		'wordSpacing',
		'textTransform',
		'textIndent',
		'textAlign',
		'tabSize',
		'whiteSpace',
		'overflowWrap',
		'wordBreak',
		'direction',
		'paddingTop',
		'paddingBottom',
		'paddingLeft',
		'borderTopWidth',
		'borderRightWidth',
		'borderBottomWidth',
		'borderLeftWidth'
	] as const;

	function fieldOf(wrap: HTMLElement): HTMLTextAreaElement | null {
		return wrap.querySelector('textarea');
	}

	/** The field's own inline values while a guess has made room in it, or null. */
	let made: { area: HTMLTextAreaElement; pad: string; height: string; ours: string } | null = null;

	/** Put the field's own padding and height back. */
	function giveBack() {
		const m = made;
		made = null;
		if (!m) return;
		m.area.style.paddingBottom = m.pad;
		// A height the person dragged to while dictating is theirs.
		if (m.area.style.height === m.ours) m.area.style.height = m.height;
	}

	/** How far the guess's last line sits below the field text's last line. */
	function extraBelow(mirror: HTMLElement): number {
		const tail = mirror.querySelector('.dg-ghost')?.getClientRects();
		if (!tail || !tail.length) return 0;
		const base = mirror.querySelector('.dg-base')?.getClientRects();
		const from = base && base.length ? base[base.length - 1].bottom : tail[0].bottom;
		return Math.max(0, tail[tail.length - 1].bottom - from);
	}

	/** Lay the mirror over the field and line its scroll up with the field's. */
	function sync() {
		const wrap = wrapEl;
		const mirror = mirrorEl;
		if (!wrap || !mirror) return;
		const area = fieldOf(wrap);
		if (!area || !(area.offsetWidth > 0) || typeof getComputedStyle !== 'function') {
			below = true;
			return;
		}
		// Measure the field as it is, never with room a previous guess made.
		giveBack();
		const cs = getComputedStyle(area) as unknown as Record<string, string>;
		const ms = mirror.style as unknown as Record<string, string>;
		for (const p of COPIED) ms[p] = cs[p];
		const bl = parseFloat(cs.borderLeftWidth) || 0;
		const br = parseFloat(cs.borderRightWidth) || 0;
		// A field with a scrollbar wraps in a narrower box; the mirror's padding
		// takes the scrollbar's width so its lines break where the field's do.
		const scrollbar = Math.max(0, area.offsetWidth - area.clientWidth - bl - br);
		ms.paddingRight = `${(parseFloat(cs.paddingRight) || 0) + scrollbar}px`;
		ms.top = `${area.offsetTop}px`;
		ms.left = `${area.offsetLeft}px`;
		ms.width = `${area.offsetWidth}px`;
		ms.height = `${area.offsetHeight}px`;
		below = false;
		if (!ghost) {
			mirror.scrollTop = area.scrollTop;
			return;
		}
		const extra = extraBelow(mirror);
		if (extra > 0.5) {
			const padB = parseFloat(cs.paddingBottom) || 0;
			const padT = parseFloat(cs.paddingTop) || 0;
			const bt = parseFloat(cs.borderTopWidth) || 0;
			const bb = parseFloat(cs.borderBottomWidth) || 0;
			const height =
				cs.boxSizing === 'border-box' ? area.offsetHeight : area.offsetHeight - padT - padB - bt - bb;
			made = { area, pad: area.style.paddingBottom, height: area.style.height, ours: '' };
			area.style.height = `${height}px`;
			area.style.paddingBottom = `${padB + extra}px`;
			made.ours = area.style.height;
		}
		// While words are arriving the end of the field is what matters.
		area.scrollTo({ top: area.scrollHeight, behavior: 'instant' });
		mirror.scrollTop = area.scrollTop;
	}

	$effect(() => {
		// TRACKED: what is drawn and whether a mirror is on screen. The DOM work
		// is untracked so the `below` it writes is never one of its own inputs.
		void text;
		void ghost;
		const on = active;
		const mirror = mirrorEl;
		if (!on || !mirror) return;
		untrack(sync);
	});

	$effect(() => {
		const wrap = wrapEl;
		const mirror = mirrorEl;
		if (!active || !wrap || !mirror) return;
		const area = fieldOf(wrap);
		if (!area) return;
		const onScroll = () => {
			mirror.scrollTop = area.scrollTop;
		};
		area.addEventListener('scroll', onScroll);
		// The field is `resize: vertical` in places: a drag changes its box.
		// Its BORDER box, so the room a guess makes inside it is not a resize.
		const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => untrack(sync)) : null;
		ro?.observe(area, { box: 'border-box' });
		return () => {
			area.removeEventListener('scroll', onScroll);
			ro?.disconnect();
			giveBack();
		};
	});
</script>

<div class="dg-wrap" class:dg-ghosting={active && ghost !== ''} bind:this={wrapEl}>
	{@render children()}
	{#if active}
		<div class="dg-mirror" aria-hidden="true" bind:this={mirrorEl}>
			<span class="dg-base">{text}</span><span class="dg-ghost" class:dg-off={below}>{ghost}</span>
		</div>
	{/if}
</div>
{#if active && below && ghost}
	<p class="dg-line" aria-hidden="true">{ghost.trimStart()}</p>
{/if}

<style>
	.dg-wrap {
		position: relative;
	}
	.dg-mirror {
		position: absolute;
		top: 0;
		left: 0;
		margin: 0;
		overflow: hidden;
		pointer-events: none;
		border-style: solid;
		border-color: transparent;
		background: none;
		/* A textarea's own wrapping, until the copied values land. */
		white-space: pre-wrap;
		overflow-wrap: break-word;
	}
	.dg-base {
		color: transparent;
	}
	/* THE GUESS: a dim ink and a dotted underline, so it reads as not yet
	   written even to somebody who cannot tell the two inks apart. Nothing
	   here changes a glyph's width, so the words wrap where they will land. */
	.dg-ghost,
	.dg-line {
		color: var(--dg-ink, var(--text-2));
		text-decoration: underline dotted;
		text-decoration-thickness: 1px;
		text-underline-offset: 0.2em;
	}
	.dg-off {
		visibility: hidden;
	}
	.dg-line {
		margin: 0.3rem 0 0;
		font-size: 0.75rem;
		line-height: 1.45;
		overflow-wrap: anywhere;
	}
	/* The placeholder steps aside while a guess is drawn over an empty field. */
	.dg-ghosting :global(textarea::placeholder) {
		color: transparent;
	}
</style>
