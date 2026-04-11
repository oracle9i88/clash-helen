# 1.0.1

## 修复 (Fix)

- 修复 URI 导入未正确写入本地配置的问题
- 修复 profile 创建链路与共享类型定义漂移导致的类型错误
- 修复安装阶段 `prepare` 脚本递归调用 `pnpm` 导致的生命周期失败
- 修复本地 `sysproxy-rs` 依赖路径在非 Windows 环境下的兼容性问题
- 清理当前仓库的 TypeScript 与 ESLint 失败项，保证检查脚本通过

# 1.9.4

## 新功能 (Feat)

- 新增每个订阅独立的 User-Agent 配置
- 使用 mshta 在 Electron 初始化前同步检测 PowerShell 版本

## 修复 (Fix)

- 修复 Win7 兼容性问题
- 修复日志清理正则表达式以正确匹配带前缀的文件名

## 其他 (Chore)

- 重构 rule-item 额外字段处理逻辑并补充类型定义
- 更新依赖
