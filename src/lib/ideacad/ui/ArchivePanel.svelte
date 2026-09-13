<script lang="ts">
	/**
	 * THE INSTRUCTOR'S ARCHIVE FOR ONE IDEACAD ASSIGNMENT.
	 *
	 * Mr. Pina's decision 29: a departing student's document is ARCHIVED, not
	 * deleted, and stays reachable by the instructor, who may share it with a
	 * current class. His reason is the whole design: he brings up past student
	 * work to show current students as reference, and work from students who
	 * have since left is exactly what he wants to be able to show. `0214` is the
	 * data layer, `archive.ts` is the pure layer, and this is the surface.
	 *
	 * IT IS A SECOND LIST BESIDE THE ROSTER, NEVER A MODE ON IT. `ideacad_roster`
	 * drives off the ENROLLMENT, so a document belonging to nobody currently
	 * enrolled is invisible to it by construction -- no flag on that surface
	 * could reach one. This mounts `ideacad_archive`, which is keyed on the ITEM.
	 *
	 * IT COMPUTES NO RULE OF ITS OWN. Every ordering, every count, every "may
	 * this be shared" is a pure function in `archive.ts`, and every word is a
	 * constant there. A component spelling out `row.archivedAt !== null` is the
	 * second statement of a rule the database enforces, and it is the one that
	 * stops matching.
	 *
	 * ---------------------------------------------------------------------------
	 * ABSENCE IS THE MECHANISM, THREE TIMES OVER.
	 * ---------------------------------------------------------------------------
	 *
	 * `onarchive` absent removes Archive and Restore. `onshare` absent removes
	 * the class picker. `sections` empty removes it too -- a control whose only
	 * possible outcome is a refusal must not be offered, and 0214 refuses a
	 * section the assignment is not posted to. `archiveReady` false says the
	 * deployment has no 0214 IN WORDS rather than rendering an empty panel,
	 * because "cannot tell" must never read as "there is nothing here".
	 *
	 * ---------------------------------------------------------------------------
	 * TWO THINGS THIS SURFACE SAYS OUT LOUD BECAUSE NOTHING ELSE WILL.
	 * ---------------------------------------------------------------------------
	 *
	 * `IDEACAD_ARCHIVE_SHARE_NOTE` is beside the picker BEFORE the press, the way
	 * `FoundryShare`'s sentence is: sharing hands a whole class somebody's work
	 * AND their name, and an instructor should know that before pressing rather
	 * than after. `IDEACAD_ARCHIVE_REASON_NOTES[off_roster]` is what tells them
	 * that a row they did not put here is a student who has left -- a chip alone
	 * would be a label nobody can act on.
	 *
	 * A REFUSAL IS RENDERED VERBATIM. 0214 raises the sentence somebody should
	 * read ("Archive this document first."), and a client that re-toned it would
	 * be a second wording of one rule.
	 */
	import {
		IDEACAD_ARCHIVE_EMPTY_NOTE,
		IDEACAD_ARCHIVE_REASON_LABELS,
		IDEACAD_ARCHIVE_REASON_NOTES,
		IDEACAD_ARCHIVE_SHARE_NOTE,
		IDEACAD_ARCHIVE_UNAVAILABLE,
		ideacadArchiveCanShare,
		ideacadArchiveOrder,
		ideacadArchiveShareTargets,
		ideacadArchiveUndecided,
		type IdeacadArchiveRow,
		type IdeacadArchiveSection
	} from '../archive';

	let {
		rows = [],
		sections = [],
		archiveReady = true,
		onarchive = undefined,
		onshare = undefined,
		onunshare = undefined,
		onopen = undefined
	}: {
		/** Exactly what `ideacad_archive` returned, in the order it returned it. */
		rows?: IdeacadArchiveRow[];
		/** The classes this assignment is posted to, for the share picker. */
		sections?: IdeacadArchiveSection[];
		/**
		 * Whether this deployment has `0214`. FALSE says so in words rather than
		 * hiding the panel: an instructor who cannot see the archive should be
		 * told that, not left to assume nothing is in it.
		 */
		archiveReady?: boolean;
		/** ABSENT REMOVES Archive and Restore. The mechanism, not a convenience. */
		onarchive?: (documentId: string, archived: boolean) => Promise<void>;
		onshare?: (documentId: string, sectionId: string) => Promise<void>;
		onunshare?: (documentId: string, sectionId: string) => Promise<void>;
		/** ABSENT REMOVES Open. A reader with no way to open one still gets the list. */
		onopen?: (documentId: string) => void;
	} = $props();

	let busy = $state('');
	let refusal = $state<string | null>(null);
	let done = $state<string | null>(null);
	/** Two-step confirm on anything that changes who can see somebody's work. */
	let arming = $state('');
	/** The class picked per row. Keyed by document, so two rows cannot share one. */
	let picked = $state<Record<string, string>>({});

	const ordered = $derived(ideacadArchiveOrder(rows));
	const undecided = $derived(ideacadArchiveUndecided(rows));

	/**
	 * ONE WRAPPER FOR EVERY WRITE, so the busy flag, the two notes and the
	 * `finally` exist once. Three copies of this is three ways to leave a panel
	 * disabled forever after a throw.
	 */
	async function run(key: string, message: string, work: () => Promise<void>) {
		if (busy) return;
		busy = key;
		refusal = null;
		done = null;
		try {
			await work();
			// THE ACKNOWLEDGEMENT SURVIVES THE ACT IT REPORTS. Every one of these
			// leaves the row on screen -- nothing here deletes anything -- so the
			// note can live in the panel the row is in.
			done = message;
			arming = '';
		} catch (error) {
			refusal = error instanceof Error ? error.message : String(error);
		} finally {
			busy = '';
		}
	}
