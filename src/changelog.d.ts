// Ambient declaration for the `virtual:changelog` Vite module (vite.config.ts),
// which emits the site changelog generated from git history at build time.
declare module 'virtual:changelog' {
	const entries: { date: string; note: string }[];
	export default entries;
}
