package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// In-memory cache for presentation records (as in JS demo)
var presentationCache sync.Map

// --- CONFIG ENDPOINTS ---

func handleGetConfig(c *gin.Context) {
	config, err := getActiveConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, config)
}

func handlePostConfig(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	config, err := getActiveConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if val, ok := body["acapyUrl"].(string); ok {
		config.AcapyURL = val
	}
	if val, ok := body["bearerToken"].(string); ok {
		config.BearerToken = val
	}
	if val, ok := body["adminApiKey"].(string); ok {
		config.AdminAPIKey = val
	}
	if val, ok := body["authServerUrl"].(string); ok {
		config.AuthServerURL = val
	}
	if val, ok := body["authServerAdminToken"].(string); ok {
		config.AuthServerAdminToken = val
	}
	if val, ok := body["authServerPublicUrl"].(string); ok {
		config.AuthServerPublicURL = val
	}
	if val, ok := body["authServerPrivateUrl"].(string); ok {
		config.AuthServerPrivateURL = val
	}
	if val, ok := body["tenantSecret"].(string); ok {
		config.TenantSecret = val
	}

	config.UpdatedAt = time.Now()
	coll := db.Collection("configs")
	_, err = coll.UpdateOne(c.Request.Context(), bson.M{"_id": config.ID}, bson.M{"$set": config})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, config)
}

// --- MULTITENANCY ENDPOINTS ---

