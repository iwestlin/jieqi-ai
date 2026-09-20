# 部署方法

## 部署架构

- 前端是 Vite + React 构建产物，输出到 `dist/`。
- Pikafish UCI 桥接 API 是 `/api/pikafish-move`，实现已抽到 `server/pikafish-server.js`，可用 Node 直接启动。
- `vite dev` 和 `vite preview` 仍会通过 Vite 插件复用同一个 API 实现，方便本机一体化运行。
- 因此，要使用完整 Pikafish AI，服务器上必须常驻一个 Node 进程；只上传静态文件时，Pikafish API 不可用，前端会回退到旧的 Fair AI。

## 本地启动

```bash
npm install
npm run dev
```

开发地址默认是 `http://localhost:5173`。

## 自托管 / 服务器部署

### 1. 安装依赖并构建

```bash
npm ci
npm run test
npm run build
```

### 2. 准备 Pikafish 引擎

仓库中的 `Pikafish-jieqi_old/src/PikaJieQi` 是 macOS x86_64 可执行文件。Linux 服务器需要重新编译：

```bash
cd Pikafish-jieqi_old/src
make -j build ARCH=x86-64
```

如果使用其他 CPU 架构，可将 `ARCH=x86-64` 改为 Makefile 支持的对应架构，例如 ARM 机器可使用 `apple-silicon` 或其他可用目标。

编译或部署后，确认这个路径存在且可执行：

```bash
./Pikafish-jieqi_old/src/PikaJieQi
```

### 3. 启动服务

有两种启动方式。

#### 方式 A：一体化模式

```bash
npm run preview -- --host 0.0.0.0 --port 4173
```

`vite preview` 会同时提供 `dist/` 前端和 `/api/pikafish-move` API。

#### 方式 B：独立 Node API 模式

```bash
npm run pikafish-server -- --host 127.0.0.1 --port 8787
```

也可以直接运行：

```bash
node server/pikafish-server.js --host 127.0.0.1 --port 8787
```

独立模式下 API 地址是 `http://127.0.0.1:8787/api/pikafish-move`，并由 Nginx 负责托管 `dist/` 和反向代理 API。

可用以下请求验证引擎桥接：

```bash
curl -X POST http://127.0.0.1:4173/api/pikafish-move \
  -H 'Content-Type: application/json' \
  -d '{"fen":"xxxxkxxxx/9/1x5x1/x1x1x1x1x/9/9/X1X1X1X1X/1X5X1/9/XXXXKXXXX w R2A2C2P5N2B2r2a2c2p5n2b2 0 1","movetime":300}'
```

正常情况下会返回 `bestMove`。

### 4. 用进程管理器常驻

```bash
npm install -g pm2
pm2 start npm --name pikafish-api -- run pikafish-server -- --host 127.0.0.1 --port 8787
pm2 save
```

### 5. Nginx 反向代理

如果使用一体化模式，最简单的配置是把所有请求都转发给 Node 服务：

```nginx
server {
    listen 80;
    server_name example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果使用独立 Node API 模式，由 Nginx 直接托管静态文件：

```nginx
server {
    listen 80;
    server_name example.com;
    root /path/to/jieqi-ai-v0.1/dist;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/pikafish-move {
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

生产环境建议再加上 HTTPS，例如使用 Certbot 申请 Let's Encrypt 证书。

## 纯静态部署

可以执行：

```bash
npm run build
```

然后只部署 `dist/` 到 Vercel、Netlify、GitHub Pages 或任意静态托管服务。现有 `DEPLOYMENT.md` 中的 Vercel 设置适用于这种方式。

但纯静态部署不会包含 `/api/pikafish-move`，因此不会运行 Pikafish 引擎；AI 会自动退回前端内置的 `recommendMoveFair()`。

## 注意事项

- 不要用 `npm run dev` 作为生产服务。
- `vite preview` 适合当前单机部署，但公开服务建议使用 Nginx、HTTPS 和速率限制。
- Pikafish 引擎使用 GPL-3.0；重新分发引擎或其修改版时需要遵循对应授权，详见 `README_V0.1.md`。
