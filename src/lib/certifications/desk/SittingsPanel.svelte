<script lang="ts">
	/**
	 * SITTINGS (the spec's Sittings screen): an admin posts windows (a school
	 * time, a seat limit, a location, a certification or Any, repeated for N
	 * weeks); the upcoming windows as rows with a two-step Cancel for an admin;
	 * the pending requests with Approve (a scheduled time and a note) and
	 * Decline (a required note); and the seats a certifier may release today,
	 * each with a Release exam key that answers "Released until <time>" in
	 * words and then offers the live view.
	 *
	 * Every time box is `datetime-local` in SCHOOL TIME (America/Los_Angeles,
	 * `schoolLocalInput` / `schoolLocalToIso` in `./desk`), never the device's.
	 */
	import { CERT_PATHS } from '$lib/certifications/nav';
	import { formatCertDate, formatCertDateTime, formatCertTime } from '$lib/certifications/status';
	import type { CertSettings, CertSittingJson, DeskRequestRow } from '$lib/certifications/types';
	import { SEAT_READOUTS, personWords, type DeskFormResult, type SeatTodayRow } from './desk';
	import ConfirmKey from './ConfirmKey.svelte';
	import Readout from './Readout.svelte';

	let {
		sittings,
		requests,
		seats = [],
		settings = null,
		isAdmin = false,
		certifications = [],
		postResult = null,
		cancelResult = null,
		decideResult = null,
		releaseResult = null
	}: {
		sittings: CertSittingJson[];
		requests: DeskRequestRow[];
		seats?: SeatTodayRow[];
		settings?: CertSettings | null;
		isAdmin?: boolean;
		certifications?: { id: string; code: string; name: string }[];
		postResult?: DeskFormResult | null;
		cancelResult?: DeskFormResult | null;
		decideResult?: DeskFormResult | null;
		releaseResult?: DeskFormResult | null;
	} = $props();

	const releaseWindow = $derived(settings?.release_window_minutes ?? 10);
	const releasedSeat = $derived(releaseResult?.ok ? String(releaseResult.data?.seat_id ?? '') : '');
	const releasedUntil = $derived(releaseResult?.ok ? String(releaseResult.data?.release_expires_at ?? '') : '');
	let declineNote = $state<Record<string, string>>({});
	let approveAt = $state<Record<string, string>>({});
</script>

