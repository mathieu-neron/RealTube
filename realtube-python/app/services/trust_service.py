"""Trust score algorithm: age (30%) + accuracy (50%) + volume (20%)."""

from datetime import datetime, timezone

AGE_WEIGHT = 0.30
ACCURACY_WEIGHT = 0.50
VOLUME_WEIGHT = 0.20

AGE_DAYS_MAX = 60.0
DEFAULT_ACCURACY = 0.5
MIN_VOTES_FOR_ACCURACY = 10
VOLUME_VOTES_MAX = 100.0

BASE_WEIGHT_REGULAR = 1.0
BASE_WEIGHT_VIP = 3.0
BASE_WEIGHT_SHADOWBANNED = 0.0


def age_factor(first_seen: datetime) -> float:
    """0.0 to 1.0 based on account age. Full weight after 60 days."""
    now = datetime.now(timezone.utc)
    if first_seen.tzinfo is None:
        first_seen = first_seen.replace(tzinfo=timezone.utc)
    days = (now - first_seen).total_seconds() / 86400
    return min(days / AGE_DAYS_MAX, 1.0)


def accuracy_factor(accuracy_rate: float, total_votes: int) -> float:
    """Actual rate for 10+ votes, default 0.5 otherwise."""
    if total_votes < MIN_VOTES_FOR_ACCURACY:
        return DEFAULT_ACCURACY
    return accuracy_rate


def volume_factor(total_votes: int) -> float:
    """0.0 to 1.0 based on total votes. Full weight at 100+."""
    return min(total_votes / VOLUME_VOTES_MAX, 1.0)


def compute_trust_score(
    first_seen: datetime,
    accuracy_rate: float,
    total_votes: int,
) -> float:
    """Composite trust score: age*0.3 + accuracy*0.5 + volume*0.2, capped at 1.0."""
    af = age_factor(first_seen)
    accf = accuracy_factor(accuracy_rate, total_votes)
    vf = volume_factor(total_votes)
    return min(af * AGE_WEIGHT + accf * ACCURACY_WEIGHT + vf * VOLUME_WEIGHT, 1.0)


def base_weight(is_vip: bool, is_shadowbanned: bool) -> float:
    """Base vote weight multiplier."""
    if is_shadowbanned:
        return BASE_WEIGHT_SHADOWBANNED
    if is_vip:
        return BASE_WEIGHT_VIP
    return BASE_WEIGHT_REGULAR


def effective_weight(
    first_seen: datetime,
    accuracy_rate: float,
    total_votes: int,
    is_vip: bool,
    is_shadowbanned: bool,
) -> float:
    """Effective vote weight = trust_score * base_weight."""
    return compute_trust_score(first_seen, accuracy_rate, total_votes) * base_weight(
        is_vip, is_shadowbanned
    )
