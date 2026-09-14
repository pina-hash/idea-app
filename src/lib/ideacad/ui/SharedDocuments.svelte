<script lang="ts">
	/**
	 * WHAT HAS BEEN SHARED WITH YOU, AND ONE TAP TO OPEN IT.
	 *
	 * `0205` shipped `ideacad_shared_with_me` and `ideacad_open_shared_document`
	 * and BOTH HAD NO CALLER. Ledger 0190 built `SharePanel` and ledger 0195
	 * mounted it on the real item page, so a student could hand a classmate
	 * view-only or editor access -- and that classmate had no surface anywhere
	 * that named the document, let alone opened it. `ideacad_shared_with_me` is
	 * their ONLY way to learn a document id (the roster is teacher-only and a
	 * classmate's document is on no surface they can already read), so without
	 * this component the grant was unreachable by construction rather than by
	 * oversight. This is the other half.
	 *
	 * ---------------------------------------------------------------------------
	 * ONE PRIMARY CONTROL PER ROW, AND THE ROW ALREADY OPEN HAS NONE.
	 * ---------------------------------------------------------------------------
	 *
	 * `PartsPanel`'s shape, for the same reason Mr. Pina gave there: one tap, one
	 * row, no mode. A row that is not open offers **Open**; the row that IS open
	 * offers nothing and says "Open now" instead, because re-opening the document
	 * already on screen is a press whose only outcome is nothing happening, and
	 * CLAUDE.md forbids offering one of those. The absence has a sentence beside
	 * it, which is the rule that keeps it from reading as a bug.
	 *
	 * ---------------------------------------------------------------------------
	 * A VIEWER IS NEVER SHOWN A CONTROL THAT WOULD BE REFUSED.
	 * ---------------------------------------------------------------------------
	 *
	 * The gate is the ROLE's own `canWrite`, never the presence of a callback --
	 * ledger 0195's shape, and the reason is that a page bug hands every callback
	 * down regardless. So `row.canWrite` decides, the ROLE NOTE says why, and
	 * `store.ts`'s `refuseWrite` is the floor under both: a surface that ignored
	 * all of this still cannot put a write on the wire.
	 *
	 * ---------------------------------------------------------------------------
	 * NOTHING SHARED IS A NORMAL STATE AND RENDERS NO PLACEHOLDER.
	 * ---------------------------------------------------------------------------
	 *
	 * Private by default is decision 24's whole premise, so an empty list is the
	 * DEFAULT rather than a deficiency: the panel renders a heading and one quiet
	 * line, never "0 documents". A deployment with no `0205` is a different
	 * absence and says a different thing -- "cannot tell" must never render as
	 * "nothing is shared with you".
	 */
	import {
		IDEACAD_SHARED_ACCESS_LOST,
		IDEACAD_SHARED_HEADING,
		ideacadSharedIsOpen,
		ideacadSharedSummary,
		type IdeacadSharedCapability,
		type IdeacadSharedRow
	} from '../shared-open';

	let {
		rows = [],
		capability = { ready: true, reason: null },
		openDocumentId = null,
		accessLost = false,
		busy = false,
		onopen = undefined
	}: {
		/** Already shaped and ordered by `ideacadSharedRows`. This component sorts
		 *  nothing: a second ordering is the one that disagrees with the list the
		 *  owner is looking at on the same screen. */
		rows?: IdeacadSharedRow[];
		/** Whether this deployment could answer at all. */
		capability?: IdeacadSharedCapability;
		/** Which document is on screen right now, if any. */
		openDocumentId?: string | null;
		/** Set when the open document's grant was removed mid-session. */
		accessLost?: boolean;
		busy?: boolean;
		/** THE ONLY CALLBACK. Its absence removes every Open control, which is how
		 *  a surface with no store mounts this as a pure list. */
		onopen?: (documentId: string) => void;
	} = $props();

	const summary = $derived(ideacadSharedSummary(rows));
</script>

