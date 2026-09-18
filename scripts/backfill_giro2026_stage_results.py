#!/usr/bin/env python3
"""Backfill the finished 2026 Giro's stage results and after-stage standings.

Usage: python3 scripts/backfill_giro2026_stage_results.py
Dependencies: requests, selectolax (the same as fetch_riders.py)

Reads the Order of arrival (ORARR) table and the five jersey/team standings
after each stage. Output is written only after all stages validate.
This is a one-off static-data command; it is not part of scheduled scraping.
"""

import json
import re
from pathlib import Path

import requests
from selectolax.parser import HTMLParser

RESULTS = Path(__file__).resolve().parent.parent / "data/giro2026-results.json"
BASE = "https://www.giroditalia.it/en/classifiche"
HEADERS = {"User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9"}
CLASSIFICATIONS = {
    "gc": ("CLGEN", "tempo", False),
    "points": ("CLPUNGEN", "punti", False),
    "mountains": ("CLGPMGEN", "punti", False),
    "youth": ("CLGENGIO", "tempo", False),
    "teams": ("CLSQAGEN", "tempo", True),
}


def stage_rows(html: str) -> list[dict]:
    """Extract only published individual finishers from the ORARR table."""
    table = HTMLParser(html).css_first(".js-tab-classifica-ORARR")
    if table is None:
        raise ValueError("Order of arrival table is missing")

    rows = []
    for line in table.css(".line-table"):
        position = line.css_first(".position")
        athlete = line.css_first(".atleta-info a")
        time = line.css_first(".tempo")
        if position is None or athlete is None or time is None:
            raise ValueError("Incomplete Order of arrival row")
        pos = position.text(strip=True)
        if not pos.isdigit():
            raise ValueError(f"Non-numeric individual position: {pos!r}")

        given = line.css_first(".atleta-info .name")
        surname = line.css_first(".atleta-info .surname")
        name = " ".join(part.text(strip=True) for part in (given, surname) if part)
        bib_match = re.fullmatch(r"Rider/(\d+)", athlete.attributes.get("data-destination", ""))
        team = line.css_first(".team")
        flag = line.css_first(".flag img")
        flag_url = (flag.attributes.get("data-src") or flag.attributes.get("src") or "") if flag else ""
        gap = line.css_first(".distacco")
        row = {
            "pos": int(pos),
            "rider": name,
            "team": team.text(strip=True) if team else "",
            "nat": flag_url.rsplit("/", 1)[-1].split(".", 1)[0].upper(),
            "val": time.text(strip=True),
        }
        if bib_match:
            row["bib"] = int(bib_match.group(1))
        if gap and gap.text(strip=True) not in ("", "-", "0:00"):
            row["gap"] = gap.text(strip=True)
        rows.append(row)

    if not rows or [row["pos"] for row in rows] != list(range(1, len(rows) + 1)):
        raise ValueError("Individual positions are empty, repeated, or out of order")
    return rows


def classification_rows(tree: HTMLParser, code: str, value_class: str, team_only: bool) -> list[dict]:
    """Read a published after-stage ranking; RCS leaves team ranks implicit in row order."""
    table = tree.css_first(f".js-tab-classifica-{code}")
    if table is None:
        raise ValueError(f"After-stage classification {code} is missing")

    rows = []
    for order, line in enumerate(table.css(".line-table"), start=1):
        team = line.css_first(".team")
        value = line.css_first(f".{value_class}")
        gap = line.css_first(".distacco")
        if team is None or value is None:
            raise ValueError(f"Incomplete {code} row")

        if team_only:
            row = {"pos": order, "rider": team.text(strip=True), "team": "", "nat": "", "val": value.text(strip=True)}
        else:
            position = line.css_first(".position")
            athlete = line.css_first(".atleta-info a")
            given = line.css_first(".atleta-info .name")
            surname = line.css_first(".atleta-info .surname")
            if position is None or athlete is None or given is None or surname is None or not position.text(strip=True).isdigit():
                raise ValueError(f"Incomplete individual {code} row")
            flag = line.css_first(".flag img")
            flag_url = (flag.attributes.get("data-src") or flag.attributes.get("src") or "") if flag else ""
            row = {
                "pos": int(position.text(strip=True)),
                "rider": f"{given.text(strip=True)} {surname.text(strip=True)}",
                "team": team.text(strip=True),
                "nat": flag_url.rsplit("/", 1)[-1].split(".", 1)[0].upper(),
                "val": value.text(strip=True),
            }
            bib_match = re.fullmatch(r"Rider/(\d+)", athlete.attributes.get("data-destination", ""))
            if bib_match:
                row["bib"] = int(bib_match.group(1))
        if gap and gap.text(strip=True) not in ("", "-", "0:00"):
            row["gap"] = gap.text(strip=True)
        rows.append(row)

    if not rows or rows[0]["pos"] != 1:
        raise ValueError(f"After-stage classification {code} has no leader")
    return rows


def after_stage_classifications(html: str) -> dict:
    """Read GC, points, mountains, youth and teams as of one stage finish."""
    tree = HTMLParser(html)
    return {
        key: {"rows": classification_rows(tree, code, value_class, team_only)}
        for key, (code, value_class, team_only) in CLASSIFICATIONS.items()
    }


def main() -> None:
    data = json.loads(RESULTS.read_text(encoding="utf-8"))
    winners = {winner["n"]: winner["winner"] for winner in data["stageWinners"]}
    expected_stages = set(range(1, data["afterStage"] + 1))
    if set(winners) != expected_stages:
        raise ValueError("Stage winners do not cover every stage")

    session = requests.Session()
    session.headers.update(HEADERS)
    stages = {}
    for number in sorted(expected_stages):
        stage_url = f"{BASE}/di-tappa/{number}/"
        stage_response = session.get(stage_url, timeout=30)
        stage_response.raise_for_status()
        rows = stage_rows(stage_response.text)
        # The existing winner list sometimes includes a middle name omitted by RCS.
        published_parts = rows[0]["rider"].casefold().split()
        winner_parts = winners[number].casefold().split()
        if (published_parts[0], published_parts[-1]) != (winner_parts[0], winner_parts[-1]):
            raise ValueError(f"Stage {number} winner differs: {rows[0]['rider']} != {winners[number]}")
        general_url = f"{BASE}/generali/tappa/{number}/"
        general_response = session.get(general_url, timeout=30)
        general_response.raise_for_status()
        classifications = after_stage_classifications(general_response.text)
        if number == data["afterStage"]:
            for key in CLASSIFICATIONS:
                final_leader = data[key]["rows"][0]["rider"]
                source_leader = classifications[key]["rows"][0]["rider"]
                # RCS and the saved final team names use different punctuation.
                if re.sub(r"\W+", "", final_leader.casefold()) != re.sub(r"\W+", "", source_leader.casefold()):
                    raise ValueError(f"Final {key} leader differs: {source_leader} != {final_leader}")
        stages[str(number)] = {"rows": rows, "classifications": classifications}
        print(f"Stage {number}: {len(rows)} finishers and five classifications", flush=True)

    data["stageResults"] = stages
    RESULTS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote {RESULTS}")


if __name__ == "__main__":
    main()
