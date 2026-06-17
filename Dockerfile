# Stage 1: Base/Dev
FROM node:22-slim AS base

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose the API and Vite ports
EXPOSE 3001 5173

# Stage 2: Build
FROM base AS build

# Build the frontend
RUN npm run build

# Build the server
RUN echo '{"compilerOptions": {"target": "esnext", "module": "esnext", "moduleResolution": "node", "outDir": "./dist-server", "skipLibCheck": true, "allowSyntheticDefaultImports": true, "rootDir": "./server"}, "include": ["server/**/*"]}' > tsconfig.server.json
RUN npx tsc -p tsconfig.server.json

# Stage 3: Runtime
FROM node:22-slim AS runtime

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend and built server
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# Expose the API port
EXPOSE 3001

# Default environment variables
ENV API_PORT=3001
ENV NODE_ENV=production

# Start the server using node
CMD ["node", "dist-server/index.js"]
