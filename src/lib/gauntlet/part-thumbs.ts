/**
 * Isometric part thumbnails for the Speedrun level list.
 *
 * Each level's STL is rendered ONCE in this browser to a small transparent
 * PNG: a fixed true-isometric orthographic camera, the same machined-metal
 * material and studio lighting family as StlViewer, and a soft contact shadow,
 * so every tile shares one consistent look. The PNG blob is cached in
 * IndexedDB keyed by the Storage `model_path` plus a style version
 * (STYLE_VERSION bumps invalidate every cached render after a look change), so
 * repeat visits never touch the network or the GPU. The signed model URL is
 * only resolved on a cache miss, which is why callers pass a resolver instead
 * of a URL.
 *
 * Renders are serialized through one shared offscreen WebGL renderer that is
 * disposed a few seconds after the queue drains, so the list never holds a GPU
 * context open. Browser-only (three is dynamically imported); call from
 * onMount. Any failure resolves to null and the tile shows its placeholder.
 */

const STYLE_VERSION = 1;
const DB_NAME = 'gauntlet-part-thumbs';
const STORE = 'thumbs';
const THUMB_W = 384;
const THUMB_H = 288;

// ---------------------------------------------------------------------------
// IndexedDB blob cache (falls back to session-memory when IDB is unavailable).
// ---------------------------------------------------------------------------
const memCache = new Map<string, Blob>();

