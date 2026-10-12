# ---- 构建阶段：编译 NestJS ----
FROM node:24-alpine3.22 AS build

WORKDIR /app

# monorepo 关键：npm ci 需要根和所有 workspace 的 package.json 都在场
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci

COPY apps/server apps/server
RUN npm run build -w apps/server

# ---- 运行阶段：仅生产依赖 ----
FROM node:24-alpine3.22

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev

COPY --from=build /app/apps/server/dist apps/server/dist

EXPOSE 3000

CMD ["node", "apps/server/dist/main.js"]
