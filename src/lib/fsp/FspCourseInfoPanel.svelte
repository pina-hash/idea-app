<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	/**
	 * FspCourseInfoPanel — a modal overlay opened from the FSP homepage
	 * section's "Course Info" row. Same modal chrome and tab mechanics as
	 * FspPresentationsPanel (styled to match the rest of the FSP live-session
	 * surfaces: IDEA green on near-black, Share Tech Mono chrome), but each tab
	 * renders styled text content directly instead of an embedded iframe — no
	 * external network call, so no lazy-mount / load-status / fallback-link
	 * machinery is needed here.
	 */

	interface Course {
		id: string;
		label: string;
		title: string;
		tagline: string;
		body: string;
		bullets: string[];
	}

	const COURSES: Course[] = [
		{
			id: 'idea114',
			label: 'IDEA114',
			title: 'Engineering Foundations',
			tagline: 'Your first year in IDEA',
			body: "You start in the deep end. Freshman year opens inside Bosco Tech's active FIRST Robotics Competition build season, where you work directly on a real competition robot alongside upperclassmen, on a hard deadline that doesn't move. From there you learn to sketch by hand, then build real skill in SolidWorks, going from your first 3D part to full assemblies and production-ready drawings. You'll run real shop equipment, plan and execute a precision metal fabrication project, and learn how fasteners, materials, and hardware actually work. The year ends with the Spinning Battle Top Challenge: you design, machine, and battle your own precision top against every other freshman's, one on one, until a winner is standing.",
			bullets: [
				'FRC build season, week one',
				'SolidWorks, from sketch to full assembly',
				'Run the mill, lathe, laser, and CNC router',
				'Build and battle your own spinning top'
			]
		},
		{
			id: 'idea209h',
			label: 'IDEA209H',
			title: 'Engineering I Honors',
			tagline: 'Design like an engineer, not just a builder',
			body: "Sophomore year flips the order most people expect: you fabricate first, so every design decision you make later is grounded in what the shop can actually produce, not just what looks good on screen. You'll identify unknown materials through real testing, run a five-station manufacturing rotation, design original parts and prove they hold tolerance, and build a full mechanism from a blank requirement sheet. The year closes with the Integrated Design Challenge: your team designs and builds one full mechanism of a radio-controlled mobile platform, built to a strict interface spec so it has to work with three other teams' mechanisms the first time everything is bolted together and powered on.",
			bullets: [
				'Identify materials through hands-on testing',
				'Rotate through CNC router, laser, mill, lathe, and 3D printing',
				'Design parts, then prove they hold tolerance',
				'Build one mechanism of a team RC platform'
			]
		},
		{
			id: 'idea210h',
			label: 'IDEA210H',
			title: 'Engineering Applications Honors',
			tagline: 'The build season is the class',
			body: "This one has no simulated project. Engineering Applications Honors runs entirely inside Bosco Tech's FRC build season, with your class organized into small autonomous teams under the Skunkworks model, the same approach Lockheed used to build the SR-71. Each team owns one subsystem of the competition robot end to end: requirements, prototyping, final design, manufacturing, and integration, on the same deadline the real team is racing against. Your subsystem gets tested standalone, then tested again once it's bolted into the full robot, then tested one more time when the robot hits the field at competition. Real deadlines, real hardware, real consequences if it doesn't work.",
			bullets: [
				'Full subsystem ownership, one team per mechanism',
				'Skunkworks organization under real build-season pressure',
				'Standalone testing, then full-robot integration testing',
				'Your subsystem competes at an actual FRC event'
			]
		}
	];

	let { open = $bindable(false) } = $props();

	let activeIdx = $state(0);

	function activate(i: number) {
		activeIdx = i;
	}

	function close() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydown);
	});
	onDestroy(() => {
		if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
	});
</script>

