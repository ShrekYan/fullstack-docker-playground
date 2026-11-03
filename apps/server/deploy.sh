#!/usr/bin/env bash
# server 部署：从 Hub 拉镜像部署，禁止本机 build
# 版本号由根目录 deploy.sh 统一推导并写入 .env，此脚本只做拉起和验证
set -euo pipefail

cd "$(dirname "$0")"

if [ -z "${IMAGE_TAG:-}" ]; then
  echo "IMAGE_TAG 未设置，请从仓库根目录运行 ./deploy.sh"
  exit 1
fi

echo "server：部署版本 $IMAGE_TAG"

docker compose --profile prod pull
docker compose --profile prod up -d --wait

docker compose --profile prod ps                   # 验证容器 healthy
