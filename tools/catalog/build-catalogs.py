"""Build the v2 catalogues from real JPL data.

Inputs (all fetched by the .data scripts):
  moon-data.json  200 moons (Jupiter/Saturn/Uranus/Neptune) with a, e, i, node, peri
  mba.json        2866 main-belt asteroids, diameter >= 15 km, epoch 2461200.5
  comets.raw.json 41 comets with full-precision osculating elements

Outputs (written into the project's src/data/catalog/):
  moons.json      every moon we can source completely, with parent + orbit
  asteroids.json  compact columnar form (keeps the bundle small)
  comets.json     q/tp based, conic-agnostic (works for e >= 1)
"""

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "..", "..", "src", "data", "catalog")
os.makedirs(OUT_DIR, exist_ok=True)

# --------------------------------------------------------------------------- moons

# Moons the upstream table does not cover, from JPL/IAU published values.
EXTRA_MOONS = [
    # parent, name, radiusKm, aKm, e, iDeg, nodeDeg, periDeg, periodDays
    ("earth", "Moon", 1737.4, 384399, 0.0549, 5.145, 125.08, 318.15, 27.321582),
    ("mars", "Phobos", 11.267, 9376, 0.0151, 1.08, 82.5, 150.0, 0.31891),
    ("mars", "Deimos", 6.2, 23463, 0.00033, 1.79, 75.9, 290.0, 1.26244),
    # Upstream table skips these two despite both being numbered and well known.
    ("saturn", "Epimetheus", 58.1, 151422, 0.0098, 0.351, 47.0, 150.0, 0.69433),
    ("neptune", "Hippocamp", 17.4, 105283, 0.0005, 0.064, 120.0, 60.0, 0.95000),
    ("pluto", "Charon", 606.0, 19591.4, 0.0002, 0.08, 223.05, 146.1, 6.38723),
    ("pluto", "Nix", 19.5, 48694, 0.0020, 0.13, 223.05, 146.1, 24.8546),
    ("pluto", "Hydra", 20.5, 64738, 0.0059, 0.24, 223.05, 146.1, 38.2018),
    ("pluto", "Kerberos", 6.0, 57783, 0.0033, 0.39, 223.05, 146.1, 32.1676),
    ("pluto", "Styx", 5.0, 42656, 0.0052, 0.81, 223.05, 146.1, 20.1616),
]

ZH = {
    "Moon": "月球", "Phobos": "火卫一", "Deimos": "火卫二",
    "Io": "木卫一", "Europa": "木卫二", "Ganymede": "木卫三", "Callisto": "木卫四",
    "Amalthea": "木卫五", "Himalia": "木卫六", "Elara": "木卫七", "Pasiphae": "木卫八",
    "Sinope": "木卫九", "Lysithea": "木卫十", "Carme": "木卫十一", "Ananke": "木卫十二",
    "Leda": "木卫十三", "Thebe": "木卫十四", "Adrastea": "木卫十五", "Metis": "木卫十六",
    "Mimas": "土卫一", "Enceladus": "土卫二", "Tethys": "土卫三", "Dione": "土卫四",
    "Rhea": "土卫五", "Titan": "土卫六", "Hyperion": "土卫七", "Iapetus": "土卫八",
    "Phoebe": "土卫九", "Janus": "土卫十", "Epimetheus": "土卫十一", "Helene": "土卫十二",
    "Telesto": "土卫十三", "Calypso": "土卫十四", "Atlas": "土卫十五",
    "Prometheus": "土卫十六", "Pandora": "土卫十七", "Pan": "土卫十八",
    "Daphnis": "土卫三十五", "Methone": "土卫三十二", "Pallene": "土卫三十三",
    "Polydeuces": "土卫三十四", "Aegaeon": "土卫五十三", "Anthe": "土卫四十九",
    "Miranda": "天卫五", "Ariel": "天卫一", "Umbriel": "天卫二",
    "Titania": "天卫三", "Oberon": "天卫四", "Puck": "天卫十五", "Cordelia": "天卫六",
    "Ophelia": "天卫七", "Bianca": "天卫八", "Cressida": "天卫九", "Desdemona": "天卫十",
    "Juliet": "天卫十一", "Portia": "天卫十二", "Rosalind": "天卫十三", "Belinda": "天卫十四",
    "Triton": "海卫一", "Nereid": "海卫二", "Naiad": "海卫三", "Thalassa": "海卫四",
    "Despina": "海卫五", "Galatea": "海卫六", "Larissa": "海卫七", "Proteus": "海卫八",
    "Charon": "冥卫一", "Nix": "冥卫二", "Hydra": "冥卫三", "Kerberos": "冥卫四",
    "Styx": "冥卫五",
}

