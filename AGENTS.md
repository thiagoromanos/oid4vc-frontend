# AGENTS.md — oid4vc-frontend

This repository is a full-stack OID4VCI/OID4VP management UI for ACA-Py. It helps configure ACA-Py and an auth server, create multitenant subwallets, mint supported SD-JWT credentials, trigger issuance exchanges, view credential-offer QR codes, and manage presentation definitions and verification flows.

The app is intentionally split into a thin React + TypeScript frontend and a Go backend that acts as the API layer, Mongo persistence layer, and ACA-Py proxy.

- Repo: https://github.com/thiagoromanos/oid4vc-frontend
- Disclaimer: the project was created by AI.

---

## Project shape

### Stack
- Frontend: React 18 + TypeScript, Vite, Axios, Lucide, QR code rendering
- Backend: Go 1.23+ with Gin, MongoDB Go Driver
- Database: MongoDB 7, database `oid4vci`
- Target integration: ACA-Py admin API + OID4VCI/OID4VP plugin endpoints
- Runtime: Go backend serves the built frontend in production; Docker Compose orchestrates MongoDB, backend, and frontend containers

### High-level runtime flow
- The browser talks only to the app's own backend via `/api` routes.
- The Go backend stores global config and records in MongoDB.
- The backend authenticates to ACA-Py using a bearer token / admin API key from config.
- For supported credentials, issuance, and presentation flows, the backend mirrors relevant ACA-Py endpoints and persists local records for UX/history.
- In prod, the Go server serves the built frontend from `frontend/dist` and falls back to `index.html` for SPA routing.

---

## Repository layout

```text
/
├── AGENTS.md
├── README.md
├── .env_example
├── .gitignore
├── docker-compose.yml
├── entrypoint.sh
├── acapy-plugins-oid4vc.json
├── backend/
│   ├── main.go                    # Gin app setup, API registration, static serving
│   ├── config.go                  # MongoDB config + models + env defaults
│   ├── acapy.go                   # ACA-Py HTTP helper and error formatting
│   ├── handlers.go                # Route handlers for config, tenant, DID, credentials, exchange, OID4VP
│   ├── go.mod
│   ├── go.sum
│   └── README.md
├── frontend/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── nginx.conf
│   ├── Dockerfile
│   ├── src/
│   │   ├── App.tsx               # top-level tab state and feature wiring
│   │   ├── main.tsx
│   │   ├── theme.css
│   │   ├── theme1.css
│   │   └── components/
│   │       ├── ConfigTab.tsx
│   │       ├── CreateCredTab.tsx
│   │       ├── StoredCredsTab.tsx
│   │       ├── DidManagerTab.tsx
│   │       ├── CreateExchangeTab.tsx
│   │       ├── ExchangeHistoryTab.tsx
│   │       └── ProofPresentationTab.tsx
│   └── dist/                     # built frontend assets used in Docker/runtime
└── backend/Dockerfile
```

---

## Core conventions

### Backend
- Source of truth for all ACA-Py interactions is the Go backend in `backend/`.
- The app uses Gin and standard Go structs for Mongo documents.
- DB connection is initialized in `backend/config.go` and uses collection names like `configs`, `supported_credentials`, `exchange_records`, `did_records`.
- `getActiveConfig()` creates a single `global_config` config record if missing and fills blank env-configured fields from environment variables.
- Prefer live ACA-Py reads when possible; if they fail, return cached Mongo data rather than crashing the request.

### Frontend
- Frontend is TypeScript React, not JavaScript.
- UI state is split across tabs in `frontend/src/App.tsx`.
- All backend calls use relative paths such as `/api/config` and `/api/credential-supported/records`.
- Theme selection is supported via CSS-injected theme files (`theme.css`, `theme1.css`); localStorage stores the active theme.

---

## Config and persistence model

Main config document stored in Mongo under `configs`:

```go
type Config struct {
    Key                  string
    AcapyURL             string
    BearerToken          string
    AdminAPIKey          string
    ActiveTenant         *ActiveTenant
    AuthServerURL        string
    AuthServerAdminToken string
    AuthServerPublicURL  string
    AuthServerPrivateURL string
    TenantSecret         string
    UpdatedAt            time.Time
}
```

`ActiveTenant` contains the selected wallet data:

```go
type ActiveTenant struct {
    WalletID   string
    WalletName string
    Label      string
    Token      string
    CreatedAt  time.Time
}
```

Important persisted types:
- `SupportedCredential`: OID4VCI supported SD-JWT definitions (`supported_cred_id`, `vct`, `sd_list`, metadata, etc.)
- `ExchangeRecord`: credential issuance history (`exchange_id`, `supported_cred_id`, `credential_subject`, `credential_offer`, `offer_data`)
- `DidRecord`: wallet DIDs (`did`, `method`, `key_type`, `verkey`, `posture`)
- `PresentationDef`: presentation definition metadata and raw ACA-Py payload

The config and runtime defaults are intentionally merged with env vars in `getActiveConfig()`; blank DB fields will be populated from environment values when set.

---

## Environment variables and Docker

### Backend envs
These are the values that matter in practice:

