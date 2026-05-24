import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844, isMobile: true }
];

const outputDir = "tmp/ui-check";
const host = "127.0.0.1";
const port = 4178;

await mkdir(outputDir, { recursive: true });

const server = await createServer({
  configFile: "vite.config.ts",
  server: { host, port, strictPort: true },
  logLevel: "error"
});

await server.listen();

const browser = await launchBrowser();
const failures = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: !!viewport.isMobile
    });
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto(`http://${host}:${port}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("body.app-ready", { timeout: 10000 });
    await page.evaluate(() => {
      window.startGame("warrior", "slot-1", "vanguard");
      window.render();
    });
    await page.waitForSelector("#gameView:not(.hidden) .map .tile", { timeout: 10000 });
    await page.screenshot({
      path: `${outputDir}/${viewport.name}.png`,
      fullPage: true
    });

    const metrics = await page.evaluate(() => {
      const body = document.body;
      const gameView = document.getElementById("gameView");
      const map = document.getElementById("map");
      const visibleTiles = Array.from(document.querySelectorAll(".tile")).filter((tile) => {
        const rect = tile.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length;
      return {
        scrollWidth: body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        gameViewHeight: gameView?.getBoundingClientRect().height || 0,
        mapHeight: map?.getBoundingClientRect().height || 0,
        visibleTiles
      };
    });

    if (consoleErrors.length) {
      failures.push(`${viewport.name}: console errors: ${consoleErrors.join(" | ")}`);
    }
    if (metrics.visibleTiles < 25 || metrics.mapHeight < 120 || metrics.gameViewHeight < 300) {
      failures.push(`${viewport.name}: game UI did not render enough visible content`);
    }
    if (metrics.scrollWidth > metrics.clientWidth + 4) {
      failures.push(
        `${viewport.name}: horizontal overflow ${metrics.scrollWidth}px > ${metrics.clientWidth}px`
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`UI screenshots written to ${outputDir}`);

async function launchBrowser() {
  const browserPaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ];
  const executablePath = browserPaths.find((entry) => existsSync(entry));
  try {
    return executablePath
      ? await chromium.launch({ executablePath })
      : await chromium.launch();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to launch a browser for UI screenshots. Install Playwright browsers with "npx playwright install chromium" or install Chrome/Edge.\n${message}`
    );
  }
}
