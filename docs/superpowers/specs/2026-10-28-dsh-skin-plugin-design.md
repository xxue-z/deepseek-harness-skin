# DeepSeek Harness 皮肤插件设计（Codex-Skins 移植）

日期：2026-10-28
状态：待批准

## 1. 背景与目标

`C:\Users\deyu.zhu\Documents\project\Codex-Skins` 是 Codex 桌面版的主题系统：主题包由
`theme.json`（配色 + 文案 + 壁纸焦点）、`theme.css`（Safe CSS）、`background.jpg` 组成，
安装在 `%LOCALAPPDATA%\CodexDreamSkin\themes\<id>\`，由 Codex Dream Skin 引擎注入。

本插件把同一套主题资产（含壁纸、配色、文案元数据）搬到 DeepSeek Harness 桌面版
（Electron + Web GUI）上，并补齐 Codex-Skins 的"主题管理 + 导入 + AI 设计"体验。

### 目标

1. **主题管理界面**：仿 Codex-Skins 主题管理器（主题库、当前主题、透明度、删除、详情）。
2. **导入 Codex 主题**：扫描本机 Codex 主题目录，或导入文件夹 / ZIP 主题包，转换成 DSH 主题并入库显示。
3. **主题设计智能体**：用户给文字描述（可带图片），生成或修改一个 DSH 主题，结果作为草稿出现在管理界面。
4. 主题可真正作用到 DSH 界面（壁纸 + 配色 + 面板透明度），并且重启后保持。

### 非目标（v1）

- 视频壁纸（`background.mp4`）：只记录元数据，不播放。
- Codex `theme.css` 里 `[data-ds-part=...]` 选择器的逐条翻译：v1 只提取其中的
  `font-family` / 圆角 / 阴影等全局可复用声明，不逐部件映射 DSH DOM。
- 发布/分发主题包到插件市场。

## 2. 形态

一个持久化 bundle：`@local/dsh-skin`，同时含 Host 半（Node）和 Web 客户端半（浏览器）。

- Host 半：读取/写入主题库、扫描与转换 Codex 主题、ZIP 解包、调用 LLM 生成主题、
  注册 `skin_*` 工具、提供 `/skin/...` HTTP 接口。
- Web 客户端半：设置页 UI（主题库 + 导入 + AI 设计），通过同源 `fetch('/skin/api/...')`
  与 Host 通信，通过 `ctx.theme` 应用主题并注入壁纸样式表。

安装方式：`plugin_manager install_bundle`，包目录即本仓库。

## 3. 数据与存储

存储根：`<DSH_HOME>/skin/`（可用插件 Config `dataDir` 覆盖）。

```
skin/
  state.json                     # { activeId, transparency: { [id]: 0-100 } }
  themes/<skinId>/
    theme.json                   # DSH 主题（见下）
    wallpaper.<ext>              # 壁纸（从 Codex 复制）
