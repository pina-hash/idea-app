import type {Tool} from './viewport';
export const TOOLS:{id:Tool;name:string;description:string;icon:string}[]=[
	{id:'select',name:'Select',description:'Grab a face to push it, or an edge to move it.',icon:'M5 3l14 10-7 1-3 7z'},
	{id:'rectangle',name:'Rectangle',description:'Drag out a rectangle on a plane or flat face.',icon:'M4 6h16v12H4z'},
	{id:'circle',name:'Circle',description:'Drag from the center to draw a circle.',icon:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 9v6m-3-3h6'},
	{id:'line',name:'Line',description:'Join points and return to the first point to close a shape.',icon:'M4 18L9 5l11 12M2 16h4v4H2zM7 3h4v4H7zM18 15h4v4h-4z'},
	{id:'polygon',name:'Polygon',description:'Drag from the center to draw a six-sided shape.',icon:'M6 3h12l5 9-5 9H6l-5-9z'},
	{id:'arc',name:'Arc',description:'Pick the center, start, and end of a curved profile.',icon:'M3 18a9 9 0 0 1 18 0M3 18h18M12 15v6m-3-3h6'},
	{id:'extrude',name:'Extrude',description:'Pull a sketch into a solid, or push it inward to cut.',icon:'M4 10l8-4 8 4-8 4zM4 10v8l8 4 8-4v-8M12 14v8M12 8V1m-3 3 3-3 3 3'},
	{id:'revolve',name:'Revolve',description:'Drag a sketch around its axis to make a round solid.',icon:'M12 2v20M8 6H4v12h4M16 5c7 3 7 11 0 14m0-14v5h5'},
	{id:'fillet',name:'Fillet',description:'Drag an edge to round it.',icon:'M4 21V12a8 8 0 0 1 8-8h9M10 21V12a2 2 0 0 1 2-2h9'},
	{id:'chamfer',name:'Chamfer',description:'Drag an edge to cut a flat bevel.',icon:'M4 21V11l7-7h10M10 21V14l4-4h7'},
	{id:'shell',name:'Shell',description:'Drag a face to hollow the body and open that face.',icon:'M4 5l8-3 8 3v14l-8 3-8-3zM7 7l5-2 5 2-5 2zM12 9v10M7 7v10l5 2 5-2V7'},
	{id:'move',name:'Move',description:'Drag a colored handle to move a body or selection.',icon:'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3'},
	{id:'rotate',name:'Rotate',description:'Drag a colored handle to turn the selected body.',icon:'M20 8a9 9 0 1 0 1 8M20 3v5h-5M12 9v6m-3-3h6'},
	{id:'scale',name:'Scale',description:'Drag a colored handle to resize the selected body.',icon:'M4 11v9h9v-9zM13 11l8-8M15 3h6v6'},
	{id:'linear-pattern',name:'Linear pattern',description:'Drag across for spacing and upward for more copies.',icon:'M2 10h5v8H2zM10 10h5v8h-5zM18 10h5v8h-5zM3 5h18m-3-3 3 3-3 3'},
	{id:'circular-pattern',name:'Circular pattern',description:'Drag upward to arrange more copies around the origin.',icon:'M9 1h6v6H9zM2 15h6v6H2zM16 15h6v6h-6zM4 11a8 8 0 0 1 2-4m12 0a8 8 0 0 1 2 4M9 21h6'}
];
