<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { entries as changelog } from 'virtual:site-versions';
	import { APPS, CHANGE_TYPES, appLabel, changeTypeLabel } from '$lib/site-manifest';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AppLauncher from '$lib/AppLauncher.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import HomeTour from '$lib/tour/HomeTour.svelte';
	import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
	import {
		buildFeed,
		readFeedPrefs,
		toggleCollapsed,
		type ClassroomFeedPrefs,
		type FeedSubmission
	} from '$lib/classroom/feed';
	import type { ClassroomItem, ClassroomSection } from '$lib/classroom/classroom';
	import {
		computeStreak,
		levelFromXp,
		modeHref,
		suggestNext,
		xpFromProgression,
		type ProgressionPayload,
		type SuggestibleChallenge
	} from '$lib/gauntlet/progression';
	import { modeById } from '$lib/gauntlet';
	import { ADMIN_OWNER_EMAIL } from '$lib/admin';
	import {
		sectionById,
		selfSelectOptions,
		activeCourseCount
	} from '$lib/curriculum';

	let { data } = $props();
	let { supabase, claims, userProfile: profile } = $derived(data);

	const signedIn = $derived(!!claims);
	// Two different questions, deliberately kept apart since 0067:
	// isTeacher = staff rather than a student (drives which homepage a person
	// gets), isAdmin = may actually use the privileged tools.
	const isTeacher = $derived(profile?.role === 'teacher');
	const isAdmin = $derived(data.isAdmin === true);
	const mySection = $derived(sectionById(profile?.section_id));

	// GAUNTLET "continue / next best" nudge (signed-in only; null pre-0021).
	const nudge = $derived.by(() => {
		const raw = data.gauntletNudge as {
			progression: ProgressionPayload;
			challenges: SuggestibleChallenge[];
		} | null;
		if (!raw) return null;
		const p = raw.progression;
		const level = levelFromXp(xpFromProgression(p));
		const streak = computeStreak(p.practice_days, p.today);
		const nextUp = suggestNext(raw.challenges, p.cleared_ids);
		// Nothing to say to someone who has never entered the dojo and has
		// nothing published to try; the launcher card covers discovery.
		if (!p.attempted_ids.length && !nextUp) return null;
		return { level, streak, nextUp };
	});

	const pickerGroups = selfSelectOptions();
	const courseCount = activeCourseCount();

	// The classroom feed: one card per class, ranked by what each one is asking
	// of you right now. RLS already decided what came back; buildFeed only ranks
	// it, and `isAdmin` mirrors classroom_manages_section so the card asks the
	// teacher's question rather than the student's.
	const now = new Date();
	const classroomFeeds = $derived(
		buildFeed({
			sections: (data.feedSections ?? []) as ClassroomSection[],
			items: (data.feedItems ?? []) as ClassroomItem[],
			submissions: (data.feedSubmissions ?? []) as FeedSubmission[],
			myEmail: (claims?.email as string | undefined) ?? '',
			isAdmin,
			now
		})
	);

	// Collapse state, persisted per USER in profiles.preferences.classroomFeed
	// (the AppLauncher pattern), so a folded class stays folded on their phone
	// too. Optimistic locally so the arrow turns on the click, not on the round
	// trip.
	let feedPrefs = $state<ClassroomFeedPrefs>({});
	$effect(() => {
		feedPrefs = readFeedPrefs(profile?.preferences);
	});
	const toggleFeedCard = async (sectionId: string) => {
		const next = toggleCollapsed(feedPrefs, sectionId);
		feedPrefs = next;
		if (!claims) return;
		const merged = { ...(profile?.preferences ?? {}), classroomFeed: next };
		await supabase.from('profiles').update({ preferences: merged }).eq('id', claims.sub);
	};

	let loading = $state(false);
	let errorMessage = $state('');
	// The first-time orientation tour (auto-launch lives inside HomeTour); the
	// header's "Take the tour" control replays it manually at any time.
	let homeTour: ReturnType<typeof HomeTour> | undefined = $state();
	let savingSection = $state(false);
	let changing = $state(false);

	// Changelog filters: by page/app, by change type, by date range.
	let filterApp = $state('all');
	let filterType = $state('all');
	let filterFrom = $state('');
	let filterTo = $state('');
	const filtersActive = $derived(
		filterApp !== 'all' || filterType !== 'all' || filterFrom !== '' || filterTo !== ''
	);
	const filteredLog = $derived(
		changelog.filter(
			(e) =>
				(filterApp === 'all' || e.apps.includes(filterApp)) &&
				(filterType === 'all' || e.type === filterType) &&
				(filterFrom === '' || e.iso >= filterFrom) &&
				(filterTo === '' || e.iso <= filterTo)
		)
	);
	const clearFilters = () => {
		filterApp = 'all';
		filterType = 'all';
		filterFrom = '';
		filterTo = '';
	};

	const signInWithGoogle = async (next = '/') => {
		loading = true;
		errorMessage = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
			}
		});
		if (error) {
			errorMessage = error.message;
			loading = false;
		}
	};

	const chooseSection = async (id: string) => {
		if (!claims) return;
		savingSection = true;
		errorMessage = '';
		const { error } = await supabase.from('profiles').update({ section_id: id }).eq('id', claims.sub);
		if (error) {
			errorMessage = error.message;
			savingSection = false;
			return;
		}
		changing = false;
		await invalidateAll();
		savingSection = false;
	};

	// Browser-only chrome: scroll bar, card fade-in, collapsible cards, the
	// changelog toggle, and the particle canvas. (The 2026-27 course rows carry
	// their state in markup, so no status JS is needed here.)
	onMount(() => {
		const cleanups: Array<() => void> = [];

		const scrollBar = document.getElementById('scroll-bar');
		const onScroll = () => {
			if (!scrollBar) return;
			const total = document.documentElement.scrollHeight - window.innerHeight;
			scrollBar.style.width = (total > 0 ? (window.scrollY / total) * 100 : 0) + '%';
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		cleanups.push(() => window.removeEventListener('scroll', onScroll));

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((e) => {
					if (e.isIntersecting) {
						e.target.classList.add('visible');
						observer.unobserve(e.target);
					}
				});
			},
			{ threshold: 0.08 }
		);
		const observeCard = (el: Element, i = 0) => {
			(el as HTMLElement).style.transitionDelay = i * 0.08 + 's';
			observer.observe(el);
		};
		document.querySelectorAll('.course-card').forEach(observeCard);
		cleanups.push(() => observer.disconnect());

		// Cards swapped in later (the pinned "Your class" summary, the picker
		// reappearing on "Change class") never hit the querySelectorAll above,
		// so they'd sit at opacity:0 forever without ever being observed.
		const coursesEl = document.querySelector('.courses');
		if (coursesEl) {
			const cardWatcher = new MutationObserver((mutations) => {
				for (const m of mutations) {
					m.addedNodes.forEach((node) => {
						if (!(node instanceof HTMLElement)) return;
						if (node.classList.contains('course-card')) observeCard(node);
						node.querySelectorAll?.('.course-card').forEach((el) => observeCard(el));
					});
				}
			});
			cardWatcher.observe(coursesEl, { childList: true, subtree: true });
			cleanups.push(() => cardWatcher.disconnect());
		}

		const changelogBtn = document.getElementById('changelog-btn');
		const changelogBody = document.getElementById('changelog-body');
		const toggleChangelog = () => {
			changelogBtn?.classList.toggle('open');
			changelogBody?.classList.toggle('open');
		};
		changelogBtn?.addEventListener('click', toggleChangelog);
		cleanups.push(() => changelogBtn?.removeEventListener('click', toggleChangelog));

		// NOTE: the old delegated collapse listener is gone with the legacy class
		// cards. The feed's cards own their own collapse through a real <button>
		// with aria-expanded; a document-level listener would double-toggle
		// against it, so do not reintroduce one here.

		const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement | null;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		if (canvas && !mq.matches) {
			const ctx = canvas.getContext('2d')!;
			// Pull the particle color from the design-system --green token so the
			// field tracks the theme instead of hardcoding a palette value.
			const particleColor =
				getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#8fe08a';
			let W = 0;
			let H = 0;
			const resize = () => {
				W = canvas.width = window.innerWidth;
				H = canvas.height = window.innerHeight;
			};
			resize();
			window.addEventListener('resize', resize);
			cleanups.push(() => window.removeEventListener('resize', resize));

			const rand = (a: number, b: number) => Math.random() * (b - a) + a;
			class Particle {
				x = 0;
				y = 0;
				size = 1;
				speedX = 0;
				speedY = 0;
				opacity = 0.5;
				fadeSpeed = 0.003;
				fading = false;
				constructor() {
					this.reset();
				}
				reset() {
					this.x = rand(0, W);
					this.y = rand(0, H);
					this.size = rand(0.8, 2.2);
					this.speedX = rand(-0.15, 0.15);
					this.speedY = rand(-0.25, -0.05);
					this.opacity = rand(0.2, 0.9);
					this.fadeSpeed = rand(0.002, 0.006);
					this.fading = false;
				}
				update() {
					this.x += this.speedX;
					this.y += this.speedY;
					this.opacity += this.fading ? -this.fadeSpeed * 3 : this.fadeSpeed;
					if (this.opacity >= 0.9) this.fading = true;
					if (this.y < -10 || this.opacity <= 0) this.reset();
				}
				draw() {
					ctx.save();
					ctx.globalAlpha = Math.max(0, this.opacity);
					ctx.fillStyle = particleColor;
					ctx.shadowBlur = 4;
					ctx.shadowColor = particleColor;
					ctx.beginPath();
					ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
					ctx.fill();
					ctx.restore();
				}
			}
			const particles = Array.from({ length: 120 }, () => new Particle());
			let raf = 0;
			const animate = () => {
				ctx.clearRect(0, 0, W, H);
				particles.forEach((p) => {
					p.update();
					p.draw();
				});
				raf = requestAnimationFrame(animate);
			};
			animate();
			cleanups.push(() => cancelAnimationFrame(raf));
		} else if (canvas) {
			canvas.style.display = 'none';
			document.querySelectorAll('.course-card').forEach((el) => el.classList.add('visible'));
		}

		return () => cleanups.forEach((fn) => fn());
	});
