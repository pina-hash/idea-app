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
 *   systems    -> the mount group   (capacitor bank, faraday dome, targeting
 *                                    array)
 *
 * Part variants are positioned off per-archetype ANCHORS (hood / rear deck /
 * tail / deck height / hull dims) so every variant layers onto every
 * archetype from one recipe, never per-combination special cases. Geometries
 * are cached and SHARED across vehicles (draw calls are the budget on the
 * aging school desktops); the one exception stays the deformable hull, cloned
 * per vehicle because the crumple system writes its vertices.
 *
 * three.js is browser-only in this repo (dynamic imports), so this module
 * imports three TYPES only and the factory takes the loaded module at
 * runtime.
 */

import type * as THREE from 'three';
import type { Loadout } from './loadout';

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
 * Identity of a build's full visual: archetype plus all four part slots. A
 * rig rebuilds its bodywork exactly when this key changes.
 */
export const visualKeyFor = (l: Loadout): string =>
	`${l.archetype}|${l.parts.plating}|${l.parts.drivetrain}|${l.parts.tires}|${l.parts.systems}`;

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
}

interface ArchBase {
	/** Chrome-ramp body tone + finish for the tintable hull mat. */
	tone: number;
	metalness: number;
	roughness: number;
	/** Weapon-mount socket attachment, relative to the COM_DROP frame. */
	mountPos: [number, number, number];
	wheelWidth: number;
	anchors: Anchors;
	nodes: VisualNode[];
}

interface ComposedVisual {
	key: string;
	tone: number;
	metalness: number;
	roughness: number;
	mountPos: [number, number, number];
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
	/** The archetype body tone the hull mat was set to (scorch lerps from it). */
	tone: number;
	/** The per-vehicle deformable hull mesh (the crumple target). */
	bodyMesh: THREE.Mesh;
	/** Pristine hull-geometry positions, restored on heal/reset. */
	dentBase: Float32Array;
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

