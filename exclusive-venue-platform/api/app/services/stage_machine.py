"""Enquiry stage machine (task H1). Deterministic transition graph — a
stage change is only ever valid if it's in ALLOWED_TRANSITIONS, regardless
of what the enquiries.stage CHECK constraint alone would permit. Per
tasks.md: follow_up and visit are status labels only in this build, no
scheduling/reminder logic attached — that's deferred Phase 2 (erd.md §9).
"""

from typing import Literal

EnquiryStage = Literal[
    "new", "qualified", "proposal_sent", "follow_up", "visit", "negotiation", "confirmed", "lost"
]

# "lost" is reachable from every non-terminal stage — an enquiry can fall
# through at any point — so it's added once below rather than repeated
# in every entry.
ALLOWED_TRANSITIONS: dict[EnquiryStage, set[EnquiryStage]] = {
    "new": {"qualified"},
    "qualified": {"proposal_sent"},
    "proposal_sent": {"follow_up", "negotiation"},
    "follow_up": {"visit", "negotiation", "proposal_sent"},
    "visit": {"negotiation"},
    "negotiation": {"confirmed", "follow_up"},
    "confirmed": set(),
    "lost": set(),
}
TERMINAL_STAGES: set[EnquiryStage] = {"confirmed", "lost"}

for _stage, _targets in ALLOWED_TRANSITIONS.items():
    if _stage not in TERMINAL_STAGES:
        _targets.add("lost")


class InvalidTransition(ValueError):
    def __init__(self, current: str, target: str):
        self.current = current
        self.target = target
        super().__init__(f"Cannot move enquiry from '{current}' to '{target}'")


def validate_transition(current: EnquiryStage, target: EnquiryStage) -> None:
    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise InvalidTransition(current, target)
