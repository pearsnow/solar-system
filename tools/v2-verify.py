"""Capture the v2 states that need eyeballing, plus the runtime counters.

Usage: python tools/v2-verify.py <base-url> <out-dir>
"""

import json
import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5174"
OUT = sys.argv[2] if len(sys.argv) > 2 else r"C:\Users\35877\AppData\Local\Temp\opencode\scratch"

SHOTS = [
    ("overview", "/?q=2k", 2500),
    ("saturn", "/?q=2k&look=saturn", 6000),
    ("io", "/?q=2k&look=jupiter-io", 6000),
    ("pluto", "/?q=2k&look=pluto", 6000),
    ("halley", "/?q=2k&look=1p-halley", 6000),
]

wanted = sys.argv[3].split(",") if len(sys.argv) > 3 else None
if wanted:
    SHOTS = [s for s in SHOTS if s[0] in wanted]

errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True, args=["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
    )

    for name, path, settle in SHOTS:
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.on("pageerror", lambda e, n=name: errors.append(f"{n}: {e}"))
        page.goto(BASE + path, wait_until="load", timeout=120000)
        page.wait_for_function("() => !document.getElementById('loader')", timeout=180000)
        if settle:
            page.wait_for_timeout(settle)
        page.screenshot(path=f"{OUT}\\v2-{name}.png")
        if name == "overview":
            info = page.evaluate(
                """() => {
                    const s = window.__solar;
                    const f = s.focusables;
                    const moons = f.filter(x => x.body.parent);
                    return {
                        total: f.length,
                        planets: f.filter(x => x.el).length,
                        moons: moons.length,
                        comets: f.filter(x => x.body.kind === 'comet').length,
                        hud: document.getElementById('quality').textContent,
                    };
                }"""
            )
            print("counts:", json.dumps(info, ensure_ascii=False))
        page.close()

    browser.close()

print("page errors:", errors or "none")
