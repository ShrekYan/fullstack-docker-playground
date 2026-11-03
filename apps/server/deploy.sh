#!/usr/bin/env bash
# 部署脚本：只允许在 git tag 上，从 Hub 拉镜像部署，禁止本机 build
# 用法（部署机）：git checkout <tag> && ./deploy.sh
set -euo pipefail

# 切到脚本所在目录（apps/server），保证 compose 找得到 compose.yaml
cd "$(dirname "$0")"

# 部署机缺 .env 时自动创建最小配置（compose 需要 DOCKER_USER）
if [ ! -f .env ]; then
  echo "DOCKER_USER=shreak" > .env
  echo "未找到 .env，已创建默认配置（DOCKER_USER=shreak）"
fi

# 版本号从 checkout 的 git tag 推导——这就是"部署机不手填版本"的机制
export IMAGE_TAG=$(git describe --tags --exact-match)   # 在 tag 上输出版本号；在 main 上输出为空
[ -n "$IMAGE_TAG" ] || { echo "不在 tag 上，禁止部署"; exit 1; }

echo "部署版本：$IMAGE_TAG"

docker compose --profile prod pull                 # 从 Hub 拉（不 build！）
docker compose --profile prod up -d --wait         # 按镜像起服务，等 healthcheck 通过

docker compose --profile prod ps                   # 验证容器 healthy
curl -fsS http://localhost:8081/api/v1/health/liveness   # 验证网关链路
echo "✅ 部署成功：$IMAGE_TAG"
