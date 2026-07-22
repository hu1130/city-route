# Scripts

本目录放本地开发、数据库和上线前检查脚本。

- `dev.ps1`: 固定端口启动前后端，默认端口为前端 `3000`、后端 `8011`。
- `dev.ps1 -StopExisting`: 停掉占用固定端口的旧进程后重新启动。
- `doctor.ps1`: 本地诊断脚本，检查依赖、环境变量、端口、前后端访问状态和 MySQL 连接。
- `db.ps1 status`: 查看当前持久化配置和 MySQL 连接状态。
- `db.ps1 verify`: 验证 MySQL schema、行程、路线和分享 token 读写。
- `mysql-console.ps1`: 用前台窗口启动本机 MySQL。MySQL 服务启动不了时可先用这个方式开发。
- `preflight.ps1`: 部署或交付前预检，包含后端测试和数据库验证。
- `prod.ps1`: 生产 Docker Compose 的配置校验、启动、日志、备份、验证和恢复入口。

常用顺序：

```powershell
.\scripts\doctor.ps1
.\scripts\dev.ps1 -StopExisting
.\scripts\preflight.ps1 -SkipBuild
```

生产部署：

```powershell
Copy-Item .env.production.example .env.production
.\scripts\prod.ps1 config
.\scripts\prod.ps1 up
.\scripts\prod.ps1 verify
```

完整说明见 `docs/production-operations.md`。
