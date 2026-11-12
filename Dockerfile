# Debian-based image: native modules such as DuckDB need glibc (Alpine uses musl).
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY server/package.json server/package-lock.json* ./server/

# Install dependencies
WORKDIR /app/server
RUN npm install --omit=dev

# Copy all app files
WORKDIR /app
COPY . .

# Create backups directory
RUN mkdir -p /app/backups

# Expose port
EXPOSE 3000

# Health check (node is always present; slim images have no wget/curl)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3000/metrics').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entrypoint script handles first-run setup
WORKDIR /app/server
COPY server/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "server.js"]