func handleCreateTenant(c *gin.Context) {
	var logs []string
	logEntry := func(msg string, data interface{}) {
		entry := msg
		if data != nil {
			bytesData, _ := json.Marshal(data)
			entry = fmt.Sprintf("%s: %s", msg, string(bytesData))
		}
		logs = append(logs, entry)
		log.Printf("[create-tenant] %s", entry)
	}

	var reqBody map[string]interface{}
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "logs": logs})
		return
	}

	config, err := getActiveConfig(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "logs": logs})
		return
	}

	targetURL := config.AcapyURL
	if val, ok := reqBody["acapyUrl"].(string); ok && val != "" {
		targetURL = val
	}

	targetAdminKey := config.AdminAPIKey
	if val, ok := reqBody["adminApiKey"].(string); ok {
		targetAdminKey = val
	}

	resolvedAuthServerURL := config.AuthServerURL
	if val, ok := reqBody["authServerUrl"].(string); ok && val != "" {
		resolvedAuthServerURL = val
	}
	resolvedAuthServerAdminToken := config.AuthServerAdminToken
	if val, ok := reqBody["authServerAdminToken"].(string); ok && val != "" {
		resolvedAuthServerAdminToken = val
	}
	resolvedAuthServerPublicURL := config.AuthServerPublicURL
	if val, ok := reqBody["authServerPublicUrl"].(string); ok && val != "" {
		resolvedAuthServerPublicURL = val
	}
	resolvedAuthServerPrivateURL := config.AuthServerPrivateURL
	if val, ok := reqBody["authServerPrivateUrl"].(string); ok && val != "" {
		resolvedAuthServerPrivateURL = val
	}
	resolvedTenantSecret := config.TenantSecret
	if val, ok := reqBody["tenantSecret"].(string); ok && val != "" {
		resolvedTenantSecret = val
	}

	customCfg := &Config{
		AcapyURL:    targetURL,
		AdminAPIKey: targetAdminKey,
	}
	acapyClient, _, err := getAcapyClient(c.Request.Context(), customCfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "logs": logs})
		return
	}

	nowTs := time.Now().UnixMilli()
	walletName := fmt.Sprintf("tenant_%d", nowTs)
	if val, ok := reqBody["wallet_name"].(string); ok && val != "" {
		walletName = val
	}
	walletKey := fmt.Sprintf("key_%d", nowTs)
	if val, ok := reqBody["wallet_key"].(string); ok && val != "" {
		walletKey = val
	}
	label := "OID4VCI Tenant"
	if val, ok := reqBody["label"].(string); ok && val != "" {
		label = val
	} else {
		label = walletName
	}
	walletType := "askar"
	if val, ok := reqBody["wallet_type"].(string); ok && val != "" {
		walletType = val
	}

	// ── STEP 1: Create Wallet / Tenant ──
	logEntry("Step 1: Creating ACA-Py subwallet via POST /multitenancy/wallet", nil)
	walletReqBody := map[string]interface{}{
		"wallet_name":         walletName,
		"wallet_key":          walletKey,
		"label":               label,
		"wallet_type":         walletType,
		"key_management_mode": "managed",
	}

	resBytes, statusCode, err := acapyClient.DoRequest(c.Request.Context(), "POST", "/multitenancy/wallet", walletReqBody, nil)
	if err != nil || statusCode >= 400 {
		errMsg := formatErrorMsg(err, resBytes)
		log.Printf("[create-tenant] Fatal error step 1: %s", errMsg)
		c.JSON(statusCode, gin.H{"error": errMsg, "logs": logs})
		return
	}

	var walletData map[string]interface{}
	_ = json.Unmarshal(resBytes, &walletData)
	walletID, _ := walletData["wallet_id"].(string)
	retWalletName, _ := walletData["wallet_name"].(string)
	if retWalletName == "" {
		retWalletName = walletName
	}
	logEntry("Step 1 OK — wallet created", map[string]interface{}{"wallet_id": walletID, "wallet_name": retWalletName})

	// ── STEP 2: Get Bearer Token ──
	logEntry(fmt.Sprintf("Step 2: Fetching token via POST /multitenancy/wallet/%s/token", walletID), nil)
	tokenReqBody := map[string]interface{}{}
	if walletKey != "" {
		tokenReqBody["wallet_key"] = walletKey
	}

	tokenBytes, statusCode, err := acapyClient.DoRequest(c.Request.Context(), "POST", fmt.Sprintf("/multitenancy/wallet/%s/token", walletID), tokenReqBody, nil)
	if err != nil || statusCode >= 400 {
		errMsg := formatErrorMsg(err, tokenBytes)
		log.Printf("[create-tenant] Fatal error step 2: %s", errMsg)
		c.JSON(statusCode, gin.H{"error": errMsg, "logs": logs})
		return
	}

	var tokenData map[string]interface{}
	_ = json.Unmarshal(tokenBytes, &tokenData)
	token, _ := tokenData["token"].(string)
	logEntry("Step 2 OK — token obtained", nil)

	// ── STEPS 3-5: Auth-server setup (optional) ──
	authStepResults := make(map[string]interface{})
	if resolvedAuthServerURL != "" {
		authClient := &http.Client{Timeout: 15 * time.Second}
		authBaseURL := strings.TrimRight(resolvedAuthServerURL, "/")

		doAuthRequest := func(method, path string, body interface{}) ([]byte, int, error) {
			var bodyReader io.Reader
			if body != nil {
				b, _ := json.Marshal(body)
				bodyReader = bytes.NewReader(b)
			}
			req, err := http.NewRequestWithContext(c.Request.Context(), method, authBaseURL+path, bodyReader)
			if err != nil {
				return nil, 0, err
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Accept", "application/json")
			req.Header.Set("Authorization", "Bearer "+resolvedAuthServerAdminToken)
			resp, err := authClient.Do(req)
			if err != nil {
				return nil, 0, err
			}
			defer resp.Body.Close()
			b, err := io.ReadAll(resp.Body)
			return b, resp.StatusCode, err
		}

		// Step 3: Create auth-server tenant
		logEntry(fmt.Sprintf("Step 3: Creating auth-server tenant for wallet_id=%s via POST %s/admin/tenants", walletID, resolvedAuthServerURL), nil)
		tenantPayload := map[string]interface{}{
			"uid":    walletID,
			"name":   retWalletName,
			"active": true,
			"notes":  "oid4vc-frontend provisioned tenant",
		}
		b3, code3, err3 := doAuthRequest("POST", "/admin/tenants", tenantPayload)
		if err3 != nil || code3 >= 400 {
			errMsg := formatErrorMsg(err3, b3)
			logEntry("Step 3 WARN — auth-server tenant creation failed (continuing)", errMsg)
			authStepResults["tenantError"] = errMsg
		} else {
			var tRes map[string]interface{}
			_ = json.Unmarshal(b3, &tRes)
			authStepResults["tenant"] = tRes
			logEntry("Step 3 OK — auth-server tenant created", tRes)
		}

		// Step 4: Create ES256 signing key
		notBefore := time.Now()
		notAfter := notBefore.AddDate(1, 0, 0)
		logEntry(fmt.Sprintf("Step 4: Creating ES256 signing key for tenant via POST %s/admin/tenants/%s/keys", resolvedAuthServerURL, walletID), nil)
		logEntry(fmt.Sprintf("  Key validity: %s → %s", notBefore.Format(time.RFC3339), notAfter.Format(time.RFC3339)), nil)
		keyPayload := map[string]interface{}{
			"alg":        "ES256",
			"not_before": notBefore.Format(time.RFC3339),
			"not_after":  notAfter.Format(time.RFC3339),
			"status":     "active",
		}
		b4, code4, err4 := doAuthRequest("POST", fmt.Sprintf("/admin/tenants/%s/keys", walletID), keyPayload)
		if err4 != nil || code4 >= 400 {
			errMsg := formatErrorMsg(err4, b4)
			logEntry("Step 4 WARN — signing key creation failed (continuing)", errMsg)
			authStepResults["keyError"] = errMsg
		} else {
			var kRes map[string]interface{}
			_ = json.Unmarshal(b4, &kRes)
			authStepResults["key"] = kRes
			logEntry("Step 4 OK — signing key created", kRes)
		}

		// Step 5: Create OAuth client
		logEntry(fmt.Sprintf("Step 5: Creating OAuth client for tenant via POST %s/admin/tenants/%s/clients", resolvedAuthServerURL, walletID), nil)
		clientPayload := map[string]interface{}{
			"client_id":          "client1",
			"client_auth_method": "client_secret_basic",
			"client_secret":      resolvedTenantSecret,
		}
		b5, code5, err5 := doAuthRequest("POST", fmt.Sprintf("/admin/tenants/%s/clients", walletID), clientPayload)
		if err5 != nil || code5 >= 400 {
			errMsg := formatErrorMsg(err5, b5)
			logEntry("Step 5 WARN — OAuth client creation failed (continuing)", errMsg)
			authStepResults["clientError"] = errMsg
		} else {
			var cRes map[string]interface{}
			_ = json.Unmarshal(b5, &cRes)
			authStepResults["client"] = cRes
			logEntry("Step 5 OK — OAuth client created", cRes)
		}

		// Step 6: Configure ACA-Py issuer metadata
		if resolvedAuthServerPublicURL != "" && resolvedAuthServerPrivateURL != "" {
			logEntry("Step 6: Configuring ACA-Py issuer metadata via PUT /oid4vci/issuer/configuration", nil)
			issuerPayload := map[string]interface{}{
				"authorization_servers": []map[string]interface{}{
					{
						"public_url":  fmt.Sprintf("%s/tenants/%s", strings.TrimRight(resolvedAuthServerPublicURL, "/"), walletID),
						"private_url": fmt.Sprintf("%s/tenants/%s", strings.TrimRight(resolvedAuthServerPrivateURL, "/"), walletID),
						"auth_type":   "client_secret_basic",
						"client_credentials": map[string]interface{}{
							"client_id":     "client1",
							"client_secret": resolvedTenantSecret,
						},
					},
				},
			}
			logEntry("Step 6: Issuer configuration payload", issuerPayload)

			issuerClient := &AcapyClient{
				BaseURL:     strings.TrimRight(targetURL, "/"),
				BearerToken: token,
				AdminAPIKey: targetAdminKey,
				HTTPClient:  &http.Client{Timeout: 15 * time.Second},
			}
			b6, code6, err6 := issuerClient.DoRequest(c.Request.Context(), "PUT", "/oid4vci/issuer/configuration", issuerPayload, nil)
			if err6 != nil || code6 >= 400 {
				errMsg := formatErrorMsg(err6, b6)
				logEntry("Step 6 WARN — issuer configuration failed (continuing)", errMsg)
				authStepResults["issuerConfigError"] = errMsg
			} else {
				var iRes map[string]interface{}
				_ = json.Unmarshal(b6, &iRes)
				authStepResults["issuerConfig"] = iRes
				logEntry("Step 6 OK — issuer configuration set", iRes)
			}
		} else {
			logEntry("Step 6 SKIPPED — authServerPublicUrl or authServerPrivateUrl not provided", nil)
		}
	} else {
		logEntry("Steps 3-6 SKIPPED — no authServerUrl provided", nil)
	}

	// Persist to MongoDB Config
	logEntry("Saving tenant + auth config to database", nil)
	config.AcapyURL = targetURL
	if targetAdminKey != "" {
		config.AdminAPIKey = targetAdminKey
	}
	config.BearerToken = token
	config.ActiveTenant = &ActiveTenant{
		WalletID:   walletID,
		WalletName: retWalletName,
		Label:      label,
		Token:      token,
		CreatedAt:  time.Now(),
	}
	if resolvedAuthServerURL != "" {
		config.AuthServerURL = resolvedAuthServerURL
	}
	if resolvedAuthServerAdminToken != "" {
		config.AuthServerAdminToken = resolvedAuthServerAdminToken
	}
	if resolvedAuthServerPublicURL != "" {
		config.AuthServerPublicURL = resolvedAuthServerPublicURL
	}
	if resolvedAuthServerPrivateURL != "" {
		config.AuthServerPrivateURL = resolvedAuthServerPrivateURL
	}
	if resolvedTenantSecret != "" {
		config.TenantSecret = resolvedTenantSecret
	}
	config.UpdatedAt = time.Now()

	coll := db.Collection("configs")
	_, _ = coll.UpdateOne(c.Request.Context(), bson.M{"_id": config.ID}, bson.M{"$set": config})
	logEntry("Configuration saved successfully", nil)

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"wallet_id":       walletID,
		"wallet_name":     walletName,
		"token":           token,
		"authStepResults": authStepResults,
		"logs":            logs,
		"config":          config,
	})
}

