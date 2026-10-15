<script lang="ts">
	import './coin-page.css';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import CoinRoleCamera from './CoinRoleCamera.svelte';
	import { coinWhen } from '$lib/coin-balance';
	import { coins } from '$lib/coin-format';
	import { coinDayLong } from './extras';
	import {
		roleDayCheckable,
		roleDayLabel,
		roleDaysNewestFirst,
		roleDayTone,
		roleDayWords,
		roleExceptionRefusalWords,
		roleRulesWords,
		roleToday,
		type CoinRole,
		type CoinRoleDay
	} from './role';
	import type { CoinRoleTransports } from './transports';

	/**
	 * THE ROLE PORTAL (`/coin-balance/role`, 2.5, 0247). For each class role a
	 * student holds: the instructions, the rules in words, today's photos, a
	 * live camera, and the last two weeks of days with what each proved. A
	 * failed day can be sent to the teacher to be checked by hand.
	 *
	 * The route mounts it over `coin_my_role()` and injected transports; the dev
	 * harness mounts the identical component in memory. An omitted transport
	 * removes its control: no `capture` and no camera, no `requestException`
	 * and no "Ask for this day to be checked".
	 */
	let {
		state: pageState,
		roles = null,
		transports = {},
		onsignin = null,
		onchanged = null
	}: {
		state: 'ready' | 'signed_out' | 'updating' | 'error';
		roles?: CoinRole[] | null;
		transports?: CoinRoleTransports;
		onsignin?: (() => void) | null;
		onchanged?: (() => void) | null;
	} = $props();

	let askFor = $state<string | null>(null);
	let askNote = $state('');
	let askBusy = $state(false);
	let askOutcome = $state<{ ok: boolean; text: string } | null>(null);

	function askKey(role: CoinRole, d: CoinRoleDay) {
		return `${role.holder_id}:${d.day}`;
	}

	async function ask(role: CoinRole, d: CoinRoleDay) {
		const send = transports.requestException;
		if (!send || askBusy) return;
		if (!askNote.trim()) {
			askOutcome = { ok: false, text: roleExceptionRefusalWords({ reason: 'note_required' }) };
			return;
		}
		askBusy = true;
		try {
			const r = await send(role.holder_id, d.day, askNote.trim());
			if (r.ok) {
				askOutcome = { ok: true, text: `Sent. Your teacher checks ${roleDayLabel(d.day)} by hand.` };
				askFor = null;
				askNote = '';
				onchanged?.();
			} else {
				askOutcome = { ok: false, text: roleExceptionRefusalWords(r) };
			}
		} catch {
			askOutcome = { ok: false, text: roleExceptionRefusalWords({ reason: 'error' }) };
		} finally {
			askBusy = false;
		}
	}
</script>

<svelte:head>
	<title>My class role // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/coin-balance">&lsaquo; My coins</a>
		<ProfileMenu />
	</div>
</div>

