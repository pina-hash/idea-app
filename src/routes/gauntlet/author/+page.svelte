<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Header from '$lib/gauntlet/Header.svelte';
	import { MODES, familyLabel, difficultyLabel, modeById } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenges } = $derived(data);

	let busy = $state('');
	let actionError = $state('');

	// Global Speedrun ruleset editor (one shared record, not per challenge).
	let unitsLabel = $state(data.ruleset.units_label);
	let projection = $state(data.ruleset.projection);
	let ruleText = $state(data.ruleset.rule_lines.join('\n'));
	let ruleSaving = $state(false);
	let ruleSaved = $state(false);
	let ruleError = $state('');

	const saveRuleset = async () => {
		ruleSaving = true;
		ruleSaved = false;
		ruleError = '';
		const rule_lines = ruleText
			.split('\n')
			.map((l) => l.trim())
			.filter((l) => l !== '');
		const { error } = await supabase
			.from('gauntlet_speedrun_ruleset')
			.update({ units_label: unitsLabel.trim(), projection: projection.trim(), rule_lines })
			.eq('id', true);
		if (error) ruleError = error.message;
		else {
			ruleSaved = true;
			await invalidateAll();
		}
		ruleSaving = false;
	};

	const byMode = $derived.by(() => {
		const map = new Map<string, typeof challenges>();
		for (const c of challenges) {
			const list = map.get(c.mode) ?? [];
			list.push(c);
			map.set(c.mode, list);
		}
		return map;
	});

	const setStatus = async (id: string, status: 'draft' | 'published' | 'archived') => {
		busy = id;
		actionError = '';
		const { error } = await supabase.rpc('gauntlet_author_set_status', {
			p_id: id,
			p_status: status
		});
		if (error) actionError = error.message;
		else await invalidateAll();
		busy = '';
	};

	const remove = async (id: string, title: string) => {
		if (!confirm(`Delete "${title}"? Challenges with submissions are archived instead.`)) return;
		busy = id;
		actionError = '';
		const { error } = await supabase.rpc('gauntlet_author_delete', { p_id: id });
		if (error) actionError = error.message;
		else await invalidateAll();
		busy = '';
	};
</script>

<svelte:head>
	<title>Authoring // GAUNTLET</title>
</svelte:head>

<Header {supabase} {userName} {userRole} crumbs={[{ label: 'Authoring' }]} />

<main class="gauntlet">
	<section class="mode-hero">
		<span class="eyebrow">Teacher Tools</span>
		<h1>Challenge Authoring</h1>
		<p class="lead">
			Create and manage challenges across every mode. New challenges start as drafts, visible only
			to teachers for testing; publish to release them to students. For modeling modes, capture the
			geometry with the macro's Author capture and paste it in.
		</p>
	</section>

	<div class="btn-row">
		<a class="btn" href="/gauntlet/author/new">+ New challenge</a>
		<a class="btn secondary" href="/gauntlet/tools">Macro &amp; tools</a>
		<a class="btn secondary" href="/gauntlet">Back to dojo</a>
	</div>

	{#if actionError}<p class="warn">{actionError}</p>{/if}

	<h2>Speedrun ruleset <span class="mono dim">global, shared</span></h2>
	<div class="card ruleset-editor">
		<p class="ff-help">
			One shared ruleset shown next to every Speedrun challenge. Editing it here changes it
			everywhere; it is not stored per challenge.
		</p>
		<label class="ff">
			<span class="ff-label">Units label</span>
			<input class="ff-input" type="text" bind:value={unitsLabel} placeholder="inch, 3-place decimal" />
		</label>
		<label class="ff">
			<span class="ff-label">Rule lines (one per line)</span>
			<textarea class="ff-input ff-area" bind:value={ruleText} rows="3"></textarea>
		</label>
		{#if ruleError}<p class="warn">{ruleError}</p>{/if}
		<div class="btn-row">
			<button class="btn secondary" type="button" disabled={ruleSaving} onclick={saveRuleset}>
				{ruleSaving ? 'Saving...' : 'Save ruleset'}
			</button>
			{#if ruleSaved}<span class="dim">Saved.</span>{/if}
		</div>
	</div>

	{#each MODES as mode (mode.id)}
		{@const list = byMode.get(mode.id) ?? []}
		<h2>{mode.name} <span class="mono dim">{familyLabel(mode.family)}</span></h2>
		{#if list.length === 0}
			<p class="dim author-empty">
				No challenges yet. <a href="/gauntlet/author/new?mode={mode.id}">Create one</a>.
			</p>
		{:else}
			<ul class="author-list">
				{#each list as c (c.id)}
					<li class="author-row">
						<a class="author-main" href="/gauntlet/author/{c.id}">
							<span class="author-title">{c.title}</span>
							<span class="author-sub">
								<span class="diff diff-{c.difficulty}">{difficultyLabel(c.difficulty)}</span>
								<span class="status-badge status-{c.status}">{c.status}</span>
							</span>
						</a>
						<span class="author-actions">
							<a class="text-act" href="/gauntlet/author/{c.id}">Edit</a>
							{#if c.status === 'published'}
								<button class="text-act" type="button" disabled={busy === c.id} onclick={() => setStatus(c.id, 'draft')}>Unpublish</button>
							{:else if c.status === 'draft'}
								<button class="text-act go" type="button" disabled={busy === c.id} onclick={() => setStatus(c.id, 'published')}>Publish</button>
							{:else}
								<button class="text-act" type="button" disabled={busy === c.id} onclick={() => setStatus(c.id, 'draft')}>Restore</button>
							{/if}
							<button class="text-act danger" type="button" disabled={busy === c.id} onclick={() => remove(c.id, c.title)}>Delete</button>
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/each}

	<p class="dim author-note">
		Modes shown: {MODES.length}. The demo placeholder challenges are seeded; replace them with real
		captured parts using the macro's Author capture and the paste box on the
		{modeById('speedrun')?.name} form.
	</p>
</main>
