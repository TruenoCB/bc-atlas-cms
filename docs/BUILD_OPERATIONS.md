
# B.C Atlas CMS：构建、目录、维护与部署手册

本文记录 B.C Atlas CMS 在 `nas-vm-1` 上的实际构建结果，以及从源码到容器运行的完整流程。密码、访问令牌和私有配置不写入本文档、Dockerfile 或镜像。

## 1. 当前构建结果

编译机上的项目目录：

~~~text
/home/truenocb/my/codes/projects/bc-atlas-cms
~~~

当前已构建的镜像：

| 镜像 | 用途 | 版本 |
| --- | --- | --- |
| `bc-atlas-cms-base:2026.08.12` | MySQL、MinIO、Node、Go 和构建工具的公共基础镜像 | MySQL 8.4.11、Node 24.18.1、Go 1.24.8 |
| `bc-atlas-cms-all-in-one:2026.08.16` | 单容器运行 B.C、MySQL、MinIO | 当前应用构建 |

基础镜像还保存了 MinIO 对应的源码归档和许可证：

~~~text
/usr/share/minio/source.tar.gz
/usr/share/licenses/minio/LICENSE
/etc/bc-base-release
~~~

MinIO 使用固定源码提交构建，避免使用不可追踪的浮动版本。由于该社区仓库已经归档，长期公网部署建议将 S3 换成仍在维护的兼容服务；应用不需要修改，只需修改 S3 环境变量。

## 2. 整体架构

### 推荐的三容器模式

~~~text
公网 / 内网穿透 / 外部 Nginx
              │
              ▼
       app :8080
       ├── Go API、React 静态资源、RSS、/media
       │        │              │
       │        ▼              ▼
       │     MySQL 8.4       MinIO/S3
       │     /var/lib/mysql  /data
~~~

应用、MySQL、MinIO 分别拥有自己的容器、健康检查和数据卷，适合长期运行、独立升级和独立备份。

### All-in-One 模式

~~~text
bc-atlas-cms-all-in-one
├── /app/bc-cms       Go 应用
├── /app/bc-content-storage  正文迁移/索引/校验工具
├── /app/web          编译后的 React/Vite 前端
├── mysqld            MySQL 8.4
├── minio             S3 兼容对象存储
└── /data
    ├── mysql
    └── minio
~~~

All-in-One 适合个人 NAS、单节点服务器和内网穿透。三个服务共享同一个容器生命周期，不适合高可用和水平扩展。

## 3. 仓库目录结构

~~~text
bc-atlas-cms/
├── src/                         React 页面、组件和模块
│   └── modules/                 前端模块注册和扩展入口
├── public/assets/               本地图片、字体及静态资源
├── server/
│   ├── cmd/api/                 Go 服务入口
│   └── internal/
│       ├── domain/              内容、知识库、用户、标签规则
│       ├── auth/                密码哈希和会话
│       ├── httpapi/             HTTP、RSS、静态资源
│       ├── store/                内存/MySQL 存储和迁移
│       └── media/               S3/MinIO 适配器
├── worker/                      Sites 构建所需的本地 worker
├── scripts/                     构建、验证、初始化和部署脚本
├── deploy/                      入口、健康检查和可选 Nginx 配置
├── Dockerfile                   三容器模式的应用镜像
├── Dockerfile.base              MySQL + Node + Go + 源码 MinIO 基础镜像
├── Dockerfile.all-in-one        单容器应用镜像
├── docker-compose.yml           推荐的三容器编排
├── docker-compose.middleware.yml 仅中间件编排
├── docker-compose.all-in-one.yml 单容器编排
├── docs/                        架构、数据库、扩展和运维文档
├── .env.example                 三容器配置模板
├── .env.middleware.example      中间件配置模板
└── .env.all-in-one.example     单容器配置模板
~~~

关键脚本：

~~~text
scripts/build-base-image.sh       构建基础镜像
scripts/build-image.sh            构建三容器应用镜像
scripts/build-all-in-one-image.sh 构建 All-in-One 镜像
scripts/deploy.sh                 三容器部署
scripts/deploy-all-in-one.sh      All-in-One 部署
scripts/middleware.sh             只运行 MySQL + MinIO
scripts/verify-base-image.sh      基础镜像检查
~~~

