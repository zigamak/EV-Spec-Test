"""Enquiry stage machine (task H1, revamped 18 Jul per task H3 — see
specs/0000-foundation/erd.md §5.1). Deterministic transition graph — a
stage change is only ever valid if it's in ALLOWED_TRANSITIONS, regardless
of what the enquiries.stage CHECK constraint alone would permit.

Pipeline: Enquiry -> Briefed -> Proposed -> Held -> Signed, matching the
full workflow context supplied 18 Jul (Inquiries -> Proposal -> Pipeline
-> Client). `held` -> `proposed` is a real transition, not a typo: a soft
venue hold can lapse if the client doesn't convert in time (see the
Calendar/Booking module description), dropping the deal back to
"proposed" rather than losing it outright. `lost` is reachable from any
non-terminal stage — an enquiry can fall through at any point, matching
the "decline politely" triage action from the reference workflow,
generalized beyond just the initial triage step.
"""

from typing import Literal

EnquiryStage = Literal["enquiry", "briefed", "proposed", "held", "signed", "lost"]

ALLOWED_TRANSITIONS: dict[EnquiryStage, set[EnquiryStage]] = {
    "enquiry": {"briefed"},
    "briefed": {"proposed"},
    "proposed": {"held", "signed"},
    "held": {"signed", "proposed"},  # proposed: a lapsed hold, not forward progress
    "signed": set(),
    "lost": set(),
}
TERMINAL_STAGES: set[EnquiryStage] = {"signed", "lost"}

# "lost" is reachable from every non-terminal stage — added once here
# rather than repeated in every entry above.
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


# Status rollup (H3, added 18 Jul, revised same day — see
# specs/0000-foundation/erd.md §5.1). Reconciles the 5-stage Kanban above
# with the salesperson-facing Open/Awaiting/Won/Lost view described in
# the fuller workflow context. Computed only — never stored, never
# replaces `stage`. Every enquiry stays queryable/transitionable by its
# real stage; `status` is just a coarser lens on top for boards/reporting.
EnquiryStatus = Literal["open", "awaiting", "won", "lost"]

STAGE_TO_STATUS: dict[EnquiryStage, EnquiryStatus] = {
    "enquiry": "open",
    "briefed": "open",
    "proposed": "awaiting",
    "held": "awaiting",
    "signed": "won",
    "lost": "lost",
}


def stage_to_status(stage: EnquiryStage) -> EnquiryStatus:
    return STAGE_TO_STATUS[stage]
