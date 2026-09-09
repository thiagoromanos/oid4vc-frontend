# Go Backend (oid4vc-backend)

High-performance, lightweight Golang backend using **Gin** framework for ACA-Py OID4VC issuance & presentation management.

---

## Architecture & File Structure

```
backend/
├── main.go         # Server entry point, Gin router setup, MongoDB initialization, CORS, static routes
├── config.go       # MongoDB connection, BSON models (Config, SupportedCredential, ExchangeRecord, DidRecord), active config loader
├── acapy.go        # ACA-Py HTTP client helper (custom headers, auth tokens, error formatter)
├── handlers.go     # Gin endpoint handlers (Config, Multitenancy, DID, Credentials, Exchange, OID4VP)
├── go.mod          # Go module declaration
├── go.sum          # Go dependency checksums
└── README.md       # Backend documentation
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Port for the HTTP server |
| `MONGODB_URI` | `mongodb://localhost:27017/oid4vci` | MongoDB connection string |
| `ACAPY_URL` | `http://localhost:8021` | ACA-Py admin API base URL |
| `BEARER_TOKEN` | `""` | ACA-Py tenant bearer token fallback |
| `GIN_MODE` | `debug` (`release` for prod) | Gin execution mode |

---

## Mongo Collections

- **`configs`**: Stores active tenant credentials, ACA-Py settings, and auth-server URLs.
- **`supported_credentials`**: OID4VCI `vc+sd-jwt` credential definitions and metadata.
- **`exchange_records`**: Issuance history & generated credential offer QR data.
- **`did_records`**: Wallet DIDs and posture status (`wallet_only` or `public`).

---

## API Endpoints (All under `/api`)

### Config & Multitenancy
- `GET /api/config` — Get current active configuration
- `POST /api/config` — Update configuration settings
- `POST /api/multitenancy/create-tenant` — Create subwallet in ACA-Py + obtain bearer token (+ optional Auth Server setup)

### DID Management
- `POST /api/did/create` — Create wallet DID (`method=key`, `key_type=ed25519`)
- `GET /api/did/records` — Sync with ACA-Py & retrieve stored DIDs
- `POST /api/did/set-public` — Promote DID posture to public

### OID4VCI Supported Credentials & Issuance
- `POST /api/credential-supported/create-sd-jwt` — Create supported SD-JWT credential definition
- `GET /api/credential-supported/records` — List stored supported credentials
- `GET /api/credential-supported/records/:supported_cred_id` — Inspect specific supported credential
- `POST /api/exchange/create` — Issue credential & generate exchange offer
- `GET /api/credential-offer` — Fetch raw offer payload by `exchange_id`
- `GET /api/exchange/records` — List past exchanges

### OID4VP Presentation & Verification
- `POST /api/dcql-query/create` — Create DCQL query
- `POST /api/presentation-definition/create` — Create presentation definition
- `POST /api/presentation-request/create` — Generate presentation request & `request_uri`
- `GET /api/presentation/records/:presentation_id` — Fetch live presentation status from ACA-Py
- `DELETE /api/presentation/records/:presentation_id` — Delete presentation request

---

## Development & Build

### Local Run

```bash
# Run backend directly (listens on :5000)
go run .
```

### Build Binary

```bash
go build -o server .
./server
```

---

## How to Add New Endpoints

1. **Add Handler**: Open `handlers.go` and define `func handleNewFeature(c *gin.Context)`.
2. **Use ACA-Py Helper**: Call `client, _, err := getAcapyClient(c.Request.Context(), nil)` to send authenticated requests to ACA-Py using `client.DoRequest(ctx, method, path, body, headers)`.
3. **Register Route**: Open `main.go` and register your handler under the `api` group: `api.POST("/new-feature", handleNewFeature)`.
