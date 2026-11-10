"""Fetch real orbital elements for a curated list of well-known comets from JPL SBDB.

Writes .data/comets.raw.json — one record per comet, full precision.
"""
import json
import os
import time
import urllib.parse
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "comets.raw.json")

# Designations as published by the MPC/JPL.  Ordered roughly by fame.
DESIGNATIONS = [
    # --- periodic, numbered ---
    "1P", "2P", "6P", "8P", "9P", "10P", "12P", "13P", "15P", "17P", "19P",
    "21P", "22P", "26P", "27P", "29P", "45P", "46P", "48P", "55P", "67P",
    "73P", "81P", "96P", "103P", "109P", "153P",
    # --- long period / sungrazing, all with well determined orbits ---
    "C/1995 O1", "C/1996 B2", "C/2001 Q4", "C/2006 P1", "C/2011 W3",
    "C/2012 S1", "C/2014 UN271", "C/2017 K2", "C/2019 Y4", "C/2020 F3",
    "C/2021 A1", "C/2022 E3", "C/2023 A3",
    # --- interstellar ---
    "1I", "2I", "3I",
]

BASE = "https://ssd-api.jpl.nasa.gov/sbdb.api"


def fetch(des):
    url = f"{BASE}?sstr={urllib.parse.quote(des)}&full-prec=true"
    with urllib.request.urlopen(url, timeout=45) as fh:
        return json.load(fh)


def main():
    out = []
    for des in DESIGNATIONS:
        try:
            j = fetch(des)
        except Exception as exc:  # network hiccup: retry once
            time.sleep(2)
            try:
                j = fetch(des)
            except Exception as exc2:
                print(f"FAIL {des}: {exc2}")
                continue
        if "orbit" not in j:
            print(f"NO ORBIT {des}: {j.get('message')}")
            continue
        el = {e["name"]: e["value"] for e in j["orbit"]["elements"]}
        obj = j["object"]
        rec = {
            "des": obj.get("des"),
            "fullname": obj.get("fullname"),
            "kind": obj.get("kind"),
            "prefix": obj.get("prefix"),
            "cls": (obj.get("orbit_class") or {}).get("name"),
            "epoch": j["orbit"].get("epoch"),
            "elements": el,
            "phys": {p["name"]: p.get("value") for p in (j.get("phys_par") or [])},
        }
        out.append(rec)
        print(f"{des:12s} -> {rec['fullname']:32s} e={el.get('e')} a={el.get('a')}")
        time.sleep(0.4)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1)
    print(f"\nwrote {len(out)} comets -> {OUT}")


if __name__ == "__main__":
    main()
