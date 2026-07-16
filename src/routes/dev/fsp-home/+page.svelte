<script lang="ts">
	import FspHomeSection from '$lib/fsp/FspHomeSection.svelte';
	import { summerProgram, type Assignment, type Section } from '$lib/curriculum';

	/**
	 * Dev harness for the FSP homepage section. Mounts the REAL FspHomeSection
	 * wrapped in `.legacy-index` (so the app.css FSP styling applies exactly as on
	 * the homepage), with the open-state stubbed as local state — the real build
	 * wires `onOpen` to the Supabase-backed record (0048).
	 */

	// Real FSP section from the curriculum (fallback keeps the harness self-contained).
	const fsp: Section =
		summerProgram() ?? {
			id: 'summer-2026',
			course: 'IDEA FSP',
			title: 'Freshman Summer Program',
			year: 1,
			yearLabel: 'Incoming Freshman',
			instructor: 'Pina',
			term: 'Summer',
			isNew: true,
			status: 'live'
		};

	const teacherExtra: Assignment = {
		slug: 'fsp-live',
		title: 'Live Question Feed',
		href: '/fsp/live'
	};
	const frcRow: Assignment = {
		slug: 'frc-interest',
		title: 'FRC Interest Form',
		href: '/fsp/frc-interest'
	};

	let asTeacher = $state(false);
	let signedIn = $state(true);

	const items = $derived([
		...(fsp.assignments ?? []),
		frcRow,
		...(asTeacher ? [teacherExtra] : [])
	]);

	// Stubbed open-state (local only in the harness).
	let opened = $state(new Set<string>(['fsp-day1']));
	let log = $state<string[]>([]);

	const onOpen = (slug: string) => {
		// Mirror the real page: optimistic first-open, links still navigate — but in
		// the harness we don't navigate, so log it and mark opened for the dot check.
		opened = new Set([...opened, slug]);
		log = [`opened  ${slug}`, ...log].slice(0, 20);
	};

	const reset = () => {
		opened = new Set();
		log = [];
	};
</script>

<svelte:head><title>FSP home section harness</title></svelte:head>

<div class="harness">
	<h1>FSP homepage section harness</h1>
	<p class="note">
		Dev-only (no auth / Supabase). The REAL <code>FspHomeSection</code> with open-state stubbed as
		local state. Verify: grouped thin dividers (Presentations / Live / Tools &amp; Resources /
		Forms), HUD corner brackets, the faint drifting grid backdrop, the crimson pulse on the two
		Live rows only, and the opened progress dots (click a row's link to fill its dot; note in the
		harness the click is intercepted so nothing navigates). Toggle roles/sign-in and resize to a
		phone width to check wrapping.
	</p>

	<div class="controls">
		<label><input type="checkbox" bind:checked={signedIn} /> Signed in (show progress dots)</label>
		<label><input type="checkbox" bind:checked={asTeacher} /> Teacher (adds Live Question Feed)</label>
		<button type="button" onclick={reset}>Reset opened</button>
	</div>

	<!-- Wrap in .legacy-index so the homepage-scoped app.css FSP styling applies.
	     Capture-phase preventDefault blocks the row links from navigating away (so
	     the dot-fill is observable here); the component's own onclick still fires
	     and calls onOpen. On the real homepage the click DOES navigate, which is
	     the intended behavior. -->
	<div
		class="legacy-index preview"
		onclickcapture={(e) => {
			const a = (e.target as HTMLElement).closest('a[href]');
			if (a) e.preventDefault();
		}}
		role="presentation"
	>
		<div class="courses">
			<div class="year-label">Incoming Freshman</div>
			<FspHomeSection section={fsp} {items} {signedIn} openedSet={opened} {onOpen} />
		</div>
	</div>

	<h3>Open log (newest first)</h3>
	<ol class="log">
		{#each log as line, i (i)}
			<li>{line}</li>
		{/each}
		{#if log.length === 0}<li class="muted">Nothing opened yet.</li>{/if}
	</ol>
</div>

<style>
	.harness {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem 1.25rem 5rem;
		color: var(--white, #eae6d8);
		font-family: system-ui, sans-serif;
	}
	h1 {
		font-size: 1.3rem;
	}
	h3 {
		font-size: 0.95rem;
		color: var(--green, #78b870);
		margin: 2rem 0 0.5rem;
	}
	.note {
		color: var(--dim, #849080);
		font-size: 0.9rem;
		line-height: 1.55;
		max-width: 78ch;
	}
	.controls {
		display: flex;
		gap: 1.2rem;
		flex-wrap: wrap;
		align-items: center;
		margin: 1rem 0 1.5rem;
		font-size: 0.85rem;
	}
	.controls label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.controls button {
		font: inherit;
		font-size: 0.8rem;
		background: none;
		border: 1px solid var(--line, #2a3a2a);
		color: var(--white, #eae6d8);
		border-radius: 5px;
		padding: 0.35rem 0.7rem;
		cursor: pointer;
	}
	.preview {
		background: var(--bg0, #121a12);
		border-radius: 8px;
		padding: 1rem 0;
	}
	.preview .courses {
		padding-bottom: 1rem;
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.log li {
		color: var(--cyan, #5abda8);
	}
	.log li.muted {
		color: var(--dim, #849080);
	}
</style>
