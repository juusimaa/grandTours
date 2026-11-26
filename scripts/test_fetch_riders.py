#!/usr/bin/env python3
"""Offline self-check: a failed fetch must never overwrite the riders file."""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fetch_results  # noqa: E402
import fetch_riders  # noqa: E402

BASE = "https://example.test"
RIDERS = """<section class="competitors"><div class="list--competitors">
<h3><a href="/en/team/abc/x">Team</a></h3>
<ul><li class="list__box__item"><span class="bib">1</span>
<a class="runner__link">TADEJ POGACAR</a><i data-class="flag--fra"></i></li></ul>
</div></section>"""


def run(rankings, withdrawal):
    def fake(url):
        for suffix, page in (("/en/riders", RIDERS), ("/en/rankings", rankings), ("/en/withdrawal", withdrawal)):
            if url.endswith(suffix):
                if isinstance(page, Exception):
                    raise page
                return page
        raise AssertionError(url)

    # fetch_withdrawals lives in fetch_results and calls its own `fetch`.
    orig, fetch_riders.fetch, fetch_results.fetch = fetch_riders.fetch, fake, fake
    try:
        out = Path(tempfile.mkdtemp()) / "riders.json"
        out.write_text("KNOWN", encoding="utf-8")
        assert fetch_riders.fetch_letour(BASE, out) == 0
        return out.read_text(encoding="utf-8")
    finally:
        fetch_riders.fetch = fetch_results.fetch = orig


def test_rankings_failure_keeps_file():
    assert run(RuntimeError("boom"), "<html></html>") == "KNOWN"


def test_withdrawal_failure_keeps_file():
    assert run("<html></html>", RuntimeError("boom")) == "KNOWN"


def test_race_not_started_writes_start_list():
    text = run("<html></html>", "<html></html>")
    assert text != "KNOWN"
    rider = json.loads(text)["teams"][0]["riders"][0]
    assert rider["bib"] == 1 and rider["status"] == "DNF"  # no GC yet: current behaviour


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
