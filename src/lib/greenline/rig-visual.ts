/**
 * GREENLINE rig visuals: the ONE bodywork builder shared by the race scene
 * (GreenlineRace.svelte) and the garage's 3D preview (GaragePreview.svelte).
 * Extracted from the race component so the machine a player composes in the
 * garage is BY CONSTRUCTION the machine that appears on track: both surfaces
 * call the same `build`, there is no second copy to drift.
 *
 * What lives here: the brand palette as hex ints, the chrome-IBL recipe, the
 * shared vehicle materials, the four archetype part sets (chassis / armor /
 * mount / wheels), and the part-variant layer that maps the loadout's four
 * slots onto the bodywork:
 *
 *   plating    -> the armor group   (composite laminate, reactive exo-cage,
 *                                    stripped bare hull)
 *   drivetrain -> chassis greebles  (overbored scoop + stacks, slipstream
 *                                    fairing + skirts, hot intake + plumbing)
 *   tires      -> the wheel meshes  (slick, all-terrain, hardwall)
 *   systems    -> the rear socket's gear patch (capacitor bank, faraday dome,
 *                                    targeting array)
 *
 * WEAPON MOUNT SOCKETS (Phase 4c): each archetype declares a NAMED set of
 * hardpoints (nose / roof / rear; the VELOCITY dart has no roof) with its own
 * attachment transform, replacing the old single mountPos. build() creates
 * one sub-group per socket under the rig's mount group; every equipped
 * weapon's redesigned mesh seats on the socket the loadout RESOLVES for it
 * (loadout.ts's resolveWeaponSockets — two weapons never share a socket), and
 * empty sockets still show their collar so hardpoints read on the machine.
 * All socket furniture and weapon mass use the per-rig mount material, so the
 * dead-mount charring/tilt applies per socket without losing the pattern.
 *
 * Part variants are positioned off per-archetype ANCHORS (hood / rear deck /
 * tail / deck height / hull dims / gear patch) so every variant layers onto
 * every archetype from one recipe, never per-combination special cases.
 * Geometries are cached and SHARED across vehicles (draw calls are the budget
 * on the aging school desktops); the one exception stays the deformable hull,
 * cloned per vehicle because the crumple system writes its vertices.
 *
 * three.js is browser-only in this repo (dynamic imports), so this module
 * imports three TYPES only and the factory takes the loaded module at
 * runtime.
 */

import type * as THREE from 'three';
import type { WeaponSocketId } from './combat';
import {
	cosmeticColorHex,
	normalizeCosmetics,
	resolveWeaponSockets,
	type Cosmetics,
	type Loadout
} from './loadout';

type ThreeModule = typeof import('three');

/**
 * brand.css tokens as hex ints. The four archetype body tones all come from
 * the chrome/steel ramp; green stays the single signature thread (the
 * player's machine only, green = "your line") and amber is reserved for
 * impact states (hit flash, DOWN, low-hull bar), never decoration.
 */
export const GL = {
	coolRim: 0x78a5cd,
	green: 0x2ae57e,
	amber: 0xffb02e,
	amberWarm: 0xffd9a0,
	chromeMid: 0xcfdae2,
	steel: 0x93a3b0,
	steelDim: 0x6b7b88,
	chromeLo: 0x39454f
};

/** Chassis-frame constants shared by the race physics rig and the preview pose. */
export const COM_DROP = 0.25;
export const WHEEL_RADIUS = 0.45;
export const WHEEL_CONNECTIONS: [number, number, number][] = [
	[1.25, -0.1, 0.95],
	[1.25, -0.1, -0.95],
	[-1.25, -0.1, 0.95],
	[-1.25, -0.1, -0.95]
];

/**
 * Identity of a build's full visual: archetype plus every equipped slot
 * (bodywork AND the two weapon mounts), plus each weapon's RESOLVED socket
 * (4c) — a socket swap alone must rebuild the bodywork exactly like a part
 * swap always has.
 */
export const visualKeyFor = (l: Loadout): string => {
	const s = resolveWeaponSockets(l);
	const c = l.cosmetics;
	return `${l.archetype}|${l.parts.plating}|${l.parts.drivetrain}|${l.parts.tires}|${l.parts.systems}|${l.parts.weaponPrimary}@${s.weaponPrimary ?? '-'}|${l.parts.weaponSecondary}@${s.weaponSecondary ?? '-'}|${c?.color ?? '-'}/${c?.pattern ?? '-'}/${c?.number ?? '-'}/${c?.decal ?? '-'}`;
};

// ---------------------------------------------------------------------------
// Custom decal images (Phase 6c). Cosmetics.decal is an opaque REFERENCE (the
// greenline-decals storage path); this module never talks to Supabase, so the
// page that owns the data layer registers a resolvable URL per ref (a signed
// URL on /greenline, a data: URL in the dev harness) and the texture painter
// below pulls the image through this registry. Module-level on purpose: the
// registration outlives any one createRigVisuals instance, so the garage
// preview and the race scene share one image cache. An unregistered or
// failing ref simply renders no decal — the build never breaks on it.
// ---------------------------------------------------------------------------
const decalSources = new Map<string, string>();
const decalImages = new Map<string, HTMLImageElement | null>(); // null = load failed
const decalLoading = new Set<string>();
const decalWaiters = new Map<string, Set<(img: HTMLImageElement) => void>>();

/** Make a decal ref resolvable (or unresolvable again with url = null). A
 * fresh URL for an already-loaded ref keeps the loaded image; after a FAILED
 * load a re-registration allows a retry (signed URLs expire). */
export function registerDecalImage(ref: string, url: string | null): void {
	if (!ref) return;
	if (!url) {
		decalSources.delete(ref);
		return;
	}
	decalSources.set(ref, url);
	if (decalImages.get(ref) === null) decalImages.delete(ref);
	if (decalWaiters.get(ref)?.size) kickDecalLoad(ref);
}

/** Dev/verification introspection: where a ref's image stands. */
export function decalImageState(ref: string): 'loaded' | 'failed' | 'loading' | 'unresolved' {
	const img = decalImages.get(ref);
	if (img) return 'loaded';
	if (img === null) return 'failed';
	if (decalLoading.has(ref)) return 'loading';
	return 'unresolved';
}

/** The loaded image now, or null — parking `onReady` for a later async load
 * (fires at most once, when/if the image arrives). */
function requestDecalImage(
	ref: string,
	onReady: (img: HTMLImageElement) => void
): HTMLImageElement | null {
	const cached = decalImages.get(ref);
	if (cached) return cached;
	if (cached === null) return null; // failed; a re-registration clears this
	let set = decalWaiters.get(ref);
	if (!set) {
		set = new Set();
		decalWaiters.set(ref, set);
	}
	set.add(onReady);
	kickDecalLoad(ref);
	return null;
}

function kickDecalLoad(ref: string): void {
	const url = decalSources.get(ref);
	if (!url || decalLoading.has(ref) || decalImages.has(ref)) return;
	decalLoading.add(ref);
	const img = new Image();
	// Anonymous CORS so the canvas the image is drawn onto never taints —
	// a tainted canvas cannot upload to WebGL. Supabase storage URLs send
	// CORS headers; data: URLs ignore the attribute (see the dev-harness
	// CORS/taint memory note: this is exactly the class of bug that hides
	// behind data: URLs and only surfaces against real signed URLs).
	img.crossOrigin = 'anonymous';
	img.onload = () => {
		decalLoading.delete(ref);
		decalImages.set(ref, img);
		const ws = decalWaiters.get(ref);
		decalWaiters.delete(ref);
		if (ws) for (const w of ws) w(img);
	};
	img.onerror = () => {
		decalLoading.delete(ref);
		decalImages.set(ref, null);
		decalWaiters.delete(ref);
	};
	img.src = url;
}

export type PartName = 'chassis' | 'armor' | 'mount';
type MatKind = 'hull' | 'canopy' | 'mount' | 'accent' | 'steel' | 'composite' | 'cage';
type TireMatKind = 'tire' | 'tireSlick' | 'tireTerrain' | 'tireHard';

interface VisualNode {
	part: PartName;
	geo: THREE.BufferGeometry;
	mat: MatKind;
	pos: [number, number, number];
	rot?: [number, number, number];
	/** Per-mesh scale over a shared geometry (unit greebles, thickened plates). */
	scale?: [number, number, number];
	/** The crumple target (exactly one per build, in chassis). */
	deform?: boolean;
	/**
	 * mount nodes only: which socket sub-group this node lives in. Positions
	 * on a socket node are SOCKET-LOCAL (the sub-group carries the socket's
	 * world transform), so weapon recipes are written once and seat on any
	 * compatible socket of any archetype.
	 */
	socket?: WeaponSocketId;
	/**
	 * Machine-readable role stamped into mesh.userData.tag: 'weapon' marks
	 * equipped-weapon mass, 'socketBase' marks socket furniture that
	 * DELIBERATELY connects with the hull (collars, pedestals, the systems
	 * rear rack). The dev harnesses' automated clip check reads these to
	 * separate intentional seating from real interpenetration.
	 */
	tag?: 'weapon' | 'socketBase';
	/**
	 * Structural connector (Phase 6a): brackets/struts that bridge the seams
	 * between the modular part groups so the machine reads as assembled, not
	 * floating. 'mount' connectors live in a socket sub-group on the per-rig
	 * mount material (they char + tilt with a dead mount); 'armor' connectors
	 * live in the armor group on the per-rig hull material (they scorch + strip
	 * with the plates). Stamped into mesh.userData.connector so the damage
	 * system's failure FX + reconcile can find them. A connector DELIBERATELY
	 * interpenetrates the two groups it joins, so the clip check skips it.
	 */
	connector?: 'mount' | 'armor';
}