- `MONGODB_URI` default `mongodb://localhost:27017/oid4vci`
- `PORT` default `5000`
- `ACAPY_URL` default `http://issuer:3001` or `http://localhost:8021` depending on usage
- `BEARER_TOKEN` fallback bearer for ACA-Py calls
- `AUTH_SERVER_URL`
- `AUTH_SERVER_ADMIN_TOKEN`
- `AUTH_SERVER_PUBLIC_URL`
- `AUTH_SERVER_PRIVATE_URL`
- `TENANT_SECRET`
- `TUNNEL_ENDPOINT`, `TUNNEL_NAME`, `WAIT_ATTEMPTS`, `WAIT_INTERVAL` for ngrok-based discovery in `entrypoint.sh`
- `GIN_MODE` / `NODE_ENV` for production behavior

### Docker Compose behavior
`docker-compose.yml` starts:
- `mongodb` on port `27017`
- `backend` container with `MONGODB_URI=mongodb://mongodb:27017/oid4vci` and ACA-Py pointed to `http://host.docker.internal:8021`
- `frontend` container on `EXTERNAL_FRONTEND_PORT` mapped to Nginx port `80`

The root `.env_example` shows the preferred auth-server defaults and how to prepopulate config before first start.

### Startup helper
`entrypoint.sh` is used in the container runtime to auto-discover an auth-server public URL from ngrok when `AUTH_SERVER_PUBLIC_URL` is not already set. This is a project-specific convenience that determines the externally reachable auth server address for the UI.

---

## Important backend API surface

All endpoints are mounted under `/api` in `backend/main.go`.

### Config and tenant setup
- `GET /api/config`
- `POST /api/config`
- `POST /api/multitenancy/create-tenant`

This flow usually does:
1. create ACA-Py wallet
2. request tenant token
3. persist active tenant + config in Mongo
4. return config and token info to the UI

### DID management
- `POST /api/did/create`
- `GET /api/did/records`
- `POST /api/did/set-public`

### OID4VCI supported credentials
- `POST /api/credential-supported/create-sd-jwt`
- `GET /api/credential-supported/records`
- `GET /api/credential-supported/records/:supported_cred_id`

### Issuance and offer flows
- `POST /api/exchange/create`
- `GET /api/credential-offer`
- `GET /api/exchange/records`

### OID4VP presentation flows
- `POST /api/dcql-query/create`
- `POST /api/presentation-definition/create`
- `POST /api/presentation-request/create`
- `GET /api/presentation/records/:presentation_id`
- `DELETE /api/presentation/records/:presentation_id`

Frontend tabs map to these flows directly. For example:
- `ConfigTab` manages ACA-Py and auth-server config
- `CreateCredTab` creates supported SD-JWT credentials
- `StoredCredsTab` lists and inspects stored credentials
- `DidManagerTab` creates and publicizes DIDs
- `CreateExchangeTab` builds issuance requests and QR codes
- `ProofPresentationTab` creates presentation definitions and requests
- `ExchangeHistoryTab` shows prior exchanges

---

## Frontend tab responsibilities

`frontend/src/App.tsx` is the app state coordinator.

Main tabs:
- `config` — endpoint/auth configuration and tenant provisioning
- `create-cred` — define attribute list and create supported credential
- `stored-creds` — browse credential definitions and select one for exchange
- `dids` — create/manage wallet DIDs and select one for issuance
- `exchange` — create issuance exchange and render QR code
- `presentation` — create presentation definition/request and inspect verification result
- `history` — past exchange history

The UI is intentionally thin and stateful only in-browser; the backend stores durable application state in MongoDB.

---

## Project-specific operational notes

- Use the backend as the source of truth for all ACA-Py HTTP calls.
- Do not add new database collections or object shapes casually; follow the existing Mongo document patterns.
- If a new feature interacts with ACA-Py, add or extend the corresponding backend route + Mongo model + frontend tab wiring.
- Keep new work consistent with the current stack: Go backend + React/TypeScript frontend + MongoDB.
- Respect the Docker networking pattern: `host.docker.internal` is expected when ACA-Py is running on the host machine.
- The app is designed to manage both issuance and verification flows for SD-JWT credentials, so keep OID4VCI/OID4VP terminology accurate when editing files.
- `acapy-plugins-oid4vc.json` is a useful reference for the actual ACA-Py plugin API, but the app only uses a subset of the full plugin surface.

---

## Typical user flow

1. Configure ACA-Py URL, bearer token, and optional admin API key.
2. Provision or select a multitenant wallet.
3. Create a DID for the active wallet.
4. Define a supported SD-JWT credential with localized labels for attribute display.
5. Create an issuance exchange and scan the offer QR code from a wallet app.
6. Optionally create a presentation definition and presentation request to verify claims.

Everything that must survive restarts is persisted in MongoDB. Frontend state is mostly ephemeral and re-fetched from the backend on load.

---

## Ownership and conventions for future agent work

- Do not rewrite the app into a different architecture unless the task explicitly requires it.
- Keep the current split: Go API server + React UI + MongoDB.
- Prefer editing existing files rather than introducing a new router framework or parallel backend.
- Respect the existing environment setup and Docker behavior, especially ngrok/auth-server discovery and host networking.
- When asked to add functionality, first trace the relevant backend handler and corresponding frontend tab before implementing changes.

This repository is a practical OID4VCI/OID4VP management tool and not a generic web app; most changes should be framed in terms of ACA-Py, subwallets, DID management, SD-JWT credential definitions, and credential exchange flows.
