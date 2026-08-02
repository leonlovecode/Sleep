import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// PWA 构建配置：可安装、可离线的助眠环境音。
// 与 vite.config.js（dev server）分开——PWA 需要 service worker 与 manifest 这两个
// 独立外链文件，dev 用不到。两套配置比 if/else 污染主配置清晰。学习自 subtap 项目。
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Sleep · 助眠环境音',
        short_name: 'Sleep',
        description: '高质量环境音无限循环播放，交叉淡入淡出无缝衔接，熄屏持续。',
        theme_color: '#07060f',
        background_color: '#07060f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // app shell 预缓存：代码/样式/图标 + Font Awesome webfont（woff2）。
        // woff2 必须进 precache——否则关后端刷新时 CSS 引用的字体 404，<i class="fa-"> 渲染成豆腐块。
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2,woff}'],
        // 音频（6 段 ogg，Opus 64k，约 4.3MB）走运行时缓存：手动下载或在线播放时完整缓存，
        // 不塞进安装预缓存，以免首装拖慢。
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.ogg'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'sleep-audio',
              rangeRequests: true,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  // base 用 './'（相对）：GitHub Pages 部署在 /Sleep/ 子路径下，相对 base 让
  // 资源与音源路径随页面 URL 自动解析，不写死仓库名，换仓库名/路径也能用。
  base: './',
})
