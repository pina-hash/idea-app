<script lang="ts">
	/**
	 * HARNESS: the shared classroom file picker, both sides, every failure.
	 *
	 * It mounts the REAL `FileUploadPanel` -- the same component ContentComposer
	 * mounts for a handout, AssignmentEngine mounts for a hand-in, and
	 * SpecRenderer mounts per imageZone -- never a copy of its markup. What is
	 * faked is the TRANSPORT, which is the injection point the real routes use
	 * too: they point `upload` at `uploadClassroomFile`, this points it at a
	 * function that answers in memory.
	 *
	 * WHY IT EXISTS. Four of the guarantees in this bundle are invisible to a
	 * type check and awkward to reach through a real class:
	 *
	 *   - every file is attempted, even when an earlier one fails
	 *   - a failed file STAYS, with its own message and its own Retry
	 *   - the message names its gate (a size and the limit, an expired signed
	 *     URL, an RLS denial) and is never a bare "Upload failed"
	 *   - progress is per file
	 *
	 * The gate selector below makes each one reproducible in one click, which is
	 * also what makes "induce a failure and confirm the file is still staged"
	 * something anybody can re-run rather than a story about one afternoon.
	 */
	import FileUploadPanel, { type PanelUpload } from '$lib/classroom/FileUploadPanel.svelte';
	import type { UploadedFileRow } from '$lib/classroom/file-upload';
	import {
		classifyUploadError,
		tooLarge,
		type UploadGate
	} from '$lib/classroom/upload-errors';
	import { CLASSROOM_UPLOAD_MAX_BYTES } from '$lib/classroom/file-upload';

	const ITEM_ID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

	type Mode = 'ok' | 'slow' | 'too_large' | 'expired' | 'denied' | 'not_configured' | 'alternate';

	let mode = $state<Mode>('ok');
	let role = $state<'attachment' | 'submission'>('attachment');
	let landed = $state<{ name: string; at: string }[]>([]);
	let failureReport = $state<string[]>([]);
	let attempt = 0;
	let panel = $state<FileUploadPanel | null>(null);

	const GATE_FOR: Record<string, UploadGate> = {
		expired: 'expired',
		denied: 'denied',
		not_configured: 'not_configured'
	};

	/**
	 * The fake. Deliberately reports progress in real steps for the slow mode --
	 * a progress bar that jumps 0 to 100 proves nothing about a 60 MB upload.
	 */
	const upload: PanelUpload = async ({ file, onProgress }) => {
		attempt += 1;
		const steps = mode === 'slow' ? 20 : 4;
		for (let i = 1; i <= steps; i += 1) {
			await new Promise((r) => setTimeout(r, mode === 'slow' ? 120 : 15));
			onProgress(i / steps);
		}

		// ALTERNATE fails the files whose name ends in an ODD digit -- the case the
		// old student-side loop got wrong: it stopped at the first failure and
		// abandoned every file after it. Keyed on the NAME rather than on a
		// counter, because the calls are concurrent and a counter makes which
		// file fails depend on scheduling, which is the one thing a harness for a
		// failure case must not do.
		const trailing = Number(file.name.match(/(\d)(?=\.[^.]*$|$)/)?.[1] ?? 0);
		const fails =
			mode === 'too_large' ||
			mode === 'expired' ||
			mode === 'denied' ||
			mode === 'not_configured' ||
			(mode === 'alternate' && trailing % 2 === 1);

		if (!fails) {
			landed = [...landed, { name: file.name, at: new Date().toLocaleTimeString() }];
			return {
				ok: true,
				storageKey: `${ITEM_ID}/fake-${attempt}`,
				row: { id: `fake-${attempt}`, filename: file.name } satisfies UploadedFileRow
			};
		}

		if (mode === 'too_large') {
			return { ok: false, ...tooLarge(file.size * 500, CLASSROOM_UPLOAD_MAX_BYTES) };
		}
		const gate = mode === 'alternate' ? 'denied' : GATE_FOR[mode];
		const refusal = classifyUploadError({
			status: gate === 'expired' ? 400 : gate === 'not_configured' ? 404 : 403,
			detail:
				gate === 'expired'
					? 'jwt expired'
					: gate === 'not_configured'
						? 'Bucket not found'
						: 'new row violates row-level security policy',
			role,
			sizeBytes: file.size,
			maxBytes: CLASSROOM_UPLOAD_MAX_BYTES
		});
		return { ok: false, ...refusal };
	};

	async function runStaged() {
		failureReport = panel ? await panel.runAll(ITEM_ID) : [];
	}

	const MODES: [Mode, string][] = [
		['ok', 'everything lands'],
		['slow', 'lands slowly (watch progress)'],
		['alternate', 'every other file is refused'],
		['too_large', 'size refusal'],
		['expired', 'expired signed URL'],
		['denied', 'RLS denial'],
		['not_configured', 'bucket missing']
	];
