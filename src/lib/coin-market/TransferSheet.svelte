<script lang="ts">
	import Pending from '$lib/Pending.svelte';
	import { untrack } from 'svelte';
	import { coins } from '$lib/coin-format';
	import {
		lockWords,
		parseCoinsTyped,
		parseDirectory,
		parseTransferStatus,
		privateFee,
		type DirectoryEntry,
		type TransferStatus
	} from './market';
	import type { TransferTransports } from './transports';

	/**
	 * SEND COINS TO A CLASSMATE (ledger 0402, 0277). A PIN first (set once,
	 * stored hashed); then a classmate by name, an amount, an optional message
	 * and a private switch whose fee is shown before sending. The database
	 * checks all of it again; every refusal is said here in words.
	 */
	let {
		transports,
		onclose,
		ondone
	}: { transports: TransferTransports; onclose: () => void; ondone: (message: string) => void } = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let status = $state<TransferStatus | null>(null);
	let directory = $state<DirectoryEntry[]>([]);
	let loadWords = $state<string | null>(null);
	let busy = $state(false);
	let said = $state<{ ok: boolean; text: string } | null>(null);

	let newPin = $state('');
	let newPin2 = $state('');
	let oldPin = $state('');
	let changing = $state(false);

	let query = $state('');
	let toId = $state('');
	let amountText = $state('');
	let message = $state('');
	let priv = $state(false);
	let pin = $state('');
	let armed = $state(false);

	async function reload() {
		const [s, d] = await Promise.all([transports.status(), transports.directory()]);
		if (s.ok) status = parseTransferStatus(s.data);
		else loadWords = s.words;
		if (d.ok) directory = parseDirectory(d.data);
	}

	$effect(() => {
		const el = dialogEl;
		if (el && !el.open) {
			try {
				el.showModal();
			} catch {
				el.setAttribute('open', '');
			}
		}
	});
	$effect(() => {
		untrack(() => reload());
	});

	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = q ? directory.filter((d) => d.name.toLowerCase().includes(q)) : directory;
		return list.slice(0, 8);
	});
	const picked = $derived(directory.find((d) => d.id === toId) ?? null);
	const amount = $derived(parseCoinsTyped(amountText));
	const fee = $derived(status && amount !== null && priv ? privateFee(amount, status.rules.private_fee_percent, status.rules.private_fee_min) : 0);
	const room = $derived(status ? Math.max(status.rules.daily_cap - status.sent_today, 0) : 0);
	const problem = $derived.by(() => {
		if (!status) return null;
		if (status.locked_until) return lockWords(status.locked_until);
		if (status.balance < 0) return 'You are in debt, so you cannot send coins until your balance is back to zero.';
		if (!picked) return 'Pick who gets the coins.';
		if (amount === null) return `Send ${coins(0.1)} or more, with at most two decimals.`;
		if (amount > room) return `You can send ${coins(room)} more today.`;
		if (status.balance - amount - fee < 0) return `That needs ${coins(amount + fee)} and your balance is ${coins(status.balance)}.`;
		if (message.length > 200) return 'Keep the message to 200 characters.';
		if (!/^\d{4,6}$/.test(pin)) return 'Enter your PIN.';
		return null;
	});

	async function savePin(e: SubmitEvent) {
		e.preventDefault();
		if (!transports.setPin || busy) return;
		if (!/^\d{4,6}$/.test(newPin)) return (said = { ok: false, text: 'A PIN is 4 to 6 digits.' });
		if (newPin !== newPin2) return (said = { ok: false, text: 'The two PINs do not match.' });
		busy = true;
		const r = await transports.setPin(newPin, status?.has_pin ? oldPin : null);
		busy = false;
		if (r.ok) {
			newPin = newPin2 = oldPin = '';
			changing = false;
			said = { ok: true, text: 'PIN saved. Keep it to yourself.' };
			await reload();
		} else said = { ok: false, text: r.words };
	}

	async function send() {
		if (!transports.send || busy || problem || amount === null || !picked) return;
		busy = true;
		const r = await transports.send({ to: picked.id, amount, message: message.trim() || null, private: priv, pin });
		busy = false;
		armed = false;
		pin = '';
		if (r.ok) {
			ondone(`Sent ${coins(amount)} to ${picked.name}${priv ? ', privately' : ''}.`);
			amountText = '';
			message = '';
			toId = '';
			await reload();
		} else {
			said = { ok: false, text: r.words };
			await reload();
		}
	}

	function close() {
		try {
			dialogEl?.close();
		} catch {
			/* nothing open */
		}
		onclose();
	}
</script>

<dialog
	class="mk-dialog"
	bind:this={dialogEl}
	aria-labelledby="mk-send-title"
	onclose={() => onclose()}
	oncancel={(e) => {
		e.preventDefault();
		close();
	}}
	data-testid="mk-transfer-sheet"