// --- DID MANAGEMENT ENDPOINTS ---

func handleCreateDid(c *gin.Context) {

	var logs []string
	logEntry := func(msg string, data interface{}) {
		entry := msg
		if data != nil {
			bytesData, _ := json.Marshal(data)
			entry = fmt.Sprintf("%s: %s", msg, string(bytesData))
		}
		logs = append(logs, entry)
		log.Printf("[create-tenant] %s", entry)
	}

	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var reqBody map[string]interface{}
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	method := "key"
	if val, ok := reqBody["method"].(string); ok && val != "" {
		method = val
	}
	keyType := "ed25519"
	if val, ok := reqBody["key_type"].(string); ok && val != "" {
		keyType = val
	}

	var payload map[string]interface{}
	var requestUri string

	if method == "jwk" {
		if keyType != "ed25519" && keyType != "p256" && err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		payload = map[string]interface{}{
			"key_type": keyType,
		}

		logEntry("Keytype com jwk: ", keyType)

		requestUri = "/did/jwk/create"
	} else {
		payload = map[string]interface{}{
			"method": method,
			"options": map[string]interface{}{
				"key_type": keyType,
			},
		}
		if seed, ok := reqBody["seed"].(string); ok && strings.TrimSpace(seed) != "" {
			payload["seed"] = strings.TrimSpace(seed)
		}
		requestUri = "/wallet/did/create"
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "POST", requestUri, payload, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var respData map[string]interface{}
	_ = json.Unmarshal(resBytes, &respData)

	didInfo := respData

	var didStr string
	var verkeyStr string
	var postureStr string
	var metadataVal string

	if method == "jwk" {
		didStr, _ = didInfo["did"].(string)
	} else {
		if resultObj, ok := respData["result"].(map[string]interface{}); ok {
			didInfo = resultObj
		}

		didStr, _ := didInfo["did"].(string)
		if didStr == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to extract DID from ACA-Py response", "raw": respData})
			return
		}

		verkeyStr, _ = didInfo["verkey"].(string)
		postureStr, _ := didInfo["posture"].(string)
		if postureStr == "" {
			postureStr = "wallet_only"
		}
		metadataVal := didInfo["metadata"]
		if metadataVal == nil {
			metadataVal = map[string]interface{}{}
		}
	}

	didRec := DidRecord{
		DID:       didStr,
		Method:    method,
		KeyType:   keyType,
		Verkey:    verkeyStr,
		Posture:   postureStr,
		Metadata:  metadataVal,
		RawRecord: didInfo,
		CreatedAt: time.Now(),
	}

	coll := db.Collection("did_records")
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	var savedRecord DidRecord
	_ = coll.FindOneAndUpdate(c.Request.Context(), bson.M{"did": didStr}, bson.M{"$set": didRec}, opts).Decode(&savedRecord)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"didRecord":     savedRecord,
		"acapyResponse": respData,
	})
}

