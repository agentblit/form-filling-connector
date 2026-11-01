# Form Filling Connector

Standalone [AgentBlit custom HTTP connector](https://docs.agentblit.com/docs/connectors/custom/http) for defining forms and streaming field updates to websites as an agent fills them.

## HTTP contract

| Endpoint | Method | Auth |
|----------|--------|------|
| `/api/1.0/tools/list` | GET | `X-API-Key` |
| `/api/1.0/tools/call` | POST | `X-API-Key` |
| `/api/1.0/forms/{formId}/data` | GET (SSE) | `X-API-Key` |
| `/api/1.0/resources/read` | GET | `X-API-Key` |
| `/api/health` | GET | None |

In the dashboard (`/`): create **forms** (UI builder or JSON), manage **API keys**, and inspect per-session submissions.

### Tools

| Tool | Purpose |
|------|---------|
| `getForms` | List all forms with field keys and types |
| `saveFormData` | Save/update one or more field values for a `session_id` (merged into that session's row) |

### SSE — `getFormData`

```
GET /api/1.0/forms/{formId}/data
GET /api/1.0/forms/{formId}/data?session_id={sessionId}
Header: X-API-Key: ffc_...
```

- Omit `session_id` — stream the **latest session** (most recently updated)
- Pass `session_id` — stream that session only (empty `data` until the first `saveFormData`)

Events:

- `form_data` — initial snapshot, then each update after `saveFormData`
- `ping` — keepalive ~every 25s

Example browser client (`EventSource` cannot set headers — pass the key as `api_key`):

```js
const es = new EventSource(
  `${BASE}/api/1.0/forms/${formId}/data?api_key=${apiKey}&session_id=${sessionId}`,
);
es.addEventListener("form_data", (e) => {
  const payload = JSON.parse(e.data);
  // payload.data = { field_key: value, ... }
  // payload.session_id = requested or latest session
});
```

Prefer `X-API-Key` (or `Authorization: Bearer`) from server-side clients.

### Create form JSON shape

```json
{
  "name": "Contact form",
  "description": "optional",
  "fields": [
    { "key": "full_name", "type": "string" },
    { "key": "age", "type": "number" },
    { "key": "subscribed", "type": "boolean" },
    {
      "key": "address",
      "type": "object",
      "fields": [
        { "key": "street", "type": "string" },
        { "key": "zip", "type": "string" }
      ]
    },
    {
      "key": "line_items",
      "type": "array",
      "fields": [
        { "key": "sku", "type": "string" },
        { "key": "qty", "type": "number" }
      ]
    }
  ]
}
```

Field types: `string`, `number`, `boolean`, `array`, `object`.

- `object` — requires nested `fields` describing the object shape
- `array` — object array; nested `fields` describe each item's shape
- Nested fields can themselves be `object` / `array`

## Local development

```bash
cp .env.example .env
# set DATABASE_URL and BETTER_AUTH_SECRET
pnpm install
pnpm dev
# app: http://localhost:3082
```

Reset the database:

```bash
pnpm db:clean
pnpm dev
```

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection |
| `PUBLIC_BASE_URL` | App base URL (Better Auth) |
| `BETTER_AUTH_SECRET` | Better Auth signing secret |

Staging DB host is typically `db-….agentblit.com`; prod may use the in-cluster hostname.

## Build and push

```bash
docker build --platform linux/amd64 -t registry.agentblit.com/form-filling-connector:latest .
docker push registry.agentblit.com/form-filling-connector:latest
```

## Production deploy

Manifests live in `infra/prod/internal/tools/`.

```bash
# 1. Secrets (once)
cp infra/prod/internal/tools/form-filling-connector-secret.example.yaml \
   infra/prod/internal/tools/form-filling-connector-secret.yaml
# fill BETTER_AUTH_SECRET, POSTGRES_PASSWORD, DATABASE_URL

kubectl apply -f infra/prod/internal/tools/form-filling-connector-secret.yaml
kubectl apply -f infra/prod/internal/tools/form-filling-connector.yaml

# 2. Image
cd form-filling-connector
docker build --platform linux/amd64 -t registry.agentblit.com/form-filling-connector:latest .
docker push registry.agentblit.com/form-filling-connector:latest
kubectl rollout restart deployment/form-filling-connector -n internal
kubectl rollout status deployment/form-filling-connector -n internal
```

Public URL: `https://form-filling-connector.agentblit.com`  
Health: `https://form-filling-connector.agentblit.com/api/health`
