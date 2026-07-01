import { ipcMain, BrowserWindow, dialog, desktopCapturer } from "electron";
import { writeFile, mkdir } from "fs/promises";
import { join, basename, relative } from "path";
import sharp from "sharp";

export function registerCaptureHandlers(win: BrowserWindow): void {
  // Capture screenshot — rect is in CSS pixels (Electron "points"); crops to simulator area when provided
  ipcMain.handle(
    "capture:screenshot",
    async (_e, rect?: { x: number; y: number; width: number; height: number }): Promise<string> => {
      const image = await win.webContents.capturePage(rect);
      const pngBuffer = image.toPNG();
      return `data:image/png;base64,${pngBuffer.toString("base64")}`;
    }
  );

  // Return the desktopCapturer source ID for this window (for canvas-based cropped recording)
  ipcMain.handle("capture:getWindowSourceId", async (): Promise<string> => {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: { width: 0, height: 0 },
    });
    const title = win.getTitle();
    const source = sources.find((s) => s.name === title) ?? sources[0];
    return source?.id ?? "";
  });

  // Save media (screenshot or video) to disk
  ipcMain.handle(
    "capture:saveMedia",
    async (
      _e,
      params: {
        data: string;
        mimeType: "image/png" | "video/webm";
        filename: string;
        role: "cover" | "carousel" | "logo" | "none";
        appDir: string;
      }
    ): Promise<string> => {
      const { data, mimeType, filename, role, appDir } = params;

      // ── 内置角色（cover / carousel / logo）统一转为 WebP 无损 ──────
      const isBuiltinRole = role === "cover" || role === "carousel" || role === "logo";

      let savePath: string;
      let relPath: string | undefined;

      if (isBuiltinRole) {
        const destDir = join(appDir, "assets", role === "carousel" ? "carousel" : ".");
        await mkdir(destDir, { recursive: true });
        if (role === "cover") {
          savePath = join(destDir, "cover.webp");
        } else if (role === "logo") {
          savePath = join(destDir, "logo.webp");
        } else {
          // carousel: 替换原扩展名为 .webp
          const webpName = filename.replace(/\.[^.]+$/, ".webp");
          savePath = join(destDir, webpName);
        }
        relPath = relative(appDir, savePath);
      } else {
        // ── 自定义位置 — 保持原始 PNG 格式 ──────────────────────────
        const ext = mimeType === "image/png" ? "png" : "webm";
        const result = await dialog.showSaveDialog({
          title: "保存媒体文件",
          defaultPath: filename,
          filters: [
            mimeType === "image/png"
              ? { name: "PNG Image", extensions: ["png"] }
              : { name: "WebM Video", extensions: ["webm"] },
          ],
        });
        if (result.canceled || !result.filePath)
          throw new Error("用户取消保存");
        savePath = result.filePath;
      }

      // Decode base64 data
      const base64 = data.replace(/^data:[^;]+;base64,/, "");
      const inputBuffer = Buffer.from(base64, "base64");
      // 内置角色转为 WebP 无损，自定义位置保持原格式
      let outputBuffer: Buffer;
      if (isBuiltinRole) {
        const pipeline = sharp(inputBuffer);
        // Logo 裁剪并缩放到 128×128
        if (role === "logo") {
          pipeline.resize(128, 128, { fit: "cover", position: "center" });
        }
        outputBuffer = await pipeline.webp({ lossless: true }).toBuffer();
      } else {
        outputBuffer = inputBuffer;
      }
      await writeFile(savePath, outputBuffer);

      // 通知渲染进程刷新侧边栏
      if (isBuiltinRole) {
        win.webContents.send("package:assetsChanged", { role, appDir, filename, relPath });
      }

      return savePath;
    }
  );

  ipcMain.handle(
    "capture:openSaveDialog",
    async (_e, defaultName: string): Promise<string | null> => {
      const result = await dialog.showSaveDialog({
        title: "保存文件",
        defaultPath: defaultName,
      });
      return result.canceled ? null : result.filePath ?? null;
    }
  );
}