{#if open}
	<div class="fp-backdrop" role="presentation" onclick={close} onkeydown={() => {}}>
		<div
			class="fp-panel"
			role="dialog"
			aria-modal="true"
			aria-label="Course info"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="fp-bar">
				<span class="fp-title">Course Info</span>
				<button class="fp-close" onclick={close} aria-label="Close course info" title="Close">
					&times;
				</button>
			</div>

			<div class="fp-tabs" role="tablist" aria-label="Course">
				{#each COURSES as course, i (course.id)}
					<button
						class="fp-tab"
						class:active={i === activeIdx}
						role="tab"
						aria-selected={i === activeIdx}
						onclick={() => activate(i)}
					>
						{course.label}
					</button>
				{/each}
			</div>

			<div class="fp-stage">
				{#each COURSES as course, i (course.id)}
					<div class="fp-course" class:hidden={i !== activeIdx}>
						<h2 class="ci-title">{course.title}</h2>
						<p class="ci-tagline">{course.tagline}</p>
						<p class="ci-body">{course.body}</p>
						<ul class="ci-bullets">
							{#each course.bullets as bullet (bullet)}
								<li>{bullet}</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.fp-backdrop {
		position: fixed;
		inset: 0;
		z-index: 9000;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(3px);
		display: grid;
		place-items: center;
		padding: 1.25rem;
	}
	.fp-panel {
		position: relative;
		width: min(1100px, 100%);
		height: min(760px, 92vh);
		background: #0a0a0a;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.35));
		border-radius: 16px;
		box-shadow:
			0 24px 70px rgba(0, 0, 0, 0.7),
			0 0 44px rgba(0, 255, 65, 0.12);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.fp-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.7rem 0.7rem 0.7rem 1.1rem;
		background: #0c110c;
		border-bottom: 1px solid rgba(0, 255, 65, 0.18);
	}
	.fp-title {
		font-family: 'Rajdhani', system-ui, sans-serif;
		font-weight: 700;
		font-size: 1.15rem;
		color: var(--green, #00ff41);
		text-shadow: 0 0 10px rgba(0, 255, 65, 0.4);
		letter-spacing: 0.01em;
	}
	.fp-close {
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		font-size: 1.5rem;
		line-height: 1;
		border-radius: 8px;
		border: 1px solid rgba(0, 255, 65, 0.3);
		background: transparent;
		color: var(--green, #00ff41);
		cursor: pointer;
	}
	.fp-close:hover {
		background: rgba(0, 255, 65, 0.14);
	}

	.fp-tabs {
		display: flex;
		gap: 0.4rem;
		padding: 0.6rem 0.9rem;
		background: #0a0f0a;
		border-bottom: 1px solid rgba(0, 255, 65, 0.12);
	}
	.fp-tab {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.5rem 1.1rem;
		border-radius: 8px;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		background: transparent;
		color: #a9c9ad;
		cursor: pointer;
	}
	.fp-tab:hover {
		background: rgba(0, 255, 65, 0.08);
		color: var(--green, #00ff41);
	}
	.fp-tab.active {
		background: rgba(0, 255, 65, 0.16);
		border-color: var(--green, #00ff41);
		color: var(--green, #00ff41);
		box-shadow: 0 0 14px rgba(0, 255, 65, 0.18);
	}

	.fp-stage {
		flex: 1;
		min-height: 0;
		position: relative;
	}
	.fp-course {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1.6rem 2rem 2rem;
		overflow-y: auto;
	}
	.fp-course.hidden {
		display: none;
	}

	.ci-title {
		font-family: 'Rajdhani', system-ui, sans-serif;
		font-weight: 700;
		font-size: 1.6rem;
		color: var(--green, #00ff41);
		text-shadow: 0 0 10px rgba(0, 255, 65, 0.35);
		margin: 0;
	}
	.ci-tagline {
		font-family: 'Rajdhani', system-ui, sans-serif;
		font-style: italic;
		font-size: 1.05rem;
		color: var(--gold, #c8ff00);
		margin: 0;
	}
	.ci-body {
		font-family: 'Rajdhani', system-ui, sans-serif;
		font-size: 1rem;
		line-height: 1.6;
		color: var(--white, #e8ffe8);
		margin: 0;
		max-width: 72ch;
	}
	.ci-bullets {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0.2rem 0 0;
		padding: 0;
		list-style: none;
	}
	.ci-bullets li {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.88rem;
		letter-spacing: 0.01em;
		color: #a9c9ad;
		padding-left: 1.3rem;
		position: relative;
	}
	.ci-bullets li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0.5em;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--cyan, #00f0ff);
		box-shadow: 0 0 6px rgba(0, 240, 255, 0.5);
	}

	@media (max-width: 640px) {
		.fp-panel {
			height: min(600px, 92vh);
		}
		.fp-tab {
			padding: 0.5rem 0.8rem;
			font-size: 0.78rem;
		}
		.fp-course {
			padding: 1.2rem 1.2rem 1.6rem;
		}
	}
</style>
