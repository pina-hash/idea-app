<script lang="ts">
	/**
	 * THE 0173 HARNESS: the three states decision 01 and decision 06 create,
	 * mounted as the REAL components with in-memory transports.
	 *
	 * WHY A HARNESS AT ALL. Each of these needs a different real person on a
	 * real deployment -- an admin, the teacher of record for a section, and a
	 * student enrolled in a class that has closed it -- and no automated
	 * session holds any of the three. Without this, "the refusal renders" and
	 * "the toggle is 44px" would be claims rather than measurements.
	 *
	 * THE TRANSPORTS ANSWER IN MEMORY AND NOTHING HERE IS THE SHIPPING
	 * AUTHORIZATION. The real route hands these components RPC calls whose
	 * `is_admin()` and `classroom_manages_section` are the boundary; the
	 * harness hands them functions that resolve. That is the point of the
	 * split, and it is why a passing drive here proves the ARRANGEMENT rather
	 * than the gate. The gate is proved in
	 * tests/foundry-section-gate-trust.test.ts against the real RPCs.
	 */
	import '$lib/shell/split.css';
	import '$lib/foundry/forge.css';
	import FoundryClassAccess from '$lib/foundry/FoundryClassAccess.svelte';
	import FoundryClosed from '$lib/foundry/FoundryClosed.svelte';
	import FoundryOwnerStats from '$lib/foundry/FoundryOwnerStats.svelte';
	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import FoundryTrustRoster from '$lib/foundry/FoundryTrustRoster.svelte';
	import type { FoundryClosedSection, FoundryManagedSection } from '$lib/foundry/access';
	import type {
		FoundryApp,
		FoundryAppSummary,
		FoundryTrustedRow
	} from '$lib/foundry/transports';

	/** A student in two classes, one of which has closed it and left a note. */
	const closed: FoundryClosedSection[] = [
		{
			section_id: '11111111-1111-4111-8111-111111111111',
			label: '3',
			course_title: 'Engineering I Honors',
			note: 'We are on the CAD assessment today.',
			closed_at: '2026-09-02T15:00:00.000Z'
		},
		{
			section_id: '22222222-2222-4222-8222-222222222222',
			label: '6',
			course_title: 'Engineering Design and Development',
			// A close with NO note, so the panel is exercised in both directions
			// on one screen: the sentence names both classes, the note list
			// carries only the one that has one.
			note: null,
			closed_at: '2026-09-02T15:05:00.000Z'
		}
	];

	/** What a teacher of record manages: one closed, two open. */
	let managed = $state<FoundryManagedSection[]>([
		{
			section_id: '11111111-1111-4111-8111-111111111111',
			label: '3',
			block: 'Block 3',
			course_title: 'Engineering I Honors',
			course_code: 'IDEA209H',
			foundry_closed_at: '2026-09-02T15:00:00.000Z',
			foundry_closed_note: 'We are on the CAD assessment today.'
		},
		{
			section_id: '33333333-3333-4333-8333-333333333333',
			label: '1',
			block: 'Block 1',
			course_title: 'Engineering I Honors',
			course_code: 'IDEA209H',
			foundry_closed_at: null,
			foundry_closed_note: null
		},
		{
			section_id: '44444444-4444-4444-8444-444444444444',
			label: '4',
			block: null,
			course_title: 'Introduction to Engineering',
			course_code: 'IDEA100',
			foundry_closed_at: null,
			foundry_closed_note: null
		}
	]);

	let roster = $state<FoundryTrustedRow[]>([
		{
			email: 'a.reyes@boscotech.net',
			granted_by: 'apina@boscotech.edu',
			granted_at: '2026-08-20T17:00:00.000Z',
			note: 'Consistently solid work, three clean builds.'
		},
		{
			email: 'j.okafor@boscotech.net',
			granted_by: 'apina@boscotech.edu',
			granted_at: '2026-08-28T17:00:00.000Z',
			note: null
		}
	]);

	/** Two apps, one played and one not, so the roll-up's zero case is on screen. */
	const ownApps = [
		{ id: 'app-a', title: 'Bolt Sorter' },
		{ id: 'app-b', title: 'Tolerance Trainer' }
	];
	const ownCounts = { 'app-a': { plays: 41, plays7d: 6 } };

	/**
	 * THE PINNED-PANE CASE, AND IT NEEDS THE WHOLE MECHANISM TO BE MEASURABLE.
	 *
	 * `scroll="fill"` degrades SILENTLY to page-flow without its bounded
	 * parent: the panes grow to their content and the surface looks exactly
	 * like the state it had before. So a harness that mounted the gallery in
	 * an ordinary div would measure the OLD behaviour and report it as the new
	 * one. This region carries the real contract -- `.cr-app` on the box,
	 * `.cr-app-body` on the child -- which is what /foundry's own layout and
	 * shell put around it.
	 *
	 * The list is long on purpose: the assertion is that scrolling the NAV
	 * pane leaves the open detail where it is, and a list that fits its pane
	 * has nothing to scroll.
	 */
	const galleryApps: FoundryAppSummary[] = Array.from({ length: 24 }, (_, i) => ({
		id: `gal-${i}`,
		slug: `app-${i}`,
		title: `Student app ${i + 1}`,
		tagline: 'A small browser game.',
		cover_path: null,
		published_version_id: `v-${i}`,
		published_ordinal: 1,
		version_count: 1,
		submitted_version_id: null,
		live_unreviewed_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		updated_at: '2026-09-01T12:00:00.000Z',
		owner_display_name: null,
		owner_full_name: `Author ${i + 1}`,
		owner_class: 'Engineering I Honors'
	}));

	const gallerySelected: FoundryApp = {
		id: 'gal-0',
		slug: 'app-0',
		title: 'Student app 1',
		tagline: 'A small browser game.',
		description: 'Sort the bolts by thread pitch before the belt runs out.',
		cover_path: null,
		build_notes: 'Plain HTML, CSS and a bit of JavaScript.',
		owner: 'owner-uuid',
		published_version_id: 'v-0',
		metadata_flagged_at: null,
		hidden_at: null,
		created_at: '2026-08-01T12:00:00.000Z',
		updated_at: '2026-09-01T12:00:00.000Z',
		owner_display_name: null,
		owner_full_name: 'Author 1',
		owner_class: 'Engineering I Honors',
		versions: []
	};
