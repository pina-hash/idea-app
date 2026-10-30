<script lang="ts">
	/**
	 * THE APP ITSELF, DRAWN ON ITS LAUNCHER CARD (ledger 0472, decision 73).
	 *
	 * Each card is its page's own composition, and two independent reviews
	 * (2026-10-29) set the bar: a card must be told from every other card
	 * with every word on it hidden. So the drawing is never one chassis
	 * with different contents. My Classes is two class tiles edge to edge
	 * under a centred name; the Armory is its file list with the name at
	 * the foot; the Market is its two-column page, offers left and trades
	 * right; the Admin console is its tab rail over a centred name and the
	 * glowing identity strip; GREENLINE is its title screen, the chrome
	 * wordmark centred between floodlights over the streak and its burst;
	 * FRC is its white header strip, the blue rule and the domain cards.
	 * The Coin Ledger is its two stat tiles and tab keys under its name;
	 * VANGUARD is its playfield column on black with the pathway panel at
	 * its left. Where the title sits is the card's own (`--rm-align`,
	 * `--rm-justify`, `--rm-head-drop` in cards.css), and the drawing fills
	 * the rest. The Foundry alone keeps a picture at the card's right end
	 * (a MOTIF) beside its title.
	 *
	 * Every colour comes from the card's `--rm-*` properties (`cards.css`,
	 * traced to each room's own files); nothing here names a colour of its
	 * own but the Foundry's molten pour, which is MoltenSeam's. Every word is
	 * a placeholder that reads like the page, never anybody's name, and none
	 * is smaller than 9px, because a phone shows the card at the same size.
	 *
	 * DECORATION, AND MARKED AS SUCH: the whole layer is aria-hidden, takes
	 * no pointer events, and declares itself `data-miniature`, the browser
	 * pass's mark for a picture of text (ledger 0469's 11px type floor reads
	 * a card's real words, its title, description and key, and counts the
	 * drawing's 9px placeholders as a picture rather than judging them); the card's real words are its title and its key. It
	 * does not move; the card's mark is the one thing that plays, once, under
	 * prefers-reduced-motion: no-preference.
	 */
	import { COIN_SYMBOL } from '$lib/coin-format';

	let { app }: { app: string } = $props();
</script>

