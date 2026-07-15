"""Golden test harness (task D3): run the brief parser against every
fixture in fixtures/anonymized/ and diff its output against each
fixture's `expected` block. Skipped (not failed) when OPENAI_API_KEY
isn't configured — this repo's dev environment has no key set, so this
suite has only been exercised structurally (fixture loading, diff logic),
not against a live GPT call. Wire into ci.yml (I1) where a key exists.
"""

import json
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.services.brief_parser import parse_enquiry

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "anonymized"

# Below this fraction of expected fields matching, a fixture is a hard
# failure rather than a logged drift — see docs/progress.md for the
# rationale on why this stays permissive early on.
MIN_FIELD_MATCH_RATIO = 0.8


def _load_fixtures() -> list[tuple[str, dict]]:
    return [
        (path.name, json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(FIXTURES_DIR.glob("*.json"))
    ]


def _diff(expected: dict, actual: dict) -> list[str]:
    mismatches = []
    for key, expected_value in expected.items():
        actual_value = actual.get(key)
        if actual_value != expected_value:
            mismatches.append(f"{key}: expected {expected_value!r}, got {actual_value!r}")
    return mismatches


@pytest.mark.skipif(
    not get_settings().openai_api_key,
    reason="OPENAI_API_KEY not configured — golden set needs a live GPT call",
)
def test_golden_briefs_diff_report():
    fixtures = _load_fixtures()
    assert fixtures, "no fixtures found in fixtures/anonymized/"

    report_lines = []
    total_fields = 0
    total_mismatches = 0

    for name, fixture in fixtures:
        parsed = parse_enquiry(fixture["raw_content"])
        actual = parsed.model_dump(mode="json")
        expected = fixture["expected"]
        mismatches = _diff(expected, actual)

        total_fields += len(expected)
        total_mismatches += len(mismatches)
        report_lines.append(f"{name}: {len(expected) - len(mismatches)}/{len(expected)} fields match")
        for m in mismatches:
            report_lines.append(f"  - {m}")

    report = "\n".join(report_lines)
    match_ratio = (total_fields - total_mismatches) / total_fields if total_fields else 0

    print(f"\n--- Golden brief parser diff report ---\n{report}\n")
    assert match_ratio >= MIN_FIELD_MATCH_RATIO, (
        f"Parser field match ratio {match_ratio:.0%} below {MIN_FIELD_MATCH_RATIO:.0%}:\n{report}"
    )
