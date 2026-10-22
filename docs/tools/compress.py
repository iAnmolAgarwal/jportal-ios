"""Shrink the README images: 256-colour palette PNGs, alpha kept.

    python3 docs/tools/compress.py docs/images

Flat UI art barely changes at 256 colours and comes out 3-4x smaller. A file is only
replaced when the palette version is actually smaller.
"""
import io
import pathlib
import sys

from PIL import Image

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "docs/images")
before = after = 0
for p in sorted(root.glob("*.png")):
    raw = p.read_bytes()
    im = Image.open(io.BytesIO(raw))
    im.load()
    if im.mode == "P":  # already done
        before += len(raw); after += len(raw)
        continue
    q = im.convert("RGBA").quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    buf = io.BytesIO()
    q.save(buf, "PNG", optimize=True)
    out = buf.getvalue()
    before += len(raw)
    if len(out) < len(raw):
        p.write_bytes(out)
        after += len(out)
    else:
        after += len(raw)
    print(f"{p.name:40s} {len(raw)//1024:5d} KB -> {min(len(out), len(raw))//1024:5d} KB")
print(f"total {before/1e6:.2f} MB -> {after/1e6:.2f} MB")
