# Stage 1: Build
FROM node:22-slim AS build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Build the server
# We compile server/index.ts into dist-server/index.js
RUN echo '{"compilerOptions": {"target": "esnext", "module": "esnext", "moduleResolution": "node", "outDir": "./dist-server", "skipLibCheck": true, "allowSyntheticDefaultImports": true, "rootDir": "./server"}, "include": ["server/**/*"]}' > tsconfig.server.json
RUN npx tsc -p tsconfig.server.json

# Stage 2: Runtime
FROM node:22-slim

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