<span class="art" data-art={app} aria-hidden="true" data-miniature>
	{#if app === 'classroom'}
		<!-- My Classes: two class tiles edge to edge, each a big brass mortarboard, the code and Open, the title on up to two lines. -->
		<span class="scene cls">
			{#each [['IDEA100', 'Intro to Engineering Design'], ['IDEA209H', 'Engineering I Honors']] as [code, name] (code)}
				<span class="cls-tile">
					<span class="cls-key"><svg viewBox="0 0 16 16"><path d="M1.5 6 8 3l6.5 3L8 9z M4 7.4v3.1c2.4 1.6 5.6 1.6 8 0V7.4 M14.5 6v4" /></svg></span>
					<span class="cls-text"><span class="cls-head"><span class="cls-code">{code}</span><span class="cls-open">Open &#9656;</span></span><span class="cls-name">{name}</span></span>
				</span>
			{/each}
		</span>
	{:else if app === 'notebook'}
		<!-- The camera island with a page squared up by its handles, the not-filed tag, and the two photo keys. -->
		<span class="scene nb">
			<span class="nb-shot">
				<svg viewBox="0 0 60 44" preserveAspectRatio="xMidYMid meet">
					<polygon class="f2" points="12,6 49,4 52,38 9,40" />
					{#each [12, 17, 22, 27, 32] as y (y)}<line class="s3" x1="14" y1={y} x2="48" y2={y - 1.2} stroke-width="0.5" opacity="0.4" />{/each}
					{#each [[12, 6], [49, 4], [52, 38], [9, 40]] as [cx, cy] (cx)}<circle class="f1 s2" cx={cx} cy={cy} r="2.6" stroke-width="1.2" />{/each}
				</svg>
			</span>
			<span class="nb-side">
				<span class="nb-tag"><svg viewBox="0 0 12 12"><path d="M6 1.5 11 10.5H1z M6 5v2.6 M6 8.8v.2" /></svg>Not filed yet</span>
				<span class="nb-keys"><span class="nb-key">Take a photo</span><span class="nb-key">Choose a photo</span></span>
			</span>
		</span>
	{:else if app === 'ideacad'}
		<!-- The workspace in three panes: the feature tree, the viewport and its revolved body, the property column. -->
		<span class="scene ic">
			<span class="ic-tree">
				<span class="ic-row on"><i></i>Body Revolve</span>
				<span class="ic-row"><i></i>Hex Extension</span>
				<span class="ic-row"><i></i>Blade Sketch</span>
			</span>
			<span class="ic-view">
				<svg viewBox="4 2 72 42" preserveAspectRatio="xMidYMid meet">
					<defs>
						<linearGradient id="la-ic-body" x1="0" y1="0" x2="1" y2="0">
							<stop offset="0" style="stop-color: var(--rm-a10)" />
							<stop offset="0.45" style="stop-color: var(--rm-a9)" />
							<stop offset="1" style="stop-color: var(--rm-a10)" />
						</linearGradient>
					</defs>
					{#each [0, 1, 2, 3] as i (i)}<line class="s6" x1={-8 + i * 26} y1="44" x2={18 + i * 26} y2="26" stroke-width="0.6" />{/each}
					<line class="s6" x1="0" y1="36" x2="80" y2="36" stroke-width="0.6" />
					<path d="M23 38 V21 Q23 10 40 10 Q57 10 57 21 V38 A17 3.2 0 0 1 23 38z" fill="url(#la-ic-body)" />
					<ellipse cx="40" cy="10.6" rx="9" ry="2.6" class="f9" />
					<polygon points="36,10.6 38,8.4 42,8.4 44,10.6 42,12.8 38,12.8" class="f10" />
					<path d="M23 21 Q23 10 40 10" fill="none" class="s9" stroke-width="0.6" opacity="0.7" />
				</svg>
			</span>
			<span class="ic-props">
				<span class="ic-k">Diameter</span>
				<span class="ic-v">4.26 in <b>Pass</b></span>
				<span class="ic-k">Full height</span>
				<span class="ic-v">2.95 in <b>Pass</b></span>
			</span>
		</span>
	{:else if app === 'armory'}
		<!-- The project's tab keys (FILES lit) over the file list: a file row with its check ring, and the DRIVETRAIN folder. -->
		<span class="scene ar">
			<span class="ar-keys"><span class="ar-key lit">Files (5)</span><span class="ar-key">Checked out (2)</span><span class="ar-key">Team</span></span>
			<span class="ar-row">
				<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" /><path d="M3.6 6.1 5.3 7.8 8.5 4.4" /></svg>
				<span class="ar-name">Robot 2026.SLDASM</span><span class="ar-ok">Available</span>
			</span>
			<span class="ar-folder"><i>&#9656;</i>Drivetrain<span class="ar-count">3 files</span></span>
		</span>
	{:else if app === 'maps'}
		<!-- The plan in its frame: Machine Shop, Mill Room and Weld Bay filled the plan's green, and the zoom keys in their own column. -->
		<span class="scene mp">
			<svg class="mp-plan" viewBox="0 0 300 52" preserveAspectRatio="none">
				<rect class="s3" x="1" y="1" width="298" height="50" fill="none" stroke-width="1" vector-effect="non-scaling-stroke" />
				<rect class="f2 s1" x="10" y="8" width="96" height="36" stroke-width="1" vector-effect="non-scaling-stroke" />
				<rect class="f2 s1" x="116" y="8" width="74" height="36" stroke-width="1" vector-effect="non-scaling-stroke" />
				<polygon class="f2 s1" points="204,6 290,11 284,46 214,48 198,28" stroke-width="1" vector-effect="non-scaling-stroke" />
			</svg>
			<span class="mp-label" style="left: 19.3%">Machine Shop</span>
			<span class="mp-label" style="left: 51%">Mill Room</span>
			<span class="mp-label" style="left: 81.5%">Weld Bay</span>
		</span>
		<span class="mp-keys"><span class="mp-key lit">+In</span><span class="mp-key">-Out</span><span class="mp-key">Fit</span></span>
	{:else if app === 'market'}
		<!-- The page's two columns: the offers grid (one Featured) under the name, and Your trades with its held, done, paid bars. -->
		<span class="mk-grid">
			<span class="mk-tile feat"><span class="mk-tag">&#9733; Featured</span><span class="mk-name">Tissue boxes</span><span class="mk-price">Earn 2{COIN_SYMBOL}</span></span>
			<span class="mk-tile"><span class="mk-name">Eating Pass</span><span class="mk-price">150{COIN_SYMBOL}</span></span>
		</span>
		<span class="mk-trades">
			<span class="mk-head">Your trades</span>
			{#each [['Name tags', '3.50', 1], ['Keychain', '1', 3]] as [name, price, done] (name)}
				<span class="mk-trade">
					<span class="mk-tname">{name}<span>{price}{COIN_SYMBOL}</span></span>
					<span class="mk-bar">{#each [0, 1, 2] as k (k)}<i class:done={k < (done as number)} class:now={k === (done as number)}></i>{/each}</span>
				</span>
			{/each}
			<span class="mk-steps"><span>Held</span><span>Done</span><span>Paid</span></span>
		</span>
	{:else if app === 'gauntlet'}
		<!-- The run's verdict: the lime banner of a first clear, and the time in cyan. -->
		<span class="scene gt">
			<span class="gt-banner"><span class="gt-verdict">Cleared</span><span class="gt-flash">First clear</span></span>
			<span class="gt-time"><span class="gt-k">Time</span><span class="gt-v">1m 11s</span><span class="gt-k">XP</span><span class="gt-v">+135</span></span>
		</span>
	{:else if app === 'tournaments'}
		<!-- The LIVE chip and the pip strip in the head, and the bracket: four seeded matches meeting in round two. -->
		<span class="tn-head"><span class="tn-tag">&#9678; Live</span><span class="tn-pips">{#each Array(8) as _, i (i)}<i class:live={i === 0}></i>{/each}</span></span>
		<span class="scene tn">
			{#each [[['Vortex', 1, 'v'], ['Zephyr', 16, '']], [['Fluxline', 8, ''], ['Anvil', 9, '']]] as pair, i (i)}
				<span class="tn-match" class:live={i === 0} style="grid-area: m{i + 1}">
					{#each pair as [name, seed, bar] (name)}<span class="tn-entry"><i class={bar as string}></i>{name}<b>#{seed}</b></span>{/each}
				</span>
			{/each}
			<span class="tn-join l" style="grid-area: j1"></span>
			<span class="tn-match r2" style="grid-area: r1"><span class="tn-entry tbd"><i></i>TBD</span><span class="tn-entry tbd"><i></i>TBD</span></span>
			<span class="tn-match r2" style="grid-area: r2"><span class="tn-entry tbd"><i></i>TBD</span><span class="tn-entry tbd"><i></i>TBD</span></span>
			<span class="tn-join r" style="grid-area: j2"></span>
			{#each [[['Gearbox', 4, 'o'], ['Dynamo', 13, '']], [['Sawtooth', 5, 'g'], ['Falcon', 12, '']]] as pair, i (i)}
				<span class="tn-match" style="grid-area: m{i + 3}">
					{#each pair as [name, seed, bar] (name)}<span class="tn-entry"><i class={bar as string}></i>{name}<b>#{seed}</b></span>{/each}
				</span>
			{/each}
		</span>
	{:else if app === 'dashboard'}
		<!-- The console: the bordered tab rail across the top, the name centred under it, the identity strip glowing below. -->
		<span class="ad-rail">
			{#each ['Console', 'Feedback', 'View as', 'Connector'] as tab, i (tab)}<span class="ad-tab" class:lit={i === 0}>{tab}</span>{/each}
		</span>
		<span class="ad-strip">
			<span class="ad-name">T. Vargas</span><i></i><span class="ad-role">teacher</span><i></i><span class="ad-count">9</span><span class="ad-k">Waiting on you</span>
		</span>
	{:else if app === 'greenline'}
		<!-- The title screen: floodlights on two poles, the green streak raking across, and the spark burst where it meets the wordmark. -->
		<svg class="gl" viewBox="0 0 340 88" preserveAspectRatio="xMidYMid slice" focusable="false">
			<defs>
				<linearGradient id="la-gl-cone" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" style="stop-color: var(--rm-a1); stop-opacity: 0.22" />
					<stop offset="1" style="stop-color: var(--rm-a1); stop-opacity: 0" />
				</linearGradient>
			</defs>
			<polygon points="14,8 -16,88 44,88" fill="url(#la-gl-cone)" />
			<polygon points="326,8 296,88 356,88" fill="url(#la-gl-cone)" />
			<line class="s2" x1="14" y1="8" x2="14" y2="88" stroke-width="1.4" />
			<line class="s2" x1="326" y1="8" x2="326" y2="88" stroke-width="1.4" />
			{#each [10.5, 14, 17.5, 322.5, 326, 329.5] as cx (cx)}<circle class="f1" cx={cx} cy="7" r="1.2" />{/each}
			{#each [[-75, 14], [-50, 16], [-25, 13], [0, 12], [25, 13], [50, 15], [80, 12], [105, 10], [180, 9], [205, 10], [-105, 10], [-155, 9]] as [deg, len], i (i)}
				<line class={i % 3 ? 's5' : 's6'} x1="306" y1="76" x2={306 + Math.cos((deg * Math.PI) / 180) * len} y2={76 + Math.sin((deg * Math.PI) / 180) * len} stroke-width={i % 3 ? 0.9 : 0.6} />
			{/each}
			<circle class="f7" cx="306" cy="76" r="2.2" />
			{#each [[62, 18], [150, 12], [252, 14], [272, 84], [44, 80], [338, 52]] as [cx, cy] (cx)}<circle class="f5" cx={cx} cy={cy} r="0.9" />{/each}
			<path class="line" d="M0 86 L340 72" fill="none" />
			<path class="s4" d="M0 86 L340 72" fill="none" stroke-width="0.7" />
		</svg>
	{:else if app === 'frc'}
		<!-- The page under its white header strip and blue rule: three domain cards, blue on top, each with its shape. -->
		<span class="scene fr">
			{#each ['triangle', 'circle', 'square'] as shape (shape)}
				<span class="fr-card">
					<svg viewBox="0 0 16 16">
						{#if shape === 'triangle'}<polygon class="s1" points="8,2.5 14,13.5 2,13.5" fill="none" stroke-width="1.6" stroke-linejoin="round" />
						{:else if shape === 'circle'}<circle class="s2" cx="8" cy="8" r="5.6" fill="none" stroke-width="1.6" />
						{:else}<rect class="s3" x="2.6" y="2.6" width="10.8" height="10.8" fill="none" stroke-width="1.6" />{/if}
					</svg>
					<span class="fr-lines"><i></i><i></i></span>
				</span>
			{/each}
		</span>
	{:else if app === 'coins'}
		<!-- The Ledger under its name: the particle field, the two stat tiles (a lime dash and a red one), the tab keys with LEADERBOARD lit. -->
		<svg class="cn-field" viewBox="0 0 340 88" preserveAspectRatio="xMidYMid slice" focusable="false">
			<g class="particles">
				{#each [[214, 10, 1, 0.55], [236, 26, 1.2, 0.5], [252, 8, 0.8, 0.4], [268, 22, 1, 0.45], [288, 12, 1.3, 0.6], [300, 28, 0.7, 0.35], [318, 16, 0.9, 0.4], [330, 6, 0.8, 0.5], [226, 4, 0.9, 0.5], [310, 30, 1, 0.4]] as [cx, cy, r, o], i (i)}
					<circle class={i % 2 ? 'f2' : 'f1'} cx={cx} cy={cy} r={r} opacity={o} />
				{/each}
			</g>
		</svg>
		<span class="scene cn">
			<span class="cn-stats">
				<span class="cn-tile"><span class="cn-label">Coins in circulation</span><i class="up"></i></span>
				<span class="cn-tile"><span class="cn-label">Students in debt</span><i class="dn"></i></span>
			</span>
			<span class="cn-tabs">{#each ['Leaderboard', 'Transaction log', 'Analytics'] as tab, i (tab)}<span class="cn-tab" class:lit={i === 0}>{tab}</span>{/each}</span>
		</span>
	{:else if app === 'vanguard'}
		<!-- The arcade page: black, the playfield column between two green rules with the ship and its shots, the rival pathways' squares at the left. -->
		<svg class="vg" viewBox="0 0 340 88" preserveAspectRatio="xMidYMid slice" focusable="false">
			<rect class="f9" x="128" y="0" width="84" height="88" />
			<line class="s9" x1="128" y1="0" x2="128" y2="88" stroke-width="1" />
			<line class="s9" x1="212" y1="0" x2="212" y2="88" stroke-width="1" />
			<rect x="20" y="40" width="34" height="42" rx="3" class="f10 s10" stroke-width="1" />
			{#each [['f3', 46], ['f4', 53], ['f5', 60], ['f6', 67], ['f7', 74]] as [cls, y] (y)}
				<rect class={cls as string} x="26" y={y as number} width="5" height="5" />
				<rect class="f11" x="35" y={(y as number) + 1.5} width="13" height="2" opacity="0.7" />
			{/each}
			<polygon class="f1" points="170,70 176,82 170,78.5 164,82" />
			<rect class="f2" x="169.3" y="56" width="1.4" height="6" />
			<rect class="f2" x="169.3" y="44" width="1.4" height="6" />
			<rect class="s1" x="150" y="40" width="9" height="6" fill="none" stroke-width="1" />
			<rect class="s1" x="184" y="46" width="9" height="6" fill="none" stroke-width="1" />
		</svg>
	{:else}
		{#if app === 'foundry'}
			<!-- The molten seam under the Foundry header, the full width of the card. -->
			<span class="seam"></span>
		{/if}
		<svg class="motif" viewBox="0 0 160 64" preserveAspectRatio="xMaxYMid meet" focusable="false">
			{#if app === 'foundry'}
				<!-- The gallery mosaic: generated covers, each its own hue. -->
				{#each [[64, 6, 30, 22, 230], [98, 6, 22, 22, 290], [124, 6, 34, 22, 55], [64, 32, 22, 14, 170], [90, 32, 30, 14, 10], [124, 32, 34, 14, 120]] as [x, y, w, h, hue] (x * 100 + y)}
					<rect x={x} y={y} width={w} height={h} rx="2" style="fill: hsl({hue} 34% 27%)" />
					<rect x={x} y={y + h / 2} width={w} height={h / 2} rx="2" style="fill: hsl({hue + 18} 40% 15%)" opacity="0.8" />
				{/each}
			{/if}
		</svg>
	{/if}
</span>

<style>
	.art {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		border-radius: inherit;
		pointer-events: none;
		background-image: var(--rm-art-bg, none);
		background-size: var(--rm-art-size, auto);
	}
	/* A scene sits under the card's title row and runs to the card's edges;
	   a composition that puts its title elsewhere moves its own scene. */
	.scene {
		position: absolute;
		top: var(--rm-scene-top, 36px);
		left: 10px;
		right: 10px;
		bottom: 8px;
	}
	.motif {
		position: absolute;
		top: 0;
		right: 0;
		height: 100%;
		width: auto;
		max-width: 46%;
		/* The drawing comes in from nothing at its left edge, so the words on
		   the left of the card stand on the card's own ground. */
		-webkit-mask-image: linear-gradient(to right, transparent 0, #000 42%);
		mask-image: linear-gradient(to right, transparent 0, #000 42%);
	}
	svg {
		display: block;
	}
	.f1 { fill: var(--rm-a1); }
	.f2 { fill: var(--rm-a2); }
	.f3 { fill: var(--rm-a3); }
	.f4 { fill: var(--rm-a4); }
	.f5 { fill: var(--rm-a5); }
	.f6 { fill: var(--rm-a6); }
	.f7 { fill: var(--rm-a7); }
	.f8 { fill: var(--rm-a8); }
	.f9 { fill: var(--rm-a9); }
	.f10 { fill: var(--rm-a10); }
	.s1 { stroke: var(--rm-a1); }
	.s2 { stroke: var(--rm-a2); }
	.s3 { stroke: var(--rm-a3); }
	.s4 { stroke: var(--rm-a4); }
	.s5 { stroke: var(--rm-a5); }
	.s6 { stroke: var(--rm-a6); }
	.s9 { stroke: var(--rm-a8); }
	.f11 { fill: var(--rm-a11); }
	.s10 { stroke: var(--rm-a12); }

	/* ---- Classroom: two class tiles edge to edge, under the centred name ---- */
	.cls {
		top: calc(var(--rm-scene-top, 36px) + 2px);
		left: 6px;
		right: 6px;
		bottom: 6px;
		display: flex;
		gap: 6px;
	}
	.cls-tile {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 8px;
		border: 1px solid var(--rm-a3);
		border-radius: 8px;
		background: linear-gradient(var(--rm-a1), var(--rm-a2));
		box-shadow: inset 0 1px 0 var(--rm-a7);
	}
	.cls-key {
		flex: none;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		border: 1px solid var(--rm-a3);
		border-radius: 6px;
		background: var(--rm-a6);
	}
	.cls-key svg {
		width: 22px;
		height: 22px;
		fill: none;
		stroke: var(--rm-a4);
		stroke-width: 1.2;
		stroke-linejoin: round;
		stroke-linecap: round;
	}
	.cls-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
		line-height: 1.15;
	}
	.cls-head {
		display: flex;
		justify-content: space-between;
		gap: 6px;
	}
	.cls-code,
	.cls-open {
		font: 400 9px var(--font-mono);
		letter-spacing: 0.08em;
		color: var(--rm-a4);
	}
	/* A long course title wraps to a second line rather than losing its end. */
	.cls-name {
		font: 700 11px var(--font-display);
		line-height: 1.1;
		color: var(--rm-a5);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	/* ---- My Notebook: the camera, the not-filed tag, the photo keys --- */
	.nb {
		display: flex;
		gap: 7px;
	}
	.nb-shot {
		position: relative;
		flex: none;
		width: 58px;
		border-radius: 4px;
		background: var(--rm-a1);
	}
	.nb-shot svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.nb-side {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.nb-tag {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 15px;
		padding: 0 6px;
		border-radius: 3px;
		background: var(--rm-a4);
		color: var(--rm-a5);
		font: 400 9px var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.nb-tag svg {
		width: 10px;
		height: 10px;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.3;
		stroke-linejoin: round;
	}
	.nb-keys {
		flex: 1;
		display: flex;
		gap: 5px;
	}
	.nb-key {
		flex: 1;
		min-width: 0;
		display: grid;
		place-items: center;
		border: 1px solid var(--rm-a8);
		border-radius: 9px;
		background: linear-gradient(var(--rm-a6), var(--rm-a7));
		color: var(--rm-a9);
		font: 600 10px var(--font-display);
		white-space: nowrap;
	}

	/* ---- IdeaCAD: tree, viewport, properties, under the head band ------ */
	.ic {
		top: calc(var(--rm-scene-top, 36px) - 2px);
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: 31% minmax(0, 1fr) 30%;
		grid-template-rows: minmax(0, 1fr);
		border-top: 1px solid var(--rm-a6);
	}
	.ic-tree,
	.ic-props {
		background: var(--rm-a1);
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.ic-tree {
		gap: 1px;
		border-right: 1px solid var(--rm-a6);
	}
	.ic-row {
		display: flex;
		align-items: center;
		gap: 5px;
		height: 14px;
		padding: 0 6px;
		font: 500 9.5px var(--font-display);
		color: var(--rm-a3);
		white-space: nowrap;
		overflow: hidden;
	}
	.ic-row i {
		flex: none;
		width: 4px;
		height: 4px;
		background: currentColor;
		rotate: 45deg;
	}
	.ic-row.on {
		background: var(--rm-a4);
		color: var(--rm-a8);
		box-shadow: inset 2px 0 0 var(--rm-a5);
	}
	.ic-row.on i {
		background: var(--rm-a5);
	}
	.ic-view {
		position: relative;
		background: var(--rm-a11);
	}
	.ic-view svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.ic-props {
		gap: 0;
		padding: 0 6px;
		border-left: 1px solid var(--rm-a6);
	}
	.ic-k {
		font: 400 9px var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--rm-a3);
		white-space: nowrap;
	}
	.ic-v {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
		font: 400 9.5px var(--font-mono);
		line-height: 1.3;
		color: var(--rm-a8);
		white-space: nowrap;
	}
	.ic-v b {
		font-weight: 400;
		font-size: 9px;
		line-height: 1.1;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--rm-a5);
		border: 1px solid var(--rm-a5);
		border-radius: 2px;
		padding: 1px 3px;
	}

	/* ---- IDEA Armory: the file list itself, its name at the card's foot ---- */
	.ar {
		top: 4px;
		bottom: 35px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}
	.ar-keys {
		display: flex;
		gap: 4px;
	}
	.ar-key {
		position: relative;
		height: 14px;
		padding: 0 9px 0 6px;
		border: 1px solid var(--rm-a4);
		border-radius: 3px;
		background: linear-gradient(var(--rm-a2), var(--rm-a3));
		color: var(--rm-a5);
		font: 400 9px var(--font-mono);
		letter-spacing: 0.06em;
		line-height: 12px;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.ar-key::after {
		content: '';
		position: absolute;
		right: 2px;
		bottom: 2px;
		width: 2px;
		height: 2px;
		border-radius: 50%;
		background: var(--rm-a7);
	}
	.ar-key.lit {
		border-color: var(--rm-a1);
		box-shadow: 0 0 5px var(--rm-a6);
	}
	.ar-row {
		flex: 0 0 18px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 7px;
		border: 1px solid var(--rm-a4);
		border-radius: 4px;
		background: var(--rm-a8);
	}
	.ar-row svg {
		flex: none;
		width: 12px;
		height: 12px;
		fill: none;
		stroke: var(--rm-a1);
		stroke-width: 1.1;
	}
	.ar-in {
		margin-left: 14px;
		box-shadow: -8px 0 0 -7px var(--rm-a4);
	}
	.ar-name {
		flex: 1;
		min-width: 0;
		font: 600 10px var(--font-display);
		color: var(--rm-a5);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ar-ok {
		font: 700 10px var(--font-display);
		color: var(--rm-a1);
	}
	.ar-folder {
		display: flex;
		align-items: baseline;
		gap: 5px;
		padding: 2px 0 2px 2px;
		font: 400 9px var(--font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--rm-a5);
		line-height: 1;
	}
	.ar-folder i {
		font-style: normal;
		color: var(--rm-a9);
	}
	.ar-count {
		letter-spacing: 0.04em;
		text-transform: none;
		color: var(--rm-a9);
	}

	/* ---- IDEA Maps: three labelled rooms in the frame, the keys apart ------ */
	.mp {
		right: 48px;
	}
	.mp-plan {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.mp-label {
		position: absolute;
		top: 50%;
		translate: -50% -60%;
		font: 400 9px var(--font-mono);
		letter-spacing: 0.04em;
		color: var(--rm-a4);
		white-space: nowrap;
	}
	.mp-keys {
		position: absolute;
		top: 8px;
		right: 8px;
		bottom: 8px;
		width: 32px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.mp-key {
		flex: 1 1 0;
		display: grid;
		place-items: center;
		border: 1px solid var(--rm-a5);
		border-radius: 3px;
		background: var(--rm-a6);
		color: var(--rm-a4);
		font: 400 9px var(--font-mono);
	}
	.mp-key.lit {
		border-color: var(--rm-a1);
		box-shadow: inset 0 0 0 1px var(--rm-a1);
	}

	/* ---- IDEA Market: offers on the left, Your trades down the right ------- */
	.mk-grid {
		position: absolute;
		top: var(--rm-scene-top, 36px);
		left: 10px;
		bottom: 8px;
		width: calc(55% - 14px);
		display: flex;
		gap: 5px;
	}
	.mk-tile {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 3px 6px;
		border: 1px solid var(--rm-a2);
		border-radius: 5px;
		background: var(--rm-a1);
		line-height: 1.2;
	}
	.mk-tile.feat {
		border-color: var(--rm-a3);
	}
	.mk-tag {
		align-self: flex-start;
		margin-bottom: auto;
		padding: 0 3px;
		border-radius: 2px;
		background: var(--rm-a11);
		color: var(--rm-a12);
		font: 400 9px var(--font-mono);
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.mk-name {
		font: 700 10px var(--font-display);
		color: var(--rm-a4);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mk-price {
		font: 400 9.5px var(--font-mono);
		color: var(--rm-a4);
		white-space: nowrap;
	}
	.mk-trades {
		position: absolute;
		top: 7px;
		right: 8px;
		bottom: 7px;
		width: calc(45% - 8px);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 3px 7px 3px;
		border: 1px solid var(--rm-a2);
		border-radius: 6px;
		background: var(--rm-a1);
	}
	.mk-head {
		font: 700 10px var(--font-display);
		color: var(--rm-a4);
		line-height: 1.1;
	}
	.mk-trade {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.mk-tname {
		display: flex;
		justify-content: space-between;
		gap: 6px;
		font: 600 9.5px var(--font-display);
		line-height: 1.1;
		color: var(--rm-a4);
		white-space: nowrap;
	}
	.mk-tname span {
		font: 400 9px var(--font-mono);
	}
	.mk-bar {
		display: flex;
		gap: 3px;
	}
	.mk-bar i {
		flex: 1;
		height: 4px;
		border-radius: 1px;
		background: var(--rm-a2);
	}
	.mk-bar i.done {
		background: var(--rm-a9);
	}
	.mk-bar i.now {
		background: var(--rm-a10);
	}
	.mk-steps {
		display: flex;
		gap: 3px;
	}
	.mk-steps span {
		flex: 1;
		font: 400 9px var(--font-mono);
		letter-spacing: 0.04em;
		line-height: 1;
		text-transform: uppercase;
		color: var(--rm-a5);
	}

	/* ---- GAUNTLET: the first-clear verdict and the run's numbers -------- */
	.gt {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.gt-banner {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 10px;
		border: 1px solid var(--rm-a7);
		border-radius: 8px;
		background: var(--rm-g2);
		box-shadow: 0 0 14px var(--rm-g3);
	}
	.gt-verdict,
	.gt-k {
		font: 400 9px var(--font-mono);
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--rm-a4);
	}
	.gt-flash {
		font: 700 10px var(--font-title);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--rm-a7);
		text-shadow: var(--rm-g1);
	}
	.gt-time {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 0 10px;
	}
	.gt-v {
		margin-right: 12px;
		font: 400 11px var(--font-mono);
		color: var(--rm-a8);
		text-shadow: var(--rm-g4);
	}

	/* ---- Tournaments: LIVE and the pip strip in the head, the bracket ---- */
	.tn-head {
		position: absolute;
		top: 11px;
		right: 10px;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.tn-tag {
		padding: 0 4px;
		border-radius: 2px;
		background: var(--rm-a11);
		color: var(--rm-a12);
		font: 400 9px var(--font-mono);
		letter-spacing: 0.08em;
		line-height: 13px;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.tn-pips {
		display: flex;
		gap: 2px;
	}
	.tn-pips i {
		width: 6px;
		height: 3px;
		border-radius: 1px;
		background: var(--rm-a2);
	}
	.tn-pips i.live {
		background: var(--rm-a10);
	}
	.tn {
		top: calc(var(--rm-scene-top, 36px) - 2px);
		bottom: 6px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 7px minmax(0, 0.62fr) minmax(0, 0.62fr) 7px minmax(0, 1fr);
		grid-template-rows: 1fr 1fr;
		grid-template-areas:
			'm1 j1 r1 r2 j2 m3'
			'm2 j1 r1 r2 j2 m4';
		column-gap: 3px;
		row-gap: 2px;
	}
	.tn-match {
		position: relative;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0;
		padding: 1px 4px;
		border: 1px solid var(--rm-a2);
		border-radius: 3px;
		background: var(--rm-a1);
	}
	.tn-match.live {
		border-color: var(--rm-a10);
	}
	.tn-match.r2 {
		align-self: center;
		height: 60%;
	}
	.tn-entry {
		display: flex;
		align-items: center;
		gap: 3px;
		font: 600 9px var(--font-display);
		line-height: 1.05;
		color: var(--rm-a3);
		white-space: nowrap;
		overflow: hidden;
	}
	.tn-entry i {
		flex: none;
		width: 2px;
		height: 8px;
		background: transparent;
	}
	.tn-entry i.v { background: var(--rm-a7); }
	.tn-entry i.o { background: var(--rm-a8); }
	.tn-entry i.g { background: var(--rm-a9); }
	.tn-entry b {
		font: 400 9px var(--font-mono);
		color: var(--rm-a4);
	}
	.tn-entry.tbd {
		color: var(--rm-a6);
	}
	.tn-join {
		margin: 9px 0;
		border: 1px solid var(--rm-a2);
	}
	.tn-join.l {
		border-left: none;
	}
	.tn-join.r {
		border-right: none;
	}

	/* ---- Admin: the tab rail, the name under it, the identity strip -------- */
	.ad-rail {
		position: absolute;
		top: 6px;
		left: 8px;
		right: 8px;
		display: flex;
		gap: 4px;
		justify-content: center;
		overflow: hidden;
	}
	.ad-tab {
		flex: none;
		height: 15px;
		padding: 0 6px;
		border: 1px solid var(--rm-a3);
		border-radius: 3px;
		background: linear-gradient(var(--rm-a1), var(--rm-a2));
		color: var(--rm-a9);
		font: 400 9px var(--font-mono);
		letter-spacing: 0.08em;
		line-height: 13px;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.ad-tab.lit {
		border-color: var(--rm-a6);
		box-shadow: 0 0 5px var(--rm-a10);
	}
	.ad-strip {
		position: absolute;
		left: 50%;
		bottom: 7px;
		translate: -50% 0;
		height: 26px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		border: 1px solid var(--rm-a3);
		border-radius: 8px;
		background: linear-gradient(var(--rm-a11), var(--rm-a12));
		white-space: nowrap;
	}
	.ad-strip i {
		width: 1px;
		height: 14px;
		background: var(--rm-a3);
	}
	.ad-name,
	.ad-role {
		font: 700 12px var(--font-title);
	}
	.ad-name {
		color: var(--rm-a4);
		text-shadow: var(--rm-g1);
	}
	.ad-role {
		color: var(--rm-a5);
		text-shadow: var(--rm-g3);
	}
	.ad-count {
		font: 700 15px var(--font-title);
		color: var(--rm-a6);
		text-shadow: var(--rm-g2);
	}
	.ad-k {
		font: 400 9px var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--rm-a7);
	}

	/* ---- GREENLINE: the title screen behind the centred chrome wordmark ---- */
	.gl {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.line {
		stroke: var(--rm-a3);
		stroke-width: 2.2;
		filter: drop-shadow(0 0 3px var(--rm-a3));
	}

	/* ---- FRC: three domain cards under the header strip and its blue rule -- */
	.fr {
		top: calc(var(--rm-scene-top, 36px) + 11px);
		bottom: 7px;
		display: flex;
		gap: 6px;
	}
	.fr-card {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 8px;
		border: 1px solid var(--rm-a5);
		border-top: 2px solid var(--rm-a1);
		border-radius: 4px;
		background: var(--rm-a4);
	}
	.fr-card svg {
		flex: none;
		width: 15px;
		height: 15px;
	}
	.fr-lines {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.fr-lines i {
		height: 3px;
		border-radius: 1px;
		background: var(--rm-a6);
		opacity: 0.55;
	}
	.fr-lines i + i {
		width: 62%;
		opacity: 0.35;
	}

	/* ---- The Coin Ledger: two stat tiles and the tab keys under the name --- */
	.cn-field {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.cn {
		top: calc(var(--rm-scene-top, 36px) + 1px);
		bottom: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.cn-stats {
		flex: 1;
		display: flex;
		gap: 5px;
	}
	.cn-tile {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 4px;
		padding: 0 7px;
		border: 1px solid var(--rm-a4);
		border-radius: 4px;
		background: linear-gradient(var(--rm-a5), var(--rm-a6));
	}
	.cn-label {
		font: 400 9px var(--font-title);
		letter-spacing: 0.02em;
		text-transform: uppercase;
		color: var(--rm-a7);
		white-space: nowrap;
		overflow: hidden;
	}
	.cn-tile i {
		width: 14px;
		height: 2px;
		background: var(--rm-a1);
	}
	.cn-tile i.dn {
		background: var(--rm-a3);
	}
	.cn-tabs {
		display: flex;
		gap: 4px;
		overflow: hidden;
	}
	.cn-tab {
		flex: none;
		height: 16px;
		padding: 0 7px;
		border: 1px solid var(--rm-a4);
		border-radius: 4px;
		background: linear-gradient(var(--rm-a8), var(--rm-a9));
		color: var(--rm-a10);
		font: 600 9px var(--font-title);
		letter-spacing: 0.06em;
		line-height: 14px;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.cn-tab.lit {
		border-color: var(--rm-a12);
		background: linear-gradient(var(--rm-a11), var(--rm-a13));
		box-shadow: inset 0 0 0 1px var(--rm-a12);
		color: var(--rm-a14);
	}

	/* ---- VANGUARD: the playfield column and the pathway panel -------------- */
	.vg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	/* ---- The motifs ------------------------------------------------------- */
	.particles {
		display: var(--rm-particles, inline);
	}
	/* The Foundry's molten seam, MoltenSeam's own pour restated at card size. */
	.seam {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 7px;
		height: 5px;
		background: linear-gradient(
			to bottom,
			#1a0d05 0%,
			#572a10 16%,
			#c65a1d 32%,
			#f6952f 45%,
			#ffd9a3 52%,
			#f6952f 61%,
			#c65a1d 76%,
			#572a10 88%,
			#1a0d05 100%
		);
		box-shadow: var(--rm-seam-glow, none);
	}
</style>
