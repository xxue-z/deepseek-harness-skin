# Theme Skins for DeepSeek Harness

一个 DeepSeek Harness 桌面版插件，把 [Codex-Skins](https://github.com/Fei-Away/Codex-Dream-Skin)
那套"壁纸 + 半透明面板"的主题系统搬到 Harness 上，并提供三件事：

1. **主题管理界面**：设置 →「主题皮肤」里的主题库、当前主题、壁纸可见度、删除、导出。
2. **导入 Codex 主题**：扫描本机 `CodexDreamSkin\themes`，或导入任意主题文件夹 / 分发 ZIP。
3. **AI 主题设计**：用一句话（可配一张图）生成或改造一套主题，直接入库。

同时把能力暴露成 `skin_theme` 工具，智能体在对话里也能列出、导入、应用、生成皮肤。

## 安装

这是一个源码即插件的 bundle（无构建步骤、无运行时依赖）：

```bash
# 在 Harness 会话里
plugin_manager install_bundle  C:\path\to\deepseek-harness-skin
```

安装后无需重启：Host 半通过 Loader 生效，Web 半随模块图下发。**如果设置页没有出现新条目，刷新一次页面**（已打开的页面不会重新执行旧模块）。

## 使用

设置 →「主题皮肤」：

- **扫描本机主题**：读取 `%LOCALAPPDATA%\CodexDreamSkin\themes\*`（macOS 为
  `~/Library/Application Support/CodexDreamSkin/themes`），把每个主题转换入库。
- **导入 ZIP / 从文件夹导入**：Codex 主题包（`theme.json` + `theme.css` + 壁纸）直接拖进来。
- **AI 设计**：写一句描述、可选放一张图 → 生成草稿并入库；生成失败会自动回退到离线配色，
  界面会明确标注。
- 卡片详情里可以调 **壁纸可见度**（0–100%，等价于 Codex 的 transparency），
  可以「按壁纸重新取色」（给没有 `colors` 的 preset 补配色）、导出 JSON、删除。

对话里（`skin_theme` 工具）：

```
skin_theme {"action":"list"}
skin_theme {"action":"import","path":"C:\\Users\\you\\AppData\\Local\\CodexDreamSkin\\themes\\studio.crimson-mecha-nova"}
skin_theme {"action":"design","description":"赛博霓虹，暗紫底色"}
skin_theme {"action":"apply","id":"skin.crimson-mecha-nova"}
skin_theme {"action":"transparency","id":"skin.crimson-mecha-nova","transparency":45}
```

## 它是怎么生效的

- **配色**：`ctx.theme.register({id, colorScheme, tokens})` 把主题注册进 Harness 主题注册表，
  `setTheme(id)` 切换；透明度变化用 `ctx.theme.overrideTokens()` 叠层，不重注册（避免闪烁）。
  token 映射见 [docs/superpowers/specs/2026-10-28-dsh-skin-plugin-design.md](docs/superpowers/specs/2026-10-28-dsh-skin-plugin-design.md)。
- **底色方案**：浅色/深色不是按主题里写的 `appearance` 选的，而是按面板/画布亮度算出来的
  （插件只换 alias token，其余表面沿用宿主内置调色板，选错就整片变黑）。
- **壁纸**：插件自有 `<style data-plugin="@local/dsh-skin">` 注入 `body::before` 固定图层。
- **分层不透明度**：四类表面各有下限——画布/侧栏跟随"壁纸可见度"（默认 100%，保留 0.08/0.10 的
  一层底色压字），卡片 0.86，弹窗与浮动面板 0.95，输入框 0.90。同一层透明度会让设置面板变成
  "看穿对话"的玻璃窗，分层之后壁纸在画布和侧栏上照样透，叠在上面的面板则始终可读。
- **默认可见度 100%**：只有 `theme.css` 自己写了 alpha（例如「星潮」的侧栏 0.7、「上杉绘梨衣」的
  0.32）才沿用作者值；没写的主题一律按当前默认（100%）渲染，所以改默认值会作用到所有这类主题，
  而不是把旧默认值固化在每个 `theme.json` 里。详情面板的「恢复默认」可以清掉单主题的覆写。
- **持久化**：Harness 的主题偏好 schema 不接受第三方主题 id，所以插件自己存
  `<DSH_HOME>/skin/state.json`，启动时重新注册并恢复。

## 数据位置

```
<DSH_HOME>/skin/
  state.json                     # 当前皮肤 + 每个皮肤的透明度覆写
  themes/<id>/theme.json         # 皮肤定义（配色、壁纸焦点、来源元数据）
  themes/<id>/wallpaper.<ext>    # 壁纸原图
```

删除只会动这个目录；不会碰你的 Codex 主题原文件。

## 目录结构

| 路径 | 作用 |
|---|---|
| `index.js` | Host 半：建库、注册 `/skin` 路由、注册 `skin_theme` 工具 |
| `client.js` | Web 半：主题应用（token + 壁纸）+ 设置页 UI |
| `lib/convert.js` | Codex `theme.json`/`theme.css` → 皮肤，含 Safe CSS 的可用信息提取 |
| `lib/service.js` | 所有操作（列表/导入/应用/透明度/删除/设计），HTTP 与工具共用 |
| `lib/palette.js` | 颜色解析、对比度修正、从文字/图片调色板推导整套配色 |
| `lib/designer.js` | 提示词、模型调用、JSON 解析、离线回退 |
| `lib/store.js` | 原子写入的皮肤库 |
| `lib/zip.js` | 最小 ZIP 读取器（stored + deflate，无第三方依赖） |
| `lib/api.js` | `/skin/api/*` 与 `/skin/assets/*` |
| `lib/tool.js` | `skin_theme` 工具定义 |
| `tools/asar.mjs` | 维护者工具：只读查看安装包 `app.asar` 里的文件（排查宿主 API 用） |

## 自测

```bash
node tools/selftest.mjs           # Host：配色/转换/ZIP/存储/HTTP
node tools/client-selftest.mjs    # Web：主题注册、壁纸样式、透明度、渲染
```

两个脚本都不需要网络、不需要安装依赖。

## 已知边界

- **视频壁纸**（Codex 的 `background.mp4`）不播放，只在详情里保留元数据。
- **Codex 的 `theme.css`** 只提取与 DOM 无关的部分（圆角、表面透明度、模糊、字体）；
  `[data-ds-part]` 选择器不会逐条翻译到 Harness DOM——那等于猜选择器，宁可少做。
- **画布保底**：本应用把对话文字直接画在画布上（Codex 每条消息有独立卡片），
  所以即使可见度拉满，画布仍保留 8% 底色（侧栏 10%）+ 壁纸暗化，让文字有个底。
- **浮层不跟手**：设置面板的底色来自 `--dsw-alias-bg-layer-2`（dockkit 浮动面板），
  它和画布是不同 token；"壁纸可见度"滑到很高时，画布/侧栏会更透，而浮动面板保持 0.95。
  若某天宿主把设置面板改成画布 token，这条分层就失效——届时需要按新 DOM 再调一次。
- **自动关闭**：在设置 →「外观」里重新选择 浅色/深色/跟随系统，会停用当前皮肤（同 Codex 的
  "Follow theme"），壁纸层同时移除。