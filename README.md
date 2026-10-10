# Kktv

Kktv 是一个本地优先的 AI 视频与短剧创作工作台

项目重点：

- 画布式视频创作与节点工作流
- 图片、视频、音频、文本模型渠道
- 素材库、项目库、异步任务与时间线
- 支持自定义模型服务与第三方 API
- 支持火山方舟 / Seedance / Seedream 等兼容渠道
- 可本地构建 Docker 镜像，不依赖上游运行镜像

## 本地运行

```bash
docker compose -p kktv-deploy -f docker-compose.local.yml up -d --build
```

默认地址：

```text
Web:      http://localhost:3000
Backend:  http://127.0.0.1:8080
```

## 开发

前端：

```text
web/
```

后端：

```text
backend/
```

桌面端相关配置位于：

```text
backend/cmd/desktop/
```

## 火山方舟 / Seedance

Kktv 源码包含火山方舟相关接入能力。使用时在模型渠道中配置自己的：

```text
Ark API Key
Ark Base URL
Model ID
```

模型请求直接使用你自己的火山账号，不经过上游开发者。

## 独立部署

Kktv 建议始终从本仓库源码构建自己的镜像：

```bash
docker compose -p kktv-deploy -f docker-compose.local.yml up -d --build
```

不要依赖上游的 `latest` 镜像。生产环境应固定自己的镜像标签，并保留自己的数据卷。

