<script lang="ts">
	/**
	 * Dev harness for the REAL `ArchivePanel` -- never a copy of its markup, and
	 * never a copy of `archive.ts` either: the pure layer is the shipping one,
	 * driven by an in-memory transport that answers exactly what `0214`'s RPCs
	 * answer.
	 *
	 * A NEW ROUTE RATHER THAN A STATE ON `/dev/ideacad` OR `/dev/ideacad-team`.
	 * Those belong to ledgers 0171 and 0179 and this bundle owns neither; a new
	 * URL collides with nobody, and `tools/browser-verify/routes.mjs` derives a
	 * spec's filename from its own path, so two lanes adding two routes always
	 * produce two different files.
	 *
	 * STATES BY QUERY STRING:
	 *   state=mixed    (default) one archived row already shared with a class,
	 *                  and one off-roster row nobody has decided about. The
	 *                  state the panel exists for.
	 *   state=empty    the archive with nothing in it, which is the ORDINARY
	 *                  state for most assignments and must not read as broken.
	 *   state=off      the deployment has no 0214. The panel says so in words
	 *                  rather than rendering an empty list.
	 *   state=readonly every write transport omitted. ABSENCE IS THE MECHANISM,
	 *                  so this is the state that proves read-only is structural:
	 *                  no Archive, no Restore, no picker, no Stop sharing, and
	 *                  the list still renders.
	 *
	 * THE TRANSPORT ENFORCES NOTHING. The database is the boundary and a harness
	 * that re-implemented the rules would be a second copy of them. What it does
	 * do is MUTATE ITS OWN ROWS the way the RPCs mutate the table, so the panel's
	 * own re-render after a write is exercised rather than assumed -- including
	 * `0214`'s rule that restoring a document drops its class grants.
	 */
	import ArchivePanel from '$lib/ideacad/ui/ArchivePanel.svelte';
	import type { IdeacadArchiveRow, IdeacadArchiveSection } from '$lib/ideacad/archive';

	/* READ ONCE INTO A `const`. This file declares `$state`, so it is in runes
	   mode and a plain `let` reassigned after declaration then read in the
	   template earns `non_reactive_update` -- which would move the repository's
	   warning baseline for a value that never changes after the first frame. */
	function query(key: string, fallback: string): string {
		if (typeof window === 'undefined') return fallback;
		return new URLSearchParams(location.search).get(key) ?? fallback;
	}
	const variant = query('state', 'mixed');

	const SECTIONS: IdeacadArchiveSection[] = [
		{ sectionId: 'sec-p3', label: 'Period 3' },
		{ sectionId: 'sec-p5', label: 'Period 5' }
	];

	/** Exactly the shape `ideacad_archive` returns, ordered by owner address. */
	const SEED: IdeacadArchiveRow[] = [
		{
			documentId: 'doc-reyes',
			ownerEmail: 'ana.reyes@boscotech.net',
			archivedAt: '2026-06-04T17:20:00.000Z',
			archivedBy: 'apina@boscotech.edu',
			onRoster: false,
			reason: 'archived',
			conceptCount: 4,
			updatedAt: '2026-05-29T15:02:00.000Z',
			sharedWithSections: [
				{
					sectionId: 'sec-p3',
					label: 'Period 3',
					grantedBy: 'apina@boscotech.edu',
					grantedAt: '2026-09-02T16:00:00.000Z'
				}
			]
		},
		{
			documentId: 'doc-okonkwo',
			ownerEmail: 'daniel.okonkwo@boscotech.net',
			archivedAt: null,
			archivedBy: null,
			onRoster: false,
			reason: 'off_roster',
			conceptCount: 2,
			updatedAt: '2026-04-11T14:41:00.000Z',
			sharedWithSections: []
		}
	];

	let rows = $state<IdeacadArchiveRow[]>(variant === 'empty' || variant === 'off' ? [] : SEED);
	let opened = $state<string | null>(null);

	const readOnly = variant === 'readonly';

	const setArchived = async (documentId: string, archived: boolean) => {
		rows = rows.map((r) =>
			r.documentId !== documentId
				? r
				: {
						...r,
						archivedAt: archived ? new Date().toISOString() : null,
						archivedBy: archived ? 'apina@boscotech.edu' : null,
						reason: archived ? 'archived' : r.onRoster ? 'archived' : 'off_roster',
						// 0214 deletes the class grants when a document is restored,
						// in the same statement. The harness does it too, so the panel
						// is driven through the state that rule produces.
						sharedWithSections: archived ? r.sharedWithSections : []
					}
		);
	};

	const shareWithSection = async (documentId: string, sectionId: string) => {
		const section = SECTIONS.find((s) => s.sectionId === sectionId);
		if (!section) throw new Error('You can only share this with a class this assignment is posted to.');
		rows = rows.map((r) =>
			r.documentId !== documentId
				? r
				: {
						...r,
						sharedWithSections: [
							...r.sharedWithSections,
							{
								sectionId,
								label: section.label,
								grantedBy: 'apina@boscotech.edu',
								grantedAt: new Date().toISOString()
							}
						]
					}
		);
	};

	const unshareFromSection = async (documentId: string, sectionId: string) => {
		rows = rows.map((r) =>
			r.documentId !== documentId
				? r
				: { ...r, sharedWithSections: r.sharedWithSections.filter((s) => s.sectionId !== sectionId) }
		);
	};
	/**
	 * GEOMETRY VERDICTS FOR `npm run verify:browser`, because nothing else in
	 * this repository can answer them. happy-dom has no layout engine -- every
	 * box reads 0x0 -- so a control rendered past the edge of its panel passes
	 * every structural check ever written about it, which is exactly how ledger
	 * 0186 shipped a panel 446px over its box.
	 *
	 * EACH VERDICT IS A SENTENCE PLUS `ok` OR `BAD`, so the spec asserts an
	 * ARRAY it can read rather than a boolean nobody can audit. A verdict that
	 * finds nothing to measure answers `BAD` rather than `ok`: "no control was
	 * outside its panel" and "there were no controls" are the same reading
	 * otherwise, which is the vacuous-pass shape this repo has paid for before.
	 */
	function verdicts(): string[] {
		const out: string[] = [];
		const say = (label: string, ok: boolean) => out.push(`${label} ${ok ? 'ok' : 'BAD'}`);

		const panel = document.querySelector('[data-testid="ideacad-archive"]');
		if (!panel) return ['the archive panel is on screen BAD'];
		say('the archive panel is on screen', true);

		const box = panel.getBoundingClientRect();
		const controls = Array.from(panel.querySelectorAll('button, select'));
		say('there are controls to measure', controls.length > 0);

		const strayed = controls.filter((el) => {
			const r = el.getBoundingClientRect();
			// One device pixel of tolerance: a sub-pixel border on a fractional
			// layout is not a control outside its panel.
			return r.left < box.left - 1 || r.right > box.right + 1;
		});
		say('every control sits inside the panel that owns it', strayed.length === 0);

		say(
			'nothing is wider than the window',
			document.documentElement.scrollWidth <= window.innerWidth + 1
		);

		// The stacked-label rule, which is the other defect 0186 caught only by
		// looking: a label beside a select clips it and cuts off the marker that
		// matters. Measured as geometry rather than trusted to a class name.
		const picker = panel.querySelector('select');
		if (picker) {
			const label = picker.closest('label')?.querySelector('.lab');
			const pr = picker.getBoundingClientRect();
			const field = picker.closest('label')?.getBoundingClientRect();
			say('the class picker fills the width reserved for it', !!field && pr.width >= field.width - 2);
			say(
				'its label is above it, not beside it',
				!!label && label.getBoundingClientRect().bottom <= pr.top + 1
			);
		} else {
			say('the class picker is absent in this state, deliberately', true);
		}

		// The disclosure sentence has to be ABOVE the control it is about, or it
		// is a warning somebody reads after pressing.
		const note = panel.querySelector('[data-testid="ideacad-archive-share-note"]');
		if (note && picker) {
			say(
				'the sentence about sharing sits above the picker',
				note.getBoundingClientRect().bottom <= picker.getBoundingClientRect().top + 1
			);
		}
		return out;
	}

	if (typeof window !== 'undefined') {
		(window as unknown as Record<string, unknown>).__ideacadArchiveVerdicts = verdicts;
	}
