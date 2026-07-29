# OID4VCI SD-JWT Credential Manager

A complete React + Express + MongoDB web interface designed for managing OID4VCI SD-JWT credentials, provisioning subwallets via ACA-Py Multitenancy, setting localized display labels in **en-US** and **pt-BR**, creating credential exchanges, and rendering **Credential Offer QR Codes**.

---

## 🌟 Key Features

1. **Configurable Endpoint & Bearer Auth**:
   - Easily configure your target ACA-Py instance base URL (e.g. `http://localhost:8021` or `http://aca-py:8021`).
   - Store and manage Bearer Auth Tokens in MongoDB.

2. **Multitenancy Tenant Provisioning**:
   - Interface to provision a new subwallet using `POST /multitenancy/wallet`.
   - Automatically retrieves the subwallet's Bearer token via `POST /multitenancy/wallet/{wallet_id}/token`.
   - Displays the token with a copy button and automatically sets it as the active authentication token.

3. **Create Supported SD-JWT Credential (`vc+sd-jwt`)**:
   - Register credential definitions using `POST /oid4vci/credential-supported/create/sd-jwt`.
   - Define custom attribute keys (e.g. `given_name`, `family_name`, `email`, `national_id`).
   - Set **localized display labels in `en-US` and `pt-BR`** for each attribute.
   - Toggle Selective Disclosure (SD) per attribute to build `sd_list`.
   - Persists the created `supported_cred_id` and metadata in MongoDB.

4. **Inspect Stored Credentials**:
   - Browse saved credential definitions.
   - Live inspection via `GET /oid4vci/credential-supported/records/{supported_cred_id}` to view ACA-Py definition records.

5. **Exchange Creation with Dynamic Localized Attributes**:
   - Select a stored `supported_cred_id`.
   - Automatically retrieves defined attributes from the credential definition.
   - Dynamically renders input fields displaying both `en-US` and `pt-BR` labels.
   - Creates issuance exchange via `POST /oid4vci/exchange/create`.

6. **Credential Offer QR Code**:
   - Calls `GET /oid4vci/credential-offer?exchange_id={exchange_id}` to obtain the `credential_offer` string.
   - Renders a scannable **QR Code** for mobile wallet apps to scan and receive the issued credential offer.

7. **Exchange History**:
   - View past exchange records, subject data, and re-display QR codes.

---

## 🚀 Running with Docker Compose (Recommended)

To launch the MongoDB database and the application together:

```bash
docker-compose up --build
```

The application will be available at:
👉 **`http://localhost:3000`**

---

## 💻 Running Locally (Development Mode)

### 1. Start MongoDB
Ensure MongoDB is running locally on port 27017:
```bash
mongod --dbpath /path/to/data
```

### 2. Start Backend API
```bash
cd backend
npm install
npm run dev
```
Backend runs on `http://localhost:5000`.

### 3. Start Frontend React App
```bash
cd frontend
npm install
npm run dev
```
Frontend Vite server runs on `http://localhost:3000`.

---

## 📄 OpenAPI / Swagger Reference

The application integrates with the ACA-Py OID4VCI plugin specified in `acapy-cpqd-plugins-oid4vc.json`:

- `POST /multitenancy/wallet`
- `POST /multitenancy/wallet/{wallet_id}/token`
- `POST /oid4vci/credential-supported/create/sd-jwt`
- `GET /oid4vci/credential-supported/records/{supported_cred_id}`
- `POST /oid4vci/exchange/create`
- `GET /oid4vci/credential-offer`

