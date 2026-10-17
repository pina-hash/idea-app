<script lang="ts">
	import PostThumbnail from '$lib/classroom/PostThumbnail.svelte';
	import {
		THUMB_SHAPES,
		THUMB_SHAPE_DEFAULT,
		THUMB_SHAPE_HINTS,
		THUMB_SHAPE_LABELS,
		resolveThumbShape,
		type SectionThumbShapeWriter,
		type ThumbShape
	} from '$lib/classroom/thumbnail';

	/**
	 * A CLASS'S DEFAULT THUMBNAIL SHAPE (ledger 0396, report a6a037f3), on the
	 * class's Settings tab. It is what every student and teacher of this class
	 * sees on the class page until they pick a shape of their own in Display
	 * settings, which always wins (`resolveThumbShape`). "Built in" stores
	 * nothing and means Tile.
	 *
	 * ABSENCE IS THE MECHANISM, as for the class theme card: no writer, or a
	 * database whose read says thumbnails are not there yet (`ready` false),
	 * renders no card at all. The write is `classroom_set_section_thumbnail_shape`,
	 * which re-checks that the caller manages the class.
	 */
	let {
		sectionId,
		current,
		write,
		onchanged = null
	}: {
		sectionId: string;
		current: { ready: boolean; shape: ThumbShape | null };
		write: SectionThumbShapeWriter;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	// svelte-ignore state_referenced_locally
	let shape = $state<ThumbShape | null>(current.shape);
	let busy = $state(false);
	let msg = $state<{ ok: boolean; text: string } | null>(null);

	/* What a member of the class sees with no choice of their own. */
	const seen = $derived(resolveThumbShape('class', shape));

	async function pick(next: ThumbShape | null): Promise<void> {
		if (busy || next === shape) return;
		busy = true;
		msg = null;
		const res = await write(sectionId, next);
		busy = false;
		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}
		shape = res.shape;
		const now = resolveThumbShape('class', res.shape);
		msg = {
			ok: true,
			text:
				now === 'off'
					? 'Saved. The class page shows no thumbnails by default.'
					: `Saved. The class page shows ${THUMB_SHAPE_LABELS[now]} thumbnails by default.`
		};
		await onchanged?.();
	}

	const SAMPLE = [
		{ id: 'sample-1', glyph: 'assignment', tint: 0, title: 'Lab 3: Gear ratios' },
		{ id: 'sample-2', glyph: 'material', tint: 2, title: 'Reading: How a gearbox works' },
		{ id: 'sample-3', glyph: 'post', tint: 5, title: 'Field trip Friday' }
	] as const;
</script>

{#if current.ready}
	<section class="card cths" data-testid="settings-thumbnails">
		<h2>Post thumbnails</h2>
		<p class="note">
			The picture beside each post on the class page. This is the shape everyone in this class sees
			until they choose their own in Display settings, which always comes first.
		</p>

		<div class="cths-keys" role="group" aria-label="Default thumbnail shape">
			<button
				type="button"
				class="btn secondary tiny tap-44 cths-key"
				class:on={shape === null}
				aria-pressed={shape === null}
				aria-disabled={busy}
				data-testid="settings-thumb-shape"
				data-shape=""
				onclick={() => void pick(null)}
			>
				Built in ({THUMB_SHAPE_LABELS[THUMB_SHAPE_DEFAULT]})
			</button>
			{#each THUMB_SHAPES as s (s)}
				<button
					type="button"
					class="btn secondary tiny tap-44 cths-key"
					class:on={shape === s}
					aria-pressed={shape === s}
					aria-disabled={busy}
					data-testid="settings-thumb-shape"
					data-shape={s}
					onclick={() => void pick(s)}
				>
					{THUMB_SHAPE_LABELS[s]}
				</button>
			{/each}
		</div>

		<p class="note cths-hint" data-testid="settings-thumb-hint">
			{THUMB_SHAPE_LABELS[seen]}: {THUMB_SHAPE_HINTS[seen]}.
		</p>

		{#if seen !== 'off'}
			<!-- What three posts look like in that shape, with no picture set: the
			     generated look every post without a thumbnail wears. -->
			<ul class="cths-preview" data-shape={seen} aria-label="Preview" data-testid="settings-thumb-preview">
				{#each SAMPLE as p (p.id)}
					<li class="cths-row">
						<PostThumbnail item={{ id: p.id }} shape={seen} glyph={p.glyph} tint={p.tint} label={p.title} />
						<span class="cths-title">{p.title}</span>
					</li>
				{/each}
			</ul>
		{/if}

		<p class="note cths-msg" class:bad={msg && !msg.ok} role="status" data-testid="settings-thumb-msg">
			{msg?.text ?? ''}
		</p>
	</section>
{/if}

<style>
	.cths {
		min-width: 0;
		margin: 0;
	}
	.cths-keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		/* The paragraph above is `.note`, which carries no bottom margin here, so
		   the row keeps its own distance from it. */
		margin-top: var(--space-3, 0.75rem);
	}
	.cths-key {
		/* "Off" is one short word; the key still clears the 44px floor across. */
		min-width: 44px;
		justify-content: center;
	}
	.cths-hint {
		margin: 0.6rem 0 0.4rem;
	}
	.cths-preview {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
		max-width: 26rem;
	}
	.cths-row {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
		padding: 0.4rem;
		border: 1px solid var(--hairline);
		border-radius: 10px;
	}
	.cths-preview[data-shape='wide'] .cths-row,
	.cths-preview[data-shape='banner'] .cths-row {
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
	}
	.cths-preview[data-shape='wide'] {
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		max-width: none;
	}
	.cths-title {
		min-width: 0;
		font-size: 0.9rem;
		color: var(--text-1);
	}
	.cths-msg {
		min-height: 1.4em;
		margin: 0.5rem 0 0;
	}
	.cths-msg.bad {
		padding-left: 0.5rem;
		border-left: 3px solid var(--amber);
		color: var(--text-1);
	}
</style>
