#!/bin/sh
# RealTube Database Export Script
# Produces a privacy-safe SQL dump excluding sensitive data:
#   - ip_hashes table (excluded entirely)
#   - vip_actions table (excluded entirely)
#   - users: is_shadowbanned, ban_reason columns zeroed
#   - votes: ip_hash column zeroed
#
# Usage: db-export.sh [output_dir]
# Output: realtube-YYYYMMDD.sql.gz in the output directory

set -e

EXPORT_DIR="${1:-/exports}"
DATE=$(date +%Y%m%d)
OUTFILE="$EXPORT_DIR/realtube-${DATE}.sql.gz"
TMPFILE="$EXPORT_DIR/.realtube-export-tmp.sql"

echo "[export] Starting RealTube database export..."
echo "[export] Output: $OUTFILE"

# Dump schema for all tables (no data)
pg_dump --schema-only --no-owner --no-privileges realtube > "$TMPFILE"

# Append data for safe tables (no sensitive columns)
for table in videos video_categories channels sync_cache full_cache_blob; do
  pg_dump --data-only --no-owner --no-privileges --table="$table" realtube >> "$TMPFILE"
done

# Users table: exclude is_shadowbanned, ban_reason
echo "-- users (privacy-filtered)" >> "$TMPFILE"
psql -Atc "
  COPY (
    SELECT user_id, trust_score, accuracy_rate, total_votes, accurate_votes,
           first_seen, last_active, is_vip, false AS is_shadowbanned,
           NULL AS ban_reason, username
    FROM users
  ) TO STDOUT WITH (FORMAT text)
" realtube | sed 's/^//' >> "$TMPFILE.users"
echo "COPY users (user_id, trust_score, accuracy_rate, total_votes, accurate_votes, first_seen, last_active, is_vip, is_shadowbanned, ban_reason, username) FROM stdin;" >> "$TMPFILE"
cat "$TMPFILE.users" >> "$TMPFILE"
echo "\\." >> "$TMPFILE"
rm -f "$TMPFILE.users"

# Votes table: exclude ip_hash
echo "-- votes (privacy-filtered)" >> "$TMPFILE"
psql -Atc "
  COPY (
    SELECT id, video_id, user_id, category, trust_weight, created_at,
           NULL AS ip_hash, user_agent
    FROM votes
  ) TO STDOUT WITH (FORMAT text)
" realtube | sed 's/^//' >> "$TMPFILE.votes"
echo "COPY votes (id, video_id, user_id, category, trust_weight, created_at, ip_hash, user_agent) FROM stdin;" >> "$TMPFILE"
cat "$TMPFILE.votes" >> "$TMPFILE"
echo "\\." >> "$TMPFILE"
rm -f "$TMPFILE.votes"

# Compress
gzip -c "$TMPFILE" > "$OUTFILE"
rm -f "$TMPFILE"

# Clean up old exports (keep last 7 days)
find "$EXPORT_DIR" -name "realtube-*.sql.gz" -mtime +7 -delete 2>/dev/null || true

SIZE=$(du -h "$OUTFILE" | cut -f1)
echo "[export] Export complete: $OUTFILE ($SIZE)"
