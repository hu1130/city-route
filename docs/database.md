# 数据库操作说明

当前项目支持两种持久化方式：

- `json`：本地文件存储，路径默认是 `backend/data/store.json`。
- `mysql`：MySQL 存储。MySQL 不可用时，应用会自动降级到 JSON，保证本地开发不断。

## 检查当前数据库状态

```powershell
cd C:\Users\HYF05\Documents\Codex\2026-06-11\api\city-route-mvp
.\scripts\db.ps1 status
```

如果看到 `MySQL connection: failed`，说明当前 MySQL 服务或账号还没通。此时应用仍会使用 JSON fallback。

## 初始化 MySQL 表结构

先确保 `.env` 已配置：

```env
CITY_ROUTE_STORAGE_BACKEND=mysql
DATABASE_URL=mysql+pymysql://user:password@127.0.0.1:3306/city_route_mvp
```

然后执行：

```powershell
.\scripts\db.ps1 init
```

成功后会显示 `MySQL schema is ready.`。

## 验收 MySQL 写入链路

```powershell
.\scripts\db.ps1 verify
```

这个命令会临时创建一个测试行程、测试路线和分享 token，确认能写入、读取、删除。执行完成后会清理测试数据。

## 把本地 JSON 数据迁移到 MySQL

确认 MySQL 能连接后执行：

```powershell
.\scripts\db.ps1 migrate-json
```

迁移内容包括：

- 本地账号
- 行程
- 路线方案
- 分享链接 token
- 下一组自增编号

迁移命令不会打印数据库密码或 API Key。

## 备份 MySQL

```powershell
.\scripts\db.ps1 backup
```

默认备份到项目根目录的 `backups/`，内容是逻辑 JSON 备份，包含账号、行程、路线方案、分享 token 和计数器。

指定目录：

```powershell
.\scripts\db.ps1 backup -OutputDir C:\tmp\city-route-backups
```

## 从备份恢复

```powershell
.\scripts\db.ps1 restore -File C:\tmp\city-route-backups\city-route-mysql-20260708-120000.json
```

恢复使用 upsert 方式写回 MySQL，不会打印数据库密码。恢复前建议先执行一次 `backup`。

## 当前本机状态

本机现在的情况是：项目 `.env` 已经配置为 MySQL，但 MySQL 服务没有正常监听 `127.0.0.1:3306`，所以数据库状态检查会失败，应用会继续使用 JSON fallback。

这不是业务代码问题，而是本机 MySQL 服务问题。可以先继续开发功能；等 MySQL 服务修好，执行 `init` 和 `migrate-json` 即可切换到 MySQL。
