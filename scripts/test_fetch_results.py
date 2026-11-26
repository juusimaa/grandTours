#!/usr/bin/env python3
"""Offline self-check: failed fetches must never overwrite known-good results."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_results  # noqa: E402

BASE = "https://example.test"

ROW = """<tr class="rankingTables__row">
<td class="rankingTables__row__position is-alignCenter">{pos}</td>
<td><div class="rankingTables__row__profile runner"><img alt="{rider}"></div></td>
<td class="is-alignCenter hidden">99</td>
<td class="team">{team}</td>
<td><i data-class="flag--fra"></i></td>
<td class="is-alignCenter">{val}</td>
<td class="is-alignCenter">{gap}</td>
</tr>"""
TABLE = "<table><tbody>" + ROW.format(pos=1, rider="A One", team="TeamA", val="1h", gap="-") \
    + ROW.format(pos=2, rider="B Two", team="TeamB", val="2h", gap="+0:10") + "</tbody></table>"


def rankings_page(urls):
    stack = json.dumps(urls).replace('"', "&quot;").replace("/", "\\/")
    return f'<div data-ajax-stack={stack}></div>'


def test_parse_table():
    row = fetch_results.parse_table(TABLE, False, "time")[1]
    assert row == {"pos": 2, "rider": "B Two", "team": "TeamB", "nat": "FRA", "val": "2h", "gap": "+0:10"}, row


def run(pages, prev):
    def fake(url):
        page = pages.get(url.removeprefix(BASE))
        if page is None or isinstance(page, Exception):
            raise page or RuntimeError("no page " + url)
        return page

    orig, fetch_results.fetch = fetch_results.fetch, fake
    try:
        out = Path(tempfile.mkdtemp()) / "r.json"
        out.write_text(json.dumps(prev), encoding="utf-8")
        assert fetch_results.fetch_letour("t", BASE, out) == 0
        return json.loads(out.read_text(encoding="utf-8"))
    finally:
        fetch_results.fetch = orig


GC, PTS, ITE, IPE = "/en/ajax/ranking/1/itg/x", "/en/ajax/ranking/1/ipg/x", "/en/ajax/ite/1", "/en/ajax/ipe/1"
GENERAL = {"itg": GC, "ipg": PTS}
STAGE = {"ite": ITE, "ipe": IPE}
OLD_POINTS = [{"pos": 1, "rider": "Old", "team": "", "nat": "FRA", "val": "9"}]


def test_overall_failure_keeps_previous_rows():
    pages = {
        "/en/rankings": rankings_page(GENERAL),
        GC: TABLE,
        PTS: RuntimeError("boom"),
    }
    prev = {"points": {"rows": OLD_POINTS}}
    res = run(pages, prev)
    assert res["points"]["rows"] == OLD_POINTS
    assert res["gc"]["rows"][0]["rider"] == "A One"


def test_stage_failure_keeps_previous_section():
    sections = [{"label": "Finish", "rows": OLD_POINTS}]
    prev_entry = {"rows": [{"pos": 1, "rider": "Old"}], "points": sections, "mountains": [],
                  "youth": [], "teams": [], "combative": None}
    pages = {
        "/en/rankings": rankings_page(GENERAL),
        GC: TABLE,
        PTS: TABLE,
        "/en/rankings/stage-1": rankings_page({}) + rankings_page(STAGE),
        ITE: TABLE,
        IPE: RuntimeError("boom"),
    }
    res = run(pages, {"stageResults": {"1": prev_entry}})
    assert res["stageResults"]["1"]["points"] == sections
    assert res["stageResults"]["1"]["rows"][0]["rider"] == "A One"


def test_main_continues_after_failure():
    calls = []

    def bad(tour_id, base, out):
        calls.append(tour_id)
        raise RuntimeError("boom")

    def good(tour_id, base, out):
        calls.append(tour_id)
        return 0

    saved = fetch_results.TOURS, fetch_results.SOURCES, sys.argv
    fetch_results.TOURS = {"a": {"source": "bad", "base": "", "out": "a"},
                           "b": {"source": "good", "base": "", "out": "b"}}
    fetch_results.SOURCES = {"bad": bad, "good": good}
    sys.argv = ["x"]
    try:
        assert fetch_results.main() == 1
        assert calls == ["a", "b"]
    finally:
        fetch_results.TOURS, fetch_results.SOURCES, sys.argv = saved


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
