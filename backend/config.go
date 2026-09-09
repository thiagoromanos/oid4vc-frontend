package main

import (
	"context"
	"log"
	"os"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var mongoClient *mongo.Client
var db *mongo.Database

// ActiveTenant represents active tenant subwallet details.
type ActiveTenant struct {
	WalletID   string    `bson:"wallet_id" json:"wallet_id"`
	WalletName string    `bson:"wallet_name" json:"wallet_name"`
	Label      string    `bson:"label" json:"label"`
	Token      string    `bson:"token" json:"token"`
	CreatedAt  time.Time `bson:"created_at" json:"created_at"`
}

// Config represents global system configuration saved in MongoDB.
type Config struct {
	ID                   primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	Key                  string             `bson:"key" json:"key"`
	AcapyURL             string             `bson:"acapyUrl" json:"acapyUrl"`
	BearerToken          string             `bson:"bearerToken" json:"bearerToken"`
	AdminAPIKey          string             `bson:"adminApiKey" json:"adminApiKey"`
	ActiveTenant         *ActiveTenant      `bson:"activeTenant,omitempty" json:"activeTenant,omitempty"`
	AuthServerURL        string             `bson:"authServerUrl" json:"authServerUrl"`
	AuthServerAdminToken string             `bson:"authServerAdminToken" json:"authServerAdminToken"`
	AuthServerPublicURL  string             `bson:"authServerPublicUrl" json:"authServerPublicUrl"`
	AuthServerPrivateURL string             `bson:"authServerPrivateUrl" json:"authServerPrivateUrl"`
	TenantSecret         string             `bson:"tenantSecret" json:"tenantSecret"`
	UpdatedAt            time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// SupportedCredential represents OID4VCI supported credential definition.
type SupportedCredential struct {
	ID                                  primitive.ObjectID     `bson:"_id,omitempty" json:"_id,omitempty"`
	SupportedCredID                     string                 `bson:"supported_cred_id" json:"supported_cred_id"`
	Identifier                          string                 `bson:"identifier" json:"identifier"`
	VCT                                 string                 `bson:"vct" json:"vct"`
	Format                              string                 `bson:"format" json:"format"`
	SDList                              []string               `bson:"sd_list" json:"sd_list"`
	CryptographicBindingMethodsSupported []string               `bson:"cryptographic_binding_methods_supported" json:"cryptographic_binding_methods_supported"`
	CredentialSigningAlgValuesSupported []string               `bson:"credential_signing_alg_values_supported" json:"credential_signing_alg_values_supported"`
	CredentialMetadata                  map[string]interface{} `bson:"credential_metadata" json:"credential_metadata"`
	RawRecord                           interface{}            `bson:"raw_record,omitempty" json:"raw_record,omitempty"`
	CreatedAt                           time.Time              `bson:"createdAt" json:"createdAt"`
	UpdatedAt                           time.Time              `bson:"updatedAt" json:"updatedAt"`
}

// ExchangeRecord represents credential issuance exchange history.
type ExchangeRecord struct {
	ID                primitive.ObjectID     `bson:"_id,omitempty" json:"_id,omitempty"`
	ExchangeID        string                 `bson:"exchange_id" json:"exchange_id"`
	SupportedCredID   string                 `bson:"supported_cred_id" json:"supported_cred_id"`
	CredentialSubject map[string]interface{} `bson:"credential_subject" json:"credential_subject"`
	CredentialOffer   string                 `bson:"credential_offer" json:"credential_offer"`
	OfferData         interface{}            `bson:"offer_data" json:"offer_data"`
	RawRecord         interface{}            `bson:"raw_record,omitempty" json:"raw_record,omitempty"`
	CreatedAt         time.Time              `bson:"createdAt" json:"createdAt"`
}

// DidRecord represents ACA-Py wallet DIDs.
type DidRecord struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"_id,omitempty"`
	DID       string             `bson:"did" json:"did"`
	Method    string             `bson:"method" json:"method"`
	KeyType   string             `bson:"key_type" json:"key_type"`
	Verkey    string             `bson:"verkey" json:"verkey"`
	Posture   string             `bson:"posture" json:"posture"`
	Metadata  interface{}        `bson:"metadata" json:"metadata"`
	RawRecord interface{}        `bson:"raw_record,omitempty" json:"raw_record,omitempty"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

// PresentationDef represents OID4VP presentation definitions.
type PresentationDef struct {
	ID        primitive.ObjectID     `bson:"_id,omitempty" json:"_id,omitempty"`
	PresDefID string                 `bson:"pres_def_id" json:"pres_def_id"`
	Name      string                 `bson:"name" json:"name"`
	Purpose   string                 `bson:"purpose" json:"purpose"`
	PresDef   map[string]interface{} `bson:"pres_def" json:"pres_def"`
	RawRecord interface{}            `bson:"raw_record,omitempty" json:"raw_record,omitempty"`
	CreatedAt time.Time              `bson:"createdAt" json:"createdAt"`
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// initDB connects to MongoDB using MONGODB_URI.
func initDB(uri string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	clientOpts := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return err
	}

	if err := client.Ping(ctx, nil); err != nil {
		return err
	}

	mongoClient = client
	db = client.Database("oid4vci")
	log.Printf("Connected to MongoDB at %s", uri)
	return nil
}

// getActiveConfig finds or creates the single global_config document.
func getActiveConfig(ctx context.Context) (*Config, error) {
	coll := db.Collection("configs")
	var config Config

	envAcapyURL := getEnv("ACAPY_URL", "http://localhost:8021")
	envBearerToken := getEnv("BEARER_TOKEN", "")
	envAuthServerURL := getEnv("AUTH_SERVER_URL", "")
	envAuthServerAdminToken := getEnv("AUTH_SERVER_ADMIN_TOKEN", "")
	envAuthServerPublicURL := getEnv("AUTH_SERVER_PUBLIC_URL", "")
	envAuthServerPrivateURL := getEnv("AUTH_SERVER_PRIVATE_URL", "")
	envTenantSecret := getEnv("TENANT_SECRET", "")

	err := coll.FindOne(ctx, bson.M{"key": "global_config"}).Decode(&config)
	if err == mongo.ErrNoDocuments {
		config = Config{
			Key:                  "global_config",
			AcapyURL:             envAcapyURL,
			BearerToken:          envBearerToken,
			AuthServerURL:        envAuthServerURL,
			AuthServerAdminToken: envAuthServerAdminToken,
			AuthServerPublicURL:  envAuthServerPublicURL,
			AuthServerPrivateURL: envAuthServerPrivateURL,
			TenantSecret:         envTenantSecret,
			UpdatedAt:            time.Now(),
		}
		res, err := coll.InsertOne(ctx, config)
		if err != nil {
			return nil, err
		}
		if oid, ok := res.InsertedID.(primitive.ObjectID); ok {
			config.ID = oid
		}
		return &config, nil
	} else if err != nil {
		return nil, err
	}

	// Apply env var defaults for any field currently blank in the DB
	dirty := false
	if config.AuthServerURL == "" && envAuthServerURL != "" {
		config.AuthServerURL = envAuthServerURL
		dirty = true
	}
	if config.AuthServerAdminToken == "" && envAuthServerAdminToken != "" {
		config.AuthServerAdminToken = envAuthServerAdminToken
		dirty = true
	}
	if config.AuthServerPublicURL == "" && envAuthServerPublicURL != "" {
		config.AuthServerPublicURL = envAuthServerPublicURL
		dirty = true
	}
	if config.AuthServerPrivateURL == "" && envAuthServerPrivateURL != "" {
		config.AuthServerPrivateURL = envAuthServerPrivateURL
		dirty = true
	}
	if config.TenantSecret == "" && envTenantSecret != "" {
		config.TenantSecret = envTenantSecret
		dirty = true
	}

	if dirty {
		config.UpdatedAt = time.Now()
		_, _ = coll.UpdateOne(ctx, bson.M{"_id": config.ID}, bson.M{"$set": config})
	}

	return &config, nil
}
