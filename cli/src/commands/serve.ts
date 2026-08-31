import http from "node:http";
import type { AddressInfo } from "node:net";

import { createViewerRequestHandler } from "../lib/viewer-http.js";

export interface ViewerServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

interface ServeOptions {
  cwd: string;
  port?: number;
}

// 长驻前台进程：启动本地 Viewer，Ctrl-C 退出。仅绑定 127.0.0.1，不对外暴露。
export async function runServe(options: ServeOptions): Promise<string> {
  const server = await startViewerServer(options.cwd, options.port ?? 4973);
  process.stdout.write(`llmdoc viewer: ${server.url}  (press Ctrl-C to stop)\n`);
  await new Promise<void>((resolve, reject) => {
    const shutdown = (): void => {
      process.off("SIGINT", shutdown);
      process.off("SIGTERM", shutdown);
      void server.close().then(resolve, reject);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
  return "viewer stopped";
}

export function startViewerServer(rootDir: string, requestedPort = 0): Promise<ViewerServer> {
  const server = http.createServer(createViewerRequestHandler(rootDir));

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        port: address.port,
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((closed, closeRejected) => {
            server.close((error) => (error ? closeRejected(error) : closed()));
          })
      });
    });
  });
}
