FROM node:20-alpine AS build
WORKDIR /app

COPY repository_dashboard_premium/package.json repository_dashboard_premium/package-lock.json* ./
COPY repository_dashboard_premium /app

ARG VITE_REPOSITORY_API_URL=http://localhost:8001
ENV VITE_REPOSITORY_API_URL="$VITE_REPOSITORY_API_URL"

RUN npm ci --silent
RUN npm run build --prefix /app

FROM busybox:1.36.1-glibc
WORKDIR /www
COPY --from=build /app/dist /www
EXPOSE 80
CMD ["busybox", "httpd", "-f", "-p", "80", "-h", "/www"]
