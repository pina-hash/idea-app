/**
 * WHAT EACH HOME-SCREEN CARD QUOTES (ledger 0472, decision 73).
 *
 * Mr. Pina, 2026-10-29: "The apps on the home screen are terrible right now
 * ... I would like for the apps to reflect the content. If the app is green
 * inside, it should be green ... It has to be representative, perfectly
 * representative of what is inside that page visually." And: "Each app should
 * be unique visually, completely, like real apps on a computer."
 *
 * So a launcher card is a miniature of its own app: its ground, its accent,
 * its type and the shapes it is remembered by, read off the app's own page
 * and its own stylesheet. This file is the INVENTORY that design was made
 * from, as plain data, and the list of files each card's colours come from.
 *
 *   - `sources` are the room's own files. Every colour `cards.css` names for
 *     a card is either a literal that appears in one of these files or a site
 *     token one of them reads; `tests/home-order-and-accent.test.ts` holds
 *     every card to that, so a colour nobody can trace to the app is refused.
 *   - `followsTheme` says whether the ROOM repaints under Space White. A card
 *     follows its room, not the site theme: GAUNTLET, GREENLINE, VANGUARD,
 *     IdeaCAD and FRC keep their own look on every theme, so their cards do
 *     too.
 *   - `neon` marks the rooms that are neon themselves (decision 73: "Where the
 *     room itself is neon, the card may be neon"). Only their cards may carry
 *     a neon literal (`tests/identity-colors.test.ts`).
 *   - `titleAccent` is the part of the title the room paints in its accent
 *     ("IDEA <Coin> Ledger", "IDEA<CAD>"), so the card says it the same way.
 *
 * PLAIN DATA, client-safe, like portal-apps.ts. No colour lives here: the
 * paint is `cards.css`, keyed on the card's `data-app`, for the cascade
 * reason portal-apps.ts records.
 */

export interface LauncherRoom {
	/** The `PortalApp.id` this card belongs to. */
	id: string;
	/** Repo paths whose colours the card quotes. */
	sources: readonly string[];
	/** The room repaints under Space White (and Matrix), so the card does too. */
	followsTheme: boolean;
	/** The room itself is neon, so its card may be. */
	neon?: boolean;
	/** The part of the title painted in the room's accent, as the room writes it. */
	titleAccent?: string;
	/** The inventory, in words: what dominates the page by area. */
	dominant: string;
	/** Its accent. */
	accent: string;
	/** Its type faces. */
	faces: string;
	/** The shapes and textures a person remembers it by. */
	remembered: string;
}

const PLATE = 'src/lib/classroom/plate.css';
const SITE = 'src/lib/design-system/colors.css';

