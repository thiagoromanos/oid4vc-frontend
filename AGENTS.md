# AGENTS.md — oid4vc-frontend

AI-generated React + Express + MongoDB UI for ACA-Py OID4VC plugin (OID4VCI SD-JWT issuance + OID4VP presentation). Manages ACA-Py endpoint/auth, multitenancy subwallets, DIDs, supported credentials (`vc+sd-jwt` with en-US/pt-BR labels + selective disclosure), issuance exchanges + credential-offer QR codes, presentation definitions and requests.

- **Repo:** https://github.com/thiagoromanos/oid4vc-frontend  
- **Disclaimer (README):** entire project made by an AI.

---

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18.3, Vite 5.4, axios 1.7, lucide-react 0.460, qrcode.react 4.1 |
| Backend  | Express 4.21 (CommonJS `"type":"commonjs"`), mongoose 8.9, axios, cors, dotenv |
| DB       | MongoDB 7, database name `oid4vci` |
| Target   | ACA-Py admin API + oid4vc plugin |
| Runtime  | Node 20 (Alpine in Docker) |

No TypeScript. No tests. No auth on this app’s own `/api` routes. Frontend talks only to own backend via relative `/api` (Vite proxy in dev).

---

## Directory Layout

```
/
├── backend/
│   ├── server.js                 # ALL routes + production static serve of frontend/dist
│   ├── models/
│   │   ├── Config.js
│   │   ├── SupportedCredential.js
│   │   ├── ExchangeRecord.js
│   │   ├── DidRecord.js
│   │   ├── PresentationDef.js
│   │   └── PresentationRecord.js
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # tab state machine + shared fetches
│   │   ├── main.jsx
│   │   ├── index.css
│   │   ├── index-light.css
│   │   └── components/
│   │       ├── ConfigTab.jsx
│   │       ├── CreateCredTab.jsx
│   │       ├── StoredCredsTab.jsx
│   │       ├── DidManagerTab.jsx
│   │       ├── CreateExchangeTab.jsx
│   │       ├── ExchangeHistoryTab.jsx
│   │       └── ProofPresentationTab.jsx
│   ├── index.html
│   ├── vite.config.js            # port 3000, proxy /api → http://localhost:5000
│   ├── package.json
│   ├── package-lock.json
│   └── dist/                     # built assets (copied into image)
├── Dockerfile                    # multi-stage: frontend-builder → backend serves dist
├── docker-compose.yml
├── .env                          # EXTERNAL_FRONTEND_PORT, NETWORK_NAME, NETWORK_EXTERNAL
├── .gitignore
├── README.md
└── acapy-plugins-oid4vc.json     # OpenAPI snapshot of ACA-Py + oid4vc plugin
```

---

## Run

### Docker (recommended)

```bash
docker-compose up --build
```

- App listens on `${EXTERNAL_FRONTEND_PORT:-5000}`
- Mongo service name `mongodb`, volume `mongo_data`, network `frontend-oid4vci-net` (overridable)
- Compose sets: `NODE_ENV=production`, `PORT=5000`, `MONGODB_URI=mongodb://mongodb:27017/oid4vci`, `ACAPY_URL=http://host.docker.internal:8021`
- `extra_hosts: host.docker.internal:host-gateway`
- Default image in compose: `ghcr.io/thiagoromanos/oid4vc-frontend:beta1` (build section commented)

### Local dev

```bash
mongod --dbpath <path>                 # :27017
cd backend && npm i && npm run dev     # node --watch server.js → :5000
cd frontend && npm i && npm run dev    # vite → :3000, proxies /api
```

Production inside container: backend serves `path.join(__dirname, '../frontend/dist')` + catch-all `*`.

**Env vars used by backend:**

- `MONGODB_URI` (default `mongodb://localhost:27017/oid4vci`)
- `PORT` (default `5000`)
- `NODE_ENV`
- `ACAPY_URL` (fallback when creating initial Config)
- `BEARER_TOKEN` (fallback)

**Docker networking tip** (hard-coded in error messages): if app runs in Docker and ACA-Py on host, never use `localhost` for `acapyUrl`; use `http://host.docker.internal:<port>` or host IP.

---

## Config Model (Mongo collection from `Config.js`)

```js
{
  key: String, unique, default "global_config",
  acapyUrl: String, default "http://localhost:8021",
  bearerToken: String, default "",
  adminApiKey: String, default "",
  activeTenant: {
    wallet_id, wallet_name, label, token, created_at
  },
  updatedAt: Date
}
```

**Helpers in `server.js`:**

- `getActiveConfig()` → finds or creates the single `global_config` document
- `getAcapyClient(customConfig?)` → axios instance with `baseURL = acapyUrl` (trailing slashes stripped), `Authorization: Bearer <token>` (strips existing `"Bearer "` prefix), optional `X-API-Key`, timeout 15000
- `formatError(err)` → prefers `err.response.data`, stringifies objects, appends Docker localhost tip on `ECONNREFUSED`

