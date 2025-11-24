# ================================================
# FASE 1 — BUILDER (compila Next + Prisma)
# ================================================
FROM node:20-alpine AS builder
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

WORKDIR /app

# Installa dipendenze di sistema per Prisma
RUN apk add --no-cache openssl

# Copia package.json, package-lock.json (se esistono) e prisma
COPY package*.json ./
COPY prisma ./prisma

# Installa le dipendenze
RUN npm install

# Copia tutto il progetto
COPY . .

# Genera Prisma Client
RUN npx prisma generate

# Build di Next.js (usa output: "standalone")
RUN npm run build


# ================================================
# FASE 2 — RUNNER (runtime leggero)
# ================================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Installa solo deps di produzione
COPY package*.json ./
RUN npm install --omit=dev

# Copia il bundle standalone
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080

# Next standalone viene lanciato tramite server.js
CMD ["node", "server.js"]
