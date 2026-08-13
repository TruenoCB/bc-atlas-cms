ARG APP_VERSION=dev

FROM node:24-alpine AS web-build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.mjs ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
COPY worker ./worker
RUN npm run build

FROM golang:1.24-alpine AS api-build
ARG APP_VERSION
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY server ./server
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/bc-cms ./server/cmd/api

FROM alpine:3.22
ARG APP_VERSION
LABEL org.opencontainers.image.title="B.C Atlas CMS" \
      org.opencontainers.image.description="Self-hosted React and Go publishing application" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/bc-dev/bc-atlas-cms"
RUN apk add --no-cache ca-certificates tzdata && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=api-build /out/bc-cms /app/bc-cms
COPY --from=web-build /src/dist/client /app/web
USER app
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 CMD wget -q -O - http://127.0.0.1:8080/api/health >/dev/null || exit 1
ENTRYPOINT ["/app/bc-cms", "-web", "/app/web"]
