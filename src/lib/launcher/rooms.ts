/**
 * WHAT EACH HOME-SCREEN CARD IS LIT BY (ledger 0475, decision 73 as amended
 * the second time, 2026-10-30).
 *
 * Mr. Pina chose direction A, "cinematic light", from four samples: "Gotta
 * go with a cinematic light. But now green line and foundry look weird
 * because they weren't adjusted in the same way. So adjust green line and
 * foundry in the same way and go for that." Every card, GREENLINE and the
 * Foundry included, is a dark film still: the app's filled icon and its
 * title at the left over an eased scrim, ONE light source in the app's hue
 * about two-thirds across, haze, one object, a vignette and faint grain, and
 * no words in the art.
 *
 * THE HUES ARE THE CHOSEN SAMPLE'S, and this file is where they are written
 * down. `source` says where each came from: twelve from the sample he chose
 * (`banners/A.html`, built by its own `dirA.js` and `lib.js`), and GREENLINE
 * and the Foundry from the same sample as redrawn by this ledger, which took
 * their hues from their rooms (GREENLINE's streak green, the Foundry's molten
 * seam). Where a hue departs from its room (the Market's violet, the
 * Armory's steel blue, the Coin Ledger and VANGUARD toned off neon), the
 * sample he chose governs (decision 73, second amendment).
 *
 *   - `hue` is the light; `core` its white-hot centre; `ground` the card's
 *     deep, the colour every word is measured on. `light` is a second, cold
 *     source two scenes use (IdeaCAD's studio light, GREENLINE's floodlight)
 *     and `glow` Maps' beacon, a shade under its hue.
 *   - `title` is how the room sets its own name, in the site's faces.
 *   - `titleAccent` is the part of the title the room paints ("IDEA <Coin>
 *     Ledger", "IDEA<CAD>").
 *   - `scene` says in words what the banner shows, and why a student knows
 *     the app by it.
 *
 * EVERY COLOUR ON A CARD COMES FROM HERE. `./art.ts` draws the scene and the
 * icon from these values, and `cardInks()` there derives the words' inks the
 * way the sample does; `./cards.css` writes those inks out per card, and
 * `tests/home-order-and-accent.test.ts` holds every colour in it to the
 * derivation. A card is a film, not plate: it looks the same on every theme.
 *
 * PLAIN DATA, client-safe, like portal-apps.ts.
 */

export interface LauncherTitle {
	/** A site face token: `--font-display` (Rajdhani), `--font-title` (Orbitron), `--font-mono`, or a room's own face. */
	font: string;
	weight: number;
	/** In px, as the sample sets it; cards.css writes it in rem. */
	size: number;
	track: string;
	case?: 'uppercase';
	style?: 'italic';
}

export interface LauncherRoom {
	/** The `PortalApp.id` this card belongs to. */
	id: string;
	/** The light, as a hex. */
	hue: string;
	/** The white-hot centre of the light. */
	core: string;
	/** The card's deep: its background and the ground every word is measured on. */
	ground: string;
	/** A second, cold light (IdeaCAD's studio light, GREENLINE's floodlight). */
	light?: string;
	/** Maps' beacon, a shade under its hue. */
	glow?: string;
	/** Where these colours were chosen. */
	source: string;
	title: LauncherTitle;
	/** The part of the title painted in the light, as the room writes it. */
	titleAccent?: string;
	/** What the banner shows, in words. */
	scene: string;
}

const SAMPLE = 'chosen sample A, 2026-10-30';
const REDRAWN = 'chosen sample A, 2026-10-30, as redrawn by ledger 0475 at his request';

const RAJ = (size: number, weight = 700, extra: Partial<LauncherTitle> = {}): LauncherTitle => ({ font: 'var(--font-display)', weight, size, track: '0.01em', ...extra });
const ORB = (size: number, weight: number, track: string, upper = false): LauncherTitle => ({ font: 'var(--font-title)', weight, size, track, ...(upper ? { case: 'uppercase' as const } : {}) });

