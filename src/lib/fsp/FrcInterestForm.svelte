<script lang="ts">
	import { INTEREST_AREAS, type FrcInterestSubmission } from '$lib/fsp/frc-interest';

	/**
	 * The FRC Team 5669 interest form, factored out of /fsp/frc-interest so the
	 * dev harness can mount the exact same component. Takes a `submit` callback
	 * (the real route wires it to `submitFrcInterest`; the harness wires it to a
	 * fake logged endpoint), the FspTechSelection/FspPulse convention.
	 */

	let {
		initialEmail = '',
		submit: doSubmit
	}: {
		initialEmail?: string;
		submit: (s: FrcInterestSubmission) => Promise<{ error: string | null }>;
	} = $props();

	let fullName = $state('');
	let email = $state(initialEmail);
	let phone = $state('');
	let parentEmail = $state('');
	let selectedAreas = $state<string[]>([]);
	let priorExperience = $state('');

	let submitting = $state(false);
	let submitted = $state(false);
	let submitError = $state('');

	function toggleArea(area: string) {
		selectedAreas = selectedAreas.includes(area)
			? selectedAreas.filter((a) => a !== area)
			: [...selectedAreas, area];
	}

	async function onSubmit(event: SubmitEvent) {
		event.preventDefault();
		const name = fullName.trim();
		const mail = email.trim();
		if (!name || !mail || submitting) return;
		submitting = true;
		submitError = '';
		try {
			const { error } = await doSubmit({
				fullName: name,
				email: mail,
				phone,
				parentEmail,
				interestAreas: selectedAreas,
				priorExperience
			});
			if (error) throw new Error(error);
			submitted = true;
		} catch (err) {
			submitError = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	function submitAnother() {
		fullName = '';
		email = initialEmail;
		phone = '';
		parentEmail = '';
		selectedAreas = [];
		priorExperience = '';
		submitted = false;
		submitError = '';
	}
</script>

<div class="frci-root">
	<div class="center">
		{#if submitted}
			<div class="card confirm">
				<div class="check" aria-hidden="true">✓</div>
				<h1>Thanks for your interest!</h1>
				<p>
					We've received your info for <strong>FRC Team 5669</strong>. A team member will follow up
					with next steps.
				</p>
				<button class="primary" onclick={submitAnother}>Submit another response</button>
			</div>
		{:else}
			<form class="card" onsubmit={onSubmit}>
				<h1>FRC Team 5669</h1>
				<p class="sub">
					Interested in joining the robotics team? Tell us a bit about yourself and we'll reach
					out.
				</p>

				<label class="field">
					<span class="label">Full name <span class="req">*</span></span>
					<input
						type="text"
						bind:value={fullName}
						placeholder="Your full name"
						autocomplete="name"
						disabled={submitting}
						required
					/>
				</label>

				<label class="field">
					<span class="label">Email <span class="req">*</span></span>
					<input
						type="email"
						bind:value={email}
						placeholder="you@example.com"
						autocomplete="email"
						disabled={submitting}
						required
					/>
				</label>

				<label class="field">
					<span class="label">Phone <span class="opt">(optional)</span></span>
					<input
						type="tel"
						bind:value={phone}
						placeholder="(555) 555-5555"
						autocomplete="tel"
						disabled={submitting}
					/>
				</label>

				<label class="field">
					<span class="label">Parent/guardian email <span class="opt">(optional)</span></span>
					<input
						type="email"
						bind:value={parentEmail}
						placeholder="parent@example.com"
						autocomplete="off"
						disabled={submitting}
					/>
				</label>

				<fieldset class="field">
					<legend class="label">Interest areas <span class="opt">(pick any that apply)</span></legend>
					<div class="chips">
						{#each INTEREST_AREAS as area (area)}
							<button
								type="button"
								class="chip"
								class:on={selectedAreas.includes(area)}
								onclick={() => toggleArea(area)}
								disabled={submitting}
							>
								{area}
							</button>
						{/each}
					</div>
				</fieldset>

				<label class="field">
					<span class="label">Prior experience <span class="opt">(optional)</span></span>
					<textarea
						bind:value={priorExperience}
						placeholder="Any robotics, CAD, coding, or shop experience?"
						rows="3"
						maxlength="600"
						disabled={submitting}
					></textarea>
				</label>

				<button
					class="primary"
					type="submit"
					disabled={submitting || !fullName.trim() || !email.trim()}
				>
					{submitting ? 'Submitting…' : 'Submit'}
				</button>
				{#if submitError}<p class="err">{submitError}</p>{/if}
				<p class="fine">No account needed. This form is open to anyone.</p>
			</form>
		{/if}
	</div>
</div>

<style>
	.frci-root {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		min-height: 100dvh;
		background: #0a0a0a;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', system-ui, sans-serif;
	}
	.center {
		min-height: 100vh;
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1.25rem;
		padding: max(1.25rem, env(safe-area-inset-top)) 1.25rem max(1.25rem, env(safe-area-inset-bottom));
	}
	.card {
		width: 100%;
		max-width: 460px;
		background: #101410;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 16px;
		padding: 1.6rem 1.4rem;
		box-shadow: 0 0 40px rgba(0, 255, 65, 0.08);
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	h1 {
		font-size: 1.7rem;
		font-weight: 700;
		color: var(--green, #00ff41);
		text-shadow: 0 0 14px rgba(0, 255, 65, 0.45);
		margin: 0;
		letter-spacing: 0.02em;
	}
	.sub,
	p {
		margin: 0;
		color: var(--white, #e8ffe8);
		line-height: 1.5;
	}
	.sub {
		color: #a9c9ad;
		font-size: 0.98rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border: none;
		padding: 0;
		margin: 0;
	}
	.label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: #6fae77;
	}
	.req {
		color: var(--gold, #c8ff00);
	}
	.opt {
		text-transform: none;
		color: #4a7a52;
		letter-spacing: normal;
	}
	input,
	textarea {
		width: 100%;
		font: inherit;
		font-size: 1.05rem;
		color: var(--white, #e8ffe8);
		background: #0a0f0a;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 10px;
		padding: 0.75rem 0.85rem;
	}
	textarea {
		resize: vertical;
		min-height: 4.5rem;
	}
	input::placeholder,
	textarea::placeholder {
		color: #4a7a52;
	}
	input:focus,
	textarea:focus {
		outline: none;
		border-color: var(--green, #00ff41);
		box-shadow: 0 0 0 2px rgba(0, 255, 65, 0.2);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.chip {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.02em;
		padding: 0.5rem 0.8rem;
		border-radius: 999px;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.25));
		background: #0a0f0a;
		color: #a9c9ad;
		cursor: pointer;
	}
	.chip:hover:not(:disabled) {
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
	}
	.chip:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.chip.on {
		background: rgba(0, 255, 65, 0.16);
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
		box-shadow: 0 0 12px rgba(0, 255, 65, 0.2);
	}
	.primary {
		font: inherit;
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.05rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.9rem 1.1rem;
		border-radius: 10px;
		border: 1px solid var(--green, #00ff41);
		background: rgba(0, 255, 65, 0.12);
		color: var(--green, #00ff41);
		cursor: pointer;
		min-height: 48px;
	}
	.primary:hover:not(:disabled) {
		background: rgba(0, 255, 65, 0.22);
		box-shadow: 0 0 18px rgba(0, 255, 65, 0.35);
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.err {
		color: #ff6b6b;
		font-size: 0.9rem;
	}
	.fine {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		color: #4a7a52;
	}
	.confirm {
		text-align: center;
		align-items: center;
	}
	.check {
		width: 64px;
		height: 64px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		font-size: 2rem;
		color: #0a0a0a;
		background: var(--green, #00ff41);
		box-shadow: 0 0 26px rgba(0, 255, 65, 0.6);
	}
</style>
