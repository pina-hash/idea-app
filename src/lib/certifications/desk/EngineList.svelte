<script lang="ts">
	/**
	 * THE ENGINE'S LIST (the spec's Engine screen): every certification the
	 * caller may see with its state readout, revision, holders, active
	 * attempts, pending reviews and publish-problem count, an Open key to its
	 * editor; New certification (admin) creating a draft from `emptyPackage()`
	 * plus a code and a name; Import (admin); and the Settings panel (admin)
	 * over the four `cert_settings` fields.
	 */
	import { CERT_PATHS, deskEngineHref } from '$lib/certifications/nav';
	import type { CertSettings } from '$lib/certifications/types';
	import { CERT_STATE_READOUTS, type AdminListRow, type DeskFormResult } from './desk';
	import Readout from './Readout.svelte';

	let {
		rows,
		isAdmin = false,
		settings = null,
		createResult = null,
		settingsResult = null
	}: {
		rows: AdminListRow[];
		isAdmin?: boolean;
		settings?: CertSettings | null;
		createResult?: DeskFormResult | null;
		settingsResult?: DeskFormResult | null;
	} = $props();

	let code = $state('');
	let name = $state('');
	const createCanSend = $derived(/^[A-Z0-9][A-Z0-9-]{0,31}$/.test(code.trim().toUpperCase()) && name.trim().length > 0);
</script>

<div class="dk-engine" data-testid="cert-engine">
	<section class="cert-panel" id="catalog" aria-labelledby="cert-engine-list-h" data-testid="cert-engine-list">
		<div class="cert-titlebar">
			<h2 id="cert-engine-list-h">Certifications</h2>
			{#if isAdmin}
				<div class="cert-actions">
					<a class="btn cert-btn secondary" href={CERT_PATHS.deskEngineImport} data-testid="cert-engine-import-link">Import a package</a>
				</div>
			{/if}
		</div>
		{#if rows.length === 0}
			<p class="dk-empty" data-testid="cert-engine-empty">No certification exists yet. Create one below or import a package.</p>
		{:else}
			<div class="dk-table-wrap">
				<table class="dk-table cert-well">
					<thead>
						<tr><th>Code</th><th>Name</th><th>State</th><th>Revision</th><th>Holders</th><th>Active</th><th>Reviews waiting</th><th>Publish problems</th><th><span class="dk-sr">Open</span></th></tr>
					</thead>
					<tbody>
						{#each rows as r (r.id)}
							<tr data-testid="cert-engine-row" data-state={r.state}>
								<td class="dk-mono"><strong>{r.code}</strong></td>
								<td>{r.name}<div class="dk-row-meta">Level {r.level}, {r.category}</div></td>
								<td><Readout readout={CERT_STATE_READOUTS[r.state]} /></td>
								<td class="dk-mono">{r.revision ?? '0'}</td>
								<td class="dk-mono">{r.holders_count}</td>
								<td class="dk-mono">{r.active_attempts}</td>
								<td class="dk-mono">{r.pending_reviews}</td>
								<td>
									{#if r.publish_problems.length === 0}
										<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>None</span>
									{:else}
										<span class="cert-readout is-warn" data-testid="cert-engine-problems"><span aria-hidden="true">!</span>{r.publish_problems.length}</span>
									{/if}
								</td>
								<td><a class="btn cert-btn secondary" href={deskEngineHref(r.id)} data-testid="cert-engine-open">Open</a></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	{#if isAdmin}
		<div class="cert-cols">
			<section class="cert-panel" id="new" aria-labelledby="cert-engine-new-h" data-testid="cert-engine-new">
				<h2 id="cert-engine-new-h">New certification</h2>
				<p class="cert-help">A new certification starts as a draft nobody but a certifier can see. The code is its identity (for example MILL-1) and never changes once published.</p>
				<form method="post" action="?/create">
					<label class="cert-field"><span>Code</span><input type="text" name="code" bind:value={code} placeholder="MILL-1" required /></label>
					<label class="cert-field"><span>Name</span><input type="text" name="name" bind:value={name} placeholder="Manual Mill Level 1" required /></label>
					<div class="cert-actions">
						<button type="submit" class="btn cert-btn" aria-disabled={createCanSend ? undefined : 'true'} data-testid="cert-engine-create" onclick={(e) => { if (!createCanSend) e.preventDefault(); }}>Create draft</button>
						{#if !createCanSend}<span class="dk-held">A code (letters, digits and hyphens) and a name.</span>{/if}
					</div>
					{#if createResult}
						<p class="cert-notice {createResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-engine-create-result">
							<span class="cert-notice-glyph" aria-hidden="true">{createResult.ok ? '✓' : '!'}</span>
							<span>{createResult.message}</span>
						</p>
					{/if}
				</form>
			</section>

			<section class="cert-panel" id="settings" aria-labelledby="cert-engine-settings-h" data-testid="cert-engine-settings">
				<h2 id="cert-engine-settings-h">Portal settings</h2>
				{#if !settings}
					<p class="dk-empty" data-testid="cert-engine-settings-none">Settings are not available yet.</p>
				{:else}
					<form method="post" action="?/settings" class="dk-fields">
						<label class="cert-field"><span>School-year expiry date</span><input type="date" name="school_year_expiry" value={settings.school_year_expiry ?? ''} /></label>
						<label class="cert-field"><span>Dormancy, days</span><input type="number" name="dormancy_days" min="1" max="3650" value={settings.dormancy_days} required /></label>
						<label class="cert-field"><span>Check-in timeout, seconds</span><input type="number" name="checkin_timeout_seconds" min="10" max="600" value={settings.checkin_timeout_seconds} required /></label>
						<label class="cert-field"><span>Release window, minutes</span><input type="number" name="release_window_minutes" min="1" max="120" value={settings.release_window_minutes} required /></label>
						<p class="cert-help dk-wide">The expiry date is when SAFE-1 and RESP-1 awards run out; set it once a year to the first day of school. The other three are the numbers Mr. Pina accepted as settings.</p>
						<div class="cert-actions dk-wide">
							<button type="submit" class="btn cert-btn" data-testid="cert-engine-settings-save">Save settings</button>
						</div>
						{#if settingsResult}
							<p class="cert-notice dk-wide {settingsResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-engine-settings-result">
								<span class="cert-notice-glyph" aria-hidden="true">{settingsResult.ok ? '✓' : '!'}</span>
								<span>{settingsResult.message}</span>
							</p>
						{/if}
					</form>
				{/if}
			</section>
		</div>
	{/if}
</div>
