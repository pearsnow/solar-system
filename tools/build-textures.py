#!/usr/bin/env python
"""Build planet texture sets for the solar system project.

Source: solarsystemscope.com (CC BY 4.0)
    https://www.solarsystemscope.com/textures/

Output layout:
    public/textures/<level>/<body>/<map>.jpg

A body is only written at levels its source can actually fill. Uranus and
Neptune top out at 2048 px on the source site, so they get a 2k directory and
nothing else — upscaling them would quadruple VRAM for zero information.

Usage:
    python tools/build-textures.py                 # everything
    python tools/build-textures.py --only sun,mars # subset
    python tools/build-textures.py --force         # re-download sources
"""

import argparse
import os
import sys
import time
import urllib.request

from PIL import Image, ImageFilter

try:
    Image.MAX_IMAGE_PIXELS = None  # 8K tiffs, silence the bomb guard
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "tools", "raw")
OUT = os.path.join(ROOT, "public", "textures")

LEVELS = [
    ("8k", 8192, 4096),
    ("4k", 4096, 2048),
    ("2k", 2048, 1024),
]

BASE_URL = "https://www.solarsystemscope.com/textures/download/"

# body, output map name, source file, processing mode, jpeg quality
#   rgb         colour map, sRGB, 4:4:4
#   gray        single channel source -> grayscale data map
#   invert_gray white-source -> black-destination (specular -> roughness)
MAP_SPECS = [
    ("sun", "day", "8k_sun.jpg", "rgb", 92),
    ("mercury", "day", "8k_mercury.jpg", "rgb", 92),
    # Venus is permanently cloud-covered; the atmosphere map is what you see.
    ("venus", "day", "4k_venus_atmosphere.jpg", "rgb", 92),
    ("earth", "day", "8k_earth_daymap.jpg", "rgb", 92),
    ("earth", "night", "8k_earth_nightmap.jpg", "rgb", 92),
    ("earth", "normal", "8k_earth_normal_map.tif", "rgb", 95),
    ("earth", "clouds", "8k_earth_clouds.jpg", "gray", 90),
    ("earth", "rough", "8k_earth_specular_map.tif", "invert_gray", 90),
    ("mars", "day", "8k_mars.jpg", "rgb", 92),
    ("jupiter", "day", "8k_jupiter.jpg", "rgb", 92),
    ("saturn", "day", "8k_saturn.jpg", "rgb", 92),
    # The ring map is a 1-D radial strip stretched to 500 rows; every row is
    # identical. Cropping to 64 rows keeps the alpha data and drops ~87% of the
    # payload. PNG because the alpha channel carries the ring gaps.
    ("saturn", "ring", "8k_saturn_ring_alpha.png", "rgba_crop", 0),
    ("moon", "day", "8k_moon.jpg", "rgb", 92),
    ("uranus", "day", "2k_uranus.jpg", "rgb", 92),
    ("neptune", "day", "2k_neptune.jpg", "rgb", 92),
    # Equirectangular Milky Way, used as scene.background rather than a sky box:
    # one texture, always behind everything, no geometry to keep in sync.
    ("sky", "milkyway", "8k_stars_milky_way.jpg", "rgb", 90),
]

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)


def log(msg=""):
    print(msg, flush=True)


def human(n):
    return f"{n / 1048576:.1f} MB"


