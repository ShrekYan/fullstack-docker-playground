# 网关镜像：只装一份 nginx.conf，不托管任何静态文件
FROM nginx:1.28.0-alpine3.21

COPY gateway/nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080 8081

CMD ["nginx", "-g", "daemon off;"]
