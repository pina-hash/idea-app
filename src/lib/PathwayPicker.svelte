<script lang="ts" module>
	/**
	 * Fired on window when the picker stops owning the screen (pathway chosen or
	 * "Choose later"), so waiting UI (the first-time tour) can proceed.
	 */
	export const PATHWAY_PICKER_DONE_EVENT = 'idea:pathway-picker-done';

	/**
	 * THE DEFERRAL, AND IT IS ONE RULE IN ONE PLACE.
	 *
	 * "Choose later" used to write `sessionStorage`, so a RELOAD undid it and
	 * the sheet came back. That is the half of report 0276 nobody had a name
	 * for: the student wrote "I reloaded and tried different mouses", and a
	 * reload is exactly what restored the thing in their way. `localStorage`
	 * survives the reload.
	 *
	 * IT EXPIRES, AND THE CAP IS THE WHOLE OF WHAT MAKES PERMANENCE SAFE. This
	 * picker is the ONLY student-facing way a pathway is ever set -- the only
	 * other write in `src/` is `/dashboard`, which is admin-only -- so a
	 * deferral with no end would quietly mean "this student never gets a
	 * pathway", which is the identity every Bosco Tech student is supposed to
	 * carry. Seven days leaves them alone for a school week and asks again the
	 * next one. Same shape as `$lib/notebook/draft-mirror.ts`: one namespaced
	 * key, a stored shape version, an UNKNOWN version DROPPED rather than
	 * coerced, an age cap, and a refusal RETURNED rather than thrown. It does
	 * not carry that module's "say it out loud" half, and `later()` below
	 * carries the reason.
	 */
	const DEFER_KEY = 'pathway_picker_deferred';
	/** The pre-0276 session key, read once so a mid-session deferral is honored. */
	const LEGACY_SESSION_KEY = 'pathway-picker-dismissed';
	const DEFER_SHAPE = 1;
	export const PATHWAY_DEFER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

	/**
	 * Is the picker currently deferred? THE ONE READER OF THAT QUESTION --
	 * `HomeTour` calls this rather than spelling the storage rule a second
	 * time, which is what it used to do (a bare `sessionStorage.getItem`), and
	 * two copies of "has this been deferred" is exactly the pair that stops
	 * agreeing the moment the store changes.
	 */
	export function pathwayPickerDeferred(now = Date.now()): boolean {
		try {
			const raw = localStorage.getItem(DEFER_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as { v?: number; at?: number };
				// An unknown shape is DROPPED, never coerced: a deferral this build
				// cannot read is not a deferral it may guess at.
				if (parsed?.v !== DEFER_SHAPE || typeof parsed.at !== 'number') return false;
				return now - parsed.at < PATHWAY_DEFER_MAX_AGE_MS;
			}
			// Nothing in the durable store: honor a deferral made before this
			// bundle shipped, so a student mid-session is not re-prompted.
			return !!sessionStorage.getItem(LEGACY_SESSION_KEY);
		} catch {
			/* storage unavailable or blocked: not deferred, so the prompt shows.
			   Failing toward asking is right here -- the picker is dismissible in
			   three ways now, and a silently swallowed deferral costs one press. */
			return false;
		}
	}

	/** Record the deferral. Returns false when the store refused it. */
	export function deferPathwayPicker(now = Date.now()): boolean {
		try {
			localStorage.setItem(DEFER_KEY, JSON.stringify({ v: DEFER_SHAPE, at: now }));
			return true;
		} catch {
			return false;
		}
	}
