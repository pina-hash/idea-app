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

	// --- Drawing series management (0022) ---------------------------------------
	// The series table has no private data, so create/rename/reorder/delete go
	// through plain teacher-gated RLS (direct client DML). Membership rides the
	// gauntlet_series_assign RPC because direct DML on challenges is revoked.
	type SeriesRow = { id: string; name: string; description: string; sort_order: number };
	let seriesRows = $state<SeriesRow[]>([]);
	$effect(() => {
		seriesRows = data.series.map((s) => ({
			id: s.id,
			name: s.name,
			description: s.description ?? '',
			sort_order: s.sort_order
		}));
	});

	let newSeriesName = $state('');
	let newSeriesDesc = $state('');
	let seriesBusy = $state('');
	let seriesError = $state('');
	let addPick = $state<Record<string, string>>({});

	// Series membership is a Speedrun-facing feature (that is where students browse).
	const speedruns = $derived(challenges.filter((c) => c.mode === 'speedrun'));
	const membersOf = (sid: string) =>
		speedruns
			.filter((c) => c.series_id === sid)
			.sort((a, b) => (a.series_order ?? 0) - (b.series_order ?? 0));
	const unassigned = $derived(speedruns.filter((c) => !c.series_id));

	const createSeries = async () => {
		const name = newSeriesName.trim();
		if (!name) return;
		seriesBusy = 'new';
		seriesError = '';
		const { error } = await supabase.from('gauntlet_series').insert({
			name,
			description: newSeriesDesc.trim() || null,
			sort_order: data.series.length,
			author_id: data.myUserId
		});
		if (error) seriesError = error.message;
		else {
			newSeriesName = '';
			newSeriesDesc = '';
			await invalidateAll();
		}
		seriesBusy = '';
	};

	const saveSeries = async (s: SeriesRow) => {
		seriesBusy = s.id;
		seriesError = '';
		const { error } = await supabase
			.from('gauntlet_series')
			.update({ name: s.name.trim(), description: s.description.trim() || null, sort_order: s.sort_order })
			.eq('id', s.id);
		if (error) seriesError = error.message;
		else await invalidateAll();
		seriesBusy = '';
	};

	const deleteSeries = async (s: SeriesRow) => {
		if (!confirm(`Delete series "${s.name}"? Its drawings stay, just ungrouped.`)) return;
		seriesBusy = s.id;
		seriesError = '';
		const { error } = await supabase.from('gauntlet_series').delete().eq('id', s.id);
		if (error) seriesError = error.message;
		else await invalidateAll();
		seriesBusy = '';
	};

	const assignTo = async (challengeId: string, sid: string | null, order: number | null) => {
		const { error } = await supabase.rpc('gauntlet_series_assign', {
			p_challenge_id: challengeId,
			p_series_id: sid,
			p_order: order
		});
		if (error) seriesError = error.message;
	};

	const addToSeries = async (sid: string) => {
		const cid = addPick[sid];
		if (!cid) return;
		seriesBusy = sid;
		seriesError = '';
		await assignTo(cid, sid, membersOf(sid).length);
		addPick[sid] = '';
		await invalidateAll();
		seriesBusy = '';
	};

	const unassign = async (challengeId: string) => {
		seriesBusy = challengeId;
		seriesError = '';
		await assignTo(challengeId, null, null);
		await invalidateAll();
		seriesBusy = '';
	};

	// Reorder within a series: renumber every member to its new index (a couple of
	// small RPC calls; classroom scale), then reload.
	const moveInSeries = async (sid: string, index: number, dir: number) => {
		const items = [...membersOf(sid)];
		const j = index + dir;
		if (j < 0 || j >= items.length) return;
		const [it] = items.splice(index, 1);
		items.splice(j, 0, it);
		seriesBusy = sid;
		seriesError = '';
		for (let k = 0; k < items.length; k++) await assignTo(items[k].id, sid, k);
		await invalidateAll();
		seriesBusy = '';
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

	<h2>Drawing series <span class="mono dim">group Speedrun drawings</span></h2>
	<div class="card series-mgr">
		<p class="ff-help">
			Group Speedrun drawings into named series (like an FRC series of FRC parts). Students browse
			and filter by series on the Speedrun page. A drawing belongs to one series or none; deleting a
			series leaves its drawings, just ungrouped.
		</p>
		{#if seriesError}<p class="warn">{seriesError}</p>{/if}

		<div class="series-new">
			<input class="ff-input" type="text" bind:value={newSeriesName} placeholder="New series name" />
			<input class="ff-input" type="text" bind:value={newSeriesDesc} placeholder="Description (optional)" />
			<button
				class="btn secondary"
				type="button"
				disabled={seriesBusy === 'new' || !newSeriesName.trim()}
				onclick={createSeries}
			>
				{seriesBusy === 'new' ? 'Adding...' : 'Add series'}
			</button>
		</div>

		{#if seriesRows.length === 0}
			<p class="dim author-empty">No series yet. Add one above, then assign drawings to it.</p>
		{:else}
			<ul class="series-editor">
				{#each seriesRows as s (s.id)}
					<li class="series-item">
						<div class="series-item-head">
							<input class="ff-input series-order" type="number" bind:value={s.sort_order} title="Display order" />
							<input class="ff-input" type="text" bind:value={s.name} />
							<input class="ff-input" type="text" bind:value={s.description} placeholder="Description" />
							<button class="text-act" type="button" disabled={seriesBusy === s.id} onclick={() => saveSeries(s)}>Save</button>
							<button class="text-act danger" type="button" disabled={seriesBusy === s.id} onclick={() => deleteSeries(s)}>Delete</button>
						</div>
						<ul class="series-members">
							{#each membersOf(s.id) as m, i (m.id)}
								<li class="series-member">
									<span class="member-title">{m.title}</span>
									<span class="status-badge status-{m.status}">{m.status}</span>
									<span class="member-actions">
										<button class="text-act" type="button" disabled={seriesBusy === s.id || i === 0} onclick={() => moveInSeries(s.id, i, -1)} aria-label="Move up">&uarr;</button>
										<button class="text-act" type="button" disabled={seriesBusy === s.id || i === membersOf(s.id).length - 1} onclick={() => moveInSeries(s.id, i, 1)} aria-label="Move down">&darr;</button>
										<button class="text-act danger" type="button" disabled={seriesBusy === m.id} onclick={() => unassign(m.id)}>Remove</button>
									</span>
								</li>
							{:else}
								<li class="dim member-empty">No drawings in this series yet.</li>
							{/each}
						</ul>
						{#if unassigned.length}
							<div class="series-add">
								<select class="ff-input" bind:value={addPick[s.id]}>
									<option value="">Add a drawing...</option>
									{#each unassigned as u (u.id)}<option value={u.id}>{u.title}</option>{/each}
								</select>
								<button class="btn secondary" type="button" disabled={seriesBusy === s.id || !addPick[s.id]} onclick={() => addToSeries(s.id)}>Add</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if unassigned.length}
			<p class="dim author-note">
				{unassigned.length} Speedrun drawing{unassigned.length === 1 ? '' : 's'} not in any series.
			</p>
		{/if}
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
