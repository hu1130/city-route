# 正式部署检查清单

## 自动化基线

- [x] 前后端容器化构建
- [x] MySQL 独立持久化卷
- [x] 进程退出后自动重启
- [x] Caddy HTTPS 和证书自动续期
- [x] 后端结构化请求日志
- [x] Docker 日志大小和保留数量限制
- [x] 前端、后端、依赖和公网入口监控
- [x] 连续故障告警与恢复通知
- [x] 每日数据库备份和过期清理
- [x] 手动备份、恢复和读写验证命令
- [x] 生产环境禁止 MySQL 故障后降级到 JSON

## 上线前人工必填

- [ ] 云服务器已安装 Docker Engine 和 Docker Compose v2
- [ ] 域名 A 记录已指向服务器公网 IP
- [ ] 防火墙开放 `80`、`443`，不对公网开放 `3306`
- [ ] 已从 `.env.production.example` 创建 `.env.production`
- [ ] `CITY_ROUTE_DOMAIN` 和 `CITY_ROUTE_CORS_ORIGINS` 使用正式域名
- [ ] `CITY_ROUTE_AUTH_SECRET` 已换成至少 64 位随机值
- [ ] MySQL 用户密码和 root 密码已换成不同强密码
- [ ] 高德 Web 服务 Key、JS API Key、安全密钥已配置域名白名单
- [ ] DeepSeek Key 已配置，曾公开过的 Key 已轮换
- [ ] 告警 webhook 已填写并实际触发测试
- [ ] 数据库备份已同步到异地加密存储

## 发布验证

```powershell
.\scripts\prod.ps1 config
.\scripts\prod.ps1 up
.\scripts\prod.ps1 status
.\scripts\prod.ps1 verify
```

- [ ] 首页通过正式 HTTPS 域名打开
- [ ] `/api/backend/health` 返回 200
- [ ] `/api/backend/api/system/readiness` 返回 200 且 `ok=true`
- [ ] 注册、登录、退出正常
- [ ] 定位拒绝时可手动填写起点，未定位时城市不默认上海
- [ ] 高德地点搜索、路线耗时和地图正常
- [ ] DeepSeek 行程说明正常
- [ ] 创建、保存、查看、删除行程正常
- [ ] 分享链接可在无登录浏览器打开
- [ ] 手机真机可完成定位、选点、规划和导航跳转
- [ ] 手动备份成功，恢复演练成功
- [ ] 告警和恢复通知均能收到

完整操作说明见 [production-operations.md](production-operations.md)。
