# Gera assets estáticos e usa Nginx para servir a interface e encaminhar a API na mesma origem.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --chmod=755 nginx/15-validate-token.sh /docker-entrypoint.d/15-validate-token.sh
RUN rm -f /etc/nginx/conf.d/default.conf && chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