</script>

<section class="arch" data-testid="ideacad-archive" aria-labelledby="ic-arch-h">
	<header>
		<h3 id="ic-arch-h">Archive</h3>
		<!-- ZERO IS RENDERED. An instructor who sees no number cannot tell
		     "nothing to decide" from "the count did not load". -->
		<span class="chip" data-testid="ideacad-archive-undecided">
			{undecided} to decide
		</span>
	</header>

	{#if !archiveReady}
		<p class="note off" role="status" data-testid="ideacad-archive-off">
			{IDEACAD_ARCHIVE_UNAVAILABLE}
		</p>
	{:else if ordered.length === 0}
		<p class="note" data-testid="ideacad-archive-empty">{IDEACAD_ARCHIVE_EMPTY_NOTE}</p>
	{/if}

	{#if refusal}
		<p class="refusal" role="status" data-testid="ideacad-archive-refusal">{refusal}</p>
	{/if}
	{#if done}
		<p class="done" role="status" data-testid="ideacad-archive-done">{done}</p>
	{/if}

	{#if archiveReady && ordered.length > 0}
		<ul data-testid="ideacad-archive-list">
			{#each ordered as row (row.documentId)}
				{@const targets = ideacadArchiveShareTargets(row, sections)}
				{@const shareable = ideacadArchiveCanShare(row)}
				<li data-testid="ideacad-archive-row" data-reason={row.reason}>
					<div class="head">
						<span class="who">{row.ownerEmail}</span>
						<!-- A WORD AND A HUE, never a hue alone. -->
						<span class="chip small" data-testid="ideacad-archive-reason">
							{IDEACAD_ARCHIVE_REASON_LABELS[row.reason]}
						</span>
						<span class="meta">{row.conceptCount} concept{row.conceptCount === 1 ? '' : 's'}</span>
					</div>

					<p class="note small">{IDEACAD_ARCHIVE_REASON_NOTES[row.reason]}</p>

					<div class="acts">
						{#if onopen}
							<button type="button" class="tap-44 go" onclick={() => onopen(row.documentId)}>
								Open
							</button>
						{/if}

						{#if onarchive}
							{#if row.archivedAt === null}
								<button
									type="button"
									class="tap-44"
									aria-disabled={busy !== ''}
									onclick={() =>
										run(row.documentId, `${row.ownerEmail}'s work is archived.`, () =>
											onarchive(row.documentId, true)
										)}
								>
									Archive
								</button>
							{:else if arming === `restore:${row.documentId}`}
								<!-- A DESTRUCTIVE ACT NAMES WHAT IT COSTS. Restoring drops
								     every class this was shared with, which 0214 does in the
								     same statement, so the confirm says so rather than
								     leaving somebody to find out. -->
								<span class="confirm">
									<button
										type="button"
										class="tap-44 yes"
										onclick={() =>
											run(
												row.documentId,
												`${row.ownerEmail}'s work is live again, and is shared with no class.`,
												() => onarchive(row.documentId, false)
											)}
									>
										Restore, and stop sharing it with {row.sharedWithSections.length} class{row
											.sharedWithSections.length === 1
											? ''
											: 'es'}
									</button>
									<button type="button" class="tap-44 no" onclick={() => (arming = '')}>Keep</button>
								</span>
							{:else}
								<button
									type="button"
									class="tap-44"
									onclick={() => (arming = `restore:${row.documentId}`)}
								>
									Restore
								</button>
							{/if}
						{/if}
					</div>

					{#if row.sharedWithSections.length > 0}
						<ul class="shares" data-testid="ideacad-archive-shares">
							{#each row.sharedWithSections as share (share.sectionId)}
								<li>
									<span class="lab">Shared with {share.label}</span>
									{#if onunshare}
										<button
											type="button"
											class="tap-44 rm"
											onclick={() =>
												run(
													`${row.documentId}:${share.sectionId}`,
													`${share.label} can no longer open this.`,
													() => onunshare(row.documentId, share.sectionId)
												)}
										>
											Stop sharing
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					<!--
						THE PICKER IS ABSENT unless the document is archived AND there is
						a class left to share it with AND a transport to do it. Each of
						those three is a refusal 0214 would give, and a control whose only
						outcome is a refusal is not offered.
					-->
					{#if onshare && shareable && targets.length > 0}
						<div class="give">
							<p class="note small" data-testid="ideacad-archive-share-note">
								{IDEACAD_ARCHIVE_SHARE_NOTE}
							</p>
							<label class="field">
								<span class="lab">Show this to</span>
								<select class="tap-44" bind:value={picked[row.documentId]}>
									<option value="">Choose a class</option>
									{#each targets as target (target.sectionId)}
										<option value={target.sectionId}>{target.label}</option>
									{/each}
								</select>
							</label>
							<button
								type="button"
								class="tap-44 go"
								aria-disabled={!picked[row.documentId] || busy !== ''}
								onclick={() => {
									const sectionId = picked[row.documentId];
									if (!sectionId) return;
									const label =
										targets.find((t) => t.sectionId === sectionId)?.label ?? 'that class';
									void run(row.documentId, `${label} can now open this.`, async () => {
										await onshare(row.documentId, sectionId);
										picked[row.documentId] = '';
									});
								}}
							>
								Share with class
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.arch {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-1);
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--text-1);
	}
	.chip {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0.15rem 0.4rem;
	}
	.note,
	.refusal,
	.done,
	.meta {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.note.small,
	.meta {
		font-size: 0.85rem;
	}
	.refusal {
		color: var(--crimson);
	}
	.done {
		color: var(--green);
	}
	.note.off {
		color: var(--amber);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	li {
		display: grid;
		gap: 0.4rem;
		/* min-width: 0 on a grid child. An item's automatic minimum is its
		   min-content, so a long address would force the whole panel wider than
		   the pane holding it. */
		min-width: 0;
		padding: 0.6rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		min-width: 0;
	}
	.who {
		color: var(--text-1);
		font-weight: 600;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	/* THE REASON IS A WORD AND A HUE. An off-roster row is the one somebody has
	   to act on, so it is the one that is tinted; an archived row is settled and
	   keeps the neutral chip. */
	li[data-reason='off_roster'] .chip.small {
		color: var(--amber);
		border-color: var(--amber);
	}
	.acts,
	.confirm,
	.give {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.give {
		align-items: end;
	}
	.field {
		/* AN EXPLICIT SINGLE COLUMN. With the column left implicit, a select's
		   track sizes to its longest option text and the control comes out
		   narrower than the box beside it -- ledger 0186 measured that on the
		   share picker one component over. */
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.2rem;
		min-width: 0;
		flex: 1 1 14rem;
	}
	.lab {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	select {
		width: 100%;
		min-width: 0;
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0.35rem 0.5rem;
	}
	button {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0.35rem 0.7rem;
		cursor: pointer;
	}
	button.go {
		color: var(--green);
		border-color: var(--green);
	}
	button.yes,
	button.rm {
		color: var(--amber);
		border-color: var(--amber);
	}
	button[aria-disabled='true'] {
		color: var(--ice);
		border-color: var(--hairline);
		cursor: not-allowed;
	}
	.shares li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		background: var(--surface-1);
	}
</style>