<div class="dk-sittings" data-testid="cert-sittings">
	{#if isAdmin}
		<section class="cert-panel" id="post" aria-labelledby="cert-post-h" data-testid="cert-sittings-post">
			<h2 id="cert-post-h">Post windows</h2>
			<form method="post" action="?/post" class="dk-fields">
				<label class="cert-field"><span>Starts at (school time)</span><input type="datetime-local" name="starts_at" required /></label>
				<label class="cert-field"><span>Ends at (school time)</span><input type="datetime-local" name="ends_at" required /></label>
				<label class="cert-field"><span>Seat limit</span><input type="number" name="seat_limit" min="1" max="200" value="8" required /></label>
				<label class="cert-field"><span>Location</span><input type="text" name="location" placeholder="Room 12" /></label>
				<label class="cert-field"><span>Certification</span>
					<select name="certification_id">
						<option value="">Any certification</option>
						{#each certifications as c (c.id)}<option value={c.id}>{c.code} {c.name}</option>{/each}
					</select>
				</label>
				<label class="cert-field"><span>Repeat weekly for</span><input type="number" name="repeat_weeks" min="0" max="26" value="0" /> </label>
				<label class="cert-field dk-wide"><span>Note to students</span><input type="text" name="note" placeholder="Bring your safety glasses." /></label>
				<div class="cert-actions dk-wide">
					<button type="submit" class="btn cert-btn" data-testid="cert-sittings-post-send">Post windows</button>
					<span class="cert-help">Repeat 0 posts one window; 4 posts five, a week apart.</span>
				</div>
				{#if postResult}
					<p class="cert-notice dk-wide {postResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-sittings-post-result">
						<span class="cert-notice-glyph" aria-hidden="true">{postResult.ok ? '✓' : '!'}</span>
						<span>{postResult.message}</span>
					</p>
				{/if}
			</form>
		</section>
	{/if}

	<section class="cert-panel" id="windows" aria-labelledby="cert-windows-h" data-testid="cert-sittings-windows">
		<h2 id="cert-windows-h">Upcoming windows</h2>
		{#if cancelResult}
			<p class="cert-notice {cancelResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-sittings-cancel-result">
				<span class="cert-notice-glyph" aria-hidden="true">{cancelResult.ok ? '✓' : '!'}</span>
				<span>{cancelResult.message}</span>
			</p>
		{/if}
		{#if sittings.length === 0}
			<p class="dk-empty" data-testid="cert-sittings-none">No windows are posted.</p>
		{:else}
			<ol class="cert-well">
				{#each sittings as s (s.id)}
					<li class="dk-row" data-testid="cert-sitting-row" data-state={s.state}>
						<div class="dk-row-main">
							<strong>{formatCertDate(s.starts_at)}</strong>
							<span>{formatCertTime(s.starts_at)} to {formatCertTime(s.ends_at)}</span>
							<span class="cert-readout {s.seats_taken >= s.seat_limit ? 'is-warn' : ''}"><span aria-hidden="true">#</span>{s.seats_taken} of {s.seat_limit} seats taken</span>
							{#if s.location}<span class="dk-row-meta">{s.location}</span>{/if}
							<span class="dk-row-meta">{s.certification ? `${s.certification.code} ${s.certification.name}` : 'Any certification'}</span>
							{#if s.note}<span class="dk-row-note">{s.note}</span>{/if}
						</div>
						{#if isAdmin && s.state === 'open'}
							<form method="post" action="?/cancel" class="cert-actions">
								<input type="hidden" name="sitting_id" value={s.id} />
								<ConfirmKey word="Cancel window" confirmWord="Cancel this window" cost="Every booked seat on this window is cancelled and each student is told. This cannot be undone." danger={true} testId="cert-sitting-cancel" />
							</form>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<section class="cert-panel" id="requests" aria-labelledby="cert-requests-h" data-testid="cert-sittings-requests">
		<h2 id="cert-requests-h">Requests</h2>
		{#if decideResult}
			<p class="cert-notice {decideResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-sittings-decide-result">
				<span class="cert-notice-glyph" aria-hidden="true">{decideResult.ok ? '✓' : '!'}</span>
				<span>{decideResult.message}</span>
			</p>
		{/if}
		{#if requests.length === 0}
			<p class="dk-empty" data-testid="cert-sittings-requests-none">No requests are waiting.</p>
		{:else}
			<ol class="cert-well">
				{#each requests as r (r.seat_id)}
					<li class="dk-request" data-testid="cert-sittings-request">
						<div class="dk-row-main">
							<strong>{personWords(r.student)}</strong>
							<span class="dk-row-meta">{r.certification.code} {r.certification.name}</span>
							<span class="dk-row-meta">requested {formatCertDateTime(r.requested_at)}</span>
							{#if r.note}<span class="dk-row-note">{r.note}</span>{/if}
						</div>
						<div class="dk-decide">
							<form method="post" action="?/decide" class="dk-decide-form" data-testid="cert-approve-form">
								<input type="hidden" name="seat_id" value={r.seat_id} />
								<input type="hidden" name="decision" value="approve" />
								<label class="cert-field"><span>Scheduled for (school time)</span><input type="datetime-local" name="scheduled_at" bind:value={approveAt[r.seat_id]} required /></label>
								<label class="cert-field"><span>Note (optional)</span><input type="text" name="note" placeholder="Bring your part." /></label>
								<button type="submit" class="btn cert-btn" aria-disabled={(approveAt[r.seat_id] ?? '').trim() ? undefined : 'true'} data-testid="cert-approve" onclick={(e) => { if (!(approveAt[r.seat_id] ?? '').trim()) e.preventDefault(); }}>Approve</button>
							</form>
							<form method="post" action="?/decide" class="dk-decide-form" data-testid="cert-decline-form">
								<input type="hidden" name="seat_id" value={r.seat_id} />
								<input type="hidden" name="decision" value="decline" />
								<label class="cert-field"><span>Reason (required)</span><input type="text" name="note" bind:value={declineNote[r.seat_id]} placeholder="Finish the guided project first." /></label>
								<button type="submit" class="btn cert-btn secondary" aria-disabled={(declineNote[r.seat_id] ?? '').trim() ? undefined : 'true'} data-testid="cert-decline" onclick={(e) => { if (!(declineNote[r.seat_id] ?? '').trim()) e.preventDefault(); }}>Decline</button>
							</form>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<section class="cert-panel" id="today" aria-labelledby="cert-today-h" data-testid="cert-sittings-today">
		<h2 id="cert-today-h">Today's seats</h2>
		<p class="cert-help">A release opens the exam on the student's own screen for {releaseWindow} minutes. Press it when they are in the room with you.</p>
		{#if seats.length === 0}
			<p class="dk-empty" data-testid="cert-sittings-today-none">No approved or booked seats are scheduled for today. A student's seat can also be released from their page on the desk.</p>
		{:else}
			<ol class="cert-well">
				{#each seats as seat (seat.seat_id)}
					<li class="dk-row" data-testid="cert-seat-today" data-state={seat.state}>
						<div class="dk-row-main">
							<strong>{personWords(seat.student)}</strong>
							<span class="dk-row-meta">{seat.certification.code} {seat.certification.name}</span>
							<Readout readout={SEAT_READOUTS[seat.state]} />
							{#if seat.scheduled_at}<span class="dk-row-meta">at {formatCertTime(seat.scheduled_at)}</span>{/if}
							{#if releasedSeat === seat.seat_id}
								<span class="cert-readout is-ok" data-testid="cert-released-until"><span aria-hidden="true">✓</span>Released until {formatCertTime(releasedUntil)}</span>
							{/if}
						</div>
						<div class="cert-actions">
							{#if releasedSeat === seat.seat_id}
								<a class="btn cert-btn" href={CERT_PATHS.deskLive} data-testid="cert-open-live">Open the live view</a>
							{:else}
								<form method="post" action="?/release">
									<input type="hidden" name="seat_id" value={seat.seat_id} />
									<button type="submit" class="btn cert-btn" data-testid="cert-release">Release exam</button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/if}
		{#if releaseResult && !releaseResult.ok}
			<p class="cert-notice cert-notice-bad" role="alert" data-testid="cert-release-refusal">
				<span class="cert-notice-glyph" aria-hidden="true">!</span>
				<span>{releaseResult.message}</span>
			</p>
		{/if}
	</section>
</div>

<style>
	.dk-request {
		padding: 0.6rem 0;
		display: grid;
		gap: 0.5rem;
	}
	.dk-decide {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: minmax(0, 1fr);
	}
	@media (min-width: 1024px) {
		.dk-decide {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	.dk-decide-form {
		display: grid;
		gap: 0.25rem;
		align-content: start;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		padding: 0.6rem 0.75rem;
	}
	.dk-decide-form .cert-field {
		margin-bottom: 0.4rem;
	}
</style>
