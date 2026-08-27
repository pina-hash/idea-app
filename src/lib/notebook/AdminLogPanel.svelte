<script lang="ts">
	import {
		ADMIN_LOG_PAGE,
		adminLogActor,
		adminLogDetail,
		adminLogLabel,
		type AdminLogRow,
		type AdminLogTransports
	} from '$lib/notebook/admin-actions';

	/**
	 * THE RECORD OF WHO OVERRODE OR EXCUSED WHAT.
	 *
	 * `notebook_admin_log` has existed since 0069 with a select grant, an
	 * admin-only read policy and an index built for exactly this listing
	 * (`notebook_admin_log_created_idx on (created_at desc)`), and nothing has
	 * ever read a row out of it. Every irreversible staff action in the
	 * notebook writes here -- deleting an entry, deleting somebody else's note,
	 * deleting a check-in, unposting one, and now excusing a student and moving
	 * an entry -- so an unread log means those actions have been unattributable
	 * since the feature shipped.
	 *
	 * THE GATE IS THE TABLE'S OWN RLS POLICY, and that is worth being exact
	 * about because it is not the usual shape here. There is no SECURITY
	 * DEFINER function in front of this: `grant select ... to authenticated`
	 * plus `create policy ... using (public.is_admin())`. So a non-admin
	 * running this select gets an EMPTY RESULT rather than an error -- which is
	 * the /admin doctrine (an empty RLS result is indistinguishable from the
	 * rows not existing) and is also why the UI must not be the only thing
	 * keeping them out of the tab: it is not, the policy is, and the route
	 * additionally hands in no transport at all unless the viewer is an admin.
	 *
	 * IT IS A LISTING, NOT AN AUDIT TOOL. No filters, no export, no search: the
	 * question this answers is "what has been done to this class's notebooks
	 * lately", which is the newest page in date order. A console that had to be
	 * learned would not get looked at.
	 *
	 * WHAT IT DELIBERATELY DOES NOT DO is resolve the subject uuids. `actor_id`,
	 * `student_id`, `entry_id` and `session_id` are bare uuids with NO foreign
	 * keys -- 0069 says why: "a log row must survive the deletion of what it
	 * describes" -- so a great many of them name something that no longer
	 * exists, and a lookup would render half the log as blanks while adding a
	 * read of other people's rows to a page that needs none. The viewer's own
	 * id is the one exception, because the console already holds it and "You" is
	 * the answer to most of the rows on a deployment with one admin.
	 */
	let {
		transports,
		viewerId = null
	}: {
		transports: AdminLogTransports;
		/** The signed-in caller's uuid, so their own rows read "You". */
		viewerId?: string | null;
	} = $props();

	let rows = $state<AdminLogRow[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let loaded = $state(false);

	async function refresh() {
		if (loading) return;
		loading = true;
		loadError = null;
		try {
			const result = await transports.load(ADMIN_LOG_PAGE);
			if (!result.ok) {
				loadError = result.error;
				return;
			}
			rows = result.value;
			loaded = true;
		} finally {
			loading = false;
		}
	}

	// Loaded when the mode is opened, not on every console load: this is a
	// fourth mode nobody is in most of the time, and the table is admin-only.
	$effect(() => {
		if (!loaded && !loading) refresh();
	});

	function when(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}
</script>

<section class="card log-card" data-testid="admin-log">
	<header class="log-head">
		<div>
			<h2>Notebook admin log</h2>
			<p class="note">
				Every excusal, move and staff deletion, newest first. Site admins only. Subjects are
				recorded as ids and are kept even after the entry, note or check-in they name is deleted.
			</p>
		</div>
		<button
			type="button"
			class="btn secondary tap-44"
			disabled={loading}
			data-testid="admin-log-refresh"
			onclick={refresh}
		>
			{loading ? 'Loading...' : 'Refresh'}
		</button>
	</header>

	{#if loadError}
		<p class="msg error" role="alert" data-testid="admin-log-error">{loadError}</p>
	{:else if loading && !loaded}
		<p class="note">Loading the log...</p>
	{:else if rows.length === 0}
		<!-- EMPTY IS AMBIGUOUS HERE AND THE SENTENCE SAYS SO. The policy answers
		     an empty set to a non-admin rather than refusing, so "nothing has
		     happened" and "this is not yours to read" arrive identically. Naming
		     both is the honest rendering; the route already withholds the whole
		     mode from a non-admin, so in practice this is the first one. -->
		<p class="note" data-testid="admin-log-empty">
			Nothing recorded yet. Excusals, entry moves and staff deletions appear here as they happen.
			If you are not a site admin this list is always empty.
		</p>
	{:else}
		<div class="table-scroll">
			<table>
				<thead>
					<tr>
						<th scope="col">When</th>
						<th scope="col">Who</th>
						<th scope="col">What</th>
						<th scope="col">Subject</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						{@const detail = adminLogDetail(row)}
						<tr>
							<td class="stamp">{when(row.created_at)}</td>
							<td class="who">{adminLogActor(row, viewerId)}</td>
							<td>
								<span class="what">{adminLogLabel(row.action)}</span>
								{#if detail}<span class="detail">{detail}</span>{/if}
							</td>
							<td class="ids">
								{#if row.student_id}<span class="id" title="Student id">S {row.student_id}</span>{/if}
								{#if row.entry_id}<span class="id" title="Entry id">E {row.entry_id}</span>{/if}
								{#if row.session_id}<span class="id" title="Check-in id">C {row.session_id}</span
									>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="note fine">
			Showing the most recent {rows.length}
			{rows.length === 1 ? 'action' : 'actions'}{rows.length === ADMIN_LOG_PAGE
				? ' (the newest page; older ones are in the table).'
				: '.'}
		</p>
	{/if}
</section>

<style>
	.log-card {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--space-3);
		overflow: hidden;
	}
	.log-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.log-head h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	.note {
		margin: var(--space-1) 0 0;
		font-size: 0.76rem;
		color: var(--text-2);
		max-width: 60ch;
	}
	.note.fine {
		font-size: 0.72rem;
		color: var(--text-3);
	}
	/* The region scrolls; no region may hide its scrollbar. */
	.table-scroll {
		overflow: auto;
		min-height: 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.78rem;
	}
	th {
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--text-2);
		font-weight: 400;
		padding: 0 var(--space-2) var(--space-1);
		border-bottom: 1px solid var(--boundary);
		position: sticky;
		top: 0;
		background: var(--surface-1);
	}
	td {
		padding: var(--space-2);
		border-bottom: 1px solid var(--hairline);
		vertical-align: top;
		min-width: 0;
	}
	.stamp,
	.who {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.what {
		display: block;
		color: var(--text-1);
	}
	.detail {
		display: block;
		font-size: 0.72rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
	.ids {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.id {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-3);
		overflow-wrap: anywhere;
	}
	.msg {
		margin: 0;
		font-size: 0.78rem;
	}
	.msg.error {
		color: var(--nb-error);
	}
</style>
