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

# 生产镜像
FROM node:18.20-slim AS production

WORKDIR /home

COPY --from=builder /home/package*.json ./
COPY --from=builder /home/yarn.lock ./

# 复制已编译好的 node_modules
COPY --from=builder /home/node_modules ./node_modules

# 复制源码和构建产物（src/index.js 需要 src 目录）
COPY --from=builder /home/src ./src
COPY --from=builder /home/dist ./dist
COPY --from=builder /home/vender ./vender

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

# 使用正确的入口文件
CMD ["node", "src/index.js"]
