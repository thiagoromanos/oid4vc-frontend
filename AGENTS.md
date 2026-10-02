# AGENTS.md — oid4vc-frontend

**Purpose:** Full-stack OID4VCI/OID4VP credential manager for ACA-Py. Configure subwallets, mint SD-JWT credentials, trigger issuance, view offer QR codes, manage presentation verification.

**Stack:** Go + Gin backend | TypeScript + React + Vite frontend | MongoDB | Docker Compose

**Assumption:** You are adding or fixing a feature in the existing architecture. Do not rewrite into a different framework or paradigm.

---

## Operating rules for agents

### ✅ DO
1. **Backend first:** All ACA-Py calls happen in `backend/handlers.go`. Never call ACA-Py directly from the frontend.
2. **Persist after write:** After every successful ACA-Py write (create DID, create credential, etc.), upsert the result into the corresponding Mongo collection:
   - DID → `did_records`
   - Supported Credential → `supported_credentials`
   - Exchange → `exchange_records`
   - Presentation Def → presentation_def (if added)
3. **Mongo first, ACA-Py best-effort:** On read handlers (e.g., `GET /api/did/records`), try live ACA-Py first. If it fails, return the Mongo cache. Never let an ACA-Py outage crash your list endpoints.
4. **One route per feature:** Each backend feature gets exactly one `/api/path` route. No duplicates. Examples: `/api/exchange/create`, `/api/did/records`, `/api/credential-supported/create-sd-jwt`.
5. **Go structs match Mongo:** Define the struct once in `backend/config.go` (e.g., `ExchangeRecord`, `DidRecord`). Reuse it for Mongo queries and JSON responses.
6. **Frontend tab = one feature:** Each tab in `App.tsx` corresponds to one feature. Tab switching = feature context. Example: `CreateExchangeTab` uses `selectedCredIdForExchange` and `selectedDidForExchange` from App state.
7. **Vite dev proxy:** In dev, `npm run dev` in `frontend/` proxies `/api/*` to `http://localhost:5000`. No hardcoded backend URLs in frontend code. Always use relative paths like `/api/config`.
8. **Environment-first config:** Config defaults come from environment variables via `getActiveConfig()` in `backend/config.go`. If a field is blank in Mongo, it's populated from the environment on startup.
9. **Docker networking:** When running in Docker, ACA-Py on host is always `http://host.docker.internal:8021`, not `localhost`. This is baked into `docker-compose.yml` and error messages.
10. **TypeScript strict mode:** Frontend is TypeScript, not JavaScript. Use strict types. Never `any` without explicit reason.

