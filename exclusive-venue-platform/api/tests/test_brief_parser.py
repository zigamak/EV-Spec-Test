"""Unit tests for the deterministic part of the brief parser (task D2):
the confidence -> review_status threshold. No GPT call involved."""

from app.services.brief_parser import AUTO_ACCEPT_THRESHOLD, score_review_status


def test_high_confidence_auto_accepts():
    assert score_review_status(0.95) == "auto_accepted"
    assert score_review_status(AUTO_ACCEPT_THRESHOLD) == "auto_accepted"


def test_low_confidence_needs_review():
    assert score_review_status(0.74) == "needs_review"
    assert score_review_status(0.0) == "needs_review"
