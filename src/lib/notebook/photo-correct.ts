/**
 * Notebook photo correction: the PURE math behind the pre-upload flatten +
 * clean-up step (PhotoCorrector.svelte is the UI over it).
 *
 * Deliberately zero-dependency. The obvious library route (OpenCV.js, or
 * jscanify wrapping it) ships ~8-10 MB of wasm to a camera-first phone flow
 * for exactly four small, well-understood pieces: a 4-point homography
 * (closed-form 8x8 linear solve), an inverse-mapped perspective warp with
 * bilinear sampling, a percentile levels stretch, and a best-effort
 * bright-page corner guess. All four are here in plain TypeScript, they run
 * entirely in the browser with no network, and the dev harness can import
 * this module directly (no wasm loader to mock).
 *
 * Scope rule, stated where the code lives: this is a STRAIGHT four-corner
 * perspective warp. It handles skew and camera angle, never page CURVATURE
 * near a notebook's spine -- modelling curl is a meaningfully harder problem
 * (a mesh warp against a detected curve, not a homography) and is out of
 * scope until flat correction genuinely proves insufficient.
 *
 * Coordinate convention: a Quad is [top-left, top-right, bottom-right,
 * bottom-left] in image pixel coordinates, y down.
 */

export interface Point {
	x: number;
	y: number;
}

/** [TL, TR, BR, BL], image pixel space. */
export type Quad = [Point, Point, Point, Point];

/**
 * The fallback when detection is not confident: corners inset a little from
 * the image's own corners, so the handles are visibly grabbable (a handle
 * exactly on the image corner reads as decoration, not a control).
 */
export function defaultCorners(width: number, height: number, inset = 0.04): Quad {
	const dx = width * inset;
	const dy = height * inset;
	return [
		{ x: dx, y: dy },
		{ x: width - dx, y: dy },
		{ x: width - dx, y: height - dy },
		{ x: dx, y: height - dy }
	];
}

function dist(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shoelace area of the quad (absolute). */
function quadArea(q: Quad): number {
	let s = 0;
	for (let i = 0; i < 4; i++) {
		const a = q[i];
		const b = q[(i + 1) % 4];
		s += a.x * b.y - b.x * a.y;
	}
	return Math.abs(s) / 2;
}

/** All four turns the same way and none of them degenerate. */
export function isConvex(q: Quad): boolean {
	let sign = 0;
	for (let i = 0; i < 4; i++) {
		const a = q[i];
		const b = q[(i + 1) % 4];
		const c = q[(i + 2) % 4];
		const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (Math.abs(cross) < 1e-6) return false;
		const s = Math.sign(cross);
		if (sign === 0) sign = s;
		else if (s !== sign) return false;
	}
	return true;
}

/**
 * Output size for the flattened rectangle: the quad's own edge lengths (the
 * longer of each opposing pair, so nothing is squeezed), capped to maxDim so
 * a 12 MP source never asks for a 12 MP warp.
 */
export function warpedSize(q: Quad, maxDim = 2000): { width: number; height: number } {
	let w = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
	let h = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
	const scale = Math.min(1, maxDim / Math.max(w, h));
	w = Math.max(8, Math.round(w * scale));
	h = Math.max(8, Math.round(h * scale));
	return { width: w, height: h };
}

/**
 * Homography mapping the OUTPUT rectangle (0,0)-(w,h) onto the source quad,
 * i.e. the inverse map a warp loop wants: for each destination pixel, where
 * in the source to sample. Returns the 8 coefficients [a..h] of
 *   u = (a x + b y + c) / (g x + h y + 1)
 *   v = (d x + e y + f) / (g x + h y + 1)
 * or null when the quad is degenerate (collinear corners), which callers
 * treat as "cannot correct".
 */
export function solveHomography(quad: Quad, width: number, height: number): number[] | null {
	// Destination corners in the same TL,TR,BR,BL order as the quad.
	const dst: Quad = [
		{ x: 0, y: 0 },
		{ x: width, y: 0 },
		{ x: width, y: height },
		{ x: 0, y: height }
	];
	// 8 equations in [a,b,c,d,e,f,g,h].
	const m: number[][] = [];
	const rhs: number[] = [];
	for (let i = 0; i < 4; i++) {
		const { x, y } = dst[i];
		const { x: u, y: v } = quad[i];
		m.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
		rhs.push(u);
		m.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
		rhs.push(v);
	}
	return solveLinear(m, rhs);
}

/** Gaussian elimination with partial pivoting; null on a singular system. */
function solveLinear(m: number[][], rhs: number[]): number[] | null {
	const n = rhs.length;
	const a = m.map((row, i) => [...row, rhs[i]]);
	for (let col = 0; col < n; col++) {
		let pivot = col;
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
		}
		if (Math.abs(a[pivot][col]) < 1e-9) return null;
		if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]];
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const f = a[r][col] / a[col][col];
			if (f === 0) continue;
			for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
		}
	}
	return a.map((row, i) => row[n] / a[i][i]);
}

