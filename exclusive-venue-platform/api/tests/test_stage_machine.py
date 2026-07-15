"""Unit tests for the enquiry stage machine (task H1). Pure function,
no DB involved."""

import pytest

from app.services.stage_machine import InvalidTransition, validate_transition


def test_valid_forward_transition():
    validate_transition("new", "qualified")  # does not raise


def test_valid_chain_through_pipeline():
    validate_transition("qualified", "proposal_sent")
    validate_transition("proposal_sent", "negotiation")
    validate_transition("negotiation", "confirmed")


def test_follow_up_can_go_to_visit_or_back_to_proposal_sent():
    validate_transition("follow_up", "visit")
    validate_transition("follow_up", "proposal_sent")


def test_invalid_skip_ahead_is_rejected():
    with pytest.raises(InvalidTransition):
        validate_transition("new", "confirmed")


def test_lost_is_reachable_from_any_non_terminal_stage():
    for stage in ("new", "qualified", "proposal_sent", "follow_up", "visit", "negotiation"):
        validate_transition(stage, "lost")


def test_confirmed_is_terminal():
    with pytest.raises(InvalidTransition):
        validate_transition("confirmed", "new")
    with pytest.raises(InvalidTransition):
        validate_transition("confirmed", "lost")


def test_lost_is_terminal():
    with pytest.raises(InvalidTransition):
        validate_transition("lost", "new")
