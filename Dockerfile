
FROM node:20-alpine AS builder
ARG DATABASE_URL
ENV DATABASE_URL=${DATABASE_URL}

WORKDIR /app


RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma

RUN npm install

COPY . .

RUN npx prisma generate

RUN npm run build


FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080


COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080

CMD ["node", "server.js"]