</script>

<svelte:head>
	<title>IDEA Pathway | Don Bosco Technical Institute</title>
	<meta
		name="description"
		content="The IDEA pathway at Bosco Tech - engineering design, digital fabrication, and product development for high school students in Rosemead, CA."
	/>
	<meta property="og:title" content="IDEA Pathway | Don Bosco Technical Institute" />
	<meta
		property="og:description"
		content="The IDEA pathway at Bosco Tech - engineering design, digital fabrication, and product development for high school students in Rosemead, CA."
	/>
	<meta property="og:url" content="https://ideabosco.com/" />
	<meta property="og:type" content="website" />
</svelte:head>

<div class="legacy-index surface-machined">
	<div id="scroll-bar"></div>
	<canvas id="bg-canvas"></canvas>

	<header>
		<a class="logo logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
		<div class="header-right">
			{#if mySection}
				<a class="class-chip" href="#your-class">{mySection.course} &middot; {mySection.instructor}</a>
			{/if}
			<button class="auth-link tour-link" type="button" onclick={() => homeTour?.start()}>
				Take the tour
			</button>
			<div class="auth-block">
				{#if signedIn}
					{#if isAdmin}
						<a class="auth-link" href="/dashboard">Dashboard</a>
					{/if}
					<ProfileMenu />
				{:else}
					<button
						class="auth-link signin"
						data-tour="signin"
						type="button"
						onclick={() => signInWithGoogle()}
						disabled={loading}
					>
						{loading ? '...' : 'Sign in'}
					</button>
				{/if}
			</div>
		</div>
	</header>

	{#if errorMessage}
		<p class="auth-error">{errorMessage}</p>
	{/if}

	<section class="hero" data-tour="hero">
		<div class="hero-eyebrow">Don Bosco Technical Institute - Technology Pathway</div>
		<h1>Integrated Design, Engineering <span class="accent">&amp;</span> Art</h1>
		<p class="hero-sub">
			Everything IDEA in one place — curriculum, competitive games, CAD training, and team tools.
			Sign in to pin your class and save your progress.
		</p>
		<div class="hero-meta">
			<div class="hero-stat">
				<span class="value">{courseCount}</span>
				<span class="label">Active Courses</span>
			</div>
			<div class="hero-stat">
				<span class="value" style="color:var(--gold);text-shadow:var(--glow-gold);animation-delay:0.8s">2026-27</span>
				<span class="label">School Year</span>
			</div>
			<div class="hero-stat">
				<span class="value">
					<span style="color:var(--cyan); text-shadow:var(--glow-cyan)">Mr. Pina</span>
					<span style="color:var(--dim); margin: 0 0.4rem; font-size:0.9em">/</span>
					<span style="color:var(--ice); text-shadow: 0 0 6px rgba(169,188,171,0.45), 0 0 18px rgba(169,188,171,0.2)">Mr. Cosso</span>
				</span>
				<span class="label">Instructors</span>
			</div>
		</div>
	</section>

	<div class="courses" style="margin-top:2.5rem" data-tour="classes">
		<div class="year-label">Your Classes</div>
		{#if signedIn}
			<ClassroomFeed
				feeds={classroomFeeds}
				collapsed={feedPrefs.collapsed ?? []}
				onToggle={toggleFeedCard}
				ready={data.classroomReady !== false}
				{now}
			/>
		{:else}
			<div class="course-card section-card feed-card">
				<div class="empty-state">
					<div class="empty-icon">[ ]</div>
					<div class="empty-text">
						Sign in with your Bosco Tech account to see your classes: announcements, what is due,
						and work that has been handed back.
						<button
							class="text-btn inline"
							type="button"
							onclick={() => signInWithGoogle()}
							disabled={loading}
						>
							Sign in
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<AppLauncher onRequireSignIn={(next) => signInWithGoogle(next)} />

	{#if nudge}
		<div class="nudge-card">
			<div class="nudge-left">
				<span class="nudge-eyebrow">IDEA // GAUNTLET</span>
				<div class="nudge-stats">
					<span class="nudge-stat">
						<span class="nudge-value">LVL {nudge.level.level}</span>
						<span class="nudge-label">{nudge.level.name} &middot; {nudge.level.xp} XP</span>
					</span>
					<span class="nudge-stat">
						<span class="nudge-value" class:live={nudge.streak.state === 'active'}>
							{nudge.streak.current} day{nudge.streak.current === 1 ? '' : 's'}
						</span>
						<span class="nudge-label">
							{nudge.streak.state === 'restore'
								? 'Practice today to keep your streak'
								: nudge.streak.state === 'alive'
									? 'Practice today to extend it'
									: 'Practice streak'}
						</span>
					</span>
				</div>
			</div>
			{#if nudge.nextUp}
				<a class="nudge-cta" href="{modeHref(nudge.nextUp.mode)}/{nudge.nextUp.id}">
					<span class="nudge-cta-label">
						{nudge.streak.state === 'active' ? 'Keep going' : 'Continue'} &middot;
						{modeById(nudge.nextUp.mode)?.name}
					</span>
					<span class="nudge-cta-title">{nudge.nextUp.title} &#9658;</span>
				</a>
			{:else}
				<a class="nudge-cta" href="/gauntlet">
					<span class="nudge-cta-label">All published challenges cleared</span>
					<span class="nudge-cta-title">Enter the dojo &#9658;</span>
				</a>
			{/if}
		</div>
	{/if}

	<div class="divider" id="your-class" data-tour="your-class" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Your Pathway Year</div>
		<div class="divider-line"></div>
	</div>

	<!-- Self-selection only. Class CONTENT lives in IDEA Classroom (the feed
	     above); this is the pathway-year tag that pins to the header chip and
	     that other surfaces read off `profiles.section_id`. -->
	<div class="courses">
		{#if signedIn && !isTeacher}
			{#if mySection && !changing}
				<div class="course-card picker-card">
					<div class="picker-head">
						<span>Your class</span>
						<button class="text-btn" type="button" onclick={() => (changing = true)}>Change class</button>
					</div>
					<p class="picker-note">
						{mySection.course} &middot; {mySection.title} &middot; {mySection.instructor}
						&middot; {mySection.term}
					</p>
				</div>
			{:else}
				<div class="course-card picker-card">
					<div class="picker-head">
						<span>{mySection ? 'Change your class' : 'Choose your class'}</span>
						{#if mySection}
							<button class="text-btn" type="button" onclick={() => (changing = false)}>Cancel</button>
						{/if}
					</div>
					<p class="picker-note">
						Pick your pathway year so it shows in the header. You can change it anytime.
					</p>
					{#each pickerGroups as group (group.label)}
						<div class="picker-group">
							<div class="picker-group-label">{group.label}</div>
							<div class="picker-options">
								{#each group.sections as s (s.id)}
									<button
										class="picker-option"
										class:selected={mySection?.id === s.id}
										type="button"
										disabled={savingSection}
										onclick={() => chooseSection(s.id)}
									>
										<span class="picker-course">{s.course}</span>
										<span class="picker-detail">{s.instructor} &middot; {s.term}</span>
									</button>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if signedIn && isTeacher}
			<div class="course-card teacher-note">
				{#if isAdmin}
					<p>
						You are signed in as staff. Use the <a href="/dashboard">Dashboard</a> for admin tools.
					</p>
				{:else}
					<p>
						You are signed in as staff. Admin tools are limited to site admins; contact
						{ADMIN_OWNER_EMAIL} if you need access.
					</p>
				{/if}
			</div>
		{:else}
			<div class="course-card signin-note">
				<p>
					<button class="text-btn inline" type="button" onclick={() => signInWithGoogle()} disabled={loading}>
						Sign in
					</button> to pin your pathway year and save your progress.
				</p>
			</div>
		{/if}
	</div>

	<div class="changelog-wrap">
		<div class="divider" style="padding:0;margin-bottom:1.5rem">
			<div class="divider-line"></div>
			<div class="divider-label">Portal Updates</div>
			<div class="divider-line"></div>
		</div>
		<button class="changelog-toggle" id="changelog-btn" type="button">
			<span>Changelog</span>
			<span class="changelog-arrow">&#9660;</span>
		</button>
		<div class="changelog-body" id="changelog-body">
			{#if changelog.length}
				<div class="changelog-filters">
					<select class="cl-select" bind:value={filterApp} aria-label="Filter by page or app">
						<option value="all">All pages</option>
						{#each APPS as a (a.id)}
							<option value={a.id}>{a.label}</option>
						{/each}
					</select>
					<select class="cl-select" bind:value={filterType} aria-label="Filter by change type">
						<option value="all">All types</option>
						{#each CHANGE_TYPES as t (t.id)}
							<option value={t.id}>{t.label}</option>
						{/each}
					</select>
					<label class="cl-date">
						<span>From</span>
						<input type="date" bind:value={filterFrom} />
					</label>
					<label class="cl-date">
						<span>To</span>
						<input type="date" bind:value={filterTo} />
					</label>
					{#if filtersActive}
						<button class="text-btn" type="button" onclick={clearFilters}>Clear</button>
					{/if}
					<span class="cl-count">{filteredLog.length} / {changelog.length}</span>
				</div>
				{#each filteredLog as entry (entry.sha)}
					<div class="changelog-entry">
						<span class="changelog-date">{entry.date}</span>
						<span class="changelog-note">{entry.note}</span>
						<span class="cl-tags">
							{#each entry.apps as a (a)}
								<span class="cl-tag">{appLabel(a)}</span>
							{/each}
							<span class="cl-tag cl-type cl-type-{entry.type}">{changeTypeLabel(entry.type)}</span>
						</span>
					</div>
				{:else}
					<div class="changelog-entry">
						<span class="changelog-note">No updates match these filters.</span>
					</div>
				{/each}
			{:else}
				<div class="changelog-entry">
					<span class="changelog-note">No updates recorded yet.</span>
				</div>
			{/if}
		</div>
	</div>

	<footer>
		<div class="footer-logo">IDEA - Integrated Design, Engineering &amp; Art</div>
		<div class="footer-sub">Don Bosco Technical Institute &bull; Rosemead, CA</div>
		<a class="footer-archive" href="/archive">Course archive (2025-26) &rsaquo;</a>
		<a class="footer-archive" href="/fsp/archive">Freshman Summer Program archive &rsaquo;</a>
		<div class="footer-version"><VersionBadge app="portal" /></div>
	</footer>
</div>

<!-- Outside the page wrapper so no ancestor stacking context or transform can
     re-anchor the tour's fixed-position spotlight and callout. -->
<HomeTour bind:this={homeTour} />

