package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type AcapyClient struct {
	BaseURL     string
	BearerToken string
	AdminAPIKey string
	HTTPClient  *http.Client
}

func getAcapyClient(ctx context.Context, customConfig *Config) (*AcapyClient, *Config, error) {
	var cfg *Config
	var err error
	if customConfig != nil {
		cfg = customConfig
	} else {
		cfg, err = getActiveConfig(ctx)
		if err != nil {
			return nil, nil, err
		}
	}

	baseURL := strings.TrimRight(cfg.AcapyURL, "/")
	token := cfg.BearerToken
	if strings.HasPrefix(strings.ToLower(token), "bearer ") {
		token = strings.TrimSpace(token[7:])
	}

	client := &http.Client{
		Timeout: 15 * time.Second,
	}

	return &AcapyClient{
		BaseURL:     baseURL,
		BearerToken: token,
		AdminAPIKey: cfg.AdminAPIKey,
		HTTPClient:  client,
	}, cfg, nil
}

func (c *AcapyClient) DoRequest(ctx context.Context, method, path string, body interface{}, headers map[string]string) ([]byte, int, error) {
	url := c.BaseURL + path
	var bodyReader io.Reader
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		bodyReader = bytes.NewReader(jsonBytes)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
	if err != nil {
		return nil, 0, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if c.BearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.BearerToken)
	}
	if c.AdminAPIKey != "" {
		req.Header.Set("X-API-Key", c.AdminAPIKey)
	}

	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}

	return respBytes, resp.StatusCode, nil
}

func formatErrorMsg(err error, rawBody []byte) string {
	if rawBody != nil && len(rawBody) > 0 {
		var obj map[string]interface{}
		if jsonErr := json.Unmarshal(rawBody, &obj); jsonErr == nil {
			if msg, ok := obj["message"].(string); ok {
				return msg
			}
			if msg, ok := obj["error"].(string); ok {
				return msg
			}
			return string(rawBody)
		}
		return string(rawBody)
	}
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "connection refused") || strings.Contains(errMsg, "ECONNREFUSED") {
			return fmt.Sprintf("%s. TIP: If the app is running in Docker and ACA-Py is running on your host machine, 'localhost' refers to the container. Use 'http://host.docker.internal:3001' (or host IP) instead.", errMsg)
		}
		return errMsg
	}
	return "Unknown error"
}
