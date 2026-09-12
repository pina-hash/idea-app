<script lang="ts">
	/**
	 * THE SHARE CONTROL ON AN IDEACAD DOCUMENT.
	 *
	 * Mr. Pina's model, in his words: like Google Docs. A document is PRIVATE BY
	 * DEFAULT; the owner shares it with named classmates as view-only or as
	 * editor; he and Mr. Cosso see everything without asking and without a
	 * student granting anything. `0205` is that, `sharing.ts` is its pure layer,
	 * and this is the first surface either has ever had.
	 *
	 * IT COMPUTES NO RULE OF ITS OWN. Every question about who may do what is
	 * `ideacadCanShare` / `ideacadCanWrite`, and every word is
	 * `IDEACAD_ROLE_LABELS` / `IDEACAD_ROLE_NOTES` -- a component spelling out
	 * "role === 'owner'" is the second statement of a rule the database enforces,
	 * and it is the one that stops matching.
	 *
	 * ---------------------------------------------------------------------------
	 * A VIEWER IS NEVER SHOWN A CONTROL THAT WOULD BE REFUSED.
	 * ---------------------------------------------------------------------------
	 *
	 * `canShare` is false for everyone but the owner -- INCLUDING an instructor,
	 * which is `0205`'s rule and not a gap. So a non-owner gets no form, no role
	 * picker and no Remove: the controls are ABSENT rather than disabled, which
	 * is this repository's mechanism everywhere and makes read-only structural
	 * rather than a flag somebody has to remember. What a non-owner DOES get is
	 * the sentence saying what their access is, because a panel that simply had
	 * nothing in it reads as broken.
	 *
	 * AND THE TRANSPORTS ARE THE OTHER HALF OF THE SAME MECHANISM. `onshare`
	 * absent removes the form even for an owner: `0205` is applied by hand, so a
	 * deployment that has not had it is a real state, and
	 * `IDEACAD_SHARING_UNAVAILABLE` is what that state says out loud rather than
	 * a Share button whose only possible outcome is a failure.
	 *
	 * ---------------------------------------------------------------------------
	 * THE REFUSAL IS RENDERED VERBATIM AND THE BROWSER GUESSES AS LITTLE AS IT CAN.
	 * ---------------------------------------------------------------------------
	 *
	 * `ideacadShareTargetProblem` refuses only an empty box, something with no
	 * `@` in it, and the owner's own address. WHETHER THE PERSON IS IN THIS CLASS
	 * IS THE DATABASE'S QUESTION and only the database can answer it -- a browser
	 * cannot read the enrollment of a class it is not in -- so that refusal comes
	 * back from `ideacad_share_document` with its own sentence and is shown
	 * exactly as it arrived.
	 */
	import {
		IDEACAD_GRANT_ROLES,
		IDEACAD_ROLE_LABELS,
		IDEACAD_ROLE_NOTES,
		IDEACAD_SHARING_UNAVAILABLE,
		ideacadCanShare,
		ideacadNormalizeEmail,
		ideacadShareTargetProblem,
		ideacadSharingSummary,
		type IdeacadDocumentRole,
		type IdeacadGrant,
		type IdeacadGrantRole
	} from '../sharing';

	let {
		role = null,
		ownerEmail = '',
		grants = [],
		sharingReady = true,
		onshare = undefined,
		onunshare = undefined
	}: {
		/** What the signed-in caller is to this document. Null is "cannot tell". */
		role?: IdeacadDocumentRole | null;
		/** The document owner's address, so the form can refuse it early. */
		ownerEmail?: string;
		grants?: IdeacadGrant[];
		/**
		 * Whether this deployment has `0205`. FALSE says so in words rather than
		 * hiding the panel: a student who cannot see who their work is shared with
		 * should be told that, not left to assume it is shared with nobody.
		 */
		sharingReady?: boolean;
		/** ABSENT REMOVES THE FORM. The mechanism, not a convenience. */
		onshare?: (email: string, role: IdeacadGrantRole) => Promise<void>;
		onunshare?: (email: string) => Promise<void>;
	} = $props();

	let email = $state('');
	let picked = $state<IdeacadGrantRole>('viewer');
	let busy = $state(false);
	/** A refusal from the database, verbatim, or one the form caught first. */
	let refusal = $state<string | null>(null);
	let done = $state<string | null>(null);
	/** Two-step confirm on a removal, which takes somebody's access away. */
	let arming = $state('');

	const canShare = $derived(ideacadCanShare(role) && !!onshare && sharingReady);
	const canRemove = $derived(ideacadCanShare(role) && !!onunshare && sharingReady);
	const summary = $derived(ideacadSharingSummary(grants));
	const note = $derived(role ? IDEACAD_ROLE_NOTES[role] : null);

	async function share(event: SubmitEvent) {
		event.preventDefault();
		if (!onshare || busy) return;
		// The browser's own half of the check first, so an obviously empty box
		// does not cost a round trip. Everything else is the database's.
		const problem = ideacadShareTargetProblem(email, ownerEmail);
		if (problem) {
			refusal = problem;
			done = null;
			return;
		}
		busy = true;
		refusal = null;
		done = null;
		try {
			const target = ideacadNormalizeEmail(email);
			await onshare(target, picked);
			// THE ACKNOWLEDGEMENT SURVIVES THE ACT IT REPORTS, which it can here
			// because the list it is about is still on screen: the row appears
			// beside this line rather than replacing it.
			done = `${target} can now ${picked === 'editor' ? 'edit' : 'view'} this document.`;
			email = '';
		} catch (error) {
			// VERBATIM. `0205` raises the sentence a student should read ("You can
			// only share this with a classmate in this class"), and a client that
			// re-toned it would be a second wording of one rule.
			refusal = error instanceof Error ? error.message : String(error);
		} finally {
			busy = false;
		}
	}

	async function remove(target: string) {
		if (!onunshare || busy) return;
		busy = true;
		refusal = null;
		done = null;
		try {
			await onunshare(target);
			done = `${target} can no longer open this document.`;
			arming = '';
		} catch (error) {
			refusal = error instanceof Error ? error.message : String(error);
		} finally {
			busy = false;
		}
	}