## 4. 构建流程

### 4.1 构建前检查

~~~bash
cd /home/truenocb/my/codes/projects/bc-atlas-cms
git status --short
npm ci
npm run build
npm run test:sites
go test ./...
docker compose --env-file .env.example config --quiet
docker compose --env-file .env.all-in-one.example \
  -f docker-compose.all-in-one.yml config --quiet
~~~

当前 `nas-vm-1` 的 `truenocb` 用户尚未直接获得 Docker Socket 权限，本次构建使用管理员权限完成。若日后希望普通用户执行 Docker，需要管理员将该用户加入 Docker 用户组并重新登录；Docker 用户组等同于较高的系统管理权限。

### 4.2 基础镜像

应用镜像在构建参数中支持临时依赖镜像。编译机遇到 npm/Go 公网代理阻塞时，可以这样构建；这些地址不会写入运行时环境或源码：

~~~bash
NPM_REGISTRY=https://registry.npmmirror.com \
GOPROXY=https://goproxy.cn,direct \
SKIP_BASE_BUILD=1 AIO_TAG=2026.08.16-storage \
./scripts/build-all-in-one-image.sh
~~~

基础镜像构建内容：

1. 使用固定 Go 工具链拉取 MinIO 指定源码提交。
2. 编译无 CGO 的 MinIO 二进制。
3. 从固定 Node 镜像复制 Node/npm。
4. 从固定 Go 镜像复制 Go 工具链。
5. 以官方 MySQL 8.4 镜像作为运行时底座。
6. 安装 Git、Make、GCC/G++、Python 和打包工具。
7. 写入 `/etc/bc-base-release` 并执行版本检查。

普通网络环境下：

~~~bash
MINIO_GOPROXY=https://goproxy.cn,direct \
BASE_IMAGE=bc-atlas-cms-base \
BASE_TAG=2026.08.12 \
./scripts/build-base-image.sh
~~~

验证：

~~~bash
./scripts/verify-base-image.sh bc-atlas-cms-base:2026.08.12
docker run --rm --entrypoint cat \
  bc-atlas-cms-base:2026.08.12 /etc/bc-base-release
~~~

当前编译机的 Docker Hub 拉取受代理影响，因此已经导入并验证 MySQL、Node 层。除非修改基础版本，否则后续应用构建直接复用 `bc-atlas-cms-base:2026.08.12`，不要重复强制拉取。

### 4.3 应用镜像

`Dockerfile.all-in-one` 使用基础镜像执行两个构建阶段：

~~~text
web-build: npm ci → npm run build
api-build: go mod download → go build ./server/cmd/api
~~~

普通网络环境下：

~~~bash
SKIP_BASE_BUILD=1 \
BASE_IMAGE=bc-atlas-cms-base BASE_TAG=2026.08.12 \
AIO_IMAGE=bc-atlas-cms-all-in-one AIO_TAG=2026.08.16 \
APP_VERSION=2026.08.16 \
./scripts/build-all-in-one-image.sh
~~~

镜像检查：

~~~bash
docker run --rm --entrypoint bash \
  bc-atlas-cms-all-in-one:2026.08.16 \
  -lc 'test -x /app/bc-cms && test -x /app/bc-content-storage && test -s /app/web/index.html && \
       minio --version && mysqld --version && node --version && go version'
~~~

生产镜像中的前端资源由 Go 从 `/app/web` 提供，不依赖 CDN。浏览器仍会向同源 Go 服务请求 API、图片和视频，这是本地自托管资源，不是外部 CDN。

## 5. 配置和密码管理

| 文件 | 用途 |
| --- | --- |
| `.env` | 三容器模式 |
| `.env.middleware` | 基础镜像只运行 MySQL + MinIO |
| `.env.all-in-one` | 单容器模式 |

这些文件必须只存在于部署主机，权限为 `0600`，不提交 Git，不复制进 Docker build context，不写入 Dockerfile、镜像标签或构建参数。

生成 All-in-One 配置：

~~~bash
./scripts/deploy-all-in-one.sh init
~~~

