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

# Create backups directory
RUN mkdir -p /app/backups

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/metrics || exit 1

# Entrypoint script handles first-run setup
WORKDIR /app/server
COPY server/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
