import { ipcMain } from "electron";
import { staticServer } from "../main";

export function registerServerHandlers(): void {
  ipcMain.handle("server:start", async (_e, appDir: string, frontendDir?: string) => {
    return staticServer.start(appDir, frontendDir);
  });

  ipcMain.handle("server:stop", async () => {
    staticServer.stop();
  });

  ipcMain.handle("server:getUrl", () => {
    return staticServer.getUrl();
  });

  ipcMain.handle("server:getLanUrl", () => {
    return staticServer.getLanUrl();
  });
}
