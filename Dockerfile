FROM node:24.19.0-bookworm-slim AS frontend-builder

WORKDIR /build/frontend

COPY ./frontend/package.json ./frontend/package-lock.json ./
RUN npm ci

COPY ./frontend ./
RUN npm run build

FROM debian:bookworm-slim

ARG TRAEFIK_VERSION=3.7.10
ARG NODEJS_VERSION=24.19.0
ARG CONTAINARR_VERSION

LABEL org.opencontainers.image.version="${CONTAINARR_VERSION}"
ENV CONTAINARR_VERSION="${CONTAINARR_VERSION}"

# Install system dependencies
RUN apt-get update && \
    apt-get install -y curl git openssh-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Traefik
RUN ARCH=$(dpkg --print-architecture) && \
    curl -L https://github.com/traefik/traefik/releases/download/v${TRAEFIK_VERSION}/traefik_v${TRAEFIK_VERSION}_linux_${ARCH}.tar.gz -o traefik.tar.gz && \
    tar -xvzf traefik.tar.gz && \
    mv traefik /usr/local/bin/ && \
    rm traefik.tar.gz

# Install Node.js
RUN ARCH=$(dpkg --print-architecture) && \
    case "${ARCH}" in \
      amd64) NODE_ARCH=x64 ;; \
      arm64) NODE_ARCH=arm64 ;; \
      *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac && \
    curl -fL https://nodejs.org/dist/v${NODEJS_VERSION}/node-v${NODEJS_VERSION}-linux-${NODE_ARCH}.tar.gz -o node.tar.gz && \
    tar -xvzf node.tar.gz && \
    mv node-v${NODEJS_VERSION}-linux-${NODE_ARCH} /usr/local/node && \
    ln -s /usr/local/node/bin/node /usr/local/bin/node && \
    ln -s /usr/local/node/bin/npm /usr/local/bin/npm && \
    rm node.tar.gz

# Copy & Install Application
WORKDIR /app
COPY --from=frontend-builder /build/public /app/public
COPY ./lib /app/lib
COPY ./services /app/services
COPY ./server.mjs /app/server.mjs
COPY ./config.mjs /app/config.mjs
COPY ./package.json /app/package.json
COPY ./package-lock.json /app/package-lock.json

RUN npm ci

# Run the Application
CMD ["npm", "start"]
