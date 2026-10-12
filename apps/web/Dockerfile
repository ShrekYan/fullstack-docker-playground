# ---- 构建阶段：编译前端 ----
FROM node:24-alpine3.22 AS build

WORKDIR /app

# monorepo 关键：npm ci 需要根和所有 workspace 的 package.json 都在场
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci

COPY apps/web apps/web
RUN npm run build -w apps/web

# ---- 运行阶段：nginx 托管静态文件并反代 /api ----
FROM nginx:1.28.0-alpine3.21

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
