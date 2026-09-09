/**
 * Stands in for the `virtual:site-changelog` Vite module under vitest.
 *
 * The lazy half of the version substrate: the full commit log, which exactly
 * two surfaces render and both `await import()`. It is derived from the SAME
 * fixture and the SAME `buildSiteVersions` call as ./site-versions.ts, for the
 * reason that stub gives -- a stub that hard-codes a shape can certify one the
 * build does not emit.
 */
export { entries } from './site-versions-source';
