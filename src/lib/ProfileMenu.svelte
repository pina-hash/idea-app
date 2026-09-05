<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import { pathwayColor } from '$lib/pathways';
	import {
		SITE_THEMES,
		SITE_THEME_LABELS,
		SITE_THEME_NOTES,
		setSiteTheme,
		siteTheme
	} from '$lib/theme.svelte';
	import {
		AVATAR_PRESETS,
		displayName,
		signOutEverywhere,
		type UserProfile
	} from '$lib/profile';

	/**
	 * The global profile menu, mounted in every page header. Self-contained: it
	 * reads the session (supabase client, claims, userProfile from the root
	 * layout load) from page data, so headers mount it with a single tag.
	 * Renders nothing when signed out. Inline-edits display name and picture
	 * (preset marks or an upload to the public 'avatars' bucket); writes go
	 * through the browser client under the "update own profile" RLS policy.
	 */

	// The root layout load always supplies the client; PageData just types it
	// as optional because pages may omit it.
	const supabase = $derived(page.data.supabase as SupabaseClient);
	const claims = $derived(page.data.claims);
	const profile = $derived((page.data.userProfile ?? null) as UserProfile | null);

	let open = $state(false);
	let root: HTMLDivElement | undefined = $state();
	let editingName = $state(false);
	let nameDraft = $state('');
	let busy = $state(false);
	let errorMsg = $state('');

	const close = () => {
		open = false;
		editingName = false;
		errorMsg = '';
	};

	// Outside-dismiss runs on pointerdown, NOT click. The bug: clicking "Edit"
	// swaps the name label (with the Edit button) for the inline form in the same
	// click; a click-based outside handler then evaluates against a target that has
	// been detached (or is caught by another document click handler on the page),
	// reads it as "outside" root, and closes the whole popup. On pointerdown no DOM
	// has changed yet, so the containment check is reliable, and the click that
	// opens the editor is never seen by this handler at all. The detached-target
	// guard is belt-and-braces for any node removed mid-gesture.
	const onDocPointerDown = (e: Event) => {
		const t = e.target;
		if (!open || !root || !(t instanceof Node)) return;
		if (!document.contains(t)) return;
		if (!root.contains(t)) close();
	};
	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
	};

	const saveProfile = async (patch: Record<string, unknown>) => {
		if (!claims) return;
		busy = true;
		errorMsg = '';
		// Select the updated row back so we actually confirm it was written. Without
		// this, supabase-js sends `return=minimal` and a zero-row result (e.g. the
		// write blocked by RLS / no matching row) comes back as `error: null`, so the
		// edit would silently appear to save and the value would never persist.
		const { data, error } = await supabase
			.from('profiles')
			.update(patch)
			.eq('id', claims.sub)
			.select('id');
		if (error) {
			errorMsg = error.message;
		} else if (!data || data.length === 0) {
			errorMsg = 'Could not save your profile. Try signing out and back in.';
		} else {
			await invalidateAll();
		}
		busy = false;
	};

	const startNameEdit = () => {
		nameDraft = profile?.display_name ?? profile?.full_name ?? '';
		editingName = true;
	};
	const saveName = async () => {
		const trimmed = nameDraft.trim();
		await saveProfile({ display_name: trimmed.length ? trimmed.slice(0, 60) : null });
		if (!errorMsg) editingName = false;
	};

	const choosePreset = (id: string) => saveProfile({ avatar: `preset:${id}` });
	const useGooglePhoto = () => saveProfile({ avatar: null });

	const onUpload = async (e: Event) => {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !claims) return;
		if (!file.type.startsWith('image/')) {
			errorMsg = 'Please choose an image file.';
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			errorMsg = 'Image must be under 2 MB.';
			return;
		}
		busy = true;
		errorMsg = '';
		const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
		const path = `${claims.sub}/avatar-${Date.now()}.${ext}`;
		const { error: upErr } = await supabase.storage
			.from('avatars')
			.upload(path, file, { cacheControl: '3600', contentType: file.type });
		if (upErr) {
			errorMsg = upErr.message;
			busy = false;
			return;
		}
		busy = false;
		await saveProfile({ avatar: `upload:${path}` });
	};

	const signOut = async () => {
		close();
		await signOutEverywhere(supabase);
		await invalidateAll();
	};

	const currentPreset = $derived(
		profile?.avatar?.startsWith('preset:') ? profile.avatar.slice('preset:'.length) : null
	);

	// Pathway identity (identity only, never an access gate): the chip sits
	// beside the avatar, and the display name is tinted in the pathway color.
	const nameTint = $derived(pathwayColor(profile?.pathway));
