/**
 * FSP Pulse registry: re-exports the six Bosco Tech pathways from the original
 * fsp-tech-selection registry. Not duplicated data; this tool ranks the exact
 * same six pathways, just for a different (non-binding) purpose.
 */

export { FSP_TECH_IDS, FSP_TECHS, fspTechById, areValidTechIds } from '$lib/fsp/techs';
export type { FspTechId, FspTech } from '$lib/fsp/techs';
