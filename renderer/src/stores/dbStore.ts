import { create } from "zustand";

type DbState = {
  tables: string[];
  selectedTable: string | null;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  queryMode: boolean;
  querySql: string;
  queryResult: { columns: string[]; rows: unknown[][] } | null;
  queryError: string | null;

  setTables: (tables: string[]) => void;
  setSelectedTable: (table: string | null) => void;
  setRows: (rows: Record<string, unknown>[], total: number) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setLoading: (loading: boolean) => void;
  setQueryMode: (mode: boolean) => void;
  setQuerySql: (sql: string) => void;
  setQueryResult: (result: DbState["queryResult"], error: string | null) => void;
  reset: () => void;
};

export const useDbStore = create<DbState>((set) => ({
  tables: [],
  selectedTable: null,
  rows: [],
  total: 0,
  page: 0,
  pageSize: 50,
  isLoading: false,
  queryMode: false,
  querySql: "SELECT * FROM sqlite_master WHERE type='table';",
  queryResult: null,
  queryError: null,

  setTables: (tables) => set({ tables }),
  setSelectedTable: (table) => set({ selectedTable: table, rows: [], total: 0, page: 0 }),
  setRows: (rows, total) => set({ rows, total }),
  setPage: (page) => set({ page }),
  setPageSize: (size) => set({ pageSize: size }),
  setLoading: (loading) => set({ isLoading: loading }),
  setQueryMode: (mode) => set({ queryMode: mode }),
  setQuerySql: (sql) => set({ querySql: sql }),
  setQueryResult: (result, error) => set({ queryResult: result, queryError: error }),
  reset: () =>
    set({
      tables: [],
      selectedTable: null,
      rows: [],
      total: 0,
      page: 0,
      queryResult: null,
      queryError: null,
    }),
}));
