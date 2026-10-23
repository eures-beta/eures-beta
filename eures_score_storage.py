"""Explicit storage contract for EURES Matchings.score (Grist Text)."""

import re

_CANONICAL_SCORE = re.compile(r"(?:0|[1-9][0-9]*)\Z")


def serialize_matching_score(score: int) -> str:
    """Store the current integer score on 0..100 as canonical ASCII text."""
    if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 100:
        raise ValueError("EURES matching score must be an integer from 0 to 100")
    return str(score)


def parse_matching_score(value: str) -> int:
    """Read existing canonical Grist Text scores without implicit coercion."""
    if not isinstance(value, str) or not _CANONICAL_SCORE.fullmatch(value):
        raise ValueError("EURES matching score is not canonical integer text")
    score = int(value)
    if score > 100:
        raise ValueError("EURES matching score is outside 0..100")
    return score
