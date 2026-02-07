"""Tests for trust_service — mirrors Go trust_svc_test.go test cases."""

import math
from datetime import datetime, timedelta, timezone

import pytest

from app.services.trust_service import (
    BASE_WEIGHT_REGULAR,
    BASE_WEIGHT_SHADOWBANNED,
    BASE_WEIGHT_VIP,
    accuracy_factor,
    age_factor,
    base_weight,
    compute_trust_score,
    effective_weight,
    volume_factor,
)
from app.services.score_service import compute_scores_from_votes


def _days_ago(n: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=n)


# ---------- age_factor ----------


class TestAgeFactor:
    def test_brand_new_account(self):
        result = age_factor(datetime.now(timezone.utc))
        assert 0.0 <= result <= 0.02

    def test_1_day_old(self):
        result = age_factor(_days_ago(1))
        assert 0.01 <= result <= 0.03

    def test_30_days_old(self):
        result = age_factor(_days_ago(30))
        assert 0.49 <= result <= 0.51

    def test_60_days_old(self):
        result = age_factor(_days_ago(60))
        assert 0.99 <= result <= 1.0

    def test_120_days_capped(self):
        result = age_factor(_days_ago(120))
        assert result == 1.0


# ---------- accuracy_factor ----------


class TestAccuracyFactor:
    def test_fewer_than_10_uses_default(self):
        assert accuracy_factor(0.9, 5) == 0.5

    def test_exactly_10_uses_actual(self):
        assert accuracy_factor(0.8, 10) == 0.8

    def test_many_votes_high_accuracy(self):
        assert accuracy_factor(0.95, 200) == 0.95

    def test_many_votes_low_accuracy(self):
        assert accuracy_factor(0.2, 50) == 0.2

    def test_zero_votes_uses_default(self):
        assert accuracy_factor(0.0, 0) == 0.5


# ---------- volume_factor ----------


class TestVolumeFactor:
    def test_zero_votes(self):
        assert volume_factor(0) == 0.0

    def test_50_votes(self):
        assert volume_factor(50) == 0.5

    def test_100_votes(self):
        assert volume_factor(100) == 1.0

    def test_200_votes_capped(self):
        assert volume_factor(200) == 1.0


# ---------- compute_trust_score ----------


class TestComputeTrustScore:
    def test_brand_new_user_low_trust(self):
        # age=0, accuracy=0.5 (default <10 votes), volume=0
        # 0*0.3 + 0.5*0.5 + 0*0.2 = 0.25
        score = compute_trust_score(datetime.now(timezone.utc), 0.0, 0)
        assert 0.24 <= score <= 0.26

    def test_veteran_accurate_user_high_trust(self):
        # age=1.0, accuracy=0.95, volume=1.0
        # 1.0*0.3 + 0.95*0.5 + 1.0*0.2 = 0.975
        score = compute_trust_score(_days_ago(120), 0.95, 200)
        assert 0.97 <= score <= 0.98

    def test_mid_tier_user(self):
        # age=0.5, accuracy=0.7, volume=0.5
        # 0.5*0.3 + 0.7*0.5 + 0.5*0.2 = 0.60
        score = compute_trust_score(_days_ago(30), 0.7, 50)
        assert 0.59 <= score <= 0.61


# ---------- base_weight ----------


class TestBaseWeight:
    def test_regular(self):
        assert base_weight(False, False) == BASE_WEIGHT_REGULAR

    def test_vip(self):
        assert base_weight(True, False) == BASE_WEIGHT_VIP

    def test_shadowbanned(self):
        assert base_weight(False, True) == BASE_WEIGHT_SHADOWBANNED

    def test_vip_plus_shadowbanned_shadowban_wins(self):
        assert base_weight(True, True) == BASE_WEIGHT_SHADOWBANNED


# ---------- effective_weight ----------


