# 更新日志

版本号与 `package.json` 的 `version` 一致；同一个版本对应一个 git 标签（`v1.0.8`）和一次 GitHub Release。
每次发布更新三处：这里加一节、`package.json` 提升版本、打标签推送——剩下的由 GitHub Actions 自动完成。

包名（也是加载器解析的模块名）是 `@xxue-z/dsh-skin`：scope 属于作者本人，既避免与其它插件重名，
也表明它不从 npm 公共源安装。改名历史：`@local/dsh-skin` → `deepseek-harness-skin`（1.0.5，改了一半导致加载失败）
→ `@local/dsh-skin`（1.0.6）→ `@xxue-z/dsh-skin`（1.0.7）。

该插件从桌面版自带的那个版本起步，版本号记作 `1.0.1`。

## 1.0.19 — 2026-10-30

**修复：切换画中画等设置会把视频文件夹路径清空**

- 两条路一起丢的：
  1. **Host**：设置接口总是带上 `folder` 字段，开关画中画时它是 `undefined`，
     而 `setPlaylistSettings` 把它摊开合并进当前设置，等于用「空」覆盖了已保存的文件夹。
  2. **客户端**：即便 Host 回了空文件夹，接收快照时也照单全收，
     于是界面上的路径被清空（`state.json` 里 `folder` 变空，历史记录还留着旧路径）。
- Host 侧：`folder`/`speed`/`pictureInPicture`/`history` 只有在**明确给出值**时才写入，
  `undefined`/`null` 一律视为「保持原样」。
- 客户端侧：快照里出现空文件夹时不再无条件覆盖——只有本页主动清空（或 Host 明确标记重置）
  才会真的清空；顺手修复后仍可正常「清空/重新选择」文件夹。
- 回归测试：Host 5 条（`undefined`/`null` 不覆盖、切换画中画保留文件夹与倍速）、
  客户端 3 条（无关请求返回空文件夹不清空、显式清空仍生效、之后仍能重新选择）。
  两个假 Host 都改成与真实 Host 相同的合并语义。

## 1.0.18 — 2026-10-30

**修复：画中画被 `disablePictureInPicture` 属性拒绝**

- 1.0.17 已经会发请求，但视频元素一直带着 `disablepictureinpicture` 属性——
  那是早期为了「不让原生控件压住界面」加的。Chromium 只要看到这个属性就直接抛
  `Failed to execute 'requestPictureInPicture': "disablePictureInPicture" attribute is present`，
  所以浮窗永远打不开。
- 现在属性跟随开关：**开**时移除，**关**时加回（同时把浏览器自带的画中画菜单项也关掉）。
  元素创建时不再无条件加这个属性。
- 修复前必须注意的一点：`disablePictureInPicture` 是**属性**，设置 `.disablePictureInPicture = false`
  并不会清掉它，只能用 `removeAttribute`——这也是上一版只改请求条件却没生效的原因。
- 测试桩现在按 Chromium 语义在属性存在时直接拒绝请求，并断言「请求没有被浏览器拒绝」
  （而不只是「发出了请求」）；用旧代码重跑会红 5 项，与线上现象一致。

## 1.0.17 — 2026-10-30

**修复：打开「小窗口播放」后没有出现小窗口**

- 旧逻辑只有在背景视频**正在播放**时才会请求画中画
  （`applyPictureInPicturePreference` 里的 `!video.element.paused` 判断）。
  背景被暂停、或打开开关时元素正要重建，请求根本不会发出，于是开关看起来像没生效。
- 现在开关本身就是用户手势：点开即对当前视频请求画中画，**暂停中的视频也能弹出**
  （浏览器会在浮窗里自动开始播放），不必先让它在后台播起来。
- 浏览器拒绝时不再静默吞掉：面板会把原因显示出来（如「画中画打开失败：…，可先点一下视频再试」），
  并提示「视频列表开关关闭时没有可弹出的背景视频」。
- 回归测试新增画中画一节：测试桩补齐 `pictureInPictureEnabled` / `pictureInPictureElement` /
  `requestPictureInPicture` 语义，断言开关会发起请求、暂停的视频同样能弹出、关闭开关会收掉浮窗、
  浏览器不支持时既不弹窗也不抛错。

## 1.0.16 — 2026-10-30

**修复：视频列表的视频盖住整个界面**

- 视频列表层曾被抬到 `z-index:1`，而 `#root` 只有在主题自带壁纸或 MP4 时才会被抬到 `z-index:1`。
  在没有壁纸的主题上 `#root` 没有自己的层叠上下文，于是这一层压在所有面板之上，
  整个 DeepSeek Harness 界面都被视频盖住。
- 视频列表现在和主题自带视频一样只是**背景**：始终 `z-index:0`，位于 `#root` 之下，
  绝不再高于任何界面元素。
- 无壁纸/无 MP4 的主题挂上视频列表时，由插件样式表补一条 `#root{position:relative;z-index:1;}`，
  让应用外壳仍在视频之上；关闭视频列表时这条规则随之消失，主题恢复原样。
- 回归测试新增一个「无壁纸无视频」的主题夹具，断言：管理样式里绝不出现把视频层抬高到 0 以上的规则、
  该主题在视频列表开启时会抬起外壳、关闭后样式表恢复。

## 1.0.15 — 2026-10-30

**修复 1.0.14 的「接口返回异常（HTTP 200）」**