export const LAUNCHER_ROOMS: readonly LauncherRoom[] = [
	{
		id: 'classroom',
		sources: ['src/lib/classroom/classroom.css', 'src/lib/classroom/MyClasses.svelte', PLATE, SITE],
		followsTheme: true,
		dominant: 'the site plate: charcoal page, My Classes as two columns of raised class tiles',
		accent: 'the hover ink (brass on the dark themes, green on Space White) on the mortarboard, the course code and Open',
		faces: 'Rajdhani 700 class titles, Share Tech Mono course codes and Open',
		remembered: 'MY CLASSES centred over two tall class tiles side by side, each a big mortarboard in a square, the code over the title, Open at its foot'
	},
	{
		id: 'notebook',
		sources: ['src/lib/notebook/notebook-theme.css', 'src/lib/ui/status-tone.ts', SITE, PLATE],
		followsTheme: true,
		dominant: 'the classroom plate, with the dark camera island the photos are corrected on',
		accent: 'the warn tone of the NOT FILED YET tag, the paper white of the photo handles',
		faces: 'Rajdhani 600, Share Tech Mono for the status tags',
		remembered: 'a photographed page squared up by four corner handles, the NOT FILED YET tag, the big rounded Take a photo and Choose a photo keys'
	},
	{
		id: 'ideacad',
		sources: ['src/lib/ideacad/ideacad.css', 'src/lib/ideacad/solid/launch/LaunchPage.svelte', 'src/lib/ideacad/solid/appearance.ts', SITE],
		followsTheme: false,
		titleAccent: 'CAD',
		dominant: 'three panes under a head band: the FeatureManager, the graphite viewport, the PropertyManager',
		accent: 'the brand green: the CAD half of the wordmark, the selected row, the PASS chips, the New model key',
		faces: 'Chakra Petch 700 wordmark, Rajdhani tree rows, Share Tech Mono readouts',
		remembered: 'a green-lit Body Revolve row, a shaded revolved body on a floor grid, readouts each with a PASS chip'
	},
	{
		id: 'armory',
		sources: ['src/lib/armory/armory.css', PLATE, SITE],
		followsTheme: true,
		dominant: 'the site plate: charcoal page, a row of tab keys over the file list',
		accent: 'the green ring of the lit tab key, green check rings and Available on a file nobody holds',
		faces: 'Rajdhani 600 file names, Share Tech Mono keys and chips',
		remembered: 'the FILES (5), CHECKED OUT (2), TEAM tab keys with FILES ringed green over the file list: rows with a check ring and a green Available, the DRIVETRAIN folder, plate keys with a screw dot in the corner'
	},
	{
		id: 'maps',
		sources: ['src/lib/maps/viewer/MapsViewer.svelte', 'src/lib/maps/viewer/MapsPlan.svelte', PLATE, SITE],
		followsTheme: true,
		dominant: 'the plan canvas, its tint to the edges, the frame and rooms washed in the plan accent',
		accent: 'the plan jade (its own darker jade on Space White)',
		faces: 'Share Tech Mono room labels and scale, Rajdhani prose',
		remembered: 'a floor plan: Machine Shop, Mill Room and Weld Bay outlined and filled in a frame, the stacked +In, -Out and Fit keys beside it'
	},
	{
		id: 'coins',
		sources: ['src/lib/legacy/coins/index.html'],
		followsTheme: true,
		neon: true,
		titleAccent: 'Coin',
		dominant: 'near-black green page, a field of drifting particles',
		accent: 'neon green and the chartreuse of "Coin", the active key and the i¢ mark (an olive and a forest green on Space White)',
		faces: 'Orbitron 900 title, Share Tech Mono everything else',
		remembered: 'IDEA Coin Ledger with Coin glowing, the COINS IN CIRCULATION and STUDENTS IN DEBT stat tiles with their lime and red dashes, the tab keys with LEADERBOARD lit, the particle field'
	},
	{
		id: 'market',
		sources: ['src/lib/coin-market/market.css', 'src/lib/ui/status-tone.ts', PLATE, SITE],
		followsTheme: true,
		dominant: 'the site plate with a grid of shop tiles on panel faces, the trades beside them',
		accent: 'the gold Featured tile and tag, the lit readout of the dark balance glass (dark on every theme), the trade bar in green and cyan',
		faces: 'Rajdhani 700 item names, Share Tech Mono prices in i¢ and the balance',
		remembered: 'two columns: the offers grid with its gold Featured tile on the left, Your trades with HELD, DONE, PAID bars down the right'
	},
	{
		id: 'gauntlet',
		sources: ['src/lib/gauntlet/viewport/viewport.css'],
		followsTheme: false,
		neon: true,
		dominant: 'VIEWPORT void, near-black blue, with steel fog and a starfield of particulate',
		accent: 'neon green running into lime on the primary key and the first-clear banner, cyan readouts',
		faces: 'Orbitron headings and the FIRST CLEAR flash, Share Tech Mono data, Rajdhani body',
		remembered: 'the lime-ringed CLEARED banner of a first clear, the run time in glowing cyan, the green-to-lime key'
	},
	{
		id: 'frc',
		sources: ['src/lib/frc/frc-theme.css'],
		followsTheme: false,
		dominant: 'FIRST paper: a near-white page and white cards',
		accent: 'FIRST blue on the rule, the links and the triangle; FIRST red on the circle',
		faces: 'Roboto 700 italic headings, Roboto body',
		remembered: 'the white header strip and the blue rule under it, domain cards with a blue top edge holding a triangle, a circle and a square'
	},
	{
		id: 'greenline',
		sources: ['src/lib/greenline/brand/brand.css'],
		followsTheme: false,
		dominant: 'night: near-black blue with haze rising to the horizon',
		accent: 'the green racing line with its white-hot core, amber sparks, floodlight white',
		faces: 'Archivo Black italic chrome wordmark, Saira Condensed letterspaced UI',
		remembered: 'the chrome italic wordmark centred between floodlight cones on poles, the green streak raking under it, the orange spark burst where they meet, the START box'
	},
	{
		id: 'vanguard',
		sources: ['src/lib/legacy/vanguard/index.html'],
		followsTheme: false,
		neon: true,
		dominant: 'black, the playfield column ruled in green down the middle, the RIVAL PATHWAYS panel at its left',
		accent: 'neon green, glowing',
		faces: 'Chakra Petch 700 letterspaced wordmark, Share Tech Mono',
		remembered: 'the arcade column between two thin green rules with the ship and its shots, the rival pathway squares in five colours, a filled green key'
	},
	{
		id: 'foundry',
		sources: ['src/lib/foundry/forge.css', 'src/lib/foundry/MoltenSeam.svelte', 'src/lib/foundry/FoundryCard.svelte'],
		followsTheme: true,
		dominant: 'iron black with a warm cast (light on Space White), the gallery mosaic of generated covers',
		accent: 'the molten seam: ember, amber and a white-hot core',
		faces: 'Orbitron wordmark, Rajdhani, Share Tech Mono',
		remembered: 'the glowing molten seam under the header, a mosaic of cover tiles'
	},
	{
		id: 'tournaments',
		sources: [
			'src/lib/tournaments/tournaments-theme.css',
			'src/lib/tournaments/BracketView.svelte',
			'src/lib/tournaments/EventRail.svelte',
			'src/lib/identity-style.ts',
			'src/lib/ui/status-tone.ts'
		],
		followsTheme: true,
		dominant: 'deep green-black page, match boxes on a darker panel',
		accent: 'the tournament jade on seeds, the entrants\' own accent bars, the status red of the live match and its pip',
		faces: 'Rajdhani 600 entry names, Share Tech Mono seeds and rounds',
		remembered: 'a bracket of seeded match boxes joined into round two, the LIVE chip on M1, the pip strip of matches'
	},
	{
		id: 'dashboard',
		sources: ['src/routes/dashboard/+page.svelte', 'src/app.css', PLATE, SITE],
		followsTheme: true,
		dominant: 'the site plate: the identity plate over a row of queue keys and the panels',
		accent: 'the glowing cyan name, the brass role, the green count waiting, cyan counts on the keys',
		faces: 'Orbitron identity readout, Share Tech Mono keys and counts',
		remembered: 'the bordered tab rail across the top, ADMIN CONSOLE centred, the glowing identity strip (who, teacher, WAITING ON YOU) under it'
	}
];

/** One room's entry, by app id. */
export function launcherRoom(id: string): LauncherRoom | undefined {
	return LAUNCHER_ROOMS.find((r) => r.id === id);
}