</script>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { PATHWAYS, withAlpha, type PathwayId } from '$lib/pathways';
	import type { UserProfile } from '$lib/profile';

	/**
	 * First-login pathway picker, mounted once in the root layout. Self-contained
	 * like ProfileMenu: reads the session from page data and renders nothing
	 * unless the signed-in user is a STUDENT with no pathway set. Choosing
	 * persists profiles.pathway through the browser client (the "update own
	 * profile" RLS policy), so once set it never prompts again. "Choose later"
	 * defers it for a week through the durable store in the module block above;
	 * it used to be session-only, which a reload undid. Pathway is identity
	 * only, never an access gate, so the picker never blocks navigation.
	 *
	 * IT OWNS THE SCREEN, AND IT NOW SAYS SO HONESTLY. The overlay covers 100%
	 * of the viewport and absorbs every click, but `position: fixed` does NOT
	 * absorb the WHEEL -- a wheel event over a fixed element chains straight
	 * past it to the document, which is why a modal conventionally needs a body
	 * lock at all. Measured at 2707x1074, the reporter's own viewport: with this
	 * sheet up, a real trusted wheel moved the document its full 415px range and
	 * only 7.9% of the viewport's pixels changed, against 39.5% with the overlay
	 * hidden on the same page and the same range. So the page was genuinely
	 * scrolling and it was invisible, which is a much worse state than a page
	 * that refuses: a refusal is legible, and a 7.9% scroll reads as a broken
	 * mouse. That is report 0276 -- "I cant scroll on the home page. I reloaded
	 * and tried different mouses." Three changes answer it: the body scroll is
	 * LOCKED while the sheet is up so the blocked state is true rather than
	 * nearly-true, the scrim is a real dismiss control so there is a way out
	 * besides two buttons a reader may never reach, and the deferral survives
	 * the reload that used to bring the sheet back.
	 *
	 * Suppressed on the FSP tech-selection tool (the neutral, non-IDEA-branded
	 * schoolwide route reached cold via QR code) and its static staff preview:
	 * the picker's IDEA-green modal has no place popping over that neutral
	 * surface. This is a route-path check on the exact two paths only, so every
	 * other route keeps the exact existing behavior.
	 */

	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);

	const SUPPRESSED_ROUTES = ['/fsp-tech-selection', '/fsp-tech-selection/preview'];
	const suppressed = $derived(SUPPRESSED_ROUTES.includes(page.url.pathname));

	/* Read ONCE at construction, through the module's own predicate rather than
	   a second spelling of the storage rule. `pathwayPickerDeferred` swallows
	   its own SSR failure, so no try/catch belongs here. */
	let deferred = $state(pathwayPickerDeferred());

	let selected: PathwayId | null = $state(null);
	let saving = $state(false);
	let errorMsg = $state('');

	const show = $derived(
		!suppressed && !deferred && !!claims && profile?.role === 'student' && !profile.pathway
	);

	/**
	 * LOCK THE PAGE WHILE THE SHEET IS UP, AND NEVER LEAVE IT LOCKED.
	 *
	 * `body { overflow: hidden }` is what actually stops a real trusted wheel
	 * here, measured both ways on the real page: locked 0 -> 0, cleared 0 ->
	 * 300. The previous inline value is captured and restored rather than
	 * blanked, so this composes with any other surface doing the same thing
	 * (`ContentComposer` does) instead of clobbering it.
	 *
	 * The cleanup is the whole guarantee: an `$effect` teardown runs both when
	 * `show` goes false AND when the component is destroyed, so there is no
	 * path -- dismiss, choose, or navigate -- on which the lock outlives the
	 * sheet. Nothing caller-supplied is called in here, so there is nothing to
	 * `untrack`; `show` is the dependency this effect exists for.
	 */
	$effect(() => {
		if (!show) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});

	/**
	 * Defer, dismiss, and tell the tour it may start.
	 *
	 * `deferPathwayPicker`'s refusal is DELIBERATELY NOT RENDERED, and that is
	 * the one place this departs from the draft-mirror rule it otherwise copies
	 * ("a quota refusal is said out loud"). That rule protects a store holding
	 * the ONLY copy of somebody's writing, where a silent failure loses work
	 * nobody can see is gone. Here the entire consequence of a refused write is
	 * that this sheet appears again next visit -- which the student sees, by
	 * definition, the moment it happens. There is also nowhere honest to put
	 * the sentence: dismissing unmounts the panel in the same tick, so a notice
	 * inside it could never render (CLAUDE.md: an acknowledgement must survive
	 * the act it reports). The boolean is returned rather than swallowed so a
	 * caller that DOES have somewhere to say it can.
	 */
	const later = () => {
		deferPathwayPicker();
		deferred = true;
		window.dispatchEvent(new CustomEvent(PATHWAY_PICKER_DONE_EVENT));
	};

	const confirm = async () => {
		if (!claims || !selected) return;
		saving = true;
		errorMsg = '';
		// Select the row back to confirm the write actually landed (a zero-row
		// RLS-blocked update otherwise reads as success; see ProfileMenu).
		const { data, error } = await supabase
			.from('profiles')
			.update({ pathway: selected })
			.eq('id', claims.sub)
			.select('id');
		if (error) {
			errorMsg = error.message;
		} else if (!data || data.length === 0) {
			errorMsg = 'Could not save your pathway. Try signing out and back in.';
		} else {
			await invalidateAll();
			window.dispatchEvent(new CustomEvent(PATHWAY_PICKER_DONE_EVENT));
		}
		saving = false;
	};

	const onKeydown = (e: KeyboardEvent) => {
		if (show && e.key === 'Escape') later();
	};