func handleGetDidRecords(c *gin.Context) {
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err == nil {
		resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "GET", "/wallet/did", nil, nil)
		if err == nil && statusCode < 400 {
			var respData map[string]interface{}
			if json.Unmarshal(resBytes, &respData) == nil {
				if results, ok := respData["results"].([]interface{}); ok {
					coll := db.Collection("did_records")
					for _, item := range results {
						if dMap, ok := item.(map[string]interface{}); ok {
							didStr, _ := dMap["did"].(string)
							if didStr != "" {
								method, _ := dMap["method"].(string)
								if method == "" {
									method = "key"
								}
								keyType, _ := dMap["key_type"].(string)
								if keyType == "" {
									keyType = "ed25519"
								}
								verkey, _ := dMap["verkey"].(string)
								posture, _ := dMap["posture"].(string)
								if posture == "" {
									posture = "wallet_only"
								}
								metadata := dMap["metadata"]
								if metadata == nil {
									metadata = map[string]interface{}{}
								}
								opts := options.FindOneAndUpdate().SetUpsert(true)
								didRec := bson.M{
									"did":        didStr,
									"method":     method,
									"key_type":   keyType,
									"verkey":     verkey,
									"posture":    posture,
									"metadata":   metadata,
									"raw_record": dMap,
									"createdAt":  time.Now(),
								}
								_ = coll.FindOneAndUpdate(c.Request.Context(), bson.M{"did": didStr}, bson.M{"$set": didRec}, opts)
							}
						}
					}
				}
			}
		}
	}

	coll := db.Collection("did_records")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := coll.Find(c.Request.Context(), bson.M{}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var records []DidRecord
	if err := cursor.All(c.Request.Context(), &records); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if records == nil {
		records = []DidRecord{}
	}

	c.JSON(http.StatusOK, records)
}

