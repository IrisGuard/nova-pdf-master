export type PdfFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  size: number;
  mime: string;
  pageCount: number;
  encrypted: boolean;
  password?: string;
  addedAt: number;
};

export type OutputFile = {
  id: string;
  name: string;
  bytes: Uint8Array;
  mime: string;
  tool: string;
  createdAt: number;
};

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type Job = {
  id: string;
  tool: string;
  title: string;
  status: JobStatus;
  progress: number;
  message: string;
  outputs: OutputFile[];
  error?: string;
  startedAt: number;
  endedAt?: number;
  summary?: string;
  stats?: { label: string; value: string }[];
  preview?: string;
};

export type ProgressFn = (progress: number, message?: string) => void;

export type RunContext = {
  onProgress: ProgressFn;
  signal: AbortSignal;
  log: (message: string) => void;
};

export type ToolResult = {
  outputs: OutputFile[];
  summary?: string;
  /** Optional rich facts shown next to the download. */
  stats?: { label: string; value: string }[];
  /** Optional preview image (data URL) for visual tools. */
  preview?: string;
};

export type DocInput = {
  name: string;
  bytes: Uint8Array;
  password?: string;
};

export type AnyInput = DocInput & {
  mime?: string;
  pageCount?: number;
};

export type OptionValue = string | number | boolean | File | string[];

export type OptionDef =
  | {
      kind: 'select';
      key: string;
      label: string;
      options: { value: string; label: string }[];
      def: string;
      hint?: string;
    }
  | {
      kind: 'number';
      key: string;
      label: string;
      def: number;
      min?: number;
      max?: number;
      step?: number;
      suffix?: string;
      hint?: string;
    }
  | { kind: 'range'; key: string; label: string; def: number; min: number; max: number; step: number; suffix?: string; hint?: string }
  | { kind: 'text'; key: string; label: string; def: string; placeholder?: string; hint?: string }
  | { kind: 'textarea'; key: string; label: string; def: string; placeholder?: string; hint?: string; rows?: number }
  | { kind: 'password'; key: string; label: string; def: string; placeholder?: string; hint?: string }
  | { kind: 'color'; key: string; label: string; def: string; hint?: string }
  | { kind: 'check'; key: string; label: string; def: boolean; hint?: string }
  | { kind: 'file'; key: string; label: string; accept: string; hint?: string }
  | { kind: 'pages'; key: string; label: string; def: string; hint?: string }
  | { kind: 'multi'; key: string; label: string; options: { value: string; label: string }[]; def: string[]; hint?: string };

export type ToolCategory = 'organize' | 'edit' | 'convert' | 'optimize' | 'secure' | 'extract';

export type ToolDef = {
  id: string;
  name: string;
  short: string;
  category: ToolCategory;
  accepts: 'pdf' | 'images' | 'none';
  /** how many source files the tool needs at minimum */
  minFiles?: number;
  /** show multi-file batch toggle */
  batch?: boolean;
  options?: OptionDef[];
  run: (files: PdfFile[], opts: Record<string, OptionValue>, ctx: RunContext) => Promise<ToolResult>;
  /** bespoke editor id rendered instead of the generic option form */
  editor?: 'organize' | 'sign' | 'annotate' | 'redact' | 'forms' | 'merge' | 'compare' | 'info' | 'metadata';
};
