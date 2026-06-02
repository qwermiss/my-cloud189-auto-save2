# 使用支持 ARMv7 的 Node 18
FROM node:18.20-slim AS builder

WORKDIR /home
COPY . .

# 安装编译依赖
RUN apt-get update && apt-get install -y \
    python3 \
    python3-distutils \
    make \
    g++ \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 安装 cloud189-sdk 依赖
RUN cd vender/cloud189-sdk && \
    yarn install && \
    yarn build

# 安装项目依赖并构建
RUN yarn install && \
    yarn build

# 生产镜像 - 改用 slim 而不是 alpine，避免二进制不兼容
FROM node:18.20-slim AS production

WORKDIR /home

COPY --from=builder /home/package*.json ./
COPY --from=builder /home/yarn.lock ./

# 复制已编译好的 node_modules（关键：避免重新编译 sqlite3）
COPY --from=builder /home/node_modules ./node_modules

# 复制构建产物
COPY --from=builder /home/dist ./dist
COPY --from=builder /home/src/public ./dist/public
COPY --from=builder /home/vender/cloud189-sdk/dist ./vender/cloud189-sdk/dist

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    ca-certificates \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Shanghai
RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

# 创建目录
RUN mkdir -p /home/data /home/strm

VOLUME ["/home/data", "/home/strm"]
EXPOSE 3000

CMD ["node", "dist/main.js"]
