<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { MODES } from '$lib/gauntlet';

	/**
	 * FeatureManager-style navigation rail: root node, the two mode families as
	 * groups, tree connector lines, and a footer origin/units/view block. Leaves
	 * glow in their family color on hover; the current route is marked. Mounted
	 * once in the gauntlet layout as a fixed rail on wide viewports, so every
	 * page (current and future) gets the nav for free.
	 */

	const modeling = MODES.filter((m) => m.family === 'modeling');
	const knowledge = MODES.filter((m) => m.family === 'knowledge');

	const current = $derived($page.url.pathname);
	const isActive = (href?: string) => !!href && (current === href || current.startsWith(href + '/'));

	// The rail reads as clutter during a run, so it starts hidden; a small tab
	// reveals it and the choice persists per browser. Wide-viewport only (the rail
	// is display:none below 1440px, so the tab is too).
	let collapsed = $state(true);
	onMount(() => {
		try {
			collapsed = localStorage.getItem('gt-tree-open') !== '1';
		} catch {
			/* storage unavailable; stay collapsed */
		}
	});
	const toggle = () => {
		collapsed = !collapsed;
		try {
			localStorage.setItem('gt-tree-open', collapsed ? '0' : '1');
		} catch {
			/* storage unavailable */
		}
	};
</script>