func handleSetPublicDid(c *gin.Context) {
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	didStr, _ := body["did"].(string)
	if didStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "DID is required"})
		return
	}

	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "POST", fmt.Sprintf("/wallet/did/public?did=%s", didStr), nil, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var respData map[string]interface{}
	_ = json.Unmarshal(resBytes, &respData)

	coll := db.Collection("did_records")
	opts := options.FindOneAndUpdate().SetReturnDocument(options.After)
	var updated DidRecord
	_ = coll.FindOneAndUpdate(c.Request.Context(), bson.M{"did": didStr}, bson.M{"$set": bson.M{"posture": "public", "raw_record": respData}}, opts).Decode(&updated)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"didRecord":     updated,
		"acapyResponse": respData,
	})
}

// --- CREDENTIAL SUPPORTED ENDPOINTS ---

func handleCreateSdJwtSupported(c *gin.Context) {
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "POST", "/oid4vci/credential-supported/create/sd-jwt", payload, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var acapyRecord map[string]interface{}
	_ = json.Unmarshal(resBytes, &acapyRecord)

	supportedCredID, _ := acapyRecord["supported_cred_id"].(string)
	if supportedCredID == "" {
		supportedCredID, _ = acapyRecord["identifier"].(string)
	}
	if supportedCredID == "" {
		supportedCredID, _ = payload["id"].(string)
	}

	identifier, _ := acapyRecord["identifier"].(string)
	if identifier == "" {
		identifier, _ = payload["id"].(string)
	}
	vct, _ := acapyRecord["vct"].(string)
	if vct == "" {
		vct, _ = payload["vct"].(string)
	}
	format, _ := acapyRecord["format"].(string)
	if format == "" {
		format, _ = payload["format"].(string)
	}
	if format == "" {
		format = "vc+sd-jwt"
	}

	sdList := parseStringArray(payload["sd_list"])
	cryptoMethods := parseStringArray(payload["cryptographic_binding_methods_supported"])
	if len(cryptoMethods) == 0 {
		cryptoMethods = []string{"did"}
	}
	signingAlgs := parseStringArray(payload["credential_signing_alg_values_supported"])
	if len(signingAlgs) == 0 {
		signingAlgs = []string{"ES256K"}
	}

	metadata, _ := payload["credential_metadata"].(map[string]interface{})
	if metadata == nil {
		metadata, _ = acapyRecord["credential_metadata"].(map[string]interface{})
	}
	if metadata == nil {
		metadata = map[string]interface{}{}
	}

	rec := SupportedCredential{
		SupportedCredID:                      supportedCredID,
		Identifier:                           identifier,
		VCT:                                  vct,
		Format:                               format,
		SDList:                               sdList,
		CryptographicBindingMethodsSupported: cryptoMethods,
		CredentialSigningAlgValuesSupported:  signingAlgs,
		CredentialMetadata:                   metadata,
		RawRecord:                            acapyRecord,
		UpdatedAt:                            time.Now(),
		CreatedAt:                            time.Now(),
	}

	coll := db.Collection("supported_credentials")
	opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
	var savedRecord SupportedCredential
	_ = coll.FindOneAndUpdate(c.Request.Context(), bson.M{"supported_cred_id": supportedCredID}, bson.M{"$set": rec}, opts).Decode(&savedRecord)

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"supported_cred_id": supportedCredID,
		"record":            savedRecord,
		"acapyResponse":     acapyRecord,
	})
}

