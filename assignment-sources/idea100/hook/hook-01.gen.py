"""Inline Hook 01's images into its kit source. Images were cut from the Rotation 2 Hook 01 page."""
import re, sys, pathlib
here = pathlib.Path(__file__).parent
img = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / 'img'
tpl = (here / 'hook-01.tpl.html').read_text()
out = re.sub(r'%%(img\d)%%', lambda m: (img / (m.group(1) + '.b64')).read_text().strip(), tpl)
# Mr. Pina's Rotation 2 rule drawings (dwg0 standard, dwg1 multi-part), styled by the template's .dwg rules
out = re.sub(r'%%(dwg\d)%%', lambda m: (here / (m.group(1) + '.svg')).read_text().strip(), out)
(here / 'hook-01.src.html').write_text(out)
print('wrote hook-01.src.html', len(out))
