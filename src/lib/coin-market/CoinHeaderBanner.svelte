<script lang="ts">
	import { untrack } from 'svelte';
	import { coins } from '$lib/coin-format';
	import Glyph from './Glyph.svelte';
	import {
		BANNER_ROTATE_MS,
		bannerDismissed,
		bannerSteps,
		cardsWindow,
		dismissBanner,
		parseBanner,
		type BannerPin,
		type BannerStyle
	} from './banner';
	import type { MarketGlyphName } from './glyphs';

	/**
	 * THE IDEA CLASSROOM HEADER BANNER (ledger 0402, 0280). Staff pin items
	 * (a featured listing, an official card, a contract, the shop); the banner
	 * rotates through them under the classroom header, a click opens one, and
	 * Hide for today puts it away in this browser until tomorrow. Three looks,
	 * chosen by the coin setting `banner_style` (or `styleOverride` in the
	 * harness and the settings preview).
	 *
	 * MOTION: anything that moves for more than five seconds has a Pause key
	 * (WCAG 2.2.2), stops while the pointer or the keyboard is on it, and does
	 * not move at all under `prefers-reduced-motion: reduce`. No pins, a read
	 * that failed, or a dismissal today: nothing is drawn, so a class page with
	 * no banner is byte for byte what it was.
	 */
	let {
		sectionId = null,
		load,
		day,
		styleOverride = null,
		allowDismiss = true
	}: {
		sectionId?: string | null;
		load: (sectionId: string | null) => Promise<unknown>;
		/** Today in Los Angeles, YYYY-MM-DD, from the loader's clock. */
		day: string;
		styleOverride?: BannerStyle | null;
		allowDismiss?: boolean;
	} = $props();

	let pins = $state<BannerPin[]>([]);
	let style = $state<BannerStyle>('spotlight');
	let hidden = $state(false);
	let step = $state(0);
	let paused = $state(false);
	let held = $state(false);
	let reduce = $state(false);
	/** A phone shows one card at a time: three stacked took 280px under the header. */
	let narrow = $state(false);

	$effect(() => {
		const id = sectionId;
		const d = day;
		untrack(() => {
			hidden = allowDismiss && bannerDismissed(d);
			load(id).then((raw) => {
				const p = parseBanner(raw);
				pins = p?.pins ?? [];
				style = p?.style ?? 'spotlight';
				step = 0;
			});
		});
	});

	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) return;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		const nq = window.matchMedia('(max-width: 40rem)');
		reduce = mq.matches;
		narrow = nq.matches;
		const on = () => (reduce = mq.matches);
		const onN = () => (narrow = nq.matches);
		mq.addEventListener?.('change', on);
		nq.addEventListener?.('change', onN);
		return () => {
			mq.removeEventListener?.('change', on);
			nq.removeEventListener?.('change', onN);
		};
	});

	const look = $derived(styleOverride ?? style);
	const perStep = $derived(narrow ? 1 : 3);
	const steps = $derived(bannerSteps(look, pins.length, perStep));
	const moving = $derived(!reduce && !paused && !held && steps > 1);

	$effect(() => {
		if (!moving || look === 'ticker') return;
		const t = setInterval(() => (step = (step + 1) % steps), BANNER_ROTATE_MS);
		return () => clearInterval(t);
	});

	const current = $derived(pins[step % Math.max(pins.length, 1)] ?? null);
	const windowPins = $derived(cardsWindow(pins, step, perStep));

	const glyph: Record<BannerPin['kind'], MarketGlyphName> = {
		listing: 'offer',
		official: 'official',
		contract: 'contract',
		shop: 'shop',
		link: 'official'
	};

	function hide() {
		dismissBanner(day);
		hidden = true;
	}
</script>

