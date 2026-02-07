"""Video score recalculation: per-category weighted scores + overall max."""

from dataclasses import dataclass

import asyncpg


@dataclass
class CategoryScore:
    category: str
    weight_sum: float
    weighted_score: float


async def recalculate_video_score(pool: asyncpg.Pool, video_id: str) -> None:
    """Recalculate per-category weighted scores and overall video score.

    Algorithm:
        For each category C:
            C_score = sum(trust_weight for votes in C) / sum(trust_weight for ALL votes) * 100
        video.score = max(C_score for all categories)
    """
    async with pool.acquire() as conn:
        async with conn.transaction():
            total_weight = await conn.fetchval(
                "SELECT COALESCE(SUM(trust_weight), 0) FROM votes WHERE video_id = $1",
                video_id,
            )

            if total_weight == 0:
                await conn.execute(
                    "UPDATE videos SET score = 0, last_updated = NOW() WHERE video_id = $1",
                    video_id,
                )
                await conn.execute(
                    "UPDATE video_categories SET weighted_score = 0 WHERE video_id = $1",
                    video_id,
                )
                return

            rows = await conn.fetch(
                """SELECT category, COALESCE(SUM(trust_weight), 0) AS weight_sum
                   FROM votes WHERE video_id = $1 GROUP BY category""",
                video_id,
            )

            max_score = 0.0
            for row in rows:
                weighted_score = (row["weight_sum"] / total_weight) * 100
                if weighted_score > max_score:
                    max_score = weighted_score

                await conn.execute(
                    """UPDATE video_categories SET weighted_score = $1
                       WHERE video_id = $2 AND category = $3""",
                    weighted_score,
                    video_id,
                    row["category"],
                )

            await conn.execute(
                "UPDATE videos SET score = $1, last_updated = NOW() WHERE video_id = $2",
                max_score,
                video_id,
            )


def compute_scores_from_votes(
    votes: list[tuple[str, float]],
) -> tuple[dict[str, float] | None, float]:
    """Pure-logic helper that mirrors the DB-based algorithm for unit testing.

    Args:
        votes: list of (category, trust_weight) tuples

    Returns:
        (category_scores dict, max_score) or (None, 0) if no valid votes
    """
    if not votes:
        return None, 0.0

    total_weight = sum(w for _, w in votes)
    if total_weight == 0:
        return None, 0.0

    category_weights: dict[str, float] = {}
    for cat, w in votes:
        category_weights[cat] = category_weights.get(cat, 0.0) + w

    scores: dict[str, float] = {}
    max_score = 0.0
    for cat, w in category_weights.items():
        score = (w / total_weight) * 100
        scores[cat] = score
        if score > max_score:
            max_score = score

    return scores, max_score