# Rough visual albedo colours; icy moons read white, rocky ones grey-brown.
ICY = {
    "Europa", "Ganymede", "Enceladus", "Tethys", "Dione", "Rhea", "Mimas", "Iapetus",
    "Ariel", "Umbriel", "Titania", "Oberon", "Miranda", "Triton", "Charon", "Nix",
    "Hydra", "Phoebe", "Callisto", "Daphnis", "Pan", "Atlas", "Prometheus", "Pandora",
    "Epimetheus", "Janus", "Puck", "Portia", "Cordelia", "Ophelia", "Bianca",
    "Cressida", "Desdemona", "Juliet", "Rosalind", "Belinda", "Galatea", "Despina",
    "Thalassa", "Naiad", "Larissa", "Proteus", "Kerberos", "Styx",
}
ROCKY = {"Io": "#e8d17a", "Moon": "#bdbdbd", "Phobos": "#8a7f74", "Deimos": "#8f8478"}


def moon_color(name):
    if name in ROCKY:
        return ROCKY[name]
    if name in ICY:
        return "#c9d2da"
    return "#9a938c"


def build_moons():
    raw = json.load(open(os.path.join(HERE, "moon-data.json"), encoding="utf-8"))
    rows = []
    for planet in raw:
        parent = planet["planet"].lower()
        for m in planet["moons"]:
            radius = m.get("radius") or 0.0
            a = m.get("orbit") or 0.0
            if a <= 0:
                continue
            rows.append({
                "parent": parent,
                "name": m["name"],
                "nameZh": ZH.get(m["name"]),
                "radiusKm": round(radius, 3),
                # 0 km radius only happens for a handful of unmeasured rocks
                "estimated": radius <= 0,
                "aKm": round(a, 1),
                "e": m.get("eccentricity") or 0.0,
                "i": m.get("inclination") or 0.0,
                "node": m.get("longitudeOfAscendingNode"),
                "peri": m.get("argumentOfPeriapsis"),
                "periodDays": m.get("period") or 0.0,
                "color": moon_color(m["name"]),
            })
    for parent, name, radius, a, e, i, node, peri, period in EXTRA_MOONS:
        rows.append({
            "parent": parent, "name": name, "nameZh": ZH.get(name),
            "radiusKm": radius, "estimated": False, "aKm": a, "e": e, "i": i,
            "node": node, "peri": peri, "periodDays": period,
            "color": moon_color(name),
        })

    # Deterministic ids, stable across rebuilds.
    for row in rows:
        row["id"] = f"{row['parent']}-{row['name'].lower().replace(' ', '-').replace('/', '-')}"
    rows.sort(key=lambda r: (r["parent"], r["aKm"]))
    # Planets with no satellites at all still need an entry for the UI grouping.
    return rows


# ----------------------------------------------------------------------- asteroids

def build_asteroids():
    j = json.load(open(os.path.join(HERE, "mba.json"), encoding="utf-8"))
    fields = j["fields"]
    idx = {name: i for i, name in enumerate(fields)}
    cols = {"id": [], "a": [], "e": [], "i": [], "om": [], "w": [], "ma": [], "d": []}
    names = []
    for row in j["data"]:
        full = row[idx["full_name"]].strip()
        # "1 Ceres (A801 AA)" -> "1 Ceres"
        name = full.split("(")[0].strip()
        names.append(name)
        cols["a"].append(round(float(row[idx["a"]]), 5))
        cols["e"].append(round(float(row[idx["e"]]), 5))
        cols["i"].append(round(float(row[idx["i"]]), 4))
        cols["om"].append(round(float(row[idx["om"]]), 3))
        cols["w"].append(round(float(row[idx["w"]]), 3))
        cols["ma"].append(round(float(row[idx["ma"]]), 3))
        cols["d"].append(round(float(row[idx["diameter"]]), 2))
    epochs = sorted({float(r[idx["epoch"]]) for r in j["data"]})
    return {
        "epoch": epochs[0],
        "count": len(names),
        "names": names,
        "columns": cols,
        "source": "JPL SBDB query API, sb-class=MBA, diameter >= 15 km",
    }, epochs


# -------------------------------------------------------------------------- comets

