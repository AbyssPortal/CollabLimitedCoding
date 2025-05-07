FROM node:24.0-alpine3.20 AS base
WORKDIR /build

# Copy dependencies and install
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application files
COPY index.html styles.css code.js sha256.js run.html server.js ./
COPY acorn/acorn_interpreter.js acorn/acorn.js acorn/interpreter.js ./
COPY is_token.js atom-one-dark-reasonable.css ./
COPY refresh_config.json ./
COPY file_whitelist.txt ./
COPY make_root.js ./

# Expose the application port
EXPOSE 3000

# Add an entrypoint script to handle conditional execution
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Use the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]