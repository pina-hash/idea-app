<script lang="ts">
	import { onMount } from 'svelte';
	import { total as changelogTotal } from 'virtual:site-versions';
	import { census as codeCensus } from 'virtual:site-code';
	import { APPS, CHANGE_TYPES, appLabel, changeTypeLabel } from '$lib/site-manifest';
	import { groupEntriesByMonth, type VersionEntry } from '$lib/site-versions';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AppLauncher from '$lib/AppLauncher.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import Pending from '$lib/Pending.svelte';
	import CodeCounter from '$lib/CodeCounter.svelte';
	import HomeTour from '$lib/tour/HomeTour.svelte';
	import HomeTourOffer from '$lib/tour/HomeTourOffer.svelte';
	import ClassroomFeed from '$lib/classroom/ClassroomFeed.svelte';
	import TodoDoor from '$lib/classroom/TodoDoor.svelte';
	import { buildTodo, todoSections, todoSummary } from '$lib/classroom/todo';
	import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
	import {
		buildFeed,
		readFeedPrefs,
		toggleCollapsed,
		type ClassroomFeedPrefs,
		type FeedSubmission
	} from '$lib/classroom/feed';
	import { sectionTitle, type ClassroomItem, type ClassroomSection } from '$lib/classroom/classroom';
	import { activeCourseCount } from '$lib/curriculum';
	import { supabaseProfileIo, writeProfileNamespace } from '$lib/preferences/profile-io';

	let { data } = $props();
	let { supabase, claims, userProfile: profile } = $derived(data);

	const signedIn = $derived(!!claims);
	// Two different questions, deliberately kept apart since 0067:
	// isTeacher = staff rather than a student (drives which homepage a person
	// gets), isAdmin = may actually use the privileged tools.
	const isTeacher = $derived(profile?.role === 'teacher');
	const isAdmin = $derived(data.isAdmin === true);

	const courseCount = activeCourseCount();

	// Header class chip. It used to name the student's SELF-SELECTED pathway year
	// (profiles.section_id through curriculum.ts); it names their REAL class now,
	// read from the same sections the classroom feed below already loaded -- no
	// extra query and no join. One class names itself; several collapse to a
	// count, because the chip is one line and picking one of them would be a
	// guess. Staff get no chip: for an admin this list is every section in the
	// school, so "your class" would be a lie.
	const myClasses = $derived((data.feedSections ?? []) as ClassroomSection[]);
	const classChip = $derived(
		signedIn && !isTeacher && myClasses.length
			? myClasses.length === 1
				? sectionTitle(myClasses[0])
				: `${myClasses.length} classes`
			: null
	);

	// The classroom feed: one card per class, ranked by what each one is asking
	// of you right now. RLS already decided what came back; buildFeed only ranks
	// it, and `isAdmin` mirrors classroom_manages_section so the card asks the
	// teacher's question rather than the student's.
	// THE LOADER'S ONE CLOCK READ (ledger 0297), so the server's render and the
	// hydrated page rank and word every deadline against the same instant. A
	// load with no classroom read (signed out, a harness) carries none, and only
	// then does the page read the clock itself.
	const fallbackNow = new Date();
	const clock = $derived(data.feedClock ?? null);
	const now = $derived(clock ? new Date(clock.now) : fallbackNow);
	const classroomFeeds = $derived(
		buildFeed({
			sections: (data.feedSections ?? []) as ClassroomSection[],
			items: (data.feedItems ?? []) as ClassroomItem[],
			submissions: (data.feedSubmissions ?? []) as FeedSubmission[],
			myEmail: (claims?.email as string | undefined) ?? '',
			isAdmin,
			managerEmails: (data.feedManagerEmails ?? {}) as Record<string, string[]>,
			now
		})
	);

	/**
	 * DOES THIS VIEWER MANAGE ANY CLASS -- which is what decides whether Apps or
	 * Your Classes comes first.
	 *
	 * WHY THE ORDER IS NOT FIXED. The feed is the one thing on this page nothing
	 * else does: for a student it is a deep link into the exact item that is due,
	 * so it earns the top. For an instructor it is a roster of what THEY posted,
	 * which they can also reach from /classroom, and it is much taller -- four
	 * classes push the Apps section most of a screen further down than one does.
	 * So a manager gets the launcher first and the feed under it. (A student's
	 * order is decided separately, below.)
	 *
	 * DERIVED FROM WHAT THE PAGE ALREADY HAS. `buildFeed` already computes
	 * `manages` per section (teacher of record, or admin -- mirroring
	 * classroom_manages_section), so this asks the SAME question through the same
	 * implementation rather than re-deriving it from roles or emails here. No
	 * extra load, no second rule to keep in step.
	 */
	const managesAnySection = $derived(classroomFeeds.some((f) => f.manages));

	/**
	 * ARE THERE ANY CLASSES TO PUT FIRST -- the other half of the same decision
	 * for STAFF.
	 *
	 * `buildFeed` returns nothing for a signed-out visitor, for anyone whose
	 * classroom read failed, and for a teacher between terms -- and in every one
	 * of those cases `ClassroomFeed` still renders a card, so a 230px empty
	 * state ("You are not in any classes yet") would sit above the launcher with
	 * nothing in it to open. MEASURED at 375px on `/dev/home-order`, first app
	 * card from the top of the document: 900px (1.13 screens) with an empty
	 * feed, against 1409px (1.76 screens) with one real class.
	 */
	const hasClasses = $derived(classroomFeeds.length > 0);

	/**
	 * A STUDENT GETS THE APPS FIRST, ALWAYS. This is Mr. Pina's call (ledger
	 * 0117, report 21: "for students, the apps should come before their classes
	 * on the home page"), and it is the SECOND time he has asked for it.
	 *
	 * THE PARAGRAPH THIS REPLACES REFUSED IT, AND THE MEASUREMENT IT CITED IS
	 * STILL TRUE: a student's class block grows 616px per class at 375px (1.76 /
	 * 2.53 / 3.30 / 4.07 screens at one through four classes), so putting Apps
	 * first does not remove that scroll, it moves it off the launcher and onto
	 * the feed. That was the argument for keeping the feed on top, and it was
	 * an argument about which of two things a student should have to scroll
	 * past. The owner has decided the launcher is the one that stays in reach,
	 * which is a product decision and not a measurement, so the measurement is
	 * kept here as the cost of the decision rather than as a reason to undo it.
	 * Bounding the height of a class card is still the fix for the scroll
	 * itself, and it still belongs to `ClassroomFeed`, not here.
	 *
	 * STUDENTS ONLY. Staff ordering is not this report: a manager already gets
	 * the launcher first (their feed is a roster of what THEY posted, reachable
	 * from /classroom too, and much taller), and staff who manage nothing keep
	 * the content-earned rule below. The student key is the ROLE and not the
	 * absence of `manages`, because a `visitor` account is neither.
	 */
	const isStudent = $derived(signedIn && profile?.role === 'student');

	/** Apps first for a student, for a manager, or when there is no class to put above them. */
	const appsFirst = $derived(isStudent || managesAnySection || !hasClasses);

	/**
	 * WHAT A STUDENT OWES, ABOVE THE FOLD (ledger 0297). Apps come first for a
	 * student (report 21, above), which leaves the class cards below the first
	 * screen: measured at 1366x768 the first card starts at y=917. So a
	 * one-line door with the to-do's own counts ("2 missing, 3 due this week")
	 * sits between the banner and the apps, where it is on screen on arrival,
	 * and the order Mr. Pina chose does not move. The rows are `buildTodo`'s
	 * over the same read the feed ranks, so the door and the to-do page cannot
	 * name different numbers. Only for a signed-in viewer with a class they do
	 * not teach; a teacher's home is unchanged.
	 */
	const todoRows = $derived(
		signedIn && clock
			? buildTodo({
					sections: (data.feedSections ?? []) as ClassroomSection[],
					items: (data.feedItems ?? []) as ClassroomItem[],
					submissions: (data.feedSubmissions ?? []) as FeedSubmission[],
					checkIns: (data.feedCheckIns ?? []) as ClassCheckIn[],
					myEmail: (claims?.email as string | undefined) ?? '',
					isAdmin,
					clock
				})
			: []
	);
	const hasStudentClasses = $derived(
		signedIn &&
			!isTeacher &&
			todoSections(
				(data.feedSections ?? []) as ClassroomSection[],
				(claims?.email as string | undefined) ?? '',
				isAdmin
			).length > 0
	);
	const todoTotal = $derived(clock ? todoSummary(todoRows, clock.today) : null);

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
		// READ THEN MERGE (ledger 0297): into the row as it stands now, so a pin
		// in the launcher a moment later cannot erase this fold, nor this fold
		// the pin.
		await writeProfileNamespace(supabaseProfileIo(supabase, claims.sub), 'classroomFeed', next);
	};

	let loading = $state(false);
	let errorMessage = $state('');
	// The first-time orientation tour (auto-launch lives inside HomeTour); the
	// header's "Take the tour" control replays it manually at any time.
	let homeTour: ReturnType<typeof HomeTour> | undefined = $state();

	/**
	 * THE COMMIT LOG ARRIVES WHEN THE PANEL IS OPENED, NEVER WITH THE PAGE.
	 *
	 * This is the public, signed-out landing page, and the log is the single
	 * largest thing the site could put on it: 1,433 records, measured at
	 * 247,850 bytes (54,894 gzipped) in a real build, growing every time the
	 * classroom's GitHub export commits on a teacher pressing save. Worse, it
	 * did not stay here -- importing it beside `deploy` put it in a shared
	 * Rollup chunk that the root layout and the client entry both pull, so
	 * every route in the site paid for it. See vite.config.ts for that
	 * measurement and for why a second virtual module is the only fix.
	 *
	 * `changelogTotal` IS THE COUNT AND STAYS EAGER, so the "<filtered> /
	 * <total>" readout and the has-any-history branch below are correct before
	 * a single entry has been fetched. Without it an unopened panel would say
	 * "No updates recorded yet." on a site with 1,433 of them.
	 */
	let changelog = $state<VersionEntry[]>([]);
	let changelogLoading = $state(false);
	/* Plain, NOT `$state`: the "already started" latch is written on the same
	   path that writes `changelog`, and reading it reactively there would make
	   this handler depend on a value it sets. */
	let changelogStarted = false;

	async function loadChangelog() {
		if (changelogStarted) return;
		changelogStarted = true;
		changelogLoading = true;
		try {
			const mod = await import('virtual:site-changelog');
			changelog = mod.entries;
		} finally {
			changelogLoading = false;
		}
	}

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

	/**
	 * The filtered log cut into months for the headings. The grouping itself is
	 * `groupEntriesByMonth` in $lib/site-versions -- pure list arithmetic, moved
	 * there so a test can reach it, after a single-pass version of it opened a
	 * second group for an already-seen month and Svelte's duplicate-key error
	 * took this page blank. It groups, it never CAPS: the filters above still run
	 * over the whole array and `filteredLog.length` still counts all of it, so
	 * there is no slice and no pagination anywhere in this panel.
	 */
	const logMonths = $derived(groupEntriesByMonth(filteredLog));

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

	// Browser-only chrome: scroll bar, card fade-in, the changelog toggle, and
	// the particle canvas.
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
			/* Fetch on the first open only; `loadChangelog` latches. Opening is
			   the one signal that the log is about to be read, and the panel
			   starts closed on every load. */
			void loadChangelog();
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
			const readGreen = () =>
				getComputedStyle(document.documentElement).getPropertyValue('--green').trim() || '#8fe08a';
			let particleColor = readGreen();
			/* AND RE-READ IT WHEN THE THEME CHANGES (ledger 0297, package F1b). It
			   was read once at mount, so a theme picked from the profile menu left
			   the field in the old theme's green until a reload -- a page loaded
			   in Space White and switched back to IDEA drew Space White's dark ink
			   on the dark page. The theme is an attribute on <html>, and that
			   attribute is the one thing to watch. */
			const themeWatch = new MutationObserver(() => {
				particleColor = readGreen();
			});
			themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
			cleanups.push(() => themeWatch.disconnect());
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
				/* A theme that switches the field off (Space White, Matrix) takes the
				   canvas's box away in CSS; drawing into a canvas with no box is
				   work nobody sees, so the frame is skipped until it has one again. */
				if (canvas.offsetWidth > 0) {
					ctx.clearRect(0, 0, W, H);
					particles.forEach((p) => {
						p.update();
						p.draw();
					});
				}
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
		<!--
			THE LOGO AND THE CODE READOUT ARE ONE GROUP, AND THAT IS A MEASURED
			DECISION RATHER THAN A TIDY ONE.

			THE READOUT: report 12 (Mr. Pina, 2026-09-11), home banner only. It is
			here and on no other surface -- the claim it makes is about this
			repository as a whole, which is a thing to say once on the front door.
			It renders NOTHING when `virtual:site-code` answers `complete: false`
			(a checkout with no tracked file list), because a code count that can
			silently come out low is worse than no count, which is the same rule
			the version substrate applies to a shallow clone.

			THE GROUP: a new header child must not grow the banner, and put in
			`.header-right` it did. Measured at 375px on this very page, where the
			header is `flex-wrap: wrap`: the actions row needs 316.6px of the
			343px available, so a 116px chip beside them pushed `.auth-block` onto
			a third row and took the header from 125.5px to 158.7px. On the
			logo's row there is 239px spare and the chip is shorter than the
			emblem, so the row's height does not move at all. At 1440 the header
			is a single 64px line either way. The chip's own box is the same font,
			size, padding and border as the controls opposite it, and it reaches
			44px through `.tap-reach-44` -- the hit area grows, the layout does
			not.
		-->
		<div class="header-left">
			<a class="logo logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width="clamp(72px, 19vw, 104px)" /></a>
			<CodeCounter census={codeCensus} />
		</div>
		<div class="header-right">
			{#if classChip}
				<a class="class-chip" href="/classroom">{classChip}</a>
			{/if}
			<button class="auth-link tour-link" type="button" data-tour="tour-trigger" onclick={() => homeTour?.start()}>
				Take the tour
			</button>
			<div class="auth-block">
				{#if signedIn}
					{#if isAdmin}
						<a class="auth-link" href="/dashboard">Admin</a>
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

	<!-- The home tour, offered once to anybody who finished an older one (ledger
	     0298). In the flow under the header; the tour itself mounts at the end. -->
	<HomeTourOffer onstart={() => homeTour?.start()} />

	{#if errorMessage}
		<p class="auth-error">{errorMessage}</p>
	{/if}

	<!--
		THE HERO IS THE FRONT DOOR FOR A VISITOR AND A STATUS LINE FOR A STUDENT
		(ledger 0297, package F1b). Signed out it is the landing page: the
		school, the programme, what costs nothing and what signing in adds. Signed
		in, the same 540px told a student to "Sign in for your classes" and put
		Your Classes at y=835 on a 1366x768 laptop (below the fold) and y=1340 on
		a phone, measured on /dev/home-order. So a signed-in visitor gets the
		programme's name and the three stats as ONE compact row, with the eyebrow
		and the sign-in pitch left out rather than hidden, and the stats keep
		their markup so the Active Courses tile is still the same element
		`tests/home-order-and-accent.test.ts` reads for every viewer.

		THE STAT VALUES TAKE CLASSES, NOT INLINE STYLES. They carried their own
		`color` and a literal ice glow inline, which no theme could reach; the
		classes read the semantic tokens and the page's glow tokens, which Space
		White flattens.
	-->
	<section class="hero" class:compact={signedIn} data-tour="hero">
		{#if !signedIn}
			<div class="hero-eyebrow">Don Bosco Technical Institute - Technology Pathway</div>
		{/if}
		<h1>Integrated Design, Engineering <span class="accent">&amp;</span> Art</h1>
		{#if !signedIn}
			<!--
				ADDRESSED TO ANYONE AT THE SCHOOL, WHICH IS REPORT 13 (Mr. Pina,
				2026-09-11): the subtitle "needs to be updated to properly reflect
				the latest state of the website as a whole and not just for IDEA
				students but for anyone who visits, the whole school".

				The text it replaces -- "Your classes, your notebook, your coin
				balance, and the training and games that go with them. Sign in and
				everything saves." -- was authored in 9e23c961 on 2026-08-15 and was
				every-clause about a signed-in IDEA student. FOUR launcher cards omit
				`requiresAuth` and are reachable signed out (IDEA Maps, the IDEA Coin
				Ledger, VANGUARD and Tournaments; see $lib/portal-apps.ts, whose maps
				entry states the reason), so a visitor who read the old line and did
				not sign in was told nothing about the four things already open to
				them.

				Three sentences, one claim each, in the order a stranger needs them:
				what this is, what costs nothing, what signing in adds. The public
				surfaces are named rather than gestured at, because "some things are
				public" is not something anyone can act on. It is the VISITOR'S
				sentence, so a signed-in reader, who is past its last clause, does
				not get it.
			-->
			<p class="hero-sub">
				Built for the whole school, not just the IDEA pathway. IDEA Maps, tournaments, the coin
				leaderboard, and VANGUARD are open to anyone. Sign in for your classes, notebook, and coin
				balance.
			</p>
		{/if}
		<div class="hero-meta">
			<div class="hero-stat">
				<span class="value">{courseCount}</span>
				<span class="label">Active Courses</span>
			</div>
			<div class="hero-stat">
				<span class="value v-year">2026-27</span>
				<span class="label">School Year</span>
			</div>
			<div class="hero-stat">
				<span class="value v-staff">
					<span class="v-staff-a">Mr. Pina</span>
					<span class="v-staff-sep">/</span>
					<span class="v-staff-b">Mr. Cosso</span>
				</span>
				<span class="label">Instructors</span>
			</div>
		</div>
	</section>

	<!--
		TWO BLOCKS, ONE DEFINITION EACH, RENDERED IN ONE OF TWO ORDERS.

		Snippets rather than a CSS `order` on a flex parent: `order` moves the
		paint and leaves the DOM alone, so the tab order and the screen-reader
		reading order would disagree with what is on screen. And snippets rather
		than writing each block twice inside an `{#if}`, because two copies of the
		feed is two places to fix it.
	-->
	{#snippet yourClasses()}
		<div class="courses" style="margin-top:2.5rem" data-tour="classes">
			<div class="year-label">Your Classes</div>
			{#if signedIn}
				<ClassroomFeed
					feeds={classroomFeeds}
					collapsed={feedPrefs.collapsed ?? []}
					onToggle={toggleFeedCard}
					ready={data.classroomReady !== false}
					{now}
					todoHref={hasStudentClasses ? '/classroom/todo' : null}
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
	{/snippet}

	{#snippet portalApps()}
		<AppLauncher onRequireSignIn={(next) => signInWithGoogle(next)} />
	{/snippet}

	{#if hasStudentClasses && todoTotal}
		<div class="todo-strip-wrap">
			<TodoDoor href="/classroom/todo" summary={todoTotal} />
		</div>
	{/if}

	{#if appsFirst}
		{@render portalApps()}
		{@render yourClasses()}
	{:else}
		{@render yourClasses()}
		{@render portalApps()}
	{/if}

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
			{#if changelogLoading}
				<Pending label="Loading the changelog" />
			{:else if changelogTotal}
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
					<span class="cl-count">{filteredLog.length} / {changelogTotal}</span>
				</div>
				<!--
					GUARDED ON THE LOADED LOG, NOT ON THE FILTERS. An `{:else}` on the
					each fires for "nothing matched" AND for "nothing fetched yet",
					and the second one is not a filter result: before the panel is
					opened `changelog` is legitimately empty, and reporting that as
					"No updates match these filters" blames a filter nobody set.
				-->
				{#if changelog.length}
					{#each logMonths as month (month.key)}
						<div class="cl-month">{month.label}</div>
						{#each month.entries as entry (entry.sha)}
							<div class="changelog-entry">
								<span class="changelog-date">{entry.date}</span>
								<span class="changelog-note">{entry.note}</span>
								<span class="cl-tags">
									{#each entry.apps as a (a)}
										<span class="cl-tag">{appLabel(a)}</span>
									{/each}
									<span class="cl-tag cl-type cl-type-{entry.type}"
										>{changeTypeLabel(entry.type)}</span
									>
								</span>
							</div>
						{/each}
					{:else}
						<div class="changelog-entry">
							<span class="changelog-note">No updates match these filters.</span>
						</div>
					{/each}
				{/if}
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


<style>
	/* The to-do door (ledger 0297) sits in the launcher's own column: the same
	   1100px measure and the same gutters, so its edges line up with the app
	   cards directly under it. Above the stacking layer the page's canvas sits
	   on, like the launcher and the class cards. */
	.todo-strip-wrap {
		position: relative;
		z-index: 1;
		max-width: 1100px;
		margin: 0 auto 1.5rem;
		padding: 0 2rem;
	}
	@media (max-width: 768px) {
		.todo-strip-wrap {
			padding: 0 1rem;
		}
	}
</style>
