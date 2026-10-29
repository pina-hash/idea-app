<script lang="ts">
	/**
	 * EVERY TEAM'S DOCUMENT, FOR AN INSTRUCTOR (ledger 0436, 0302).
	 *
	 * A manager of a section sees its teams, from the section's current posted
	 * draw (an admin sees every section the post is in); picking a team shows
	 * that team's shared answers in the REAL frame, read only, and picking a box
	 * (from the list, or by clicking into it in the document) shows the box's
	 * whole history: who changed it, when, and what it said before and after.
	 *
	 * Read only by construction: the frame is handed no write callback, so there
	 * is nothing a click could save. An individual module shows empty here,
	 * because it belongs to each student and is read in grading.
	 */
	import HtmlAssignmentFrame from './HtmlAssignmentFrame.svelte';
	import type { HtmlAssignmentManifest } from './manifest';
	import {
		hxTeamBlocks,
		parseTeamDocument,
		teamValuesFor,
		type TeamDocument,
		type TeamDocumentsTransports
	} from './team-doc';
	import { hxBlockPrompt } from './manifest';

	interface SectionTeams {
		section_id: string;
		label: string;
		set_label: string | null;
		team_set_id: string | null;
		teams: { id: string; number: number; name: string; members: string[] }[];
	}

	let {
		itemId,
		manifest,
		src,
		title,
		fieldToBlockId,
		transports
	}: {
		itemId: string;
		manifest: HtmlAssignmentManifest;
		src: string;
		title: string;
		fieldToBlockId: Readonly<Record<string, string>>;
		transports: TeamDocumentsTransports;
	} = $props();

	let sections = $state<SectionTeams[] | null>(null);
	let failed = $state(false);
	let teamId = $state<string | null>(null);
	let doc = $state<TeamDocument | null>(null);
	let blockId = $state<string | null>(null);
	let history = $state<{ at: string; by: string; before: unknown; after: unknown }[] | null>(null);

	const shared = $derived.by(() => {
		const blocks = hxTeamBlocks(manifest);
		const out: { blockId: string; field: string; label: string; module: string }[] = [];
		for (const mod of manifest.modules) {
			for (const b of mod.blocks) {
				if (!blocks.has(b.id)) continue;
				out.push({ blockId: b.id, field: b.field, label: hxBlockPrompt(b) ?? b.field, module: mod.title });
			}
		}
		return out;
	});
	const values = $derived(doc ? teamValuesFor(manifest, doc) : {});

	async function load() {
		const raw = (await transports.listTeams(itemId).catch(() => null)) as { ok?: boolean; sections?: SectionTeams[] } | null;
		if (!raw?.ok) {
			failed = true;
			return;
		}
		sections = raw.sections ?? [];
	}
	$effect(() => {
		void load();
	});

	async function openTeam(id: string) {
		teamId = id;
		blockId = null;
		history = null;
		doc = parseTeamDocument(await transports.readTeam(itemId, id).catch(() => null));
	}

	async function openBox(id: string) {
		if (!teamId) return;
		blockId = id;
		history = null;
		const raw = (await transports.history(itemId, teamId, id).catch(() => null)) as {
			ok?: boolean;
			entries?: { at: string; by: string; before: unknown; after: unknown }[];
		} | null;
		history = raw?.ok ? (raw.entries ?? []) : [];
	}

	function words(v: unknown): string {
		if (v === null || v === undefined) return '(empty)';
		if (typeof v === 'boolean') return v ? 'Checked' : 'Not checked';
		const s = typeof v === 'string' ? v : JSON.stringify(v);
		return s.trim() === '' ? '(empty)' : s;
	}
	function when(at: string): string {
		const d = new Date(at);
		return Number.isNaN(d.getTime())
			? at
			: d.toLocaleString('en-US', {
					timeZone: 'America/Los_Angeles',
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				});
	}
</script>

