# 更新日志

版本号与 `package.json` 的 `version` 一致；同一个版本对应一个 git 标签（`v1.0.8`）和一次 GitHub Release。
每次发布更新三处：这里加一节、`package.json` 提升版本、打标签推送——剩下的由 GitHub Actions 自动完成。

包名（也是加载器解析的模块名）是 `@xxue-z/dsh-skin`：scope 属于作者本人，既避免与其它插件重名，
也表明它不从 npm 公共源安装。改名历史：`@local/dsh-skin` → `deepseek-harness-skin`（1.0.5，改了一半导致加载失败）
→ `@local/dsh-skin`（1.0.6）→ `@xxue-z/dsh-skin`（1.0.7）。

该插件从桌面版自带的那个版本起步，版本号记作 `1.0.1`。

## 1.0.8 — 2026-10-29

**自带两个默认主题**

- 首次启动把「蜡笔小新-春游」（浅色、动态，带 `background.mp4`）和「DeepSeek-鲸鱼娘」（浅色、静态）复制进皮肤库，新装不再是空列表。它们只是副本：改色、重命名、删除都只影响你的库，删掉的不会在下次启动自动回来（`state.json` 的 `seeded` 标记只允许一次）。

**修复：切到静态主题后 mp4 仍被占用**

- 原来切换主题只把 `<video>` 从 DOM 里摘掉，Chromium 的媒体缓冲（以及它在 Windows 上占用的文件句柄）要到应用退出才释放，于是 `video.mp4` 一直被锁着。
- 现在两处一起处理：客户端在拆掉视频层时清空 `src` 并 `load()`，让渲染进程丢弃缓冲；随后调用新的 `POST /skin/api/release-video`，Host 以「能否独占打开」判断句柄是否真的释放，仍被占用就在 700ms 后重试一次。
- 媒体响应的流改为在连接关闭时立即销毁，不再依赖事件顺序。
- 顺带修了 `store.remove()`：它重写 `state.json` 时只保留自己挑的几个字段，会悄悄丢掉 `video` 与 `seeded`。

**安装包与文档**

- 安装包现在包含 `bundled-themes/`，体积 7.3 MB；打包清单改由 `tools/pack-list.mjs` 生成（支持递归目录、可本地 `--check`），避免 CI 里的通配符漏掉子目录。
- README 顶部加入三张截图（两个默认主题 + 设置页）。

## 1.0.7 — 2026-10-29

**包名定为 `@xxue-z/dsh-skin`**

- 带上作者的 scope，避免与其它 `dsh-skin` 同名插件在同一 profile 内抢占 `node_modules/<包名>` 和浏览器模块 id（后者重复注册会直接抛 `duplicate factory registration` 并终止加载）。
- 同步位置：`package.json`（`name` 与 `pkg.name`）、`cordis.patch.yml`、`index.js` 的 `export const name`、`client.js` 的模块 id 与 `PLUGIN_ID`、`lib/service.js` 的客户端模块图诊断。行 id 仍是 `dsh-skin`，旧的配置覆盖继续有效。
- 升级前请先卸载旧名的安装（`plugin_manager` 里删掉那条，或手动移除 `node_modules/@local/dsh-skin`），否则旧 loader 行会去找一个已不存在的包。

## 1.0.6 — 2026-10-29

**包名回到 `@local/dsh-skin`**

- 1.0.5 为了让名字「看起来正式」把 `package.json` 的 `name` 改成了 `deepseek-harness-skin`，但这个名字是加载器实际解析的模块名，改名本身没有带来任何收益，反而要求所有引用同步改动。1.0.6 统一改回 `@local/dsh-skin`。
- 同步过的位置：`package.json`（`name` 与 `pkg.name`）、`cordis.patch.yml`、`index.js` 的 `export const name`、`client.js` 注册的模块 id、客户端模块图诊断里的包名。行 id 仍是 `dsh-skin`。
- 从 1.0.5 安装的用户需要重新安装一次（包名变了，`node_modules` 里的目录名随之变化）。

## 1.0.5 — 2026-10-29

**修复安装后插件无法加载**