</script>

<svelte:document onpointerdown={onDocPointerDown} onkeydown={onKeydown} />

{#if claims}
	<div class="pm-root" bind:this={root}>
		<button
			class="pm-trigger tap-reach-44"
			type="button"
			aria-haspopup="menu"
			aria-expanded={open}
			aria-label="Profile menu"
			onclick={() => (open ? close() : (open = true))}
		>
			<Avatar {profile} size={30} />
			<PathwayChip pathway={profile?.pathway} size="sm" />
			<span class="pm-caret" class:up={open} aria-hidden="true">&#9662;</span>
		</button>

		{#if open}
			<div class="pm-panel" role="menu">
				<div class="pm-id">
					<Avatar {profile} size={44} />
					<div class="pm-id-text">
						{#if editingName}
							<form
								class="pm-name-edit"
								onsubmit={(e) => {
									e.preventDefault();
									saveName();
								}}
							>
								<!-- svelte-ignore a11y_autofocus -->
								<input
									type="text"
									bind:value={nameDraft}
									maxlength="60"
									placeholder="Display name"
									autofocus
									disabled={busy}
								/>
								<button type="submit" disabled={busy}>Save</button>
								<button type="button" onclick={() => (editingName = false)}>Cancel</button>
							</form>
						{:else}
							<div class="pm-name" style={nameTint ? `color:${nameTint}` : ''}>
								{displayName(profile)}
								<button class="pm-edit" type="button" onclick={startNameEdit}>Edit</button>
							</div>
						{/if}
						<div class="pm-meta">
							<PathwayChip pathway={profile?.pathway} size="sm" />
							<span class="pm-role">{profile?.role ?? 'signed in'}</span>
							{#if claims.email}<span class="pm-email">{claims.email}</span>{/if}
						</div>
					</div>
				</div>

				<div class="pm-section">
					<div class="pm-label">Picture</div>
					<div class="pm-presets">
						{#each AVATAR_PRESETS as p (p.id)}
							<button
								class="pm-preset"
								class:selected={currentPreset === p.id}
								type="button"
								title={p.label}
								aria-label="Use the {p.label} avatar"
								disabled={busy}
								onclick={() => choosePreset(p.id)}
							>
								<svg viewBox="0 0 24 24" fill="none" stroke={p.fg} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
									<path d={p.d} />
								</svg>
							</button>
						{/each}
					</div>
					<div class="pm-avatar-actions">
						<label class="pm-upload" class:disabled={busy}>
							Upload image
							<input type="file" accept="image/*" onchange={onUpload} disabled={busy} />
						</label>
						{#if profile?.avatar}
							<button class="pm-textbtn" type="button" disabled={busy} onclick={useGooglePhoto}>
								Use Google photo
							</button>
						{/if}
					</div>
				</div>

				<!-- THE SITE THEME CONTROL. Here and nowhere else, which is what the
				     session gate in ThemeRoot is paired with: the theme is on exactly
				     where the thing that turns it off is reachable.

				     RADIOS, NOT A SWITCH. Two states today and a third is a file, so a
				     boolean control would have to be rebuilt the first time somebody
				     adds one -- and a radio group already says "these are the choices,
				     this is the current one" without a label anybody has to read twice.
				     Each row carries its name AND what it is for: "Matrix" is a name
				     nobody can infer a look from, exactly as "IDEA" is in the
				     notebook's own picker. -->
				<div class="pm-section">
					<div class="pm-label" id="pm-theme-label">Theme</div>
					<div class="pm-themes" role="radiogroup" aria-labelledby="pm-theme-label">
						{#each SITE_THEMES as t (t)}
							<button
								class="pm-theme"
								class:selected={siteTheme() === t}
								type="button"
								role="radio"
								aria-checked={siteTheme() === t}
								onclick={() => setSiteTheme(t)}
							>
								<span class="pm-theme-swatch" data-theme-swatch={t} aria-hidden="true"></span>
								<span class="pm-theme-text">
									<span class="pm-theme-name">{SITE_THEME_LABELS[t]}</span>
									<span class="pm-theme-note">{SITE_THEME_NOTES[t]}</span>
								</span>
							</button>
						{/each}
					</div>
				</div>

				{#if errorMsg}
					<p class="pm-error">{errorMsg}</p>
				{/if}

				<div class="pm-actions">
					{#if page.data.isAdmin}
						<a class="pm-link" href="/dashboard" onclick={close}>Dashboard</a>
					{/if}
					<button class="pm-link pm-signout" type="button" onclick={signOut}>Sign out</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.pm-root {
		position: relative;
		display: inline-flex;
	}
	.pm-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		background: none;
		border: none;
		padding: 2px;
		cursor: pointer;
		border-radius: 999px;
		/* THE 44px FLOOR IS A REACH, NOT A TALLER BOX, AND THE HEADER IS WHY.
		   Measured 44.0x34.0 on /dev/pathways and 100.6x34.0 on
		   /dev/profile-menu and /dev/home-order, at 375 and 1440 alike: the
		   height is `Avatar size={30}` plus this rule's 2px of padding, so it
		   does not depend on a web font and 34px was the number on every one of
		   the 69 product pages that render this component.

		   `min-height: 44px` here would have been the smaller diff and the
		   worse fix. This button is a flex item of a masthead row that every
		   surface on the site sizes around -- measured 59.6px on the pathways
		   harness, 60.6px on the profile-menu harness and 64.0px on the home
		   header -- and a 10px taller trigger grows the row it sits in, so a
		   tap-target finding on one control would have moved the chrome of 69
		   pages. `.tap-reach-44` in src/app.css expands the HIT AREA with a
		   pseudo-element instead and leaves the painted box exactly where it
		   was; read that rule's comment before changing either half.

		   `--tap-reach-w: 0px` is the documented width knob and is required
		   here rather than optional. The reach is centred, so the default
		   `max(100%, 44px)` would grow a 44.0px-wide trigger horizontally too
		   and push the pseudo-element out over whatever the masthead puts
		   beside it -- and the width was never the failing dimension in any of
		   the six measurements. Height only, which is free: nothing is stacked
		   within 5px above or below a control on a header row. */
		--tap-reach-w: 0px;
	}
	.pm-caret {
		font-size: 0.65rem;
		color: var(--dim, #4a7a52);
		transition: transform 0.2s ease;
	}
	.pm-caret.up {
		transform: rotate(180deg);
	}
	.pm-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 10px);
		z-index: 300;
		width: min(320px, calc(100vw - 2rem));
		background: var(--bg1, #050f07);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 6px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
		padding: 1rem;
		text-align: left;
	}
	.pm-id {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.pm-id-text {
		min-width: 0;
		flex: 1;
	}
	.pm-name {
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 600;
		font-size: 1.05rem;
		color: var(--white, #e8ffe8);
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		line-height: 1.2;
	}
	.pm-edit,
	.pm-textbtn {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: var(--cyan, #00f0ff);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
	}
	.pm-edit:hover,
	.pm-textbtn:hover {
		color: var(--green, #00ff41);
	}
	.pm-meta {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.15rem;
	}
	.pm-role {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	.pm-email {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--dim, #4a7a52);
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.pm-name-edit {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.pm-name-edit input {
		flex: 1;
		min-width: 120px;
		background: var(--bg2, #081209);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 3px;
		color: var(--white, #e8ffe8);
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.95rem;
		padding: 0.3rem 0.5rem;
	}
	.pm-name-edit button {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--green, #00ff41);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 3px;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
	}
	.pm-section {
		margin-top: 0.9rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--line, rgba(0, 255, 65, 0.15));
	}
	.pm-label {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.58rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--dim, #4a7a52);
		margin-bottom: 0.5rem;
	}
	.pm-presets {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 0.35rem;
	}
	.pm-preset {
		aspect-ratio: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 50%;
		cursor: pointer;
		padding: 0;
		transition: border-color 0.2s ease, box-shadow 0.2s ease;
	}
	.pm-preset svg {
		width: 60%;
		height: 60%;
	}
	.pm-preset:hover {
		border-color: var(--line-strong, rgba(0, 255, 65, 0.35));
	}
	.pm-preset.selected {
		border-color: var(--green, #00ff41);
		box-shadow: 0 0 8px rgba(0, 255, 65, 0.4);
	}
	.pm-avatar-actions {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-top: 0.6rem;
	}
	.pm-upload {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		color: var(--cyan, #00f0ff);
		text-decoration: underline;
		cursor: pointer;
	}
	.pm-upload:hover {
		color: var(--green, #00ff41);
	}
	.pm-upload.disabled {
		color: var(--dim, #4a7a52);
		cursor: default;
	}
	.pm-upload input {
		display: none;
	}
	.pm-error {
		margin-top: 0.6rem;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		color: var(--amber, #ff8c00);
	}
	.pm-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.9rem;
		padding-top: 0.75rem;
		border-top: 1px solid var(--line, rgba(0, 255, 65, 0.15));
	}
	.pm-link {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--green, #00ff41);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: 3px;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
		text-decoration: none;
	}
	.pm-link:hover {
		border-color: var(--green, #00ff41);
	}
	.pm-signout {
		margin-left: auto;
		color: var(--dim, #4a7a52);
	}
	.pm-signout:hover {
		color: var(--green, #00ff41);
	}
	@media (prefers-reduced-motion: reduce) {
		.pm-caret,
		.pm-preset {
			transition: none;
		}
	}

	/* --- The theme picker ---------------------------------------------------
	   44px is the floor on a student-facing control at every width
	   (IDEA_INTERFACE_STANDARDS 10), and it is a `min-height` rather than a
	   height so a row whose note wraps at 375px grows instead of clipping. The
	   whole row is the target, not the swatch. */
	.pm-themes {
		display: grid;
		gap: 0.35rem;
	}
	.pm-theme {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		min-height: 44px;
		padding: 0.4rem 0.5rem;
		text-align: left;
		background: var(--bg2, #081209);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
		border-radius: var(--radius-control, 3px);
		cursor: pointer;
		color: inherit;
		transition: border-color 0.2s ease;
	}
	.pm-theme:hover {
		border-color: var(--line-strong, rgba(0, 255, 65, 0.35));
	}
	/* THE SELECTED ROW IS MARKED THREE WAYS -- the accent border, the tint fill
	   and the name going to --green -- because colour is never the only signal.
	   `aria-checked` carries it for anyone not looking at any of the three. */
	.pm-theme.selected {
		border-color: var(--green);
		background: var(--green-tint, var(--bg2));
	}
	.pm-theme.selected .pm-theme-name {
		color: var(--green);
	}
	/* The swatch is the two grounds and the body ink of the theme it names,
	   written as literals ON PURPOSE: it has to show a theme that is NOT
	   currently applied, so it cannot read the tokens, which are whatever is
	   showing now. The values are the ones in colors.css and
	   design-system/themes/matrix.css. */
	.pm-theme-swatch {
		flex: 0 0 auto;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.15));
	}
	.pm-theme-swatch[data-theme-swatch='idea'] {
		background: linear-gradient(135deg, #121a12 0 50%, #78b870 50% 100%);
	}
	.pm-theme-swatch[data-theme-swatch='matrix'] {
		background: linear-gradient(135deg, #040804 0 50%, #00ff41 50% 100%);
	}
	.pm-theme-text {
		display: grid;
		min-width: 0;
	}
	.pm-theme-name {
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.9rem;
		line-height: 1.2;
		color: var(--white);
	}
	/* MUTED COPY THAT SITS ON AN ACTIVE FILL TAKES --text-2, NEVER --dim, and
	   this is the notebook's own rule arriving one room over. The selected row
	   is filled with --green-tint, which is a veil laid on the panel: measured
	   in Chromium, --dim on it is 3.84:1 themed and 3.78:1 on the base palette
	   -- below 4.5 in BOTH, so it was a defect the theme merely made visible.
	   --text-2 clears both (4.91 base, 5.57 themed) on the same fill. */
	.pm-theme-note {
		font-size: 0.72rem;
		line-height: 1.25;
		color: var(--text-2);
	}
</style>
