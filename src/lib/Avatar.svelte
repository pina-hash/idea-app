<script lang="ts">
	import { avatarSource, type UserProfile } from '$lib/profile';

	/**
	 * A user's picture at any size: chosen preset mark, uploaded image, Google
	 * photo, or an initials tile (in that order; see avatarSource). Pass
	 * `loading` while a signed-in user's profile row hasn't arrived yet (e.g.
	 * the brief window right after sign-in) to show a neutral placeholder
	 * instead of initials derived from an empty profile.
	 */
	let {
		profile,
		size = 32,
		loading = false
	}: { profile: UserProfile | null | undefined; size?: number; loading?: boolean } = $props();

	const source = $derived(loading ? null : avatarSource(profile));
	const px = $derived(`${size}px`);
</script>

<span class="avatar" class:loading style="width:{px};height:{px}" aria-hidden="true">
	{#if loading || !source}
		<!-- neutral placeholder while the profile row hasn't arrived yet -->
	{:else if source.kind === 'image'}
		<img src={source.url} alt="" width={size} height={size} referrerpolicy="no-referrer" />
	{:else if source.kind === 'preset'}
		<svg viewBox="0 0 24 24" fill="none" stroke={source.preset.fg} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
			<path d={source.preset.d} />
		</svg>
	{:else}
		<span class="initials" style="font-size:{Math.round(size * 0.4)}px">{source.text}</span>
	{/if}
</span>

<style>
	.avatar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		border-radius: 50%;
		overflow: hidden;
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.avatar svg {
		width: 62%;
		height: 62%;
	}
	.initials {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		color: var(--green, #00ff41);
		letter-spacing: 0.05em;
	}
	.avatar.loading {
		animation: avatar-pulse 1.4s ease-in-out infinite;
	}
	@keyframes avatar-pulse {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 0.9; }
	}
	@media (prefers-reduced-motion: reduce) {
		.avatar.loading {
			animation: none;
			opacity: 0.7;
		}
	}
</style>
