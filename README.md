# Theme Skins for DeepSeek Harness

一个 DeepSeek Harness 桌面版插件，把 [Codex-Skins](https://github.com/Fei-Away/Codex-Dream-Skin)
那套"壁纸 + 半透明面板"的主题系统搬到 Harness 上，并提供三件事：

1. **主题管理界面**：设置 →「主题皮肤」里的主题库、当前主题、壁纸可见度、删除、导出。
2. **导入 Codex 主题**：扫描本机 `CodexDreamSkin\themes`，或导入任意主题文件夹 / 分发 ZIP。
3. **AI 主题设计**：用一句话（可配一张图）生成或改造一套主题，直接入库。

同时把能力暴露成 `skin_theme` 工具，智能体在对话里也能列出、导入、应用、生成皮肤。

## 安装

包名（也是加载器解析的模块名）是 **`@xxue-z/dsh-skin`**：scope 属于作者本人，避免和别的插件重名。
插件用宿主自带的 `plugin_manager` 安装，**装的是目录**；Harness 按 `package.json` 的 `name`
去 profile 的 `node_modules` 里解析它，所以「装哪个名字」和「代码里叫什么」必须一致。

### 推荐：从 Release 附件安装

```bash
# 1. 从 Releases 下载 deepseek-harness-skin-vX.Y.Z.tar.gz 并解压到一个固定目录
#    例如 C:\ProgramCustom\Tool\dsh-skin-1.0.7
#    解压后该目录里应当直接有 package.json / index.js / lib/，没有多余的一层

# 2. 在 Harness 会话里安装
plugin_manager install_bundle  C:\ProgramCustom\Tool\dsh-skin-1.0.7
```

附件的结构和内容由 CI 按 `package.json` 的 `files` 生成，只有运行时文件
（入口、`lib/`、`locale/`、patch、图标）和 README/CHANGELOG，并附带 `.sha256` 可校验。

### 也可以：用仓库地址安装

插件管理器的输入框接受 `https://github.com/xxue-z/deepseek-harness-skin` 这类仓库地址，
它会转换成 `github:xxue-z/deepseek-harness-skin`，由 pnpm 拉取**某个提交的快照**。这条路能用，
但要知道它的含义：

- 拉的是**提交快照**，不是发布版本；版本号取自仓库里的 `package.json`，未必对应某个标签；
- pnpm 会做内容哈希，但没有我们发布的 `.sha256` 和 Release 说明；
- 装完后 `node_modules/@xxue-z/dsh-skin` 是一份**真实拷贝**，与 Release 方式互不相干。

两种方式选一个即可，**不要对同一个包名同时保留两份来源**，否则加载器和 pnpm 会指向不同目录。

### 安装之后

需要**重启一次 DeepSeek Harness**：Host 半走 Loader 加载，Web 半随模块图下发；重启后刷新页面。
设置 →「主题皮肤」页头显示版本号，点开可检查更新。

## 升级

| 当前安装方式 | 做法 |
|---|---|
| Release 目录 | 解压新版本到**另一个目录** → 卸载旧条目 → `install_bundle` 新目录 → 重启 |
| 仓库地址 | 在插件管理器里卸载后重新安装，或指定新版本，然后重启 |
| 设置页「下载并更新」 | 直接点，会替换插件目录并刷新页面，随后重启一次应用 |

**升级到改了包名的版本**（例如从 `@local/dsh-skin` 到 `@xxue-z/dsh-skin`）时，必须先卸载旧名字那条：
loader 里残留的旧条目会继续去找一个已不存在的目录，表现为
`failed to import: ENOENT ... index.js`。

## 卸载

在插件管理器里点「卸载」，或在 Harness 会话里：

```bash
plugin_manager remove_bundle  @xxue-z/dsh-skin
```

卸载后再删掉你解压出来的安装目录，并**重启一次应用**让 loader 释放那条配置。
卸载**不会**删除皮肤数据（`<DSH_HOME>/skin/`），重装后主题会直接回来。

### 插件显示「包元信息错误 / ENOENT」

这是 loader 里那条配置指向的目录**已经不存在或为空**（常见于手动删掉安装目录、或换过安装路径）。
处理：先把这条卸载掉（界面里的「卸载」或 `plugin_manager remove_bundle`），再按上面的步骤重新安装，
最后重启。只重装不卸载会留下两条指向不同目录的配置，报错依旧。

## 使用

设置 →「主题皮肤」：

- **扫描本机主题**：读取 `%LOCALAPPDATA%\CodexDreamSkin\themes\*`（macOS 为
  `~/Library/Application Support/CodexDreamSkin/themes`），把每个主题转换入库。
- **导入 ZIP / 从文件夹导入**：Codex 主题包（`theme.json` + `theme.css` + 壁纸）直接拖进来。
- **AI 设计**：写一句描述，可再附**一张图片**和**一段 MP4**（各一份），生成草稿并入库：
  - 只给图片 → 静态主题，图片就是壁纸；
  - 只给视频 → 动态主题，浏览器抽视频第一帧当壁纸与静态回退，视频循环播放；
  - 两个都给 → 图片当壁纸、视频当动态背景。
  「设计模型」是下拉框，读的是宿主实时的模型目录（与聊天框同一个注册表，按供应商分组）；
  遇到不能看图的模型会自动只发文字并提示。高级里只有一项「主题名」（决定皮肤的 `name`）；
  氛围和额外要求直接写进描述——它们是同一句话，拆成三个输入框只会让模型分不清主次。
  生成失败会自动回退到离线配色，界面会明确标注。
- 卡片详情里可以调 **壁纸可见度**（0–100%，等价于 Codex 的 transparency），
  可以「按壁纸重新取色」（给没有 `colors` 的 preset 补配色）、**重命名**、导出 JSON、删除。
  重命名只改显示名称：id、目录、壁纸/视频文件都不动，所以正在使用的主题也能改；
  从 Codex 主题包导入的皮肤，下次「扫描本机主题」会用包里的名字覆盖回去。
- **动态主题设置**：页头按钮，弹窗里三行——自动播放、静音、播放/暂停快捷键。
  快捷键走宿主自带的快捷键系统，**应用不在前台也能用**，并且会出现在
  「设置 → 快捷键」里，可以自己改键位（弹窗里的键帽会自动跟着变）。
- **补全动态背景**：动态壁纸上线之前导入的皮肤只留了 `codex.video` 元数据，
  详情里会提示「原主题带 MP4」，按钮只重读 `background.mp4` 挂上去，
  不动配色和透明度（重新扫描也行，但那会把整份文档按主题包重写）。

对话里（`skin_theme` 工具）：

```
skin_theme {"action":"list"}
skin_theme {"action":"import","path":"C:\\Users\\you\\AppData\\Local\\CodexDreamSkin\\themes\\studio.crimson-mecha-nova"}
skin_theme {"action":"design","description":"赛博霓虹，暗紫底色"}
skin_theme {"action":"design","description":"夏日午后，清爽一点，文字对比度要高","videoPath":"D:\\clips\\summer.mp4","name":"夏日"}
skin_theme {"action":"apply","id":"skin.crimson-mecha-nova"}
skin_theme {"action":"transparency","id":"skin.crimson-mecha-nova","transparency":45}
```

## 它是怎么生效的

- **配色**：`ctx.theme.register({id, colorScheme, tokens})` 把主题注册进 Harness 主题注册表，
  `setTheme(id)` 切换；透明度变化用 `ctx.theme.overrideTokens()` 叠层，不重注册（避免闪烁）。
  token 映射见 [docs/superpowers/specs/2026-10-28-dsh-skin-plugin-design.md](docs/superpowers/specs/2026-10-28-dsh-skin-plugin-design.md)。
- **底色方案**：浅色/深色不是按主题里写的 `appearance` 选的，而是按面板/画布亮度算出来的
  （插件只换 alias token，其余表面沿用宿主内置调色板，选错就整片变黑）。
- **壁纸**：插件自有 `<style data-plugin="deepseek-harness-skin">` 注入 `body::before` 固定图层。
- **动态壁纸**：Codex 主题里的 `background.mp4` 会被一起导入（≤16 MB、H.264/`avc1`、
  单视频轨），由 `/skin/assets/<id>/video` 以支持 `Range` 的方式输出，客户端在
  `#root` 之下挂一个固定 `<video>` 层。海报始终是底：视频 `loadeddata` 之后才盖上，
  解码失败、自动播放被拒、系统「减少动态效果」、窗口隐藏都会退回海报或暂停，
  不会黑屏。透明度的白色暗化层由海报和视频共用同一个数值，切换时不跳亮度。
- **播放快捷键**：注册为宿主的 `skin.toggleVideo` 命令，默认 `Ctrl+Alt+P`
  （macOS `⌘⌥P`）；没有快捷键服务时退回到窗口内监听同一个组合键。
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
  state.json                     # 当前皮肤、每个皮肤的透明度覆写、动态背景设置
  themes/<id>/theme.json         # 皮肤定义（配色、壁纸焦点、视频元数据、来源元数据）
  themes/<id>/wallpaper.<ext>    # 壁纸原图（必需，也是视频的海报帧）
  themes/<id>/video.mp4          # 动态壁纸（可选）
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
| `lib/mp4.js` | 有界 MP4 结构解析（品牌、轨道、编码、尺寸、时长），不解码 |
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

## 发布

发版只推一个标签，其余交给 [`.github/workflows/release.yml`](.github/workflows/release.yml)：

```bash
# 1. 改 package.json 的 version，并在 CHANGELOG.md 顶部加一节同名版本
git commit -am "release: 1.0.6" && git tag -a v1.0.6 -m "1.0.6"
git push origin master v1.0.6
```

工作流会：校验标签 / `package.json` / `CHANGELOG` 三处版本一致 → 跑两套自测 →
按 `package.json` 的 `files` 打出安装包 `deepseek-harness-skin-vX.Y.Z.tar.gz` 并生成
`.sha256` → 用标签对应的 CHANGELOG 小节建 GitHub Release 并上传附件。

安装包里只有运行时文件（入口、`lib/`、`locale/`、patch、图标）和 README/CHANGELOG；
`.github/`、`docs/`、`tools/` 不进包。

它只用仓库自带的 `GITHUB_TOKEN`（`contents: write`），不需要配置任何 secret；
标签带 `-rc` / `-beta` 时发布为预发布，不会抢 `latest`，可以先下载附件验证再转正式。
工作流也可以在 Actions 页面手动触发（传入标签名重跑同一次发布）。

设置页的「检查更新」读的就是这个 Release：有附件时优先下载附件并校验 sha256，
没有附件时退回标签 tarball。插件目录会被整体替换，旧目录保留为带日期的备份。

## 已知边界

- **视频壁纸的编码**：只接受 H.264（`avc1`）、8-bit、单视频轨、≤16 MB，分辨率上限
  2560×1600，时长 0.2 秒–5 分钟。HEVC / AV1 / 分片 MP4 会在导入时被跳过（海报照常导入，
  界面给出一条警告），而不是等到播放时才失败。
- **Codex 的 `theme.css`** 只提取与 DOM 无关的部分（圆角、表面透明度、模糊、字体）；
  `[data-ds-part]` 选择器不会逐条翻译到 Harness DOM——那等于猜选择器，宁可少做。
- **画布保底**：本应用把对话文字直接画在画布上（Codex 每条消息有独立卡片），
  所以即使可见度拉满，画布仍保留 8% 底色（侧栏 10%）+ 壁纸暗化，让文字有个底。
- **浮层不跟手**：设置面板的底色来自 `--dsw-alias-bg-layer-2`（dockkit 浮动面板），
  它和画布是不同 token；"壁纸可见度"滑到很高时，画布/侧栏会更透，而浮动面板保持 0.95。
  若某天宿主把设置面板改成画布 token，这条分层就失效——届时需要按新 DOM 再调一次。
- **自动关闭**：在设置 →「外观」里重新选择 浅色/深色/跟随系统，会停用当前皮肤（同 Codex 的
  "Follow theme"），壁纸层同时移除。