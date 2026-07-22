# 生产运维手册

当前生产基线适合单台云服务器上的小规模商用或公开测试。它包含 MySQL、前端、后端、HTTPS、自动重启、结构化日志、健康监控和每日备份。用户量明显增长后，再把 MySQL 和监控迁到托管服务。

## 1. 首次准备

服务器需要安装 Docker Engine、Docker Compose v2，并把域名 A 记录指向服务器公网 IP。安全组需开放 `80` 和 `443`，数据库端口 `3306` 不对公网开放。

```powershell
Copy-Item .env.production.example .env.production
```

必须修改：

- `CITY_ROUTE_DOMAIN`：正式域名，不含 `https://`。
- `CITY_ROUTE_CORS_ORIGINS`：正式前端地址，例如 `https://route.example.com`。
- `CITY_ROUTE_AUTH_SECRET`：至少 64 位随机字符串。
- `MYSQL_PASSWORD`、`MYSQL_ROOT_PASSWORD`：不同的强密码，建议仅使用 URL 安全字符。
- 高德 Web 服务 Key、JS API Key 和安全密钥。
- DeepSeek Key。
- `ALERT_WEBHOOK_URL`：可选，接收 `{"text":"..."}` JSON 的告警地址。

曾经出现在聊天、截图或公开位置的 Key 应在正式上线前全部轮换。`.env.production` 已被 Git 忽略，不要上传。

## 2. 启动和检查

```powershell
.\scripts\prod.ps1 config
.\scripts\prod.ps1 up
.\scripts\prod.ps1 status
```

Caddy 会自动申请和续期 HTTPS 证书。服务启动后检查：

```text
https://你的域名/
https://你的域名/api/backend/health
https://你的域名/api/backend/api/system/readiness
```

`health` 只表示后端进程存活；`readiness` 还会检查高德和 MySQL 等关键依赖。生产环境中 MySQL 不可用时会返回未就绪，并停止持久化写入，不会悄悄改写到 JSON。

## 3. 日常命令

```powershell
.\scripts\prod.ps1 status
.\scripts\prod.ps1 logs
.\scripts\prod.ps1 restart
.\scripts\prod.ps1 backup
.\scripts\prod.ps1 verify
```

Docker 对每个服务保留最多 5 个、每个 10 MB 的 JSON 日志文件。后端访问日志为单行 JSON，可按 `request_id`、`status` 和 `duration_ms` 检索。

监控每 60 秒检查前端、后端存活、后端就绪和公网入口。连续失败 3 次触发一次告警，恢复后再发恢复通知。未配置 webhook 时仍会写入监控日志。

## 4. 备份与恢复

`backup` 服务默认每 24 小时生成一次 MySQL JSON 备份，保留 14 天，存放在 Docker 命名卷 `database_backups`。手动备份：

```powershell
.\scripts\prod.ps1 backup
```

恢复前先保留当前备份，再执行：

```powershell
.\scripts\prod.ps1 restore -File C:\path\to\city-route-mysql-20260721-120000.json
.\scripts\prod.ps1 verify
```

备份包含账号密码哈希、行程和分享 token，必须限制访问。正式商用建议每天把备份卷再同步到加密的异地对象存储，并至少每月实际演练一次恢复。

## 5. 发布与回滚

发布前在开发机运行：

```powershell
.\scripts\preflight.ps1 -Production
```

在服务器更新代码后：

```powershell
.\scripts\prod.ps1 backup
.\scripts\prod.ps1 up
.\scripts\prod.ps1 verify
```

回滚时切回上一个已验证的代码版本并再次执行 `prod.ps1 up`。数据库结构发生不兼容变化前，必须先做备份和迁移演练。

## 6. 当前边界

- 这套配置解决单机自动重启、HTTPS、日志轮转、服务监测和本机备份。
- 云服务器、域名、DNS、告警接收方和异地备份账号需要由部署者提供。
- 单机故障仍会让服务中断；正式大规模运营应使用托管 MySQL、独立监控和多实例部署。
