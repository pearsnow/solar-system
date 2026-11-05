"""Date handling checks: local calendar date, round-trip through the picker.

The clock runs at one simulated day per second by default, so the picker is
paused before reading anything back — otherwise the answer drifts while we look
at it.
"""

import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"

errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True, args=["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
    )
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="load", timeout=120000)
    page.wait_for_function("() => !document.getElementById('loader')", timeout=180000)

    at_load = page.evaluate(
        """() => {
            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            return {
                shown: document.getElementById('clock').textContent,
                local: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
                utc: d.toISOString().slice(0, 10),
                tz: -d.getTimezoneOffset() / 60,
            };
        }"""
    )
    # The clock runs at one simulated day per second, so this read is always a
    # couple of days ahead of the wall clock. Printed for context only — the
    # exact date logic is covered by tools/clock-test.mjs in Node.
    print(f"at load   shown={at_load['shown']}  local={at_load['local']}  utc={at_load['utc']}  tz=UTC{at_load['tz']:+.0f}")

    # Pause, then jump to a fixed date and read it back.
    page.click("#tb-play")
    page.wait_for_timeout(400)

    page.fill("#tb-date", "1969-07-20")
    page.dispatch_event("#tb-date", "change")
    page.wait_for_timeout(1200)

    jumped = page.evaluate(
        """() => ({
            input: document.getElementById('tb-date').value,
            hud: document.getElementById('clock').textContent,
        })"""
    )
    print(f"jump      input={jumped['input']}  hud={jumped['hud']}")

    # Back to today, still paused.
    page.click("#tb-today")
    page.wait_for_timeout(800)

    today = page.evaluate(
        """() => {
            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            return {
                input: document.getElementById('tb-date').value,
                hud: document.getElementById('clock').textContent,
                local: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            };
        }"""
    )
    print(f"today     input={today['input']}  hud={today['hud']}  local={today['local']}")

    browser.close()

ok = (
    jumped["input"] == "1969-07-20"
    and jumped["hud"].startswith("1969-07-20")
    and today["input"] == today["local"]
    and today["hud"].startswith(today["local"])
    and not errors
)
print("page errors:", errors or "none")
print("RESULT:", "PASS" if ok else "FAIL")
