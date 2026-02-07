# SUB-DOC 9: Public API & Database Export

## 16. Public API & Database Export

### API Documentation

- **OpenAPI/Swagger** spec auto-generated from both backends
- Go: using swaggo/swag annotations
- Python: FastAPI auto-generates OpenAPI spec
- Published at `api.realtube.app/docs`

### Database Export

- Full PostgreSQL dump generated daily by `db-exporter` service
- Available at `api.realtube.app/api/database/export`
- Format: PostgreSQL custom format (.dump) and CSV
- Excludes: IP hashes, shadowban details, VIP tokens

### Third-Party Integration

Documented guidelines for:
- Building alternative clients (mobile apps, media players)
- Running mirror servers
- Academic research usage
- Rate limit policies for bulk consumers