- `cordis.patch.yml` 仍指向旧实例名 `@local/dsh-skin`，而安装的包名是 `deepseek-harness-skin`，加载器因此报 `ERR_MODULE_NOT_FOUND` 并跳过插件。行 id 保持 `dsh-skin` 不变（保留旧配置覆盖），模块名统一为包名。
- `index.js` 的 `name`、`client.js` 注册的模块 id、调试面板里的客户端模块名同步为包名。

**一并带上（1.0.4 之后的修复）**

- 设置分区注册失败时不再静默消失：会写入控制台并显示一条可见的错误提示。

## 1.0.4 — 2026-10-29

**安装包只装该装的东西**

- Release 附件改为真正的安装包：只包含 `index.js`、`client.js`、`lib/`、`locale/`、`cordis.patch.yml`、`icon.svg`、`package.json` 和 `README.md`、`CHANGELOG.md`；`.github/`、`docs/`、`tools/`、`.gitignore` 不再打包。
- 打包清单以 `package.json` 的 `files` 字段为唯一来源，并修正了通配符（`locale/*.json`）和目录条目（`lib`）的展开——1.0.3 的包里 `lib/` 曾经整个丢失。

## 1.0.3 — 2026-10-29

**发布流程自动化**

- 新增 GitHub Actions 工作流：推一个 `v*` 标签后自动校验版本一致、跑两套自测、打成源码包并生成 sha256，再用标签对应的 CHANGELOG 小节创建 GitHub Release。
- 只用仓库自带的 `GITHUB_TOKEN`，不需要配置任何 secret；`-rc` / `-beta` 标签发布为预发布，不抢 `latest`，方便先验证附件。
- 工作流支持手动触发（传入标签名重跑同一次发布）。

**应用内更新更稳**

- 「检查更新」现在优先使用 Release 附件里的源码包，并在安装前用附带的 `.sha256` 校验；没有附件时才退回标签 tarball。

## 1.0.2 — 2026-10-29

**动态壁纸**

- Codex 主题包里的 `background.mp4` 会和海报一起导入，导入时做结构校验：H.264（`avc1`）、单视频轨、≤16 MB、支持 `Range` 请求播放；HEVC / AV1 / 分片 MP4 会跳过视频但保留海报，并给出原因。
- 客户端在 `#root` 之下挂一个固定 `<video>` 层；海报始终是底，视频 `loadeddata` 后淡入。解码失败、自动播放被拒、系统「减少动态效果」、窗口隐藏都会退回海报或暂停，不会黑屏。
- 「动态主题设置」弹窗：自动播放、静音、播放/暂停快捷键（`Ctrl+Alt+P`，注册进宿主的快捷键系统，应用不在前台也能用，可在「设置 → 快捷键」改键位）。
- 动态壁纸上线前导入的皮肤，详情里会提示「原主题带 MP4」并给出「补全动态背景」，只重读 mp4，不动配色和透明度。

**AI 主题设计**

- 设计模型改成下拉框，读宿主实时的模型目录（和聊天框同一个注册表，按供应商分组），并标注哪些模型不能看图。
- 描述之外可以附一张图片和一段 MP4：只给图片 → 静态主题；只给视频 → 浏览器抽首帧当壁纸与静态回退，视频循环播放；两个都给 → 图片当壁纸、视频当动态背景。
- 设计时会把参考帧作为图片块发给模型，并说明视频会循环播放，让模型挑更安静的配色和暗化程度。
- 高级里只保留「主题名」；氛围和额外要求直接写进描述。
- `skin_theme` 工具支持 `imagePath` / `videoPath`（本地路径或 http URL）和 `name`。

**接口**

- 新增 `GET /skin/api/models`、`POST /skin/api/video-settings`、`POST /skin/api/refresh-video`。
- `/skin/assets/<id>/video` 支持字节范围（`206` / `416`）。

## 1.0.1 — 2026-10-28

- 动态壁纸此前只记录 `codex.video` 元数据，不播放；这一版是后面 `1.0.2` 的起点。

## 1.0.0 — 2026-10-28

- 首个版本：Codex 主题扫描与导入、皮肤库、壁纸可见度、AI 设计、`skin_theme` 工具。