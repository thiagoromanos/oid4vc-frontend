# Build the Go backend.
FROM golang:1.25-alpine AS builder

WORKDIR /src
COPY backend/go.mod backend/go.sum ./backend/
RUN cd backend && go mod download

COPY backend/ ./backend/
RUN cd backend && CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /server .

# Run the backend API.
FROM alpine:latest

WORKDIR /app
RUN apk add --no-cache ca-certificates curl jq

COPY --from=builder /server ./server
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 5000

ENV PORT=5000
ENV MONGODB_URI=mongodb://mongodb:27017/oid4vci
ENV GIN_MODE=release

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["/app/server"]
