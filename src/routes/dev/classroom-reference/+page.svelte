<script lang="ts">
	import '$lib/classroom/classroom.css';
	import ReferenceDoc from '$lib/classroom/ReferenceDoc.svelte';
	import SpecImporter from '$lib/classroom/SpecImporter.svelte';
	import ShortLinkManager from '$lib/ShortLinkManager.svelte';
	import { SAMPLE_REFERENCE } from '$lib/classroom/dev-reference-fixture';
	import {
		validateReferenceSpec,
		type PublicToggleResult,
		type ReferenceSpec,
		type ReferenceTransports
	} from '$lib/classroom/reference-spec';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import type {
		ClassroomItem,
		ClassroomSection,
		LinkPreview
	} from '$lib/classroom/classroom';
	import type { ShortLinkRow, ShortLinkTransports } from '$lib/short-links';

	/**
	 * Dev harness for the reference-document system (404 in production, no auth,
	 * no Supabase, no network). It mounts the REAL components -- ReferenceDoc,
	 * SpecImporter, ShortLinkManager -- against in-memory transports, so every
	 * interaction verified here is the shipping one.
	 *
	 * The public/private BOUNDARY is deliberately not simulated here: it is
	 * enforced by RLS and two SECURITY DEFINER functions, and pretending to
	 * enforce it in a harness would prove nothing about the real thing. That
	 * half is covered against a real Postgres in tests/classroom-reference.test.ts
	 * and tests/classroom-reference-route.test.ts.
	 */
	type View = 'reader' | 'stacked' | 'item-plain' | 'item-ref' | 'tools' | 'links';
	let view = $state<View>('reader');

	let spec = $state<ReferenceSpec>(SAMPLE_REFERENCE);
	let stackedSpec = $derived<ReferenceSpec>({ ...spec, navigation: 'stacked' });

	// ------------------------------------------------------------------
	// A fake link-preview endpoint. One URL answers with metadata, the other
	// 404s -- which is the linkCard degradation contract: a dead target must
	// still leave its fallbackLabel readable on the page.
	// ------------------------------------------------------------------
	const previews: Record<string, LinkPreview> = {
		'https://example.com/dial-caliper': {
			ok: true,
			url: 'https://example.com/dial-caliper',
			title: 'Dial Caliper 6" / 150mm',
			site_name: 'Example Tools',
			description: 'Hardened stainless, 0.001 in graduation, fitted case.',
			image_url: null
		}
	};
	async function fetchPreview(url: string): Promise<LinkPreview | null> {
		await new Promise((r) => setTimeout(r, 40));
		return previews[url] ?? null;
	}

	// ------------------------------------------------------------------
	// Teacher tools, in memory.
	// ------------------------------------------------------------------
	let attached = $state<ReferenceSpec | null>(SAMPLE_REFERENCE);
	let isPublic = $state(false);
	let toolLog = $state<string[]>([]);

	const referenceTransports: ReferenceTransports = {
		async setReferenceSpec(itemId, raw) {
			toolLog = [...toolLog, `setReferenceSpec(${itemId}, ${raw ? 'spec' : 'null'})`];
			if (raw == null) {
				attached = null;
				return { ok: true };
			}
			// The REAL validator, so the harness refuses exactly what the server
			// would rather than accepting anything shaped roughly right.
			const { spec: parsed, errors } = validateReferenceSpec(raw);
			if (!parsed) return { ok: false, message: errors[0] ?? 'Invalid document.' };
			attached = parsed;
			spec = parsed;
			return { ok: true };
		},
		async setPublic(itemId, next) {
			toolLog = [...toolLog, `setPublic(${itemId}, ${next})`];
			isPublic = next;
			const data: PublicToggleResult = {
				ok: true,
				item_id: itemId,
				is_public: next,
				has_reference: !!attached,
				attachments: 2
			};
			return { ok: true, data };
		}
	};

	// ------------------------------------------------------------------
	// A MATERIAL on the real ItemDetail page, with and without a document.
	// This is the regression view for "an existing Materials post with a
	// rich-text body and no spec renders unchanged": same component, same
	// item, the reference spec the only difference.
	// ------------------------------------------------------------------
	const devSection: ClassroomSection = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 1',
		block: null,
		teacher_email: 'teacher@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA000', title: 'Sample Course', active: true }
	};
	const devMaterial: ClassroomItem = {
		id: 'm-1',
		kind: 'material',
		title: 'Course syllabus',
		body: 'Grading, materials, and the shop safety rules. Keep this open all term.',
		points: null,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: 'Mr. Pina',
		published: true,
		pinned: true,
		is_public: false,
		sort_order: 0,
		first_published_at: '2026-07-14T17:00:00Z',
		edited_at: null,
		created_at: '2026-07-14T17:00:00Z',
		updated_at: '2026-07-14T17:00:00Z',
		links: [],
		attachments: [],
		postings: [{ section_id: 's-1' }]
	};

	// ------------------------------------------------------------------
	// Short links, in memory (mirroring 0093's own rules).
	// ------------------------------------------------------------------
	let linkRows = $state<ShortLinkRow[]>([
		{
			slug: '209h',
			target: '/reference/00000000-0000-0000-0000-0000000209ab',
			label: 'IDEA209H syllabus',
			active: true,
			created_by: 'apina@boscotech.edu',
			created_at: '2026-08-13T00:00:00Z',
			updated_at: '2026-08-13T00:00:00Z'
		}
	]);
	const linkTransports: ShortLinkTransports = {
		async upsert(slug, target, label, active) {
			const existing = linkRows.find((r) => r.slug === slug);
			if (existing) {
				linkRows = linkRows.map((r) =>
					r.slug === slug ? { ...r, target, label, active, updated_at: '2026-08-13T00:00:00Z' } : r
				);
			} else {
				linkRows = [
					...linkRows,
					{
						slug,
						target,
						label,
						active,
						created_by: 'apina@boscotech.edu',
						created_at: '2026-08-13T00:00:00Z',
						updated_at: '2026-08-13T00:00:00Z'
					}
				];
			}
			return { ok: true };
		},
		async remove(slug) {
			linkRows = linkRows.filter((r) => r.slug !== slug);
			return { ok: true };
		},
		async reload() {
			return [...linkRows].sort((a, b) => a.slug.localeCompare(b.slug));
		}
	};