/**
 * Inverse-mapped perspective warp with bilinear sampling: every output pixel
 * asks the homography where it came from and blends the four neighbouring
 * source pixels. Out-of-bounds samples clamp to the edge (only reachable
 * when a corner is dragged outside the frame, which the UI prevents).
 */
export function warpPerspective(
	src: ImageData,
	homography: number[],
	width: number,
	height: number
): ImageData {
	const [a, b, c, d, e, f, g, h] = homography;
	const out = new ImageData(width, height);
	const sp = src.data;
	const op = out.data;
	const sw = src.width;
	const sh = src.height;
	let oi = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const w0 = g * x + h * y + 1;
			const u = (a * x + b * y + c) / w0;
			const v = (d * x + e * y + f) / w0;
			const x0 = Math.max(0, Math.min(sw - 1, Math.floor(u)));
			const y0 = Math.max(0, Math.min(sh - 1, Math.floor(v)));
			const x1 = Math.min(sw - 1, x0 + 1);
			const y1 = Math.min(sh - 1, y0 + 1);
			const fx = Math.max(0, Math.min(1, u - x0));
			const fy = Math.max(0, Math.min(1, v - y0));
			const i00 = (y0 * sw + x0) * 4;
			const i10 = (y0 * sw + x1) * 4;
			const i01 = (y1 * sw + x0) * 4;
			const i11 = (y1 * sw + x1) * 4;
			const w00 = (1 - fx) * (1 - fy);
			const w10 = fx * (1 - fy);
			const w01 = (1 - fx) * fy;
			const w11 = fx * fy;
			op[oi] = sp[i00] * w00 + sp[i10] * w10 + sp[i01] * w01 + sp[i11] * w11;
			op[oi + 1] = sp[i00 + 1] * w00 + sp[i10 + 1] * w10 + sp[i01 + 1] * w01 + sp[i11 + 1] * w11;
			op[oi + 2] = sp[i00 + 2] * w00 + sp[i10 + 2] * w10 + sp[i01 + 2] * w01 + sp[i11 + 2] * w11;
			op[oi + 3] = 255;
			oi += 4;
		}
	}
	return out;
}

/**
 * Basic contrast + brightness auto-level, in place: a linear stretch of the
 * luminance percentiles so ink lands near black and paper near white. The
 * same gain applies to all three channels (per-channel stretch would shift
 * the color balance of anything drawn in ink). A near-flat image (the
 * percentile span under ~24 levels) is left alone -- stretching noise only
 * amplifies it.
 */
export function autoLevels(img: ImageData, lowPct = 0.015, highPct = 0.985): void {
	const p = img.data;
	const hist = new Uint32Array(256);
	const n = img.width * img.height;
	for (let i = 0; i < n; i++) {
		const j = i * 4;
		hist[(p[j] * 0.299 + p[j + 1] * 0.587 + p[j + 2] * 0.114) | 0]++;
	}
	const low = percentile(hist, n, lowPct);
	const high = percentile(hist, n, highPct);
	const span = high - low;
	if (span < 24) return;
	const gain = 255 / span;
	const lut = new Uint8ClampedArray(256);
	for (let v = 0; v < 256; v++) lut[v] = (v - low) * gain;
	for (let i = 0; i < n; i++) {
		const j = i * 4;
		p[j] = lut[p[j]];
		p[j + 1] = lut[p[j + 1]];
		p[j + 2] = lut[p[j + 2]];
	}
}

function percentile(hist: Uint32Array, total: number, pct: number): number {
	const target = total * pct;
	let acc = 0;
	for (let v = 0; v < 256; v++) {
		acc += hist[v];
		if (acc >= target) return v;
	}
	return 255;
}

export interface DetectionResult {
	corners: Quad;
	/** False means "use defaults instead"; the corners are still the best guess. */
	confident: boolean;
}