<main class="rp-page" data-testid="role-portal" data-state={pageState}>
	<section class="hero">
		<div class="eyebrow">IDEA // Coins // Role</div>
		<h1>My class role</h1>
		<p class="lead">Prove each class day with a start photo and an end photo, and your role pays for the days you prove.</p>
	</section>

	{#if pageState === 'signed_out'}
		<section class="card cpx-card cpx-panel" data-testid="role-signin">
			<p class="cpx-lead">Sign in to see your class role and take today's photos.</p>
			{#if onsignin}
				<button class="btn cpx-key" type="button" onclick={() => onsignin?.()}>Sign in with your school Google account</button>
			{/if}
		</section>
	{:else if pageState === 'updating'}
		<section class="card cpx-card cpx-panel" data-testid="role-updating">
			<h2>The role page is being updated</h2>
			<p class="cpx-lead">Mr. Pina is switching on the new role system. Check back soon.</p>
		</section>
	{:else if pageState === 'error' || !roles}
		<section class="card cpx-card cpx-panel" data-testid="role-error">
			<h2>Your role page could not be read</h2>
			<p class="cpx-lead">Try again in a minute. If it keeps happening, send feedback from the button on this page.</p>
		</section>
	{:else if !roles.length}
		<section class="card cpx-card cpx-panel" data-testid="role-none">
			<h2>You hold no class role</h2>
			<p class="cpx-lead">Apply for one on the class Ledger. Mr. Pina chooses who holds each role.</p>
			<a class="cpx-link" href="/coins/index.html">Open the Ledger</a>
		</section>
	{:else}
		<section class="card cpx-card cpx-panel" data-testid="role-pay">
			<h2>How a role pays</h2>
			<ul class="cpx-limits">
				<li>{coins(1)} per week, paid every two weeks, for the days you prove.</li>
				<li>A missed day only takes that day off. Absence is never checked.</li>
				<li>The time of a photo is taken by the server when the photo arrives, never from the photo itself.</li>
			</ul>
		</section>

		{#each roles as role (role.holder_id)}
			{@const today = roleToday(role)}
			<section class="card cpx-card cpx-panel" aria-labelledby="rp-h-{role.holder_id}" data-testid="role-card">
				<h2 id="rp-h-{role.holder_id}">{role.role}</h2>
				{#if role.section}<p class="cpx-note">{role.section}{#if role.expires_at}. Until {coinWhen(role.expires_at)}{/if}.</p>{/if}
				{#if role.instructions}<p class="cpx-lead" data-testid="role-instructions">{role.instructions}</p>{/if}
				<p class="cpx-text" data-testid="role-rules">{roleRulesWords(role.rules)}</p>

				<h3>Today, {coinDayLong(role.today)}</h3>
				{#if !role.class_today}
					<p class="cpx-note" data-testid="role-no-class">Your class does not meet today, so today needs no photos.</p>
				{/if}
				<p class="cpx-text" data-testid="role-today">
					{today?.photos ?? 0} photo{(today?.photos ?? 0) === 1 ? '' : 's'} so far of {role.rules.photos_per_day}.
					{#if today && today.photos > 0}{roleDayWords(today, role.rules)}.{/if}
				</p>
				{#if today && today.photo_paths.length}
					<ul class="rp-photos" data-testid="role-today-photos">
						{#each today.photo_paths as ph (ph.path)}
							<li>
								{#if ph.url}<img class="cpx-thumb" src={ph.url} alt="Role photo taken {ph.taken_at ? coinWhen(ph.taken_at) : 'today'}" loading="lazy" />{/if}
								<span class="cpx-meta">{ph.taken_at ? coinWhen(ph.taken_at) : 'Today'}</span>
							</li>
						{/each}
					</ul>
				{/if}
				<CoinRoleCamera
					holderId={role.holder_id}
					upload={transports.uploadPhoto ?? null}
					capture={transports.capture ?? null}
					openCamera={transports.openCamera ?? null}
					ondone={onchanged}
				/>

				<h3>The last two weeks</h3>
				<ul class="cpx-list" data-testid="role-days">
					{#each roleDaysNewestFirst(role.days) as d (d.day)}
						{@const tone = roleDayTone(d)}
						<li data-testid="role-day" data-status={d.status}>
							<div class="cpx-line">
								<span class="cpx-name">{roleDayLabel(d.day)}</span>
								<span class="cpx-meta">{d.photos} photo{d.photos === 1 ? '' : 's'}</span>
							</div>
							<span class="cpx-chip wrap {tone}" data-testid="role-day-status">
								<span aria-hidden="true">{tone === 'good' ? '✓' : tone === 'bad' ? '✕' : '–'}</span>
								{roleDayWords(d, role.rules)}
							</span>
							{#if transports.requestException && roleDayCheckable(d, role.today)}
								{#if askFor === askKey(role, d)}
									<div class="cpx-confirm">
										<label class="cpx-field">
											<span>What happened that day?</span>
											<textarea maxlength="1000" bind:value={askNote} data-testid="role-ask-note"></textarea>
										</label>
										<div class="cpx-row">
											<button
												type="button"
												class="btn cpx-key"
												aria-disabled={askBusy || !askNote.trim() ? 'true' : undefined}
												data-testid="role-ask-send"
												onclick={() => ask(role, d)}>{askBusy ? 'Sending...' : 'Send for a check'}</button
											>
											<button type="button" class="btn secondary cpx-key" onclick={() => (askFor = null)}>Cancel</button>
										</div>
									</div>
								{:else}
									<button
										type="button"
										class="btn secondary cpx-key"
										data-testid="role-ask"
										onclick={() => {
											askOutcome = null;
											askNote = '';
											askFor = askKey(role, d);
										}}>Ask for this day to be checked</button
									>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		<p class="cpx-outcome" class:ok={askOutcome?.ok} class:no={askOutcome && !askOutcome.ok} role="status" data-testid="role-ask-outcome">
			{askOutcome?.text ?? ''}
		</p>
	{/if}

	<footer class="rp-footer">
		<VersionBadge app="coins" />
	</footer>
</main>

<style>
	.rp-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1rem 3rem;
	}
	.rp-photos {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.rp-photos li {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		align-items: flex-start;
	}
	.rp-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
