# Sleep · 助眠环境音 — 技术规格

## 概述

高质量环境音，无缝循环，倒计时停止，移动端熄屏持续播放，用于助眠。

基于 [HaujetZhao/Sleep](https://github.com/HaujetZhao/Sleep) (MIT License) 重构与优化，主要改进：音频编码从 MP3 192k 降至 Opus 64k，淡入淡出由运行时处理改为构建时烘焙，保证音质的同时单文件产物的占用大幅降低。

## 技术栈

- Vue 3.5 + Vite 8
- Font Awesome Free 7（全量 webfont）
- 浏览器：Chrome / Edge（仅支持 Chromium 内核）
- 音频：OGG Opus 64k CBR

## 项目结构

```text
Sleep/
├── index.html                      # Vite 入口，全局 CSS 重置
├── package.json                    # 依赖和构建脚本
├── vite.config.js                  # 单文件构建配置（dev + build）
├── vite.config.pwa.js              # PWA 构建配置（manifest + service worker）
├── LICENSE                         # MIT License
├── README.md                       # 简介、用法、素材来源
├── CHANGELOG.md                    # 面向使用者的版本更新说明
├── SPEC.md                         # 本文件
├── .nvmrc                          # 固定 Node.js 版本
├── .gitignore
├── .github/workflows/
│   ├── deploy.yml                  # push main → 构建 PWA → 部署 GitHub Pages
│   └── release.yml                 # push v* tag → 构建单文件 → Release 附件
├── scripts/
│   ├── build-audio.mjs             # 构建时音频转码：MP3 → Opus 64k + 烘焙淡入淡出
│   ├── doctor.mjs                  # Node、FFmpeg 和音频源环境检查
│   ├── check-release.mjs           # 单文件 Release 附件完整性检查
│   ├── generate-checksum.mjs       # 生成 Release SHA-256 校验文件
│   └── check-audio-seams.mjs       # OGG 产物与时长完整性检查
├── public/
│   ├── favicon.svg                 # 网站图标
│   ├── icon-192.png               # PWA 图标
│   └── icon-512.png               # PWA 图标
├── assets/
│   └── 示例图.png                  # README 截图
├── src/
│   ├── main.js                     # 入口：挂载 Vue + 引入 Font Awesome
│   ├── App.vue                     # UI 编排：选择页/播放页、音源下拉、面板开关
│   ├── usePlayer.js                # 播放引擎 composable：双 audio 轮换、倒计时、Media Session
│   ├── useAudioCache.js            # Cache Storage 下载、验证与状态机
│   ├── audio-config.js             # 播放器和转码脚本共用的淡变配置
│   ├── audio-sources.js            # 音源清单（静态 import .ogg）
│   ├── countdown.js                # 倒计时预设 + 格式化函数（含自检）
│   └── components/
│       └── CustomDurationPicker.vue # 自定义时长径向圆盘选择器
└── src/audio/
    ├── 01 - 打雷下雨.mp3           # 源文件（提交到 git）
    ├── 02 - 倾盆大雨.mp3
    ├── 03 - 淅沥下雨.mp3
    ├── 04 - 海边礁石.mp3
    ├── 05 - 夜晚蟋蟀青蛙.mp3
    ├── 06 - 旷野.mp3
    └── *.ogg                       # 构建产物（.gitignore 排除）
```

## 构建流程

### 音频转码（`npm run build:audio`）

`scripts/build-audio.mjs` 在构建前运行：

1. 扫描 `src/audio/` 下的 `.mp3` 文件
2. 用 `ffprobe` 获取每段音频时长
3. 用 `ffmpeg` 转码：MP3 → OGG Opus 64k CBR，同时烘焙 5 秒等功率淡入淡出
4. 产物 `.ogg` 写入 `src/audio/`（被 `.gitignore` 排除）

当 MP3 或共享淡变配置变化时会自动重新转码；若修改了编码参数，运行 `npm run build:audio -- --force` 全量重建。

```bash
ffmpeg -i input.mp3 \
  -af "afade=t=in:st=0:d=5:curve=squ,afade=t=out:st={duration-5}:d=5:curve=squ" \
  -c:a libopus -b:a 64k -vbr off output.ogg
```

### 单文件构建（`npm run build`）

```text
build:audio → vite build (vite.config.js)
```

- `vite-plugin-singlefile` 将所有资源（JS/CSS/woff2/ogg）base64 内联进单个 `dist/index.html`
- `assetsInlineLimit: 100MB` 确保 ogg 也被内联
- 产物可在 `file://` 协议下直接打开（U 盘使用）
- 当前六段 90 秒音源的产物约 7 MB；大小会随音频数量与时长变化

### PWA 构建（`npm run build:pwa`）

```text
build:audio → vite build (vite.config.pwa.js)
```

- `vite-plugin-pwa` 生成 manifest + service worker
- 音频为独立 `.ogg` 文件，不走内联
- 产物部署到 GitHub Pages

## 核心架构

### 播放引擎：双 `<audio>` 轮换 + 构建时淡变

**原版方案（已替换）**：运行时 `decodeAudioData` → 改振幅 → `wav-encode` → blob URL
**当前方案**：构建时 ffmpeg 烘焙淡变 → `<audio>` 直接播放 ogg data URI / 相对路径

1. **淡变已烘焙进音频文件**：每段 ogg 的开头 5 秒和结尾 5 秒使用平方根（`squ`）等功率淡入淡出
2. **双 `<audio>` 实例（A、B）**：`loop=false`，每段播一次自然停
3. **轮换触发用 `timeupdate` + 定时器 + `ended` 兜底**：当前段播到 `duration - 5` 秒时启动下一段，两段重叠 5 秒实现无缝交叉淡变
4. **运行时零处理**：不需要 AudioContext、wav-encode、blob 缓存

### 倒计时：墙钟驱动，与音频交接独立

- 计时用 `Date.now()` + `setInterval(250ms)` 刷新显示
- `formatCountdown(ms)`：≥1 小时 `H:MM:SS`，否则 `M:SS`，向上取整到秒
- 倒计时到点自动停止播放

### 暂停/继续：原地恢复

三态状态机：`idle / playing / paused`

- **暂停**：保留最新一段的进度，已过交接点的老段归零停掉
- **继续**：保留段原地接播，重新注册交接监听与定时兜底
- **停止**：回到选择页，彻底清除

### Media Session（蓝牙耳机/通知栏控制）

- 注册 `play`/`pause`/`stop`/`playpause` handler
- 蓝牙耳机的播放/暂停键可控制应用
- 通知栏曲名随选中音源更新（`metadata.title = selectedName`）

### 缓存态图标（PWA 模式）

六态：`builtin`（单文件内联）/ `checking`（检查缓存）/ `downloading`（完整下载中）/ `local`（已验证缓存）/ `cloud`（未下载）/ `error`（下载失败）

- 单文件模式：ogg 内联为 data URI → 显示 `builtin`（绿勾）
- PWA 模式：点击云图标会完整下载并写入 Cache Storage；在线播放未下载音源时后台尝试同一操作
- 只有 `cache.put()` 后再由 `cache.match()` 验证成功才显示 `local`（绿勾）
- Workbox 对音频启用 Range Requests，支持 `<audio>` 的分段请求从完整缓存中读取

## 音源管理

`src/audio-sources.js` 中的 `AUDIO_SOURCES` 数组，每项 `{ key, name, file }`。

**添加新音源**：

1. 将 `.mp3` 文件放入 `src/audio/`
2. 在 `audio-sources.js` 中加一行 import + 数组条目
3. 构建时自动转码

## 自定义时长选择器

`CustomDurationPicker.vue` — 径向圆盘选择器：

- 两段式：先选小时（0-11）、释放后自动切分钟（0-59）
- SVG 圆盘 + Pointer Events（tap 与 drag 统一映射）
- 对外：`v-model:open` 控制显隐，`emit('confirm', ms)` 吐出毫秒数

## 关键决策记录

| 决策 | 原因 |
| ---- | ---- |
| 走 `<audio>` 不走 Web Audio 播放 | 移动端双 `<audio>` 可并发且熄屏持续；Web Audio 熄屏被挂起 |
| 淡变烤进文件，不走 JS 轮询 | `<audio>.volume` 无原生淡变 API，JS 轮询精度差且熄屏易糙；使用平方根曲线避免线性叠加的功率凹陷 |
| 用 Opus 64k 替代 MP3 192k | 助眠场景听感无差异，体积降低 60-75% |
| 构建时烘焙淡变，不用运行时处理 | 去掉 AudioContext + wav-encode，运行时零开销 |
| 用 `timeupdate` 不用 `setInterval` 触发轮换 | 熄屏漂移 + 误差累积；timeupdate 基于真实进度，误差不累积 |
| 倒计时用墙钟，与音频解耦 | 倒计时管"何时停"，timeupdate 管"段间交接" |
| 两套 Vite 配置分开 | PWA 需要独立外链文件（SW + manifest），单文件不需要 |
| 浏览器只支持 Chrome/Edge | Opus 编码在 Chromium 内核下完全支持，Safari 兼容性不在考虑范围 |

## CI/CD

### Deploy to GitHub Pages（`deploy.yml`）

- 触发：push `main` 分支
- 步骤：checkout → 安装 ffmpeg → `npm ci` → `npm run doctor` → `npm run test:countdown` → `npm run build:pwa` → `npm run check:audio` → 部署 Pages
- 访问：`https://leonlovecode.github.io/Sleep/`

### Release（`release.yml`）

- 触发：push `v*` 标签（如 `v1.0.0`）
- 步骤：checkout → 安装 ffmpeg → `npm ci` → `npm run doctor` → `npm run test:countdown` → `npm run build` → `npm run check:audio` → 重命名为 `Sleep.html` → `npm run check:release` → `npm run checksum:release` → 附加 `Sleep.html` 与 `Sleep.html.sha256` 到 Release
- 下载：`https://github.com/leonlovecode/Sleep/releases/latest/download/Sleep.html`

## 素材来源

音频来自 [Adobe Audition Sound Effects](https://www.adobe.com/products/audition/offers/AdobeAuditionDLCSFX.html)：

| 音频名 | 来源 |
| ------ | ---- |
| 01 - 打雷下雨 | `Weather\Weather Ambience Heavy Rain Thunderstorm Thunder 01.wav` |
| 02 - 倾盆大雨 | `Weather\Weather Ambience Heavy Rain Downpour Splatty 01.wav` |
| 03 - 淅沥下雨 | `Weather\Weather Ambience Rain Drips Water Splatty 01.wav` |
| 04 - 海边礁石 | `Ambience_2\Ambience Ocean Shore 01.wav` |
| 05 - 夜晚蟋蟀青蛙 | `Ambience_2\Ambience Night Crickets And A Bullfrog 01.wav` |
| 06 - 旷野 | `Ambience_2\Ambience Wilderness 01.wav` |

图标来自 [Font Awesome Free](https://fontawesome.com)。
