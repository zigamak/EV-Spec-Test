"""Unit tests for the enquiry stage machine (task H1, revamped 18 Jul —
5-stage pipeline) and the status rollup (task H3). Pure functions, no DB
involved."""

import pytest

from app.services.stage_machine import (
    ALLOWED_TRANSITIONS,
    STAGE_TO_STATUS,
    InvalidTransition,
    stage_to_status,
    validate_transition,
)


def test_valid_forward_transition():
    validate_transition("enquiry", "briefed")  # does not raise


def test_valid_chain_through_pipeline():
    validate_transition("briefed", "proposed")
    validate_transition("proposed", "held")
    validate_transition("held", "signed")


def test_proposed_can_skip_the_hold_and_go_straight_to_signed():
    validate_transition("proposed", "signed")


def test_held_can_lapse_back_to_proposed():
    # a soft hold that isn't converted in time drops back to "proposed",
    # not lost — see stage_machine.py's module docstring / Calendar module.
    validate_transition("held", "proposed")


def test_invalid_skip_ahead_is_rejected():
    with pytest.raises(InvalidTransition):
        validate_transition("enquiry", "signed")


def test_lost_is_reachable_from_any_non_terminal_stage():
    for stage in ("enquiry", "briefed", "proposed", "held"):
        validate_transition(stage, "lost")


def test_signed_is_terminal():
    with pytest.raises(InvalidTransition):
        validate_transition("signed", "enquiry")
    with pytest.raises(InvalidTransition):
        validate_transition("signed", "lost")


def test_lost_is_terminal():
    with pytest.raises(InvalidTransition):
        validate_transition("lost", "enquiry")


# --- status rollup (H3) -----------------------------------------------


def test_status_rollup_covers_every_stage():
    # every stage in ALLOWED_TRANSITIONS must map to exactly one status —
    # a stage silently missing from the rollup would KeyError at request
    # time via the Enquiry.status computed field, not at import time.
    assert set(STAGE_TO_STATUS) == set(ALLOWED_TRANSITIONS)


def test_open_covers_enquiry_and_briefed():
    assert stage_to_status("enquiry") == "open"
    assert stage_to_status("briefed") == "open"


def test_awaiting_covers_proposed_and_held():
    assert stage_to_status("proposed") == "awaiting"
    assert stage_to_status("held") == "awaiting"


def test_won_is_signed_only():
    assert stage_to_status("signed") == "won"
    assert all(stage_to_status(s) != "won" for s in STAGE_TO_STATUS if s != "signed")


def test_lost_status_matches_lost_stage():
    assert stage_to_status("lost") == "lost"