配置包含 `ADMIN_*`、`MYSQL_*`、`MINIO_*`、`S3_BUCKET` 和端口。应用使用专用 MySQL 用户，不使用 root。外部 S3 服务应使用只允许访问目标 bucket 的专用访问密钥。

## 6. 部署流程

### 6.1 使用已经构建的 All-in-One 镜像

在 `.env.all-in-one` 中设置：

~~~dotenv
AIO_IMAGE=bc-atlas-cms-all-in-one
AIO_TAG=2026.08.16
BASE_IMAGE=bc-atlas-cms-base
BASE_TAG=2026.08.12
~~~

启动：

~~~bash
docker compose \
  --env-file .env.all-in-one \
  -f docker-compose.all-in-one.yml \
  up -d --no-build
~~~

检查：

~~~bash
curl -fsS http://127.0.0.1:8080/api/health
docker compose --env-file .env.all-in-one \
  -f docker-compose.all-in-one.yml ps
~~~

### 6.2 从源码重新构建并部署

~~~bash
./scripts/deploy-all-in-one.sh init
./scripts/deploy-all-in-one.sh deploy
~~~

该脚本会创建配置、校验 Compose、构建基础镜像、构建应用镜像、启动容器，并等待 `/api/health` 成功。

### 6.3 推荐的三容器部署

~~~bash
./scripts/deploy.sh init
./scripts/deploy.sh deploy
~~~

三容器模式中，Go 应用通过 Compose 服务名访问 `mysql:3306` 和 `minio:9000`。

### 6.4 只运行中间件

~~~bash
./scripts/middleware.sh init
./scripts/middleware.sh up
~~~

适用于本地开发或需要单独提供 MySQL + S3 的场景。

## 7. 端口和公网访问

容器内部端口固定，修改的是主机端口：

~~~dotenv
APP_BIND=127.0.0.1
APP_PORT=8180

MYSQL_BIND=127.0.0.1
MYSQL_PORT=13306

MINIO_BIND=127.0.0.1
MINIO_API_PORT=19000
MINIO_CONSOLE_PORT=19001
~~~

内网穿透时只转发应用端口：

~~~text
公网域名 → 内网穿透 → 127.0.0.1:8180 → Go 应用
~~~

MySQL、MinIO API、MinIO Console 不应该暴露到公网。Nginx 不是必需组件；只有在需要 TLS、多站点、限流或集中访问日志时，才在容器外增加 Nginx。

## 8. 容器内目录和运行时行为

~~~text
/app/bc-cms                    Go API 二进制
/app/bc-content-storage        正文迁移、搜索重建和对象校验二进制
/app/web                       React/Vite 生产资源
/usr/local/bin/minio           源码编译的 MinIO
/usr/local/bin/bc-all-in-one-entrypoint
/usr/local/bin/bc-all-in-one-healthcheck
/usr/local/bin/docker-entrypoint.sh  官方 MySQL 入口
/data/mysql                    MySQL 持久化目录
/data/minio                    MinIO 对象目录
/tmp                           临时文件，tmpfs
~~~

All-in-One 入口脚本按 MySQL → MinIO → Go 应用的顺序启动，并在任一关键子进程退出时停止整个容器。Compose 的 `restart: unless-stopped` 负责异常退出后的重启。

## 9. 数据、媒体和备份

MySQL 保存用户、会话、文章/知识库元数据、标签、评论、权限和文章搜索投影。MinIO/S3 保存文章与知识库 Markdown 的规范正文，以及图片、视频、音频、PDF、压缩包和其他二进制文件。

文章和知识库正文使用版本化对象键：`contents/{id}/revisions/{revision}.md`、`knowledge/{id}/revisions/{revision}.md`。MySQL 只保留对象键、版本、SHA-256、字节数和搜索投影；旧的 `body_markdown` 行仍作为迁移期间的兼容回退。Markdown 中的图片/视频仍使用 `/media/...` 引用，不把二进制放进 MySQL。

完成数据库和对象存储备份后，可执行正文迁移与校验：

推荐在已启动的应用容器内运行已经编译好的工具（它天然能访问 Compose 网络中的 MySQL 和 MinIO）：

