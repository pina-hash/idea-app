<script lang="ts">
	import { untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import CoinDeskNav from '$lib/coin-desk/CoinDeskNav.svelte';
	import LogView from '$lib/coin-desk/LogView.svelte';
	import StudentView from '$lib/coin-desk/StudentView.svelte';
	import RolesManager from '$lib/coin-desk/RolesManager.svelte';
	import CategoriesManager from '$lib/coin-desk/CategoriesManager.svelte';
	import AutopayRuns from '$lib/coin-desk/AutopayRuns.svelte';
	import SettingsPanel from '$lib/coin-desk/SettingsPanel.svelte';
	import { areasForScope, type CoinDeskAreaId } from '$lib/coin-desk/nav';
	import type { CoinCategory, CoinDeskPrefs } from '$lib/coin-desk';
	import '$lib/shell/split.css';
	// The room's geometry, the SAME file the real layout imports. A harness
	// with its own copy of a page measure is a harness that can measure a
	// width production does not have.
	import '$lib/coin-desk/coin-desk.css';
	import {
		createFakeLedger,
		HARNESS_CLASSES,
		HARNESS_USER_ID,
		listCategories,
		setHarnessScope,
		setV2Applied
	} from './fake-ledger';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * DEV HARNESS FOR THE /coin-desk ROUTE GROUP (IDEA Coin V2 session two).
	 * The real sub-nav (CoinDeskNav in its callback mode, since this harness
	 * has no router) drives the REAL per-area components against an in-memory
	 * ledger (fake-ledger.ts) that answers the 0244 to 0251 shapes. No auth,
	 * no live Supabase project.
	 *
	 * Things to try:
	 *  - LOG -- the class list is IDEA Classroom sections; "IDEA 100 Block 3"
	 *    lists three students. "debt.student" is below zero (Pay off debt
	 *    opens, a purchase is refused). "Whole class" logs one amount to every
	 *    student on the class's roster in one call (Above and Beyond, range).
	 *    The category picker is in the price list's own order.
	 *  - STUDENTS -- pick a class, then a student: the balance chart, weekly
	 *    bars, totals and every event; the history with Undo; "Edit amount" on
	 *    a row (healthy.student's Correct Answer is already edited once, with
	 *    Undo edit); the export (one student, one class, the whole economy);
	 *    and the full tools (adjust, standing, cash purchase, debt, the 3D
	 *    print spool, the Student Auditor switch). `?scope=section` shows it
	 *    as section staff do: no tools, no edit, no whole-economy export.
	 *  - CONTRACTS -- five seeded: an open flat one with a claimant marked
	 *    done (it links to the Queue), a full hourly one, a restitution job
	 *    (Students in debt only), a completed and a cancelled one. Post one,
	 *    cancel one, reset one.
	 *  - ROLES -- two applications for the one Shop Steward seat in IDEA 100:
	 *    accept the first, then the second is refused as full; a Lab Tech
	 *    application with no class (Set class first). Two holders with two
	 *    weeks of days and photos; Accept, Reject or Clear a day; give one
	 *    rules of their own; the stipend by hand.
	 *  - ECONOMY -- the price list: create a category, retire one.
	 *  - SETTINGS -- every setting, the calendars, full coin admins, the want
	 *    list (with a photo upload), the Student Auditors, the change log.
	 *  - Untick "V2 database update applied" to see every surface say it is
	 *    not available yet instead of erroring.
	 *
	 * Fine, Queue, Payday, Digest and Tournaments are built and harnessed
	 * separately; their tabs here say so.
	 */
	const supabase = createFakeLedger() as unknown as SupabaseClient;

	const scope = untrack(() => data.scope);
	setHarnessScope(scope);
	const offered = areasForScope(scope);

	let v2 = $state(true);
	let migrationApplied = $state(true);
	let area = $state<CoinDeskAreaId>(
		untrack(() => (data.area && offered.some((a) => a.id === data.area) ? data.area : offered[0].id))
	);

	function categoriesFor(): CoinCategory[] {
		return migrationApplied ? listCategories() : [];
	}

	/** CategoriesManager's `categories` is bindable; this is where it writes. */
	let categoriesState = $state<CoinCategory[]>([]);
	const categoryKinds = $derived(
		Object.fromEntries(listCategories().map((c) => [c.id, c.kind])) as Record<string, string>
	);

	let prefs = $state<CoinDeskPrefs>({});
	let prefsLog = $state<string[]>([]);
	function onPrefs(next: CoinDeskPrefs) {
		prefs = next;
		prefsLog = [...prefsLog, JSON.stringify(next)].slice(-6);
	}

	$effect(() => {
		void area;
		void migrationApplied;
		categoriesState = untrack(() => categoriesFor());
	});

	const builtElsewhere = new Set<CoinDeskAreaId>(['fine', 'queue', 'payday', 'digest', 'tournaments']);
</script>

<div class="dev-toolbar">
	<label>
		<input type="checkbox" bind:checked={migrationApplied} />
		Categories readable
	</label>
	<label>
		<input
			type="checkbox"
			checked={v2}
			data-testid="cd-harness-v2"
			onchange={(e) => {
				// Set on the ledger BEFORE the state moves, so the remounted area
				// already reads the new answer when it loads.
				setV2Applied(e.currentTarget.checked);
				v2 = e.currentTarget.checked;
			}}
		/>
		V2 database update applied
	</label>
	<span class="scope-word" data-testid="cd-harness-scope">
		{scope === 'full' ? 'Full coin admin' : 'Section coin staff'} (?scope=section to switch)
	</span>
</div>

<div class="cd-root">
	<main class="coin-desk-page">
		<section class="hero">
			<div class="eyebrow">IDEA // Coin Desk (dev harness)</div>
			<h1>Coin desk</h1>
		</section>

		<CoinDeskNav active={area} {scope} onSelect={(next) => (area = next)} />

		{#key `${area}:${migrationApplied}:${v2}`}
			{#if area === 'log'}
				<LogView
					categories={categoriesFor()}
					{supabase}
					configured={migrationApplied}
					classes={HARNESS_CLASSES}
					{prefs}
					{onPrefs}
				/>
				<AutopayRuns {supabase} settingsHref={null} />
			{:else if area === 'students'}
				<StudentView
					{supabase}
					{scope}
					classes={HARNESS_CLASSES}
					categories={categoriesFor()}
					{categoryKinds}
				/>
			{:else if area === 'roles'}
				<RolesManager {supabase} />
			{:else if area === 'economy'}
				<CategoriesManager {supabase} bind:categories={categoriesState} configured={migrationApplied} />
			{:else if area === 'settings'}
				<SettingsPanel {supabase} userId={HARNESS_USER_ID} />
			{:else if builtElsewhere.has(area)}
				<section class="card">
					<h2>{offered.find((a) => a.id === area)?.label}</h2>
					<p class="note">This area has its own harness and is not part of this one.</p>
				</section>
			{/if}
		{/key}

		{#if prefsLog.length}
			<p class="prefs-log" data-testid="cd-prefs-log">preferences.coinDesk &rarr; {prefsLog.at(-1)}</p>
		{/if}
	</main>
</div>

<style>
	/*
	 * THE TOOLBAR FLOATS ONLY WHERE THERE IS ROOM BESIDE THE PAGE. Fixed at
	 * top-right on a 375px viewport it covered the sub-nav and three areas
	 * could not be reached at phone width; it flows above the room there.
	 */
	.dev-toolbar {
		position: static;
		margin: 0.5rem;
		z-index: 20;
		background: var(--bg1);
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--white);
	}
	.dev-toolbar label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		cursor: pointer;
		/* A harness control is still a control somebody taps. */
		min-height: 44px;
	}
	.scope-word {
		display: block;
		color: var(--text-2, var(--dim));
		padding: 0.2rem 0;
	}
	@media (min-width: 1024px) {
		.dev-toolbar {
			position: fixed;
			top: 0.5rem;
			right: 0.5rem;
			margin: 0;
		}
	}
	.prefs-log {
		color: var(--cyan);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		margin-top: 0.8rem;
	}
	.coin-desk-page h2 {
		margin-top: 0;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
	}
</style>