</script>

<section class="share" data-testid="ideacad-share" aria-labelledby="ic-share-h">
	<header>
		<h3 id="ic-share-h">Sharing</h3>
		{#if role}
			<span class="chip" data-testid="ideacad-share-role">{IDEACAD_ROLE_LABELS[role]}</span>
		{/if}
	</header>

	{#if note}
		<p class="note">{note}</p>
	{/if}

	{#if !sharingReady}
		<p class="note off" role="status">{IDEACAD_SHARING_UNAVAILABLE}</p>
	{/if}

	{#if canShare}
		<!--
			THE LABEL SITS ABOVE ITS CONTROL, NEVER BESIDE IT. Ledger 0186 measured
			a side-by-side label clipping a select and cutting off exactly the
			marker that mattered; a stacked label cannot take width from the thing
			it names. The row wraps rather than scrolling for the same reason the
			concept strip's controls do: a known number of controls, every one of
			which has to be reachable without a gesture.
		-->
		<form onsubmit={share} data-testid="ideacad-share-form">
			<label class="field">
				<span class="lab">Classmate's school email</span>
				<input
					type="email"
					autocomplete="off"
					placeholder="name@boscotech.net"
					bind:value={email}
					disabled={busy}
				/>
			</label>
			<label class="field narrow">
				<span class="lab">They can</span>
				<select bind:value={picked} disabled={busy}>
					{#each IDEACAD_GRANT_ROLES as option (option)}
						<option value={option}>{IDEACAD_ROLE_LABELS[option]}</option>
					{/each}
				</select>
			</label>
			<button type="submit" class="go" aria-disabled={busy}>Share</button>
		</form>
	{/if}

	{#if refusal}
		<p class="refusal" role="status" data-testid="ideacad-share-refusal">{refusal}</p>
	{/if}
	{#if done}
		<p class="done" role="status" data-testid="ideacad-share-done">{done}</p>
	{/if}

	<!--
		NULL IS A NORMAL ANSWER AND RENDERS AS NOTHING. A private document is the
		DEFAULT state, not a deficiency, so there is no "shared with 0 people"
		line and no empty list: `ideacadSharingSummary` returns null and this
		whole block is absent.
	-->
	{#if summary}
		<p class="summary" data-testid="ideacad-share-summary">{summary}</p>
		<ul data-testid="ideacad-share-list">
			{#each grants as grant (grant.granteeEmail)}
				<li>
					<span class="who">{grant.granteeEmail}</span>
					<span class="chip small">{IDEACAD_ROLE_LABELS[grant.role]}</span>
					{#if canRemove}
						{#if arming === grant.granteeEmail}
							<!-- A DESTRUCTIVE ACT NAMES WHAT IT COSTS before the confirm. -->
							<span class="confirm">
								<button type="button" class="yes" onclick={() => remove(grant.granteeEmail)}>
									Stop sharing with {grant.granteeEmail}
								</button>
								<button type="button" class="no" onclick={() => (arming = '')}>Keep</button>
							</span>
						{:else}
							<button type="button" class="rm" onclick={() => (arming = grant.granteeEmail)}>
								Remove
							</button>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.share {
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
	.summary,
	.refusal,
	.done {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.refusal {
		color: var(--crimson);
	}
	.done {
		color: var(--green);
	}
	.note.off {
		color: var(--copper);
	}
	form {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		gap: 0.5rem;
	}
	.field {
		display: grid;
		/* AN EXPLICIT SINGLE COLUMN, AND IT IS LOAD-BEARING RATHER THAN TIDY.
		   With the column left implicit (`auto`), a `width: 100%` on the select
		   is a percentage against a track whose size depends on the item, so the
		   browser falls back to the item's INTRINSIC width -- which for a select
		   is its longest option text. Measured: the viewer-or-editor picker came
		   out 103px inside a 176px field, with 80px of dead gap before Share, at
		   BOTH widths. `minmax(0, 1fr)` makes the track definite, so the
		   percentage resolves and the control fills the box reserved for it.
		   This is ledger 0186's defect one panel over: a select sized by its
		   option text rather than by its field is exactly how a marker that
		   matters ends up cut off. */
		grid-template-columns: minmax(0, 1fr);
		gap: 0.2rem;
		flex: 1 1 14rem;
		/* MIN-WIDTH 0 ON A FLEX CHILD. Its automatic minimum is its min-content,
		   so an input's default size would otherwise force the row wider than the
		   panel and the panel wider than the pane. */
		min-width: 0;
	}
	.field.narrow {
		flex: 0 1 11rem;
	}
	.lab {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	input,
	select {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		padding: 0 0.5rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}
	button {
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}
	button:focus-visible,
	input:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
	}
	.go {
		border-color: var(--green);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.who {
		flex: 1 1 10rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-1);
	}
	.confirm {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.yes {
		border-color: var(--crimson);
	}
</style>
