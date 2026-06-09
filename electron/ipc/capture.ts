import { ipcMain, BrowserWindow, dialog, desktopCapturer } from "electron";
import { writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";

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
        role: "cover" | "carousel" | "none";
        appDir: string;
      }
    ): Promise<string> => {
      const { data, mimeType, filename, role, appDir } = params;

      let savePath: string;
      if (role === "cover" || role === "carousel") {
        const destDir = join(appDir, "assets", role === "cover" ? "." : "carousel");
        await mkdir(destDir, { recursive: true });
        if (role === "cover") {
          // Always use a stable name so the sidebar can reliably find it
          const ext = filename.split(".").pop()?.toLowerCase() || "png";
          savePath = join(destDir, `cover.${ext}`);
        } else {
          savePath = join(destDir, filename);
        }
      } else {
        // Custom location — ask user
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
      const buffer = Buffer.from(base64, "base64");
      await writeFile(savePath, buffer);

      // Notify renderer so sidebar can refresh cover/carousel
      if (role === "cover" || role === "carousel") {
        win.webContents.send("package:assetsChanged", { role, appDir, filename });
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