{#if collapsed}
	<button class="gt-tree-tab" type="button" onclick={toggle} aria-label="Show the FeatureManager">
		<span class="tab-icon" aria-hidden="true">&#9776;</span>
		<span class="tab-txt">FeatureManager</span>
	</button>
{/if}

<nav class="gt-tree" class:collapsed aria-label="GAUNTLET modes" aria-hidden={collapsed}>
	<div class="tree-hdr">
		<span aria-hidden="true">FeatureManager</span>
		<button class="tree-hide" type="button" onclick={toggle} aria-label="Hide the FeatureManager">&#8249;</button>
	</div>
	<a class="tree-root" href="/gauntlet" class:active={current === '/gauntlet'}>
		<span class="car" aria-hidden="true">&#9662;</span>
		<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M2 12V5l5-3 5 3v7H8V8H6v4z" fill="none" stroke="currentColor" /></svg>
		GAUNTLET
	</a>

	{#each [{ label: 'Modeling modes', family: 'modeling', modes: modeling }, { label: 'Knowledge modes', family: 'knowledge', modes: knowledge }] as group (group.family)}
		<div class="tree-group">
			<span class="tree-group-label {group.family}">
				<span class="car" aria-hidden="true">&#9662;</span>
				<svg viewBox="0 0 14 14" aria-hidden="true">
					{#if group.family === 'modeling'}
						<path d="M7 1l5 3v6l-5 3-5-3V4z M7 7V13 M2 4l5 3 5-3" fill="none" stroke="currentColor" />
					{:else}
						<path d="M2 2h10v8H2z M4 5h6 M4 7h4" fill="none" stroke="currentColor" />
					{/if}
				</svg>
				{group.label}
			</span>
			<ul class="tree-branch">
				{#each group.modes as mode (mode.id)}
					<li>
						{#if mode.status === 'live' && mode.href}
							<a class="tree-leaf {group.family}" href={mode.href} class:active={isActive(mode.href)}>
								<span class="leaf-tick" aria-hidden="true"></span>
								{mode.name}
							</a>
						{:else}
							<span class="tree-leaf wip" title="Under construction">
								<span class="leaf-tick" aria-hidden="true"></span>
								{mode.name}
								<span class="wip-chip">WIP</span>
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/each}

	<div class="tree-group">
		<span class="tree-group-label modeling">
			<span class="car" aria-hidden="true">&#9662;</span>
			<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" /><path d="M7 4v3l2 2" fill="none" stroke="currentColor" /></svg>
			Sessions
		</span>
		<ul class="tree-branch">
			<li><a class="tree-leaf modeling" href="/gauntlet/rooms" class:active={isActive('/gauntlet/rooms')}><span class="leaf-tick" aria-hidden="true"></span>Live Rooms</a></li>
			<li><a class="tree-leaf modeling" href="/gauntlet/tools" class:active={isActive('/gauntlet/tools')}><span class="leaf-tick" aria-hidden="true"></span>Macro &amp; Tools</a></li>
		</ul>
	</div>

	<div class="tree-foot" aria-hidden="true">
		<span>ORIGIN 0,0,0</span>
		<span>UNITS IPS &middot; 3DP</span>
		<span>VIEW *ISOMETRIC</span>
	</div>
</nav>

<style>
	.gt-tree {
		display: none;
	}
	/* The reveal tab and the rail only exist on wide viewports. */
	.gt-tree-tab {
		display: none;
	}
	@media (min-width: 1440px) {
		.gt-tree {
			display: block;
			position: fixed;
			z-index: 2;
			top: 6.5rem;
			left: 1rem;
			width: 232px;
			padding: 0.9rem 0.9rem 0.7rem;
			background: linear-gradient(180deg, var(--panel), var(--void));
			border: 1px solid var(--line);
			border-radius: var(--radius-card);
			overflow: hidden;
			transition: transform 0.3s ease;
		}
		/* Hidden by default: slide the rail off the left edge, out of interaction. */
		.gt-tree.collapsed {
			transform: translateX(calc(-100% - 1.5rem));
			pointer-events: none;
		}
		.gt-tree-tab {
			display: inline-flex;
			align-items: center;
			gap: 0.4rem;
			position: fixed;
			z-index: 2;
			top: 6.5rem;
			left: 0;
			padding: 0.5rem 0.6rem;
			background: linear-gradient(180deg, var(--panel), var(--void));
			border: 1px solid var(--line);
			border-left: none;
			border-radius: 0 var(--radius-ctl) var(--radius-ctl) 0;
			color: var(--dim);
			cursor: pointer;
			font-family: var(--font-data);
			font-size: 0.55rem;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			transition:
				color 0.2s ease,
				border-color 0.2s ease;
		}
		.gt-tree-tab:hover {
			color: var(--green);
			border-color: var(--line-strong);
		}
		.gt-tree-tab .tab-icon {
			font-size: 0.8rem;
			line-height: 1;
		}
	}
	.tree-hide {
		background: none;
		border: none;
		color: var(--dim);
		cursor: pointer;
		font-family: var(--font-data);
		font-size: 0.9rem;
		line-height: 1;
		padding: 0 0.15rem;
	}
	.tree-hide:hover {
		color: var(--green);
	}
	@media (prefers-reduced-motion: reduce) {
		.gt-tree,
		.gt-tree-tab {
			transition: none;
		}
	}
	/* Faint green light falling from the panel top. */
	.gt-tree::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(180deg, rgba(0, 255, 65, 0.05), transparent 40%);
		pointer-events: none;
	}
	.tree-hdr {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-family: var(--font-data);
		font-size: 0.55rem;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: var(--dim);
		padding-bottom: 0.5rem;
	}
	.car {
		font-family: var(--font-data);
		font-size: 0.55rem;
		color: var(--dim);
		width: 9px;
		flex: none;
	}
	svg {
		width: 13px;
		height: 13px;
		stroke-width: 1.1;
		flex: none;
	}
	.tree-root {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-head);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--white);
		text-decoration: none;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--line);
	}
	.tree-root.active,
	.tree-root:hover {
		color: var(--green);
	}
	.tree-group {
		margin-top: 0.65rem;
	}
	.tree-group-label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-data);
		font-size: 0.6rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.tree-group-label.modeling {
		color: var(--green);
	}
	.tree-group-label.knowledge {
		color: var(--cyan);
	}
	.tree-branch {
		list-style: none;
		margin: 0.25rem 0 0;
		padding: 0 0 0 6px;
	}
	.tree-branch li {
		position: relative;
		padding-left: 14px;
	}
	/* FeatureManager connector lines. */
	.tree-branch li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--line);
	}
	.tree-branch li:last-child::before {
		bottom: 50%;
	}
	.tree-branch li::after {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		width: 10px;
		height: 1px;
		background: var(--line);
	}
	.tree-leaf {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-body);
		font-weight: 500;
		font-size: 0.82rem;
		color: var(--white);
		text-decoration: none;
		padding: 0.22rem 0.3rem;
		border-radius: 6px;
		transition:
			color 0.2s ease,
			text-shadow 0.2s ease,
			background-color 0.2s ease;
	}
	.leaf-tick {
		width: 5px;
		height: 5px;
		flex: none;
		border: 1px solid currentColor;
		transform: rotate(45deg);
		opacity: 0.65;
	}
	a.tree-leaf.modeling:hover,
	a.tree-leaf.modeling.active {
		background: rgba(0, 255, 65, 0.08);
		color: var(--green);
		text-shadow: 0 0 8px rgba(0, 255, 65, 0.55);
	}
	a.tree-leaf.knowledge:hover,
	a.tree-leaf.knowledge.active {
		background: rgba(0, 240, 255, 0.08);
		color: var(--cyan);
		text-shadow: 0 0 8px rgba(0, 240, 255, 0.55);
	}
	a.tree-leaf.active {
		background: var(--panel-2);
	}
	.tree-leaf.wip {
		color: var(--dim);
	}
	.wip-chip {
		margin-left: auto;
		font-family: var(--font-data);
		font-size: 0.52rem;
		letter-spacing: 0.12em;
		color: var(--dim);
		border: 1px solid var(--line);
		border-radius: 4px;
		padding: 0 0.3rem;
	}
	.tree-foot {
		display: flex;
		flex-direction: column;
		gap: 0.12rem;
		margin-top: 0.8rem;
		padding-top: 0.55rem;
		border-top: 1px solid var(--line);
		font-family: var(--font-data);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		color: var(--dim);
	}
</style>
