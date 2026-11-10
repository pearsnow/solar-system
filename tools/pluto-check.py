"""Pluto: does the Sputnik Planitia heart rotate into view?

Pluto spins once per 6.4 days. At the default 1 day/second that is one turn per
6.4 s, so a single screenshot proves nothing — sample several frames and tile them.
"""

import sys

from PIL import Image
from playwright.sync_api import sync_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\35877\AppData\Local\Temp\opencode\scratch"
FRAMES = 4

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True, args=["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
    )
    page = browser.new_page(viewport={"width": 1600, "height": 900})
    page.goto(
        "http://localhost:5174/?q=2k&look=pluto", wait_until="load", timeout=120000
    )
    page.wait_for_function(
        "() => !document.getElementById('loader')", timeout=180000
    )
    page.wait_for_timeout(6000)

    tiles = []
    for i in range(FRAMES):
        path = f"{OUT}\\pluto-{i}.png"
        page.screenshot(path=path)
        tiles.append(Image.open(path).crop((300, 150, 900, 750)))
        page.wait_for_timeout(1600)

    browser.close()

w, h = tiles[0].size
sheet = Image.new("RGB", (w * 2, h * 2))
for i, tile in enumerate(tiles):
    sheet.paste(tile, ((i % 2) * w, (i // 2) * h))
sheet.save(f"{OUT}\\pluto-sheet.png")
print("done")