</script>

<svelte:head><title>0173 harness // Foundry</title></svelte:head>

<div class="fg-root harness">
	<h1>Foundry: class gate, trusted publishers, owner stats</h1>
	<p class="harness-lead">
		Dev only. The real components with in-memory transports; the database is the gate on
		the shipping path and nothing here stands in for it.
	</p>

	<section class="harness-case">
		<h2>A student whose class has closed it</h2>
		<FoundryClosed {closed} />
	</section>

	<section class="harness-case">
		<h2>The teacher of record's control</h2>
		<FoundryClassAccess
			sections={managed}
			setOpen={async (sectionId, open, note) => {
				// In memory. The real route calls foundry_set_section_open, whose
				// classroom_manages_section is the boundary.
				managed = managed.map((s) =>
					s.section_id === sectionId
						? {
								...s,
								foundry_closed_at: open ? null : new Date().toISOString(),
								foundry_closed_note: open ? null : note
							}
						: s
				);
				return { ok: true };
			}}
		/>
	</section>

	<section class="harness-case">
		<h2>The trusted publisher roster</h2>
		<FoundryTrustRoster
			rows={roster}
			transports={{
				async grantTrust(email, note) {
					roster = [
						...roster,
						{
							email,
							granted_by: 'apina@boscotech.edu',
							granted_at: new Date().toISOString(),
							note
						}
					];
					return { ok: true };
				},
				async revokeTrust(email) {
					roster = roster.filter((r) => r.email !== email);
					return { ok: true };
				}
			}}
		/>
	</section>

	<section class="harness-case">
		<h2>The owner's roll-up</h2>
		<FoundryOwnerStats apps={ownApps} playCounts={ownCounts} />
	</section>
</div>

<!--
	THE PINNED DETAIL PANE, in its own room because it is a full-height
	application and the four cases above are documents. `.cr-app` is what
	/foundry's layout puts on `.fg-root` for the gallery, and `.cr-app-body` is
	what its shell puts around the page: without BOTH, `scroll="fill"` degrades
	to page-flow and a harness would measure the old behaviour while reporting
	the new one.
-->
<div class="fg-root cr-app harness-app" data-testid="foundry-pinned-room">
	<div class="cr-app-body harness-app-body">
		<FoundryGallery
			apps={galleryApps}
			selected={gallerySelected}
			onSelect={() => {}}
		/>
	</div>
</div>

<style>
	.harness {
		padding: 1.5rem;
		display: grid;
		gap: 1.75rem;
		min-height: 100vh;
	}

	.harness h1 {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.harness-lead {
		margin: 0;
		color: var(--text-2);
	}

	.harness-case {
		display: grid;
		gap: 0.6rem;
		min-width: 0;
	}

	.harness-app {
		margin-top: 1.5rem;
		border-top: 1px solid var(--boundary);
	}

	/* The caller's half of the `fill` contract: a bounded column whose item
	   carries `min-height: 0`, so the split resolves `height: 100%` against a
	   real height rather than an auto one. */
	.harness-app-body {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}

	.harness-app-body > :global(.cr-split) {
		min-height: 0;
		flex: 1 1 auto;
	}

	.harness-case h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
</style>
