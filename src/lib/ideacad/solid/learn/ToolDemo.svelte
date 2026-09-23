<script lang="ts">
	/**
	 * THE GESTURE, SHOWN. A small drawing of what the tool does, looping in
	 * under three seconds (`DEMO_LOOP_MS`) and only under
	 * `prefers-reduced-motion: no-preference`. The BASE STATE IS THE LAST FRAME:
	 * with motion reduced, or before the animation starts, the finished result
	 * is drawn in full, so the still picture says the same thing. The thing the
	 * tool makes is green, what it started from is the quiet ink, and the
	 * pointer is cyan; the card's words say the rest, so color is never the only
	 * signal.
	 */
	import { hasDemo } from './demos';
	let { tool }: { tool: string } = $props();
</script>
{#if hasDemo(tool)}
	<svg class="demo" viewBox="0 0 128 72" width="128" height="72" aria-hidden="true" data-demo={tool} fill="none" stroke-linecap="round" stroke-linejoin="round">
		{#if tool === 'rectangle'}
			<path class="ground" d="M8 8h112v56H8z" />
			<rect class="made grow-tl" x="24" y="14" width="80" height="44" />
			<circle class="pointer slide" cx="104" cy="58" r="4" style="--dx:-80px;--dy:-44px" />
		{:else if tool === 'circle'}
			<path class="ground" d="M8 8h112v56H8z" />
			<circle class="made grow" cx="64" cy="36" r="24" />
			<path class="was" d="M64 36h24" />
			<circle class="pointer slide" cx="88" cy="36" r="4" style="--dx:-24px;--dy:0px" />
		{:else if tool === 'line'}
			<path class="ground" d="M8 8h112v56H8z" />
			<path class="made draw" pathLength="1" d="M22 56 48 16 84 50 106 18" />
			<circle class="pointer" cx="106" cy="18" r="4" />
		{:else if tool === 'polygon'}
			<path class="ground" d="M8 8h112v56H8z" />
			<path class="made grow" d="M52 14h24l12 22-12 22H52L40 36z" />
			<circle class="pointer slide" cx="76" cy="14" r="4" style="--dx:-12px;--dy:22px" />
		{:else if tool === 'arc'}
			<path class="ground" d="M8 8h112v56H8z" />
			<path class="was" d="M64 52h26" />
			<path class="made draw" pathLength="1" d="M90 52A26 26 0 0 0 38 52" />
			<circle class="pointer" cx="38" cy="52" r="4" />
		{:else if tool === 'extrude'}
			<path class="was" d="M18 58h58l26-14H44z" />
			<g class="rise"><path class="made" d="M18 30h58l26-14H44z" /></g>
			<path class="made stretch" d="M18 58V30M76 58V30M102 44V16" />
			<path class="pointer-line" d="M112 50V22m-4 4 4-4 4 4" />
		{:else if tool === 'revolve'}
			<path class="axis" d="M64 6v60" />
			<ellipse class="made" cx="64" cy="16" rx="24" ry="6" /><ellipse class="made" cx="64" cy="56" rx="24" ry="6" /><path class="made" d="M40 16v40M88 16v40" />
			<path class="was spin" d="M64 16h20v40H64" />
		{:else if tool === 'fillet'}
			<path class="was fade-out" d="M24 62V16h82" />
			<path class="made fade-in" d="M24 62V44a28 28 0 0 1 28-28h54" />
			<circle class="pointer slide" cx="34" cy="26" r="4" style="--dx:-10px;--dy:-10px" />
		{:else if tool === 'chamfer'}
			<path class="was fade-out" d="M24 62V16h82" />
			<path class="made fade-in" d="M24 62V40l24-24h58" />
			<circle class="pointer slide" cx="34" cy="26" r="4" style="--dx:-10px;--dy:-10px" />
		{:else if tool === 'shell'}
			<path class="was" d="M24 60h60l20-12V16H44L24 28z" />
			<path class="made grow" d="M36 52h40l14-8V24H50l-14 8z" />
		{:else if tool === 'hole'}
			<path class="was" d="M14 56h64l36-28H50z" />
			<ellipse class="made grow" cx="64" cy="42" rx="14" ry="7" />
			<circle class="pointer pulse" cx="64" cy="42" r="4" />
		{:else if tool === 'move'}
			<path class="ground" d="M20 30h24v24H20z" />
			<g class="slide" style="--dx:-56px;--dy:0px"><path class="made" d="M76 30h24v24H76z" /></g>
			<path class="pointer-line" d="M52 18h48m-4-4 4 4-4 4" />
		{:else if tool === 'rotate'}
			<path class="ground" d="M52 24h24v24H52z" />
			<g class="turn"><path class="made" d="M52 24h24v24H52z" /></g>
			<path class="pointer-line" d="M92 22a30 30 0 0 1 0 28m-4-4 4 4 4-4" />
		{:else if tool === 'scale'}
			<path class="ground" d="M40 32h20v20H40z" />
			<path class="made grow-bl" d="M40 16h36v36H40z" />
			<path class="pointer-line" d="M84 12l12-8m-6 0h6v6" />
		{:else if tool === 'linear-pattern'}
			<path class="was" d="M14 26h20v20H14z" />
			<path class="made step1" d="M52 26h20v20H52z" /><path class="made step2" d="M90 26h20v20H90z" />
			<path class="pointer-line" d="M14 58h96m-4-4 4 4-4 4" />
		{:else if tool === 'circular-pattern'}
			<circle class="axis" cx="64" cy="36" r="2" />
			<path class="was" d="M58 6h12v12H58z" />
			<path class="made step1" d="M86 46h12v12H86z" /><path class="made step2" d="M30 46h12v12H30z" />
		{:else if tool === 'mate'}
			<path class="ground" d="M16 22h32v32H16z" />
			<g class="slide" style="--dx:30px;--dy:0px"><path class="made" d="M48 26h24v24H48z" /></g>
			<path class="pointer-line" d="M96 38H78m4-4-4 4 4 4" />
		{/if}
	</svg>
{/if}
<style>
	.demo{display:block;width:128px;height:72px;margin-top:8px;background:var(--surface-0);border:1px solid var(--hairline);border-radius:4px}
	.demo *{vector-effect:non-scaling-stroke}
	.ground{stroke:var(--hairline);stroke-width:1}
	.was{stroke:var(--text-2);stroke-width:1.5;stroke-dasharray:3 3}
	.axis{stroke:var(--cyan);stroke-width:1;stroke-dasharray:4 3}
	.made{stroke:var(--green);stroke-width:2}
	.pointer{fill:var(--cyan);stroke:var(--surface-0);stroke-width:1}
	.pointer-line{stroke:var(--cyan);stroke-width:1.5}
	.grow,.grow-tl,.grow-bl,.slide,.turn,.spin,.rise,.stretch,.pulse{transform-box:fill-box}
	.grow,.turn,.pulse{transform-origin:center}.grow-tl{transform-origin:left top}.grow-bl{transform-origin:left bottom}.stretch{transform-origin:center bottom}.spin{transform-origin:left center}
	.fade-out{opacity:.35}
	@media (prefers-reduced-motion: no-preference){
		.grow,.grow-tl,.grow-bl{animation:ic-demo-grow 2.4s ease-out infinite}
		.slide{animation:ic-demo-slide 2.4s ease-out infinite}
		.draw{stroke-dasharray:1;animation:ic-demo-draw 2.4s ease-out infinite}
		.rise{animation:ic-demo-rise 2.4s ease-out infinite}
		.stretch{animation:ic-demo-stretch 2.4s ease-out infinite}
		.turn{animation:ic-demo-turn 2.4s ease-in-out infinite}
		.spin{animation:ic-demo-spin 2.4s ease-in-out infinite}
		.fade-in{animation:ic-demo-in 2.4s ease-out infinite}
		.fade-out{animation:ic-demo-out 2.4s ease-out infinite}
		.pulse{animation:ic-demo-pulse 2.4s ease-out infinite}
		.step1{animation:ic-demo-step1 2.4s linear infinite}.step2{animation:ic-demo-step2 2.4s linear infinite}
	}
	@keyframes ic-demo-grow{0%{transform:scale(.05)}60%,100%{transform:scale(1)}}
	@keyframes ic-demo-slide{0%{transform:translate(var(--dx),var(--dy))}60%,100%{transform:translate(0,0)}}
	@keyframes ic-demo-draw{0%{stroke-dashoffset:1}60%,100%{stroke-dashoffset:0}}
	@keyframes ic-demo-rise{0%{transform:translateY(28px)}60%,100%{transform:translateY(0)}}
	@keyframes ic-demo-stretch{0%{transform:scaleY(.04)}60%,100%{transform:scaleY(1)}}
	@keyframes ic-demo-turn{0%{transform:rotate(0)}60%,100%{transform:rotate(45deg)}}
	@keyframes ic-demo-spin{0%{transform:scaleX(1)}30%{transform:scaleX(-1)}60%,100%{transform:scaleX(1)}}
	@keyframes ic-demo-in{0%,15%{opacity:0}60%,100%{opacity:1}}
	@keyframes ic-demo-out{0%,15%{opacity:1}60%,100%{opacity:.35}}
	@keyframes ic-demo-pulse{0%{transform:scale(1)}20%{transform:scale(1.8)}40%,100%{transform:scale(1)}}
	@keyframes ic-demo-step1{0%,25%{opacity:.15}35%,100%{opacity:1}}
	@keyframes ic-demo-step2{0%,50%{opacity:.15}60%,100%{opacity:1}}
</style>
