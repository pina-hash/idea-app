<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { entries as changelog } from 'virtual:site-versions';
	import { APPS, CHANGE_TYPES, appLabel, changeTypeLabel } from '$lib/site-manifest';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import {
		sectionsByYear,
		nextLiveCourse,
		sectionById,
		selfSelectOptions,
		activeCourseCount,
		type Section
	} from '$lib/curriculum';

	let { data } = $props();
	let { supabase, claims, userProfile: profile } = $derived(data);

	const signedIn = $derived(!!claims);
	const isTeacher = $derived(profile?.role === 'teacher');
	const mySection = $derived(sectionById(profile?.section_id));

	const yearGroups = sectionsByYear();
	const nextLive = nextLiveCourse();
	const pickerGroups = selfSelectOptions();
	const courseCount = activeCourseCount();

	let loading = $state(false);
	let errorMessage = $state('');
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
	// changelog + how-to-submit toggles, and the particle canvas. (The 2026-27
	// course rows carry their state in markup, so no status JS is needed here.)
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

		const submitToggle = document.getElementById('submit-toggle');
		const submitWrap = document.getElementById('submit-steps-wrap');
		if (submitToggle && submitWrap) {
			const seenKey = 'idea-portal-submit-seen';
			const setSubmitState = (open: boolean) => {
				submitWrap.style.maxHeight = open ? '300px' : '0';
				submitToggle.classList.toggle('open', open);
			};
			if (localStorage.getItem(seenKey)) setSubmitState(false);
			else {
				setSubmitState(true);
				setTimeout(() => localStorage.setItem(seenKey, '1'), 2000);
			}
			const onSubmitToggle = () => setSubmitState(!submitToggle.classList.contains('open'));
			submitToggle.addEventListener('click', onSubmitToggle);
			cleanups.push(() => submitToggle.removeEventListener('click', onSubmitToggle));
		}

		// Delegated (not per-node) so it still works on cards that mount later,
		// like the pinned "Your class" card that only appears once a signed-in
		// student picks a section.
		const onCollapsibleClick = (e: MouseEvent) => {
			const header = (e.target as HTMLElement).closest('.course-header.collapsible');
			header?.closest('.course-card')?.classList.toggle('collapsed');
		};
		document.addEventListener('click', onCollapsibleClick);
		cleanups.push(() => document.removeEventListener('click', onCollapsibleClick));

		const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement | null;
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		if (canvas && !mq.matches) {
			const ctx = canvas.getContext('2d')!;
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
					ctx.fillStyle = '#00FF41';
					ctx.shadowBlur = 4;
					ctx.shadowColor = '#00FF41';
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

{#snippet sectionCard(s: Section, pinned: boolean)}
	<div class="course-card section-card" class:pinned>
		<div class="course-header collapsible">
			<div class="course-header-left">
				<div class="course-id">{s.course}</div>
				<div class="course-updated">{s.title}</div>
			</div>
			<div class="course-meta">
				{#if pinned}<span class="course-badge badge-grade">Your class</span>{/if}
				<span class="course-badge badge-block">{s.yearLabel}</span>
				<span class="section-meta">{s.instructor} &middot; {s.term}</span>
				{#if s.status === 'live'}
					<span class="assignment-status status-live">Live</span>
				{/if}
				{#if s.isNew}<span class="badge-new">New</span>{/if}
			</div>
			<span class="course-collapse-arrow">&#9662;</span>
		</div>
		<div class="assignment-list">
			{#if s.assignments && s.assignments.length}
				{#each s.assignments as a (a.slug)}
					<a class="assignment-item linked" href="/assignments/{a.slug}">
						<div class="assignment-left">
							<div class="assignment-dot dot-live"></div>
							<div class="assignment-name">{a.title}</div>
						</div>
						<div class="assignment-right">
							<span class="assignment-status status-live">Open</span>
						</div>
					</a>
				{/each}
			{:else}
				<div class="empty-state">
					<div class="empty-icon">[ ]</div>
					<div class="empty-text">
						{#if s.status === 'live'}
							{s.note ?? 'Live now.'}
						{:else}
							Assignments will appear here when posted.
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/snippet}

<div class="legacy-index">
	<div id="scroll-bar"></div>
	<canvas id="bg-canvas"></canvas>

	<header>
		<a class="logo" href="/">IDEA</a>
		<div class="header-right">
			{#if mySection}
				<a class="class-chip" href="#your-class">{mySection.course} &middot; {mySection.instructor}</a>
			{/if}
			<div class="auth-block">
				{#if signedIn}
					{#if isTeacher}
						<a class="auth-link" href="/dashboard">Dashboard</a>
					{/if}
					<ProfileMenu />
				{:else}
					<button class="auth-link signin" type="button" onclick={() => signInWithGoogle()} disabled={loading}>
						{loading ? '...' : 'Sign in'}
					</button>
				{/if}
			</div>
		</div>
	</header>

	{#if errorMessage}
		<p class="auth-error">{errorMessage}</p>
	{/if}

	<section class="hero">
		<div class="hero-eyebrow">Don Bosco Technical Institute - Technology Pathway</div>
		<h1>Integrated Design, Engineering <span class="accent">&amp;</span> Art</h1>
		<p class="hero-sub">
			The IDEA pathway portal. Browse the 2026-27 curriculum below. Sign in to pin your class and
			save your progress.
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
					<span style="color:var(--ice); text-shadow: 0 0 10px rgba(136,221,255,0.8), 0 0 28px rgba(136,221,255,0.3)">Mr. Cosso</span>
				</span>
				<span class="label">Instructors</span>
			</div>
		</div>
	</section>

	{#if nextLive}
		<div class="promo-callout nextlive">
			<div class="promo-left">
				<div class="promo-icon">&#9650;</div>
				<div>
					<div class="promo-title">Next Live Course &middot; {nextLive.course}</div>
					<div class="promo-sub">{nextLive.title}. {nextLive.note ?? ''}</div>
				</div>
			</div>
			<div class="promo-cta">{nextLive.term}</div>
		</div>
	{/if}

	<a class="promo-callout" href="/coins/index.html">
		<div class="promo-left">
			<div class="promo-icon">i¢</div>
			<div>
				<div class="promo-title">IDEA Coin Leaderboard</div>
				<div class="promo-sub">Live balances, transaction log, and rankings across all sections.</div>
			</div>
		</div>
		<div class="promo-cta">View Live &#9658;</div>
	</a>

	<a class="promo-callout" href="/vanguard/">
		<div class="promo-left">
			<div class="promo-icon">&#9658;</div>
			<div>
				<div class="promo-title">IDEA // VANGUARD</div>
				<div class="promo-sub">
					Top-down arcade shooter. Clear the sectors, chain your combos, and chase the high score.
				</div>
			</div>
		</div>
		<div class="promo-cta">Play &#9658;</div>
	</a>

	<a
		class="promo-callout"
		href="/gauntlet"
		onclick={(e) => {
			if (!signedIn) {
				e.preventDefault();
				signInWithGoogle('/gauntlet');
			}
		}}
	>
		<div class="promo-left">
			<div class="promo-icon">&#9678;</div>
			<div>
				<div class="promo-title">IDEA // GAUNTLET</div>
				<div class="promo-sub">
					CAD skills dojo. Read drawings, model against the clock, and climb the boards.
					{signedIn ? '' : 'Sign in to enter.'}
				</div>
			</div>
		</div>
		<div class="promo-cta">{signedIn ? 'Enter' : 'Sign in'} &#9658;</div>
	</a>

	<div class="submit-panel">
		<div class="submit-inner">
			<button id="submit-toggle" type="button">
				<span>HOW TO SUBMIT</span>
				<span id="submit-chevron">v</span>
			</button>
			<div id="submit-steps-wrap" style="overflow:hidden; transition: max-height 0.35s ease;">
				<div class="submit-label">How to Submit</div>
				<div class="submit-steps">
					<div class="submit-step">
						<div class="step-num">01</div>
						<div class="step-text">
							Open your class assignment. It opens directly in your browser -
							<strong>no download needed.</strong>
						</div>
					</div>
					<div class="submit-step">
						<div class="step-num">02</div>
						<div class="step-text">
							Complete all sections. Progress <strong>saves automatically</strong> every 30 seconds.
							Use the Save button to save manually.
						</div>
					</div>
					<div class="submit-step">
						<div class="step-num">03</div>
						<div class="step-text">
							When finished, click <strong>Export HTML</strong> and upload the file directly to
							Google Classroom. Do not submit a PDF.
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="divider" id="your-class" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Courses &amp; Assignments</div>
		<div class="divider-line"></div>
	</div>

	<div class="courses">
		{#if signedIn && !isTeacher}
			{#if mySection && !changing}
				<div class="yourclass-head">
					<span class="yourclass-eyebrow">Your class</span>
					<button class="text-btn" type="button" onclick={() => (changing = true)}>Change class</button>
				</div>
				{@render sectionCard(mySection, true)}
			{:else}
				<div class="course-card picker-card">
					<div class="picker-head">
						<span>{mySection ? 'Change your class' : 'Choose your class'}</span>
						{#if mySection}
							<button class="text-btn" type="button" onclick={() => (changing = false)}>Cancel</button>
						{/if}
					</div>
					<p class="picker-note">Pick your section so it pins to the top. You can change it anytime.</p>
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
				<p>You are signed in as a teacher. Use the <a href="/dashboard">Dashboard</a> for teacher tools.</p>
			</div>
		{:else}
			<div class="course-card signin-note">
				<p>
					<button class="text-btn inline" type="button" onclick={() => signInWithGoogle()} disabled={loading}>
						Sign in
					</button> to pin your class to the top and save your progress.
				</p>
			</div>
		{/if}

		{#each yearGroups as group (group.year)}
			{#if group.sections.length}
				<div class="year-label">{group.yearLabel}</div>
				{#each group.sections as s (s.id)}
					{@render sectionCard(s, false)}
				{/each}
			{/if}
		{/each}
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
		<div class="footer-version"><VersionBadge app="portal" /></div>
	</footer>
</div>

