<script lang="ts">
	import './market.css';
	import { untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { callV2, V2_UNAVAILABLE } from '$lib/coin-desk/v2';
	import { fieldDraft, fieldValue, type SettingGroup } from '$lib/coin-desk/settings-session-two';
	import CoinHeaderBanner from './CoinHeaderBanner.svelte';
	import { BANNER_STYLES, DEFAULT_BANNER_STYLE, isBannerStyle, type BannerStyle } from './banner';
	import { LATER_GROUPS } from './settings';

	/**
	 * THE SETTINGS LEDGER 0402 ADDS, below the rest of the settings page: the
	 * market, transfers, hall pass time, stocks, and the classroom banner's
	 * look (the three candidates side by side, each a live preview). Every save
	 * is `coin_settings_set`, one key at a time, recorded in
	 * `coin_settings_audit` like every other setting.
	 */
	let { supabase }: { supabase: SupabaseClient } = $props();

	let settings = $state<Record<string, unknown> | null>(null);
	let missing = $state(false);
	let drafts = $state<Record<string, Record<string, string>>>({});
	let said = $state<Record<string, { ok: boolean; text: string }>>({});
	let busy = $state(false);

	function seed(g: SettingGroup, s: Record<string, unknown>) {
		return Object.fromEntries(g.fields.map((f) => [f.key, fieldDraft(f, s[f.key])]));
	}
	async function reload() {
		const r = await callV2<{ settings?: Record<string, unknown> }>(supabase, 'coin_settings_get');
		if (r.kind !== 'ok') {
			missing = r.kind === 'missing';
			return;
		}
		const s = r.data?.settings ?? {};
		settings = s;
		drafts = Object.fromEntries(LATER_GROUPS.map((g) => [g.id, seed(g, s)]));
	}
	$effect(() => {
		untrack(() => reload());
	});

	async function setKey(key: string, value: unknown): Promise<string | null> {
		const r = await callV2<{ ok: boolean }>(supabase, 'coin_settings_set', { p_key: key, p_value: value });
		if (r.kind === 'missing') return V2_UNAVAILABLE;
		if (r.kind === 'error') return r.message;
		return r.data?.ok ? null : 'That value was refused.';
	}

	async function saveGroup(g: SettingGroup) {
		if (!settings || busy) return;
		busy = true;
		let changed = 0;
		for (const f of g.fields) {
			const v = fieldValue(f, drafts[g.id]?.[f.key] ?? '');
			if ('problem' in v) {
				said = { ...said, [g.id]: { ok: false, text: v.problem } };
				busy = false;
				return;
			}
			if (JSON.stringify(v.value) === JSON.stringify(settings[f.key])) continue;
			const err = await setKey(f.key, v.value);
			if (err) {
				said = { ...said, [g.id]: { ok: false, text: `${f.label}: ${err} ${f.help}` } };
				busy = false;
				await reload();
				return;
			}
			changed++;
		}
		busy = false;
		said = { ...said, [g.id]: { ok: true, text: changed ? `${g.title} saved.` : 'Nothing had changed.' } };
		await reload();
	}

	const style = $derived<BannerStyle>(settings && isBannerStyle(settings.banner_style) ? settings.banner_style : DEFAULT_BANNER_STYLE);
	async function pickStyle(s: BannerStyle) {
		if (busy || s === style) return;
		busy = true;
		const err = await setKey('banner_style', s);
		busy = false;
		said = { ...said, banner: err ? { ok: false, text: err } : { ok: true, text: `The banner now uses ${s}.` } };
		await reload();
	}

	/** The preview pins: what the banner would show, made up so the looks can be compared on any day. */
	const previewPins = {
		style: 'spotlight',
		pins: [
			{ id: 'p1', kind: 'official', title: 'Tissue boxes wanted', subtitle: 'Bring one in, earn coins', href: '/market', price: 1, sort_order: 0 },
			{ id: 'p2', kind: 'shop', title: 'Extra Credit', subtitle: 'Points on returned work', href: '/market', price: 2, sort_order: 1 },
			{ id: 'p3', kind: 'listing', title: 'Laser-cut name tags', subtitle: 'From a classmate', href: '/market', price: 3.5, sort_order: 2 },
			{ id: 'p4', kind: 'contract', title: 'Sweep the shop', subtitle: 'Restitution job', href: '/market', price: 4, sort_order: 3 }
		]
	};
	const previewLoad = async () => previewPins;
</script>

{#if missing}
	<p class="mk-note">{V2_UNAVAILABLE}</p>
{:else if settings}
	<div class="mk-col" data-testid="later-settings">
		{#each LATER_GROUPS as g (g.id)}
			<section class="card mk-panel" aria-labelledby="ls-{g.id}" data-testid="later-settings-{g.id}">
				<header><h2 id="ls-{g.id}">{g.title}</h2></header>
				<p class="mk-sub">{g.intro}</p>
				<div class="mk-form">
					{#each g.fields as f (f.key)}
						<label class="mk-field">
							{f.label}
							<input type="text" inputmode={f.kind === 'int' ? 'numeric' : 'decimal'} bind:value={drafts[g.id][f.key]} data-testid="ls-{f.key}" />
							<span class="mk-help">{f.help}</span>
						</label>
					{/each}
				</div>
				<div class="mk-row">
					<button type="button" class="btn mk-key" disabled={busy} onclick={() => saveGroup(g)}>Save {g.title.toLowerCase()}</button>
					{#if said[g.id]}<span class={said[g.id].ok ? 'mk-ok' : 'mk-why'} role="status">{said[g.id].text}</span>{/if}
				</div>
			</section>
		{/each}

		<section class="card mk-panel" aria-labelledby="ls-banner" data-testid="later-settings-banner">
			<header><h2 id="ls-banner">Classroom banner look</h2><span class="mk-sub">Three candidates. The one picked is what every class sees.</span></header>
			{#each BANNER_STYLES as b (b.id)}
				<div class="mk-trade" data-testid="banner-candidate-{b.id}">
					<div class="mk-trade-head">
						<span class="mk-trade-title">{b.label}{b.id === DEFAULT_BANNER_STYLE ? ' (the default)' : ''}</span>
						<button type="button" class="btn secondary mk-key" role="radio" aria-checked={style === b.id} disabled={busy} onclick={() => pickStyle(b.id)}>
							{style === b.id ? 'In use' : 'Use this'}
						</button>
					</div>
					<p class="mk-note">{b.blurb}</p>
					<CoinHeaderBanner load={previewLoad} day="preview" styleOverride={b.id} allowDismiss={false} />
				</div>
			{/each}
			{#if said.banner}<p class={said.banner.ok ? 'mk-ok' : 'mk-why'} role="status">{said.banner.text}</p>{/if}
		</section>
	</div>
{/if}
