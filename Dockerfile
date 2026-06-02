# 使用支持 ARMv7 的 Node 18 LTS（更稳定）
FROM node:18.20-slim AS builder

WORKDIR /home
COPY . .

# 安装 cloud189-sdk 依赖
RUN cd vender/cloud189-sdk && \
    yarn install --frozen-lockfile && \
    yarn build

# 安装项目依赖并构建
RUN yarn install --frozen-lockfile && \
    yarn build

# 生产镜像
FROM node:18.20-alpine AS production

WORKDIR /home

COPY --from=builder /home/package*.json ./
COPY --from=builder /home/yarn.lock ./

# 安装生产依赖
RUN yarn install --production --frozen-lockfile

# 复制构建产物
COPY --from=builder /home/dist ./dist
COPY --from=builder /home/src/public ./dist/public
COPY --from=builder /home/vender/cloud189-sdk/dist ./vender/cloud189-sdk/dist

# 安装运行时依赖
RUN apk add --no-cache ca-certificates tzdata

ENV TZ=Asia/Shanghai
RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# 创建目录
RUN mkdir -p /home/data /home/strm

VOLUME ["/home/data", "/home/strm"]
EXPOSE 3000

CMD ["node", "dist/main.js"]