	const socket = (r: number): VisualNode[] => [
		{
			part: 'mount',
			geo: track(new three.CylinderGeometry(r, r + 0.04, 0.12, 14)),
			mat: 'mount',
			pos: [0, 0, 0]
		},
		{
			part: 'mount',
			geo: track(new three.CylinderGeometry(r * 0.4, r * 0.4, 0.1, 10)),
			mat: 'mount',
			pos: [0, 0.09, 0]
		}
	];

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
			// skirts, roof, tail) - the glyph's plated seams.
			vis = {
				tone: GL.steelDim,
				metalness: 0.85,
				roughness: 0.5,
				mountPos: [-1.05, 0.76, 0],
				wheelWidth: 0.5,
				anchors: {
					hood: [1.05, 0.62, 0],
					rear: [-1.45, 0.6, 0],
					tailX: -1.95,
					halfW: 0.875,
					deckY: 0.55,
					cageTop: 1.05,
					hullLen: 3.8
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
					{ part: 'armor', geo: box(2.2, 0.05, 0.06), mat: 'accent', pos: [-0.1, -0.26, -1.06] },
					...socket(0.24)
				]
			};
		} else if (arch === 'velocity') {
			// Missile: one long low dart, glass canopy far back, tail fin, twin
			// threads down the rear flanks (the glyph's speed lines). Minimal
			// plating: a nose splitter, nothing else.
			vis = {
				tone: GL.chromeMid,
				metalness: 0.88,
				roughness: 0.18,
				mountPos: [-1.15, 0.23, 0],
				wheelWidth: 0.3,
				anchors: {
					hood: [0.85, 0.12, 0],
					rear: [-1.55, 0.2, 0],
					tailX: -2.15,
					halfW: 0.75,
					deckY: 0.18,
					cageTop: 0.6,
					hullLen: 4.4
				},
				nodes: [
					{ part: 'chassis', geo: taperEnd(box(4.4, 0.52, 1.5), 1, -0.2, 0.24, 0.4), mat: 'hull', pos: [0, -0.08, 0], deform: true },
					{ part: 'chassis', geo: taperEnd(box(1.05, 0.34, 0.85), 1, -0.3, 0.45, 0.6), mat: 'canopy', pos: [-0.55, 0.3, 0] },
					{ part: 'chassis', geo: box(0.55, 0.44, 0.07), mat: 'hull', pos: [-2.0, 0.3, 0] },
					{ part: 'armor', geo: box(0.8, 0.08, 1.35), mat: 'hull', pos: [1.75, -0.3, 0] },
					{ part: 'chassis', geo: box(1.5, 0.045, 0.05), mat: 'accent', pos: [-1.3, 0.02, 0.76] },
					{ part: 'chassis', geo: box(1.5, 0.045, 0.05), mat: 'accent', pos: [-1.3, 0.02, -0.76] },
					...socket(0.18)
				]
			};
		} else if (arch === 'handling') {
			// Scalpel: short compact shell tapered at BOTH ends, flared
			// wheel-arch fenders, one short apex line under the door.
			vis = {
				tone: GL.steel,
				metalness: 0.88,
				roughness: 0.32,
				mountPos: [-1.2, 0.25, 0],
				wheelWidth: 0.38,
				anchors: {
					hood: [1.0, 0.2, 0],
					rear: [-1.2, 0.26, 0],
					tailX: -1.6,
					halfW: 0.8,
					deckY: 0.29,
					cageTop: 0.75,
					hullLen: 3.3
				},
				nodes: [
					{ part: 'chassis', geo: taperEnd(taperEnd(box(3.3, 0.62, 1.6), 1, 0.1, 0.45, 0.6), -1, 0.5, 0.7, 0.8), mat: 'hull', pos: [0, -0.02, 0], deform: true },
					{ part: 'chassis', geo: box(1.35, 0.44, 1.15), mat: 'canopy', pos: [-0.15, 0.42, 0] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [1.25, 0.16, 0.92] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [1.25, 0.16, -0.92] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [-1.25, 0.16, 0.92] },
					{ part: 'armor', geo: box(0.85, 0.16, 0.26), mat: 'hull', pos: [-1.25, 0.16, -0.92] },
					{ part: 'chassis', geo: box(1.0, 0.045, 0.05), mat: 'accent', pos: [-0.33, -0.2, 0.81] },
					{ part: 'chassis', geo: box(1.0, 0.045, 0.05), mat: 'accent', pos: [-0.33, -0.2, -0.81] },
					...socket(0.16)
				]
			};
		} else {
			// Warlock: faceted dark machine, tilted side panels, angled sensor
			// pods, and the antenna mast rising off the weapon mount - the
			// glyph's silhouette. The accent is a short spine thread plus the
			// live antenna tip.
			vis = {
				tone: GL.chromeLo,
				metalness: 0.88,
				roughness: 0.38,
				mountPos: [-1.25, 0.42, 0],
				wheelWidth: 0.42,
				anchors: {
					hood: [1.15, 0.26, 0],
					rear: [-0.7, 0.4, 0],
					tailX: -1.75,
					halfW: 0.75,
					deckY: 0.36,
					cageTop: 0.82,
					hullLen: 3.6
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
					...socket(0.18),
					{ part: 'mount', geo: track(new three.CylinderGeometry(0.035, 0.035, 1.1, 8)), mat: 'mount', pos: [0, 0.6, 0] },
					{ part: 'mount', geo: track(new three.SphereGeometry(0.08, 10, 8)), mat: 'accent', pos: [0, 1.18, 0] }
				]
			};
		}
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
			// exhaust stacks raked back off the tail.
			const exX = a.tailX + 0.18;
			const exY = a.rear[1] + 0.2;
			const exZ = a.halfW * 0.38;
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

	// SYSTEMS variants: hardware around the weapon-mount socket, in mount
	// group local space, so they ride the socket on every archetype (and tilt
	// with it when the mount is dead).
	const systemsNodes = (partId: string): VisualNode[] => {
		if (partId === 'sys-capacitor') {
			// Visible battery bank: base plate, two chunky cells with glowing
			// caps, and a coil ring around the socket cap.
			return [
				{ part: 'mount', geo: unitBox(), mat: 'steel', pos: [0.32, 0.03, 0], scale: [0.5, 0.05, 0.42] },
				{ part: 'mount', geo: unitCyl(), mat: 'canopy', pos: [0.32, 0.17, 0.11], scale: [0.19, 0.26, 0.19] },
				{ part: 'mount', geo: unitCyl(), mat: 'canopy', pos: [0.32, 0.17, -0.11], scale: [0.19, 0.26, 0.19] },
				{ part: 'mount', geo: unitCyl(), mat: 'accent', pos: [0.32, 0.31, 0.11], scale: [0.19, 0.04, 0.19] },
				{ part: 'mount', geo: unitCyl(), mat: 'accent', pos: [0.32, 0.31, -0.11], scale: [0.19, 0.04, 0.19] },
				{ part: 'mount', geo: getGeo('coil', () => new three.TorusGeometry(0.1, 0.032, 8, 14)), mat: 'accent', pos: [0, 0.26, 0], rot: [Math.PI / 2, 0, 0] }
			];
		}
		if (partId === 'sys-faraday') {
			// Mesh shield dome over the socket, with a solid rim ring.
			return [
				{ part: 'mount', geo: getGeo('dome', () => new three.SphereGeometry(0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat: 'cage', pos: [0, 0.04, 0] },
				{ part: 'mount', geo: getGeo('domeRim', () => new three.TorusGeometry(0.36, 0.024, 6, 20)), mat: 'steel', pos: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0] }
			];
		}
		if (partId === 'sys-targeting') {
			// Sensor array: an angled dish with a lens, and a long scope
			// barrel sighted down the nose with a lit tip.
			return [
				{ part: 'mount', geo: getGeo('dish', () => new three.CylinderGeometry(0.16, 0.05, 0.14, 12)), mat: 'steel', pos: [0.14, 0.34, -0.14], rot: [0, 0, -1.1] },
				{ part: 'mount', geo: getGeo('lensS', () => new three.SphereGeometry(0.055, 10, 8)), mat: 'accent', pos: [0.22, 0.4, -0.14] },
				{ part: 'mount', geo: unitCyl(), mat: 'steel', pos: [0.28, 0.2, 0.14], rot: [0, 0, Math.PI / 2], scale: [0.07, 0.5, 0.07] },
				{ part: 'mount', geo: getGeo('tipS', () => new three.SphereGeometry(0.035, 8, 6)), mat: 'accent', pos: [0.54, 0.2, 0.14] }
			];
		}
		return [];
	};

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
		if (plating === 'plating-reactive') nodes.push(...cageNodes(a));
		nodes.push(...drivetrainNodes(l.parts.drivetrain, a));
		nodes.push(...systemsNodes(l.parts.systems));
		const wheel = wheelFor(l.parts.tires, base.wheelWidth);
		const vis: ComposedVisual = {
			key,
			tone: base.tone,
			metalness: base.metalness,
			roughness: base.roughness,
			mountPos: base.mountPos,
			nodes,
			wheelGeo: wheel.geo,
			tireMat: wheel.mat,
			wheelBand: wheel.band
		};
		composedCache.set(key, vis);
		return vis;
	};

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
			groups[node.part].add(mesh);
			if (node.deform) {
				bodyMesh = mesh;
				dentBase = new Float32Array(
					(geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
				);
			}
		}
		groups.mount.position.set(vis.mountPos[0], COM_DROP + vis.mountPos[1], vis.mountPos[2]);
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
		return { key: vis.key, tone: vis.tone, bodyMesh: bodyMesh!, dentBase };
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
