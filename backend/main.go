package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Attempt to load .env file if available
	_ = godotenv.Load()

	mongoURI := getEnv("MONGODB_URI", "mongodb://localhost:27017/oid4vci")
	port := getEnv("PORT", "5000")

	if err := initDB(mongoURI); err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}

	if getEnv("NODE_ENV", "") == "production" || getEnv("GIN_MODE", "") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()

	// CORS configuration matching express cors()
	router.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-API-Key"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// --- API ROUTES ---
	api := router.Group("/api")
	{
		// Config
		api.GET("/config", handleGetConfig)
		api.POST("/config", handlePostConfig)

		// Multitenancy
		api.POST("/multitenancy/create-tenant", handleCreateTenant)

		// DID Management
		api.POST("/did/create", handleCreateDid)
		api.GET("/did/records", handleGetDidRecords)
		api.POST("/did/set-public", handleSetPublicDid)

		// Supported Credentials
		api.POST("/credential-supported/create-sd-jwt", handleCreateSdJwtSupported)
		api.GET("/credential-supported/records", handleGetSupportedRecords)
		api.GET("/credential-supported/records/:supported_cred_id", handleGetSupportedRecordByID)

		// Exchange / Offers
		api.POST("/exchange/create", handleCreateExchange)
		api.GET("/credential-offer", handleGetCredentialOffer)
		api.GET("/exchange/records", handleGetExchangeRecords)

		// OID4VP
		api.POST("/dcql-query/create", handleCreateDcqlQuery)
		api.POST("/presentation-definition/create", handleCreatePresentationDef)
		api.POST("/presentation-request/create", handleCreatePresentationReq)
		api.GET("/presentation/records/:presentation_id", handleGetPresentationRecordByID)
		api.DELETE("/presentation/records/:presentation_id", handleDeletePresentationRecord)
	}

	// --- STATIC ASSETS SERVING FOR PRODUCTION ---
	frontendDist := "./frontend/dist"
	if _, err := os.Stat("../frontend/dist"); err == nil {
		frontendDist = "../frontend/dist"
	}

	if _, err := os.Stat(frontendDist); err == nil {
		log.Printf("Serving frontend static assets from %s", frontendDist)
		router.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if strings.HasPrefix(path, "/api") {
				c.JSON(http.StatusNotFound, gin.H{"error": "API endpoint not found"})
				return
			}
			filePath := filepath.Join(frontendDist, filepath.Clean(path))
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				c.File(filePath)
				return
			}
			c.File(filepath.Join(frontendDist, "index.html"))
		})
	}

	log.Printf("Go backend server listening on 0.0.0.0:%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Server failed to run: %v", err)
	}
}
