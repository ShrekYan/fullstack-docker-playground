# stage 1: build the app
FROM node:24-alpine3.22 AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# RUN npm ci 用于安装lockfile中的依赖
RUN npm ci

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

COPY . .
RUN npm run build

# stage 2: Serve with nginx 
FROM nginx:1.28.0-alpine3.21
COPY --from=build /app/dist /usr/share/nginx/html

# nginx.conf /etc/nginx/nginx.conf 用于配置nginx的代理设置
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]



