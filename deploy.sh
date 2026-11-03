#!/usr/bin/env bash
# 全系统部署入口：统一版本（git tag）编排 server、web、gateway 三个项目
# 用法（部署机）：git checkout <tag> && ./deploy.sh
#
# 版本号只在这里推导一次，注入三个项目的 .env，子脚本不各自推导
# gateway 是唯一对外入口，nginx 配置变化不频繁：
# 镜像 digest 与当前运行容器一致时跳过重启，避免每次发版全站闪断
set -euo pipefail

cd "$(dirname "$0")"

# 版本号从 checkout 的 git tag 推导，三个项目共用同一个 IMAGE_TAG
IMAGE_TAG=$(git describe --tags --exact-match)
[ -n "$IMAGE_TAG" ] || { echo "不在 tag 上，禁止部署"; exit 1; }
export IMAGE_TAG
echo "部署版本：$IMAGE_TAG"

# 往 .env 写 KEY=VALUE：存在则原位更新，不存在则追加
# 注意：文件末行可能没有换行符，直接 >> 会拼到上一行，必须先补换行
upsert_env() {
  local file=$1 key=$2 value=$3
  if grep -q "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "$file.bak"
  else
    [ -n "$(tail -c 1 "$file")" ] && echo >> "$file"   # 末行无换行符则补一个
    echo "${key}=${value}" >> "$file"
  fi
}

# 确保三个项目的 .env 都有 DOCKER_USER 和当前 IMAGE_TAG
for dir in apps/server apps/web gateway; do
  [ -f "$dir/.env" ] || echo "DOCKER_USER=shreak" > "$dir/.env"
  upsert_env "$dir/.env" DOCKER_USER shreak
  upsert_env "$dir/.env" IMAGE_TAG "$IMAGE_TAG"
done

# ---------- 1. server ----------
./apps/server/deploy.sh

# ---------- 2. web ----------
./apps/web/deploy.sh

# ---------- 3. gateway（digest 比对，无变化不重启）----------
cd gateway

# compose 变量展开规则：${DOCKER_USER}/react-docker-gateway:${IMAGE_TAG}
DOCKER_USER=$(sed -n 's/^DOCKER_USER=//p' .env)
GATEWAY_IMAGE="$DOCKER_USER/react-docker-gateway:$IMAGE_TAG"

docker compose pull

# 运行中容器的镜像 ID（形如 sha256:...；容器不存在则为空）
RUNNING_ID=$(docker inspect --format '{{.Image}}' "$(docker compose ps -q gateway)" 2>/dev/null || true)
# pull 后本地镜像 ID
LOCAL_ID=$(docker images --no-trunc --format '{{.ID}}' "$GATEWAY_IMAGE")

if [ -n "$RUNNING_ID" ] && [ "$RUNNING_ID" = "$LOCAL_ID" ]; then
  echo "gateway 镜像无变化（${IMAGE_TAG}），跳过重启"
else
  echo "gateway 镜像有变化（或首次部署），重启网关"
  docker compose up -d --wait
fi

cd ../..

# ---------- 4. 全链路验证（经 gateway 入口）----------
docker compose --project-directory gateway ps
curl -fsS http://localhost:8081/api/v1/health/liveness   # 后端链路
curl -fsS -o /dev/null http://localhost:8080/            # 前端链路
echo "✅ 部署成功：${IMAGE_TAG}（server + web + gateway）"