/**
 * Best-effort page-edge detection on a small (downscaled) ImageData. The
 * model is the common case this feature exists for: a bright page against a
 * darker desk. Otsu-threshold the luminance, take the largest connected
 * bright region, and read its four corners off the classic extremes
 * (min/max of x+y and x-y). A battery of sanity gates decides `confident`;
 * anything marginal -- page fills the whole frame, page darker than the
 * desk, a blob that is not quad-shaped -- reports unconfident and the UI
 * falls back to defaultCorners. Caller scales the corners back up to the
 * full image.
 */
export function detectPageCorners(img: ImageData): DetectionResult {
	const w = img.width;
	const h = img.height;
	const n = w * h;
	const fallback: DetectionResult = { corners: defaultCorners(w, h), confident: false };
	if (n === 0) return fallback;

	// Luminance + Otsu threshold.
	const lum = new Uint8Array(n);
	const hist = new Uint32Array(256);
	const p = img.data;
	for (let i = 0; i < n; i++) {
		const j = i * 4;
		const v = (p[j] * 0.299 + p[j + 1] * 0.587 + p[j + 2] * 0.114) | 0;
		lum[i] = v;
		hist[v]++;
	}
	const threshold = otsu(hist, n);

	// Largest connected bright component (4-connectivity, iterative fill).
	const visited = new Uint8Array(n);
	const stack = new Int32Array(n);
	let best: { area: number; tl: number; tr: number; br: number; bl: number } | null = null;
	for (let start = 0; start < n; start++) {
		if (visited[start] || lum[start] < threshold) continue;
		let area = 0;
		// Extremes tracked as scores; index of the winning pixel per metric.
		let tlScore = Infinity, trScore = -Infinity, brScore = -Infinity, blScore = Infinity;
		let tl = start, tr = start, br = start, bl = start;
		let sp = 0;
		stack[sp++] = start;
		visited[start] = 1;
		while (sp > 0) {
			const i = stack[--sp];
			area++;
			const x = i % w;
			const y = (i / w) | 0;
			const sum = x + y;
			const diff = x - y;
			if (sum < tlScore) { tlScore = sum; tl = i; }
			if (sum > brScore) { brScore = sum; br = i; }
			if (diff > trScore) { trScore = diff; tr = i; }
			if (diff < blScore) { blScore = diff; bl = i; }
			if (x > 0 && !visited[i - 1] && lum[i - 1] >= threshold) { visited[i - 1] = 1; stack[sp++] = i - 1; }
			if (x < w - 1 && !visited[i + 1] && lum[i + 1] >= threshold) { visited[i + 1] = 1; stack[sp++] = i + 1; }
			if (y > 0 && !visited[i - w] && lum[i - w] >= threshold) { visited[i - w] = 1; stack[sp++] = i - w; }
			if (y < h - 1 && !visited[i + w] && lum[i + w] >= threshold) { visited[i + w] = 1; stack[sp++] = i + w; }
		}
		if (!best || area > best.area) best = { area, tl, tr, br, bl };
	}
	if (!best) return fallback;

	const pt = (i: number): Point => ({ x: i % w, y: (i / w) | 0 });
	const corners: Quad = [pt(best.tl), pt(best.tr), pt(best.br), pt(best.bl)];

	// Confidence gates. Each one is a way the bright-blob model fails.
	const areaFrac = best.area / n;
	if (areaFrac < 0.15 || areaFrac > 0.985) return { corners, confident: false };
	const qa = quadArea(corners);
	if (qa < 0.12 * n) return { corners, confident: false };
	// A quad-shaped region's corner extremes span most of it; a round or
	// ragged blob leaves the extremes-quad much smaller than the region.
	if (qa < 0.6 * best.area) return { corners, confident: false };
	if (!isConvex(corners)) return { corners, confident: false };
	const minSide = Math.min(w, h);
	for (let i = 0; i < 4; i++) {
		for (let j = i + 1; j < 4; j++) {
			if (dist(corners[i], corners[j]) < 0.2 * minSide) return { corners, confident: false };
		}
	}
	return { corners, confident: true };
}

function otsu(hist: Uint32Array, total: number): number {
	let sum = 0;
	for (let v = 0; v < 256; v++) sum += v * hist[v];
	let sumB = 0;
	let wB = 0;
	let maxVar = 0;
	let threshold = 128;
	for (let v = 0; v < 256; v++) {
		wB += hist[v];
		if (wB === 0) continue;
		const wF = total - wB;
		if (wF === 0) break;
		sumB += v * hist[v];
		const mB = sumB / wB;
		const mF = (sum - sumB) / wF;
		const between = wB * wF * (mB - mF) * (mB - mF);
		if (between > maxVar) {
			maxVar = between;
			threshold = v + 1;
		}
	}
	return threshold;
}
