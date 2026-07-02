/**
 * IDEA // GAUNTLET picture-in-picture / pop-out helpers (feature 2). Lets the
 * Speedrun drawing float over SolidWorks so students don't alt-tab mid-run.
 *
 * Three tiers, selected by capability (see the Speedrun play page):
 *   1. Document Picture-in-Picture (the primary target: the school Chrome/Windows
 *      environment supports it). An always-on-top OS-level window into which we
 *      MOVE the live drawing-viewer node, so its pan/zoom carries over untouched.
 *   2. window.open fallback: a detached, minimal drawing-only browser window
 *      (self-contained HTML with basic pan/zoom) the user positions over SolidWorks.
 *   3. In-app draggable/resizable floating panel (handled in the page as the final
 *      baseline when neither of the above is available).
 *
 * This module is pure browser glue (no Svelte) so it stays testable and reusable.
 */

/** True when the Document Picture-in-Picture API is available. */
export function supportsDocumentPip(): boolean {
	return typeof window !== 'undefined' && 'documentPictureInPicture' in window;
}

/**
 * Clone the page's stylesheets into another document (a PiP window) so moved
 * nodes keep their styling (Svelte scoped styles + app.css + viewport tokens).
 * Same-origin sheets are inlined; a sheet we cannot read (cross-origin) is
 * re-linked by href.
 */
export function copyStyles(target: Document): void {
	for (const sheet of Array.from(document.styleSheets)) {
		try {
			const css = Array.from(sheet.cssRules)
				.map((r) => r.cssText)
				.join('\n');
			const style = target.createElement('style');
			style.textContent = css;
			target.head.appendChild(style);
		} catch {
			// Cross-origin sheet: cssRules threw, so re-link it by URL instead.
			const href = (sheet as CSSStyleSheet).href;
			if (href) {
				const link = target.createElement('link');
				link.rel = 'stylesheet';
				link.href = href;
				target.head.appendChild(link);
			}
		}
	}
}

/**
 * Open a Document PiP window, copy the page styles in, and hand it back. The
 * caller moves its drawing node into `pip.document.body` and restores it on the
 * window's `pagehide`. Returns null if the request fails (e.g. not from a user
 * gesture, or an existing PiP window is open).
 */
export async function openPipWindow(width = 520, height = 380): Promise<Window | null> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const dpip = (window as any).documentPictureInPicture;
		const pip: Window = await dpip.requestWindow({ width, height });
		copyStyles(pip.document);
		pip.document.documentElement.style.height = '100%';
		pip.document.body.style.cssText =
			'margin:0;height:100%;background:#04070a;overflow:hidden;';
		// The GAUNTLET color tokens are defined on .gt-root; tag the PiP body with it
		// so a moved inline-SVG drawing (var(--white) etc.) resolves its colors.
		pip.document.body.className = 'gt-root';
		return pip;
	} catch {
		return null;
	}
}

/**
 * Self-contained drawing-only HTML for the window.open fallback: the drawing
 * (PNG src or inline SVG) on the blueprint field, with minimal drag-pan +
 * wheel-zoom and a Fit button so it is usable without any shared context.
 */
export function drawingWindowHtml(opts: { src?: string | null; svg?: string | null; title?: string }): string {
	const title = opts.title ?? 'GAUNTLET drawing';
	const media = opts.src
		? `<img id="d" alt="${escapeHtml(title)}" src="${escapeAttr(opts.src)}" draggable="false" />`
		: (opts.svg ?? '<p style="color:#5f8a78">No drawing.</p>');
	// Blueprint recolor + a tiny pan/zoom controller. Kept inline so the window is
	// fully detached and needs nothing from the opener.
	return `<!doctype html><html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  html,body{margin:0;height:100%;background:#04070a;overflow:hidden;font-family:'Share Tech Mono',monospace}
  #stage{position:absolute;inset:0;overflow:hidden;cursor:grab;touch-action:none;
    background-color:#04130c;
    background-image:linear-gradient(rgba(0,255,65,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,65,.07) 1px,transparent 1px);
    background-size:24px 24px}
  #stage:active{cursor:grabbing}
  #wrap{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}
  #wrap>*{display:block;max-width:none}
  #d,#wrap svg{filter:invert(1) drop-shadow(0 0 1px rgba(0,255,65,.5));mix-blend-mode:screen}
  #bar{position:absolute;top:8px;right:8px;display:flex;gap:4px;z-index:2}
  #bar button{width:28px;height:28px;border:1px solid rgba(0,240,255,.3);border-radius:6px;
    background:rgba(14,22,27,.9);color:#00f0ff;font:inherit;font-size:.95rem;cursor:pointer}
</style></head>
<body>
  <div id="stage"><div id="wrap">${media}</div></div>
  <div id="bar"><button id="in" title="Zoom in">+</button><button id="out" title="Zoom out">&minus;</button><button id="fit" title="Fit" style="width:auto;padding:0 8px;font-size:.62rem">FIT</button></div>
  <script>
    (function(){
      var stage=document.getElementById('stage'),wrap=document.getElementById('wrap');
      var s=1,tx=0,ty=0,drag=false,lx=0,ly=0;
      function apply(){wrap.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';}
      function fit(){var r=stage.getBoundingClientRect();var b=wrap.getBoundingClientRect();
        var cw=b.width/s,ch=b.height/s;if(!cw||!ch){s=1;tx=0;ty=0;apply();return;}
        s=Math.min(r.width/cw,r.height/ch)||1;tx=(r.width-cw*s)/2;ty=(r.height-ch*s)/2;apply();}
      function zoom(f,px,py){var ns=Math.min(10,Math.max(.2,s*f));tx=px-(px-tx)*(ns/s);ty=py-(py-ty)*(ns/s);s=ns;apply();}
      stage.addEventListener('wheel',function(e){e.preventDefault();var r=stage.getBoundingClientRect();zoom(Math.exp(-e.deltaY*0.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
      stage.addEventListener('pointerdown',function(e){drag=true;lx=e.clientX;ly=e.clientY;stage.setPointerCapture(e.pointerId);});
      stage.addEventListener('pointermove',function(e){if(!drag)return;tx+=e.clientX-lx;ty+=e.clientY-ly;lx=e.clientX;ly=e.clientY;apply();});
      stage.addEventListener('pointerup',function(){drag=false;});
      document.getElementById('in').onclick=function(){var r=stage.getBoundingClientRect();zoom(1.4,r.width/2,r.height/2);};
      document.getElementById('out').onclick=function(){var r=stage.getBoundingClientRect();zoom(1/1.4,r.width/2,r.height/2);};
      document.getElementById('fit').onclick=fit;
      var img=document.getElementById('d');
      if(img&&!img.complete){img.addEventListener('load',fit);} else {setTimeout(fit,60);}
      window.addEventListener('resize',fit);
    })();
  <\/script>
</body></html>`;
}

/** Open the fallback drawing window. Returns null if the popup was blocked. */
export function openDrawingWindow(opts: { src?: string | null; svg?: string | null; title?: string }): Window | null {
	const w = window.open('', 'gauntlet-drawing', 'width=520,height=420,menubar=no,toolbar=no,location=no,status=no');
	if (!w) return null;
	w.document.open();
	w.document.write(drawingWindowHtml(opts));
	w.document.close();
	return w;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
