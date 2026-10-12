# react-docker

Nx 单体仓库学习项目：React 19 + Vite 8 前端（`apps/web`）+ NestJS 后端（`apps/server`），
用于学习 Docker（dev 模式 HMR / prod 模式 nginx + node，compose 按应用独立管理）。

## 目录结构

```
├── nx.json              # Nx 配置（构建缓存）
├── package.json         # npm workspaces 根
├── Dockerfile.dev       # 共享开发镜像（command 由各自 compose 提供）
└── apps/
    ├── web/             # React + Vite 前端（compose.yaml + Dockerfile → nginx，含 /api 反代）
    └── server/          # NestJS 后端（compose.yaml + Dockerfile → node，GET /api/hello）
```

## 常用命令

```bash
# 本地开发（同时启动前后端）
npx nx run-many -t dev

# 单独启动
npm run dev -w apps/web
npm run dev -w apps/server

# 构建（Nx 自动缓存，第二次命中缓存）
npx nx run-many -t build

# 项目依赖图
npx nx graph
```

## Docker（compose 按应用独立管理）

api 和 web 各有独立的 compose 项目，通过显式同名网络 `react-docker-net` 互通，
可单独启停，无根 compose、无启动顺序要求。

```bash
# 后端（cd 进 apps/server）
cd apps/server
docker compose --profile dev up            # 开发：Nest watch
docker compose --profile prod up --build   # 生产

# 前端（cd 进 apps/web）
cd apps/web
docker compose --profile dev up            # 开发：Vite HMR
docker compose --profile prod up --build   # 生产：nginx + /api 反代

# 单独停止某一侧
cd apps/server && docker compose --profile prod down
```

> 完整环境 = 两个项目都 up；`curl localhost:8080/api/hello` 能通即证明跨 compose 网络（web 的 nginx → server 的别名 `api`）工作正常。

## 端口

| 端口 | 用途 |
|------|------|
| 5173 | 前端 dev（本地 / Docker） |
| 3000 | 后端 API（server 项目；prod 仅容器网络内，经 nginx 访问） |
| 8080 | 前端 prod（nginx） |

## 架构要点 / 学习点

- 前端始终请求相对路径 `/api/hello`，**无 CORS**：
  - dev：Vite `server.proxy`（目标由 `API_PROXY_TARGET` 环境变量控制）
  - prod：nginx `location /api { proxy_pass http://api:3000; }`
- **多 compose 项目互通**：两个 compose 文件都声明 `networks.default.name: react-docker-net`，
  谁先启动谁创建，后者自动加入；服务名/别名即容器 DNS。
- compose 相对路径（volumes）以 **compose 文件所在目录**为基准，不是仓库根（`../..:/app`）。
- 跨 compose 文件无法 `depends_on`；Vite proxy 按请求解析目标，后端晚启动无影响。
- Docker 内 `npm ci` 前必须复制**所有 workspace 的 package.json**（monorepo lockfile 要求）。
- Nest 监听 `0.0.0.0`，否则容器间无法通信。
- `.dockerignore`（原文件名 `.dockeringore` 是拼写错误，已修复）。
