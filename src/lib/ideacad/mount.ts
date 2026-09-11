import { htmlAssignmentSchemaVersion } from '$lib/classroom/html-assignment/mount';
export const IDEACAD_SCHEMA_VERSION=4;
export function isIdeaCad(item:unknown):boolean{return htmlAssignmentSchemaVersion(item)===IDEACAD_SCHEMA_VERSION;}
export type IdeacadMount='ideacad'|'other'|'unavailable';
export function ideacadMount(item:unknown,data:unknown):IdeacadMount{return !isIdeaCad(item)?'other':data?'ideacad':'unavailable';}
export const IDEACAD_UNAVAILABLE='This blade editor could not be opened. Nothing you have done is lost. Tell your teacher.';
