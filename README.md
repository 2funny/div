# Rune Dungeon

Vite + Vanilla TypeScript + 原生 CSS 的半随机地牢 RPG。

## 开发

```powershell
npm install
npm run dev
```

本地默认地址：`http://127.0.0.1:5173/`

## 验证

```powershell
npm run build
npm test
```

回归测试会先通过 Vite 打包 `tests/harness/runtimeHarness.ts`，再直接验证 TypeScript 运行时；旧版 `js/data.js` 和 `js/game.js` 已删除。