```bash
docker compose --env-file .env exec app /app/bc-content-storage -mode verify
docker compose --env-file .env exec app /app/bc-content-storage -mode migrate
docker compose --env-file .env exec app /app/bc-content-storage -mode reindex
docker compose --env-file .env exec app /app/bc-content-storage -mode verify
```

All-in-One 把服务名 `app` 换成 `bc`。如果是在主机上直接连接已发布的 MySQL/S3 端口，也可以使用 `make content-verify ENV_FILE=.env`、`make content-migrate ENV_FILE=.env`、`make content-reindex ENV_FILE=.env`；这时必须显式提供 `DATABASE_DSN`、`S3_ENDPOINT`、`S3_ACCESS_KEY` 和 `S3_SECRET_KEY`。

迁移工具只处理没有对象键的旧行；重复执行安全。`content-reindex` 从 MinIO 或旧正文重建关键字搜索投影，`content-verify` 会检查每个对象的大小和 SHA-256。工具不会输出密码或 S3 密钥。

备份必须同时包含：

1. 一致的 MySQL dump 或数据库快照。
2. `bc-content` bucket 的对象备份。
3. `.env`、`.env.all-in-one` 或 `.env.middleware` 的离线安全副本。

只备份 MySQL 会丢失图片和视频；只备份 S3 会丢失文章、权限和标签关系。

## 10. 日常维护

查看状态：

~~~bash
./scripts/deploy-all-in-one.sh status
# 或
./scripts/deploy.sh status
~~~

查看日志：

~~~bash
./scripts/deploy-all-in-one.sh logs
# 或
./scripts/deploy.sh logs
~~~

升级应用的推荐顺序：

1. 备份 MySQL、S3 bucket 和配置文件。
2. 修改源码和版本号。
3. 运行 `npm run build`、`npm run test:sites`、`go test ./...`。
4. 生成新的不可变应用标签，例如 `2026.08.17`。
5. 先验证新镜像，再切换 Compose 的 `AIO_TAG` 或 `APP_TAG`。
6. 观察 `/api/health` 和应用日志。
7. 保留旧镜像，确认稳定后再显式删除旧版本。

修改基础镜像中的 Node、Go、MySQL 或 MinIO 版本时，应同时更新基础镜像版本标签，不要原地覆盖已有标签。MinIO 版本必须同时更新源码提交、Go toolchain 和许可证归档。

## 11. 常见问题

### Docker 权限错误

如果出现：

~~~text
permission denied while trying to connect to the Docker daemon socket
~~~

说明当前用户没有 Docker Socket 权限，需要使用管理员执行，或由管理员将用户加入 Docker 用户组后重新登录。

### 镜像拉取卡住

当前编译机的 Docker Hub/GitHub 访问受 Clash/Mihomo 路由影响。优先保留已经构建好的基础镜像；需要重建时使用可访问的镜像代理导入 MySQL/Node 层，并给构建阶段配置临时代理。不要把代理认证信息写入 Dockerfile、Git 配置或镜像层。

### 修改密码后仍使用旧密码

初始化过的 MySQL 和 MinIO 会把账号写入持久化卷。只修改 `.env` 不会自动重写数据卷中的密码。应使用服务自身的密码轮换流程，或在确认备份后重新初始化整个数据卷。

### 端口已占用

修改 `.env.all-in-one` 或 `.env` 左侧的主机端口即可，容器内部端口不要修改。例如：

~~~dotenv
APP_PORT=8180
~~~

然后重新执行 Compose 部署。

## 12. 相关文档

- `docs/ARCHITECTURE.md`：应用分层和模块边界
- `docs/DATABASE.md`：MySQL 表和迁移
- `docs/EXTENDING.md`：新增内容类型、标签和模块
- `docs/AUTHORING_AND_RBAC.md`：注册、发文和 RBAC
- `docs/MEDIA_STORAGE.md`：S3 对象和媒体上传
- `docs/DEPLOYMENT.md`：三容器部署
- `docs/BASE_IMAGE.md`：基础镜像和 MinIO 源码构建
- `docs/ALL_IN_ONE.md`：单容器部署、端口和 Nginx