<section class="card tds" data-testid="team-documents" aria-label="Team documents">
	<h2 class="section-label">Team documents</h2>
	{#if failed}
		<p class="tds-note">The teams could not be read. Reload the page to try again.</p>
	{:else if !sections}
		<p class="tds-note">Reading the teams.</p>
	{:else if !sections.length}
		<p class="tds-note">This post is in no class you teach.</p>
	{:else}
		{#each sections as s (s.section_id)}
			<div class="tds-section">
				<p class="tds-section-head">
					<strong>{s.label}</strong>
					{#if s.team_set_id}<span class="tds-set">{s.set_label}</span>{/if}
				</p>
				{#if !s.team_set_id}
					<p class="tds-note">No team draw is posted in this class. Draw and post teams on the People tab; every student lands in their team's document the moment you post.</p>
				{:else}
					<div class="tds-teams" role="group" aria-label={`Teams in ${s.label}`}>
						{#each s.teams as t (t.id)}
							<button
								type="button"
								class="btn secondary tds-team"
								aria-pressed={teamId === t.id}
								onclick={() => openTeam(t.id)}
							>
								<span class="tds-team-name">{t.name}</span>
								<span class="tds-team-people">{t.members.join(', ')}</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	{/if}

	{#if teamId && doc?.team}
		<div class="tds-open" data-testid="team-document-open">
			<div class="tds-boxes">
				<p class="section-label">History of a box</p>
				<ul class="tds-box-list">
					{#each shared as b (b.blockId)}
						<li>
							<button type="button" class="btn ghost tds-box" aria-pressed={blockId === b.blockId} onclick={() => openBox(b.blockId)}>
								<span class="tds-box-mod">{b.module}</span>
								<span class="tds-box-label">{b.label}</span>
							</button>
						</li>
					{/each}
				</ul>
				{#if blockId}
					<ol class="tds-history" data-testid="team-box-history">
						{#if history === null}
							<li class="tds-note">Reading the history.</li>
						{:else if !history.length}
							<li class="tds-note">Nobody has written in this box yet.</li>
						{:else}
							{#each history as h, i (i)}
								<li class="tds-entry">
									<p class="tds-entry-head"><strong>{h.by}</strong> <span class="tds-when">{when(h.at)}</span></p>
									<p class="tds-was"><span class="tds-k">Before</span> {words(h.before)}</p>
									<p class="tds-now"><span class="tds-k">After</span> {words(h.after)}</p>
								</li>
							{/each}
						{/if}
					</ol>
				{/if}
			</div>
			{#key teamId}
				<HtmlAssignmentFrame
					{src}
					{title}
					{fieldToBlockId}
					{values}
					readOnly
					onfieldfocus={(f) => {
						if (shared.some((b) => b.blockId === f.blockId)) void openBox(f.blockId);
					}}
				/>
			{/key}
		</div>
	{/if}
</section>

<style>
	.tds {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		margin-top: 1rem;
	}
	.tds-note {
		margin: 0;
		color: var(--text-2, var(--dim));
		font-family: var(--font-display);
	}
	.tds-section {
		display: grid;
		gap: 0.4rem;
	}
	.tds-section-head {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1, var(--white));
	}
	.tds-set {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
	.tds-teams {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: 0.5rem;
	}
	.tds-team {
		display: grid;
		justify-items: start;
		gap: 0.15rem;
		min-height: 44px;
		text-align: left;
	}
	.tds-team-people {
		font-family: var(--font-display);
		font-size: var(--fs-caption);
		text-transform: none;
		letter-spacing: 0;
		opacity: 0.85;
	}
	.tds-open {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 1024px) {
		.tds-open {
			grid-template-columns: minmax(16rem, 22rem) minmax(0, 1fr);
			align-items: start;
		}
	}
	.tds-box-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}
	.tds-box {
		display: grid;
		justify-items: start;
		width: 100%;
		min-height: 44px;
		text-align: left;
	}
	.tds-box-mod {
		font-family: var(--font-mono);
		font-size: var(--fs-label);
		color: var(--text-2, var(--dim));
	}
	.tds-box-label {
		font-family: var(--font-display);
		text-transform: none;
		letter-spacing: 0;
	}
	.tds-history {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
		max-height: 28rem;
		overflow: auto;
	}
	.tds-entry {
		padding: 0.5rem 0.6rem;
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--bg0) 55%, transparent);
	}
	.tds-entry p {
		margin: 0.1rem 0;
		font-family: var(--font-display);
		color: var(--text-1, var(--white));
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.tds-when,
	.tds-k {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
</style>