>
	<div class="mk-dialog-body">
		<div class="mk-dialog-head">
			<h2 id="mk-send-title">Send coins</h2>
			<button type="button" class="btn secondary mk-key" onclick={close}>Close</button>
		</div>
		{#if loadWords}
			<p class="mk-why">{loadWords}</p>
		{:else if !status}
			<Pending label="Loading your transfer details" />
		{:else if !status.in_economy}
			<p class="mk-note">Only students in a class using IDEA Coins can send coins.</p>
		{:else if !status.has_pin || changing}
			<form class="mk-form" onsubmit={savePin} data-testid="mk-pin-form">
				<p class="mk-body wide">
					{status.has_pin ? 'Change your transfer PIN.' : 'Set a transfer PIN first: 4 to 6 digits. You type it every time you send.'}
					{status.rules.pin_tries} wrong tries lock sending for {status.rules.lock_minutes} minutes.
				</p>
				{#if status.has_pin}
					<label class="mk-field">Current PIN<input type="password" inputmode="numeric" autocomplete="off" maxlength="6" bind:value={oldPin} data-testid="mk-pin-old" /></label>
				{/if}
				<label class="mk-field">New PIN<input type="password" inputmode="numeric" autocomplete="off" maxlength="6" bind:value={newPin} data-testid="mk-pin-new" /></label>
				<label class="mk-field">Same PIN again<input type="password" inputmode="numeric" autocomplete="off" maxlength="6" bind:value={newPin2} data-testid="mk-pin-new2" /></label>
				<div class="wide mk-row">
					<button type="submit" class="btn mk-key" disabled={busy} data-testid="mk-pin-save">Save PIN</button>
					{#if status.has_pin}<button type="button" class="btn secondary mk-key" onclick={() => (changing = false)}>Not now</button>{/if}
				</div>
			</form>
		{:else}
			<p class="mk-note" data-testid="mk-send-room">
				Balance {coins(status.balance)}. Sent today {coins(status.sent_today)} of {coins(status.rules.daily_cap)}.
			</p>
			{#if status.locked_until}<p class="mk-why" data-testid="mk-send-locked">{lockWords(status.locked_until)}</p>{/if}
			<div class="mk-form">
				<label class="mk-field wide">
					To
					<input type="search" bind:value={query} placeholder="Type a name" autocomplete="off" data-testid="mk-send-search" />
				</label>
				<div class="wide mk-row" role="listbox" aria-label="Students" data-testid="mk-send-people">
					{#each matches as p (p.id)}
						<button type="button" class="btn secondary mk-key" role="option" aria-selected={toId === p.id} onclick={() => (toId = p.id)} data-testid="mk-send-person">
							{p.name}{#if p.classes[0]}<span class="mk-note">&nbsp;· {p.classes[0].label}</span>{/if}
						</button>
					{:else}
						<span class="mk-note">Nobody by that name.</span>
					{/each}
				</div>
				<label class="mk-field">
					Amount (coins)
					<input type="text" inputmode="decimal" bind:value={amountText} placeholder="1.5" data-testid="mk-send-amount" />
				</label>
				<label class="mk-field">
					Your PIN
					<input type="password" inputmode="numeric" autocomplete="off" maxlength="6" bind:value={pin} data-testid="mk-send-pin" />
				</label>
				<label class="mk-field wide">
					Message (optional, {200 - message.length} left)
					<input type="text" maxlength="200" bind:value={message} placeholder="Thanks for the help!" data-testid="mk-send-message" />
				</label>
				<label class="mk-check wide">
					<input type="checkbox" bind:checked={priv} data-testid="mk-send-private" />
					Keep it private for {status.rules.private_fee_percent}% (at least {coins(status.rules.private_fee_min)}){#if amount !== null && priv}: {coins(fee)}{/if}
				</label>
				<p class="mk-note wide">
					{priv ? 'Only you, them and staff will see it.' : 'Public: it shows on the Ledger and the market feed with your names, the amount and the message.'}
				</p>
			</div>
			{#if problem && (amountText || toId || pin)}<p class="mk-why" data-testid="mk-send-problem">{problem}</p>{/if}
			{#if !armed}
				<div class="mk-row">
					<button type="button" class="btn mk-key" aria-disabled={problem !== null} onclick={() => { if (!problem) armed = true; }} data-testid="mk-send-go">Send</button>
					<button type="button" class="btn secondary mk-key" onclick={() => (changing = true)}>Change PIN</button>
				</div>
			{:else}
				<div class="mk-confirm">
					<p class="mk-body">
						Send {coins(amount ?? 0)} to {picked?.name}{fee ? ` plus a ${coins(fee)} privacy fee` : ''}? This cannot be undone by you.
					</p>
					<div class="mk-row">
						<button type="button" class="btn mk-key" disabled={busy} onclick={send} data-testid="mk-send-confirm">{busy ? 'Sending…' : 'Yes, send'}</button>
						<button type="button" class="btn secondary mk-key" onclick={() => (armed = false)}>Not now</button>
					</div>
				</div>
			{/if}
		{/if}
		{#if said}<p class={said.ok ? 'mk-ok' : 'mk-why'} role="status" data-testid="mk-send-said">{said.text}</p>{/if}
	</div>
</dialog>
