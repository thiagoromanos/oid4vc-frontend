# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Setup Backend Server & Serve Frontend
FROM node:20-alpine
WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend assets to backend/dist location
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000
ENV MONGODB_URI=mongodb://mongodb:27017/oid4vci

CMD ["node", "backend/server.js"]