class TestEffectiveWeight:
    def _veteran_trust(self) -> float:
        return compute_trust_score(_days_ago(120), 0.95, 200)

    def test_regular_user(self):
        trust = self._veteran_trust()
        result = effective_weight(_days_ago(120), 0.95, 200, False, False)
        assert math.isclose(result, trust * BASE_WEIGHT_REGULAR, abs_tol=0.001)

    def test_vip_3x_multiplier(self):
        trust = self._veteran_trust()
        result = effective_weight(_days_ago(120), 0.95, 200, True, False)
        assert math.isclose(result, trust * BASE_WEIGHT_VIP, abs_tol=0.001)

    def test_shadowbanned_zero_weight(self):
        result = effective_weight(_days_ago(120), 0.95, 200, False, True)
        assert result == 0.0


# ---------- compute_scores_from_votes (score_service pure logic) ----------


class TestScoreCalculation:
    def test_single_category(self):
        votes = [("fully_ai", 0.8), ("fully_ai", 0.6), ("fully_ai", 1.0)]
        scores, max_score = compute_scores_from_votes(votes)
        assert scores["fully_ai"] == 100.0
        assert max_score == 100.0

    def test_multiple_categories(self):
        votes = [
            ("fully_ai", 1.0),
            ("fully_ai", 1.0),
            ("ai_voiceover", 0.5),
            ("ai_visuals", 0.5),
        ]
        scores, max_score = compute_scores_from_votes(votes)
        assert math.isclose(scores["fully_ai"], 66.67, abs_tol=0.01)
        assert math.isclose(scores["ai_voiceover"], 16.67, abs_tol=0.01)
        assert math.isclose(scores["ai_visuals"], 16.67, abs_tol=0.01)
        assert math.isclose(max_score, 66.67, abs_tol=0.01)

    def test_no_votes(self):
        scores, max_score = compute_scores_from_votes([])
        assert scores is None
        assert max_score == 0.0

    def test_zero_weight_votes(self):
        votes = [("fully_ai", 0.0), ("fully_ai", 0.0)]
        scores, max_score = compute_scores_from_votes(votes)
        assert scores is None
        assert max_score == 0.0

    def test_trust_weight_affects_score(self):
        votes = [
            ("fully_ai", 3.0),
            ("ai_voiceover", 0.1),
            ("ai_voiceover", 0.1),
            ("ai_voiceover", 0.1),
        ]
        scores, max_score = compute_scores_from_votes(votes)
        assert math.isclose(scores["fully_ai"], 90.91, abs_tol=0.01)
        assert math.isclose(scores["ai_voiceover"], 9.09, abs_tol=0.01)
        assert math.isclose(max_score, 90.91, abs_tol=0.01)

    def test_even_split(self):
        votes = [
            ("fully_ai", 1.0),
            ("ai_voiceover", 1.0),
            ("ai_visuals", 1.0),
            ("ai_thumbnails", 1.0),
            ("ai_assisted", 1.0),
        ]
        scores, max_score = compute_scores_from_votes(votes)
        for cat in ["fully_ai", "ai_voiceover", "ai_visuals", "ai_thumbnails", "ai_assisted"]:
            assert scores[cat] == 20.0
        assert max_score == 20.0

    def test_overall_score_is_max(self):
        votes = [("fully_ai", 2.0), ("ai_voiceover", 1.0)]
        _, max_score = compute_scores_from_votes(votes)
        assert math.isclose(max_score, 66.67, abs_tol=0.01)

    def test_mixed_weights(self):
        votes = [
            ("fully_ai", 0.975),
            ("fully_ai", 0.25),
            ("ai_voiceover", 0.6),
        ]
        scores, max_score = compute_scores_from_votes(votes)
        total = 0.975 + 0.25 + 0.6
        expected_ai = (0.975 + 0.25) / total * 100
        expected_vo = 0.6 / total * 100
        assert math.isclose(scores["fully_ai"], expected_ai, abs_tol=0.01)
        assert math.isclose(scores["ai_voiceover"], expected_vo, abs_tol=0.01)
        assert math.isclose(max_score, max(expected_ai, expected_vo), abs_tol=0.01)