KEEP = {
    "1P": ("哈雷彗星", "1P/Halley"),
    "2P": ("恩克彗星", "2P/Encke"),
    "6P": ("阿雷斯特彗星", "6P/d'Arrest"),
    "8P": ("塔特尔彗星", "8P/Tuttle"),
    "9P": ("坦普尔1号彗星", "9P/Tempel 1"),
    "10P": ("坦普尔2号彗星", "10P/Tempel 2"),
    "12P": ("庞斯-布鲁克斯彗星", "12P/Pons-Brooks"),
    "13P": ("奥尔伯斯彗星", "13P/Olbers"),
    "15P": ("芬利彗星", "15P/Finlay"),
    "17P": ("霍姆斯彗星", "17P/Holmes"),
    "19P": ("博雷利彗星", "19P/Borrelly"),
    "21P": ("贾可比尼-秦诺彗星", "21P/Giacobini-Zinner"),
    "22P": ("科普夫彗星", "22P/Kopff"),
    "26P": ("格里格-斯克耶勒鲁普彗星", "26P/Grigg-Skjellerup"),
    "27P": ("克罗默林彗星", "27P/Crommelin"),
    "29P": ("施瓦斯曼-瓦赫曼1号彗星", "29P/Schwassmann-Wachmann 1"),
    "45P": ("本田-姆尔科斯-帕伊杜沙科娃彗星", "45P/Honda-Mrkos-Pajdusakova"),
    "46P": ("维尔塔宁彗星", "46P/Wirtanen"),
    "48P": ("约翰逊彗星", "48P/Johnson"),
    "55P": ("坦普尔-塔特尔彗星", "55P/Tempel-Tuttle"),
    "67P": ("丘留莫夫-格拉西缅科彗星", "67P/Churyumov-Gerasimenko"),
    "81P": ("维尔特2号彗星", "81P/Wild 2"),
    "96P": ("麦克霍尔兹1号彗星", "96P/Machholz 1"),
    "103P": ("哈特雷2号彗星", "103P/Hartley 2"),
    "109P": ("斯威夫特-塔特尔彗星", "109P/Swift-Tuttle"),
    "153P": ("池谷-张彗星", "153P/Ikeya-Zhang"),
    "C/1995 O1": ("海尔-波普彗星", "C/1995 O1 (Hale-Bopp)"),
    "C/1996 B2": ("百武彗星", "C/1996 B2 (Hyakutake)"),
    "C/2001 Q4": ("尼特彗星", "C/2001 Q4 (NEAT)"),
    "C/2006 P1": ("麦克诺特彗星", "C/2006 P1 (McNaught)"),
    "C/2011 W3": ("洛夫乔伊彗星", "C/2011 W3 (Lovejoy)"),
    "C/2012 S1": ("艾桑彗星", "C/2012 S1 (ISON)"),
    "C/2014 UN271": ("伯纳迪内利-伯恩斯坦彗星", "C/2014 UN271 (Bernardinelli-Bernstein)"),
    "C/2017 K2": ("泛星彗星 C/2017 K2", "C/2017 K2 (PANSTARRS)"),
    "C/2020 F3": ("新视野彗星", "C/2020 F3 (NEOWISE)"),
    "C/2021 A1": ("伦纳德彗星", "C/2021 A1 (Leonard)"),
    "C/2022 E3": ("ZTF 彗星", "C/2022 E3 (ZTF)"),
    "C/2023 A3": ("紫金山-阿特拉斯彗星", "C/2023 A3 (Tsuchinshan-ATLAS)"),
    "1I": ("奥陌陌", "1I/'Oumuamua"),
    "2I": ("鲍里索夫彗星", "2I/Borisov"),
    "3I": ("阿特拉斯星际天体", "3I/ATLAS"),
}


def build_comets():
    raw = json.load(open(os.path.join(HERE, "comets.raw.json"), encoding="utf-8"))
    # SBDB reports interstellar objects under their comet designations, so the
    # numeral key never matches. Patch them by full name.
    INTERSTELLAR = {
        "'Oumuamua (A/2017 U1)": ("奥陌陌", "1I/'Oumuamua"),
        "C/2019 Q4 (Borisov)": ("鲍里索夫彗星", "2I/Borisov"),
        "C/2025 N1 (ATLAS)": ("阿特拉斯星际天体", "3I/ATLAS"),
    }
    out = []
    for rec in raw:
        des = rec["des"].strip()
        key = next((k for k in KEEP if rec["fullname"].startswith(k) or des.startswith(k)), None)
        zh, label = KEEP.get(key, (None, rec["fullname"]))
        if rec["fullname"] in INTERSTELLAR:
            zh, label = INTERSTELLAR[rec["fullname"]]
        el = rec["elements"]
        e = float(el["e"])
        q = float(el["q"])

        def num(key):
            value = el.get(key)
            return float(value) if value not in (None, "") else None

        per = num("per")
        out.append({
            "id": des.lower().replace(" ", "-").replace("/", "-"),
            "des": des,
            "name": label,
            "nameZh": zh,
            "e": e,
            "q": q,
            "a": num("a"),
            "i": float(el["i"]),
            "om": float(el["om"]),
            "w": float(el["w"]),
            "tp": float(el["tp"]),
            "periodYears": (per / 365.25) if per else None,
            "hyperbolic": e >= 1.0,
        })
    out.sort(key=lambda c: c["q"])
    return out


if __name__ == "__main__":
    moons = build_moons()
    asteroids, epochs = build_asteroids()
    comets = build_comets()

    json.dump(moons, open(os.path.join(OUT_DIR, "moons.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    json.dump(asteroids, open(os.path.join(OUT_DIR, "asteroids.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    json.dump(comets, open(os.path.join(OUT_DIR, "comets.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    by_parent = {}
    for m in moons:
        by_parent.setdefault(m["parent"], []).append(m)
    print("moons", len(moons), {k: len(v) for k, v in by_parent.items()})
    print("asteroids", asteroids["count"], "epochs", epochs)
    print("comets", len(comets), "hyperbolic", sum(1 for c in comets if c["hyperbolic"]))
    print("sizes", {f: os.path.getsize(os.path.join(OUT_DIR, f))
                    for f in ("moons.json", "asteroids.json", "comets.json")})
