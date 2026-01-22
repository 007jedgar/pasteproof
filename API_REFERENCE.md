# PasteProof API Reference

Base URL: `https://api.pasteproof.com` (override with `VITE_SELF_HOSTED_API_URL`)

## Authentication

All endpoints require one of:
- `Authorization: Bearer <user_jwt>`
- `X-API-Key: <api_key>`

## Endpoints

### Whitelist

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/whitelist` | Get user's whitelisted domains |
| POST | `/v1/whitelist` | Add domain (body: `{domain}`) |
| DELETE | `/v1/whitelist/:id` | Remove domain |
| POST | `/v1/whitelist/check` | Check if domain whitelisted (body: `{domain}`) |

**POST /v1/whitelist response:**
```json
{"success": true, "whitelist": {"id": "<uuid>", "domain": "example.com", "created_at": "<iso>"}}
```

**POST /v1/whitelist/check response:**
```json
{"whitelisted": true}
```

**Errors:** 400 (invalid domain), 409 (exists), 429 (rate limit: 100/min)

---

### Custom Patterns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/patterns` | Fetch user's active patterns |
| POST | `/v1/patterns` | Create pattern |
| PUT | `/v1/patterns/:id` | Update pattern |
| DELETE | `/v1/patterns/:id` | Delete pattern |

**POST /v1/patterns request:**
```json
{"name": "string", "pattern": "regex", "pattern_type": "CREDIT_CARD", "description": "optional"}
```

**Tier limits:** free=3, premium=25, enterprise=9999

---

### Detection Logging

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/detections` | Log single detection |
| POST | `/v1/detections/batch` | Log multiple detections |
| POST | `/v1/log` | Legacy: log event |

**POST /v1/detections request:**
```json
{"type": "EMAIL", "domain": "example.com", "action": "detected|blocked|anonymized", "metadata": {}}
```

**POST /v1/detections/batch request:**
```json
{"detections": [{"type": "EMAIL", "domain": "example.com", "action": "detected", "metadata": {}}]}
```

---

### Teams

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/teams` | Get user's teams |
| GET | `/v1/teams/:teamId/policies` | Get team policies |

**GET /v1/teams/:teamId/policies response:**
```json
{
  "policies": [{
    "id": "<uuid>",
    "team_id": "<uuid>",
    "name": "Policy Name",
    "policy_data": {"patterns": [{"name": "...", "pattern": "...", "pattern_type": "..."}]},
    "enabled": true
  }]
}
```

---

### Analytics & Logs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/stats?days=7` | Dashboard statistics |
| GET | `/v1/analytics?range=7d\|30d` | Alias for stats |
| GET | `/v1/logs?start=&end=&type=&limit=100` | Audit logs |

**GET /v1/stats response:**
```json
{
  "stats": {
    "total_detections": 1234,
    "total_anonymizations": 500,
    "total_ai_scans": 100,
    "most_common_pii": [{"type": "EMAIL", "count": 500}],
    "riskiest_domains": [{"domain": "example.com", "count": 100}],
    "detections_by_day": [{"date": "2026-01-01", "count": 50}]
  }
}
```

---

### User

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/v1/user` | Get user info |

**Response:**
```json
{"id": "<uuid>", "email": "user@example.com", "subscription_tier": "premium", "subscription_status": "active"}
```

---

### AI Analysis (Premium)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/analyze-context` | AI-powered PII detection |

**Request:**
```json
{"text": "content to analyze", "context": "domain.com", "fieldType": "name|email|address|phone|freeform|unknown"}
```

**Response:**
```json
{
  "success": true,
  "analysis": {
    "hasPII": true,
    "confidence": 95,
    "detections": [{"type": "EMAIL", "value": "redacted", "confidence": 95, "reason": "..."}],
    "risk_level": "low|medium|high|critical"
  },
  "metadata": {"text_length": 58, "model": "llama-3.1-8b-instant", "provider": "groq"}
}
```

**Rate limits:** free=10/day, premium=100/day, enterprise=1000/day

**Errors:** 403 (premium required), 429 (rate limit), 400 (text required, max 5000 chars)

---

## Common Errors

| Code | Error |
|------|-------|
| 400 | Missing/invalid fields |
| 401 | Authentication required |
| 403 | Premium subscription required |
| 404 | Not found |
| 429 | Rate limit exceeded |
| 500 | Server error |
