<script lang="ts">
	import { untrack } from 'svelte';
	import Pending from '$lib/Pending.svelte';
	import { holdDeployReload } from '$lib/shell/deploy-safety';
	import type { GradingData } from '$lib/classroom/assignment-spec';
	import {
		sectionTitle,
		type ClassroomEnrollment,
		type ClassroomItem,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import {
		BULK_INDEX_NAME,
		NOT_ON_ROSTER_FOLDER,
		buildBulkZip,
		bulkCountLine,
		bulkDoneLine,
		bulkDownloadPlan,
		bulkNotes,
		bulkZipName,
		type BulkPart
	} from '$lib/classroom/bulk-download';
	import type { BulkFileSource } from '$lib/classroom/bulk-download-source';

	/**
	 * "Download all files" (ledger 0298, A6): every file the class handed in on
	 * this assignment, as one zip, a folder per student named from the roster,
	 * every file renamed for the student and the block it came from, and an
	 * `index.csv` describing each one.
	 *
	 * ABSENCE OF `source` REMOVES THE CONTROL, and there is no flag. A mount
	 * handed nothing renders nothing -- not a disabled button, not a sentence --
	 * which is how every other optional transport on this console behaves.
	 *
	 * THE COUNT IS ON SCREEN BEFORE THE PRESS AND IS THE PLAN'S OWN, derived from
	 * the payload the console is already showing through `bulkDownloadPlan`, so
	 * the number beside the button is the number of rows in `index.csv`.
	 *
	 * IT HONOURS THE CONSOLE'S CLASS AND ITS SELECTION: `scopeSection` is the
	 * export panel's class (the console's own section when there is one), and a
	 * non-empty `selected` narrows the download to exactly those students.
	 *
	 * A FAILED FILE NEVER ABORTS THE ZIP. It keeps its row in `index.csv` with the
	 * reason, and the sentence afterwards says "40 of 42" in words. Deploy
	 * reloads are held while a zip is being built, because a reload mid-build
	 * throws away everything fetched so far with nothing to say so.
	 */
	let {
		source = null,
		item,
		data,
		sections,
		scopeSection,
		selected = [],
		standingOf,
		outOf,
		save
	}: {
		source?: BulkFileSource | null;
		item: ClassroomItem;
		data: GradingData | null;
		/** Every class this console knows, for the class column. */
		sections: ClassroomSection[];
		/** The class being downloaded. */
		scopeSection: ClassroomSection;
		/** The console's tick-box selection; empty means the whole class. */
		selected?: string[];
		/** The roster chip's own words for a student. */
		standingOf?: (email: string) => string;
		outOf: number;
		/** The console's one download helper. */
		save: (blob: Blob, filename: string) => void;
	} = $props();

	/**
	 * EVERY ROSTER THE CALLER MANAGES, asked once. It is what tells a student in
	 * another of their classes (whose work this payload legitimately carries,
	 * because an assignment posted to three blocks is one item) from a stranger.
	 * Until it answers the plan runs without it, which files such a student
	 * under the not-on-roster folder -- the safe side of the two readings.
	 */
	let managed = $state<ClassroomEnrollment[] | null>(null);
	$effect(() => {
		// Track the input the effect exists for; untrack the injected CALL, which
		// is code the mounting surface wrote (CLAUDE.md's Svelte 5 rule).
		const src = source;
		if (!src?.managedRoster) return;
		let live = true;
		void untrack(() => src.managedRoster?.())?.then((rows) => {
			if (live) managed = rows;
		});
		return () => {
			live = false;
		};
	});

	const plan = $derived(
		bulkDownloadPlan({
			item,
			data: data ?? { roster: [], submissions: [], files: [] },
			managedRoster: managed,
			sections,
			scopeSectionId: scopeSection.id,
			selected,
			blocks: source?.blocks ?? new Map()
		})
	);
	const scopeLabel = $derived(
		plan.scope === 'selection' ? 'selected students' : sectionTitle(scopeSection)
	);
	const notes = $derived(bulkNotes(plan));
	const empty = $derived(plan.entries.length === 0);

	let busy = $state(false);
	/** "Downloading file 12 of 42", then "Building zip". */
	let progressLabel = $state('');
	/**
	 * One sentence per zip built, keyed by the class AND the part, so a re-press
	 * replaces its own and switching the class picker does not leave Period 1's
	 * "Downloaded 42 files" standing under Period 3's count.
	 */
	let doneLines = $state<Record<string, string>>({});
	const doneHere = $derived(
		Object.entries(doneLines).filter(([key]) => key.startsWith(`${scopeLabel}#`))
	);
	let failure = $state<string | null>(null);

	function partLabel(part: BulkPart, of: number): string {
		const who = (folder: string) => folder.replace(`${NOT_ON_ROSTER_FOLDER}/`, 'not on roster, ');
		return `Download zip ${part.index} of ${of} (${who(part.firstFolder)} to ${who(part.lastFolder)})`;
	}

	/**
	 * ONE PART AT A TIME, so the memory held is one part's and never the whole
	 * class's. `buildBulkZip` does the fetching, the index and the zip; this
	 * only holds the deploy reload, reports progress and saves the result.
	 */
	async function build(part: BulkPart, of: number) {
		const src = source;
		// THE HANDLER ASKS THE SAME PREDICATE THE CONTROL SHOWS (`aria-disabled`).
		if (!src || busy || part.entries.length === 0) return;
		// The class AT THE PRESS: the part was planned for it, so the zip's name
		// and its sentence are too, whatever the picker says by the time it lands.
		const label = scopeLabel;
		busy = true;
		failure = null;
		const release = holdDeployReload('Building a zip of student files', { warnOnUnload: true });
		try {
			progressLabel = `Downloading file 0 of ${part.entries.length}`;
			const result = await buildBulkZip({
				item,
				part,
				deps: src,
				standingOf,
				outOf,
				onProgress: (done, total) => {
					progressLabel =
						done < total ? `Downloading file ${done} of ${total}` : 'Building the zip';
				}
			});
			save(
				new Blob([result.zip as unknown as BlobPart], { type: 'application/zip' }),
				bulkZipName(item, label, part.index, of)
			);
			doneLines = {
				...doneLines,
				[`${label}#${part.index}`]: bulkDoneLine(result.included, result.total, part.index, of)
			};
		} catch (err) {
			failure = `The zip could not be built: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			// IN A `finally`, the console's own convention: a throw otherwise leaves
			// the control disabled and the deploy hold standing.
			release();
			busy = false;
			progressLabel = '';
		}
	}
</script>

{#if source}
	<div class="bfd" data-testid="bulk-files">
		<p class="bfd-label">Every student file</p>
		<p class="bfd-count" data-testid="bulk-files-count">
			{bulkCountLine(plan)}{empty ? '' : plan.scope === 'selection' ? '' : ` in ${scopeLabel}`}
		</p>
		{#each notes as note (note)}
			<p class="bfd-note" data-testid="bulk-files-note">{note}</p>
		{/each}
		<div class="bfd-actions">
			{#if plan.parts.length > 1}
				{#each plan.parts as part (part.index)}
					<button
						type="button"
						class="btn secondary tiny"
						aria-disabled={busy}
						data-testid="bulk-files-download"
						onclick={() => build(part, plan.parts.length)}
					>
						{partLabel(part, plan.parts.length)}
					</button>
				{/each}
			{:else}
				<!-- `aria-disabled`, never `disabled`: with nothing handed in the
				     control still explains itself, through the count line above. -->
				<button
					type="button"
					class="btn secondary tiny"
					aria-disabled={busy || empty}
					data-testid="bulk-files-download"
					onclick={() => plan.parts[0] && build(plan.parts[0], 1)}
				>
					Download all files
				</button>
			{/if}
		</div>
		{#if busy}<Pending label={progressLabel} />{/if}
		{#each doneHere as [key, line] (key)}
			<p class="bfd-done" data-testid="bulk-files-done">{line}</p>
		{/each}
		{#if failure}<p class="feedback error" data-testid="bulk-files-error">{failure}</p>{/if}
		<p class="bfd-about">
			A folder per student, named from the roster. Each file is renamed for the student, this
			assignment and the question it answers, and {BULK_INDEX_NAME} lists every file with its
			original name, when it arrived and the student's standing.
		</p>
	</div>
{/if}

<style>
	/* A GROUP OF ITS OWN INSIDE THE EXPORT PANEL, separated from the three
	   exports above by a rule rather than a second card: the panel already draws
	   the region's edge. */
	.bfd {
		margin-top: var(--space-3);
		padding-top: var(--space-2);
		border-top: 1px solid var(--hairline);
		min-width: 0;
	}
	.bfd-label {
		margin: 0 0 var(--space-1);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.bfd-count {
		margin: 0 0 var(--space-1);
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.bfd-note,
	.bfd-about {
		margin: 0 0 var(--space-1);
		font-size: 0.68rem;
		line-height: 1.45;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.bfd-about {
		margin-top: var(--space-2);
	}
	/* WRAPS RATHER THAN SCROLLS, the export row's own rule: a zip label names
	   two students and the roster column is 260px at its narrow end. */
	.bfd-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-top: var(--space-2);
		min-width: 0;
	}
	.bfd-actions .btn {
		max-width: 100%;
		white-space: normal;
		text-align: left;
	}
	.bfd-done {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		line-height: 1.45;
		color: var(--green);
	}
</style>