function idbOpen(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => {
			if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function cacheGet(key: string): Promise<Blob | null> {
	if (memCache.has(key)) return memCache.get(key) ?? null;
	try {
		const db = await idbOpen();
		return await new Promise<Blob | null>((resolve) => {
			const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
			req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
			req.onerror = () => resolve(null);
		});
	} catch {
		return null;
	}
}

async function cachePut(key: string, blob: Blob): Promise<void> {
	memCache.set(key, blob);
	try {
		const db = await idbOpen();
		db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key);
	} catch {
		/* private mode or blocked storage: the memory cache carries the session */
	}
}

// ---------------------------------------------------------------------------
// Shared offscreen studio: one renderer, one scene, serialized renders.
// ---------------------------------------------------------------------------
interface Studio {
	render(url: string): Promise<Blob | null>;
	dispose(): void;
}

let studioPromise: Promise<Studio | null> | null = null;
let pending = 0;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function buildStudio(): Promise<Studio | null> {
	try {
		const THREE = await import('three');
		const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
		const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');

		const canvas = document.createElement('canvas');
		canvas.width = THUMB_W;
		canvas.height = THUMB_H;
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.setPixelRatio(1); // the canvas is already 4x the display size
		renderer.setSize(THUMB_W, THUMB_H, false);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.12;
		renderer.setClearColor(0x000000, 0);
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFShadowMap;

		const scene = new THREE.Scene();
		const pmrem = new THREE.PMREMGenerator(renderer);
		const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		scene.environment = envTex;
		scene.environmentRotation.set(0, Math.PI / 4, 0);

		// The StlViewer studio family, tuned for a tiny frame.
		const key = new THREE.DirectionalLight(0xf2f6fa, 2.0);
		key.castShadow = true;
		key.shadow.mapSize.set(1024, 1024);
		key.shadow.radius = 4;
		scene.add(key);
		const rim = new THREE.DirectionalLight(0x88ddff, 1.0);
		rim.position.set(-1, 0.4, -1.2);
		scene.add(rim);
		const fill = new THREE.DirectionalLight(0x9fb6c9, 0.35);
		fill.position.set(-0.8, -0.5, 1);
		scene.add(fill);
		scene.add(new THREE.HemisphereLight(0xdfeaf2, 0x0a1014, 0.22));

		const material = new THREE.MeshPhysicalMaterial({
			color: 0xb0bcc7,
			metalness: 0.88,
			roughness: 0.3,
			clearcoat: 0.3,
			clearcoatRoughness: 0.35,
			envMapIntensity: 1.25
		});

		// True isometric: orthographic, looking down the (1,1,1) diagonal.
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
		const isoDir = new THREE.Vector3(1, 1, 1).normalize();

		const loader = new STLLoader();

		const render = async (url: string): Promise<Blob | null> => {
			let geometry: import('three').BufferGeometry | null = null;
			let mesh: import('three').Mesh | null = null;
			let ground: import('three').Mesh | null = null;
			try {
				geometry = (await loader.loadAsync(url)) as import('three').BufferGeometry;
				geometry.computeVertexNormals();
				geometry.computeBoundingBox();
				geometry.computeBoundingSphere();
				const box = geometry.boundingBox!;
				const center = new THREE.Vector3();
				box.getCenter(center);
				const radius = geometry.boundingSphere?.radius || 1;

				mesh = new THREE.Mesh(geometry, material);
				mesh.position.sub(center);
				mesh.castShadow = true;
				scene.add(mesh);

				ground = new THREE.Mesh(
					new THREE.PlaneGeometry(radius * 8, radius * 8),
					new THREE.ShadowMaterial({ opacity: 0.3 })
				);
				ground.rotation.x = -Math.PI / 2;
				ground.position.y = box.min.y - center.y - radius * 0.02;
				ground.receiveShadow = true;
				scene.add(ground);

				key.position.copy(new THREE.Vector3(1.4, 2.2, 1).multiplyScalar(radius));
				key.shadow.camera.left = -radius * 2;
				key.shadow.camera.right = radius * 2;
				key.shadow.camera.top = radius * 2;
				key.shadow.camera.bottom = -radius * 2;
				key.shadow.camera.near = radius * 0.1;
				key.shadow.camera.far = radius * 8;
				key.shadow.camera.updateProjectionMatrix();

				const halfH = radius * 1.16;
				camera.top = halfH;
				camera.bottom = -halfH;
				camera.right = halfH * (THUMB_W / THUMB_H);
				camera.left = -camera.right;
				camera.near = radius * 0.05;
				camera.far = radius * 12;
				camera.position.copy(isoDir).multiplyScalar(radius * 4);
				// Sit the part a touch high so the contact shadow breathes below.
				camera.lookAt(0, -radius * 0.08, 0);
				camera.updateProjectionMatrix();

				renderer.render(scene, camera);
				return await new Promise<Blob | null>((resolve) =>
					canvas.toBlob((b) => resolve(b), 'image/png')
				);
			} finally {
				if (mesh) scene.remove(mesh);
				if (ground) {
					scene.remove(ground);
					ground.geometry.dispose();
					(ground.material as import('three').Material).dispose();
				}
				geometry?.dispose();
			}
		};

		return {
			render,
			dispose() {
				material.dispose();
				envTex.dispose();
				pmrem.dispose();
				renderer.dispose();
			}
		};
	} catch {
		return null; // no WebGL: every tile falls back to its placeholder
	}
}

function releaseStudioSoon() {
	if (idleTimer) clearTimeout(idleTimer);
	idleTimer = setTimeout(async () => {
		if (pending > 0) return;
		const s = await studioPromise?.catch(() => null);
		studioPromise = null;
		s?.dispose();
	}, 3000);
}

// Serialize renders (one GPU job at a time) and dedupe concurrent requests.
// The deduped job resolves to the BLOB; each caller mints its own object URL,
// so one caller unmounting (and revoking) never breaks another's image.
let queueTail: Promise<unknown> = Promise.resolve();
const inFlight = new Map<string, Promise<Blob | null>>();

function thumbBlob(cacheKey: string, resolveUrl: () => Promise<string | null>): Promise<Blob | null> {
	const existing = inFlight.get(cacheKey);
	if (existing) return existing;

	const job = (async (): Promise<Blob | null> => {
		const hit = await cacheGet(cacheKey);
		if (hit) {
			console.debug('[part-thumbs] cache hit', cacheKey);
			return hit;
		}

		// Miss: render behind the shared queue. A failed job must never poison
		// the queue, so the tail always settles to null before the next chains.
		pending++;
		try {
			const run = queueTail.catch(() => null).then(async () => {
				const url = await resolveUrl();
				if (!url) return null;
				studioPromise ??= buildStudio();
				const studio = await studioPromise;
				if (!studio) return null;
				console.debug('[part-thumbs] rendering', cacheKey);
				return studio.render(url);
			});
			queueTail = run.catch(() => null);
			const blob = (await run) as Blob | null;
			if (!blob) return null;
			await cachePut(cacheKey, blob);
			return blob;
		} catch {
			return null;
		} finally {
			pending--;
			releaseStudioSoon();
		}
	})();

	inFlight.set(cacheKey, job);
	job.finally(() => inFlight.delete(cacheKey));
	return job;
}

/**
 * Object URL of the cached isometric render for `modelPath`, rendering (and
 * caching) it first if this browser has never seen the model. `resolveUrl` is
 * only called on a cache miss. Resolves null when the model cannot be
 * resolved, loaded, or rendered; the caller shows a placeholder. The caller
 * owns the returned URL (revoke it when done).
 */
export async function getPartThumb(
	modelPath: string,
	resolveUrl: () => Promise<string | null>
): Promise<string | null> {
	const blob = await thumbBlob(`v${STYLE_VERSION}:${modelPath}`, resolveUrl);
	return blob ? URL.createObjectURL(blob) : null;
}
