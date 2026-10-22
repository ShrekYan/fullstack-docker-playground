# ---- 构建阶段：编译 NestJS ----
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

COPY apps/server apps/server
RUN pnpm --filter ./apps/server build

# ---- 运行阶段：仅生产依赖 ----
FROM node:24-alpine3.22

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
# --filter ./apps/server... = server 及其 workspace 内部依赖；--prod 只装运行时依赖
# 三个环境变量均服务于下面的 pnpm 安装：
#   前两个：国内镜像源（corepack 下载 pnpm 本体 / pnpm 拉依赖包）
#   NODE_ENV：pnpm 只装生产依赖（与 --prod 方向一致）；
#             运行时让 app.module.ts 走生产日志分支（跳过 dev 专用 pino-pretty）
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=https://registry.npmmirror.com
ENV NODE_ENV=production
RUN corepack enable && pnpm --filter ./apps/server... install --frozen-lockfile --prod

COPY --from=build /app/apps/server/dist apps/server/dist

EXPOSE 3000

CMD ["node", "apps/server/dist/main.js"]
