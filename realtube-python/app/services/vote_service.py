import logging

import asyncpg

from app.models.vote import VoteResponse

logger = logging.getLogger(__name__)

VALID_CATEGORIES = frozenset(
    ["fully_ai", "ai_voiceover", "ai_visuals", "ai_thumbnails", "ai_assisted"]
)


async def submit_vote(
    pool: asyncpg.Pool,
    video_id: str,
    user_id: str,
    category: str,
    ip_hash: str,
    user_agent: str | None,
) -> VoteResponse:
    """Submit or update a vote using atomic SQL. Returns the vote response."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Ensure user exists (auto-create with defaults if new)
            await conn.execute(
                """INSERT INTO users (user_id) VALUES ($1)
                   ON CONFLICT (user_id) DO UPDATE SET last_active = NOW()""",
                user_id,
            )

            # Get user's trust score
            trust_weight = await conn.fetchval(
                "SELECT trust_score FROM users WHERE user_id = $1", user_id
            )

            # Ensure video exists (auto-create if first report)
            await conn.execute(
                """INSERT INTO videos (video_id) VALUES ($1)
                   ON CONFLICT (video_id) DO NOTHING""",
                video_id,
            )

            # Check if this is a new vote or an update
            existing_category = await conn.fetchval(
                "SELECT category FROM votes WHERE video_id = $1 AND user_id = $2",
                video_id,
                user_id,
            )
            is_new_vote = existing_category is None

            # Insert or update the vote
            await conn.execute(
                """INSERT INTO votes (video_id, user_id, category, trust_weight, ip_hash, user_agent)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (video_id, user_id) DO UPDATE
                   SET category = EXCLUDED.category, trust_weight = EXCLUDED.trust_weight, created_at = NOW()""",
                video_id,
                user_id,
                category,
                trust_weight,
                ip_hash,
                user_agent,
            )

            if is_new_vote:
                # Increment total votes on the video (only for new votes)
                await conn.execute(
                    """UPDATE videos SET total_votes = total_votes + 1, last_updated = NOW()
                       WHERE video_id = $1""",
                    video_id,
                )
            elif existing_category != category:
                # Decrement old category count if changing vote
                await conn.execute(
                    """UPDATE video_categories SET vote_count = vote_count - 1
                       WHERE video_id = $1 AND category = $2 AND vote_count > 0""",
                    video_id,
                    existing_category,
                )

            # Upsert the per-category counter
            await conn.execute(
                """INSERT INTO video_categories (video_id, category, vote_count)
                   VALUES ($1, $2, 1)
                   ON CONFLICT (video_id, category) DO UPDATE
                   SET vote_count = video_categories.vote_count + 1""",
                video_id,
                category,
            )

            # Update last_updated on video
            await conn.execute(
                "UPDATE videos SET last_updated = NOW() WHERE video_id = $1",
                video_id,
            )

    # Recalculate video score after vote change
    await recalculate_video_score(pool, video_id)

    # Get updated score
    score = await pool.fetchval(
        "SELECT score FROM videos WHERE video_id = $1", video_id
    )

    return VoteResponse(success=True, new_score=score, user_trust=trust_weight)


async def delete_vote(pool: asyncpg.Pool, video_id: str, user_id: str) -> None:
    """Remove a user's vote and adjust counters atomically."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Get the vote's category before deleting
            category = await conn.fetchval(
                "SELECT category FROM votes WHERE video_id = $1 AND user_id = $2",
                video_id,
                user_id,
            )
            if category is None:
                raise LookupError("Vote not found")

            # Delete the vote
            await conn.execute(
                "DELETE FROM votes WHERE video_id = $1 AND user_id = $2",
                video_id,
                user_id,
            )

            # Decrement counters
            await conn.execute(
                """UPDATE videos SET total_votes = total_votes - 1, last_updated = NOW()
                   WHERE video_id = $1 AND total_votes > 0""",
                video_id,
            )

            await conn.execute(
                """UPDATE video_categories SET vote_count = vote_count - 1
                   WHERE video_id = $1 AND category = $2 AND vote_count > 0""",
                video_id,
                category,
            )

    # Recalculate video score after vote removal
    await recalculate_video_score(pool, video_id)


async def recalculate_video_score(pool: asyncpg.Pool, video_id: str) -> None:
    """Recalculate per-category weighted scores and overall video score."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Get total trust weight across all votes
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

            # Get per-category trust weight sums
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

            # Update overall video score (max across categories)
            await conn.execute(
                "UPDATE videos SET score = $1, last_updated = NOW() WHERE video_id = $2",
                max_score,
                video_id,
            )