/** One named hardpoint on an archetype's hull: where the socket group sits
 * (COM_DROP frame, like every other node) and how tall its support pedestal
 * is (0 = flush; a raised socket clears the deck greebles under it, e.g. the
 * slipstream fairing, and the pedestal reads as mounted-through hardware). */
interface SocketSpec {
	id: WeaponSocketId;
	pos: [number, number, number];
	base: number;
}

/**
 * Per-archetype attachment anchors, in the COM_DROP group frame: where part
 * variants seat on THIS hull. Every variant reads only these, so a new
 * archetype gets every part visual by filling in its anchors.
 */
interface Anchors {
	/** Front deck point (scoops, intakes). */
	hood: [number, number, number];
	/** Rear deck point (fairings, exhaust height). */
	rear: [number, number, number];
	/** Rear extent of the hull along x. */
	tailX: number;
	/** Hull half width. */
	halfW: number;
	/** Hull top surface y. */
	deckY: number;
	/** Exo-cage roof height (clears the canopy). */
	cageTop: number;
	hullLen: number;
	/** Where the SYSTEMS-slot electronics (capacitor / faraday / targeting)
	 * seat: a clear flank patch near the rear socket, chosen per archetype so
	 * the hardware never contests the socket top a weapon needs (the old
	 * single-mount layout piled both onto one point and they clipped). */
	gear: [number, number, number];
}

interface ArchBase {
	/** Chrome-ramp body tone + finish for the tintable hull mat. */
	tone: number;
	metalness: number;
	roughness: number;
	/**
	 * The named weapon hardpoints THIS hull offers (mirrors this archetype's
	 * `sockets` list in loadout.ts — loadout owns which exist, this owns where
	 * they sit). Every entry renders its socket collar even when empty, so a
	 * chassis visibly shows its hardpoints.
	 */
	sockets: SocketSpec[];
	wheelWidth: number;
	anchors: Anchors;
	nodes: VisualNode[];
}

interface ComposedVisual {
	key: string;
	tone: number;
	metalness: number;
	roughness: number;
	sockets: SocketSpec[];
	nodes: VisualNode[];
	wheelGeo: THREE.BufferGeometry;
	tireMat: TireMatKind;
	/** Hardwall: a reinforcement hoop added as a child of each wheel mesh. */
	wheelBand: boolean;
}

/** What the builder populates: a vehicle's named part groups + wheel meshes. */
export interface VehicleVisualTarget {
	chassis: THREE.Group;
	armor: THREE.Group;
	mount: THREE.Group;
	wheels: THREE.Mesh[];
	/** Per-vehicle tintable hull/plating material (scorch + status tint). */
	hullMat: THREE.MeshStandardMaterial;
	/** Per-vehicle mount material (chars dark while the mount pool is dead). */
	mountMat: THREE.MeshStandardMaterial;
	/** green = the player's signature thread; steel = the AI field's dim rim. */
	accent: 'green' | 'steel';
}

export interface BuiltVehicleVisual {
	key: string;
	/** The body tone the hull mat was set to — the LIVERY color when the build
	 * overrides it, else the archetype tone. Scorch lerps the plates from this. */
	tone: number;
	/** The per-vehicle deformable hull mesh (the crumple target). */
	bodyMesh: THREE.Mesh;
	/** Pristine hull-geometry positions, restored on heal/reset. */
	dentBase: Float32Array;
	/**
	 * Phase 6b livery PATTERN material. When the build carries a livery pattern,
	 * the bodyMesh gets a DEDICATED material carrying a runtime canvas texture
	 * (base color + pattern on the body's UV faces; plates keep the plain hull
	 * material so it never duplicates across them). Its `.color` is a WHITE-based
	 * scorch MULTIPLIER over the map, so the caller tints it alongside hullMat
	 * each frame and the body still chars with damage. null when the build has
	 * no pattern (bodyMesh uses hullMat as before).
	 */
	bodyDecalMat: THREE.MeshStandardMaterial | null;
	/**
	 * Every per-build cosmetic material + texture (the pattern decal, the number
	 * decal, and the number quads' material) the CALLER must dispose on the next
	 * rebuild so a live livery swap never leaks. The number quads themselves are
	 * added to the chassis group and cleared by the next build()'s group.clear().
	 */
	cosmeticDisposables: { dispose(): void }[];
}

export type RigVisuals = ReturnType<typeof createRigVisuals>;

