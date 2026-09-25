<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import Avatar from '$lib/Avatar.svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import IdentityBanner from '$lib/IdentityBanner.svelte';
	import BadgeIcon from '$lib/tournaments/BadgeIcon.svelte';
	import PathwayChip from '$lib/PathwayChip.svelte';
	import { PATHWAYS } from '$lib/pathways';
	import {
		SITE_THEMES,
		SITE_THEME_LABELS,
		SITE_THEME_NOTES,
		setSiteTheme,
		siteTheme
	} from '$lib/theme.svelte';
	import {
		AVATAR_PRESETS,
		AVATAR_TIERS,
		avatarSource,
		displayName,
		markTransform,
		presetMarks,
		presetTier,
		profileStyle,
		profileStyleReady,
		signOutEverywhere,
		type UserProfile
	} from '$lib/profile';
	import {
		ACCENT_PRESETS,
		BADGES,
		PROFILE_FLOURISHES,
		type IdentityStyle
	} from '$lib/identity-style';

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
	 *
	 * AND IT STOPS AT THE FLOOR OF THE VIEWPORT, WHICH IT DID NOT (report R18,
	 * ledger 0298). The panel had no max-height and did not scroll, so on the
	 * portal it ran past the fold and in the classroom it ran past the bottom
	 * of `.cr-app`, which above 1024px is `100dvh` with `overflow: hidden` --
	 * so the lower half of the panel, Sign out included, could not be reached
	 * by any scroll at all. The same read now also measures the room from the
	 * panel's own top down to the viewport's floor and hands it to CSS as
	 * `--pm-max-h`, and the panel scrolls inside that box with its scrollbar
	 * showing (no region on this site may hide its scrollbar). Kept as an
	 * absolutely positioned popover rather than moved to `$lib/shell/anchored`:
	 * the horizontal answer above is already measured on sixty-nine mastheads,
	 * and a fixed-position panel is re-anchored by any ancestor carrying a
	 * `transform` or a `filter`, which nobody has audited those headers for.
	 *
	 * `MIN_PANEL_PX` is the floor of the clamp: a trigger sitting low on a
	 * short window (a page scrolled halfway past its header) still opens a
	 * panel tall enough to be a panel, and the page scrolls for the rest.
	 * Re-measured on resize, because a phone rotating or a desktop window
	 * being dragged shorter moves the floor under an open panel.
	 *
	 * THE FLOOR IS ALSO THE TOP OF ANYTHING FLOATING OVER IT. Outside the
	 * classroom the Report and Voice controls float in the bottom corners at
	 * `z-index: 90`, above every masthead's stacking context, and a panel
	 * clamped to the bare viewport put Sign out exactly under Report: measured
	 * on the real home page at 375x667, the hit test at Sign out's centre
	 * answered the Report pill's own word. So the band the panel could reach
	 * is sampled with `elementFromPoint`, and a FIXED box painting there that
	 * is not a backdrop (it starts below the panel's top and is under half the
	 * window tall) raises the floor to just above its top edge. Found by where
	 * it paints rather than by its class name, so an install prompt, or a
	 * control added next year, is honoured with no edit here. The band is
	 * sampled every 16px across and down, closer than the 44px any control is
	 * wide or tall, so a floating control cannot fall between two samples;
	 * each element's fixed ancestor is looked up once per open.
	 */
	const GUTTER = 8;
	const MIN_PANEL_PX = 220;
	const floatingFloor = (el: HTMLElement, left: number, right: number, top: number) => {
		const start = window.innerHeight - GUTTER;
		let floor = start;
		const fixedOf = new Map<Element, Element | null>();
		const fixedAncestor = (hit: Element): Element | null => {
			const seen: Element[] = [];
			let n: Element | null = hit;
			let found: Element | null = null;
			while (n) {
				if (fixedOf.has(n)) {
					found = fixedOf.get(n) ?? null;
					break;
				}
				seen.push(n);
				if (getComputedStyle(n).position === 'fixed') {
					found = n;
					break;
				}
				n = n.parentElement;
			}
			for (const s of seen) fixedOf.set(s, found);
			return found;
		};
		const across = Math.max(2, Math.ceil((right - left) / 16));
		for (let i = 0; i <= across; i++) {
			const x = left + 2 + ((right - left - 4) * i) / across;
			for (let dy = 0; dy <= 96; dy += 16) {
				const y = start - dy;
				if (y <= top) break;
				const hit = document.elementFromPoint(x, y);
				if (!hit || el.contains(hit)) continue;
				const fixed = fixedAncestor(hit);
				if (!fixed) continue;
				const fr = fixed.getBoundingClientRect();
				if (fr.top > top && fr.height < window.innerHeight / 2) {
					floor = Math.min(floor, fr.top - GUTTER);
				}
			}
		}
		return floor;
	};
	const fitPanel = (el: HTMLDivElement) => {
		el.style.setProperty('--pm-shift', '0px');
		const r = el.getBoundingClientRect();
		const overLeft = GUTTER - r.left;
		const overRight = r.right - (window.innerWidth - GUTTER);
		const shift = overLeft > 0 ? overLeft : overRight > 0 ? -overRight : 0;
		if (shift) el.style.setProperty('--pm-shift', `${Math.round(shift)}px`);
		const floorY = floatingFloor(el, r.left + shift, r.right + shift, r.top);
		const room = Math.floor(floorY - r.top);
		const least = Math.min(MIN_PANEL_PX, window.innerHeight - 2 * GUTTER);
		el.style.setProperty('--pm-max-h', `${Math.max(room, least)}px`);
	};
	$effect(() => {
		if (!open) return;
		const el = panel;
		if (!el) return;
		untrack(() => fitPanel(el));
		const onResize = () => fitPanel(el);
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
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
	 * Choosing the current pathway writes nothing (a native select fires no
	 * `change` for it anyway, and the guard stays for any other caller): a
	 * no-op round trip is a spinner with nothing behind it.
	 */
	const choosePathway = (id: string) => {
		if (profile?.pathway === id) return;
		return saveProfile({ pathway: id });
	};

	/**
	 * THE SELECT IS PUT BACK ON THE STORED VALUE AFTER EVERY WRITE (ledger 0298,
	 * report R18: "a bunch of things and drop down lists"). A native select
	 * moves the moment a student picks, before anything is written, and a
	 * REFUSED write changes no reactive value -- the profile row is exactly what
	 * it was -- so Svelte would never repaint it and the control would sit on a
	 * pathway the database declined. That is the markup running ahead of the
	 * write, which is the one thing `saveProfile` selects the row back to
	 * prevent. Reading `profile` after the await is the stored row either way:
	 * the new one after `invalidateAll()`, the old one after a refusal.
	 */
	const onPathwayChange = async (e: Event) => {
		const el = e.currentTarget as HTMLSelectElement;
		await choosePathway(el.value);
		el.value = profile?.pathway ?? '';
	};

	/**
	 * ========================================================================
	 * THE IDENTITY CONTROLS (ledger 0289, report 15).
	 * ========================================================================
	 *
	 * EVERY WRITE GOES THROUGH `saveProfile`, which is the same argument ledger
	 * 0280 made for the pathway control one section up: that helper selects the
	 * row back, so an RLS-blocked zero-row update is REPORTED rather than read
	 * as success, and the refusal lands in this panel's one problem list beside
	 * every other write on this surface. There is no second write path and
	 * there must not be one.
	 *
	 * NO SECURITY DEFINER RPC, AND NO POLICY, for the reason 0220's header
	 * gives: `profiles` already carries "update own profile", so a student
	 * writing their own identity is the same trust level as the display name
	 * two sections above. The VALIDATION lives in 0220's CHECK constraints
	 * rather than in a function, and `backgroundCss` re-validates a third time
	 * where the value meets a style attribute.
	 *
	 * THE CONTROLS ARE BUTTON GRIDS OVER THE SHARED REGISTRIES, not a mount of
	 * `EntryStyleEditor`. That component takes a `TournamentEntry`, imports
	 * `tournaments-theme.css` and previews through `EntryBanner` -- a room's
	 * stylesheet and a room's render path, on a component mounted in sixty-nine
	 * portal mastheads. What is SHARED is the thing that would actually drift:
	 * the registries, the CSS derivation and the ink, all of which are
	 * `$lib/identity-style.ts` and are read by both. The ARRANGEMENT of
	 * controls is per-room, exactly as the pathway tiles and the preset tiles
	 * already in this file are.
	 *
	 * WHAT IS SENT IS ALWAYS THE WHOLE PAIR FOR A BACKGROUND. 0220 constrains
	 * `(type is null) = (value is null)`, so a patch that moved one without the
	 * other would be refused by the database -- correctly, and with a
	 * constraint-violation sentence no student can act on. `writeBackground`
	 * is the one place that pair is assembled.
	 */
	const style = $derived(profileStyle(profile));
	const styleReady = $derived(profileStyleReady(profile));

	/** A live draft for the preview only; every control writes immediately. */
	const bgType = $derived(style?.background_type ?? null);
	const bgValue = $derived(style?.background_value ?? null);
	const solidNow = $derived(
		bgType === 'solid' && typeof bgValue === 'string' ? bgValue : '#3e7bfa'
	);
	const gradNow = $derived(
		bgType === 'gradient' && Array.isArray(bgValue) ? bgValue : ['#3e7bfa', '#8e5bf0']
	);

	let taglineDraft = $state('');
	let taglineSeeded = $state(false);
	$effect(() => {
		/* Seed ONCE per profile rather than on every render: reading the stored
		   value tracked would clobber whatever is being typed. `untrack` keeps
		   the effect's only input the profile id. */
		const id = profile?.id;
		untrack(() => {
			if (!taglineSeeded && id) {
				taglineDraft = profile?.style_tagline ?? '';
				taglineSeeded = true;
			}
		});
	});

	/**
	 * A LOWERCASED HEX, ALWAYS. 0220's accent constraint is case-INSENSITIVE so
	 * a native colour picker's value can never be refused on a technicality,
	 * but what is STORED is canonical, so two people who picked the same colour
	 * hold the same string.
	 */
	const norm = (hex: string | null) => (hex ? hex.toLowerCase() : null);

	const chooseAccent = (hex: string | null) =>
		saveProfile({ style_accent_color: norm(hex) });
	const chooseBadge = (id: string | null) => saveProfile({ style_badge: id });
	const chooseFlourish = (id: string | null) => saveProfile({ style_flourish: id });

	/** The background pair, assembled in one place. See the note above. */
	const writeBackground = (
		type: 'solid' | 'gradient' | null,
		value: string | [string, string] | null
	) =>
		saveProfile({
			style_background_type: type,
			style_background_value:
				type === 'solid' ? norm(value as string) : type === 'gradient'
					? (value as [string, string]).map((v) => norm(v))
					: null
		});

	const saveTagline = async () => {
		const trimmed = taglineDraft.trim();
		/* NULL, never the empty string: 0220's tagline check is `between 1 and
		   48`, so an empty string is a refusal rather than a clearance. */
		await saveProfile({ style_tagline: trimmed.length ? trimmed.slice(0, 48) : null });
	};

	const clearStyle = () =>
		saveProfile({
			style_background_type: null,
			style_background_value: null,
			style_accent_color: null,
			style_badge: null,
			style_flourish: null,
			style_tagline: null
		});

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

	/**
	 * THE CURRENT PICTURE, IN WORDS, on the row that opens the picker. The
	 * picture itself is the avatar at the head of the panel; this names it, so
	 * the collapsed row says what a student has without the seventeen tiles
	 * having to be on screen to say it. Read off `avatarSource`, the ONE
	 * resolution `Avatar.svelte` renders from, so the word cannot name a picture
	 * the avatar is not showing.
	 */
	const pictureName = $derived.by(() => {
		const src = avatarSource(profile);
		if (src.kind === 'preset') return src.preset.label;
		if (src.kind === 'image')
			return profile?.avatar?.startsWith('upload:') ? 'Your upload' : 'Google photo';
		return 'Initials';
	});

	/* Real ids for `for` / `aria-describedby` / `aria-labelledby`, per mount:
	   the literals these replaced would collide on a page carrying two menus. */
	const uid = $props.id();
	const pathwaySelectId = `pm-pathway-${uid}`;
	const pathwayNoteId = `pm-pathway-note-${uid}`;
	const themeLabelId = `pm-theme-label-${uid}`;
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
				<!-- THE HEAD OF THE PANEL IS ONE BLOCK: the current picture, the
				     name, the pathway chip and role, the Edit name control beside
				     them and the address under them (ledger 0298, report R18). Edit
				     name used to take a row of its own, 56px of a panel that did not
				     fit a phone; beside the name it costs nothing, and the address
				     spans the full width so it is never squeezed by the button. -->
				<div class="pm-id" class:editing={editingName}>
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
							<!-- THE NAME IS NOT TINTED BY PATHWAY (decision 40's side
							     question, report R19). It painted the RAW identity as
							     text -- IDEA's #00FF41 measured 1.29:1 on Space White's
							     light panel -- and on the dark themes three of the six
							     identities fail 4.5:1 as a word. It takes `--text-1`,
							     and the `PathwayChip` beside it carries the colour with
							     its own measured ink. -->
							<div class="pm-name">{displayName(profile)}</div>
						{/if}
						<div class="pm-meta">
							<PathwayChip pathway={profile?.pathway} size="sm" />
							<span class="pm-role">{profile?.role ?? 'signed in'}</span>
						</div>
					</div>
					{#if !editingName}
						<button class="pm-btn pm-edit" type="button" onclick={startNameEdit}>Edit name</button>
					{/if}
					{#if claims.email}<span class="pm-email">{claims.email}</span>{/if}
				</div>

				<!-- THE PATHWAY, SET FROM HERE AND NOT ONLY FROM THE FIRST-LOGIN
				     SHEET. See `choosePathway` above for why this control exists and
				     why any of the six is writable rather than only the unset case.

				     A LABELLED NATIVE SELECT (ledger 0298, report R18: "it should
				     just be a bunch of things and drop down lists"). It was six
				     tiles three across, about 110px of a panel that already ran past
				     the fold; one row is 44px. A native select is the platform's own
				     single choice from a fixed set, it announces its label and its
				     value without any `aria-checked` bookkeeping, and a phone opens
				     its own picker for it. UNSET IS A LEGAL STATE: a student who
				     deferred the first-login sheet sees "Choose one", a disabled
				     placeholder that disappears once a pathway is stored.

				     COLOUR IS NOT THE ONLY SIGNAL AND IS NOT HERE AT ALL. The select
				     says the code in words; the `PathwayChip` in the row above is the
				     identity colour, with its own measured ink. One pick is the write,
				     and `onPathwayChange` puts the control back on the stored row
				     afterwards, so a refused write does not leave it showing a
				     pathway the database declined. -->
				<div class="pm-section">
					<div class="pm-inline">
						<label class="pm-label" for={pathwaySelectId}>Pathway</label>
						<select
							id={pathwaySelectId}
							class="pm-select"
							value={profile?.pathway ?? ''}
							disabled={busy}
							aria-describedby={pathwayNoteId}
							onchange={onPathwayChange}
						>
							{#if !profile?.pathway}
								<option value="" disabled>Choose one</option>
							{/if}
							{#each PATHWAYS as p (p.id)}
								<option value={p.id}>{p.label}</option>
							{/each}
						</select>
					</div>
					<p class="pm-note" id={pathwayNoteId}>
						Shows on the boards, never limits what you open.
					</p>
				</div>

				<!-- THE PICTURE: THE AVATAR AT THE HEAD OF THIS PANEL IS THE CURRENT
				     ONE, AND THIS ROW IS THE CHANGE CONTROL (ledger 0298, report
				     R18). Seventeen tiles in three tiers were rendered
				     unconditionally, about 530px on their own; they are behind a
				     `Disclosure` now, closed on every open of the panel (`scope` is
				     null, so nothing is remembered, and `collapseWhen` constant-true
				     is how "closed on arrival" is spelled; the signal is LATCHED
				     inside Disclosure, so a student who opens it keeps it open while
				     they choose). The collapsed row names the current picture in
				     words from `avatarSource`, the one resolution Avatar renders.

				     Each preset is still a 44px control WITH ITS WORD (ledger 0117,
				     report 23): a glyph is not a control's name, and `aria-pressed`
				     carries the selection for anyone not looking at the ring. -->
				<div class="pm-section">
					<Disclosure label="Change picture" collapseWhen={true} testId="pm-picture-toggle">
						{#snippet meta()}<span class="pm-pic-now">{pictureName}</span>{/snippet}
						{#snippet children()}
							<div class="pm-picker" data-testid="pm-picker">
								<!-- GROUPED BY TIER (ledger 0289, report 14: "there should be more
								     options"). Eight marks were a grid; seventeen without a word
								     over each group is a wall, and the tiers are what let a
								     student find the mascots rather than scroll past them. The
								     groups come from AVATAR_TIERS and the membership from
								     `presetTier`, so adding a preset needs no edit here. -->
								{#each AVATAR_TIERS as tier (tier.id)}
									{@const inTier = AVATAR_PRESETS.filter((p) => presetTier(p) === tier.id)}
									{#if inTier.length}
										<div class="pm-tier">
											<span class="pm-tier-name">{tier.label}</span>
											<span class="pm-tier-note">{tier.note}</span>
										</div>
										<div class="pm-presets">
											{#each inTier as p (p.id)}
												<button
													class="pm-preset"
													class:selected={currentPreset === p.id}
													type="button"
													aria-pressed={currentPreset === p.id}
													disabled={busy}
													onclick={() => choosePreset(p.id)}
												>
													<span class="pm-preset-mark" aria-hidden="true">
														<!-- EVERY MARK, through `presetMarks`, which is the ONE
														     implementation `Avatar.svelte` also calls. This was a
														     single `<path d={p.d} />` in both files; with richer
														     presets two copies would be a cat with eyes in one
														     place and a cat without them in the other. -->
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="1.5"
															stroke-linecap="round"
															stroke-linejoin="round"
															style="--pm-preset-fg:{p.fg};--pm-preset-fg-light:{p.fgOnLight ?? p.fg}"
														>
															{#each presetMarks(p) as mark, i (i)}
																<path
																	d={mark.d}
																	fill={mark.fill ?? 'none'}
																	stroke={mark.fill ? 'none' : (mark.stroke ?? 'currentColor')}
																	stroke-width={mark.width ?? 1.5}
																	transform={markTransform(mark)}
																/>
															{/each}
														</svg>
													</span>
													<span class="pm-preset-word">{p.label}</span>
												</button>
											{/each}
										</div>
									{/if}
								{/each}
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
						{/snippet}
					</Disclosure>
				</div>

				<!-- ====================================================================
				     THE IDENTITY SECTION (ledger 0289, report 15).

				     IT IS A DISCLOSURE, CLOSED BY DEFAULT, AND THAT IS THE RESTRAINT
				     THIS PANEL ALREADY NEEDED. Ledger 0280 measured this popover's
				     one problem list sitting 113px below the fold at 900px after a
				     single section was added; five more control groups rendered
				     unconditionally would put the Sign out button somewhere nobody
				     can reach. `collapseWhen` constant-true is how "closed by
				     default" is spelled, and it is safe because the signal is
				     LATCHED inside Disclosure -- it can fall and never rise, so a
				     student who opens this keeps it open while they work.

				     THE PREVIEW IS THE REAL COMPONENT, never a mock-up of one. It is
				     the same `IdentityBanner` every other surface mounts, handed the
				     same style, so what a student sees here is what a classmate will
				     see. A hand-drawn preview is the second implementation that
				     stops matching.

				     AND THE WHOLE SECTION IS ABSENT WHEN 0220 IS NOT APPLIED. The
				     migration is pasted by hand, so a deployment carrying this client
				     without it is a real state -- and a picker whose every save is
				     refused by a column that does not exist is worse than no picker:
				     absence is the mechanism this platform uses for a control it
				     cannot honour. `profileStyleReady` is the one reading of that,
				     and it keys on `undefined` rather than on a value, so "chose no
				     accent" (null) cannot read as "cannot tell".

				     AND IT NO LONGER REMEMBERS BEING OPENED (ledger 0298, report
				     R18). It carried `scope="profile-identity"`, so one visit to
				     customize left it open on every later open of the menu, on every
				     page, which is the too-tall panel the report is about arriving
				     for good. Customizing is a visit, not a standing layout: the
				     section arrives closed each time, and the latch still keeps it
				     open while a student is working in it.
				     ==================================================================== -->
				{#if styleReady}
					<div class="pm-section">
						<Disclosure label="Identity" collapseWhen={true} testId="pm-identity-toggle">
							{#snippet children()}
								<div class="pm-identity">
									<p class="pm-hint">
										This is how your name appears to other people across the site.
									</p>
									<div class="pm-preview">
										<IdentityBanner {profile} size={36} />
									</div>

									<div class="pm-label pm-sub">Accent</div>
									<div class="pm-swatches" data-testid="pm-accent">
										<button
											class="pm-swatch pm-swatch-none"
											class:selected={!style?.accent_color}
											type="button"
											aria-pressed={!style?.accent_color}
											disabled={busy}
											onclick={() => chooseAccent(null)}
										>
											<span class="pm-swatch-word">None</span>
										</button>
										{#each ACCENT_PRESETS as a (a.id)}
											<button
												class="pm-swatch"
												class:selected={style?.accent_color === a.hex}
												type="button"
												aria-pressed={style?.accent_color === a.hex}
												disabled={busy}
												onclick={() => chooseAccent(a.hex)}
											>
												<span class="pm-swatch-dot" style="background:{a.hex}" aria-hidden="true"
												></span>
												<span class="pm-swatch-word">{a.label}</span>
											</button>
										{/each}
									</div>

									<div class="pm-label pm-sub">Badge</div>
									<div class="pm-swatches" data-testid="pm-badge">
										<button
											class="pm-swatch pm-swatch-none"
											class:selected={!style?.badge}
											type="button"
											aria-pressed={!style?.badge}
											disabled={busy}
											onclick={() => chooseBadge(null)}
										>
											<span class="pm-swatch-word">None</span>
										</button>
										{#each BADGES as b (b.id)}
											<button
												class="pm-swatch"
												class:selected={style?.badge === b.id}
												type="button"
												aria-pressed={style?.badge === b.id}
												disabled={busy}
												onclick={() => chooseBadge(b.id)}
											>
												<span class="pm-swatch-glyph"><BadgeIcon id={b.id} size="1.1em" /></span>
												<span class="pm-swatch-word">{b.label}</span>
											</button>
										{/each}
									</div>

									<div class="pm-label pm-sub">Banner</div>
									<div class="pm-swatches" data-testid="pm-banner">
										<button
											class="pm-swatch pm-swatch-none"
											class:selected={!bgType}
											type="button"
											aria-pressed={!bgType}
											disabled={busy}
											onclick={() => writeBackground(null, null)}
										>
											<span class="pm-swatch-word">None</span>
										</button>
										<button
											class="pm-swatch"
											class:selected={bgType === 'solid'}
											type="button"
											aria-pressed={bgType === 'solid'}
											disabled={busy}
											onclick={() => writeBackground('solid', solidNow)}
										>
											<span class="pm-swatch-dot" style="background:{solidNow}" aria-hidden="true"
											></span>
											<span class="pm-swatch-word">Solid</span>
										</button>
										<button
											class="pm-swatch"
											class:selected={bgType === 'gradient'}
											type="button"
											aria-pressed={bgType === 'gradient'}
											disabled={busy}
											onclick={() => writeBackground('gradient', [gradNow[0], gradNow[1]])}
										>
											<span
												class="pm-swatch-dot"
												style="background:linear-gradient(135deg,{gradNow[0]},{gradNow[1]})"
												aria-hidden="true"
											></span>
											<span class="pm-swatch-word">Gradient</span>
										</button>
									</div>
									<!-- THE COLOUR INPUTS APPEAR ONLY FOR THE MODE THAT USES THEM.
									     A colour well that changes nothing is the control-whose-only-
									     outcome-is-nothing this platform refuses to offer. Each is
									     wrapped in its own `<label>`, which is what a finger hits, and
									     the label carries the word. -->
									{#if bgType === 'solid'}
										<div class="pm-colors">
											<label class="pm-color">
												<span>Colour</span>
												<input
													type="color"
													value={solidNow}
													disabled={busy}
													onchange={(e) =>
														writeBackground('solid', (e.currentTarget as HTMLInputElement).value)}
												/>
											</label>
										</div>
									{:else if bgType === 'gradient'}
										<div class="pm-colors">
											<label class="pm-color">
												<span>From</span>
												<input
													type="color"
													value={gradNow[0]}
													disabled={busy}
													onchange={(e) =>
														writeBackground('gradient', [
															(e.currentTarget as HTMLInputElement).value,
															gradNow[1]
														])}
												/>
											</label>
											<label class="pm-color">
												<span>To</span>
												<input
													type="color"
													value={gradNow[1]}
													disabled={busy}
													onchange={(e) =>
														writeBackground('gradient', [
															gradNow[0],
															(e.currentTarget as HTMLInputElement).value
														])}
												/>
											</label>
										</div>
									{/if}

									<!-- ONLY THE AMBIENT FLOURISHES, and the list is DERIVED
									     (`PROFILE_FLOURISHES` filters on kind) rather than typed out,
									     so it cannot drift from 0220's own CHECK constraint. An event
									     flourish names a decisive moment a tournament has and a
									     profile does not. -->
									<div class="pm-label pm-sub">Effect</div>
									<div class="pm-swatches" data-testid="pm-effect">
										<button
											class="pm-swatch pm-swatch-none"
											class:selected={!style?.flourish}
											type="button"
											aria-pressed={!style?.flourish}
											disabled={busy}
											onclick={() => chooseFlourish(null)}
										>
											<span class="pm-swatch-word">None</span>
										</button>
										{#each PROFILE_FLOURISHES as f (f.id)}
											<button
												class="pm-swatch pm-swatch-wide"
												class:selected={style?.flourish === f.id}
												type="button"
												aria-pressed={style?.flourish === f.id}
												disabled={busy}
												onclick={() => chooseFlourish(f.id)}
											>
												<span class="pm-swatch-word">{f.label}</span>
											</button>
										{/each}
									</div>

									<div class="pm-label pm-sub">Tagline</div>
									<form
										class="pm-tagline"
										onsubmit={(e) => {
											e.preventDefault();
											saveTagline();
										}}
									>
										<input
											type="text"
											maxlength="48"
											placeholder="48 characters"
											bind:value={taglineDraft}
											disabled={busy}
										/>
										<button class="pm-btn" type="submit" disabled={busy}>Save</button>
									</form>

									<div class="pm-row">
										<button class="pm-btn" type="button" disabled={busy} onclick={clearStyle}>
											Reset customization
										</button>
									</div>
								</div>
							{/snippet}
						</Disclosure>
					</div>
				{/if}

				<!-- THE SITE THEME CONTROL. Here and nowhere else, which is what the
				     session gate in ThemeRoot is paired with: the theme is on exactly
				     where the thing that turns it off is reachable.

				     RADIOS, NOT A SWITCH. Two states when this was written and a third
				     arrived as a file (Space White, ledger 0297), which is exactly the
				     case a boolean control would have had to be rebuilt for -- and a
				     radio group already says "these are the choices, this is the
				     current one" without a label anybody has to read twice. The
				     classroom's one-tap `ThemeSwitch` is a shortcut to one of these
				     rows, not a second picker.
				     Each row carries its name AND what it is for: "Matrix" is a name
				     nobody can infer a look from, exactly as "IDEA" is in the
				     notebook's own picker. -->
				<div class="pm-section">
					<div class="pm-label" id={themeLabelId}>Theme</div>
					<div class="pm-themes" role="radiogroup" aria-labelledby={themeLabelId}>
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
	   fields from 69 headers that already carry the first. REPORT R18
	   (ledger 0298) ASKED FOR ONE ANYWAY, for fuller customization, and it
	   is recorded as later work rather than refused: a top-level `/profile`
	   is shadowed by the `[shortlink]` catch-all until the slug is reserved,
	   which is a migration (`_app_short_link_reserved` and `RESERVED_SLUGS`
	   together), and the theme argument above is then answered by keeping
	   the theme control HERE and putting only the picture and identity
	   editors on the page -- mounted from shared components, never copied. A MODAL DIALOG: a
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
		/* No bottom padding: the Sign out row is a sticky footer that carries
		   its own, so it can sit flush on the panel's floor while the rest
		   scrolls under it. */
		padding: var(--space-3) var(--space-4) 0;
		text-align: left;
		display: grid;
		/* --space-2 rather than --space-3 between sections and inside them
		   (ledger 0298): with the pathway a select and the picture behind a
		   disclosure, the rhythm was the last 40px between the panel and a
		   375x667 window. */
		gap: var(--space-2);
		/* Set from the script on open when the box would cross a viewport
		   edge; 0 everywhere the header already leaves room. */
		transform: translateX(var(--pm-shift, 0px));
		/* THE PANEL ENDS AT THE VIEWPORT'S FLOOR AND SCROLLS INSIDE ITSELF
		   (report R18). `--pm-max-h` is measured from the panel's own top on
		   open (see `fitPanel`); the fallback covers the one frame before that
		   read lands. `overflow-y: auto` shows the platform scrollbar exactly
		   when there is more, and nothing here hides it: no region on this site
		   may hide its scrollbar. `overscroll-behavior: contain` so reaching the
		   panel's end does not start scrolling the page under it. */
		max-height: var(--pm-max-h, calc(100dvh - 6rem));
		overflow-y: auto;
		overscroll-behavior: contain;
		/* THE STICKY FOOTER'S HEIGHT, SO A SCROLL INTO VIEW CLEARS IT. The
		   refusal sentence is brought into view by `scrollIntoView`, and
		   keyboard focus scrolls a control into view the same way; without this
		   both would stop with the target under the Sign out row. */
		scroll-padding-bottom: 4.5rem;
	}
	/* The picture, the name block and Edit name on the first row; the address
	   on the second, under the name and the button together. Auto-placement
	   puts the avatar in the first column, so it needs no rule of its own. */
	.pm-id {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		column-gap: var(--space-3);
		row-gap: 0.15rem;
	}
	.pm-id-text {
		min-width: 0;
	}
	.pm-id.editing .pm-id-text {
		grid-column: 2 / -1;
	}
	.pm-edit {
		align-self: start;
	}
	.pm-name {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.15rem;
		/* The name's own tier, never the pathway identity (decision 40, R19):
		   the chip beside it carries the colour. */
		color: var(--text-1);
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
		grid-column: 2 / -1;
		min-width: 0;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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
		padding-top: var(--space-2);
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
		/* The preset's own stroke, through a custom property so the theme below
		   can hand it the light-ground twin (the same move Avatar.svelte makes). */
		color: var(--pm-preset-fg);
		width: 62%;
		height: 62%;
	}
	:global(:root[data-theme='space-white']) .pm-preset-mark svg {
		color: var(--pm-preset-fg-light, var(--pm-preset-fg));
	}
	/* A popover over a light page lifts on the theme's elevation token, which is
	   a hard ledge with no blur; the dark theme's blurred drop is kept for it. */
	:global(:root[data-theme='space-white']) .pm-panel {
		box-shadow: var(--elevation-2);
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

	/* --- The pathway: a labelled native select, one row ------------------
	   The label and the control share a row because the label is one word and
	   the value is a four-letter code: stacked, they spent a second row saying
	   nothing. The select is the 44px control; the label is text, not a target.

	   `color-scheme` IS THE ONLY WAY TO REACH THE OPEN LIST. The browser draws
	   the dropdown itself, and without it the dark panel opened a white list;
	   under Space White it is `light`, which is the classroom's `.cr-select`
	   rule one room over. The caret is two gradients rather than a glyph so it
	   takes the ink token and needs no image. */
	.pm-inline {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.pm-select {
		appearance: none;
		-webkit-appearance: none;
		flex: 0 1 12rem;
		min-width: 0;
		min-height: 44px;
		padding: 0.45rem 2.2rem 0.45rem 0.8rem;
		background-color: var(--bg2);
		background-image:
			linear-gradient(45deg, transparent 50%, var(--text-2) 50%),
			linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
		background-position:
			calc(100% - 1.15rem) 50%,
			calc(100% - 0.75rem) 50%;
		background-size: 0.4rem 0.4rem;
		background-repeat: no-repeat;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		color: var(--text-1);
		color-scheme: dark;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 0.95rem;
		line-height: 1.2;
		cursor: pointer;
	}
	.pm-select option {
		background: var(--bg2);
		color: var(--text-1);
	}
	:global(:root[data-theme='space-white']) .pm-select {
		color-scheme: light;
	}
	.pm-select:hover,
	.pm-select:focus-visible {
		border-color: var(--green);
	}
	.pm-select:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	.pm-select:disabled {
		opacity: 0.6;
		cursor: default;
	}

	/* The current picture, named, in the Change picture row. `--text-2` on the
	   panel's own ground, the tier `Disclosure` gives its meta anyway; stated
	   here so the word does not depend on that inheritance. */
	.pm-pic-now {
		color: var(--text-2);
	}
	.pm-picker {
		display: grid;
		gap: var(--space-2);
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

	/* ------------------------------------------------------------------------
	   THE IDENTITY CONTROLS (ledger 0289).

	   EVERY CONTROL HERE CLEARS THE 44px FLOOR, because this is a
	   student-facing surface at every width (IDEA_INTERFACE_STANDARDS 10) and
	   this panel is mounted in sixty-nine mastheads. The floor is `min-height`
	   and never `height`: a fixed height cannot round UP, which is exactly how
	   the notebook's plate switch ended up pinned below the floor it was meant
	   to clear.

	   AND EVERY ONE CARRIES A WORD, not only a swatch or a glyph. A colour dot
	   on its own is colour-as-the-only-signal, and a `title` is not
	   discoverable and a phone cannot hover -- the same finding report 23 made
	   about the eight picture presets, which is why they gained their names.
	   ------------------------------------------------------------------------ */
	.pm-tier {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		margin: 0.55rem 0 0.3rem;
	}
	.pm-tier-name {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2, #9ab);
	}
	.pm-tier-note {
		font-size: 0.66rem;
		color: var(--text-3, #7a8a7a);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pm-identity {
		display: block;
	}
	.pm-hint {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		color: var(--text-2, #9ab);
	}
	.pm-preview {
		margin-bottom: 0.6rem;
	}
	.pm-sub {
		margin-top: 0.6rem;
	}
	.pm-swatches {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.3rem;
	}
	.pm-swatch {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.35rem;
		min-height: 44px;
		padding: 0.3rem 0.45rem;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--boundary, rgba(255, 255, 255, 0.2));
		background: var(--bg2, #101610);
		color: var(--text-1, #e8ffe8);
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.78rem;
		cursor: pointer;
		min-width: 0;
	}
	.pm-swatch:disabled {
		opacity: 0.55;
		cursor: default;
	}
	/* The SELECTED state is a ring AND a weight, never the ring alone: colour
	   is never the only signal, and `aria-pressed` carries it for anyone not
	   looking at either. */
	.pm-swatch.selected {
		border-color: var(--green, #00ff41);
		box-shadow: inset 0 0 0 1px var(--green, #00ff41);
		font-weight: 700;
	}
	.pm-swatch-wide {
		grid-column: span 2;
	}
	.pm-swatch-dot {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		flex: none;
		border: 1px solid var(--boundary, rgba(255, 255, 255, 0.2));
	}
	.pm-swatch-glyph {
		display: inline-flex;
		flex: none;
		color: var(--text-2, #9ab);
	}
	.pm-swatch-word {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pm-colors {
		display: flex;
		gap: 0.4rem;
		margin-top: 0.3rem;
	}
	/* THE CONTROL IS MEASURED AT THE LABEL, which is what a finger hits. The
	   input inside it is the browser's own colour well and is smaller; the
	   label is what carries the floor and the word. */
	.pm-color {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--boundary, rgba(255, 255, 255, 0.2));
		background: var(--bg2, #101610);
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		color: var(--text-2, #9ab);
		cursor: pointer;
	}
	.pm-color input {
		width: 32px;
		height: 28px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
	}
	.pm-tagline {
		display: flex;
		gap: 0.35rem;
		margin-top: 0.3rem;
	}
	.pm-tagline input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
		padding: 0.3rem 0.5rem;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--boundary, rgba(255, 255, 255, 0.2));
		background: var(--bg2, #101610);
		color: var(--text-1, #e8ffe8);
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.85rem;
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
	/* SIGN OUT IS A STICKY FOOTER, SO IT IS ON SCREEN HOWEVER MUCH IS OPEN
	   ABOVE IT (ledger 0298, report R18). With the picker or the identity
	   controls expanded the panel scrolls, and the one control a person on a
	   shared school computer must always be able to find stays pinned to the
	   panel's floor. It carries a `z-index` because sticky makes it POSITIONED
	   and positioned siblings paint in tree order, and an opaque ground
	   because a transparent footer over scrolling content is two lines of
	   text on top of each other (CLAUDE.md's sticky trap, both halves). The
	   negative inline margin takes the ground out to the panel's edges so
	   nothing scrolling under it shows at the sides. */
	.pm-actions {
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin-inline: calc(-1 * var(--space-4));
		padding: var(--space-2) var(--space-4) var(--space-3);
		background: var(--bg1);
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
	   design-system/themes/matrix.css and space-white.css: Space White's is its
	   page ground against its green INK, the two things that say "white
	   console" at 26px. */
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
	.pm-theme-swatch[data-theme-swatch='space-white'] {
		background: linear-gradient(135deg, #e8eceb 0 50%, #3b6c36 50% 100%);
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
