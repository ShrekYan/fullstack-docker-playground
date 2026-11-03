#!/usr/bin/env bash
# 查看容器状态：剥掉终端可能残留的环境变量，强制以 .env 为准
# 背景：shell 里若残留空的 IMAGE_TAG（如手动 export 过 git describe 结果），
#       会覆盖 .env 导致 compose 报 "IMAGE_TAG is missing a value"
cd "$(dirname "$0")"

env -u IMAGE_TAG -u DOCKER_USER docker compose --profile prod ps