</script>
<svelte:head><title>dev // classroom reference</title></svelte:head>

<!-- The classroom's own room, so this harness shows what production shows.
     Without it these components render on the portal's green plate with the
     scanline overlay behind them -- the surfaces they were deliberately moved
     OFF -- and a harness that renders in the wrong room is a harness nobody
     can trust for a visual check. -->
<div class="cr-root">
<div class="app-header">
	<span class="wordmark">IDEA</span>
	<span class="dev-tag">dev harness // reference documents</span>
</div>

<main class="dev-page">
	<nav class="views">
		{#each [['reader', 'Reader (tabs)'], ['stacked', 'Reader (stacked)'], ['item-plain', 'Material: no document'], ['item-ref', 'Material: with document'], ['tools', 'Teacher tools'], ['links', 'Short links']] as [id, label] (id)}
			<button
				type="button"
				class="btn secondary tiny"
				class:on={view === id}
				onclick={() => (view = id as View)}
			>
				{label}
			</button>
		{/each}
	</nav>

	{#if view === 'reader'}
		<p class="hint">
			Deep links: try <code>/dev/classroom-reference#ai-policy</code> from a cold load, and the
			<code>#materials</code> link card whose second target 404s.
		</p>
		<ReferenceDoc {spec} {fetchPreview} />
	{:else if view === 'stacked'}
		<ReferenceDoc spec={stackedSpec} {fetchPreview} />
	{:else if view === 'item-plain' || view === 'item-ref'}
		<ItemDetail
			section={devSection}
			item={devMaterial}
			referenceSpec={view === 'item-ref' ? spec : null}
			{fetchPreview}
		/>
	{:else if view === 'tools'}
		<section class="card">
			<h2 class="section-label">Reference document</h2>
			<SpecImporter
				kind="reference"
				itemId="item-1"
				spec={attached}
				{isPublic}
				attachmentCount={2}
				transports={referenceTransports}
			/>
		</section>
		<section class="card">
			<h2 class="section-label">Transport log</h2>
			{#if toolLog.length}
				<ul class="log">
					{#each toolLog as line, i (i)}<li>{line}</li>{/each}
				</ul>
			{:else}
				<p class="hint">Nothing yet.</p>
			{/if}
		</section>
	{:else}
		<ShortLinkManager links={linkRows} transports={linkTransports} />
	{/if}
</main>
</div>

<style>
	.dev-page {
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.dev-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--dim);
	}
	.views {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		margin: 0.8rem 0;
	}
	.btn.secondary.tiny {
		font-size: 0.65rem;
		padding: 0.28rem 0.6rem;
	}
	.btn.on {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.hint {
		color: var(--dim);
		font-size: 0.82rem;
		margin: 0 0 0.8rem;
	}
	code {
		font-family: 'Share Tech Mono', monospace;
		color: var(--gold);
		font-size: 0.9em;
	}
	.section-label {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		font-family: 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.log {
		margin: 0;
		padding-left: 1.1rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--dim);
	}
	.card {
		margin-bottom: 0.9rem;
	}
</style>
