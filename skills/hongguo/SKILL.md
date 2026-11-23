---
name: hongguo
description: "红果短剧/漫剧：读这台电脑上的观看历史与追更、按方向搜索、推荐漫剧短剧，并给出分享链接或直接把某一集变成背景视频播放。"
version: 1.0.0
platforms: [windows]
metadata:
  hermes:
    tags: [hongguo, 红果, 短剧, 漫剧, 番茄, drama, recommend]
    related_skills: []
---

# 红果短剧（hongguo）

用 `hongguo` 工具跟这台电脑上的红果客户端对话：它的观看历史、追更、搜索、推荐、分享链接、背景播放。

## 这个工具从哪来

`hongguo` 是 `@xxue-z/dsh-skin`（皮肤插件）注册的工具。它不直接调用红果接口——
红果的每个请求都要带 `X-Argus`（字节混淆 VM 算的）和 `X-Gorgon` 签名，纯脚本复现不成立。
所以插件把**红果电脑版**当成本地引擎：没装就自动下便携版，用 CDP 端口静默启动
（窗口被挪到屏幕外的负坐标），再通过它的 Wails 绑定 `window.go.app.App.*` 办事。

## 第一次用

```
hongguo(action: "status")
```

返回里看三件事：

- `引擎`：`复用已在运行的实例` / `已静默启动` / `已下载便携版并启动`
- `登录`：`已登录 昵称（uid …）` 或 `未登录`
- `分类`：`关注(45) 漫剧(36) 真人剧(39) 推荐(16)`

没登录就让用户扫码：

```
hongguo(action: "login")                  # 开始扫码流程
hongguo(action: "login", confirm: true)   # 扫完在手机上确认后，轮询一次结果
```

## 读历史、找方向

```
hongguo(action: "history")                  # 这台电脑看过什么（含看到第几集、多少秒）
hongguo(action: "history", limit: 50)
hongguo(action: "recommend")                # 首页推荐流
hongguo(action: "search", query: "逆袭")     # 搜索
hongguo(action: "series", seriesId: "…")    # 某部的详情 + 分集表
```

`history` 每行形如 `1. 曲曲爆火，百万粉丝却求我别写了 — 98集 · 看到第1集 37s · id 7677895810238925886`。
`episode` 一律是 **1 基**（第 1 集 = `1`）。

## 推荐怎么做

用户说"推荐几部"、"我在看 X，还有类似的吗"、"想要穿越/逆袭/古装"时：

1. `history` 看他在看什么（题材、标签、看到第几集、有没有追更）。
2. `search` 或 `recommend` 拉候选；`recommend` 的条目里 `kind: "comic"` 是**漫剧**，
   `kind` 为其他值是真人剧；`tags` 给题材（如 `["脑洞","穿越","逆袭","古代"]`）。
3. 挑 3–5 部，逐条给 `title` + `tags` + 一句为什么像他口味 + `seriesId`。
4. 用户想看某一集，再走下面的播放。

不要一次列几十部；他刚看完的不要立刻再推。

## 播放

三种 `mode`：

- **`share`（默认，最稳）**：给一个 `https://novelquickapp.com/s/…` 链接，手机上打开就能播。
- **`url`**：给一个本机同源地址 `/skin/hongguo/media?u=…`，可在 DSH 里直接播放/预览。
- **`background`**：把这一集整集下载进皮肤的背景视频目录并打开播放列表，
  于是**桌面背景就开始放这一集**。

```
hongguo(action: "play", seriesId: "7677895810238925886", episode: 1, mode: "share")
hongguo(action: "play", seriesId: "…", episode: 3, mode: "background")
hongguo(action: "play", seriesId: "…", episode: 3, mode: "background", prefetch: 3)
hongguo(action: "prefetch", seriesId: "…", episode: 4, prefetch: 5)   # 只补文件，不动背景
hongguo(action: "clips")                     # 看已下载的背景片段
hongguo(action: "clips", clips: "clear")     # 清空
```

### 连播与预取

背景视频列表本来就**播完自动切下一集**（只有一个片段时才循环）。要让切换时不等下载，
用 `prefetch` 提前把后面几集拉到本地：

- `play mode="background", prefetch: N`：先播当前集，再顺序预取第 N 集之后的 `N` 集。
- `action="prefetch", episode: K, prefetch: N`：只补文件、不切背景列表，适合"提前存着"。
- 上限 `10`，默认 `play` 时 `0`、单跑 `prefetch` 时 `3`；已存在的集会自动跳过，所以重复调用是安全的。
- 预取是**顺序**做的：每集要一次 `PlayInfo` + 一次本机代理传输，并发没有收益。

`background` 会把视频存到皮肤数据目录的 `hongguo/clips/<剧名> 第N集.mp4`，
并把背景视频列表切换过去。几点必须转告用户：

- 红果只提供 **HEVC(H.265)** 编码。Chromium 要看它，系统得装「HEVC 视频扩展」；
  播放器目录里就带了一个 `HEVC视频扩展-双击安装.appx`。装了还是黑屏就换 `share` 模式。
- 背景视频列表的开关是内存态，**重启 DSH 后要重新打开**（设置里可一键开）。
- 一集 1080p 大约 20 MiB；下载走本机代理分块拉取，通常一两秒。

## 排错

| 现象 | 处理 |
| --- | --- |
| `获取播放地址失败: 服务端返回了空内容…` | 这台电脑的红果拿不到播放地址，提示用户去客户端 `设置 → 播放` 填自己手机红果 App 的设备号 |
| 黑屏但下载成功 | HEVC 扩展没装；或换 `mode: "share"` |
| `引擎启动超时` | 单实例已被占用（用户开着红果窗口），提示他关掉，或设 `DSH_HONGGUO_CDP_PORT` 换个端口 |
| 封面/视频 502 | 红果客户端退出了；重新 `status` 会再拉起 |