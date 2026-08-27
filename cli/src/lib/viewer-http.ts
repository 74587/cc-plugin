import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

import { CliError } from "./errors.js";
import { packageRootFromImport } from "./package-root.js";
import { loadViewerState } from "./viewer-state.js";
import { loadWorkspace } from "./workspace.js";

interface StaticAsset {
  fileName: string;
  contentType: string;
}

const STATIC_ASSETS: ReadonlyMap<string, StaticAsset> = new Map([
  ["/", { fileName: "viewer.html", contentType: "text/html; charset=utf-8" }],
  ["/assets/viewer.css", { fileName: "viewer.css", contentType: "text/css; charset=utf-8" }],
  ["/assets/viewer-model.js", { fileName: "viewer-model.js", contentType: "text/javascript; charset=utf-8" }],
  ["/assets/viewer-graph.js", { fileName: "viewer-graph.js", contentType: "text/javascript; charset=utf-8" }],
  ["/assets/viewer-detail.js", { fileName: "viewer-detail.js", contentType: "text/javascript; charset=utf-8" }],
  ["/assets/viewer-app.js", { fileName: "viewer-app.js", contentType: "text/javascript; charset=utf-8" }]
]);

export type ViewerRequestHandler = (request: http.IncomingMessage, response: http.ServerResponse) => void;

/** 创建只读、显式路由的本地 Viewer handler。不会把 URL 路径拼接进文件系统。 */
export function createViewerRequestHandler(rootDir: string): ViewerRequestHandler {
  const packageRoot = packageRootFromImport(import.meta.url);
  const assetsRoot = path.join(packageRoot, "assets");

  return (request, response): void => {
    const headOnly = request.method === "HEAD";
    try {
      if (request.method !== "GET" && !headOnly) {
        sendJson(response, 405, { error: "method not allowed" }, headOnly, { allow: "GET, HEAD" });
        return;
      }

      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const staticAsset = STATIC_ASSETS.get(url.pathname);
      if (staticAsset) {
        sendStaticAsset(response, assetsRoot, staticAsset, headOnly);
        return;
      }
      if (url.pathname === "/assets/marked.js") {
        sendMarked(response, headOnly);
        return;
      }
      if (url.pathname === "/favicon.ico") {
        sendBody(response, 204, Buffer.alloc(0), "image/x-icon", headOnly);
        return;
      }
      if (url.pathname === "/api/state") {
        sendJson(response, 200, loadViewerState(rootDir), headOnly);
        return;
      }
      if (url.pathname === "/api/doc") {
        const docPath = url.searchParams.get("path") ?? "";
        const workspace = loadWorkspace(rootDir);
        // 仅按扫描产生的 canonical llmdocPath 查表，不接受任意文件系统路径。
        const document = workspace.documentsByLlmdocPath.get(docPath);
        if (!document) {
          sendJson(response, 404, { error: `未找到文档: ${docPath}` }, headOnly);
          return;
        }
        sendJson(
          response,
          200,
          {
            path: document.llmdocPath,
            frontmatter: document.frontmatter,
            body: document.body,
            title: document.title,
            estimatedTokens: document.estimatedTokens,
            lineCount: document.lineCount
          },
          headOnly
        );
        return;
      }

      sendJson(response, 404, { error: "not found" }, headOnly);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 500, { error: message }, headOnly);
    }
  };
}

function sendStaticAsset(
  response: http.ServerResponse,
  assetsRoot: string,
  asset: StaticAsset,
  headOnly: boolean
): void {
  // fileName 只可能来自上方常量白名单；请求值不会参与路径解析。
  const assetPath = path.join(assetsRoot, asset.fileName);
  if (!fs.existsSync(assetPath)) {
    throw new CliError(`viewer 资产缺失: ${asset.fileName}`);
  }
  sendBody(response, 200, fs.readFileSync(assetPath), asset.contentType, headOnly);
}

function sendMarked(response: http.ServerResponse, headOnly: boolean): void {
  try {
    const require = createRequire(import.meta.url);
    const markedPath = require.resolve("marked/marked.min.js");
    sendBody(response, 200, fs.readFileSync(markedPath), "text/javascript; charset=utf-8", headOnly);
  } catch {
    // marked 缺失时降级为安全的纯文本展示，Viewer 的导航与状态功能仍可用。
    const fallback =
      "window.marked={parse:(text)=>'<pre>'+text.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre>'};";
    sendBody(response, 200, Buffer.from(fallback), "text/javascript; charset=utf-8", headOnly);
  }
}

function sendJson(
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
  headOnly: boolean,
  extraHeaders: Record<string, string> = {}
): void {
  sendBody(
    response,
    statusCode,
    Buffer.from(JSON.stringify(payload)),
    "application/json; charset=utf-8",
    headOnly,
    extraHeaders
  );
}

function sendBody(
  response: http.ServerResponse,
  statusCode: number,
  body: Buffer,
  contentType: string,
  headOnly: boolean,
  extraHeaders: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": String(body.byteLength),
    "cache-control": "no-store",
    "content-security-policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' http: https:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extraHeaders
  });
  response.end(headOnly ? undefined : body);
}