</script>

<div class="wrap">
	<h1>Classroom upload panel</h1>
	<p class="note">
		The real <code>FileUploadPanel</code>, with an in-memory transport. Pick several files at
		once, choose a failure, and check that every file is attempted, that a failed one stays with
		its own reason, and that Retry only appears where retrying could work.
	</p>

	<fieldset>
		<legend>Transport answers</legend>
		{#each MODES as [value, label] (value)}
			<label class="radio tap-44">
				<input type="radio" name="mode" checked={mode === value} onchange={() => (mode = value)} />
				<span>{label}</span>
			</label>
		{/each}
	</fieldset>

	<fieldset>
		<legend>Role (wording only)</legend>
		{#each ['attachment', 'submission'] as const as value (value)}
			<label class="radio tap-44">
				<input type="radio" name="role" checked={role === value} onchange={() => (role = value)} />
				<span>{value}</span>
			</label>
		{/each}
	</fieldset>

	<section class="panel-box" data-testid="staged-mode">
		<h2>Staged (a composer: uploads on save)</h2>
		<FileUploadPanel
			bind:this={panel}
			{role}
			itemId={ITEM_ID}
			{upload}
			label="Files"
			hint="Any file type, up to 200 MB each. Uploads when you save."
			showPreviews
		/>
		<button type="button" class="run tap-44" onclick={runStaged}>Save (run the batch)</button>
		{#if failureReport.length}
			<div class="report" data-testid="failure-report">
				<p>
					Saved, but {failureReport.length} thing{failureReport.length === 1 ? '' : 's'} did not:
				</p>
				<ul>
					{#each failureReport as line, i (i)}
						<li>{line}</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>

	<section class="panel-box" data-testid="auto-mode">
		<h2>Immediate (a hand-in: uploads on pick)</h2>
		<FileUploadPanel
			{role}
			itemId={ITEM_ID}
			{upload}
			label="Your files"
			hint="Any file, up to 200 MB each. Uploads as soon as you pick it."
			autoStart
			offerCamera
			showPreviews
		/>
	</section>

	<section class="panel-box">
		<h2>Landed</h2>
		{#if landed.length}
			<ul data-testid="landed">
				{#each landed as row, i (i)}
					<li>{row.name} <span class="dim">{row.at}</span></li>
				{/each}
			</ul>
		{:else}
			<p class="note">Nothing yet.</p>
		{/if}
	</section>
</div>

<style>
	.wrap {
		max-width: 60rem;
		margin: 0 auto;
		padding: var(--space-4, 1rem);
		display: grid;
		gap: var(--space-4, 1rem);
	}
	h1 {
		font-family: var(--font-title, var(--font-display));
		margin: 0;
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		margin: 0 0 0.5rem;
	}
	.note {
		color: var(--dim);
		font-size: 0.9rem;
		margin: 0;
	}
	fieldset {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-2, 6px);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
	}
	legend {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dim);
	}
	.radio {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.panel-box {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 6px);
		padding: var(--space-3, 0.75rem);
		display: grid;
		gap: 0.6rem;
	}
	.run {
		justify-self: start;
		padding: 0.4rem 0.9rem;
		border: 1px solid var(--green);
		border-radius: var(--radius-2, 6px);
		background: transparent;
		color: var(--green);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.report {
		border: 1px solid var(--amber);
		border-radius: var(--radius-2, 6px);
		padding: 0.5rem 0.7rem;
		font-size: 0.88rem;
	}
	.report p {
		margin: 0 0 0.3rem;
	}
	.report ul,
	ul {
		margin: 0;
		padding-left: 1.1rem;
	}
	.dim {
		color: var(--dim);
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}
</style>