<section class="shared" data-testid="ideacad-shared" aria-labelledby="ic-shared-h">
	<header>
		<h3 id="ic-shared-h">{IDEACAD_SHARED_HEADING}</h3>
		<!--
			THE SUMMARY IS GATED ON THE CAPABILITY, NOT ONLY ON THE LIST, AND THAT
			GATE IS A DEFECT THE BROWSER PASS FOUND. Written as `{#if summary}`
			alone it rendered "2 documents shared with you (1 you can edit, 1 to
			look at)" on a deployment with no `0205` -- a confident answer, in the
			header, two lines above a sentence saying the question could not be
			asked. Every content check passed: the words were all correct, the rows
			were correctly absent, and the one thing wrong was that a number
			appeared at all. `capability.ready` is the same condition the list
			itself is behind, and saying it twice is what let the two drift.

			AND IT IS WITHHELD ONCE ACCESS IS LOST, for the same reason the row
			stops claiming its role. The list was fetched before the grant went
			away, so "1 you can edit" counts a document the student has just been
			told they cannot open -- a milder version of the same contradiction,
			in the header, two lines above the notice. There is no honest count
			to put there: the panel knows the list is out of date and does not
			know what the new one says, so it says nothing rather than a number.
		-->
		{#if capability.ready && !accessLost && summary}
			<span class="chip" data-testid="ideacad-shared-summary">{summary}</span>
		{/if}
	</header>

	{#if !capability.ready}
		<!--
			THE LADDER'S OWN SENTENCE, and it is not the empty-list sentence. A
			deployment between 0204 and 0205 could not ask the question; reporting
			that as "nothing is shared with you" would be a confident answer to a
			question nobody asked.
		-->
		<p class="note" data-testid="ideacad-shared-unavailable">{capability.reason}</p>
	{:else if rows.length === 0}
		<p class="note" data-testid="ideacad-shared-empty">
			Nobody has shared a document with you on this assignment. Your own work is
			private until you share it.
		</p>
	{:else}
		{#if accessLost}
			<!--
				THE TERMINAL NOTICE. It says what is still true first: the work on
				screen is there, and what is gone is the ability to save it here.
			-->
			<p class="notice" data-testid="ideacad-shared-access-lost">
				<span class="mark" aria-hidden="true">!</span>
				<span>{IDEACAD_SHARED_ACCESS_LOST}</span>
			</p>
		{/if}
		<ul>
			{#each rows as row (row.documentId)}
				{@const isOpen = ideacadSharedIsOpen(row, openDocumentId)}
				{@const lost = accessLost && isOpen}
				<li class:current={isOpen && !lost} class:lost data-testid="ideacad-shared-row">
					<span class="who">
						<span class="owner">{row.ownerEmail}</span>
						<!--
							A WORD BESIDE THE HUE, ALWAYS. Colour is never the only signal,
							and the word is `sharing.ts`'s own label.

							THE ROLE IS WITHHELD ONCE ACCESS IS LOST, AND THAT IS A DEFECT
							RASTERIZING CAUGHT. The list is fetched once and the loss is
							learned later, so the stale row went on reading "Can edit" and
							"Open now" three lines under a notice saying the access was gone
							-- a flat contradiction on one screen, with the row being the
							half a student actually reads. Every check passed, because the
							notice was present and the rows were present and nothing
							compares two claims for agreement. A claim this panel can no
							longer stand behind is not softened, it is replaced.
						-->
						{#if lost}
							<span class="chip role ro" data-testid="ideacad-shared-row-lost">Access removed</span>
						{:else}
							<span class="chip role" class:ro={!row.canWrite}>{row.label}</span>
						{/if}
					</span>
					<!--
						ONE SENTENCE, FROM `sharing.ts`. It carried a second, separate
						view-only sentence under it until the pages were looked at, which
						put two paragraphs saying the same thing on every viewer row.
						`data-testid` marks it when the role cannot write, so the surface
						that says WHY is the same surface that names the role.
					-->
					<span
						class="note row-note"
						data-testid={lost
							? 'ideacad-shared-row-lost-note'
							: row.canWrite
								? 'ideacad-shared-rolenote'
								: 'ideacad-shared-viewonly'}
					>
						{lost
							? 'You cannot open this document again unless the owner shares it with you.'
							: row.note}
					</span>
					{#if lost}
						<!-- NO CONTROL AND NO "Open now". Both would be claims about a
						     document this caller can no longer reach. -->
					{:else if isOpen}
						<span class="held" data-testid="ideacad-shared-current">Open now</span>
					{:else if onopen}
						<button
							type="button"
							class="act"
							data-testid="ideacad-shared-open"
							aria-disabled={busy}
							onclick={() => onopen(row.documentId)}
						>
							Open
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.shared {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		/* A CONTAINER, NOT A MEDIA QUERY. CLAUDE.md's rule and `PartsPanel`'s
		   reason: this panel is mounted inside somebody else's pane, so the
		   viewport says nothing about the room it actually has. The threshold
		   below was measured against the real container at both widths. */
		container-type: inline-size;
	}
	header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--text-1);
	}
	.chip {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0.15rem 0.4rem;
	}
	.chip.role.ro {
		border-color: var(--ic-warn, var(--amber));
		color: var(--ic-warn, var(--amber));
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.notice {
		display: flex;
		flex-wrap: wrap;
		/* THE MARK ALIGNS TO THE FIRST LINE. Centred, a three-line notice puts
		   the "!" beside line two, where it reads as an interruption rather than
		   a marker on the block. Only visible where the sentence wraps, which at
		   375 it does. */
		align-items: flex-start;
		gap: 0.4rem;
		margin: 0;
		padding: 0.4rem 0.5rem;
		font-size: 0.9rem;
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.notice .mark {
		flex: 0 0 auto;
		font: 14px 'Share Tech Mono', monospace;
	}
	/* THE SENTENCE SHRINKS SO THE MARK STAYS BESIDE IT. Its automatic minimum is
	   its min-content -- the longest word -- which is enough to push the mark
	   onto a line of its own above the text. */
	.notice > span:not(.mark) {
		min-width: 0;
		flex: 1 1 12rem;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	li {
		display: grid;
		/* THE TRACK IS DEFINITE. Ledger 0190 measured a select come out 103px
		   inside a 176px field because a percentage width sat in an implicit
		   `auto` track, so every track that holds a sized child is named. */
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.35rem 0.6rem;
		padding: 0.5rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	li.current {
		border-color: var(--green);
	}
	.who {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
		/* An address is one long word, so without this the row's min-content
		   forces the whole pane wider than the viewport. */
		min-width: 0;
	}
	.owner {
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.row-note {
		grid-column: 1 / -1;
	}
	/*
	 * THE ACTION IS PLACED EXPLICITLY, AND THAT IS A DEFECT RASTERIZING CAUGHT.
	 * The note spans both columns, so the button fell into the NEXT implicit row
	 * and stretched across `minmax(0, 1fr)`: an "Open" control measured 873px
	 * wide at 1440, which is ledger 0190's 103px-select in reverse and is
	 * invisible to every content check -- the button was present, visible, over
	 * 44px and correctly labelled. Pinning it to column 2 of the FIRST row puts
	 * it beside the address where a row action belongs, and `justify-self: end`
	 * stops the `auto` track stretching it.
	 */
	li > button,
	li > .held {
		grid-column: 2;
		grid-row: 1;
		justify-self: end;
	}
	button {
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--green);
		border-radius: var(--radius-control);
	}
	button:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
		border-color: var(--boundary);
	}
	.held {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--green);
	}
	/* THE ROW STACKS WHEN THE PANE IS NARROW, not when the screen is. Measured
	   against the real container before the number was chosen: an address plus a
	   role chip plus a 44px control does not fit beside each other below about
	   22rem, and the panel is wider than that at 1440 and narrower at 375. */
	@container (max-width: 22rem) {
		li {
			grid-template-columns: minmax(0, 1fr);
		}
		/* ONE COLUMN, so the action returns to the flow BELOW the address rather
		   than beside it -- the explicit `grid-row: 1` above would otherwise sit
		   it on top of the owner line once there is only one track. */
		li > button,
		li > .held {
			grid-column: 1;
			grid-row: auto;
			justify-self: start;
		}
	}
</style>
