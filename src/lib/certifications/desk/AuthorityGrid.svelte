<script lang="ts">
	/**
	 * THE AUTHORITY GRID (the spec's Authority screen, admin only): people as
	 * rows, certifications as columns, a lit key per cell ('Granted', with
	 * `aria-pressed`) that posts grant or revoke; an Add a person form (email,
	 * certification, note) posting grant; and the sentence that authority is
	 * one whole power per certification.
	 */
	import { formatCertDate } from '$lib/certifications/status';
	import type { AdminListRow, AuthorityRow, DeskFormResult } from './desk';

	let {
		grants,
		certifications,
		result = null
	}: {
		grants: AuthorityRow[];
		certifications: Pick<AdminListRow, 'id' | 'code' | 'name' | 'state'>[];
		result?: DeskFormResult | null;
	} = $props();

	const columns = $derived(certifications.filter((c) => c.state !== 'draft'));
	const people = $derived.by(() => {
		const map = new Map<string, { email: string; name: string | null; cells: Map<string, AuthorityRow> }>();
		for (const g of grants) {
			const row = map.get(g.email) ?? { email: g.email, name: g.person_name, cells: new Map() };
			row.cells.set(g.certification_id, g);
			if (!row.name && g.person_name) row.name = g.person_name;
			map.set(g.email, row);
		}
		return [...map.values()].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
	});
</script>

<div class="dk-authority" data-testid="cert-authority">
	<p class="cert-lead" data-testid="cert-authority-sentence">
		Authority is one whole power per certification: a granted person proctors its exam, grades both projects, reviews its checkout and awards it. It is granted person by person and can be removed at any time. Only a site admin suspends, revokes, corrects or edits the engine.
	</p>

	{#if result}
		<p class="cert-notice {result.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-authority-result">
			<span class="cert-notice-glyph" aria-hidden="true">{result.ok ? '✓' : '!'}</span>
			<span>{result.message}</span>
		</p>
	{/if}

	<section class="cert-panel" id="grid" aria-labelledby="cert-authority-grid-h">
		<h2 id="cert-authority-grid-h">People by certification</h2>
		{#if columns.length === 0}
			<p class="dk-empty" data-testid="cert-authority-no-certs">No published or retired certification yet, so there is nothing to grant.</p>
		{:else if people.length === 0}
			<p class="dk-empty" data-testid="cert-authority-empty">Nobody holds authority yet. Mr. Pina, as site admin, holds every power without a grant.</p>
		{:else}
			<div class="dk-table-wrap">
				<table class="dk-table cert-well" data-testid="cert-authority-table">
					<thead>
						<tr>
							<th>Person</th>
							{#each columns as c (c.id)}<th class="dk-grid-cell" title={c.name}>{c.code}</th>{/each}
						</tr>
					</thead>
					<tbody>
						{#each people as p (p.email)}
							<tr data-testid="cert-authority-person">
								<td>
									<strong>{p.name ?? p.email}</strong>
									<div class="dk-row-meta">{p.email}</div>
								</td>
								{#each columns as c (c.id)}
									{@const g = p.cells.get(c.id)}
									<td class="dk-grid-cell">
										<form method="post" action={g ? '?/revoke' : '?/grant'}>
											<input type="hidden" name="certification_id" value={c.id} />
											<input type="hidden" name="email" value={p.email} />
											<button
												type="submit"
												class="btn cert-btn {g ? 'on' : 'secondary'}"
												aria-pressed={!!g}
												title={g ? `Granted ${formatCertDate(g.granted_at)} by ${g.granted_by ?? 'an admin'}${g.note ? `: ${g.note}` : ''}` : `Grant ${c.code} to ${p.name ?? p.email}`}
												data-testid="cert-authority-cell"
												data-granted={g ? 'yes' : 'no'}>{g ? 'Granted' : 'Grant'}</button
											>
										</form>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<section class="cert-panel" id="add" aria-labelledby="cert-authority-add-h" data-testid="cert-authority-add">
		<h2 id="cert-authority-add-h">Add a person</h2>
		<form method="post" action="?/grant" class="dk-fields">
			<label class="cert-field"><span>School email</span><input type="email" name="email" required placeholder="name@boscotech.edu" /></label>
			<label class="cert-field"><span>Certification</span>
				<select name="certification_id" required>
					{#each columns as c (c.id)}<option value={c.id}>{c.code} {c.name}</option>{/each}
				</select>
			</label>
			<label class="cert-field dk-wide"><span>Note (optional)</span><input type="text" name="note" placeholder="Why this person, for the record." /></label>
			<div class="cert-actions dk-wide">
				<button type="submit" class="btn cert-btn" aria-disabled={columns.length ? undefined : 'true'} data-testid="cert-authority-grant">Grant authority</button>
			</div>
		</form>
	</section>
</div>
