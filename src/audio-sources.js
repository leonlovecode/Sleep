// 音源清单：加音频只需往 src/audio/ 丢 mp3 + 加一行。
// 构建时 scripts/build-audio.mjs 自动转码为 .ogg (Opus 64k + 淡入淡出)。
// key  = 文件名（含后缀，稳定唯一）
// name = 下拉显示文字（手填中文，与文件名解耦，可自由起更友好的名字）
// file = ogg 经 Vite bundler 解析出的 URL：
//          - 普通 build（单 HTML）：assetsInlineLimit 调高 → ogg 内联成 data URI，
//            <audio> 直接播放 data URI，file:// 下可用；
//          - PWA build：产物 /assets/<hash>.ogg，运行时 CacheFirst 仍按
//            pathname.endsWith('.ogg') 命中。
import f01 from './audio/01 - 打雷下雨.ogg'
import f02 from './audio/02 - 倾盆大雨.ogg'
import f03 from './audio/03 - 淅沥下雨.ogg'
import f04 from './audio/04 - 海边礁石.ogg'
import f05 from './audio/05 - 夜晚蟋蟀青蛙.ogg'
import f06 from './audio/06 - 旷野.ogg'

export const AUDIO_SOURCES = [
  { key: '01 - 打雷下雨.ogg',         name: '打雷下雨',     file: f01 },
  { key: '02 - 倾盆大雨.ogg',         name: '倾盆大雨',     file: f02 },
  { key: '03 - 淅沥下雨.ogg',         name: '淅沥下雨',     file: f03 },
  { key: '04 - 海边礁石.ogg',         name: '海边礁石',     file: f04 },
  { key: '05 - 夜晚蟋蟀青蛙.ogg',     name: '夜晚蟋蟀青蛙', file: f05 },
  { key: '06 - 旷野.ogg',             name: '旷野',         file: f06 },
]
