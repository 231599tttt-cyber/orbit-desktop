# 为 Orbit Desktop 贡献

感谢你愿意帮助 Orbit Desktop 变得更好。项目当前处于 MVP 阶段，最重视 3D 交互手感、Windows 兼容性、性能和可维护性。

## 开始之前

- 遵守 [行为准则](CODE_OF_CONDUCT.md)
- 安全漏洞请按 [安全政策](SECURITY.md) 私下报告，不要创建公开 Issue
- 对较大的功能或架构调整，建议先创建 Issue 说明问题、目标和方案，避免重复工作
- 小型修复、文档改进和可复现的错误修复可以直接提交 Pull Request

## 开发环境

推荐环境：

- Windows 10 或 Windows 11（64 位）
- Node.js 22.12+
- npm 10+
- 支持 WebGL 的显卡

安装并启动：

```powershell
git clone <your-fork-url>
cd orbit-desktop
npm install
npm run dev
```

提交前请至少运行：

```powershell
npm run test:unit
npm run typecheck
npm run build
```

涉及扫描、应用管理、设置或 Electron 主进程的改动，还应运行隔离用户目录的桌面端流程测试：

```powershell
npm run test:e2e
```

如改动涉及 Windows 打包流程，也请在 Windows 上运行：

```powershell
npm run package:win
```

## 建议的贡献流程

1. Fork 仓库并从默认分支创建主题分支。
2. 保持改动聚焦，一个 Pull Request 解决一个清晰的问题。
3. 编写可读的 TypeScript，复用已有组件和类型，避免把平台能力直接暴露给渲染进程。
4. 手动验证拖动、惯性、滚轮缩放、悬停、点击聚焦、真实启动和搜索流程。
5. 执行自动化测试、类型检查与生产构建。
6. 提交 Pull Request，并说明改动动机、验证方式和已知限制。

分支名称可以使用 `feat/`、`fix/`、`docs/` 或 `refactor/` 前缀，例如 `fix/orbit-inertia`。

## Pull Request 检查清单

- [ ] 改动范围清晰，没有无关重构
- [ ] `npm run typecheck` 通过
- [ ] `npm run test:unit` 通过；涉及桌面流程时 `npm run test:e2e` 也通过
- [ ] `npm run build` 通过
- [ ] 关键鼠标与搜索交互已手动验证
- [ ] 新增本机能力时仍保持 Electron 上下文隔离和最小化的 preload API
- [ ] 未加入密钥、个人路径、用户应用清单或其他敏感数据
- [ ] 用户可见变化已更新 README 或相关说明
- [ ] 视觉变化附有截图或短视频（如适用）

## 报告问题

一个高质量的错误报告最好包含：

- Windows 版本、Node.js 版本和显卡型号
- Orbit Desktop 的版本或提交哈希
- 清晰的复现步骤、预期结果和实际结果
- 错误信息或日志（请先删除用户名、路径和其他隐私数据）
- 对 3D/视觉问题有帮助的截图或录屏

性能问题请同时说明窗口大小、显示器分辨率/缩放比例、节点数量，以及是否能稳定复现。

## 代码与架构原则

- 3D 渲染、界面状态和 Windows 本机能力保持分层
- Electron 渲染进程不启用 Node.js 集成
- preload 只暴露明确、有限并可校验的操作
- 不引入不必要的网络服务、遥测或付费依赖
- 对每帧执行的逻辑保持克制，优先保证动画稳定性
- 正式流程不得引入模拟应用、随机图标或无法验证的启动入口
- 新功能应提供合理的失败状态，不能破坏真实应用扫描、审查后添加和安全启动流程

## 许可

提交贡献即表示你同意按照本项目的 [MIT License](LICENSE) 授权你的贡献。
