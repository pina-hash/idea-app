import type {Tool} from './viewport';
import {TOOL_COMMANDS,DEFAULT_QUICK_TOOLS} from './command-registry';
/** Every tool the palette can show, with the icon and the one plain sentence its hover carries, DERIVED from the command registry so a tool is written down once. The palette shows the student's quick set until More is pressed. */
export const TOOLS:{id:Tool;name:string;description:string;icon:string}[]=TOOL_COMMANDS.map(c=>({id:c.tool,name:c.name,description:c.description,icon:c.icon}));
/** The default quick set. The palette reads the student's own set from preferences (`toolbar.quick`), which starts here. */
export const QUICK_TOOLS:Tool[]=[...DEFAULT_QUICK_TOOLS];