```

DSH 主题 JSON：

```jsonc
{
  "schemaVersion": 1,
  "id": "skin.crimson-mecha-nova",
  "name": "Crimson Mecha Nova",
  "description": "星云之下，钢铁苏醒。",
  "appearance": "dark",              // light | dark | auto
  "origin": { "kind": "codex-import|generated|manual", "codexId": "...", "path": "..." },
  "wallpaper": { "file": "wallpaper.jpg", "focusX": 0.72, "focusY": 0.42, "dim": 0 },
  "colors": {
    "background": "#0a1416", "panel": "#101d20", "panelAlt": "#17292c",
    "accent": "#e0334a", "accentAlt": "#f2c14e", "secondary": "#3fd2d8",
    "highlight": "#8c1f2c", "text": "#eef4f2", "muted": "#9db3ae",
    "line": "rgba(242, 193, 78, .28)"
  },
  "typography": { "fontFamily": null },
  "surface": { "radius": 18, "blur": 16 },
  "codex": { "brandSubtitle": "...", "tagline": "...", "statusText": "...", "quote": "...", "promoUrl": "..." },
  "css": "",                          // 可选：AI 或用户补充的皮肤 CSS（白名单校验）
  "createdAt": "2026-10-28T00:00:00.000Z"
}
```

透明度沿用 Codex 语义：从 `colors.panel` 的 alpha 推导"作者透明度"（默认 30），
用户可在管理界面覆写，覆写值存 `state.json`。

## 4. 配色 → DSH token 映射

DSH 主题以 alias token 表达（`--dsw-alias-*`，见 `Theme` 检查器）：

| DSH token | 来源 | 说明 |
|---|---|---|
| `--dsw-alias-bg-base` | background | 画布；按透明度加 alpha，让壁纸透出 |
| `--dsw-specific-sidebar-fill` | panel | 侧栏 / 标题栏 |
| `--dsw-alias-bg-layer-1` | panel | 主表面 |
| `--dsw-alias-bg-layer-2` | panelAlt | 次级表面 / 浮层 |
| `--dsw-alias-bg-overlay` | panelAlt | 弹层 |
| `--dsw-alias-border-l1` / `-l2` | line | 描边（l2 提高不透明度） |
| `--dsw-alias-label-primary` | text | 主文字 |
| `--dsw-alias-label-secondary` | muted | 次文字 |
| `--dsw-alias-brand-primary` | accent | 品牌色 / 主按钮 |
| `--dsw-alias-state-error-primary` | accent | 错误态 |
| `--dsw-alias-state-warn-primary` | accentAlt | 警告态 |
| `--dsw-alias-state-success-primary` | secondary | 成功态 |
| `--dsw-alias-state-idle-primary` | muted | 空闲态 |

壁纸层用插件自有 `<style data-plugin>` 注入：`body::before` 固定铺满、`background-size: cover`、
`background-position` 由 `focusX/focusY` 决定，`#root` 提升到其上方；表面 token 带 alpha，
视觉上等价于 Codex 的"半透明面板 + 壁纸"。

主题注册：`ctx.theme.register({ id, colorScheme, tokens })`；切换用 `ctx.theme.setTheme(id)`；
透明度变化用 `ctx.theme.overrideTokens('dsh-skin', {...})` 热更新，不重注册。

**持久化**：DSH 的内置主题偏好 schema 不接受第三方主题 id，所以插件自己持久化
`state.json.activeId`，激活时先注册全部主题再 `setTheme`。

## 5. 管理界面

位置：设置面板新增一节「主题皮肤」（`settings.section`，`id: skin`，`order: 12`）。
布局参照 Codex-Skins 管理器 + DSH Plugin Manager 的列表语言。

- 顶部工具条：`导入 Codex 主题` / `扫描本机主题` / `AI 设计` / `刷新`
- 主题画廊：卡片（壁纸缩略图、名称、明暗徽标、来源徽标、当前使用标记）
- 选中态详情面板：名称、描述、色板、来源（Codex id / 路径）、壁纸焦点、创建时间
- 操作：`应用` / `透明度` 滑杆（0–100，实时预览）/ `删除`（二次确认）/ `导出 JSON`
- 导入结果反馈：成功 N 个、跳过（无 theme.json）、失败原因逐条列出

## 6. 导入与转换

入口三种：

1. `扫描本机`：默认扫 `%LOCALAPPDATA%\CodexDreamSkin\themes\*`（Config 可改），
   同时扫插件仓库 `release/theme-packs` 若存在。
2. `导入文件夹`：输入/选择目录，目录内（或一层子目录内）有 `theme.json` 即可。
3. `导入 ZIP`：Codex 主题包 `.zip`（`theme.json` + `theme.css` + 壁纸在根或一层子目录）。
   ZIP 解析用内置 `zlib.inflateRaw` 实现的最小读取器，不引第三方依赖。

转换规则（`convertCodexTheme`）：

