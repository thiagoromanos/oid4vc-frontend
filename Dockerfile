# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Go Backend
FROM golang:alpine AS backend-builder
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server .

# Stage 3: Final Runtime
FROM alpine:latest
WORKDIR /app

RUN apk add --no-cache ca-certificates

COPY --from=backend-builder /app/backend/server ./backend/server
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 5000

ENV PORT=5000
ENV MONGODB_URI=mongodb://mongodb:27017/oid4vci
ENV GIN_MODE=release

CMD ["./backend/server"]