---

## Backend Routes (all under `/api`, defined in `server.js`)

### Config

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/config` | |
| POST | `/api/config` | body: `{ acapyUrl?, bearerToken?, adminApiKey? }` |

### Multitenancy

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/multitenancy/create-tenant` | body: `{ wallet_name?, wallet_key?, label?, wallet_type?, acapyUrl?, adminApiKey? }` |

Defaults: `wallet_name=tenant_<ts>`, `wallet_key=key_<ts>`, `wallet_type=askar`, `key_management_mode=managed`.

1. `POST {acapy}/multitenancy/wallet`
2. `POST {acapy}/multitenancy/wallet/{wallet_id}/token` (body may contain `wallet_key`)
3. Saves token + `activeTenant` into Config → returns `{ success, wallet_id, wallet_name, token, config }`

### DID

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/did/create` | body: `{ method?, key_type?, seed? }` → `POST /wallet/did/create` → upserts `DidRecord` |
| GET | `/api/did/records` | tries live `GET /wallet/did` then upserts all; returns sorted local |
| POST | `/api/did/set-public` | body: `{ did }` → `POST /wallet/did/public?did=...` → sets `posture=public` |

Defaults: `method=key`, `key_type=ed25519`.

### Supported Credential (SD-JWT only in UI)

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/credential-supported/create-sd-jwt` | body = full payload → `POST /oid4vci/credential-supported/create/sd-jwt` → upserts by `supported_cred_id` |
| GET | `/api/credential-supported/records` | local list sorted by `createdAt` desc |
| GET | `/api/credential-supported/records/:supported_cred_id` | prefers live ACA-Py, merges into local, falls back to Mongo |

### Exchange / Offer

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/exchange/create` | body: `{ supported_cred_id, credential_subject, pin?, did?, verification_method? }` → create exchange + fetch offer → stores `ExchangeRecord` |
| GET | `/api/credential-offer?exchange_id=` | proxy to ACA-Py |
| GET | `/api/exchange/records` | local history |

### OID4VP

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/presentation-definition/create` | body: `{ pres_def, name?, purpose? }` → `POST /oid4vp/presentation-definition` → upserts |
| GET | `/api/presentation-definition/records` | live sync + local sorted |
| POST | `/api/presentation-request/create` | body: `{ pres_def_id?, pres_def?, dcql_query_id?, vp_formats? }` |
| GET | `/api/presentation/records` | **must be registered before** `:id` route; live sync |
| GET | `/api/presentation/records/:presentation_id` | live preferred, merge status/verified/claims |
| DELETE | `/api/presentation/records/:presentation_id` | tries ACA-Py DELETE then deletes local |

Default `vp_formats`:

```json
{
  "vc+sd-jwt": {
    "sd-jwt_alg_values": ["ES256K", "EdDSA", "ES256"]
  }
}
```

If only `pres_def` supplied → creates definition first.

### Production static

```js
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(frontendBuildPath));
  app.get('*', ...);
}
```

---

## Mongo Models (exact fields)

### SupportedCredential

- `supported_cred_id` (String, required, unique)
- `identifier`, `vct` (required), `format` (default `"vc+sd-jwt"`)
- `sd_list` [String]
- `cryptographic_binding_methods_supported` [String]
- `credential_signing_alg_values_supported` [String]
- `credential_metadata` Object
- `raw_record` Object
- `createdAt`, `updatedAt`

### ExchangeRecord

- `exchange_id`, `supported_cred_id`, `credential_subject` Object
- `credential_offer` (string for QR), `offer_data`, `raw_record`
- `createdAt`

### DidRecord

- `did`, `method`, `key_type`, `verkey`, `posture`, `metadata`, `raw_record`
- `createdAt`

### PresentationDef

- `pres_def_id`, `name`, `purpose`, `pres_def` Object, `raw_record`
- `createdAt`

### PresentationRecord

- `presentation_id`, `request_id`, `pres_def_id`, `request_uri`
- `status`, `verified` Boolean, `verified_claims`, `matched_credentials`, `errors` []
- `raw_record`, `updatedAt`, `createdAt`

### Config

See Config section above.

---

## Frontend Structure

### `App.jsx`

State: `activeTab`, `config`, `storedCreds`, `didRecords`, `selectedCredIdForExchange`, `selectedDidForExchange`.

On mount: `fetchConfig`, `fetchStoredCreds`, `fetchDidRecords`.

| Tab key | Component | Notes |
|---------|-----------|-------|
| `config` | `ConfigTab` | |
| `create-cred` | `CreateCredTab` | `onCredCreated` → refresh + select |
| `stored-creds` | `StoredCredsTab` | `onSelectForExchange` switches tab |
| `dids` | `DidManagerTab` | `onSelectDidForExchange` |
| `exchange` | `CreateExchangeTab` | receives selected IDs + lists |
| `presentation` | `ProofPresentationTab` | |
| `history` | `ExchangeHistoryTab` | |