export const LAUNCHER_ROOMS: readonly LauncherRoom[] = [
	{
		id: 'classroom',
		hue: '#c8a848',
		core: '#f7e6b0',
		ground: '#100e09',
		source: SAMPLE,
		title: RAJ(20),
		scene: 'the lit board: a picture light along the top of a dark board, its brass light falling down the face'
	},
	{
		id: 'notebook',
		hue: '#ea984b',
		core: '#fff0dc',
		ground: '#110d09',
		source: SAMPLE,
		title: RAJ(20),
		scene: 'a page under the lamp: one sheet on the desk in a pool of amber light, its far edge catching the bulb'
	},
	{
		id: 'ideacad',
		hue: '#78b870',
		core: '#e4f2e2',
		ground: '#0c1013',
		light: '#b9cbd8',
		source: SAMPLE,
		title: RAJ(19, 700, { track: '0.08em', case: 'uppercase' }),
		titleAccent: 'CAD',
		scene: 'the part on the turntable: a revolved part rim-lit in cool studio light, its revolve axis the one green line'
	},
	{
		id: 'armory',
		hue: '#86aecb',
		core: '#e8f2fa',
		ground: '#0a0e12',
		source: SAMPLE,
		title: RAJ(20),
		scene: 'the vault seam: two steel doors, one drawn back a hand’s width, cold light standing in the gap'
	},
	{
		id: 'maps',
		hue: '#40e3b1',
		core: '#dcfff2',
		ground: '#07110e',
		glow: '#2fc79a',
		source: SAMPLE,
		title: { font: 'var(--font-mono)', weight: 400, size: 17, track: '0.02em' },
		scene: 'the locator on the shop plan, seen from above: one beacon lighting the walls of the room it is in'
	},
	{
		id: 'coins',
		hue: '#b9d43c',
		core: '#f3ffcf',
		ground: '#0b0e06',
		source: SAMPLE,
		title: ORB(14.5, 900, '0.01em'),
		titleAccent: 'Coin',
		scene: 'a coin standing on its edge on black glass, its milled rim catching the light from behind'
	},
	{
		id: 'market',
		hue: '#a58bea',
		core: '#efe8ff',
		ground: '#0d0a14',
		source: SAMPLE,
		title: RAJ(20),
		scene: 'the ticker light: the last trades as one luminous trace, its head the brightest point on the floor'
	},
	{
		id: 'gauntlet',
		hue: '#7fcfee',
		core: '#e6f9ff',
		ground: '#05080b',
		source: SAMPLE,
		title: ORB(13.5, 700, '0.06em', true),
		scene: 'the clock sweep: a great dial’s edge in steel fog, the hand sweeping, the time already run trailing behind it as light'
	},
	{
		id: 'frc',
		hue: '#2f8fe0',
		core: '#e0efff',
		ground: '#050a12',
		source: SAMPLE,
		title: { font: "'Roboto', sans-serif", weight: 700, size: 18, track: '0', style: 'italic' },
		scene: 'the alliance wall at night: the field’s blue LED rail along the floor and one stack light standing over it'
	},
	{
		id: 'greenline',
		hue: '#2ae57e',
		core: '#eafff3',
		ground: '#04060a',
		light: '#eaf4ff',
		source: REDRAWN,
		title: { font: "'Archivo Black', sans-serif", weight: 400, size: 15.5, track: '0.01em', case: 'uppercase', style: 'italic' },
		scene: 'the night track: one floodlight on its mast, its cold cone falling on the asphalt, and the green streak burning across the track where the light lands'
	},
	{
		id: 'vanguard',
		hue: '#52d06e',
		core: '#e4ffe9',
		ground: '#050906',
		source: SAMPLE,
		title: ORB(13.5, 700, '0.1em', true),
		scene: 'the climb: the ship nose-up in the dark, its exhaust burning a straight line down the screen'
	},
	{
		id: 'foundry',
		hue: '#f0782a',
		core: '#ffd9a3',
		ground: '#0d0c0a',
		source: REDRAWN,
		title: ORB(14, 600, '0.12em', true),
		scene: 'the pour: iron black, a crucible tipped high on the right, its molten stream falling into the ingot mould, the floor seam glowing near it'
	},
	{
		id: 'tournaments',
		hue: '#2fcb8b',
		core: '#dcfff0',
		ground: '#06100c',
		source: SAMPLE,
		title: RAJ(18, 600, { track: '0.16em', case: 'uppercase' }),
		scene: 'the final: two seeds’ lines of light meeting in one point under a spotlight, the winner’s line running on'
	},
	{
		id: 'dashboard',
		hue: '#5abda8',
		core: '#dcfbf4',
		ground: '#070f0e',
		source: SAMPLE,
		title: ORB(15.5, 700, '0.04em'),
		scene: 'light through the keyhole: a dark escutcheon on a dark door, the room beyond it lit, the light falling out across the floor'
	}
];

export const launcherRoom = (id: string): LauncherRoom | undefined => LAUNCHER_ROOMS.find((r) => r.id === id);