</script>

<svelte:head><title>IdeaCAD archive harness</title></svelte:head>

<main class="harness">
	<h1>IdeaCAD archive</h1>
	<p class="hint">
		State <code>{variant}</code>. Try
		<a href="/dev/ideacad-archive?state=mixed">mixed</a>,
		<a href="/dev/ideacad-archive?state=empty">empty</a>,
		<a href="/dev/ideacad-archive?state=off">off</a>,
		<a href="/dev/ideacad-archive?state=readonly">readonly</a>.
	</p>

	<div class="stage">
		<ArchivePanel
			{rows}
			sections={SECTIONS}
			archiveReady={variant !== 'off'}
			onarchive={readOnly ? undefined : setArchived}
			onshare={readOnly ? undefined : shareWithSection}
			onunshare={readOnly ? undefined : unshareFromSection}
			onopen={(id) => (opened = id)}
		/>
	</div>

	{#if opened}
		<p class="opened" data-testid="harness-opened">Opened {opened}</p>
	{/if}
</main>

<style>
	.harness {
		/* The panel ships inside the classroom item page's detail pane, which is
		   a bounded column rather than the page measure. Harnessing it at full
		   width would measure a layout production never has. */
		max-width: 46rem;
		margin: 0 auto;
		padding: 1rem;
		display: grid;
		gap: 0.75rem;
	}
	h1 {
		margin: 0;
		font-size: 1.2rem;
		color: var(--text-1);
	}
	.hint,
	.opened {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.stage {
		min-width: 0;
	}
</style>
