#!/usr/bin/env bash
# 镜像构建入口：从本机（arm64 Mac）交叉构建多架构镜像并推送到 Docker Hub
# 用法：在仓库根执行 ./build.sh
#
# 为什么需要它：Mac 上不写 --platform 的 docker build 产出 arm64，
# x86 云服务器 pull 会报 no matching manifest / 运行报 exec format error。
#
# 为什么不用 `buildx build --push`（多架构一步推）：
#   buildkit 向 auth.docker.io 取 oauth token 时不走任何代理（已知上游问题），
#   国内 DNS 污染 auth.docker.io 的情况下必超时。见 memory/docker-build-proxy.md。
#   所以改为三步：
#     1) 每个架构单独 --load 到本地（走 daemon，可用 Docker Desktop 代理）
#     2) docker push 推单架构标签（同上，走 daemon 代理）
#     3) docker manifest create/push 合成多架构 manifest list（CLI 进程，
#        吃 shell 的 https_proxy 环境变量）
#   产物与 buildx --push 完全等价（服务器拉到的是同一个 manifest list）。
#
# 可覆盖的环境变量：
#   ARCHES      默认 amd64 arm64（只发 x86 可设为 amd64）
#   DOCKER_USER 默认取 apps/server/.env
#   IMAGE_TAG   默认取 apps/server/.env
#   HTTP_PROXY_URL  manifest 步骤用的代理，默认 http://127.0.0.1:7897
set -euo pipefail

cd "$(dirname "$0")"

read_env() {
  # $1=key，从 apps/server/.env 读取；文件不存在或键缺失则输出空
  [ -f apps/server/.env ] || return 0
  sed -n "s/^$1=//p" apps/server/.env | tail -1
}

DOCKER_USER=${DOCKER_USER:-$(read_env DOCKER_USER)}
IMAGE_TAG=${IMAGE_TAG:-$(read_env IMAGE_TAG)}
ARCHES=${ARCHES:-"amd64 arm64"}
HTTP_PROXY_URL=${HTTP_PROXY_URL:-http://127.0.0.1:7897}

[ -n "$DOCKER_USER" ] || { echo "DOCKER_USER 未设置（apps/server/.env 中缺失）"; exit 1; }
[ -n "$IMAGE_TAG" ] || { echo "IMAGE_TAG 未设置（apps/server/.env 中缺失）"; exit 1; }

echo "构建版本：$IMAGE_TAG    架构：$ARCHES"

# 交叉构建依赖 QEMU：构建机支持的平台里必须包含目标架构
# （ls 可能因本机存在失效的 builder 而返回非零，仅作信息展示，不阻断）
docker buildx ls || true

build_and_push() {
  local name=$1 dockerfile=$2
  echo "---- $name ----"
  local image="$DOCKER_USER/react-docker-$name:$IMAGE_TAG"

  # 1+2) 逐架构构建到本地并推送单架构标签
  local arch arch_tags=()
  for arch in $ARCHES; do
    local arch_tag="$image-$arch"
    # --provenance=false：去掉 attestation manifest，避免 docker manifest create
    # 报 "no matching manifest for ... in the manifest list"
    docker buildx build \
      --builder desktop-linux \
      --platform "linux/$arch" \
      --provenance=false \
      -t "$arch_tag" \
      -f "$dockerfile" \
      --load \
      .
    docker push "$arch_tag"
    arch_tags+=("$arch_tag")
  done

  # 3) 合成并推送多架构 manifest list（CLI 侧，需要代理）
  # 注意：zsh 不会对未加引号的变量做分词，必须用 "${arr[@]}" 展开数组
  env https_proxy="$HTTP_PROXY_URL" http_proxy="$HTTP_PROXY_URL" \
    docker manifest rm "$image" 2>/dev/null || true
  env https_proxy="$HTTP_PROXY_URL" http_proxy="$HTTP_PROXY_URL" \
    docker manifest create "$image" "${arch_tags[@]}"
  env https_proxy="$HTTP_PROXY_URL" http_proxy="$HTTP_PROXY_URL" \
    docker manifest push "$image"
}

build_and_push server apps/server/Dockerfile
build_and_push web apps/web/Dockerfile
build_and_push gateway gateway/Dockerfile

echo "✅ 构建并推送完成：$DOCKER_USER/react-docker-{server,web,gateway}:$IMAGE_TAG"
echo "验证（manifest 步骤需代理；国内网络可在服务器上 inspect）："
echo "  docker buildx imagetools inspect $DOCKER_USER/react-docker-server:$IMAGE_TAG"