{#if pins.length && !hidden}
	<section
		class="cb cb-{look}"
		class:cb-still={reduce}
		aria-label="From the IDEA Market"
		data-testid="coin-banner"
		data-style={look}
		onpointerenter={() => (held = true)}
		onpointerleave={() => (held = false)}
		onfocusin={() => (held = true)}
		onfocusout={() => (held = false)}
	>
		<span class="cb-label"><Glyph name="shop" size={14} /> IDEA Market</span>

		{#if look === 'spotlight' && current}
			<a class="cb-spot" href={current.href} data-testid="coin-banner-pin">
				{#key current.id}
					<span class="cb-spot-inner">
						<span class="cb-glyph"><Glyph name={glyph[current.kind]} /></span>
						<span class="cb-text">
							<span class="cb-title">{current.title}</span>
							{#if current.subtitle}<span class="cb-sub">{current.subtitle}</span>{/if}
						</span>
						{#if current.price !== null}<span class="cb-price">{coins(current.price)}</span>{/if}
						<span class="cb-open">Open &rsaquo;</span>
					</span>
				{/key}
			</a>
			{#if pins.length > 1}
				<span class="cb-dots" aria-hidden="true">
					{#each pins as p, i (p.id)}<span class="cb-dot" class:on={i === step % pins.length}></span>{/each}
				</span>
			{/if}
		{:else if look === 'cards'}
			<ul class="cb-cards">
				{#each windowPins as p (p.id)}
					<li>
						<a class="cb-card" href={p.href} data-testid="coin-banner-pin">
							<span class="cb-glyph"><Glyph name={glyph[p.kind]} /></span>
							<span class="cb-text">
								<span class="cb-title">{p.title}</span>
								{#if p.subtitle}<span class="cb-sub">{p.subtitle}</span>{/if}
							</span>
							{#if p.price !== null}<span class="cb-price">{coins(p.price)}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="cb-track" class:paused={paused || held || reduce}>
				<ul class="cb-run">
					{#each pins as p (p.id)}
						<li><a class="cb-tick" href={p.href} data-testid="coin-banner-pin"><Glyph name={glyph[p.kind]} size={14} /> {p.title}{#if p.price !== null}<span class="cb-price">{coins(p.price)}</span>{/if}</a></li>
					{/each}
				</ul>
				{#if !reduce}
					<ul class="cb-run" aria-hidden="true">
						{#each pins as p (p.id)}
							<li><a class="cb-tick" href={p.href} tabindex="-1"><Glyph name={glyph[p.kind]} size={14} /> {p.title}{#if p.price !== null}<span class="cb-price">{coins(p.price)}</span>{/if}</a></li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<span class="cb-keys">
			{#if !reduce && (steps > 1 || look === 'ticker')}
				<button type="button" class="cb-key" aria-pressed={paused} onclick={() => (paused = !paused)} data-testid="coin-banner-pause">
					{paused ? 'Play' : 'Pause'}
				</button>
			{/if}
			{#if look !== 'ticker' && steps > 1}
				<button type="button" class="cb-key" aria-label="Next" onclick={() => (step = (step + 1) % steps)} data-testid="coin-banner-next">Next</button>
			{/if}
			{#if allowDismiss}
				<button type="button" class="cb-key" onclick={hide} data-testid="coin-banner-hide">Hide for today</button>
			{/if}
		</span>
	</section>
{/if}

<style>
	.cb {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.6rem 0.9rem;
		flex-wrap: wrap;
		margin: 0.5rem auto 0.25rem;
		max-width: min(var(--cr-measure-route, 92rem), calc(100% - 2 * var(--cr-gutter, 1rem)));
		padding: 0.45rem 0.6rem 0.45rem 0.9rem;
		border-radius: var(--plate-r-panel, 10px);
		border: 1px solid var(--plate-hair, var(--boundary));
		background-color: var(--plate-face-ground, var(--bg1));
		background-image: linear-gradient(to bottom, var(--plate-face-top, var(--bg2)), var(--plate-face-bot, var(--bg1)));
		box-shadow:
			inset 0 1px 0 0 var(--plate-bezel-hi, transparent),
			0 6px 14px -8px var(--plate-drop, rgba(0, 0, 0, 0.4));
		color: var(--text-1);
		min-width: 0;
		box-sizing: border-box;
		width: 100%;
	}
	.cb-label {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-2);
		white-space: nowrap;
	}
	.cb-glyph {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 1px solid var(--plate-hair, var(--boundary));
		color: var(--green);
	}
	.cb-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.cb-title {
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cb-sub {
		font-size: 0.88rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cb-price {
		font-family: var(--font-mono);
		color: var(--text-1);
		margin-left: 0.4rem;
		white-space: nowrap;
	}
	.cb-open {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
		white-space: nowrap;
	}
	a {
		color: inherit;
		text-decoration: none;
	}
	.cb-spot {
		flex: 1 1 18rem;
		min-width: 0;
		min-height: 44px;
		display: flex;
		align-items: center;
		border-radius: var(--plate-r-small, 6px);
	}
	.cb-spot:hover .cb-title,
	.cb-card:hover .cb-title,
	.cb-tick:hover {
		color: var(--hover-ink, var(--green));
	}
	.cb-spot-inner {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
		width: 100%;
	}
	.cb-spot-inner .cb-price {
		margin-left: auto;
	}
	@media (prefers-reduced-motion: no-preference) {
		.cb-spot-inner {
			animation: cb-in 0.45s ease;
		}
		@keyframes cb-in {
			from {
				opacity: 0;
				transform: translateY(3px);
			}
			to {
				opacity: 1;
				transform: none;
			}
		}
	}
	.cb-dots {
		display: inline-flex;
		gap: 0.3rem;
	}
	.cb-dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
		background: var(--text-2);
		opacity: 0.35;
	}
	.cb-dot.on {
		background: var(--green);
		opacity: 1;
	}
	.cb-cards {
		flex: 1 1 24rem;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		list-style: none;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	.cb-cards > li {
		flex: 1 1 12rem;
		min-width: 0;
		display: flex;
	}
	.cb-card {
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 44px;
		padding: 0.35rem 0.55rem;
		border-radius: var(--plate-r-small, 6px);
		border: 1px solid var(--plate-hair, var(--boundary));
		background: var(--plate-inset-top, var(--bg0));
		min-width: 0;
	}
	.cb-card:hover,
	.cb-card:focus-visible {
		border-color: var(--green);
	}
	.cb-track {
		flex: 1 1 20rem;
		display: flex;
		overflow: hidden;
		min-width: 0;
		/* The run inside is wider than any screen on purpose; without this its
		   width became the banner's minimum and pushed the page sideways. */
		contain: inline-size;
		mask-image: linear-gradient(to right, transparent, #000 4%, #000 96%, transparent);
	}
	.cb-run {
		display: flex;
		gap: 1.6rem;
		list-style: none;
		margin: 0;
		padding: 0 1.6rem 0 0;
		flex: none;
	}
	@media (prefers-reduced-motion: no-preference) {
		.cb-run {
			animation: cb-scroll 28s linear infinite;
		}
		.cb-track.paused .cb-run {
			animation-play-state: paused;
		}
		@keyframes cb-scroll {
			from {
				transform: translateX(0);
			}
			to {
				transform: translateX(-100%);
			}
		}
	}
	.cb-still .cb-track {
		mask-image: none;
	}
	.cb-still .cb-run {
		flex-wrap: wrap;
		flex: 1 1 auto;
	}
	.cb-tick {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		white-space: nowrap;
		font-weight: 600;
	}
	.cb-keys {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-left: auto;
	}
	.cb-key {
		min-height: 44px;
		padding: 0 0.7rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-1);
		background: var(--plate-inset-top, var(--bg0));
		border: 1px solid var(--plate-hair, var(--boundary));
		border-radius: var(--plate-r-small, 6px);
		cursor: pointer;
	}
	.cb-key:hover,
	.cb-key:focus-visible {
		border-color: var(--green);
	}
	.cb-key[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--green);
	}
	@media (max-width: 40rem) {
		.cb-label {
			width: 100%;
		}
		.cb-keys {
			margin-left: 0;
		}
	}
</style>
