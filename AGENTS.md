# Repository Guidelines

## Project Structure & Module Organization

- `src/` contains the Vue application. `App.vue` owns the UI; `usePlayer.js` and `useAudioCache.js` contain playback and offline-cache behavior.
- `src/audio/` holds tracked MP3 sources. Generated `.ogg` files are ignored and must be rebuilt locally.
- `src/components/` contains reusable Vue components; `scripts/` contains Node build and validation scripts.
- `public/` contains PWA icons. `assets/` is for repository documentation images.
- `vite.config.js` builds the standalone HTML; `vite.config.pwa.js` builds the GitHub Pages PWA. Workflow definitions live in `.github/workflows/`.

Read `SPEC.md` before changing architecture, playback, caching, or release behavior.

## Build, Test, and Development Commands

Use Node 24.18.1 (`.nvmrc`) and FFmpeg with `libopus`.

```bash
npm ci                 # install locked dependencies
npm run doctor         # verify Node, FFmpeg, ffprobe, libopus, and MP3 sources
npm run dev            # start Vite development server
npm run test:countdown # run countdown utility self-check
npm run build:audio    # generate ignored OGG Opus files from MP3 sources
npm run build          # build standalone dist/index.html
npm run build:pwa      # build PWA output for GitHub Pages
npm run check:audio    # validate generated OGG files and durations
```

Run `doctor`, `test:countdown`, `build:pwa`, and `check:audio` before publishing. These checks also run in GitHub Actions.

## Coding Style & Naming Conventions

Use ES modules, Vue 3 Composition API, two-space indentation, single quotes, and no semicolons. Name composables `useXxx.js`, components `PascalCase.vue`, and constants in `UPPER_SNAKE_CASE`. Keep audio playback settings shared through `src/audio-config.js`; do not duplicate fade durations in scripts or UI code.

There is no formatter or lint command configured. Keep changes narrowly scoped and match nearby code and comments (Chinese user-facing text is expected).

## Testing Guidelines

No browser test framework is installed. Add or update focused Node self-checks when changing pure logic. For audio or PWA changes, run the commands above and manually verify Chromium/Android Chromium playback, download state, and offline behavior on HTTPS.

## Commit & Pull Request Guidelines

Use concise Conventional Commit-style subjects, for example `feat: improve offline audio caching` or `chore: update package-lock.json`. Keep generated `src/audio/*.ogg`, `dist/`, and `node_modules/` out of commits. PRs should explain user-visible behavior, list validation commands, and include a screenshot for UI changes. Push `main` before creating a `v*` tag: `main` deploys Pages, while the tag creates the GitHub Release.