func parseStringArray(val interface{}) []string {
	if val == nil {
		return []string{}
	}
	if arr, ok := val.([]interface{}); ok {
		res := make([]string, 0, len(arr))
		for _, item := range arr {
			if s, ok := item.(string); ok {
				res = append(res, s)
			}
		}
		return res
	}
	if arr, ok := val.([]string); ok {
		return arr
	}
	return []string{}
}

func handleGetSupportedRecords(c *gin.Context) {
	coll := db.Collection("supported_credentials")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := coll.Find(c.Request.Context(), bson.M{}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var records []SupportedCredential
	if err := cursor.All(c.Request.Context(), &records); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if records == nil {
		records = []SupportedCredential{}
	}

	c.JSON(http.StatusOK, records)
}

func handleGetSupportedRecordByID(c *gin.Context) {
	supportedCredID := c.Param("supported_cred_id")
	client, _, err := getAcapyClient(c.Request.Context(), nil)

	var acapyRecord map[string]interface{}
	if err == nil {
		resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "GET", fmt.Sprintf("/oid4vci/credential-supported/records/%s", supportedCredID), nil, nil)
		if err == nil && statusCode < 400 {
			_ = json.Unmarshal(resBytes, &acapyRecord)
		}
	}

	coll := db.Collection("supported_credentials")
	var localRecord SupportedCredential
	errLocal := coll.FindOne(c.Request.Context(), bson.M{"supported_cred_id": supportedCredID}).Decode(&localRecord)

	if acapyRecord != nil {
		identifier, _ := acapyRecord["identifier"].(string)
		if identifier == "" {
			identifier = localRecord.Identifier
		}
		if identifier == "" {
			identifier = supportedCredID
		}
		vct, _ := acapyRecord["vct"].(string)
		if vct == "" {
			vct = localRecord.VCT
		}
		format, _ := acapyRecord["format"].(string)
		if format == "" {
			format = localRecord.Format
		}
		if format == "" {
			format = "vc+sd-jwt"
		}
		metadata, _ := acapyRecord["credential_metadata"].(map[string]interface{})
		if metadata == nil {
			metadata = localRecord.CredentialMetadata
		}

		updateDoc := bson.M{
			"supported_cred_id":   supportedCredID,
			"identifier":          identifier,
			"vct":                 vct,
			"format":              format,
			"credential_metadata": metadata,
			"raw_record":          acapyRecord,
			"updatedAt":           time.Now(),
		}
		opts := options.FindOneAndUpdate().SetUpsert(true).SetReturnDocument(options.After)
		_ = coll.FindOneAndUpdate(c.Request.Context(), bson.M{"supported_cred_id": supportedCredID}, bson.M{"$set": updateDoc}, opts).Decode(&localRecord)
	}

	if errLocal != nil && acapyRecord == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Supported credential record not found"})
		return
	}

	if localRecord.SupportedCredID != "" {
		c.JSON(http.StatusOK, localRecord)
	} else {
		c.JSON(http.StatusOK, acapyRecord)
	}
}

// --- EXCHANGE ENDPOINTS ---

