/**
 * THE FEATURES THAT COMPLETE FILLETS AND CHAMFERS: hole, draft, sweep, loft,
 * rib. This module is the blends-and-features surface's to fill; the spine
 * registers every type so a document carrying one replays with an honest
 * error rather than an unknown-type crash.
 */
import type { ExecutorContext } from './context';
import type { FeatureOf } from '../types';

const notYet = (what: string) => { throw Error(`${what} is not built yet in this build.`); };
export function hole(_ctx: ExecutorContext, _f: FeatureOf<'hole'>) { notYet('Hole'); }
export function draft(_ctx: ExecutorContext, _f: FeatureOf<'draft'>) { notYet('Draft'); }
export function sweep(_ctx: ExecutorContext, _f: FeatureOf<'sweep'>) { notYet('Sweep'); }
export function loft(_ctx: ExecutorContext, _f: FeatureOf<'loft'>) { notYet('Loft'); }
export function rib(_ctx: ExecutorContext, _f: FeatureOf<'rib'>) { notYet('Rib'); }
