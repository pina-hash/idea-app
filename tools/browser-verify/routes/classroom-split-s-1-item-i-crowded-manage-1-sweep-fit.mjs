import { fitSweep } from './_fit-sweep.mjs';

/* The attachment thumbnails ask the real proxy, which answers 401 with no
   session: the same ignore the item's own spec carries. */
export default fitSweep('/dev/classroom-split/s-1/item/i-crowded?manage=1', 'an item open beside the class list', {
	extra: { ignoreConsole: ['Failed to load resource: the server responded with a status of 401'] }
});