def download(filename, force=False):
    dest = os.path.join(RAW, filename)
    if os.path.exists(dest) and not force:
        return dest

    url = BASE_URL + filename
    log(f"  [get ] {filename}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    t0 = time.time()
    tmp = dest + ".part"

    with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = r.read(262144)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
    os.replace(tmp, dest)
    log(f"         {human(os.path.getsize(dest))} in {time.time() - t0:.1f}s")
    return dest


def levels_for(width, mode):
    levels = [lv for lv in LEVELS if lv[1] <= width]
    if mode == "rgba_crop":
        # The ring strip is 1-D and is always loaded from the 2k level: more
        # samples than that only add moire, never visible detail.
        levels = [lv for lv in levels if lv[0] == "2k"] or [LEVELS[-1]]
    return levels


def process(spec, raw_paths):
    body, name, source, mode, quality = spec
    src_path = raw_paths[source]

    img = Image.open(src_path)
    img.load()

    native_w = img.size[0]
    levels = levels_for(native_w, mode)
    if not levels:
        levels = [LEVELS[-1]]

    is_png = False

    if mode == "rgb":
        img = img.convert("RGB")
    elif mode in ("gray", "invert_gray"):
        img = img.convert("L")
        if mode == "invert_gray":
            img = img.point(lambda v: 255 - v)
    elif mode == "rgba_crop":
        # Keep only the top rows: the ring strip is vertically constant.
        crop_h = min(64, img.size[1])
        img = img.convert("RGBA").crop((0, 0, img.size[0], crop_h))

        # Ringlets in the source are finer than a texel at the 2k width. LANCZOS
        # turns that into a beat pattern that shows up as moire on screen, so the
        # strip is area-averaged first and then blurred to push the surviving
        # high frequencies below the sampling limit.
        # Build at the exact width the 2k level expects: resizing afterwards
        # would reintroduce the high frequencies this step exists to remove.
        target_w = 2048
        img = img.resize((target_w, crop_h), Image.BOX)

        # The alpha channel is the one that hurts: it multiplies straight into
        # the blend factor, so a 6% ripple in opacity reads as a visible grid
        # even when the colour data looks smooth. Blur alpha much harder than
        # RGB — the broad gaps (Cassini division) survive, the ringlet noise
        # does not.
        r, g, b, a = img.split()
        a = a.filter(ImageFilter.GaussianBlur(9.0))
        img = Image.merge("RGBA", (r, g, b, a)).filter(ImageFilter.GaussianBlur(3.0))

        is_png = True
    else:
        raise ValueError(f"unknown mode {mode}")

    ext = "png" if is_png else "jpg"
    log(f"  {body}/{name}  source {native_w}x{img.size[1]}  -> {[l[0] for l in levels]}")

    for level, w, h in levels:
        d = os.path.join(OUT, level, body)
        os.makedirs(d, exist_ok=True)

        out_h = h
        if is_png:
            # Preserve the source aspect ratio of the cropped strip.
            out_h = max(1, round(img.size[1] * (w / img.size[0])))

        if img.size == (w, out_h):
            out = img
        else:
            out = img.resize((w, out_h), Image.LANCZOS)

        dst = os.path.join(d, f"{name}.{ext}")
        if is_png:
            out.save(dst, "PNG", optimize=True)
        else:
            out.save(dst, "JPEG", quality=quality, subsampling=0, optimize=True)
        log(f"         {level}/{body}/{name}.{ext}  {human(os.path.getsize(dst))}")

        if out is not img:
            out.close()

    img.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default="", help="comma separated body ids")
    args = ap.parse_args()

    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    wanted = {s.strip() for s in args.only.split(",") if s.strip()}
    specs = [s for s in MAP_SPECS if not wanted or s[0] in wanted]

    sources = sorted({s[2] for s in specs})

    log(f"== sources ({len(sources)}) ==")
    raw_paths = {name: download(name, args.force) for name in sources}

    log(f"\n== build ({len(specs)} maps) ==")
    for spec in specs:
        process(spec, raw_paths)

    log("\n== summary ==")
    total = 0
    for level, _, _ in LEVELS:
        d = os.path.join(OUT, level)
        if not os.path.isdir(d):
            continue
        size = 0
        for root, _, files in os.walk(d):
            size += sum(os.path.getsize(os.path.join(root, f)) for f in files)
        total += size
        log(f"  {level}: {human(size)}")
    log(f"  total: {human(total)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
