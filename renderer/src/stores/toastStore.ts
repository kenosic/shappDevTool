import { create } from "zustand";

export type ToastType = "success" | "error" | "warning" | "info";

export type Toast = {
  id: string;
  type: ToastType;
  message: string;
};

type ToastStore = {
  toasts: Toast[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  show(message, type = "info") {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
    const delay = type === "error" ? 6000 : 3000;
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, delay);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