- `/skin/update-check` 在并入磁盘版本信息时漏掉了响应信封里的 `ok: true`。设置页以
  `payload.ok === true` 判断接口是否成功，于是一个内容完全正确的响应被当成失败，
  检查更新只显示「接口返回异常（HTTP 200）」。
- 补回 `ok`，并新增回归测试：断言两条更新路由都带 `ok` 信封，而不只是字段齐全——
  这正是 1.0.14 的测试没发现它的原因。

## 1.0.14 — 2026-10-30

**已安装但未重启时，不再提供重复下载**

版本号在进程启动时读取，替换文件后不会变，于是「下载并更新」会一直认为还有新版本可装：
按钮反复出现，每点一次都重新下载并再次替换同一份文件。

- Host 新增 `GET /skin/update/state`：读取**磁盘上** `package.json` 的版本，与内存中正在运行的
  版本对比，给出 `runningVersion` / `diskVersion` / `pendingRestart`。
- `/skin/update-check` 把磁盘版本纳入判断：当磁盘上已是该版本时，`updateAvailable` 为
  `false`，另以 `alreadyInstalled` 说明「已装好，重启即可」。
- 设置页据 `pendingRestart` / `alreadyInstalled` 隐藏下载按钮，改为提示
  「{version} 已安装，重启应用后生效（当前运行的仍是旧版本）」；更新完成时立即刷新状态，
  按钮当场消失。

## 1.0.13 — 2026-10-30

**「下载并更新」真正可用：代理下载、解压安装、进度百分比**

- **下载改由 Host 代理**（`POST /skin/update/download`）。原来由页面跨域去 GitHub 取包，而
  `github.com` 的 302 和 `release-assets.githubusercontent.com` 的响应都不带
  `Access-Control-Allow-Origin`，浏览器必定报 `Failed to fetch`；无论怎么跟随重定向都绕不过去。
  Host 不受 CORS 约束，由它取包再以同源返回。只接受 https + GitHub 域名，且按声明长度与实际
  字节双向校验 64 MB 上限，120 秒超时。
- **安装前解压更新包**。发布的资产是 `.tar.gz`，而 `stageUpdate()` 以前把它原样存成 `bundle.tgz`
  就去检查 `package.json`，所以这个按钮**从来没有成功过**。现在 Host 用 `node:zlib` 自行解包
  （不依赖系统 tar），带路径穿越防护、解压体积上限，只接受普通文件与目录。
- **下载显示百分比**。响应改为流式读取，逐块回调进度；最后一字节到达前最高显示 99%，收全才跳 100%。
  总数优先取响应的 `content-length`，其次取更新检查里的资产大小。
- **替换后要求重启，不再假装生效**。Host 的版本号与模块都是进程启动时加载的，原来只刷新页面，
  于是界面显示已更新而版本号仍停在旧值。现在明确提示「已替换为 X，当前运行的是 Y，重启后生效」。
- **不再给出无效的重试建议**。更新包损坏、插件目录是符号链接这类重试必然失败的情况，提示里不再
  追加「可以再点一次」。

## 1.0.12 — 2026-10-29

**版本号对齐的补发**

- 只提升版本号，代码与 1.0.10 相同：1.0.11 的标签与发布工作流因 `package.json` 版本号与
  `CHANGELOG.md` 小节未同步而失败，没有产出安装包；本次补齐两处后重新发布。
- 插件行为无变化，已装 1.0.10 的用户无需升级。

## 1.0.10 — 2026-10-29

**设置页「下载并更新」的失败不再是 `Failed to fetch` 一句话**

- 下载失败时给出原因与下一步（网络 / 代理 / 跨域，可改用「打开发布页」手动下载附件）。
- 插件目录是符号链接（profile 里用 `install_bundle` 链接进来的仓库）时，Host 直接拒绝替换并说明
  该去哪个目录 `git pull`；此前会静默地把暂存目录换进 profile，页面照常刷新而版本没变。
- 下载成功但替换失败时提示「可再点一次重试」；手动安装的替换完成后按钮恢复可见，不再像卡住。

## 1.0.9 — 2026-10-29

**动态主题设置 → 高级设置（视频列表）**

- 设置弹窗底部新增默认折叠的「高级设置」：启动注入视频列表开关、视频列表文件夹、
  播放倍速（0.5×–2×）、小窗口播放（画中画）、历史播放文件夹、播放进度与开关快捷键。
- 打开开关后向当前主题（含静态主题）注入视频并按文件夹自然顺序逐集播放；关闭即移除，
  动态主题回到自带 MP4，静态主题一张标签都不留。
- 单个背景视频元素：列表顶替主题自带的那一个，不叠加，所以 `Ctrl+Alt+P` 播放/暂停与静音、
  倍速对列表同样生效；列表开关是独立的 `skin.togglePlaylist`，默认 `Ctrl+Alt+L`。
- 进度按「文件名 + 大小 + 修改时间」记到 `state.json` 的 `playlist.position`，重启后从上次那个
  与那一秒续播；文件被删则回落到原序号。**开关本身每次启动都会关闭**（只存在 Host 内存里），
  用快捷键或设置页重新打开。
- Host 新增 `lib/playlist.js`（列目录、排序、签名、路径校验）与
  `/skin/api/videos`、`playlist-settings/-enabled/-track/-history`、`pick-folder`、`open-folder`、
  `/skin/assets/playlist/video`；媒体输出抽成共用的 `serveFile`（Range 行为不变）。
- 目录选择器从 `pickSource` 抽出为 `pickDirectory`，主题导入的行为不变。

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