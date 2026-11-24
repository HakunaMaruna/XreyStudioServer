FROM node:20-alpine

# Xray сам запускается внутри контейнера агента (managed-режим), поэтому
# бинарник нужен прямо в образе. TARGETARCH задаётся BuildKit автоматически.
ARG TARGETARCH
RUN apk add --no-cache curl unzip ca-certificates \
 && case "${TARGETARCH:-amd64}" in \
      amd64) XARCH=64 ;; \
      arm64) XARCH=arm64-v8a ;; \
      armv7*) XARCH=arm32-v7a ;; \
      *) XARCH=64 ;; \
    esac \
 && curl -fsSL "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-${XARCH}.zip" -o /tmp/xray.zip \
 && unzip -o /tmp/xray.zip -d /usr/local/bin xray geoip.dat geosite.dat \
 && chmod 0755 /usr/local/bin/xray \
 && rm -f /tmp/xray.zip \
 && xray version | head -1

ENV XRAY_BIN=/usr/local/bin/xray \
    XRAY_LOCATION_ASSET=/usr/local/bin/ \
    XRAY_MANAGED=true \
    XRAY_STATS_ENABLED=true

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 9090
CMD ["node", "src/index.js"]