- `id` → `skin.<codexId 去掉 studio./usr- 前缀>`；重名追加 `-2`
- `name`、`tagline` → `name`、`description`
- `colors` 缺省或 `preset-*`（无 colors 字段）时：从壁纸提取主色，再按明暗推导全套色板
- `appearance` → `appearance`（`auto` 保留，应用时按当前系统色）
- `image` → 复制为 `wallpaper.<ext>`；`art.focusX/focusY` → `wallpaper.focusX/focusY`
- `theme.css` → 只提取 `font-family`、`border-radius`、`box-shadow` 中安全的部分写入 `surface`/`typography`；
  原文另存 `codex.themeCss` 供详情查看（不执行）
- `brandSubtitle` / `statusText` / `quote` / `promoUrl` → `codex.*` 元数据

## 7. 主题设计智能体

界面：管理页「AI 设计」抽屉 —— 描述输入框、图片拖放、`以当前主题为基底` 开关、生成按钮、预览与"保存草稿 / 应用"。

管线：

1. 客户端读图 → canvas 取主色（最多 6 个）与平均亮度 → 作为 `palette` 随请求上传；
   图片原图以 data URL 上传，Host 落盘为壁纸候选。
2. Host 调 `ctx.llm.stream()`：
   - provider/model 取 `ctx.agentDefaultModel.currentSelection()`（Config 可覆盖）
   - system prompt 固定为"输出 JSON 主题，字段与取值域"，要求只返回 JSON
   - user prompt = 描述 + 调色板 + 基底主题（可选）
3. 解析 JSON → 校验/补全（对比度修正、未知字段丢弃）→ 生成 `skin.generated-<slug>` 草稿
4. LLM 不可用 / 解析失败 → 走确定性回退：按描述关键词 + 图片调色板推导色板，仍产出草稿，
   并在界面标注"离线配色"。

同一个服务方法同时暴露成 Host 工具，供对话中的智能体调用：

- `skin_theme`：`action: list | get | import | apply | delete | transparency | design`
  —— 与界面共用同一实现（`skinStore` 服务），没有第二套逻辑。

## 8. 验证

- 安装后：`cordis_inspect_query` 确认 Host 行与 Client 模块注册；设置页出现「主题皮肤」。
- 导入：扫描本机 8 个 Codex 主题 → 全部入库；逐个应用，检查 `body` 的 token 内联值、
  壁纸层、侧栏/主区透明度。
- 生成：给"赛博霓虹"文字 + 一张图，产出草稿并可应用。
- 透明度：0/100/中间值切换，刷新页面后保持。
- 删除：删除非当前主题；尝试删除当前主题时给出明确拒绝。
- 无浏览器控制时，报告"页面渲染未亲验"，附上可复核的接口与样式证据。

## 9. 风险

- DSH 主题偏好 schema 不持久化第三方 id → 插件自持久化 + 启动重放（已设计）。
- 桌面窗口的 Windows 标题栏使用 `--dsw-specific-sidebar-fill`，透明度过高会影响可读性 →
  默认透明度 30%，并在过高时提示。
- LLM 输出不稳定 → 严格 JSON 解析 + 回退配色。
- 无 UI 自动化 → 以接口/样式/单测 + 用户目视为准。

## 10. 实现回填（与设计稿的差异）

落地时宿主机制给出的约束，逐条记录：

1. **跨半通信不是 RPC，是 HTTP 路由**。持久化 bundle 的 Web 半没有 `host.call`
   （那是会话内动态包的私有通道），也没有可用的 Remote 代码生成入口。因此 Host 用
   `webServer.register({kind:'prefix', path:'/skin'})` 暴露 JSON 接口 + 壁纸字节，
   仅监听回环地址、只读写皮肤库。
2. **不导出 `Config`**。插件被安装为指向源码目录的链接包，`@deepseek-ai/schemastery`
   无法从该目录解析。配置改为在 `apply(ctx, config)` 里手工校验并取默认值，
   `dataDir` / `codexDirs` / `designerModel` 仍可在 patch 行里覆盖。
