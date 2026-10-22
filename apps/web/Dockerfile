# ---- 构建阶段：编译前端 ----
FROM node:24-alpine3.22 AS build

WORKDIR /app

# monorepo 关键：pnpm 安装需要根 package.json、workspace 清单、lock 文件
# 以及所有 workspace 的 package.json 都在场
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
# corepack 按 packageManager 字段（pnpm@10.15.0）启用对应版本，保证与本地一致
# 国内网络：corepack 下载 pnpm 本体与 pnpm 安装依赖均走 npmmirror 镜像源
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=https://registry.npmmirror.com
RUN corepack enable && pnpm install --frozen-lockfile

COPY apps/web apps/web
RUN pnpm --filter ./apps/web build

# ---- 运行阶段：nginx 托管静态文件并反代 /api ----
FROM nginx:1.28.0-alpine3.21

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
