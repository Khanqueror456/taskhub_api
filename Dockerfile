# syntax=docker/dockerfile:1
ARG NODE_VERSION=22

# ---- base: Node, plus OpenSSL which Prisma's migration engine needs ----
FROM node:${NODE_VERSION}-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# ---- build: all dependencies, compile TypeScript ----
FROM base AS build
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# ---- prod-deps: only what the running app needs ----
FROM base AS prod-deps
ARG DATABASE_URL="postgresql://build:build@localhost:5432/build"
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runner: the final image ----
FROM base AS runner
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
# Copy Prisma CLI + engines from build so `prisma migrate deploy` works without devDependencies
COPY --from=build --chown=node:node /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=node:node /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/server.js"]