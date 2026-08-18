FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY server/package.json server/package-lock.json* ./server/

# Install dependencies
WORKDIR /app/server
RUN npm install --production

# Copy all app files
WORKDIR /app
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/auth/me || exit 1

# Start server
WORKDIR /app/server
CMD ["node", "server.js"]
