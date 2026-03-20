# Build UI + server, then prune devDependencies for a small runtime image.
FROM node:20-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json ./
COPY gwire/server/package.json gwire/server/package.json
COPY gwire/web/package.json gwire/web/package.json

RUN npm ci

COPY spec ./spec
COPY gwire ./gwire

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "gwire/server/dist/index.js"]
