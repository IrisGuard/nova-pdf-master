import { useSyncExternalStore } from 'react';
import type { Job, OutputFile, PdfFile, ToolResult } from './types';
import { abortCheck, uid } from './util';

export type PasswordRequest = {
  id: string;
  fileName: string;
  resolve: (value: string | null) => void;
};

export type Toast = { id: string; message: string; kind: 'info' | 'success' | 'error' };

type State = {
  files: PdfFile[];
  activeId: string | null;
  toolId: string | null;
  jobs: Job[];
  outputs: OutputFile[];
  theme: 'dark' | 'light';
  paletteOpen: boolean;
  passwordRequest: PasswordRequest | null;
  toasts: Toast[];
  netRequests: number;
  settings: { batch: boolean };
};

const initialTheme: 'dark' | 'light' = (() => {
  try {
    const t = localStorage.getItem('nova-pdf-theme');
    return t === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
})();

let state: State = {
  files: [],
  activeId: null,
  toolId: null,
  jobs: [],
  outputs: [],
  theme: initialTheme,
  paletteOpen: false,
  passwordRequest: null,
  toasts: [],
  netRequests: 0,
  settings: { batch: false },
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getState() {
  return state;
}

export function setState(patch: Partial<State> | ((s: State) => Partial<State>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  emit();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export const actions = {
  addFiles(files: PdfFile[]) {
    if (!files.length) return;
    setState((s) => ({
      files: [...s.files, ...files],
      activeId: s.activeId || files[0].id,
    }));
  },
  removeFile(id: string) {
    setState((s) => {
      const files = s.files.filter((f) => f.id !== id);
      return { files, activeId: s.activeId === id ? files[0]?.id ?? null : s.activeId };
    });
  },
  clearFiles() {
    setState({ files: [], activeId: null });
  },
  setActive(id: string | null) {
    setState({ activeId: id });
  },
  setTool(toolId: string | null) {
    setState({ toolId });
  },
  setTheme(theme: 'dark' | 'light') {
    try {
      localStorage.setItem('nova-pdf-theme', theme);
    } catch {
      /* private mode */
    }
    setState({ theme });
  },
  toggleTheme() {
    actions.setTheme(state.theme === 'dark' ? 'light' : 'dark');
  },
  setPalette(open: boolean) {
    setState({ paletteOpen: open });
  },
  toast(message: string, kind: Toast['kind'] = 'info') {
    const id = uid('t');
    setState((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
  dismissToast(id: string) {
    setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  setBatch(batch: boolean) {
    setState((s) => ({ settings: { ...s.settings, batch } }));
  },
  bumpNet() {
    setState((s) => ({ netRequests: s.netRequests + 1 }));
  },
  requestPassword(fileName: string): Promise<string | null> {
    return new Promise((resolve) => {
      const id = uid('pw');
      setState({
        passwordRequest: {
          id,
          fileName,
          resolve: (v) => {
            setState({ passwordRequest: null });
            resolve(v);
          },
        },
      });
    });
  },

  createJob(tool: string, title: string): Job {
    const job: Job = {
      id: uid('j'),
      tool,
      title,
      status: 'running',
      progress: 0,
      message: 'Starting…',
      outputs: [],
      startedAt: Date.now(),
    };
    setState((s) => ({ jobs: [job, ...s.jobs].slice(0, 60) }));
    return job;
  },
  updateJob(id: string, patch: Partial<Job>) {
    setState((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)) }));
  },
  finishJob(id: string, result: ToolResult) {
    const outputs = result.outputs;
    setState((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              status: 'done',
              progress: 1,
              message: result.summary || 'Done',
              outputs,
              summary: result.summary,
              stats: result.stats,
              preview: result.preview,
              endedAt: Date.now(),
            }
          : j,
      ),
      outputs: [...outputs, ...s.outputs].slice(0, 80),
    }));
  },
  failJob(id: string, error: string) {
    setState((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'error', error, message: error, endedAt: Date.now() } : j)),
    }));
  },
  cancelJob(id: string) {
    setState((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'cancelled', message: 'Cancelled', endedAt: Date.now() } : j)),
    }));
  },
  removeJob(id: string) {
    setState((s) => ({ jobs: s.jobs.filter((j) => j.id !== id), outputs: s.outputs.filter((o) => o.tool !== id) }));
  },
  clearJobs() {
    setState({ jobs: [], outputs: [] });
  },
  addOutputAsFile(output: OutputFile) {
    const file: PdfFile = {
      id: uid('f'),
      name: output.name,
      bytes: output.bytes,
      size: output.bytes.byteLength,
      mime: output.mime || 'application/pdf',
      pageCount: 0,
      encrypted: false,
      addedAt: Date.now(),
    };
    setState((s) => ({ files: [...s.files, file], activeId: file.id }));
    return file;
  },
};

export function abortable(ms = 0): { signal: AbortSignal; cancel: () => void; check: () => void } {
  const c = new AbortController();
  if (ms > 0) setTimeout(() => c.abort(), ms);
  return { signal: c.signal, cancel: () => c.abort(), check: () => abortCheck(c.signal) };
}