</script>

<svelte:window onkeydown={onKeydown} />

{#if show}
	<div class="pwp-overlay">
		<div class="pwp-panel" role="dialog" aria-modal="true" aria-labelledby="pwp-title">
			<div class="pwp-eyebrow">Bosco Tech</div>
			<h2 id="pwp-title">Choose your pathway</h2>
			<p class="pwp-sub">
				Every Bosco Tech student is identified by their pathway. Pick yours once and it becomes part
				of your profile across the portal. It never limits what you can access, and a teacher can
				correct it later if needed.
			</p>

			<div class="pwp-grid">
				{#each PATHWAYS as p (p.id)}
					<button
						class="pwp-option"
						class:selected={selected === p.id}
						type="button"
						disabled={saving}
						style="--pw:{p.color}; --pw-ink:{p.ink}; --pw-bg:{withAlpha(p.color, 0.1)}; --pw-line:{withAlpha(p.color, 0.45)}"
						onclick={() => (selected = p.id)}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- static markup from the pathways registry, never user input -->
							{@html p.icon}
						</svg>
						<span class="pwp-code">{p.label}</span>
					</button>
				{/each}
			</div>

			{#if errorMsg}
				<p class="pwp-error">{errorMsg}</p>
			{/if}

			<div class="pwp-actions">
				<button class="pwp-confirm" type="button" disabled={!selected || saving} onclick={confirm}>
					{saving ? 'Saving...' : selected ? `Confirm ${selected}` : 'Pick a pathway'}
				</button>
				<button class="pwp-later" type="button" disabled={saving} onclick={later}>
					Choose later
				</button>
			</div>

			<!--
				THE WAY OUT, SAID IN WORDS. The defect this answers is a student who
				never found either button: the page behind is locked, so nothing
				moves, and without a sentence naming an exit that reads as a site
				that has stopped working. It names all three, and it names the page
				as waiting rather than broken.
			-->
			<p class="pwp-hint">
				The page is paused behind this box. Press Escape, or click outside it, to decide later.
			</p>
		</div>

		<!--
			THE SCRIM IS A REAL BUTTON, AND THAT IS THE A11Y ANSWER AS WELL AS THE
			WARNING-FREE ONE. A click handler on the overlay div would need a
			keyboard equivalent to satisfy `a11y_click_events_have_key_events` and
			would still be invisible to assistive tech; a labelled <button> is
			announced, focusable and needs no exemption.

			AFTER THE PANEL IN DOM ORDER, PAINTED BEHIND IT. Tab reaches the six
			pathway tiles and the two actions first and this last, which is the
			order a reader wants; `z-index` on the panel is what keeps a
			full-overlay button from covering the dialog it sits behind.
		-->
		<button class="pwp-scrim" type="button" disabled={saving} onclick={later}>
			Dismiss and decide later
		</button>
	</div>
{/if}

<style>
	.pwp-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(3px);
	}
	/* THE SCRIM, DRAWN BEHIND THE PANEL AND CARRYING NO PAINT OF ITS OWN. The
	   overlay above it already draws the dim; this element exists to be
	   PRESSED. `inset: 0` inside a `position: fixed` overlay is the whole
	   viewport, so anywhere outside the panel dismisses -- which is what a
	   reader expects of a sheet and what this one had no way to do. Its label
	   is real text for a screen reader and is clipped visually, never
	   `display: none` (a hidden button is not announced and not focusable). */
	.pwp-scrim {
		position: absolute;
		inset: 0;
		z-index: 0;
		/* The visible dim belongs to the overlay; this is a hit area. */
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		/* The label is for assistive tech only: the panel's own "Choose later"
		   and the hint line carry the visible words. Clipped rather than
		   removed so it stays in the accessibility tree. */
		color: transparent;
		font-size: 0;
		line-height: 0;
		overflow: hidden;
	}
	.pwp-scrim:focus-visible {
		/* Inset so the ring is on screen rather than painted off the viewport
		   edge, and green because this is a focus state. */
		outline: 2px solid var(--green, #00ff41);
		outline-offset: -4px;
	}
	.pwp-panel {
		width: min(600px, 100%);
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		/* ABOVE THE SCRIM. Both are children of the overlay and the scrim comes
		   later in the DOM, so without this the full-viewport button would paint
		   over the dialog and eat every press meant for a pathway tile. */
		position: relative;
		z-index: 1;
		background: var(--bg1, #050f07);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 8px;
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.7);
		padding: 1.6rem;
	}
	.pwp-eyebrow {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	h2 {
		margin: 0.35rem 0 0;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 700;
		font-size: 1.5rem;
		letter-spacing: 0.03em;
		color: var(--white, #e8ffe8);
	}
	.pwp-sub {
		margin: 0.5rem 0 1.1rem;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.95rem;
		line-height: 1.5;
		color: var(--dim, #4a7a52);
	}
	.pwp-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.6rem;
	}
	@media (max-width: 480px) {
		.pwp-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	.pwp-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.9rem 0.5rem 0.75rem;
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 6px;
		/* THE INK DRAWS THE WORD AND THE GLYPH; --pw (the identity) still draws
		   the selected edge below. The raw identity measured 3.36-4.25:1 on this
		   option's own 10% tint for CSEE, MSET and BMET. See $lib/pathways.ts. */
		color: var(--pw-ink);
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
	}
	.pwp-option:hover {
		border-color: var(--pw-line);
		background: var(--pw-bg);
	}
	.pwp-option.selected {
		border-color: var(--pw);
		background: var(--pw-bg);
		box-shadow: 0 0 12px var(--pw-line);
	}
	.pwp-option svg {
		width: 30px;
		height: 30px;
	}
	.pwp-code {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		letter-spacing: 0.16em;
	}
	.pwp-error {
		margin: 0.8rem 0 0;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		color: var(--amber, #ff8c00);
	}
	.pwp-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 1.2rem;
	}
	.pwp-confirm {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--green, #00ff41);
		background: rgba(0, 255, 65, 0.08);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 4px;
		padding: 0.55rem 1.1rem;
		/* Matches the secondary control beside it, so the action row reads as one
		   pair rather than two mismatched heights. */
		min-height: 44px;
		cursor: pointer;
	}
	.pwp-confirm:hover:not(:disabled) {
		border-color: var(--green, #00ff41);
		box-shadow: 0 0 10px rgba(0, 255, 65, 0.3);
	}
	.pwp-confirm:disabled {
		color: var(--dim, #4a7a52);
		background: none;
		cursor: default;
		box-shadow: none;
	}
	/* A real secondary BUTTON, not a bare link. At the dimmest token, smallest
	   size and underlined it read as disabled next to six bright pathway tiles
	   and a bordered confirm -- so it matches confirm's size and uppercase
	   treatment and carries its own border, and only the colour says
	   "secondary". Bone text clears AA on the panel; the neutral border keeps it
	   clearly below the green confirm. */
	.pwp-later {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--white, #e8ffe8);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 4px;
		padding: 0.55rem 1.1rem;
		min-height: 44px;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}
	.pwp-later:hover:not(:disabled) {
		border-color: var(--dim, #849080);
		background: rgba(255, 255, 255, 0.05);
	}
	.pwp-later:disabled {
		color: var(--dim, #849080);
		cursor: default;
	}
	/* The exit sentence. `--white` rather than `--dim`: it is the only thing on
	   the panel naming a way out, so it is body copy and not metadata. */
	.pwp-hint {
		margin: 0.85rem 0 0;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.85rem;
		line-height: 1.5;
		text-align: center;
		color: var(--white, #e8ffe8);
	}
	@media (prefers-reduced-motion: reduce) {
		.pwp-option {
			transition: none;
		}
	}
</style>
