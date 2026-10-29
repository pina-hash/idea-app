<script lang="ts">
	/**
	 * THE WORK BESIDE THE TEAM GRADER (ledger 0456, report 956f6664: "cant even
	 * see the assignment or individual work"). The team's document as students
	 * see it, in the REAL frame, read only: the team's shared answers and
	 * pictures, plus one member's own boxes when a member is picked. Under it,
	 * each shared box with who wrote it last, so a role score can be checked
	 * against its owner's work.
	 *
	 * Reads only: the team's document (`classroom_team_document_for`, a manager
	 * read) and the members' own answers and pictures through the reviewer's
	 * row policies. The frame is handed no write path, so nothing here saves.
	 */
	import { untrack } from 'svelte';
	import HtmlAssignmentFrame from './html-assignment/HtmlAssignmentFrame.svelte';
	import type { HtmlAssignmentManifest } from './html-assignment/manifest';
	import type { HxImageState } from './html-assignment/bridge';
	import { hxBlockFieldMap, hxBridgeValue } from './html-assignment/answers';
	import { hxBlockPrompt } from './html-assignment/manifest';
	import { hxTeamBlocks, parseTeamDocument, teamValuesFor, type TeamDocument } from './html-assignment/team-doc';
	import { submissionFileSrc, type ResponseValue } from './assignment-spec';
	import type { TeamWorkTransports } from './team-grade';

	let {
		itemId,
		teamId,
		members,
		manifest,
		src,
		title,
		fieldToBlockId,
		transports
	}: {
		itemId: string;
		teamId: string;
		members: { email: string; name: string }[];
		manifest: HtmlAssignmentManifest;
		src: string;
		title: string;
		fieldToBlockId: Readonly<Record<string, string>>;
		transports: TeamWorkTransports;
	} = $props();

	let doc = $state<TeamDocument | null>(null);
	let answers = $state<{ student_email: string; block_id: string; value: unknown }[]>([]);
	let files = $state<{ id: string; student_email: string; block_id: string | null; filename: string; caption: string | null; created_at: string }[]>([]);
	let who = $state<string | null>(null);
	let failed = $state(false);

	/** Read the team's work: once per team, the injected reads called untracked. */
	async function load(team: string) {
		const emails = members.map((m) => m.email);
		who = emails[0] ?? null;
		const [raw, rows, pics] = await Promise.all([
			transports.readTeam(itemId, team).catch(() => null),
			transports.readAnswers(itemId, emails).catch(() => []),
			transports.readFiles(itemId, emails).catch(() => [])
		]);
		if (team !== teamId) return;
		doc = parseTeamDocument(raw);
		failed = !doc;
		answers = rows;
		files = pics;
	}
	$effect(() => {
		const team = teamId;
		untrack(() => void load(team));
	});

	const shared = $derived(hxTeamBlocks(manifest));
	const fieldOf = $derived(hxBlockFieldMap(manifest));

	/** The team's answers in every shared box, and the picked member's own answers in the rest. */
	const values = $derived.by(() => {
		const out: Record<string, string | boolean> = doc ? teamValuesFor(manifest, doc) : {};
		for (const row of answers) {
			if (row.student_email !== who || shared.has(row.block_id)) continue;
			const field = fieldOf.get(row.block_id);
			const v = hxBridgeValue(row.value as ResponseValue);
			if (field && v !== null) out[field] = v;
		}
		return out;
	});

	/** The newest picture per shared box from any member, and the picked member's own. */
	const images = $derived.by(() => {
		const out: Record<string, HxImageState> = {};
		const newest = [...files].sort((a, b) => a.created_at.localeCompare(b.created_at));
		for (const f of newest) {
			if (!f.block_id) continue;
			if (!shared.has(f.block_id) && f.student_email !== who) continue;
			const field = fieldOf.get(f.block_id);
			if (field) out[field] = { url: submissionFileSrc(f.id), name: f.filename, caption: f.caption ?? '' };
		}
		return out;
	});

	/** Each shared box: its words, and who wrote it last. */
	const boxes = $derived.by(() => {
		const list: { blockId: string; label: string; module: string; by: string | null }[] = [];
		for (const mod of manifest.modules ?? []) {
			for (const b of mod.blocks ?? []) {
				if (!shared.has(b.id)) continue;
				const picture = files.filter((f) => f.block_id === b.id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
				const by = doc?.values[b.id]?.by ?? (picture ? (members.find((m) => m.email === picture.student_email)?.name ?? null) : null);
				list.push({ blockId: b.id, label: hxBlockPrompt(b) ?? b.field, module: mod.title, by });
			}
		}
		return list;
	});
</script>

<section class="card tgw" data-testid="team-grade-work" aria-label="The team's work">
	<header class="tgw-head">
		<h2 class="section-label">The team's document</h2>
		<div class="tgw-who" role="group" aria-label="Whose own boxes to show">
			{#each members as m (m.email)}
				<button type="button" class="btn secondary tgw-key" aria-pressed={who === m.email} onclick={() => (who = m.email)}>{m.name}</button>
			{/each}
		</div>
		<p class="tgw-hint">Team and role boxes show the team's answer. The rest show {members.find((m) => m.email === who)?.name ?? 'a member'}'s own work.</p>
	</header>
	{#if failed}
		<p class="tgw-hint">This team's document could not be read. Reload the page to try again.</p>
	{:else}
		<div class="tgw-frame">
			{#key `${teamId}:${who}`}
				<HtmlAssignmentFrame {src} {title} {fieldToBlockId} {values} {images} readOnly />
			{/key}
		</div>
		<details class="tgw-boxes">
			<summary>Who wrote each team box</summary>
			<ul>
				{#each boxes as b (b.blockId)}
					<li><span class="tgw-box">{b.module}: {b.label}</span><span class="tgw-by">{b.by ?? 'empty'}</span></li>
				{/each}
			</ul>
		</details>
	{/if}
</section>

<style>
	.tgw {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem;
		min-width: 0;
	}
	.tgw-head {
		display: grid;
		gap: 0.45rem;
	}
	.tgw-head .section-label {
		margin: 0;
	}
	.tgw-who {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.tgw-key {
		min-height: 44px;
		text-transform: none;
		letter-spacing: 0;
		font-family: var(--font-display);
	}
	.tgw-key[aria-pressed='true'] {
		border-color: var(--green);
		color: var(--green);
	}
	.tgw-hint {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.92rem;
		color: var(--text-2, var(--dim));
	}
	.tgw-frame {
		min-width: 0;
	}
	.tgw-boxes summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
		cursor: pointer;
	}
	.tgw-boxes ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.25rem;
	}
	.tgw-boxes li {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		font-family: var(--font-display);
		font-size: 0.92rem;
		color: var(--text-1, var(--white));
	}
	.tgw-by {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--cyan);
		white-space: nowrap;
	}
</style>
