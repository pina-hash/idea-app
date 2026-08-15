#!/usr/bin/env python3
"""Render an IDEA print material from its HTML source to US Letter PDF.

    python3 tools/render-print-material.py materials/idea209h/syllabus/IDEA209H_Syllabus_Fall2026.html

Default margins are 1in sides and 0.75in top and bottom, which is what the IDEA209H
syllabus is laid out against. Pass different ones by editing the call, not the CSS.

Output lands next to the source with a .pdf extension. Margins, page size, and the
Page X of Y footer come from IDEA_PRINT_STANDARDS.md and are set here rather than in
print.css, because a CSS @page margin overrides the renderer's and collapses the footer.

Requires: pip install playwright --break-system-packages && playwright install chromium
Fonts: Orbitron, Rajdhani, and Share Tech Mono must be installed on the system.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

FOOT = """
<div style="width:100%; font-family:'Share Tech Mono',monospace; font-size:7.5pt;
            color:#555; padding:0 {pad}; display:flex; justify-content:space-between;">
  <span>{left}</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>
"""


def render(src: pathlib.Path, footer_left: str,
           side: str = "1in", tb: str = "0.75in") -> pathlib.Path:
    out = src.with_suffix(".pdf")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(src.resolve().as_uri())
        page.wait_for_timeout(1200)
        page.emulate_media(media="print")
        page.pdf(
            path=str(out),
            format="Letter",
            print_background=True,
            margin={"top": tb, "bottom": tb, "left": side, "right": side},
            display_header_footer=True,
            header_template="<div></div>",
            footer_template=FOOT.format(left=footer_left, pad=side),
        )
        browser.close()
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    source = pathlib.Path(sys.argv[1])
    if not source.exists():
        sys.exit(f"not found: {source}")
    left = sys.argv[2] if len(sys.argv) > 2 else source.stem.upper()
    result = render(source, left)
    print(f"rendered {result}")
