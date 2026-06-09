import React, { useEffect, useRef } from "react";
import { usePackageStore } from "./stores/packageStore";
import { useLogStore } from "./stores/logStore";
import { useExecutionStore } from "./stores/executionStore";
import WelcomePage from "./pages/WelcomePage";
import MainLayout from "./layouts/MainLayout";
import ToastContainer from "./components/Toast/ToastContainer";
import UpdateBanner from "./components/UpdateBanner/UpdateBanner";
import { useT } from "./i18n";
import styles from "./App.module.css";

export default function App() {
  const t = useT();
  const current = usePackageStore((s) => s.current);
  const setCurrent = usePackageStore((s) => s.setCurrent);
  const setRecentFolders = usePackageStore((s) => s.setRecentFolders);
  const appendLog = useLogStore((s) => s.append);
  const setExecStatus = useExecutionStore((s) => s.setStatus);

  // Bootstrap: load recent folders
  useEffect(() => {
    window.devtool.package.getRecent().then(setRecentFolders);
  }, [setRecentFolders]);

  // Subscribe to execution logs and status from main process
  useEffect(() => {
    const unsubLog = window.devtool.execution.onLog(appendLog);
    const unsubStatus = window.devtool.execution.onStatus(setExecStatus);
    return () => {
      unsubLog();
      unsubStatus();
    };
  }, [appendLog, setExecStatus]);

  // Hot reload: backend change → show notice in log
  useEffect(() => {
    if (!current) return;
    const unsub = window.devtool.package.onHotReload((event) => {
      if (event.type === "backend") {
        appendLog({
          level: "info",
          message: t("app.backendChanged"),
          ts: Date.now(),
        });
      }
    });
    return unsub;
  }, [current, appendLog]);

  // Resize window when switching between welcome and main layout
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (current) {
      window.devtool.window.enterMain();
    } else {
      window.devtool.window.enterWelcome();
    }
  }, [current]);

  return (
    <div className={styles.root}>
      <UpdateBanner />
      {current ? <MainLayout /> : <WelcomePage />}
      <ToastContainer />
    </div>
  );
}
