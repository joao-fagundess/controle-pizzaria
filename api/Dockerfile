# Compila TypeScript e mantém apenas dependências de execução na imagem final.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts/database.mjs scripts/database.d.mts ./scripts/
RUN npm run build

FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY scripts/database.mjs ./scripts/
COPY migrations ./migrations
COPY contracts ./contracts
COPY seeds ./seeds
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
