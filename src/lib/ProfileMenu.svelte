<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import Avatar from '$lib/Avatar.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import { PATHWAYS, pathwayColor, withAlpha } from '$lib/pathways';
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
	let panel: HTMLDivElement | undefined = $state();
	/**
	 * THE PANEL STAYS INSIDE THE VIEWPORT, WHATEVER HEADER ANCHORS IT. It is
	 * `right: 0` against the trigger, and on 69 different mastheads the
	 * trigger's right edge is wherever that header's padding puts it --
	 * measured 44px in from the edge on /dev/profile-menu, which at 375px
	 * pushed a 343px panel 12px off the left of the screen. So on open the
	 * panel's box is read once and, if its left edge is inside the gutter, it
	 * is shifted right by exactly that much (IDEA_INTERFACE_STANDARDS 11:
	 * anchored UI is checked for off-edge positioning at both ends). A read of
	 * the DOM, not a guess about the header, and `untrack`ed because the
	 * effect's one input is `open`.
	 */
	const GUTTER = 8;
	$effect(() => {
		if (!open) return;
		const el = panel;
		untrack(() => {
			if (!el) return;
			el.style.setProperty('--pm-shift', '0px');
			const r = el.getBoundingClientRect();
			const overLeft = GUTTER - r.left;
			const overRight = r.right - (window.innerWidth - GUTTER);
			const shift = overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0;
			if (shift) el.style.setProperty('--pm-shift', `${Math.round(shift)}px`);
		});
	});
	let editingName = $state(false);
	let nameDraft = $state('');
	let busy = $state(false);
	let errorMsg = $state('');
	let errorEl: HTMLParagraphElement | undefined = $state();

	/**
	 * THE ONE PROBLEM LIST IS BROUGHT INTO VIEW WHEN IT FILLS, AND THAT IS A
	 * MEASURED FIX RATHER THAN A COURTESY.
	 *
	 * Every write on this surface -- the name, a preset, an upload, and since
	 * ledger 0280 the pathway -- reports into a single `.pm-error` low in the
	 * panel, which is the right shape (CLAUDE.md: a refusal renders in the same
	 * problem list as every other problem, not in a second place). What it is
	 * not, on its own, is READABLE: the panel grew a section and its own bottom
	 * went past the fold. MEASURED on `/dev/profile-menu` with the write forced
	 * to be declined, at 375 and 1440 alike: the sentence sat at y 1013..1053 in
	 * a 900px viewport -- present, painted, `expectVisible` satisfied, and 113px
	 * below anything the student could see. So the tile did not take, nothing
	 * said why, and the only thing on screen was a chip still showing the old
	 * value, which is precisely the silent failure `saveProfile` selects the row
	 * back to prevent.
	 *
	 * A SECOND ERROR SLOT BESIDE THE PATHWAY TILES WAS THE OTHER ANSWER AND IS
	 * WORSE: it is the second place the rule above names, it fixes one section
	 * and leaves the other three below the fold, and two elements saying one
	 * thing is the pair that stops agreeing.
	 *
	 * `block: 'nearest'` SO A SENTENCE ALREADY ON SCREEN DOES NOT MOVE THE PAGE
	 * -- the common case is a panel that fits, and scrolling it then would be a
	 * jump with no cause a reader can see. `behavior: 'instant'` because
	 * `src/app.css` sets a global `scroll-behavior: smooth` and a refusal is not
	 * an animation.
	 *
	 * Both reads are TRACKED on purpose: the effect exists to re-run when the
	 * message changes or the element mounts. Nothing caller-supplied is called
	 * inside it -- `scrollIntoView` is a DOM method on this component's own
	 * node -- so there is nothing to `untrack`, and it writes no state it reads.
	 */
	$effect(() => {
		if (!errorMsg) return;
		errorEl?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
	});

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

	/**
	 * A STUDENT SETS THEIR OWN PATHWAY HERE, AND THIS IS THE ONLY PLACE OUTSIDE
	 * THE FIRST-LOGIN SHEET THAT LETS THEM.
	 *
	 * WHY IT HAD TO EXIST. `PathwayPicker` caps a deferral at seven days
	 * (`PATHWAY_DEFER_MAX_AGE_MS`), on the correct reasoning that a deferral
	 * with no end quietly means this student never gets a pathway. With no
	 * second route that cap turns a one-time modal into a recurring one: a
	 * student who taps "Choose later" meets the same sheet next week, forever,
	 * because nothing else on the site writes the column for them. The sheet is
	 * the prompt; this is the setting.
	 *
	 * IT GOES THROUGH `saveProfile`, WHICH IS THE POINT. That helper already
	 * selects the row back, so a zero-row RLS-blocked update is reported rather
	 * than read as success, and the refusal lands in the panel's one problem
	 * list beside every other write on this surface. A second write path here
	 * would be a second copy of that lesson.
	 *
	 * NO POLICY IS NEEDED AND NONE WAS ADDED. `0038_profile_pathway.sql` says
	 * so in its own header -- a student writes their own pathway through 0001's
	 * "update own profile" policy, at the same trust level as `display_name`
	 * and `section_id`, and the `enforce_role_change` trigger guards `role`
	 * alone. The gap this closes was always UI, never the database.
	 *
	 * ANY OF THE SIX, NOT SET-ONCE, AND THAT IS A DELIBERATE CHOICE. A pathway
	 * is IDENTITY AND ATTRIBUTION ONLY -- CLAUDE.md and 0038 both state that no
	 * route, policy or feature may branch access on it -- so a wrong value is a
	 * misattribution on a leaderboard, not an access decision, and it is
	 * already correctable by any teacher from the dashboard roster. Set-once
	 * would leave a student who mis-tapped inside a modal they were trying to
	 * dismiss with no way out but asking staff, which is the dead end this
	 * whole control exists to remove. The display name sitting two rows above
	 * is the same trust level and is freely editable.
	 *
	 * Tapping the current pathway writes nothing: `aria-checked` already says
	 * it is set, and a no-op round trip is a spinner with nothing behind it.
	 */
	const choosePathway = (id: string) => {
		if (profile?.pathway === id) return;
		return saveProfile({ pathway: id });
	};

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
			<div class="pm-panel" role="menu" bind:this={panel}>
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
								<label class="pm-field">
									<span>Display name</span>
									<!-- svelte-ignore a11y_autofocus -->
									<input
										type="text"
										bind:value={nameDraft}
										maxlength="60"
										placeholder="Display name"
										autofocus
										disabled={busy}
									/>
								</label>
								<div class="pm-row">
									<button class="pm-btn primary" type="submit" disabled={busy}>Save name</button>
									<button class="pm-btn" type="button" onclick={() => (editingName = false)}>Cancel</button>
								</div>
							</form>
						{:else}
							<div class="pm-name" style={nameTint ? `color:${nameTint}` : ''}>
								{displayName(profile)}
							</div>
						{/if}
						<div class="pm-meta">
							<PathwayChip pathway={profile?.pathway} size="sm" />
							<span class="pm-role">{profile?.role ?? 'signed in'}</span>
							{#if claims.email}<span class="pm-email">{claims.email}</span>{/if}
						</div>
					</div>
				</div>
				{#if !editingName}
					<div class="pm-row">
						<button class="pm-btn" type="button" onclick={startNameEdit}>Edit name</button>
					</div>
				{/if}

				<!-- THE PATHWAY, SET FROM HERE AND NOT ONLY FROM THE FIRST-LOGIN
				     SHEET. See `choosePathway` above for why this control exists and
				     why any of the six is writable rather than only the unset case.

				     IT SITS WITH THE IDENTITY CONTROLS, directly under the name it is
				     the other half of: the chip beside the avatar and the tint on the
				     display name are both this value, so the control belongs where
				     what it changes is on screen. Picture and Theme follow.

				     A RADIOGROUP, THE WAY THE THEME PICKER IS, because the six are
				     exactly one choice of a fixed set and `aria-checked` says which
				     without anybody having to see the tint. UNSET IS A LEGAL STATE
				     and renders as no tile checked, which is what a student who
				     deferred the sheet arrives here with.

				     ONE TAP IS THE WRITE, mirroring the presets in the section below
				     rather than the sheet's pick-then-confirm: a confirm step buys
				     nothing for a change that is undone by tapping a different tile,
				     and the chip two rows up is the acknowledgement.

				     COLOUR IS NOT THE ONLY SIGNAL. The checked tile carries a check
				     glyph as well as the identity edge, the identity tint and
				     `aria-checked`; every tile carries its code as a visible word and
				     its pathway glyph beside it. The ink and the fill come from
				     `pathways.ts`, where the ink is the identity at a lightness that
				     clears 4.5:1 on exactly this tint. -->
				<div class="pm-section">
					<div class="pm-label" id="pm-pathway-label">Pathway</div>
					<p class="pm-note">
						Shows on your profile and the boards. It never limits what you can open, and you can
						change it here.
					</p>
					<div class="pm-pathways" role="radiogroup" aria-labelledby="pm-pathway-label">
						{#each PATHWAYS as p (p.id)}
							<button
								class="pm-pathway"
								class:selected={profile?.pathway === p.id}
								type="button"
								role="radio"
								aria-checked={profile?.pathway === p.id}
								disabled={busy}
								style="--pw:{p.color}; --pw-ink:{p.ink}; --pw-bg:{withAlpha(p.color, 0.12)}"
								onclick={() => choosePathway(p.id)}
							>
								<span class="pm-pathway-mark" aria-hidden="true">
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -- static markup from the pathways registry, never user input -->
										{@html p.icon}
									</svg>
								</span>
								<span class="pm-pathway-word">
									{p.label}<span class="pm-pathway-tick" aria-hidden="true"
										>{profile?.pathway === p.id ? ' \u2713' : ''}</span
									>
								</span>
							</button>
						{/each}
					</div>
				</div>

				<!-- THE PICTURE: eight preset marks, each a 44px control WITH ITS WORD
				     (ledger 0117, report 23). They were 8-across at ~32px with a
				     `title` nobody on a phone can hover; a glyph is not a control's
				     name. `aria-pressed` carries the selection for anyone not
				     looking at the ring. -->
				<div class="pm-section">
					<div class="pm-label">Picture</div>
					<div class="pm-presets">
						{#each AVATAR_PRESETS as p (p.id)}
							<button
								class="pm-preset"
								class:selected={currentPreset === p.id}
								type="button"
								aria-pressed={currentPreset === p.id}
								disabled={busy}
								onclick={() => choosePreset(p.id)}
							>
								<span class="pm-preset-mark" aria-hidden="true">
									<svg viewBox="0 0 24 24" fill="none" stroke={p.fg} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
										<path d={p.d} />
									</svg>
								</span>
								<span class="pm-preset-word">{p.label}</span>
							</button>
						{/each}
					</div>
					<div class="pm-row">
						<label class="pm-btn pm-upload" class:disabled={busy}>
							Upload a picture
							<input type="file" accept="image/*" onchange={onUpload} disabled={busy} />
						</label>
						{#if profile?.avatar}
							<button class="pm-btn" type="button" disabled={busy} onclick={useGooglePhoto}>
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
					<!-- THE PANEL'S ONE PROBLEM LIST, for the name, the picture, the
					     upload and the pathway alike. See the effect above for why it
					     is scrolled to rather than duplicated per section. -->
					<p class="pm-error" bind:this={errorEl}>{errorMsg}</p>
				{/if}

				<div class="pm-actions">
					{#if page.data.isAdmin}
						<a class="pm-link" href="/dashboard" onclick={close}>Admin console</a>
					{/if}
					<button class="pm-link pm-signout" type="button" onclick={signOut}>Sign out</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* --------------------------------------------------------------------------
	   THE PANEL IS A MACHINED SURFACE CARD, ON TOKENS (ledger 0117, report 23:
	   "the profile customization page looks dated").

	   WHAT WAS DATED, MEASURED RATHER THAN FELT: the rules below used to carry
	   neon literals as fallbacks (`#00ff41`, `#00f0ff`, `#050f07`) from before
	   the token layer existed; three text controls (Edit, Upload image, Use
	   Google photo) were 0.62rem underlined mono words, no box, ~15px tall;
	   the eight picture presets were 8-across in a 288px panel, ~32px each,
	   named only by a `title`; the Save/Cancel pair and the Dashboard/Sign out
	   pair were ~30px. Every one of those is a student-facing control under
	   the 44px floor (IDEA_INTERFACE_STANDARDS 10), on every one of the 69
	   pages that mount this menu.

	   THE DIRECTION CHOSEN: keep the anchored popover, and make it the same
	   object a home card or a console panel is -- `--bg1` on `--boundary`
	   with the machined bevel, `--radius-card`, the type scale from the token
	   layer (`--font-display` for the name and control words, `--font-mono`
	   for the eyebrow labels at a size that clears the floor), one 44px
	   control class (`.pm-btn`) for every action, presets at four across with
	   their names under them. Tokens only: the fallbacks are gone, because the
	   token layer is imported by app.css on every route this mounts on.

	   REJECTED, AND WHY. A `/profile` PAGE: the theme control's whole safety
	   argument is that the theme is on exactly where the control that turns
	   it off is reachable (ThemeRoot's session gate is paired with THIS
	   menu), and a page would be a second surface writing the same four
	   fields from 69 headers that already carry the first. A MODAL DIALOG: a
	   name edit does not need to take the page, and the pointerdown
	   outside-dismiss this component already gets right is the anchored
	   popover's contract. A LIGHT PAPER PLATE: this is the portal shell's own
	   component, not a room, and a light card would need a room hook on every
	   plate the menu can land on to stay readable.

	   IT LANDS IN ROOMS, AND THE ROOMS ALIAS THE TOKENS. `.fg-root`, `.cd-root`
	   and `.nb-root` alias `--bg1` / `--white` / `--boundary` onto their own
	   plates, so the panel takes each room's card colours; a room that does
	   not alias them gets the portal's dark card, which is what it got before.
	   -------------------------------------------------------------------------- */
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
		color: var(--dim);
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
		width: min(22rem, calc(100vw - 2rem));
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		box-shadow:
			var(--bevel-raised),
			0 16px 40px rgba(0, 0, 0, 0.55);
		padding: var(--space-4);
		text-align: left;
		display: grid;
		gap: var(--space-3);
		/* Set from the script on open when the box would cross a viewport
		   edge; 0 everywhere the header already leaves room. */
		transform: translateX(var(--pm-shift, 0px));
	}
	.pm-id {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.pm-id-text {
		min-width: 0;
		flex: 1;
	}
	.pm-name {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--white);
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.pm-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
	}
	.pm-role {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.pm-email {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	/* --- One control class, 44px, a word on every one -------------------- */
	.pm-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.pm-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 0.5rem 0.9rem;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--white);
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		cursor: pointer;
		text-decoration: none;
		line-height: 1.2;
	}
	.pm-btn:hover,
	.pm-btn:focus-visible {
		border-color: var(--green);
		color: var(--green);
	}
	.pm-btn:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.pm-btn.primary {
		color: var(--green);
		border-color: var(--green);
	}
	.pm-btn:disabled,
	.pm-btn.disabled {
		opacity: 0.6;
		cursor: default;
	}
	.pm-upload input {
		display: none;
	}
	.pm-name-edit {
		display: grid;
		gap: var(--space-2);
	}
	.pm-field {
		display: grid;
		gap: 0.3rem;
	}
	.pm-field span {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.pm-field input {
		width: 100%;
		box-sizing: border-box;
		min-height: 44px;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 1rem;
		padding: 0.45rem 0.7rem;
	}
	.pm-field input:focus {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}

	/* --- Sections ---------------------------------------------------------- */
	.pm-section {
		display: grid;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}
	.pm-label {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	/* --- The picture presets: four across, a mark and its word ------------ */
	.pm-presets {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-2);
	}
	.pm-preset {
		display: grid;
		justify-items: center;
		gap: 0.25rem;
		min-height: 44px;
		padding: 0.4rem 0.2rem;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		cursor: pointer;
		color: var(--text-2);
		transition:
			border-color 0.2s ease,
			box-shadow 0.2s ease;
	}
	.pm-preset-mark {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: var(--bg1);
	}
	.pm-preset-mark svg {
		width: 62%;
		height: 62%;
	}
	.pm-preset-word {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		line-height: 1.15;
		text-align: center;
	}
	.pm-preset:hover,
	.pm-preset:focus-visible {
		border-color: var(--green);
	}
	.pm-preset:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	/* THE SELECTED PRESET IS MARKED THREE WAYS -- the accent edge, the tint
	   fill and the word going to --green -- plus `aria-pressed` for anyone not
	   looking at any of them. */
	.pm-preset.selected {
		border-color: var(--green);
		background: var(--green-tint);
		color: var(--green);
	}
	.pm-preset:disabled {
		opacity: 0.6;
		cursor: default;
	}

	/* --- The pathway: six identity tiles, three across --------------------
	   THREE ACROSS RATHER THAN THE PRESETS' FOUR, because a pathway code is a
	   word of up to four letters plus a tick and the panel is 343px wide at
	   375px. Four columns of six tiles would also leave two empty cells in the
	   second row; three leaves none.

	   EACH TILE PAINTS ITSELF FROM `pathways.ts` THROUGH THREE CUSTOM
	   PROPERTIES SET INLINE (`--pw`, `--pw-ink`, `--pw-bg`), the same shape
	   `PathwayChip` and the first-login sheet use. They are inline because the
	   value is per pathway and comes from the registry -- the launcher's
	   cascade argument does not apply, since there is no shared default here a
	   later rule would need to reach past.

	   THE INK DRAWS THE WORD AND THE GLYPH; THE IDENTITY DRAWS THE EDGE AND
	   THE FILL. `pathways.ts` derives each ink so it clears 4.5:1 on exactly
	   this 12% tint over the portal's three grounds; the raw identity does not
	   for CSEE, MSET and BMET. */
	.pm-pathways {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-2);
	}
	.pm-pathway {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: 0.25rem;
		min-height: 44px;
		padding: 0.4rem 0.2rem;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		cursor: pointer;
		color: var(--pw-ink, var(--text-2));
		transition: border-color 0.2s ease;
	}
	.pm-pathway-mark {
		width: 26px;
		height: 26px;
		display: grid;
		place-items: center;
	}
	.pm-pathway-mark svg {
		width: 100%;
		height: 100%;
	}
	.pm-pathway-word {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		line-height: 1.15;
		text-align: center;
	}
	.pm-pathway:hover,
	.pm-pathway:focus-visible {
		border-color: var(--pw, var(--green));
	}
	.pm-pathway:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	/* THE CHECKED TILE IS MARKED FOUR WAYS -- the identity edge, the identity
	   tint, the tick glyph in its word and `aria-checked` -- so neither the hue
	   nor any single one of them is carrying the state alone. */
	.pm-pathway.selected {
		border-color: var(--pw, var(--green));
		background: var(--pw-bg, var(--bg2));
	}
	.pm-pathway:disabled {
		opacity: 0.6;
		cursor: default;
	}

	/* One short line of student-facing copy under a section label. `--text-2`
	   and not `--dim`: `--dim` measures 4.46:1 on `--bg1`, which is the panel's
	   own ground, and this is real copy rather than decoration. */
	.pm-note {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.85rem;
		line-height: 1.35;
		color: var(--text-2);
	}

	.pm-error {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--amber);
		/* ROOM FOR THE SENTENCE WHEN IT IS SCROLLED TO. `block: 'nearest'` stops
		   the moment the box is technically inside the viewport, which at 375px
		   put the refusal flush against the bottom edge -- measured y 860..900 of
		   900, whole but with nothing under it, which reads as a line the page
		   cut off. `scroll-margin` is the property that exists for exactly this
		   and costs nothing anywhere else: it is read only by a scroll that
		   targets this element. */
		scroll-margin-block: var(--space-3);
	}
	.pm-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2);
		padding-top: var(--space-3);
		border-top: 1px solid var(--hairline);
	}
	.pm-link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--green);
		background: none;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0.5rem 0.9rem;
		cursor: pointer;
		text-decoration: none;
	}
	.pm-link:hover,
	.pm-link:focus-visible {
		border-color: var(--green);
	}
	.pm-signout {
		margin-left: auto;
		color: var(--white);
	}
	.pm-signout:hover {
		color: var(--green);
	}
	@media (prefers-reduced-motion: reduce) {
		.pm-caret,
		.pm-preset,
		.pm-pathway {
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
		gap: var(--space-2);
	}
	.pm-theme {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		min-height: 44px;
		padding: 0.4rem 0.6rem;
		text-align: left;
		background: var(--bg2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		cursor: pointer;
		color: inherit;
		transition: border-color 0.2s ease;
	}
	.pm-theme:hover,
	.pm-theme:focus-visible {
		border-color: var(--green);
	}
	.pm-theme:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
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
		border: 1px solid var(--boundary);
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
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 600;
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
		font-size: 0.74rem;
		line-height: 1.25;
		color: var(--text-2);
	}
</style>