3. **token 是 body 上的内联样式**。`ThemePresenter` 把 token 写成 `body.style` 内联；
   任何插件样式表的同名自定义属性都会被内联值压过。所以配色只能走
   `ctx.theme.register` / `overrideTokens`，样式表只承担壁纸层与非 token 样式。
4. **画布保底 18%**。Codex 把 `main` 设成全透明是有前提的（每条消息自带卡片）；
   本应用把对话文字直接画在画布上，所以转换时对画布 alpha 取 `max(authored, 0.18)`，
   并给壁纸加一层背景色暗化（默认 18%–26%）。这是唯一一处刻意不追求"完全一致"的映射。
5. **`surface.alpha` 取自 Safe CSS 的部件**。`theme.css` 里 `sidebar` / `composer` /
   `dialog` / `root|main` 的 `background-color` alpha 分别映射到
   侧栏 / 主表面 / 弹层 / 画布；没有 `theme.css` 的主题则回落到
   `1 - transparency`。用户拖动"壁纸可见度"时统一覆盖这四个值（与 Codex 的
   `userTransparency` 语义一致）。
6. **诊断内建**。snapshot 里带 `client`（Web 半是否进入 boot graph、最后一次
   何时连上、上报的 slot/主题数）和 `tool`（`skin_theme` 是否注册成功及失败原因）。
   这不是调试残留：插件装好后如果设置页不出现，这两个字段就是第一手判据。
7. **输出 schema 不能用联合类型**。`ToolOutputDefinition.schema` 的 `type` 只接受
   单值，写成 `['string','null']` 会让整个注册静默失败（工具不出现且无报错）。
   改为 `text`/`activeId`/`ids` 三个普通字段、缺省用空串表示。
8. **底色方案由调色板亮度决定，不由 `appearance` 决定**。插件只替换 14 个 alias
   token，其余表面（菜单、代码块、行内代码、工具卡、hover 填充）全部沿用宿主内置的
   浅色或深色方案。若把浅色主题注册成 `dark`，输入框、消息体、行内代码会全部变成
   黑色块——第一版正是这个 bug（`appearance: "auto"` 的「蜡笔小新」被当作深色）。
   现在 `colorScheme = 面板/画布亮度加权 > 0.42 ? light : dark`，`appearance` 仅用于展示。
9. **输入框补一个非目录内 token**。会话输入卡读的是 `--dsw-specific-input-major`
   （不在 `Theme` 检查器列出的 14 个 alias 里），补成半透明 `panelAlt` 才像 Codex
   那样是玻璃卡片，而不是实心块。
10. **透明度必须分层，不能一个数用到底**。Codex 给每类表面单独的 alpha：画布/侧栏透出壁纸，
   卡片、弹窗、浮动面板接近实心。第二版把用户透明度（70% → 全表面 0.3）统一套在所有
   token 上，结果设置面板变成"看穿对话"的玻璃窗，字叠字看不清。现在四类表面各留下限：
     - 画布 0.18 / 侧栏 0.26（跟随滑块，壁纸主场）
     - 卡片（layer-1）0.86
     - 弹窗与 dockkit 浮动面板（layer-2 / overlay）0.95
     - 输入卡 0.90
   滑杆的语义随之收窄为"画布与侧栏的壁纸可见度"，卡片与面板不再跟着变。
   `[role=dialog]` 额外加 `backdrop-filter: blur(18px)`，让半透明的模态成为玻璃卡。
11. **面板 token 的判断依据**：设置面板是 dockkit 浮动面板（`position:fixed` +
   `--dsw-alias-bg-layer-2` + `--dsw-radius-panel` + 阴影），不是画布。所以只调
   layer-2/overlay 就能让设置面板实心化，同时不动对话区的壁纸效果——这正是分层方案的
   关键前提。若宿主以后改用它 token，需要重新核对。