### ❌ DON'T
1. **No new HTTP frameworks.** Gin handles routing. No Express, no Chi, no other Go web libs.
2. **No auth layer on `/api` routes.** This app is for local/admin use only. The UI is not multi-tenant-safe. Add auth only if explicitly asked.
3. **No breaking Mongo schema.** If you add a field to a struct, make it optional or provide a default. Existing records in the database must still work.
4. **No new major dependencies.** Axios, React, Gin, Mongo driver, Lucide, QRCode — these are it. Don't add auth libraries, ORM layers, or build tools without justification.
5. **No TypeScript-free frontend.** The frontend is TypeScript. Don't revert to `.jsx` files.
6. **No splitting `backend/handlers.go`** into multiple router files unless the handler count exceeds ~400 lines. Keep the codebase tight.
7. **No custom ngrok/entrypoint logic** unless auth-server discovery is the feature. The `entrypoint.sh` pattern is fragile; don't extend it casually.
8. **No live ACA-Py state in frontend** (e.g., polling for exchange status). Frontend is mostly stateless; the backend owns durable state and serves it on demand.

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────────┐
│ Browser: React (TypeScript) + Vite                          │
│  - Tab state machine in App.tsx                             │
│  - 7 feature tabs (config, create-cred, stored-creds, dids, │
│    exchange, presentation, history)                         │
│  - All calls to /api/* (Vite proxy in dev)                  │
└──────────────┬──────────────────────────────────────────────┘
               │ /api/...
               ↓
┌──────────────────────────────────────────────────────────────┐
│ Go Gin Server (:5000)                                        │
│  - main.go: router, CORS, static serving                    │
│  - config.go: Mongo models, env defaults, getActiveConfig() │
│  - acapy.go: ACA-Py HTTP helper + error formatting          │
│  - handlers.go: Config, Tenant, DID, Credential, Exchange,  │
│    OID4VP route handlers (~1200 lines)                      │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├─→ ACA-Py (:8021 or host.docker.internal)
               │   (admin API + OID4VCI/OID4VP plugin)
               │
               └─→ MongoDB (:27017, db=oid4vci)
                   - configs, supported_credentials,
                     exchange_records, did_records
```

---

## Adding a new feature: checklist

**Scenario:** You want to add support for a new ACA-Py endpoint or UI feature.

1. **Mongo model:** Add a struct to `backend/config.go` if you need persistence. Example:
   ```go
   type MyNewRecord struct {
       ID        primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
       MyID      string             `bson:"my_id" json:"my_id"`
       Data      map[string]interface{} `bson:"data" json:"data"`
       CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
   }
   ```

2. **Backend handler:** Add to `backend/handlers.go`. Use `getAcapyClient()` to call ACA-Py:
   ```go
   func handleMyNewFeature(c *gin.Context) {
       client, _, err := getAcapyClient(c.Request.Context(), nil)
       if err != nil {
           c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
           return
       }
       // ... parse body, call ACA-Py, upsert Mongo, return JSON
   }
   ```

3. **Register route:** Add to `backend/main.go` under the `/api` group:
   ```go
   api.POST("/my-new-feature", handleMyNewFeature)
   ```

4. **Frontend tab (or extend existing):** Create or update a component in `frontend/src/components/`. Use axios with relative paths:
   ```tsx
   const res = await axios.post('/api/my-new-feature', { /* body */ });
   ```

5. **Wire state in App.tsx:** If the feature state is shared across tabs, add it to App state and pass it down. Otherwise, keep state local to the tab component.

6. **Test:** Run locally:
   ```bash
   # Terminal 1: MongoDB
   mongod --dbpath /tmp/oid4vci-data
   
   # Terminal 2: Backend
   cd backend && go run .
   
   # Terminal 3: Frontend
   cd frontend && npm run dev
   ```

---

## Key files and their jobs

| File | Responsibility |
|------|-----------------|
| `backend/main.go` | Gin app, router setup, static serving, CORS |
| `backend/config.go` | Mongo connection, all structs, `getActiveConfig()`, `getAcapyClient()` |
| `backend/acapy.go` | ACA-Py HTTP client (`DoRequest`), error formatting, logging |
| `backend/handlers.go` | All `/api/*` route handlers (config, tenant, DID, credential, exchange, OID4VP) |
| `frontend/src/App.tsx` | Tab state machine, global fetches, feature state lifting |
| `frontend/src/components/*` | Individual tab components (7 files, one per feature) |
| `frontend/vite.config.ts` | Dev server port (3000), `/api` proxy to backend (:5000) |
| `docker-compose.yml` | MongoDB, backend, frontend containers; networking; env defaults |
| `.env_example` | Template for `EXTERNAL_FRONTEND_PORT`, auth-server env vars, ngrok discovery |
| `entrypoint.sh` | Startup script for container: waits for ngrok tunnel, discovers auth-server URL |

---

## Mongo collections and upsert patterns

Always use `FindOneAndUpdate` with `SetUpsert(true)` to avoid duplicate inserts on retries:

```go
opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
var savedRecord MyNewRecord
_ = coll.FindOneAndUpdate(ctx, bson.M{"my_id": myID}, bson.M{"$set": rec}, opts).Decode(&savedRecord)
```

This ensures idempotency: if the request is retried, the same record is updated, not duplicated.

---

## Environment variables: reference

| Variable | Default | Used by | Purpose |
|----------|---------|---------|---------|
| `MONGODB_URI` | `mongodb://localhost:27017/oid4vci` | Backend | Connect to MongoDB |
| `PORT` | `5000` | Backend | HTTP server port |
| `ACAPY_URL` | `http://issuer:3001` | Backend config | ACA-Py base URL fallback |
| `BEARER_TOKEN` | `""` | Backend config | ACA-Py bearer token fallback |
| `AUTH_SERVER_URL` | `""` | Config model | Auth-server base URL for tenant provisioning |
| `AUTH_SERVER_ADMIN_TOKEN` | `""` | Config model | Bearer token for auth-server requests |
| `AUTH_SERVER_PUBLIC_URL` | `""` | Config model + entrypoint | Public URL for auth-server (for external clients) |
| `AUTH_SERVER_PRIVATE_URL` | `""` | Config model | Private URL for auth-server (internal calls) |
| `TENANT_SECRET` | `""` | Config model | OAuth client secret for tenant |
| `TUNNEL_ENDPOINT` | `""` | `entrypoint.sh` | ngrok agent endpoint for auto-discovery |
| `TUNNEL_NAME` | `authserver` | `entrypoint.sh` | Name of the ngrok tunnel to discover |
| `WAIT_ATTEMPTS` | `10` | `entrypoint.sh` | Retry attempts for tunnel readiness |
| `WAIT_INTERVAL` | `3` | `entrypoint.sh` | Seconds between retry attempts |
| `GIN_MODE` | `debug` | Backend | Set to `release` for production |
| `NODE_ENV` | (none) | Backend | Used to decide production static serving |

The `Config` struct in `getActiveConfig()` merges DB values with env vars: blanks in DB are filled from environment.

---

## Common patterns: examples

### Read list with fallback
```go
// Try live, upsert into Mongo, return sorted list
func handleGetDidRecords(c *gin.Context) {
    client, _, _ := getAcapyClient(c.Request.Context(), nil)
    if client != nil {
        resBytes, code, _ := client.DoRequest(c.Request.Context(), "GET", "/wallet/did", nil, nil)
        if code < 400 {
            // Parse and upsert each DID from the response
            // ...
        }
    }
    // Return Mongo cache regardless
    coll := db.Collection("did_records")
    cursor, _ := coll.Find(c.Request.Context(), bson.M{}, options.Find().SetSort(bson.M{"createdAt": -1}))
    var records []DidRecord
    cursor.All(c.Request.Context(), &records)
    c.JSON(http.StatusOK, records)
}
```

### Create + persist + return
```go
func handleCreateDid(c *gin.Context) {
    var reqBody map[string]interface{}
    c.ShouldBindJSON(&reqBody)
    
    client, _, _ := getAcapyClient(c.Request.Context(), nil)
    resBytes, code, err := client.DoRequest(c.Request.Context(), "POST", "/wallet/did/create", reqBody, nil)
    if code >= 400 {
        c.JSON(code, gin.H{"error": formatErrorMsg(err, resBytes)})
        return
    }
    
    // Parse ACA-Py response
    var respData map[string]interface{}
    json.Unmarshal(resBytes, &respData)
    
    // Upsert into Mongo
    didRec := DidRecord{
        DID: respData["did"],
        // ... fill other fields
    }
    coll := db.Collection("did_records")
    opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
    var saved DidRecord
    coll.FindOneAndUpdate(c.Request.Context(), bson.M{"did": didRec.DID}, bson.M{"$set": didRec}, opts).Decode(&saved)
    
    c.JSON(http.StatusOK, gin.H{"success": true, "record": saved})
}
```

### Frontend: fetch on mount, pass to children
```tsx
// In App.tsx
useEffect(() => {
    fetchConfig();
    fetchStoredCreds();
    fetchDidRecords();
}, []);

// In a tab component
const handleSelectForExchange = (credId) => {
    setSelectedCredIdForExchange(credId);
    setActiveTab('exchange');
};
```

---

## Docker: what to know

- **Compose uses host networking for ACA-Py:** The backend sees `http://host.docker.internal:8021`, not `localhost:8021`.
- **Frontend builds to `frontend/dist` in the Dockerfile**, then the backend serves it as static assets.
- **MongoDB data persists** in a named volume `mongo_data`.
- **The entrypoint script runs on backend startup** to discover ngrok tunnel URL if configured.
- **Ports:** Mongo 27017, backend 5000, frontend mapped to `EXTERNAL_FRONTEND_PORT` (default 5000).

Run locally without Docker:
```bash
mongod --dbpath /tmp/oid4vci-data &
cd backend && go run .  # Listens on :5000
cd frontend && npm run dev  # Listens on :3000, proxies /api to :5000
```

---

## Common mistakes to avoid

1. **Calling ACA-Py from the frontend.** Don't do it. All ACA-Py traffic goes through the backend.
2. **Forgetting to upsert to Mongo.** After creating something in ACA-Py, always save it to the database.
3. **Hardcoding `localhost` in Docker.** Use `http://host.docker.internal:PORT`.
4. **Crashing on ACA-Py errors.** Try live, fall back to Mongo, return gracefully.
5. **Inventing new environment variables without updating `.env_example` and this file.**
6. **Using `any` in TypeScript.** Spend 2 minutes to type the API response properly.
7. **Adding new Mongo fields that break existing documents.** Make new fields optional or provide defaults.
8. **Calling handlers from handlers.** Handlers are HTTP entry points. Business logic goes in helper functions or the Mongo layer.

---

## Review checklist before pushing

- [ ] New backend handler? Added to `backend/main.go` routing.
- [ ] New Mongo collection or struct? Added to `backend/config.go`.
- [ ] New `/api` route? Documented in this file or backend README.
- [ ] Frontend changes? Uses `/api/*` relative paths, not hardcoded base URL.
- [ ] New env var? Updated `.env_example` and this file.
- [ ] Upserts to Mongo? Used `FindOneAndUpdate` with `SetUpsert(true)`.
- [ ] ACA-Py failure handling? Returns Mongo cache or friendly error, doesn't crash.
- [ ] TypeScript strict? No `any`, proper types on API responses.
- [ ] Tested locally? Ran `go run .`, `npm run dev`, tested flow end-to-end.
- [ ] Docker tested? `docker-compose up --build` if touching entrypoint, env, or backend structure.

---

## Questions to ask before starting

1. **Is this feature tied to a specific ACA-Py endpoint?** If yes, add the backend handler first.
2. **Do I need to persist state?** If yes, define a struct in `backend/config.go` and the Mongo collection name.
3. **Does this feature affect multiple tabs?** If yes, lift state to `App.tsx`.
4. **What's the error case?** Code the fallback to Mongo or a friendly error message.
5. **Do I need a new environment variable?** If yes, also update `.env_example`.

---

## Glossary

- **Config:** Single document in `configs` collection storing global ACA-Py URL, bearer token, active tenant, auth-server settings.
- **ActiveTenant:** Subwallet record inside Config; represents the currently selected wallet and its token.
- **Supported Credential:** OID4VCI credential definition (SD-JWT); stored in `supported_credentials` collection.
- **Exchange:** Issuance transaction; stores credential subject data and the credential offer string; used to generate QR codes.
- **DidRecord:** Wallet DID with posture (public/wallet-only), method, key type; stored in `did_records` collection.
- **PresentationDef:** OID4VP presentation definition payload; metadata for what claims can be requested.
- **Upsert:** MongoDB operation that inserts if missing, updates if present; ensures idempotency.
- **Best-effort:** Try the operation, but if it fails, don't crash; return cached data or proceed gracefully.