func handleCreateExchange(c *gin.Context) {
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var reqBody map[string]interface{}
	if err := c.ShouldBindJSON(&reqBody); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	supportedCredID, _ := reqBody["supported_cred_id"].(string)
	credSubject, _ := reqBody["credential_subject"].(map[string]interface{})
	if supportedCredID == "" || credSubject == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "supported_cred_id and credential_subject are required"})
		return
	}

	payload := map[string]interface{}{
		"supported_cred_id":  supportedCredID,
		"credential_subject": credSubject,
	}
	if pin, ok := reqBody["pin"].(string); ok && pin != "" {
		payload["pin"] = pin
	}
	if did, ok := reqBody["did"].(string); ok && did != "" {
		payload["did"] = did
	}
	if vm, ok := reqBody["verification_method"].(string); ok && vm != "" {
		payload["verification_method"] = vm
	} else {
		if did, ok := reqBody["did"].(string); ok && did != "" {
			payload["diverification_methodd"] = did + "#0"
		}
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "POST", "/oid4vci/exchange/create", payload, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var exchangeRecord map[string]interface{}
	_ = json.Unmarshal(resBytes, &exchangeRecord)
	exchangeID, _ := exchangeRecord["exchange_id"].(string)

	var credentialOffer string
	var offerData interface{}

	offerBytes, offerCode, offerErr := client.DoRequest(c.Request.Context(), "GET", fmt.Sprintf("/oid4vci/credential-offer?exchange_id=%s", exchangeID), nil, nil)
	if offerErr == nil && offerCode < 400 {
		var oData map[string]interface{}
		if json.Unmarshal(offerBytes, &oData) == nil {
			offerData = oData
			if co, ok := oData["credential_offer"].(string); ok {
				credentialOffer = co
			}
		} else {
			credentialOffer = string(offerBytes)
			offerData = credentialOffer
		}
	}

	savedExchange := ExchangeRecord{
		ExchangeID:        exchangeID,
		SupportedCredID:   supportedCredID,
		CredentialSubject: credSubject,
		CredentialOffer:   credentialOffer,
		OfferData:         offerData,
		RawRecord:         exchangeRecord,
		CreatedAt:         time.Now(),
	}

	coll := db.Collection("exchange_records")
	_, _ = coll.InsertOne(c.Request.Context(), savedExchange)

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"exchange_id":      exchangeID,
		"credential_offer": credentialOffer,
		"exchangeRecord":   savedExchange,
		"offerData":        offerData,
	})
}

func handleGetCredentialOffer(c *gin.Context) {
	exchangeID := c.Query("exchange_id")
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "GET", fmt.Sprintf("/oid4vci/credential-offer?exchange_id=%s", exchangeID), nil, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var respData interface{}
	if json.Unmarshal(resBytes, &respData) == nil {
		c.JSON(http.StatusOK, respData)
	} else {
		c.String(http.StatusOK, string(resBytes))
	}
}

func handleGetExchangeRecords(c *gin.Context) {
	coll := db.Collection("exchange_records")
	opts := options.Find().SetSort(bson.M{"createdAt": -1})
	cursor, err := coll.Find(c.Request.Context(), bson.M{}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(c.Request.Context())

	var records []ExchangeRecord
	if err := cursor.All(c.Request.Context(), &records); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if records == nil {
		records = []ExchangeRecord{}
	}

	c.JSON(http.StatusOK, records)
}

// --- OID4VP ENDPOINTS ---

func handleCreateDcqlQuery(c *gin.Context) {
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "POST", "/oid4vp/dcql/queries", body, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var respData interface{}
	_ = json.Unmarshal(resBytes, &respData)
	c.JSON(http.StatusOK, respData)
}

func handleCreatePresentationDef(c *gin.Context) {
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	presDefVal, hasPresDef := body["pres_def"]
	if !hasPresDef {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pres_def object is required"})
		return
	}

	payload := body
	if pMap, ok := presDefVal.(map[string]interface{}); ok && pMap["pres_def"] != nil {
		payload = pMap
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "POST", "/oid4vp/presentation-definition", payload, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var resData map[string]interface{}
	_ = json.Unmarshal(resBytes, &resData)
	presDefID, _ := resData["pres_def_id"].(string)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"pres_def_id":   presDefID,
		"acapyResponse": resData,
	})
}

