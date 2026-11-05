"""Check LOD state and reported texture memory across focus transitions."""

from playwright.sync_api import sync_playwright

errors = []


def levels(page):
    return page.evaluate("() => window.__solar.lodState().map(x => x.level)")


def mb(page):
    return round(page.evaluate("() => window.__solar.textureBytes()") / 1048576, 1)


with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True, args=["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"]
    )
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.on("pageerror", lambda e: errors.append(str(e)))

    page.goto("http://localhost:5173/?q=8k", wait_until="load", timeout=60000)
    page.wait_for_timeout(18000)
    print("overview:", mb(page), "MB", levels(page))

    page.click(".chip:nth-child(4)")  # 地球
    page.wait_for_timeout(14000)
    print("earth   :", mb(page), "MB", levels(page))
    print(
        "earth day map:",
        page.evaluate(
            "() => window.__solar.planets.find(e => e.id === 'earth').planet.maps.dayMap.image.width"
        ),
    )

    page.click("#tb-home")
    page.wait_for_timeout(14000)
    print("home    :", mb(page), "MB", levels(page))

    browser.close()

print("page errors:", errors or "none")
