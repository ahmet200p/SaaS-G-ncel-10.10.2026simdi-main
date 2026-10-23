# ==============================================================================
# Multi-Tenant B2B Yedek Parça SaaS - Production Dockerfile
# Node.js 20 Alpine - Güvenli, Hafif ve Optimize Edilmiş İmaj
# ==============================================================================

FROM node:20-alpine AS base

# Temel sistem bağımlılıkları (OpenSSL, Prisma için gereklidir)
RUN apk add --no-cache openssl libc6-compat

WORKDIR /usr/src/app

# Bağımlılık dosyalarını kopyala
COPY package*.json ./
COPY prisma ./prisma/

# Bağımlılıkları yükle ve Prisma istemcisini üret
RUN npm ci --omit=dev --ignore-scripts && npx prisma generate

# Uygulama kaynak kodlarını kopyala
COPY . .

# Güvenlik: Uygulamayı root yerine yetkisiz 'node' kullanıcısıyla çalıştır
USER node

# Port Tanımlaması
EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Sağlık Kontrolü (Docker Healthcheck)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:5000/api/health || exit 1

# Sunucuyu Başlat
CMD ["node", "server.js"]