Header shows current `acapyUrl` + “Auth Configured” / “No Token”.

All API calls use axios relative paths (`/api/...`). No absolute backend URL in frontend code.

### Components (one file each)

- **ConfigTab.jsx** — form for `acapyUrl` / bearer / adminApiKey + create-tenant form
- **CreateCredTab.jsx** — attribute list builder (key, en-US label, pt-BR label, SD toggle), vct, id, crypto options → POST create-sd-jwt
- **StoredCredsTab.jsx** — table of stored, inspect live, button “use for exchange”
- **DidManagerTab.jsx** — create DID form, list, set-public, select for exchange
- **CreateExchangeTab.jsx** — pick `supported_cred_id`, dynamic inputs from its attributes (shows both language labels), optional DID/pin → create exchange → render `QRCodeSVG` of `credential_offer`
- **ExchangeHistoryTab.jsx** — list past exchanges, re-display QR
- **ProofPresentationTab.jsx** — create presentation definition + create request + list/status of presentations

Styling: plain CSS classes (`app-container`, `app-header`, `nav-tabs`, `tab-btn`, `status-badge`, …). Icons from `lucide-react`.

---

## ACA-Py Endpoints Actually Called

**Multitenancy**

- `POST /multitenancy/wallet`
- `POST /multitenancy/wallet/{wallet_id}/token`

**DID**

- `POST /wallet/did/create`
- `GET /wallet/did`
- `POST /wallet/did/public`

**OID4VCI**

- `POST /oid4vci/credential-supported/create/sd-jwt`
- `GET /oid4vci/credential-supported/records/{supported_cred_id}`
- `POST /oid4vci/exchange/create`
- `GET /oid4vci/credential-offer?exchange_id=`

**OID4VP**

- `POST /oid4vp/presentation-definition`
- `GET /oid4vp/presentation-definitions`
- `POST /oid4vp/request`
- `GET /oid4vp/presentations`
- `GET /oid4vp/presentation/{presentation_id}`
- `DELETE /oid4vp/presentation/{presentation_id}`

Full OpenAPI reference file present: `acapy-plugins-oid4vc.json` (also contains many other plugin routes not used by this frontend).

---

## Conventions for Agents / Future Changes

- Backend is CommonJS (`require`/`module.exports`). Frontend is ESM (`import`/`export`, `"type":"module"`).
- Never invent parallel route styles; keep all ACA-Py traffic inside the helpers or the same pattern (`getAcapyClient` → `client.post/get`).
- After every successful write to ACA-Py that creates an entity, upsert the corresponding Mongo model using the id field returned by ACA-Py.
- Live ACA-Py reads are best-effort; on failure log warning and serve Mongo cache. Never let a live failure 500 the list endpoints if cache exists.
- Credential attribute UI always carries both en-US and pt-BR display labels; `sd_list` is built from the SD toggles.
- QR code is rendered from the plain `credential_offer` string returned by `GET /oid4vci/credential-offer`.
- Prefer editing the existing seven component files and the single `server.js`. Do not split `server.js` into routers unless the change is large.
- Do not add authentication, TypeScript, or new major libraries without explicit need.
- When adding a new ACA-Py feature:
  1. Add/extend Mongo model if persistence needed
  2. Add `/api` route that proxies + persists
  3. Add or extend a tab component
  4. Wire state in `App.jsx` if shared
- Docker: keep `host.docker.internal` pattern and the `ECONNREFUSED` tip message.
- **package.json scripts**
  - backend: `"start": "node server.js"`, `"dev": "node --watch server.js"`
  - frontend: `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`
- Dockerfile copies `backend/package*.json`, `npm install --production`, then copies backend source + `frontend/dist`; `CMD ["node","backend/server.js"]`

---

## Mental Model / Typical Flow

1. **Config tab:** set `acapyUrl` + `adminApiKey` → Create Tenant → receives bearer token (auto-saved as active).
2. **DIDs tab:** create DID (`method=key` / `ed25519`) → optionally set public → optionally select for later exchange.
3. **Create Supported SD-JWT:** define `vct` + attribute keys + bilingual labels + which are selectively disclosable → POST → `supported_cred_id` stored.
4. **Create Exchange:** select `supported_cred_id` → form auto-renders attribute inputs → optional DID/pin → create → QR appears (wallet scans offer).
5. **History:** revisit past offers.
6. **Proof Presentation tab:** define presentation definition (or reuse) → create request → obtain `request_uri` / `presentation_id` → poll status / view verified claims.

All state that must survive restarts lives in Mongo. Frontend state is ephemeral except what it re-fetches on load.