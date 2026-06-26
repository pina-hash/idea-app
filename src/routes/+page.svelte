<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data } = $props();
	let { supabase, claims } = $derived(data);

	let loading = $state(false);
	let errorMessage = $state('');

	const accountLabel = $derived((claims?.email as string | undefined) ?? 'Account');

	const signInWithGoogle = async () => {
		loading = true;
		errorMessage = '';
		const { error } = await supabase.auth.signInWithOAuth({
			provider: 'google',
			options: {
				// Optional sign-in from the landing page returns here, not /dashboard.
				redirectTo: `${window.location.origin}/auth/callback?next=/`
			}
		});
		if (error) {
			errorMessage = error.message;
			loading = false;
		}
	};

	const signOut = async () => {
		await supabase.auth.signOut();
		await invalidateAll();
	};

	// All landing-page interactivity is attached here (browser only): scroll
	// progress, card fade-in, live assignment statuses, NEW badges, point totals,
	// the changelog + "how to submit" toggles, collapsible course cards, and the
	// particle canvas. Ported from the original static index.html.
	onMount(() => {
		const cleanups: Array<() => void> = [];

		// Scroll progress bar
		const scrollBar = document.getElementById('scroll-bar');
		const onScroll = () => {
			if (!scrollBar) return;
			const total = document.documentElement.scrollHeight - window.innerHeight;
			scrollBar.style.width = (total > 0 ? (window.scrollY / total) * 100 : 0) + '%';
		};
		window.addEventListener('scroll', onScroll, { passive: true });
		cleanups.push(() => window.removeEventListener('scroll', onScroll));

		// Fade in cards
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
		document.querySelectorAll('.course-card').forEach((el, i) => {
			(el as HTMLElement).style.transitionDelay = i * 0.12 + 's';
			observer.observe(el);
		});
		cleanups.push(() => observer.disconnect());

		// Weekday counter: Mon-Fri days from `from` (inclusive) to `to` (exclusive)
		function countWeekdays(from: Date, to: Date) {
			let count = 0;
			const d = new Date(from);
			while (d < to) {
				const day = d.getDay();
				if (day !== 0 && day !== 6) count++;
				d.setDate(d.getDate() + 1);
			}
			return count;
		}

		// Dynamic statuses, NEW badges, and point totals
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

		document.querySelectorAll<HTMLElement>('.assignment-item').forEach((item) => {
			const dot = item.querySelector('.assignment-dot');
			const statusLabel = item.querySelector('.assignment-status');
			const dueLabel = item.querySelector('.assignment-due');
			const right = item.querySelector('.assignment-right');

			let isPastDue = false;
			if (item.dataset.due) {
				const [y, m, d] = item.dataset.due.split('-');
				const dueDate = new Date(Number(y), Number(m) - 1, Number(d));
				if (today > dueDate) {
					isPastDue = true;
					if (dot) dot.className = 'assignment-dot dot-soon';
					if (statusLabel) {
						statusLabel.className = 'assignment-status status-soon';
						statusLabel.textContent = 'Past Due';
					}
					if (dueLabel) dueLabel.classList.add('past');
					item.style.opacity = '0.45';
				} else {
					if (dot) dot.className = 'assignment-dot dot-live';
					if (statusLabel) {
						statusLabel.className = 'assignment-status status-live';
						statusLabel.textContent = 'Live';
					}
					if (dueLabel) dueLabel.classList.remove('past');
					item.style.opacity = '1';
				}
			}

			if (item.dataset.posted) {
				const [y, m, d] = item.dataset.posted.split('-');
				const postedDate = new Date(Number(y), Number(m) - 1, Number(d));
				const weekdaysSince = countWeekdays(postedDate, today);
				if (weekdaysSince <= 3 && !isPastDue) {
					const badge = document.createElement('span');
					badge.className = 'badge-new';
					badge.textContent = 'New';
					item.querySelector('.assignment-left')?.appendChild(badge);
				}
			}

			if (item.dataset.points && right && statusLabel) {
				const pts = document.createElement('span');
				pts.className = 'assignment-pts';
				pts.textContent = item.dataset.points + ' pts';
				right.insertBefore(pts, statusLabel);
			}
		});

		// Assignment click handlers (open the now-public /assignments/<slug> route)
		document.querySelectorAll<HTMLElement>('.assignment-item.linked').forEach((item) => {
			const handler = () => {
				if (item.dataset.url) window.open(item.dataset.url, '_blank');
			};
			item.addEventListener('click', handler);
			cleanups.push(() => item.removeEventListener('click', handler));
		});

		// Changelog toggle
		const changelogBtn = document.getElementById('changelog-btn');
		const changelogBody = document.getElementById('changelog-body');
		const toggleChangelog = () => {
			changelogBtn?.classList.toggle('open');
			changelogBody?.classList.toggle('open');
		};
		changelogBtn?.addEventListener('click', toggleChangelog);
		cleanups.push(() => changelogBtn?.removeEventListener('click', toggleChangelog));

		// Submit instructions collapsible (collapses after first visit)
		const submitToggle = document.getElementById('submit-toggle');
		const submitWrap = document.getElementById('submit-steps-wrap');
		if (submitToggle && submitWrap) {
			const seenKey = 'idea-portal-submit-seen';
			const setSubmitState = (open: boolean) => {
				submitWrap.style.maxHeight = open ? '300px' : '0';
				submitToggle.classList.toggle('open', open);
			};
			if (localStorage.getItem(seenKey)) {
				setSubmitState(false);
			} else {
				setSubmitState(true);
				setTimeout(() => localStorage.setItem(seenKey, '1'), 2000);
			}
			const onSubmitToggle = () => setSubmitState(!submitToggle.classList.contains('open'));
			submitToggle.addEventListener('click', onSubmitToggle);
			cleanups.push(() => submitToggle.removeEventListener('click', onSubmitToggle));
		}

		// Collapsible course cards — inject arrow and wire click
		document.querySelectorAll('.course-header').forEach((header) => {
			const arrow = document.createElement('span');
			arrow.className = 'course-collapse-arrow';
			arrow.textContent = '▾';
			header.appendChild(arrow);
			const onToggle = () => header.closest('.course-card')?.classList.toggle('collapsed');
			header.addEventListener('click', onToggle);
			cleanups.push(() => header.removeEventListener('click', onToggle));
		});

		// Canvas particles
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

<div class="legacy-index">
	<div id="scroll-bar"></div>
	<canvas id="bg-canvas"></canvas>

	<header>
		<a class="logo" href="/">IDEA<span>.</span></a>
		<div class="header-right">
			<nav>
				<a href="#idea-113">IDEA-113</a>
				<a href="#idea-208">IDEA-208</a>
				<a href="#idea-303">IDEA-303</a>
				<a href="#idea-403">IDEA-403</a>
			</nav>
			<div class="header-year">2025 - 2026</div>
			<div class="auth-block">
				{#if claims}
					<a class="auth-link" href="/dashboard" title={accountLabel}>Dashboard</a>
					<button class="auth-link" type="button" onclick={signOut}>Sign out</button>
				{:else}
					<button class="auth-link signin" type="button" onclick={signInWithGoogle} disabled={loading}>
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
		<h1>Integrated Design,<br />Engineering <span class="accent">&amp;</span> Art</h1>
		<p class="hero-sub">
			Assignment portal for the IDEA pathway. Click an assignment to open it, complete your work,
			export a PDF, and submit to Google Classroom.
		</p>
		<div class="hero-meta">
			<div class="hero-stat">
				<span class="value">4</span>
				<span class="label">Active Courses</span>
			</div>
			<div class="hero-stat">
				<span class="value" style="color:var(--gold);text-shadow:var(--glow-gold);animation-delay:0.8s">1.5</span>
				<span class="label">Hours / Day</span>
			</div>
			<div class="hero-stat">
				<span class="value">
					<span style="color:var(--cyan); text-shadow:var(--glow-cyan)">Mr. Pina</span>
					<span style="color:var(--dim); margin: 0 0.4rem; font-size:0.9em">/</span>
					<span style="color:var(--ice); text-shadow: 0 0 10px rgba(136,221,255,0.8), 0 0 28px rgba(136,221,255,0.3)">Mr. C</span>
				</span>
				<span class="label">Instructors</span>
			</div>
		</div>
	</section>

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
							Click the assignment link below. It opens directly in your browser -
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
							When finished, click <strong>Export HTML</strong> and upload the HTML file directly to
							Google Classroom. Do not submit a PDF.
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="divider" style="margin-top:2.5rem">
		<div class="divider-line"></div>
		<div class="divider-label">Courses &amp; Assignments</div>
		<div class="divider-line"></div>
	</div>

	<div class="courses">
		<div class="course-card" id="idea-113">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">IDEA-113</div>
					<div class="course-updated">Last updated: May 14, 2026</div>
				</div>
				<div class="course-meta">
					<span class="course-badge badge-grade">Freshman</span>
					<span class="course-badge badge-block">Block 1</span>
					<a class="gc-link" href="https://classroom.google.com/c/ODM4MDY5NDA1NjMy" target="_blank" rel="noopener">Classroom ↗</a>
				</div>
			</div>
			<div class="assignment-list">
				<div class="assignment-item linked" data-posted="2026-05-11" data-url="/assignments/IDEA-Blade_Rulebook_v2_2">
					<div class="assignment-left">
						<div class="assignment-dot" style="background:var(--cyan); box-shadow:0 0 6px rgba(0,240,255,0.8);"></div>
						<div class="assignment-name" style="color:var(--cyan)">IDEA-Blade - Official Rulebook v2.2</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due" style="color:var(--dim)">Always Available</span>
						<span class="assignment-code">idea113-rules</span>
						<span class="assignment-status" style="color:var(--cyan)">Resource</span>
					</div>
				</div>
				<div class="assignment-item linked" data-posted="2026-05-24" data-due="2026-05-29" data-url="/assignments/idea113-blade-05" data-points="100">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">IDEA-Blade - Assignment 05: Competition Record &amp; Final Presentation</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 29, 2026</span>
						<span class="assignment-code">idea113-blade-05</span>
						<span class="assignment-status"></span>
					</div>
				</div>
				<div class="assignment-item linked" data-posted="2026-05-18" data-due="2026-05-22" data-url="/assignments/idea113-blade-04" data-points="60">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">IDEA-Blade - Assignment 04: Manufacturing, Assembly &amp; Match Readiness</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 22, 2026</span>
						<span class="assignment-code">idea113-blade-04</span>
						<span class="assignment-status"></span>
					</div>
				</div>
				<div class="assignment-item linked" data-posted="2026-05-14" data-due="2026-05-19" data-url="/assignments/idea113-blade-03" data-points="80">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">IDEA-Blade - Assignment 03: CAD Design Package</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 19, 2026</span>
						<span class="assignment-code">idea113-blade-03</span>
						<span class="assignment-status"></span>
					</div>
				</div>
				<div class="assignment-item linked" data-posted="2026-05-12" data-due="2026-05-13" data-url="/assignments/idea113-blade-02" data-points="63">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">IDEA-Blade - Assignment 02: Build Strategy</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 14, 2026</span>
						<span class="assignment-code">idea113-blade-02</span>
						<span class="assignment-status"></span>
					</div>
				</div>
				<div class="assignment-item linked" data-posted="2026-05-09" data-due="2026-05-12" data-url="/assignments/idea113-blade-01" data-points="50">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">IDEA-Blade - Assignment 01: Concept Package</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 12, 2026</span>
						<span class="assignment-code">idea113-blade-01</span>
						<span class="assignment-status"></span>
					</div>
				</div>
			</div>
		</div>

		<div class="course-card" id="idea-208">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">IDEA-208</div>
					<div class="course-updated">Last updated: May 18, 2026</div>
				</div>
				<div class="course-meta">
					<span class="course-badge badge-grade">Sophomore</span>
					<span class="course-badge badge-block">Block 2</span>
					<a class="gc-link" href="https://classroom.google.com/c/ODQ4Mjc3MzUwMTE1" target="_blank" rel="noopener">Classroom ↗</a>
				</div>
			</div>
			<div class="assignment-list">
				<div class="assignment-item linked" data-posted="2026-05-18" data-due="TBD" data-url="/assignments/mset-mold-02">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">MSET-Mold - Assignment 02: Mold Body Design</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: TBD</span>
						<span class="assignment-code">mset-mold-02</span>
						<span class="assignment-status"></span>
					</div>
				</div>
				<div class="assignment-item linked" data-posted="2026-05-11" data-due="2026-05-13" data-url="/assignments/MSET-Mold-01" data-points="50">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">MSET-Mold - Assignment 01: Part Concept &amp; Model</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 13, 2026</span>
						<span class="assignment-code">idea208-mold-01</span>
						<span class="assignment-status"></span>
					</div>
				</div>
			</div>
		</div>

		<div class="course-card" id="idea-303">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">IDEA-303</div>
					<div class="course-updated">Under Construction</div>
				</div>
				<div class="course-meta">
					<span class="course-badge badge-grade">Junior</span>
					<span class="course-badge badge-block">Block 3</span>
					<span class="course-badge badge-instructor">Mr. C</span>
					<a class="gc-link" href="https://classroom.google.com/c/ODM4MTUxNzk3NDgw" target="_blank" rel="noopener">Classroom ↗</a>
				</div>
			</div>
			<div class="assignment-list">
				<div class="empty-state" style="border-color:rgba(255,140,0,0.25)">
					<div class="empty-icon" style="color:var(--amber)">[ ]</div>
					<div class="empty-text">
						<strong style="color:var(--amber)">This course is under construction.</strong><br />
						Assignments will appear here when posted.
					</div>
				</div>
			</div>
		</div>

		<div class="course-card" id="idea-403">
			<div class="course-header">
				<div class="course-header-left">
					<div class="course-id">IDEA-403</div>
					<div class="course-updated">Last updated: May 15, 2026</div>
				</div>
				<div class="course-meta">
					<span class="course-badge badge-grade">Senior</span>
					<span class="course-badge badge-block">Block 4</span>
					<a class="gc-link" href="https://classroom.google.com/c/ODM4MDc0ODE5MzI3" target="_blank" rel="noopener">Classroom ↗</a>
				</div>
			</div>
			<div class="assignment-list">
				<div class="assignment-item linked" data-posted="2026-05-15" data-due="2026-05-21" data-url="/assignments/idea403-senior-final">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">Senior Final: Project Deliverable Package</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 21, 2026</span>
						<span class="assignment-code">idea403-senior-final</span>
						<span class="assignment-status"></span>
					</div>
				</div>
				<div class="assignment-item linked" data-posted="2026-05-01" data-due="2026-05-08" data-url="/assignments/idea403-senior-progress" data-points="50">
					<div class="assignment-left">
						<div class="assignment-dot"></div>
						<div class="assignment-name">Senior Project - Progress Check</div>
					</div>
					<div class="assignment-right">
						<span class="assignment-due">Due: May 8, 2026</span>
						<span class="assignment-code">idea403-progress</span>
						<span class="assignment-status"></span>
					</div>
				</div>
			</div>
		</div>
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
			<div class="changelog-entry">
				<span class="changelog-date">May 18, 2026</span>
				<span class="changelog-note">IDEA-208 updated. Added MSET-Mold Assignment 02: Mold Body Design.</span>
			</div>
			<div class="changelog-entry">
				<span class="changelog-date">May 15, 2026</span>
				<span class="changelog-note">IDEA-403 updated. Added Senior Final: Project Deliverable Package. Due May 21.</span>
			</div>
			<div class="changelog-entry">
				<span class="changelog-date">May 15, 2026</span>
				<span class="changelog-note">Assignment filter added to header strip. Submit instructions collapse after first visit. Past due assignments dimmed. Hero section tightened on mobile. Instructor display fixed.</span>
			</div>
			<div class="changelog-entry">
				<span class="changelog-date">May 14, 2026</span>
				<span class="changelog-note">Materials strip added to sticky header. Course header meta alignment fixed. Mr. C added to instructor display.</span>
			</div>
			<div class="changelog-entry">
				<span class="changelog-date">May 9, 2026</span>
				<span class="changelog-note">Portal launched. IDEA-113 (Blade 01) and IDEA-403 (Senior Progress Check) active.</span>
			</div>
		</div>
	</div>

	<footer>
		<div class="footer-logo">IDEA - Integrated Design, Engineering &amp; Art</div>
		<div class="footer-sub">Don Bosco Technical Institute &bull; Rosemead, CA</div>
	</footer>
</div>

<style>
	:global {
		.legacy-index {
			font-family: 'Share Tech Mono', monospace;
			position: relative;
			z-index: 1;
		}

		.legacy-index #scroll-bar {
			position: fixed;
			top: 0;
			left: 0;
			height: 2px;
			width: 0%;
			background: var(--green);
			box-shadow: var(--glow-green);
			z-index: 1000;
			transition: width 0.1s linear;
		}

		.legacy-index #bg-canvas {
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			z-index: 0;
			pointer-events: none;
			opacity: 0.35;
		}

		/* Header */
		.legacy-index header {
			position: sticky;
			top: 0;
			z-index: 100;
			background: rgba(2, 10, 4, 0.88);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
			border-bottom: 1px solid rgba(0, 255, 65, 0.15);
			padding: 0 2rem;
			display: flex;
			align-items: center;
			justify-content: space-between;
			min-height: 64px;
			gap: 1rem;
		}
		.legacy-index .logo {
			font-family: 'Orbitron', sans-serif;
			font-weight: 900;
			font-size: 1.5rem;
			color: var(--green);
			text-shadow: var(--glow-green);
			letter-spacing: 0.15em;
			text-decoration: none;
			white-space: nowrap;
		}
		.legacy-index .logo span {
			color: var(--gold);
			text-shadow: var(--glow-gold);
		}
		.legacy-index .header-right {
			display: flex;
			align-items: center;
			gap: 1.5rem;
		}
		.legacy-index nav {
			display: flex;
			gap: 1.5rem;
			align-items: center;
		}
		.legacy-index nav a {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.62rem;
			font-weight: 600;
			letter-spacing: 0.12em;
			color: var(--dim);
			text-decoration: none;
			text-transform: uppercase;
			transition:
				color 0.2s,
				text-shadow 0.2s;
			cursor: pointer;
			white-space: nowrap;
		}
		.legacy-index nav a:hover {
			color: var(--green);
			text-shadow: var(--glow-green);
		}
		.legacy-index .header-year {
			font-size: 0.6rem;
			color: var(--dim);
			letter-spacing: 0.1em;
			white-space: nowrap;
			border: 1px solid rgba(74, 122, 82, 0.4);
			padding: 0.2rem 0.5rem;
			border-radius: 2px;
		}

		/* Optional sign-in control */
		.legacy-index .auth-block {
			display: flex;
			align-items: center;
			gap: 0.75rem;
		}
		.legacy-index .auth-link {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.6rem;
			font-weight: 600;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			color: var(--cyan);
			background: none;
			border: 1px solid rgba(0, 240, 255, 0.3);
			padding: 0.3rem 0.7rem;
			border-radius: 2px;
			cursor: pointer;
			text-decoration: none;
			white-space: nowrap;
			transition:
				color 0.2s,
				border-color 0.2s,
				text-shadow 0.2s;
		}
		.legacy-index .auth-link:hover {
			color: var(--green);
			border-color: rgba(0, 255, 65, 0.5);
			text-shadow: var(--glow-green);
		}
		.legacy-index .auth-link.signin {
			color: var(--green);
			border-color: rgba(0, 255, 65, 0.4);
		}
		.legacy-index .auth-link:disabled {
			opacity: 0.6;
			cursor: default;
		}
		.legacy-index .auth-error {
			position: relative;
			z-index: 1;
			max-width: 1100px;
			margin: 0.75rem auto 0;
			padding: 0 2rem;
			color: var(--amber);
			font-size: 0.72rem;
		}

		/* Hero */
		.legacy-index .hero {
			position: relative;
			z-index: 1;
			padding: 5rem 2rem 3.5rem;
			max-width: 1100px;
			margin: 0 auto;
		}
		.legacy-index .hero-eyebrow {
			font-size: 0.65rem;
			letter-spacing: 0.25em;
			color: var(--teal);
			text-transform: uppercase;
			margin-bottom: 1rem;
			font-family: 'Orbitron', sans-serif;
		}
		.legacy-index .hero h1 {
			font-family: 'Orbitron', sans-serif;
			font-weight: 900;
			font-size: clamp(1.8rem, 4.5vw, 3.8rem);
			line-height: 1.05;
			color: var(--white);
			margin-bottom: 0.5rem;
		}
		.legacy-index .hero h1 .accent {
			color: var(--green);
			text-shadow: var(--glow-green);
		}
		.legacy-index .hero-sub {
			font-size: 0.82rem;
			color: var(--dim);
			letter-spacing: 0.04em;
			margin-top: 1rem;
			max-width: 480px;
			line-height: 1.7;
		}
		.legacy-index .hero-meta {
			display: flex;
			gap: 2.5rem;
			margin-top: 2.5rem;
			flex-wrap: wrap;
		}
		.legacy-index .hero-stat {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
		}
		.legacy-index .hero-stat .value {
			font-family: 'Orbitron', sans-serif;
			font-size: 1.5rem;
			font-weight: 700;
			color: var(--green);
			text-shadow: var(--glow-green);
			animation: breathe 3s ease-in-out infinite;
		}
		.legacy-index .hero-stat .label {
			font-size: 0.58rem;
			color: var(--dim);
			letter-spacing: 0.15em;
			text-transform: uppercase;
		}

		@keyframes breathe {
			0%,
			100% {
				text-shadow:
					0 0 8px rgba(0, 255, 65, 0.6),
					0 0 20px rgba(0, 255, 65, 0.2);
			}
			50% {
				text-shadow:
					0 0 16px rgba(0, 255, 65, 1),
					0 0 40px rgba(0, 255, 65, 0.5);
			}
		}

		/* Promo callouts (Coin + VANGUARD) */
		.legacy-index .promo-callout {
			position: relative;
			z-index: 1;
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1.5rem;
			flex-wrap: wrap;
			max-width: 1100px;
			margin: 0 auto 2.5rem;
			padding: 1.2rem 1.8rem;
			background: linear-gradient(135deg, rgba(200, 255, 0, 0.07) 0%, rgba(0, 240, 255, 0.05) 100%);
			border: 1px solid rgba(200, 255, 0, 0.35);
			border-radius: 4px;
			text-decoration: none;
			transition:
				border-color 0.2s,
				background 0.2s;
		}
		.legacy-index .promo-callout:hover {
			border-color: rgba(200, 255, 0, 0.7);
			background: linear-gradient(135deg, rgba(200, 255, 0, 0.12) 0%, rgba(0, 240, 255, 0.08) 100%);
		}
		.legacy-index .promo-left {
			display: flex;
			align-items: center;
			gap: 1.2rem;
		}
		.legacy-index .promo-icon {
			font-family: 'Orbitron', sans-serif;
			font-size: 2rem;
			font-weight: 900;
			color: var(--gold);
			text-shadow: var(--glow-gold);
			line-height: 1;
			animation: breathe 3s ease-in-out infinite;
		}
		.legacy-index .promo-title {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.7rem;
			font-weight: 700;
			letter-spacing: 0.18em;
			color: var(--gold);
			text-shadow: 0 0 8px rgba(200, 255, 0, 0.5);
			text-transform: uppercase;
			margin-bottom: 0.3rem;
		}
		.legacy-index .promo-sub {
			font-size: 0.72rem;
			color: var(--dim);
			letter-spacing: 0.04em;
			line-height: 1.5;
		}
		.legacy-index .promo-cta {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.58rem;
			letter-spacing: 0.18em;
			color: var(--gold);
			border: 1px solid rgba(200, 255, 0, 0.4);
			padding: 0.35rem 0.9rem;
			border-radius: 2px;
			white-space: nowrap;
			text-transform: uppercase;
		}

		/* Submit panel */
		.legacy-index .submit-panel {
			position: relative;
			z-index: 1;
			max-width: 1100px;
			margin: 0 auto 2.5rem;
			padding: 0 2rem;
		}
		.legacy-index .submit-inner {
			background: var(--bg1);
			border: 1px solid rgba(0, 240, 255, 0.2);
			border-radius: 4px;
			padding: 1.2rem 1.5rem;
		}
		.legacy-index #submit-toggle {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.58rem;
			width: 100%;
			display: flex;
			justify-content: space-between;
			background: none;
			border: none;
			color: var(--dim);
			cursor: pointer;
			padding-bottom: 0.75rem;
			letter-spacing: 0.18em;
			text-transform: uppercase;
		}
		.legacy-index #submit-chevron {
			transition: transform 0.3s;
		}
		.legacy-index #submit-toggle.open #submit-chevron {
			transform: rotate(180deg);
		}
		.legacy-index .submit-label {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.58rem;
			letter-spacing: 0.2em;
			color: var(--cyan);
			text-transform: uppercase;
			margin-bottom: 1rem;
		}
		.legacy-index .submit-steps {
			display: flex;
			gap: 0;
		}
		.legacy-index .submit-step {
			display: flex;
			align-items: flex-start;
			gap: 0.75rem;
			flex: 1;
			padding-right: 1.5rem;
			border-right: 1px solid rgba(0, 255, 65, 0.1);
			margin-right: 1.5rem;
		}
		.legacy-index .submit-step:last-child {
			border-right: none;
			margin-right: 0;
			padding-right: 0;
		}
		.legacy-index .step-num {
			font-family: 'Orbitron', sans-serif;
			font-size: 1.1rem;
			font-weight: 700;
			color: var(--green);
			text-shadow: var(--glow-green);
			line-height: 1;
			flex-shrink: 0;
			animation: breathe 3s ease-in-out infinite;
		}
		.legacy-index .submit-step:nth-child(2) .step-num {
			animation-delay: 0.8s;
		}
		.legacy-index .submit-step:nth-child(3) .step-num {
			animation-delay: 1.6s;
		}
		.legacy-index .step-text {
			font-size: 0.75rem;
			color: var(--white);
			line-height: 1.5;
		}
		.legacy-index .step-text strong {
			color: var(--gold);
			font-weight: normal;
		}

		/* Divider */
		.legacy-index .divider {
			position: relative;
			z-index: 1;
			max-width: 1100px;
			margin: 0 auto 2.5rem;
			padding: 0 2rem;
			display: flex;
			align-items: center;
			gap: 1rem;
		}
		.legacy-index .divider-line {
			flex: 1;
			height: 1px;
			background: linear-gradient(to right, transparent, rgba(0, 255, 65, 0.3), transparent);
		}
		.legacy-index .divider-label {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.6rem;
			letter-spacing: 0.2em;
			color: var(--dim);
			text-transform: uppercase;
			white-space: nowrap;
		}

		/* Courses */
		.legacy-index .courses {
			position: relative;
			z-index: 1;
			max-width: 1100px;
			margin: 0 auto;
			padding: 0 2rem 4rem;
			display: grid;
			gap: 2rem;
		}
		.legacy-index .course-card {
			background: var(--bg1);
			border: 1px solid rgba(0, 255, 65, 0.12);
			border-radius: 4px;
			overflow: hidden;
			opacity: 0;
			transform: translateY(20px);
			transition:
				opacity 0.65s ease,
				transform 0.65s ease,
				border-color 0.3s;
			position: relative;
		}
		.legacy-index .course-card.visible {
			opacity: 1;
			transform: translateY(0);
		}
		.legacy-index .course-card:hover {
			border-color: rgba(0, 255, 65, 0.35);
		}
		.legacy-index .course-card::before {
			content: '';
			position: absolute;
			inset: 0;
			background: linear-gradient(180deg, rgba(0, 255, 65, 0.04) 0%, transparent 60%);
			opacity: 0;
			transition: opacity 0.4s;
			pointer-events: none;
		}
		.legacy-index .course-card:hover::before {
			opacity: 1;
		}
		.legacy-index .course-header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			flex-wrap: wrap;
			gap: 0.5rem;
			padding: 1.1rem 1.5rem;
			border-bottom: 1px solid rgba(0, 255, 65, 0.1);
			background: var(--bg2);
			cursor: pointer;
		}
		.legacy-index .course-header-left {
			display: flex;
			flex-direction: column;
			gap: 0.3rem;
		}
		.legacy-index .course-id {
			font-family: 'Orbitron', sans-serif;
			font-weight: 700;
			font-size: 1.05rem;
			color: var(--green);
			letter-spacing: 0.1em;
			text-shadow: none;
		}
		.legacy-index .course-updated {
			font-size: 0.58rem;
			color: var(--dim);
			letter-spacing: 0.06em;
			text-transform: none;
			font-family: 'Share Tech Mono', monospace;
		}
		.legacy-index .course-meta {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			flex-shrink: 0;
			margin-left: auto;
		}
		.legacy-index .course-badge {
			font-size: 0.58rem;
			letter-spacing: 0.15em;
			text-transform: uppercase;
			padding: 0.22rem 0.55rem;
			border-radius: 2px;
			font-family: 'Orbitron', sans-serif;
		}
		.legacy-index .badge-grade {
			color: var(--gold);
			border: 1px solid rgba(200, 255, 0, 0.3);
			background: rgba(200, 255, 0, 0.05);
		}
		.legacy-index .badge-block {
			color: var(--cyan);
			border: 1px solid rgba(0, 240, 255, 0.3);
			background: rgba(0, 240, 255, 0.05);
		}
		.legacy-index .badge-instructor {
			color: var(--ice);
			border: 1px solid rgba(136, 221, 255, 0.3);
			background: rgba(136, 221, 255, 0.05);
		}
		.legacy-index .gc-link {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.55rem;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			color: var(--dim);
			border: 1px solid rgba(74, 122, 82, 0.3);
			padding: 0.2rem 0.6rem;
			border-radius: 2px;
			text-decoration: none;
			transition:
				color 0.2s,
				border-color 0.2s;
			cursor: pointer;
		}
		.legacy-index .gc-link:hover {
			color: var(--green);
			border-color: rgba(0, 255, 65, 0.4);
		}
		.legacy-index .course-collapse-arrow {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.7rem;
			color: var(--dim);
			transition: transform 0.3s;
			flex-shrink: 0;
		}
		.legacy-index .course-card.collapsed .course-collapse-arrow {
			transform: rotate(180deg);
		}

		.legacy-index .assignment-list {
			padding: 0.5rem 0;
			max-height: 800px;
			overflow: hidden;
			transition:
				max-height 0.35s ease,
				opacity 0.35s ease;
			margin: 0;
			list-style: none;
		}
		.legacy-index .course-card.collapsed .assignment-list {
			max-height: 0;
			opacity: 0;
		}
		.legacy-index .assignment-item {
			display: flex;
			align-items: center;
			justify-content: space-between;
			flex-wrap: wrap;
			gap: 0.5rem;
			padding: 0.8rem 1.5rem;
			border-bottom: 1px solid rgba(0, 255, 65, 0.05);
			border-top: none;
			transition:
				background 0.2s,
				padding-left 0.2s;
		}
		.legacy-index .assignment-item:last-child {
			border-bottom: none;
		}
		.legacy-index .assignment-item.linked {
			cursor: pointer;
		}
		.legacy-index .assignment-item.linked:hover {
			background: rgba(0, 255, 65, 0.04);
			padding-left: 1.8rem;
		}
		.legacy-index .assignment-left {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			flex-wrap: wrap;
		}
		.legacy-index .assignment-dot {
			width: 6px;
			height: 6px;
			border-radius: 50%;
			flex-shrink: 0;
			transition:
				background 0.3s,
				box-shadow 0.3s;
		}
		.legacy-index .dot-live {
			background: var(--green);
			box-shadow: 0 0 6px rgba(0, 255, 65, 0.8);
			animation: pulse-dot 2.5s ease-in-out infinite;
		}
		.legacy-index .dot-soon {
			background: var(--dim);
		}
		@keyframes pulse-dot {
			0%,
			100% {
				box-shadow: 0 0 4px rgba(0, 255, 65, 0.6);
			}
			50% {
				box-shadow: 0 0 10px rgba(0, 255, 65, 1);
			}
		}
		.legacy-index .assignment-name {
			font-size: 0.82rem;
			color: var(--white);
			letter-spacing: 0.03em;
		}
		.legacy-index .assignment-item.soon .assignment-name {
			color: var(--dim);
		}
		.legacy-index .badge-new {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.5rem;
			letter-spacing: 0.15em;
			color: var(--bg0);
			background: var(--green);
			padding: 0.15rem 0.4rem;
			border-radius: 2px;
			text-transform: uppercase;
			font-weight: 700;
			box-shadow: var(--glow-green);
			flex-shrink: 0;
		}
		.legacy-index .assignment-right {
			display: flex;
			align-items: center;
			gap: 1.2rem;
			flex-shrink: 0;
			flex-wrap: wrap;
		}
		.legacy-index .assignment-due {
			font-size: 0.62rem;
			color: var(--teal);
			letter-spacing: 0.06em;
		}
		.legacy-index .assignment-due.past {
			color: var(--dim);
		}
		.legacy-index .assignment-code {
			font-size: 0.6rem;
			color: var(--dim);
			letter-spacing: 0.08em;
		}
		.legacy-index .assignment-pts {
			font-size: 0.62rem;
			color: var(--amber);
			letter-spacing: 0.06em;
		}
		.legacy-index .assignment-status {
			font-size: 0.6rem;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			font-family: 'Orbitron', sans-serif;
		}
		.legacy-index .status-live {
			color: var(--green);
		}
		.legacy-index .status-soon {
			color: var(--dim);
		}
		.legacy-index .empty-state {
			padding: 1.8rem 1.5rem;
			display: flex;
			align-items: center;
			gap: 1rem;
			border: 1px dashed rgba(74, 122, 82, 0.25);
			border-radius: 3px;
			margin: 1rem 1.5rem;
		}
		.legacy-index .empty-icon {
			font-family: 'Orbitron', sans-serif;
			font-size: 1.2rem;
			color: var(--dim);
			flex-shrink: 0;
		}
		.legacy-index .empty-text {
			font-size: 0.72rem;
			color: var(--dim);
			line-height: 1.6;
		}
		.legacy-index .empty-text strong {
			color: var(--ice);
			font-weight: normal;
		}

		/* Changelog */
		.legacy-index .changelog-wrap {
			position: relative;
			z-index: 1;
			max-width: 1100px;
			margin: 0 auto;
			padding: 0 2rem 5rem;
		}
		.legacy-index .changelog-toggle {
			background: none;
			border: 1px solid rgba(74, 122, 82, 0.3);
			color: var(--dim);
			font-family: 'Orbitron', sans-serif;
			font-size: 0.58rem;
			letter-spacing: 0.18em;
			text-transform: uppercase;
			padding: 0.5rem 1rem;
			cursor: pointer;
			border-radius: 2px;
			transition:
				color 0.2s,
				border-color 0.2s;
			width: 100%;
			display: flex;
			align-items: center;
			justify-content: space-between;
		}
		.legacy-index .changelog-toggle:hover {
			color: var(--green);
			border-color: rgba(0, 255, 65, 0.3);
		}
		.legacy-index .changelog-arrow {
			transition: transform 0.3s;
		}
		.legacy-index .changelog-toggle.open .changelog-arrow {
			transform: rotate(180deg);
		}
		.legacy-index .changelog-body {
			display: none;
			margin-top: 1rem;
			background: var(--bg1);
			border: 1px solid rgba(74, 122, 82, 0.2);
			border-radius: 3px;
			padding: 1rem 1.5rem;
		}
		.legacy-index .changelog-body.open {
			display: block;
		}
		.legacy-index .changelog-entry {
			display: flex;
			gap: 1.5rem;
			align-items: baseline;
			padding: 0.5rem 0;
			border-bottom: 1px solid rgba(74, 122, 82, 0.1);
			font-size: 0.72rem;
		}
		.legacy-index .changelog-entry:last-child {
			border-bottom: none;
		}
		.legacy-index .changelog-date {
			color: var(--cyan);
			letter-spacing: 0.06em;
			flex-shrink: 0;
			min-width: 90px;
		}
		.legacy-index .changelog-note {
			color: var(--dim);
			line-height: 1.5;
		}

		/* Footer */
		.legacy-index footer {
			position: relative;
			z-index: 1;
			border-top: 1px solid rgba(0, 255, 65, 0.1);
			padding: 2rem;
			text-align: center;
		}
		.legacy-index .footer-logo {
			font-family: 'Orbitron', sans-serif;
			font-size: 0.72rem;
			font-weight: 700;
			color: var(--dim);
			letter-spacing: 0.2em;
			margin-bottom: 0.5rem;
		}
		.legacy-index .footer-sub {
			font-size: 0.58rem;
			color: rgba(74, 122, 82, 0.6);
			letter-spacing: 0.1em;
		}

		@media (max-width: 768px) {
			.legacy-index header {
				min-height: auto;
				padding: 0.8rem 1rem;
				flex-wrap: wrap;
			}
			.legacy-index .logo {
				font-size: 1.1rem;
			}
			.legacy-index .header-right {
				gap: 0.75rem;
				flex-wrap: wrap;
			}
			.legacy-index .header-year {
				display: none;
			}
			.legacy-index nav {
				gap: 0.75rem;
			}
			.legacy-index nav a {
				font-size: 0.55rem;
			}
			.legacy-index .hero {
				padding: 2rem 1rem 1.5rem;
			}
			.legacy-index .hero h1 {
				font-size: clamp(1.4rem, 6vw, 2rem);
			}
			.legacy-index .hero-sub {
				font-size: 0.76rem;
			}
			.legacy-index .hero-meta {
				margin-top: 1.2rem;
				gap: 1rem;
			}
			.legacy-index .hero-stat .value {
				font-size: 1.1rem;
			}
			.legacy-index .promo-callout {
				margin-left: 1rem;
				margin-right: 1rem;
			}
			.legacy-index .submit-panel {
				padding: 0 1rem;
			}
			.legacy-index .submit-steps {
				flex-direction: column;
				gap: 1rem;
			}
			.legacy-index .submit-step {
				border-right: none;
				margin-right: 0;
				padding-right: 0;
				border-bottom: 1px solid rgba(0, 255, 65, 0.1);
				padding-bottom: 1rem;
			}
			.legacy-index .submit-step:last-child {
				border-bottom: none;
				padding-bottom: 0;
			}
			.legacy-index .divider {
				padding: 0 1rem;
			}
			.legacy-index .courses {
				padding: 0 1rem 3rem;
			}
			.legacy-index .course-header {
				padding: 0.9rem 1rem;
			}
			.legacy-index .assignment-item {
				padding: 0.75rem 1rem;
			}
			.legacy-index .assignment-item.linked:hover {
				padding-left: 1.2rem;
			}
			.legacy-index .assignment-code {
				display: none;
			}
			.legacy-index .changelog-wrap {
				padding: 0 1rem 3rem;
			}
			.legacy-index footer {
				padding: 1.5rem 1rem;
			}
		}

		@media (max-width: 480px) {
			.legacy-index nav a {
				font-size: 0.5rem;
				letter-spacing: 0.05em;
			}
			.legacy-index .assignment-due {
				display: none;
			}
		}

		@media (prefers-reduced-motion: reduce) {
			.legacy-index .course-card {
				opacity: 1;
				transform: none;
				transition: none;
			}
			.legacy-index .hero-stat .value,
			.legacy-index .step-num,
			.legacy-index .promo-icon {
				animation: none;
			}
			.legacy-index .dot-live {
				animation: none;
			}
		}
	}
</style>
