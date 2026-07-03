import { chromium } from "playwright";
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const rootDir = resolve(".");
const exampleDir = join(rootDir, "example_data");
const outputDir = join(rootDir, "converted_pdfs_verified");
const port = 8765;
const baseUrl = `http://127.0.0.1:${port}/`;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"]
]);

function serveStatic() {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", baseUrl);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const filePath = join(rootDir, pathname === "/" ? "index.html" : pathname);

    if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes.get(extname(filePath)) || "application/octet-stream"
    });
    createReadStream(filePath).pipe(response);
  });

  return new Promise((resolveServer) => {
    server.listen(port, "127.0.0.1", () => resolveServer(server));
  });
}

function exampleZips() {
  return readdirSync(exampleDir)
    .filter((name) => name.toLowerCase().endsWith(".zip"))
    .sort()
    .map((name) => join(exampleDir, name));
}

mkdirSync(outputDir, { recursive: true });
const server = await serveStatic();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  for (const zipPath of exampleZips()) {
    await page.setInputFiles("#zip-input", zipPath);
    await page.waitForFunction(() => {
      const shareButton = document.querySelector("#share-button");
      const link = document.querySelector("#download-link");
      return shareButton && !shareButton.disabled && link?.href?.startsWith("blob:");
    }, null, { timeout: 30000 });

    const downloadPromise = page.waitForEvent("download");
    const outputName = await page.getAttribute("#download-link", "download");
    await page.click("#download-link");
    const download = await downloadPromise;
    const outputPath = join(outputDir, outputName || download.suggestedFilename());
    await download.saveAs(outputPath);
    console.log(`saved ${outputPath}`);
  }
} finally {
  await browser.close();
  server.close();
}