func handleCreatePresentationReq(c *gin.Context) {
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	presDefID, _ := body["pres_def_id"].(string)
	dcqlQueryID, _ := body["dcql_query_id"].(string)
	// vpFormats := body["vp_formats"]
	presDefObj := body["pres_def"]

	// if vpFormats == nil {
	// 	vpFormats = map[string]interface{}{
	// 		"vc+sd-jwt": map[string]interface{}{
	// 			"sd-jwt_alg_values": []string{"ES256", "ES384"},
	// 			"kb-jwt_alg_values": []string{"ES256", "ES384"},
	// 		},
	// 	}
	// }

	if presDefID == "" && presDefObj != nil && dcqlQueryID == "" {
		payload := map[string]interface{}{"pres_def": presDefObj}
		if pMap, ok := presDefObj.(map[string]interface{}); ok && pMap["pres_def"] != nil {
			payload = pMap
		}
		pdBytes, pdCode, pdErr := client.DoRequest(c.Request.Context(), "POST", "/oid4vp/presentation-definition", payload, nil)
		if pdErr == nil && pdCode < 400 {
			var pdRes map[string]interface{}
			if json.Unmarshal(pdBytes, &pdRes) == nil {
				if id, ok := pdRes["pres_def_id"].(string); ok {
					presDefID = id
				} else if pd, ok := pdRes["pres_def"].(map[string]interface{}); ok {
					if id, ok := pd["id"].(string); ok {
						presDefID = id
					}
				}
			}
		}
	}

	if presDefID == "" && dcqlQueryID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Either pres_def_id, pres_def, or dcql_query_id is required"})
		return
	}

	reqPayload := map[string]interface{}{
		// "vp_formats": vpFormats,
	}
	if presDefID != "" {
		reqPayload["pres_def_id"] = presDefID
	}
	if dcqlQueryID != "" {
		reqPayload["dcql_query_id"] = dcqlQueryID
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "POST", "/oid4vp/request", reqPayload, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var data map[string]interface{}
	_ = json.Unmarshal(resBytes, &data)

	presentationID := extractStringPath(data, "presentation_id", "presentation.presentation_id", "request.presentation_id", "request_id", "request.request_id")
	if presentationID == "" {
		presentationID = fmt.Sprintf("pres_%d", time.Now().UnixMilli())
	}
	requestURI := extractStringPath(data, "request_uri", "request.request_uri")

	cacheKey := presDefID
	if cacheKey == "" {
		cacheKey = dcqlQueryID
	}
	presentationCache.Store(cacheKey, map[string]interface{}{
		"presentation_id": presentationID,
		"pres_def_id":     presDefID,
		"dcql_query_id":   dcqlQueryID,
		"request_uri":     requestURI,
		"data":            data,
	})

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"presentation_id": presentationID,
		"request_uri":     requestURI,
		"raw":             data,
	})
}

func extractStringPath(data map[string]interface{}, paths ...string) string {
	for _, path := range paths {
		parts := strings.Split(path, ".")
		var curr interface{} = data
		found := true
		for _, part := range parts {
			if m, ok := curr.(map[string]interface{}); ok {
				curr = m[part]
			} else {
				found = false
				break
			}
		}
		if found {
			if s, ok := curr.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func handleGetPresentationRecordByID(c *gin.Context) {
	presentationID := c.Param("presentation_id")
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resBytes, statusCode, err := client.DoRequest(c.Request.Context(), "GET", fmt.Sprintf("/oid4vp/presentation/%s", presentationID), nil, nil)
	if err != nil || statusCode >= 400 {
		c.JSON(statusCode, gin.H{"error": formatErrorMsg(err, resBytes)})
		return
	}

	var respData interface{}
	_ = json.Unmarshal(resBytes, &respData)
	c.JSON(http.StatusOK, respData)
}

func handleDeletePresentationRecord(c *gin.Context) {
	presentationID := c.Param("presentation_id")
	client, _, err := getAcapyClient(c.Request.Context(), nil)
	if err == nil {
		_, _, _ = client.DoRequest(c.Request.Context(), "DELETE", fmt.Sprintf("/oid4vp/presentation/%s", presentationID), nil, nil)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"presentation_id": presentationID,
	})
}