export function createRigVisuals(three: ThreeModule, renderer: THREE.WebGLRenderer) {
	// The brand's chrome-gradient recipe (brand.css: dark band pinned at 51% =
	// the horizon reflection line) translated into an IBL source: a tiny
	// vertical-gradient equirect, PMREM'd once, assigned to the VEHICLE
	// materials only. The bodywork picks up the banded chrome reflection the
	// wordmark carries without relighting the scene around it.
	const chromeEnv = (() => {
		const c = document.createElement('canvas');
		c.width = 16;
		c.height = 128;
		const g2 = c.getContext('2d')!;
		const grad = g2.createLinearGradient(0, 0, 0, 128);
		grad.addColorStop(0.04, '#f7fbfe');
		grad.addColorStop(0.26, '#cfdae2');
		grad.addColorStop(0.44, '#93a3b0');
		grad.addColorStop(0.51, '#39454f');
		grad.addColorStop(0.57, '#b7c5d0');
		grad.addColorStop(0.72, '#eef4f8');
		grad.addColorStop(0.88, '#6b7b88');
		grad.addColorStop(1, '#3f4b55');
		g2.fillStyle = grad;
		g2.fillRect(0, 0, 16, 128);
		const tex = new three.CanvasTexture(c);
		tex.mapping = three.EquirectangularReflectionMapping;
		tex.colorSpace = three.SRGBColorSpace;
		const pmrem = new three.PMREMGenerator(renderer);
		const env = pmrem.fromEquirectangular(tex).texture;
		pmrem.dispose();
		tex.dispose();
		return env;
	})();

	// ---- Shared (untinted) vehicle materials, ONE instance across all rigs;
	// only the hull/plating and mount materials are per-vehicle (see
	// VehicleVisualTarget). ----
	const canopyMat = new three.MeshStandardMaterial({
		color: 0x10161c,
		metalness: 0.6,
		roughness: 0.16,
		envMap: chromeEnv,
		envMapIntensity: 0.9
	});
	const mountBaseMat = new three.MeshStandardMaterial({
		color: 0x1a2128,
		metalness: 0.75,
		roughness: 0.5,
		envMap: chromeEnv,
		envMapIntensity: 0.5
	});
	// The signature thread: green on the player's machine only; the AI field
	// carries the same thread as a dim cool-rim marker, so archetypes read by
	// SILHOUETTE, never by hue.
	const accentGreenMat = new three.MeshStandardMaterial({
		color: 0x0a3d24,
		emissive: GL.green,
		emissiveIntensity: 1.5,
		metalness: 0.2,
		roughness: 0.4
	});
	const accentSteelMat = new three.MeshStandardMaterial({
		color: 0x2b3743,
		emissive: GL.coolRim,
		emissiveIntensity: 0.8,
		metalness: 0.2,
		roughness: 0.4
	});
	// Bolt-on hardware (greebles, cage tubes, wheel bands): darker than the
	// chrome hull, lighter than the near-black mount socket.
	const darkSteelMat = new three.MeshStandardMaterial({
		color: 0x242c34,
		metalness: 0.7,
		roughness: 0.55,
		envMap: chromeEnv,
		envMapIntensity: 0.45
	});
	// Composite plating: matte ceramic laminate layered OVER the chrome body,
	// so heavy armor reads as a different material, not just bigger boxes.
	const compositeMat = new three.MeshStandardMaterial({
		color: 0x525d67,
		metalness: 0.45,
		roughness: 0.75,
		envMap: chromeEnv,
		envMapIntensity: 0.3
	});
	// Faraday dome: a wireframe shell reads as mesh shielding at any distance.
	const cageMat = new three.MeshStandardMaterial({
		color: 0x39454f,
		wireframe: true,
		emissive: GL.coolRim,
		emissiveIntensity: 0.35,
		metalness: 0.4,
		roughness: 0.6
	});
	const tireMat = new three.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.9 });
	const tireSlickMat = new three.MeshStandardMaterial({
		color: 0x15181d,
		metalness: 0.3,
		roughness: 0.22,
		envMap: chromeEnv,
		envMapIntensity: 0.55
	});
	const tireTerrainMat = new three.MeshStandardMaterial({ color: 0x23241c, roughness: 1.0 });
	const tireHardMat = new three.MeshStandardMaterial({ color: 0x101214, roughness: 0.85 });
	const tireMats: Record<TireMatKind, THREE.MeshStandardMaterial> = {
		tire: tireMat,
		tireSlick: tireSlickMat,
		tireTerrain: tireTerrainMat,
		tireHard: tireHardMat
	};
	const allMats = [
		canopyMat,
		mountBaseMat,
		accentGreenMat,
		accentSteelMat,
		darkSteelMat,
		compositeMat,
		cageMat,
		tireMat,
		tireSlickMat,
		tireTerrainMat,
		tireHardMat
	];

	// ---- Geometry caches. Everything created here is shared and disposed
	// together in dispose(); per-vehicle hull clones are the caller's. ----
	const geos = new Set<THREE.BufferGeometry>();
	const track = <G extends THREE.BufferGeometry>(g: G): G => {
		geos.add(g);
		return g;
	};
	const geoCache = new Map<string, THREE.BufferGeometry>();
	const getGeo = (key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry => {
		let g = geoCache.get(key);
		if (!g) {
			g = track(make());
			geoCache.set(key, g);
		}
		return g;
	};

	const box = (l: number, h: number, w: number) => track(new three.BoxGeometry(l, h, w));

	// Collapse one end of a BoxGeometry toward a wedge: past `from` (fraction
	// of the half-length, negative = start behind center), height scales
	// toward the FLOOR (flat underside, dropping nose line) and width toward
	// the centerline, linearly down to ty/tz at the tip. Cheap archetype
	// silhouettes from plain 24-vert boxes.
	const taperEnd = (
		geo: THREE.BoxGeometry,
		dir: 1 | -1,
		from: number,
		ty: number,
		tz: number
	) => {
		const attr = geo.getAttribute('position') as THREE.BufferAttribute;
		const arr = attr.array as Float32Array;
		let half = 0;
		let hh = 0;
		for (let i = 0; i < arr.length; i += 3) {
			half = Math.max(half, Math.abs(arr[i]));
			hh = Math.max(hh, Math.abs(arr[i + 1]));
		}
		const x0 = from * half;
		for (let i = 0; i < arr.length; i += 3) {
			const x = arr[i] * dir;
			if (x <= x0) continue;
			const f = (x - x0) / (half - x0);
			arr[i + 1] = -hh + (arr[i + 1] + hh) * (1 - f * (1 - ty));
			arr[i + 2] *= 1 - f * (1 - tz);
		}
		geo.computeVertexNormals();
		return geo;
	};

	// Socket collar radius per archetype (armor's hardpoints are chunkiest,
	// handling's slimmest). Shared by the collar furniture and the mount
	// connectors so both size to the same hardpoint.
	const sockRadiusFor = (arch: string) =>
		arch === 'armor' ? 0.24 : arch === 'handling' ? 0.16 : 0.18;

	// One hardpoint's built-in furniture, in SOCKET-LOCAL space (the socket
	// sub-group carries the world transform): the collar disc + cap every
	// socket shows even when empty, plus a support pedestal when the socket
	// rides above its deck (base > 0). Geometries cache by radius/height so
	// same-shaped sockets share.
	const socketNodes = (id: WeaponSocketId, base: number, r: number): VisualNode[] => {
		const nodes: VisualNode[] = [
			{
				part: 'mount',
				geo: getGeo(`sockDisc-${r}`, () => new three.CylinderGeometry(r, r + 0.04, 0.12, 14)),
				mat: 'mount',
				pos: [0, 0, 0],
				socket: id,
				tag: 'socketBase'
			},
			{
				part: 'mount',
				geo: getGeo(`sockCap-${r}`, () => new three.CylinderGeometry(r * 0.4, r * 0.4, 0.1, 10)),
				mat: 'mount',
				pos: [0, 0.09, 0],
				socket: id,
				tag: 'socketBase'
			}
		];
		if (base > 0.05) {
			nodes.push({
				part: 'mount',
				geo: unitCyl(),
				mat: 'mount',
				pos: [0, -base / 2, 0],
				scale: [0.15, base, 0.15],
				socket: id,
				tag: 'socketBase'
			});
		}
		return nodes;
	};

	// Unit primitives for greebles/cage: ONE geometry each, per-node scale.
	const unitBox = () => getGeo('unitBox', () => new three.BoxGeometry(1, 1, 1));
	const unitCyl = () => getGeo('unitCyl', () => new three.CylinderGeometry(0.5, 0.5, 1, 12));
	const unitTube = () => getGeo('unitTube', () => new three.CylinderGeometry(0.5, 0.5, 1, 8));

	// ---- One base visual part set per archetype, echoing the garage glyph
	// language: ARMOR slab, VELOCITY dart, HANDLING compact apex, SYSTEMS
	// angular + antenna mount. Built once and shared by every vehicle of that
	// archetype; the hull is the one exception, cloned per vehicle because
	// the crumple system deforms its vertices. ----
	const archCache = new Map<string, ArchBase>();
	const archBase = (arch: string): ArchBase => {
		const hit = archCache.get(arch);
		if (hit) return hit;
		let vis: ArchBase;
		if (arch === 'armor') {
			// Juggernaut: tall slab hull under separate bolted plates (plow,
			// skirts, roof, tail) - the glyph's plated seams. Hardpoints: the
			// forward hood slope (ahead of the scoop zone), the big flat cab
			// roof, and the rear deck raised over the fairing/exhaust band.
			vis = {
				tone: GL.steelDim,
				metalness: 0.85,
				roughness: 0.5,
				sockets: [
					// Nose rides above the reactive cage's brush-bar lane
					// (browser clip check).
					{ id: 'nose', pos: [1.55, 0.56, 0], base: 0.2 },
					{ id: 'roof', pos: [-0.5, 1.0, 0], base: 0 },
					{ id: 'rear', pos: [-1.6, 0.8, 0], base: 0.26 }
				],
				wheelWidth: 0.5,
				anchors: {
					hood: [1.05, 0.62, 0],
					rear: [-1.45, 0.6, 0],
					tailX: -1.95,
					halfW: 0.875,
					deckY: 0.55,
					cageTop: 1.05,
					hullLen: 3.8,
					gear: [-1.6, 0.56, -0.52]
				},
				nodes: [
					{ part: 'chassis', geo: taperEnd(box(3.8, 1.0, 1.75), 1, 0.55, 0.72, 0.85), mat: 'hull', pos: [0, 0.05, 0], deform: true },
					{ part: 'chassis', geo: box(1.6, 0.5, 1.45), mat: 'canopy', pos: [-0.5, 0.72, 0] },
					{ part: 'armor', geo: box(0.2, 1.05, 1.85), mat: 'hull', pos: [1.95, -0.02, 0], rot: [0, 0, -0.34] },
					{ part: 'armor', geo: box(2.6, 0.6, 0.16), mat: 'hull', pos: [-0.1, -0.26, 0.97] },
					{ part: 'armor', geo: box(2.6, 0.6, 0.16), mat: 'hull', pos: [-0.1, -0.26, -0.97] },
					{ part: 'armor', geo: box(2.0, 0.14, 1.55), mat: 'hull', pos: [0.15, 0.62, 0] },
					{ part: 'armor', geo: box(0.16, 0.75, 1.6), mat: 'hull', pos: [-1.92, 0.05, 0] },
					{ part: 'armor', geo: box(2.2, 0.05, 0.06), mat: 'accent', pos: [-0.1, -0.26, 1.06] },
					{ part: 'armor', geo: box(2.2, 0.05, 0.06), mat: 'accent', pos: [-0.1, -0.26, -1.06] }
				]
			};
		} else if (arch === 'velocity') {
			// Missile: one long low dart, glass canopy far back, tail fin, twin
			// threads down the rear flanks (the glyph's speed lines). Minimal
			// plating: a nose splitter, nothing else. Hardpoints: NO roof (the
			// tiny canopy is the spine) — one low nose point far up the dart,
			// one rear point raised over the fairing, ahead of the tail fin.
			vis = {
				tone: GL.chromeMid,
				metalness: 0.88,
				roughness: 0.18,
				sockets: [
					// Nose lifts a gun barrel over the cage brush bar; rear rides
					// high enough that a launch tube clears the cage's rear
					// cross-bar (both from the browser clip check).
					{ id: 'nose', pos: [1.4, 0.07, 0], base: 0.16 },
					{ id: 'rear', pos: [-1.42, 0.54, 0], base: 0.36 }
				],
				wheelWidth: 0.3,
				anchors: {
					hood: [0.85, 0.12, 0],
					rear: [-1.55, 0.2, 0],
					tailX: -2.15,
					halfW: 0.75,
					deckY: 0.18,
					cageTop: 0.6,
					hullLen: 4.4,
					gear: [-1.35, 0.18, -0.5]
				},
				nodes: [
					{ part: 'chassis', geo: taperEnd(box(4.4, 0.52, 1.5), 1, -0.2, 0.24, 0.4), mat: 'hull', pos: [0, -0.08, 0], deform: true },
					{ part: 'chassis', geo: taperEnd(box(1.05, 0.34, 0.85), 1, -0.3, 0.45, 0.6), mat: 'canopy', pos: [-0.55, 0.3, 0] },
					{ part: 'chassis', geo: box(0.55, 0.44, 0.07), mat: 'hull', pos: [-2.0, 0.3, 0] },
					{ part: 'armor', geo: box(0.8, 0.08, 1.35), mat: 'hull', pos: [1.75, -0.3, 0] },
					{ part: 'chassis', geo: box(1.5, 0.045, 0.05), mat: 'accent', pos: [-1.3, 0.02, 0.76] },
					{ part: 'chassis', geo: box(1.5, 0.045, 0.05), mat: 'accent', pos: [-1.3, 0.02, -0.76] }
				]
			};
		} else if (arch === 'handling') {
			// Scalpel: short compact shell tapered at BOTH ends, flared
			// wheel-arch fenders, one short apex line under the door.
			// Hardpoints: short hood point past the scoop zone, cab roof, and
			// a rear post over the tail taper.
			vis = {
				tone: GL.steel,
				metalness: 0.88,
				roughness: 0.32,
				sockets: [
					// Both raised/pushed clear of the reactive cage's brush bar
					// and rear cross-bar lanes (browser clip check).
					{ id: 'nose', pos: [1.54, 0.24, 0], base: 0.22 },
					{ id: 'roof', pos: [-0.15, 0.68, 0], base: 0.05 },
					{ id: 'rear', pos: [-1.42, 0.56, 0], base: 0.4 }
				],
				wheelWidth: 0.38,
				anchors: {
					hood: [1.0, 0.2, 0],
					rear: [-1.2, 0.26, 0],
					tailX: -1.6,
					halfW: 0.8,
					deckY: 0.29,
					cageTop: 0.75,
					hullLen: 3.3,
					gear: [-1.15, 0.23, -0.52]
				},
				nodes: [
					{ part: 'chassis', geo: taperEnd(taperEnd(box(3.3, 0.62, 1.6), 1, 0.1, 0.45, 0.6), -1, 0.5, 0.7, 0.8), mat: 'hull', pos: [0, -0.02, 0], deform: true },
					{ part: 'chassis', geo: box(1.35, 0.44, 1.15), mat: 'canopy', pos: [-0.15, 0.42, 0] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [1.25, 0.16, 0.92] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [1.25, 0.16, -0.92] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [-1.25, 0.16, 0.92] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [-1.25, 0.16, -0.92] },
					{ part: 'chassis', geo: box(1.0, 0.045, 0.05), mat: 'accent', pos: [-0.33, -0.2, 0.81] },
					{ part: 'chassis', geo: box(1.0, 0.045, 0.05), mat: 'accent', pos: [-0.33, -0.2, -0.81] }
				]
			};
		} else {
			// Warlock: faceted dark machine, tilted side panels, angled sensor
			// pods, and the antenna mast rising off the rear rack - the
			// glyph's silhouette. The accent is a short spine thread plus the
			// live antenna tip. Hardpoints: wedge-nose point, canopy roof, and
			// the rear RACK — a plate bridging the two sensor pods (the pods
			// leave no deck channel between them, so the rack spans them),
			// which also carries the antenna and the gear flank.
			vis = {
				tone: GL.chromeLo,
				metalness: 0.88,
				roughness: 0.38,
				sockets: [
					// Nose sits just ahead of the hood-greeble zone (scoop lip /
					// intake trumpet; browser clip check).
					{ id: 'nose', pos: [1.66, 0.02, 0], base: 0.07 },
					{ id: 'roof', pos: [-0.05, 0.73, 0], base: 0.05 },
					{ id: 'rear', pos: [-1.25, 0.74, 0], base: 0 }
				],
				wheelWidth: 0.42,
				anchors: {
					hood: [1.15, 0.26, 0],
					rear: [-0.7, 0.4, 0],
					tailX: -1.75,
					halfW: 0.75,
					deckY: 0.36,
					cageTop: 0.82,
					hullLen: 3.6,
					gear: [-1.25, 0.715, -0.5]
				},
				nodes: [
					{ part: 'chassis', geo: taperEnd(box(3.6, 0.72, 1.5), 1, 0.05, 0.4, 0.55), mat: 'hull', pos: [0, 0, 0], deform: true },
					{ part: 'chassis', geo: taperEnd(box(1.25, 0.42, 1.0), 1, -0.2, 0.5, 0.7), mat: 'canopy', pos: [0.15, 0.5, 0] },
					{ part: 'chassis', geo: box(0.8, 0.34, 0.5), mat: 'hull', pos: [-1.2, 0.5, 0.42], rot: [0, 0.4, 0] },
					{ part: 'chassis', geo: box(0.8, 0.34, 0.5), mat: 'hull', pos: [-1.2, 0.5, -0.42], rot: [0, -0.4, 0] },
					{ part: 'armor', geo: box(0.9, 0.1, 1.15), mat: 'hull', pos: [1.55, -0.34, 0] },
					{ part: 'armor', geo: box(1.7, 0.5, 0.14), mat: 'hull', pos: [-0.3, 0.05, 0.82], rot: [0.32, 0, 0] },
					{ part: 'armor', geo: box(1.7, 0.5, 0.14), mat: 'hull', pos: [-0.3, 0.05, -0.82], rot: [-0.32, 0, 0] },
					{ part: 'chassis', geo: box(1.3, 0.04, 0.05), mat: 'accent', pos: [-0.6, 0.38, 0] },
					// The rear rack plate bridging the sensor pods (socket-local
					// to 'rear': the socket sits directly on it).
					{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [0, -0.05, 0], scale: [0.55, 0.05, 1.24], socket: 'rear', tag: 'socketBase' },
					// Antenna mast on the rack's corner, clear of the weapon
					// envelope (the old center mast skewered whatever mounted).
					{ part: 'mount', geo: getGeo('sysMast', () => new three.CylinderGeometry(0.035, 0.035, 1.0, 8)), mat: 'mount', pos: [-0.2, 0.45, 0.3], socket: 'rear', tag: 'socketBase' },
					{ part: 'mount', geo: getGeo('sysMastTip', () => new three.SphereGeometry(0.08, 10, 8)), mat: 'accent', pos: [-0.2, 0.98, 0.3], socket: 'rear', tag: 'socketBase' }
				]
			};
		}
		// Every hardpoint renders its collar disc (and pedestal, when raised)
		// even when empty, so a chassis visibly SHOWS where weapons can seat.
		const sockR = sockRadiusFor(arch);
		for (const s of vis.sockets) vis.nodes.push(...socketNodes(s.id, s.base, sockR));
		archCache.set(arch, vis);
		return vis;
	};

	// ---- Part-variant layers. Each returns nodes positioned off the
	// archetype's anchors, so one recipe fits every hull. ----

	// PLATING plating-composite: the smallest box axis is the plate's
	// thickness; grow it hard, the rest a touch, so plates read as slabs.
	const thickenScale = (g: THREE.BufferGeometry): [number, number, number] => {
		const p = (g as THREE.BoxGeometry).parameters as
			| { width?: number; height?: number; depth?: number }
			| undefined;
		if (!p || p.width == null || p.height == null || p.depth == null) return [1.12, 1.12, 1.12];
		const dims = [p.width, p.height, p.depth];
		const min = Math.min(...dims);
		return dims.map((d) => (d === min ? 1.6 : 1.06)) as [number, number, number];
	};

	// PLATING plating-reactive: a bolted tube exoframe over the hull (side
	// rails, corner posts, roof bars, a nose brush bar). Lives in the armor
	// group, so the cage visibly breaks apart as the armor pool drains.
	const cageNodes = (a: Anchors): VisualNode[] => {
		const railZ = a.halfW + 0.09;
		const railY = a.deckY + 0.1;
		const postH = a.cageTop - railY + 0.08;
		const postY = (railY + a.cageTop) / 2 + 0.02;
		const postX = a.hullLen * 0.27;
		const tube = unitTube();
		const nodes: VisualNode[] = [];
		for (const s of [1, -1]) {
			nodes.push({ part: 'armor', geo: tube, mat: 'steel', pos: [0, railY, s * railZ], rot: [0, 0, Math.PI / 2], scale: [0.09, a.hullLen * 0.6, 0.09] });
			nodes.push({ part: 'armor', geo: tube, mat: 'steel', pos: [postX, postY, s * railZ], scale: [0.08, postH, 0.08] });
			nodes.push({ part: 'armor', geo: tube, mat: 'steel', pos: [-postX, postY, s * railZ], scale: [0.08, postH, 0.08] });
		}
		for (const s of [1, -1]) {
			nodes.push({ part: 'armor', geo: tube, mat: 'steel', pos: [s * postX, a.cageTop, 0], rot: [Math.PI / 2, 0, 0], scale: [0.08, railZ * 2, 0.08] });
		}
		nodes.push({ part: 'armor', geo: tube, mat: 'steel', pos: [a.hullLen * 0.42, a.deckY - 0.05, 0], rot: [Math.PI / 2, 0, 0], scale: [0.09, a.halfW * 1.7, 0.09] });
		return nodes;
	};

	// DRIVETRAIN greebles: attached to the chassis group (the drivetrain has
	// no named part of its own, so it reads as hardware ON the body).
	const drivetrainNodes = (partId: string, a: Anchors): VisualNode[] => {
		const [hx, hy] = a.hood;
		if (partId === 'drive-overbored') {
			// Aggressive and exposed: hood scoop with an open dark lip, twin
			// exhaust stacks raked back off the tail (set wide enough that
			// rear-socket weapon hardware passes between them).
			const exX = a.tailX + 0.18;
			const exY = a.rear[1] + 0.2;
			const exZ = a.halfW * 0.44;
			return [
				{ part: 'chassis', geo: unitBox(), mat: 'steel', pos: [hx, hy + 0.1, 0], scale: [0.55, 0.2, 0.42] },
				{ part: 'chassis', geo: unitBox(), mat: 'canopy', pos: [hx + 0.26, hy + 0.1, 0], scale: [0.1, 0.15, 0.34] },
				{ part: 'chassis', geo: unitCyl(), mat: 'steel', pos: [exX, exY, exZ], rot: [0, 0, 0.5], scale: [0.12, 0.5, 0.12] },
				{ part: 'chassis', geo: unitCyl(), mat: 'steel', pos: [exX, exY, -exZ], rot: [0, 0, 0.5], scale: [0.12, 0.5, 0.12] }
			];
		}
		if (partId === 'drive-slipstream') {
			// Sealed and clean: a gloss aero fairing flowing off the rear deck
			// plus low flush side skirts. No exposed hardware anywhere.
			const [rx, ry] = a.rear;
			const skL = a.hullLen * 0.38;
			const skX = rx + 0.35;
			const skZ = a.halfW + 0.04;
			return [
				{ part: 'chassis', geo: getGeo('slipFairing', () => taperEnd(box(1.2, 0.16, 0.55), -1, 0, 0.3, 0.45)), mat: 'canopy', pos: [rx, ry + 0.08, 0] },
				{ part: 'chassis', geo: unitBox(), mat: 'hull', pos: [skX, -0.28, skZ], scale: [skL, 0.12, 0.06] },
				{ part: 'chassis', geo: unitBox(), mat: 'hull', pos: [skX, -0.28, -skZ], scale: [skL, 0.12, 0.06] }
			];
		}
		if (partId === 'drive-hotintake') {
			// Uncapped power: an open intake trumpet on the hood, a glowing
			// throat, and visible pipe plumbing running back into the body.
			return [
				{ part: 'chassis', geo: getGeo('trumpet', () => new three.CylinderGeometry(0.16, 0.07, 0.22, 12, 1, true)), mat: 'steel', pos: [hx, hy + 0.14, 0.14], rot: [0, 0, -0.45] },
				{ part: 'chassis', geo: unitCyl(), mat: 'accent', pos: [hx + 0.05, hy + 0.2, 0.14], rot: [0, 0, -0.45], scale: [0.24, 0.04, 0.24] },
				{ part: 'chassis', geo: unitCyl(), mat: 'steel', pos: [hx - 0.42, hy + 0.02, 0.14], rot: [0, 0, Math.PI / 2], scale: [0.1, 0.55, 0.1] },
				{ part: 'chassis', geo: unitCyl(), mat: 'steel', pos: [hx - 0.75, hy - 0.06, 0.2], rot: [0.4, 0, 1.1], scale: [0.1, 0.35, 0.1] }
			];
		}
		return [];
	};

	// SYSTEMS variants: electronics seated at the archetype's GEAR anchor (a
	// clear flank patch beside/behind the rear hardpoint, chosen per hull so
	// the hardware never contests the socket top a weapon needs — the old
	// layout piled both onto one point and they interpenetrated). They still
	// live in the REAR socket's group, so they char and tilt with the mount
	// pool exactly as before. `g` is the gear anchor in rear-socket space.
	const systemsNodes = (partId: string, g: [number, number, number]): VisualNode[] => {
		const at = (dx: number, dy: number, dz: number): [number, number, number] => [
			g[0] + dx,
			g[1] + dy,
			g[2] + dz
		];
		if (partId === 'sys-capacitor') {
			// Visible battery bank: base plate, two chunky cells, glowing caps.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: at(0, 0.03, 0), scale: [0.4, 0.05, 0.28], socket: 'rear' },
				{ part: 'mount', geo: unitCyl(), mat: 'canopy', pos: at(-0.09, 0.16, 0), scale: [0.17, 0.22, 0.17], socket: 'rear' },
				{ part: 'mount', geo: unitCyl(), mat: 'canopy', pos: at(0.09, 0.16, 0), scale: [0.17, 0.22, 0.17], socket: 'rear' },
				{ part: 'mount', geo: unitCyl(), mat: 'accent', pos: at(-0.09, 0.28, 0), scale: [0.17, 0.035, 0.17], socket: 'rear' },
				{ part: 'mount', geo: unitCyl(), mat: 'accent', pos: at(0.09, 0.28, 0), scale: [0.17, 0.035, 0.17], socket: 'rear' }
			];
		}
		if (partId === 'sys-faraday') {
			// Mesh shield dome on the gear patch, with a solid rim ring.
			return [
				{ part: 'mount', geo: getGeo('dome16', () => new three.SphereGeometry(0.16, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat: 'cage', pos: at(0, 0.03, 0), socket: 'rear' },
				{ part: 'mount', geo: getGeo('domeRim16', () => new three.TorusGeometry(0.16, 0.02, 6, 18)), mat: 'steel', pos: at(0, 0.035, 0), rot: [Math.PI / 2, 0, 0], socket: 'rear' }
			];
		}
		if (partId === 'sys-targeting') {
			// Sensor array: an angled dish with a lens and a short sighted
			// scope barrel with a lit tip, kept compact on the gear patch.
			return [
				{ part: 'mount', geo: getGeo('dish', () => new three.CylinderGeometry(0.16, 0.05, 0.14, 12)), mat: 'steel', pos: at(0, 0.18, 0), rot: [0, 0, -1.1], socket: 'rear' },
				{ part: 'mount', geo: getGeo('lensS', () => new three.SphereGeometry(0.055, 10, 8)), mat: 'accent', pos: at(0.08, 0.24, 0), socket: 'rear' },
				{ part: 'mount', geo: unitCyl(), mat: 'steel', pos: at(0.04, 0.05, 0), rot: [0, 0, Math.PI / 2], scale: [0.06, 0.36, 0.06], socket: 'rear' },
				{ part: 'mount', geo: getGeo('tipS', () => new three.SphereGeometry(0.035, 8, 6)), mat: 'accent', pos: at(0.23, 0.05, 0), socket: 'rear' }
			];
		}
		return [];
	};

	// EQUIPPED WEAPONS (Phase 4c redesign): every weapon is a bespoke rig of
	// shared primitives authored ONCE in socket-local space (origin = socket
	// collar, +x = vehicle forward) and seated on whichever socket the build
	// resolves, so each recipe is designed inside a common envelope
	// (roughly x -0.25..+forward, y 0..0.45, z within the narrowest deck) and
	// verified against every socket it can legally occupy. The visible mass
	// uses the per-rig 'mount' material ON PURPOSE: a dead mount chars that
	// material dark and knocks each socket askew, so weapons deactivate
	// visually with the pool that powers them. Primary and secondary occupy
	// DIFFERENT sockets by construction (loadout.ts forbids sharing), which is
	// what retired the old side-wing hack and its clipping. An unknown/future
	// weapon id renders a generic hardpoint stub rather than an empty socket.
	const weaponHardware = (weaponId: string): VisualNode[] => {
		const P2 = Math.PI / 2;
		if (weaponId === 'autocannon') {
			// Light rapid gun: compact receiver, vented sleeve over the barrel
			// root, single barrel with a muzzle brake, side ammo drum, and the
			// thin sight thread in the accent color.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [0, 0.15, 0], scale: [0.34, 0.17, 0.17] },
				{ part: 'mount', geo: unitTube(), mat: 'mount', pos: [0.29, 0.17, 0], rot: [0, 0, P2], scale: [0.13, 0.26, 0.13] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.52, 0.17, 0], rot: [0, 0, P2], scale: [0.09, 0.66, 0.09] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.87, 0.17, 0], rot: [0, 0, P2], scale: [0.12, 0.1, 0.12] },
				{ part: 'mount', geo: unitCyl(), mat: 'steel', pos: [-0.09, 0.11, -0.13], rot: [P2, 0, 0], scale: [0.18, 0.09, 0.18] },
				{ part: 'mount', geo: unitBox(), mat: 'accent', pos: [0.02, 0.26, 0], scale: [0.16, 0.025, 0.03] }
			];
		}
		if (weaponId === 'railgun') {
			// Heavy precision: chunky capacitor breech with cooling fins and
			// glowing charge cells, twin accelerator rails flanking a long
			// slug channel, forward muzzle yoke. The longest silhouette in the
			// catalog — length IS the identity.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [-0.02, 0.17, 0], scale: [0.4, 0.22, 0.22] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [-0.13, 0.31, 0], scale: [0.035, 0.09, 0.19] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [-0.02, 0.31, 0], scale: [0.035, 0.09, 0.19] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0.09, 0.31, 0], scale: [0.035, 0.09, 0.19] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0.72, 0.17, 0.055], scale: [1.3, 0.055, 0.03] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0.72, 0.17, -0.055], scale: [1.3, 0.055, 0.03] },
				{ part: 'mount', geo: unitTube(), mat: 'mount', pos: [0.66, 0.17, 0], rot: [0, 0, P2], scale: [0.07, 1.16, 0.07] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [1.32, 0.17, 0], scale: [0.07, 0.16, 0.17] },
				{ part: 'mount', geo: unitBox(), mat: 'accent', pos: [-0.02, 0.17, 0.115], scale: [0.24, 0.1, 0.015] },
				{ part: 'mount', geo: unitBox(), mat: 'accent', pos: [-0.02, 0.17, -0.115], scale: [0.24, 0.1, 0.015] }
			];
		}
		if (weaponId === 'shotgun-burst') {
			// Bumper breacher: short and WIDE, a flared shroud lip around a
			// horizontal row of four muzzle tubes — the anti-railgun shape.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [0.05, 0.14, 0], scale: [0.3, 0.18, 0.4] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0.24, 0.14, 0], scale: [0.08, 0.22, 0.46] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.31, 0.14, -0.15], rot: [0, 0, P2], scale: [0.1, 0.14, 0.1] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.31, 0.14, -0.05], rot: [0, 0, P2], scale: [0.1, 0.14, 0.1] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.31, 0.14, 0.05], rot: [0, 0, P2], scale: [0.1, 0.14, 0.1] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.31, 0.14, 0.15], rot: [0, 0, P2], scale: [0.1, 0.14, 0.1] },
				{ part: 'mount', geo: unitBox(), mat: 'accent', pos: [0.02, 0.245, 0], scale: [0.18, 0.02, 0.3] }
			];
		}
		if (weaponId === 'homing-rocket') {
			// Single launch tube on a cradle, raked slightly up-forward, open
			// mouth ringed in the accent color, guidance fin + sensor bead.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [0, 0.07, 0], scale: [0.3, 0.1, 0.22] },
				{ part: 'mount', geo: unitCyl(), mat: 'mount', pos: [0.03, 0.22, 0], rot: [0, 0, 0.14 - P2], scale: [0.2, 0.56, 0.2] },
				{ part: 'mount', geo: unitTube(), mat: 'accent', pos: [0.3, 0.26, 0], rot: [0, 0, 0.14 - P2], scale: [0.21, 0.03, 0.21] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [-0.13, 0.33, 0], scale: [0.13, 0.12, 0.025] },
				{ part: 'mount', geo: getGeo('wSens', () => new three.SphereGeometry(0.032, 8, 6)), mat: 'accent', pos: [-0.06, 0.33, 0.06] }
			];
		}
		if (weaponId === 'cluster-missile') {
			// Six-tube battery pod: boxy mass, a 2x3 grid of tube mouths on the
			// front face, carry rail on top — heavier ordnance than the rocket.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [0, 0.19, 0], scale: [0.42, 0.28, 0.34] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.22, 0.12, -0.1], rot: [0, 0, P2], scale: [0.11, 0.06, 0.11] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.22, 0.12, 0], rot: [0, 0, P2], scale: [0.11, 0.06, 0.11] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.22, 0.12, 0.1], rot: [0, 0, P2], scale: [0.11, 0.06, 0.11] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.22, 0.26, -0.1], rot: [0, 0, P2], scale: [0.11, 0.06, 0.11] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.22, 0.26, 0], rot: [0, 0, P2], scale: [0.11, 0.06, 0.11] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.22, 0.26, 0.1], rot: [0, 0, P2], scale: [0.11, 0.06, 0.11] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [-0.02, 0.36, 0], scale: [0.3, 0.035, 0.06] },
				{ part: 'mount', geo: unitBox(), mat: 'accent', pos: [0.2, 0.33, 0], scale: [0.05, 0.02, 0.3] }
			];
		}
		if (weaponId === 'caltrops') {
			// Dispenser, not a gun: hopper with a canted lid, a downward-back
			// chute with two spike tips peeking out, hazard strip on the face.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [0, 0.16, 0], scale: [0.3, 0.24, 0.3] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0, 0.29, 0], rot: [0, 0, 0.16], scale: [0.34, 0.04, 0.34] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [-0.21, 0.1, 0], rot: [0, 0, -0.5], scale: [0.16, 0.2, 0.16] },
				{ part: 'mount', geo: getGeo('spikeTip', () => new three.ConeGeometry(0.035, 0.13, 5)), mat: 'steel', pos: [-0.27, 0.03, 0.05], rot: [0, 0, -2.1] },
				{ part: 'mount', geo: getGeo('spikeTip', () => new three.ConeGeometry(0.035, 0.13, 5)), mat: 'steel', pos: [-0.27, 0.03, -0.05], rot: [0, 0, -2.1] },
				{ part: 'mount', geo: unitBox(), mat: 'accent', pos: [0.155, 0.16, 0], scale: [0.015, 0.18, 0.24] }
			];
		}
		if (weaponId === 'auto-turret') {
			// Independent gun: bearing ring, rotating drum, yoked twin barrels,
			// sensor cap glowing on top — reads as a machine that aims itself.
			return [
				{ part: 'mount', geo: unitCyl(), mat: 'mount', pos: [0, 0.03, 0], scale: [0.34, 0.06, 0.34] },
				{ part: 'mount', geo: unitCyl(), mat: 'mount', pos: [0, 0.14, 0], scale: [0.26, 0.16, 0.26] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0.13, 0.19, 0], scale: [0.1, 0.07, 0.18] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.31, 0.19, 0.05], rot: [0, 0, P2], scale: [0.06, 0.3, 0.06] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [0.31, 0.19, -0.05], rot: [0, 0, P2], scale: [0.06, 0.3, 0.06] },
				{ part: 'mount', geo: unitCyl(), mat: 'accent', pos: [0, 0.25, 0], scale: [0.11, 0.05, 0.11] }
			];
		}
		if (weaponId === 'energy-shield') {
			// NOT a gun at all: a small emitter nub — three prongs cradling the
			// glowing core that projects the bubble around the whole vehicle
			// (the race scene renders the translucent field while it is up).
			const prongs: VisualNode[] = [0, 2.094, 4.189].map((a) => ({
				part: 'mount' as const,
				geo: unitTube(),
				mat: 'steel' as const,
				pos: [Math.cos(a) * 0.09, 0.16, Math.sin(a) * 0.09],
				rot: [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45],
				scale: [0.035, 0.17, 0.035]
			}));
			return [
				{ part: 'mount', geo: unitCyl(), mat: 'mount', pos: [0, 0.05, 0], scale: [0.22, 0.1, 0.22] },
				...prongs,
				{ part: 'mount', geo: getGeo('wOrb', () => new three.SphereGeometry(0.075, 12, 10)), mat: 'accent', pos: [0, 0.245, 0] }
			];
		}
		if (weaponId === 'radar-jammer') {
			// Passive ECM: a low radome ahead of a stub mast with a canted
			// panel and lit tip — deliberately short enough for a nose radome.
			return [
				{ part: 'mount', geo: getGeo('wRadome', () => new three.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), mat: 'mount', pos: [0.06, 0.04, 0] },
				{ part: 'mount', geo: unitTube(), mat: 'steel', pos: [-0.13, 0.22, 0], scale: [0.045, 0.34, 0.045] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [-0.13, 0.42, 0], rot: [0, 0.5, 0.25], scale: [0.16, 0.1, 0.02] },
				{ part: 'mount', geo: getGeo('wSens', () => new three.SphereGeometry(0.032, 8, 6)), mat: 'accent', pos: [-0.13, 0.49, 0] }
			];
		}
		if (weaponId === 'deployable-blades') {
			// Spin-up melee: motor block, hub drum, two swept fins folded to
			// the sides (kept inside the narrowest deck's width), accent cap.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [-0.15, 0.1, 0], scale: [0.12, 0.13, 0.16] },
				{ part: 'mount', geo: unitCyl(), mat: 'mount', pos: [0, 0.11, 0], scale: [0.24, 0.17, 0.24] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0, 0.12, 0.18], rot: [0, -0.45, 0.06], scale: [0.07, 0.055, 0.26] },
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0, 0.12, -0.18], rot: [0, 0.45, 0.06], scale: [0.07, 0.055, 0.26] },
				{ part: 'mount', geo: unitCyl(), mat: 'accent', pos: [0, 0.215, 0], scale: [0.11, 0.04, 0.11] }
			];
		}
		// Fallback hardpoint stub for catalog entries without a visual yet.
		return [{ part: 'mount', geo: unitBox(), mat: 'mount', pos: [0, 0.13, 0], scale: [0.24, 0.14, 0.18] }];
	};
	// Seat each equipped weapon's hardware on its RESOLVED socket: same
	// recipe, different socket tag — the socket sub-group carries the
	// transform, so recipes stay socket-agnostic.
	const weaponNodes = (l: Loadout): VisualNode[] => {
		const resolved = resolveWeaponSockets(l);
		const nodes: VisualNode[] = [];
		for (const slot of ['weaponPrimary', 'weaponSecondary'] as const) {
			const id = l.parts[slot];
			const sock = resolved[slot];
			if (!id || id === 'weapon-none' || !sock) continue;
			nodes.push(...weaponHardware(id).map((n) => ({ ...n, socket: sock, tag: 'weapon' as const })));
		}
		return nodes;
	};

	// ---- Structural connectors (Phase 6a). Bracket/strut geometry that
	// bridges the gaps between the modular part groups, so the machine reads as
	// physically assembled rather than four floating pieces. They ride the SAME
	// per-rig materials the damage system already mutates, so a connector under
	// a failing pool degrades with it (see the `connector` field doc). ----

	// MOUNT connectors: every hardpoint gets a pair of small weld gusset tabs at
	// the collar base (reads as fastened to the body); a clearly RAISED socket
	// (a real pedestal gap) additionally gets three struts flanking the pedestal
	// down to a foot at the deck. All socket-local + mat 'mount', so they char
	// and tilt with a dead mount exactly like the socket furniture.
	const mountConnectorNodes = (sockets: SocketSpec[], arch: string): VisualNode[] => {
		const r = sockRadiusFor(arch);
		const nodes: VisualNode[] = [];
		for (const s of sockets) {
			// Weld tabs: two flat wedges just UNDER the collar plane (y < 0, where
			// no weapon mesh reaches — weapons seat at y >= 0), so they read as
			// fastened to the body without ever contesting the weapon envelope.
			for (const sgn of [1, -1]) {
				nodes.push({
					part: 'mount',
					geo: unitBox(),
					mat: 'mount',
					pos: [0, -0.05, sgn * r * 0.85],
					scale: [r * 1.3, 0.05, 0.06],
					socket: s.id,
					connector: 'mount'
				});
			}
			if (s.base >= 0.15) {
				// Struts flanking the pedestal from just under the collar down to
				// the deck, plus a foot disc welded flat to the body.
				const h = s.base + 0.04;
				for (const ang of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {
					nodes.push({
						part: 'mount',
						geo: unitTube(),
						mat: 'mount',
						pos: [Math.cos(ang) * r * 0.78, -h / 2, Math.sin(ang) * r * 0.78],
						scale: [0.05, h, 0.05],
						socket: s.id,
						connector: 'mount'
					});
				}
				nodes.push({
					part: 'mount',
					geo: getGeo('sockFoot', () => new three.CylinderGeometry(r * 0.95, r * 1.1, 0.06, 12)),
					mat: 'mount',
					pos: [0, -h, 0],
					socket: s.id,
					connector: 'mount'
				});
			}
		}
		return nodes;
	};

	// ARMOR connectors: one inner mounting bracket per real plate (hull /
	// composite mat), seated between the plate and the body center so it reads
	// as bolted on. mat 'hull' -> the per-rig hull material, so it scorches with
	// the body and (being an armor-group child) strips with the plates. `plates`
	// is the composed armor plate list AFTER the plating variant, so a stripped
	// build has none and a composite build brackets its thick slabs.
	const armorConnectorNodes = (plates: VisualNode[]): VisualNode[] =>
		plates.map((p) => ({
			part: 'armor' as const,
			geo: unitBox(),
			mat: 'hull' as const,
			// Pulled 15% toward the body center and dropped a touch: a small
			// bracket tucked behind the plate, bridging it to the hull.
			pos: [p.pos[0] * 0.85, p.pos[1] * 0.85 - 0.02, p.pos[2] * 0.85] as [number, number, number],
			scale: [0.14, 0.1, 0.14] as [number, number, number],
			connector: 'armor' as const
		}));

	// TIRES: one geometry per (variant, archetype width), still ONE mesh per
	// wheel; hardwall adds one hoop child. Flat-shade the terrain lugs so the
	// blocky tread reads under light.
	const facet = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
		const ng = g.toNonIndexed();
		ng.computeVertexNormals();
		g.dispose();
		return ng;
	};
	const rotWheel = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
		g.rotateX(Math.PI / 2);
		return g;
	};
	const wheelFor = (
		tires: string,
		width: number
	): { geo: THREE.BufferGeometry; mat: TireMatKind; band: boolean } => {
		if (tires === 'tires-slick') {
			return {
				geo: getGeo(`wheel-slick-${width}`, () => rotWheel(new three.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, width * 1.15, 26))),
				mat: 'tireSlick',
				band: false
			};
		}
		if (tires === 'tires-terrain') {
			return {
				geo: getGeo(`wheel-terrain-${width}`, () => rotWheel(facet(new three.CylinderGeometry(0.47, 0.47, width * 1.05, 9)))),
				mat: 'tireTerrain',
				band: false
			};
		}
		if (tires === 'tires-hardwall') {
			return {
				geo: getGeo(`wheel-hard-${width}`, () => rotWheel(new three.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, width * 1.2, 14))),
				mat: 'tireHard',
				band: true
			};
		}
		return {
			geo: getGeo(`wheel-stock-${width}`, () => rotWheel(new three.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, width, 20))),
			mat: 'tire',
			band: false
		};
	};
	const wheelBandGeo = () => getGeo('wheelBand', () => new three.TorusGeometry(WHEEL_RADIUS, 0.045, 6, 18));

	// ---- Compose archetype x parts into one cached node list. ----
	const composedCache = new Map<string, ComposedVisual>();
	const compose = (l: Loadout): ComposedVisual => {
		const key = visualKeyFor(l);
		const hit = composedCache.get(key);
		if (hit) return hit;
		const base = archBase(l.archetype);
		const a = base.anchors;
		const plating = l.parts.plating;
		const nodes: VisualNode[] = [];
		let strippedAccent = false;
		for (const n of base.nodes) {
			if (n.part === 'armor') {
				if (plating === 'plating-stripped') {
					// Rip the panels off: bare hull, and the flank accent trim
					// goes with the plates it sat on.
					if (n.mat === 'accent') strippedAccent = true;
					continue;
				}
				if (plating === 'plating-composite') {
					if (n.mat === 'hull') {
						nodes.push({ ...n, mat: 'composite', scale: thickenScale(n.geo) });
						continue;
					}
					if (n.mat === 'accent') {
						// Trim rides the plate surface: push it outward with the
						// thickened laminate so it stays a visible seam line.
						const pos: [number, number, number] = [...n.pos];
						const axis = Math.abs(pos[2]) > Math.abs(pos[0]) ? 2 : 0;
						pos[axis] += 0.05 * Math.sign(pos[axis]);
						nodes.push({ ...n, pos });
						continue;
					}
				}
			}
			nodes.push(n);
		}
		if (plating === 'plating-stripped' && strippedAccent) {
			// The signature thread never disappears with the plates: a bare
			// build carries it as a spine line on the exposed deck instead.
			nodes.push({ part: 'chassis', geo: getGeo('stripThread', () => new three.BoxGeometry(0.9, 0.045, 0.05)), mat: 'accent', pos: [a.hood[0] - 0.5, a.deckY + 0.03, 0] });
		}
		// Armor-seam connectors: one inner bracket per real plate present after
		// the plating variant (none on a stripped build; brackets the thick
		// slabs on a composite one).
		nodes.push(
			...armorConnectorNodes(
				nodes.filter((n) => n.part === 'armor' && (n.mat === 'hull' || n.mat === 'composite'))
			)
		);
		if (plating === 'plating-reactive') nodes.push(...cageNodes(a));
		nodes.push(...drivetrainNodes(l.parts.drivetrain, a));
		// The gear anchor expressed in rear-socket space (systems electronics
		// live in the rear socket group so they char/tilt with the mount).
		const rearSock = base.sockets.find((s) => s.id === 'rear') ?? base.sockets[0];
		nodes.push(
			...systemsNodes(l.parts.systems, [
				a.gear[0] - rearSock.pos[0],
				a.gear[1] - rearSock.pos[1],
				a.gear[2] - rearSock.pos[2]
			])
		);
		nodes.push(...weaponNodes(l));
		// Mount-seam connectors: struts/tabs fastening each hardpoint to the body.
		nodes.push(...mountConnectorNodes(base.sockets, l.archetype));
		const wheel = wheelFor(l.parts.tires, base.wheelWidth);
		// Livery color (Phase 6b): a curated palette override, independent of
		// archetype. Falls back to the archetype tone when unset/unknown. This
		// becomes the hull-mat color AND rig.baseColor, so the damage scorch lerps
		// from the CUSTOM base, not the archetype default.
		const tone = cosmeticColorHex(l.cosmetics?.color) ?? base.tone;
		const vis: ComposedVisual = {
			key,
			tone,
			metalness: base.metalness,
			roughness: base.roughness,
			sockets: base.sockets,
			nodes,
			wheelGeo: wheel.geo,
			tireMat: wheel.mat,
			wheelBand: wheel.band
		};
		composedCache.set(key, vis);
		return vis;
	};

	// ---- Livery body texture (Phase 6b). A runtime-generated canvas (NOT a
	// pre-baked asset): the base color fill + the chosen PATTERN, drawn onto a
	// square canvas the body box's per-face UVs sample. Applied ONLY to the
	// bodyMesh's dedicated decal material (plates keep the plain hull material),
	// so the livery never tiles across every plate. The car NUMBER is NOT drawn
	// here — a single square canvas stretches to each face's aspect (up to 3.8:1
	// on the long flanks), which smears a number illegibly; it rides dedicated
	// upright decal quads instead (makeNumberTexture / the quad placements
	// below). Stripes/geometric fills tolerate the stretch, so they stay here. ----
	const makeCosmeticTexture = (cos: Cosmetics, baseHex: number): THREE.CanvasTexture => {
		// 6c: a custom decal is the livery's centerpiece, so its canvas doubles
		// the resolution; pattern-only liveries keep the original cheap 256.
		const S = cos.decal ? 512 : 256;
		const cv = document.createElement('canvas');
		cv.width = cv.height = S;
		const ctx = cv.getContext('2d')!;
		// Full repaint (base fill + pattern + decal image, in that order), so the
		// async decal arrival can redraw the SAME canvas without tracking layers.
		const paint = (img: HTMLImageElement | null) => {
			const toHex = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0');
			ctx.clearRect(0, 0, S, S);
			ctx.fillStyle = toHex(baseHex);
			ctx.fillRect(0, 0, S, S);
			const r = (baseHex >> 16) & 255;
			const g = (baseHex >> 8) & 255;
			const b = baseHex & 255;
			const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
			const light = '#eef3f7';
			const dark = '#111417';
			const inkOn = lum > 0.55 ? dark : light; // contrasts the base
			// Stripes run front-to-back (vertical bands in UV); geometric fills.
			ctx.fillStyle = inkOn;
			const p = cos.pattern;
			if (p === 'stripe') {
				ctx.fillRect(S * 0.42, 0, S * 0.16, S);
			} else if (p === 'twin') {
				ctx.fillRect(S * 0.29, 0, S * 0.09, S);
				ctx.fillRect(S * 0.62, 0, S * 0.09, S);
			} else if (p === 'wedge') {
				ctx.beginPath();
				ctx.moveTo(0, S);
				ctx.lineTo(S, 0);
				ctx.lineTo(S, S);
				ctx.closePath();
				ctx.fill();
			} else if (p === 'checker') {
				const n = 8;
				const cs = S / n;
				for (let iy = 3; iy <= 4; iy++)
					for (let ix = 0; ix < n; ix++)
						if ((ix + iy) % 2 === 0) ctx.fillRect(ix * cs, iy * cs, cs, cs);
			}
			if (img) {
				// Aspect-preserving "contain" into a centered box over the base +
				// pattern: reads as an applied decal, not a full wrap. The box UVs
				// stretch it per face exactly like the pattern — acceptable for an
				// image (the 6b number needed dedicated quads because a GLYPH
				// smears illegibly; a picture just leans).
				const box = S * 0.78;
				const k = Math.min(box / img.width, box / img.height);
				const w = img.width * k;
				const h = img.height * k;
				ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
			}
		};
		const tex = new three.CanvasTexture(cv);
		// The decal image resolves through the module registry, usually async: an
		// immediate cache hit paints now; a later arrival repaints this canvas and
		// re-uploads the texture. A disposed texture just ignores the flag.
		const ready = cos.decal
			? requestDecalImage(cos.decal, (img) => {
					paint(img);
					tex.needsUpdate = true;
				})
			: null;
		paint(ready);
		tex.colorSpace = three.SRGBColorSpace;
		tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
		tex.needsUpdate = true;
		return tex;
	};

	// The car NUMBER as an UPRIGHT decal on a high-contrast rounded plate
	// (transparent elsewhere), sized to a fixed aspect so it never stretches. A
	// dark semi-opaque plate + bright glyph reads on ANY livery color, and the
	// quads that carry it (below) are unlit so it stays legible at race distance
	// in the murky night. The plate is the classic racing-number roundel.
	const makeNumberTexture = (num: number): THREE.CanvasTexture => {
		const W = 176;
		const H = 120;
		const cv = document.createElement('canvas');
		cv.width = W;
		cv.height = H;
		const ctx = cv.getContext('2d')!;
		ctx.clearRect(0, 0, W, H);
		// Rounded contrast plate.
		const pad = 8;
		const r = 16;
		ctx.beginPath();
		ctx.moveTo(pad + r, pad);
		ctx.arcTo(W - pad, pad, W - pad, H - pad, r);
		ctx.arcTo(W - pad, H - pad, pad, H - pad, r);
		ctx.arcTo(pad, H - pad, pad, pad, r);
		ctx.arcTo(pad, pad, W - pad, pad, r);
		ctx.closePath();
		ctx.fillStyle = 'rgba(8, 11, 14, 0.74)';
		ctx.fill();
		ctx.lineWidth = 4;
		ctx.strokeStyle = 'rgba(238, 243, 247, 0.5)';
		ctx.stroke();
		// The glyph.
		const t = String(num);
		ctx.font = `900 ${Math.round(H * 0.66)}px 'Share Tech Mono', 'Arial Black', system-ui, sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.lineJoin = 'round';
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'rgba(4, 6, 8, 0.85)';
		ctx.strokeText(t, W / 2, H * 0.54);
		ctx.fillStyle = '#f2f7fb';
		ctx.fillText(t, W / 2, H * 0.54);
		const tex = new three.CanvasTexture(cv);
		tex.colorSpace = three.SRGBColorSpace;
		tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
		tex.needsUpdate = true;
		return tex;
	};
	// One shared plane for every number decal (per-rig material carries the
	// texture). 0.86 wide x 0.58 tall matches the plate aspect.
	const numberQuadGeo = () =>
		getGeo('numberQuad', () => new three.PlaneGeometry(0.86, 0.58));

	// ---- The builder both surfaces call. Clears the target's part groups,
	// repopulates them from the composed shared geometry set, restyles the
	// per-vehicle hull material, and returns the fresh crumple target. Shared
	// geometries are never disposed here; the caller owns (and disposes) the
	// previous per-vehicle hull clone. ----
	const build = (target: VehicleVisualTarget, l: Loadout): BuiltVehicleVisual => {
		const vis = compose(l);
		const groups = { chassis: target.chassis, armor: target.armor, mount: target.mount };
		for (const grp of [groups.chassis, groups.armor, groups.mount]) grp.clear();
		const matFor = (kind: MatKind): THREE.Material =>
			kind === 'hull'
				? target.hullMat
				: kind === 'canopy'
					? canopyMat
					: kind === 'mount'
						? target.mountMat
						: kind === 'accent'
							? target.accent === 'green'
								? accentGreenMat
								: accentSteelMat
							: kind === 'steel'
								? darkSteelMat
								: kind === 'composite'
									? compositeMat
									: cageMat;
		// The mount group is a neutral parent at the COM_DROP frame; each
		// hardpoint gets its OWN sub-group at that socket's transform. Mount
		// nodes route into their socket's sub-group (positions socket-local),
		// so the dead-mount tilt and any future per-socket dressing act on
		// each hardpoint around its own origin.
		groups.mount.position.set(0, COM_DROP, 0);
		const socketGroups: Partial<Record<WeaponSocketId, THREE.Group>> = {};
		for (const spec of vis.sockets) {
			const sg = new three.Group();
			sg.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
			sg.userData.socketId = spec.id;
			groups.mount.add(sg);
			socketGroups[spec.id] = sg;
		}
		const fallbackSocket = socketGroups.rear ?? socketGroups[vis.sockets[0].id]!;
		let bodyMesh: THREE.Mesh | null = null;
		let dentBase = new Float32Array(0);
		for (const node of vis.nodes) {
			const geo = node.deform ? node.geo.clone() : node.geo;
			const mesh = new three.Mesh(geo, matFor(node.mat));
			mesh.position.set(node.pos[0], node.pos[1], node.pos[2]);
			if (node.rot) mesh.rotation.set(node.rot[0], node.rot[1], node.rot[2]);
			if (node.scale) mesh.scale.set(node.scale[0], node.scale[1], node.scale[2]);
			// Base transform, for the plate-rattle damage jitter restore.
			mesh.userData.base = { pos: mesh.position.clone(), rot: mesh.rotation.clone() };
			if (node.tag) mesh.userData.tag = node.tag;
			if (node.connector) mesh.userData.connector = node.connector;
			if (node.part === 'mount') {
				((node.socket && socketGroups[node.socket]) || fallbackSocket).add(mesh);
			} else {
				groups[node.part].add(mesh);
			}
			if (node.deform) {
				bodyMesh = mesh;
				dentBase = new Float32Array(
					(geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
				);
			}
		}
		const tMat = tireMats[vis.tireMat];
		for (const m of target.wheels) {
			m.geometry = vis.wheelGeo;
			m.material = tMat;
			m.clear();
			if (vis.wheelBand) m.add(new three.Mesh(wheelBandGeo(), darkSteelMat));
		}
		target.hullMat.color.setHex(vis.tone);
		target.hullMat.metalness = vis.metalness;
		target.hullMat.roughness = vis.roughness;
		// Livery (Phase 6b). PATTERN -> a dedicated bodyMesh decal material
		// carrying the base+pattern canvas (plates keep the plain hull mat; its
		// color is a WHITE-based scorch multiplier so the body still chars).
		// NUMBER -> upright, unlit decal quads on both flanks + the tail, so it
		// reads undistorted at race distance and never hides under the canopy.
		// Everything created here is disposed by the caller on the next rebuild;
		// the number quads themselves ride the chassis group and are removed by
		// the next build()'s group.clear().
		let bodyDecalMat: THREE.MeshStandardMaterial | null = null;
		const cosmeticDisposables: { dispose(): void }[] = [];
		const cos = normalizeCosmetics(l.cosmetics);
		// A pattern OR a custom decal ref (6c) puts the canvas texture on the
		// body; a decal whose image never resolves paints base color only, which
		// looks identical to the plain hull material.
		if ((cos?.pattern || cos?.decal) && bodyMesh) {
			const tex = makeCosmeticTexture(cos, vis.tone);
			bodyDecalMat = target.hullMat.clone();
			bodyDecalMat.map = tex;
			bodyDecalMat.color.setHex(0xffffff);
			bodyDecalMat.needsUpdate = true;
			bodyMesh.material = bodyDecalMat;
			cosmeticDisposables.push(tex, bodyDecalMat);
		}
		if (cos?.number != null) {
			const ntex = makeNumberTexture(cos.number);
			const nmat = new three.MeshBasicMaterial({
				map: ntex,
				transparent: true,
				depthWrite: false,
				side: three.DoubleSide
			});
			const a = archBase(l.archetype).anchors;
			const zc = a.halfW + 0.05;
			const yc = a.deckY - 0.1;
			// Right flank (+z), left flank (-z, un-mirrored via scale.x), tail (-x).
			const placements: {
				pos: [number, number, number];
				rot: [number, number, number];
				sx: number;
			}[] = [
				{ pos: [0.15, yc, zc], rot: [0, 0, 0], sx: 1 },
				{ pos: [0.15, yc, -zc], rot: [0, Math.PI, 0], sx: -1 },
				{ pos: [a.tailX - 0.05, a.deckY, 0], rot: [0, -Math.PI / 2, 0], sx: 1 }
			];
			for (const pl of placements) {
				const q = new three.Mesh(numberQuadGeo(), nmat);
				q.position.set(pl.pos[0], pl.pos[1], pl.pos[2]);
				q.rotation.set(pl.rot[0], pl.rot[1], pl.rot[2]);
				q.scale.x = pl.sx;
				// A deliberate surface decal (rides on the hull): tag it so the clip
				// check treats the hull overlap as intentional, and mark it a number
				// decal for introspection.
				q.userData.tag = 'socketBase';
				q.userData.numberDecal = true;
				groups.chassis.add(q);
			}
			cosmeticDisposables.push(ntex, nmat);
		}
		return {
			key: vis.key,
			tone: vis.tone,
			bodyMesh: bodyMesh!,
			dentBase,
			bodyDecalMat,
			cosmeticDisposables
		};
	};

	/** Per-vehicle tintable hull material (the race's browser-tuned recipe). */
	const makeHullMat = () =>
		new three.MeshStandardMaterial({
			color: GL.steel,
			metalness: 0.88,
			roughness: 0.35,
			envMap: chromeEnv,
			// Browser-tuned: below ~1.2 the night side of the bodywork reads
			// flat black instead of banded chrome.
			envMapIntensity: 1.35
		});
	/** Per-vehicle mount material (chars dark while the mount pool is dead). */
	const makeMountMat = () => mountBaseMat.clone();

	const dispose = () => {
		for (const g of geos) g.dispose();
		geos.clear();
		geoCache.clear();
		archCache.clear();
		composedCache.clear();
		for (const m of allMats) m.dispose();
		chromeEnv.dispose();
	};

	return { chromeEnv, build, makeHullMat, makeMountMat, dispose };
}
