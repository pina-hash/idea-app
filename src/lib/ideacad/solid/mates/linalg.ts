/**
 * THE SMALL DENSE LINEAR ALGEBRA THE MATE SOLVER NEEDS: a damped least-squares
 * step in six unknowns, and rank / null space of a set of Jacobian rows by
 * modified Gram-Schmidt with a relative tolerance. Six columns, a few dozen
 * rows at most; nothing here is tuned for anything larger.
 */
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = (a: readonly number[]) => Math.sqrt(dot(a, a));

/** Solve `A x = b` by Gaussian elimination with partial pivoting. Throws on a singular system. */
export function solveLinear(A: number[][], b: number[]): number[] {
	const n = b.length, M = A.map((row, i) => [...row, b[i]]);
	for (let c = 0; c < n; c++) {
		let pivot = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[pivot][c])) pivot = r;
		if (Math.abs(M[pivot][c]) < 1e-300) throw Error('Singular system.');
		[M[c], M[pivot]] = [M[pivot], M[c]];
		for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (f === 0) continue; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
	}
	const x = new Array<number>(n).fill(0);
	for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
	return x;
}
/**
 * The Levenberg-Marquardt step in its DUAL form: `δ = -Jᵀ (J Jᵀ + λ·diag + εI)⁻¹ r`.
 * Every step is then a combination of the Jacobian's own rows, so a direction
 * the constraints do not touch is never moved -- the primal normal equations
 * with a small ridge term were measured amplifying the finite-difference noise
 * in exactly those directions (a base box spun about Z and slid 13 in while
 * satisfying its one mate). A body with freedom left keeps it, exactly.
 */
export function dampedStep(J: readonly (readonly number[])[], r: readonly number[], lambda: number, n = 6): number[] {
	const m = J.length;
	if (!m) return new Array<number>(n).fill(0);
	const G = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => dot(J[i], J[j])));
	const largest = Math.max(1e-12, ...G.map((row, i) => row[i]));
	for (let i = 0; i < m; i++) G[i][i] += lambda * G[i][i] + 1e-9 * largest;
	const y = solveLinear(G, r.map((x) => -x));
	const step = new Array<number>(n).fill(0);
	for (let i = 0; i < m; i++) for (let p = 0; p < n; p++) step[p] += J[i][p] * y[i];
	return step;
}
/** An orthonormal basis of the row space. A row that adds less than `tolerance` of its own length is dependent and dropped. */
export function orthonormalize(rows: readonly (readonly number[])[], tolerance = 1e-7): number[][] {
	const basis: number[][] = [];
	for (const row of rows) {
		const length = norm(row); if (length < 1e-15) continue;
		let v = [...row];
		for (const b of basis) { const c = dot(v, b); v = v.map((x, i) => x - c * b[i]); }
		const left = norm(v);
		if (left > tolerance * length) basis.push(v.map((x) => x / left));
	}
	return basis;
}
export const rowRank = (rows: readonly (readonly number[])[], tolerance = 1e-7) => orthonormalize(rows, tolerance).length;
/** An orthonormal basis of everything in R^n the rows do not constrain. */
export function nullSpace(rows: readonly (readonly number[])[], n = 6, tolerance = 1e-7): number[][] {
	const basis = orthonormalize(rows, tolerance), out: number[][] = [];
	for (let i = 0; i < n; i++) {
		let v = new Array<number>(n).fill(0); v[i] = 1;
		for (const b of basis) { const c = dot(v, b); v = v.map((x, k) => x - c * b[k]); }
		for (const o of out) { const c = dot(v, o); v = v.map((x, k) => x - c * o[k]); }
		const left = norm(v);
		if (left > tolerance) out.push(v.map((x) => x / left));
	}
	return out;
}
/** Does `vector` already lie in the span of `rows`? */
export const inSpan = (rows: readonly (readonly number[])[], vector: readonly number[], tolerance = 1e-7) => rowRank([...rows, vector], tolerance) === rowRank(rows, tolerance);
