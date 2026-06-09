import { app } from "electron";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export class Store<T extends Record<string, unknown>> {
  private data: T;
  private filePath: string;

  constructor(private readonly defaults: T) {
    const dir = join(app.getPath("userData"), "devtool");
    mkdirSync(dir, { recursive: true });
    this.filePath = join(dir, "preferences.json");
    this.data = this.load();
  }

  private load(): T {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return { ...this.defaults, ...parsed };
      }
    } catch {
      // ignore, fall through to defaults
    }
    return { ...this.defaults };
  }

  private save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch {
      // ignore
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key] ?? this.defaults[key];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value;
    this.save();
  }
}
