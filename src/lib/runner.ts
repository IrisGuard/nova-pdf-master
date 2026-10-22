import type { PdfFile, ToolDef, ToolResult } from './types';
import { actions, getState } from './store';
import { formatBytes } from './util';

const controllers = new Map<string, AbortController>();

export function cancelJob(jobId: string) {
  controllers.get(jobId)?.abort();
  controllers.delete(jobId);
  actions.cancelJob(jobId);
}

export async function runTool(
  tool: ToolDef,
  files: PdfFile[],
  opts: Record<string, unknown>,
  batch: boolean,
): Promise<ToolResult | null> {
  if (!files.length && tool.accepts !== 'none') {
    actions.toast('Open a document first', 'error');
    return null;
  }
  if ((tool.minFiles ?? 1) > files.length) {
    actions.toast(`This tool needs ${tool.minFiles} files`, 'error');
    return null;
  }
  const job = actions.createJob(tool.id, tool.name);
  const controller = new AbortController();
  controllers.set(job.id, controller);
  actions.setTool(tool.id);

  const totalSteps = batch && tool.batch && files.length > 1 ? files.length : 1;
  let current = 0;
  let lastOutputs: ToolResult['outputs'] = [];
  let lastSummary = '';
  let stats: ToolResult['stats'] = [];
  let preview: string | undefined;

  const ctxFor = (index: number) => ({
    signal: controller.signal,
    log: (message: string) => actions.updateJob(job.id, { message }),
    onProgress: (p: number, message?: string) => {
      const overall = Math.min(0.99, (index + Math.max(0, Math.min(1, p))) / totalSteps);
      actions.updateJob(job.id, { progress: overall, message: message || 'Working…' });
    },
  });

  try {
    if (batch && tool.batch && files.length > 1) {
      for (let i = 0; i < files.length; i++) {
        if (controller.signal.aborted) break;
        current = i;
        actions.updateJob(job.id, { message: `${files[i].name} (${i + 1}/${files.length})` });
        const res = await tool.run([files[i]], opts as never, ctxFor(i) as never);
        lastOutputs = lastOutputs.concat(res.outputs);
        stats = res.stats || stats;
        preview = res.preview || preview;
        lastSummary = res.summary || lastSummary;
      }
    } else {
      const res = await tool.run(files, opts as never, ctxFor(0) as never);
      lastOutputs = res.outputs;
      lastSummary = res.summary || '';
      stats = res.stats || [];
      preview = res.preview;
    }
    if (controller.signal.aborted) {
      actions.cancelJob(job.id);
      return null;
    }
    if (!lastOutputs.length && !stats.length && tool.id !== 'info' && tool.id !== 'compare') {
      throw new Error('The tool produced no output');
    }
    const totalBytes = lastOutputs.reduce((s, o) => s + o.bytes.byteLength, 0);
    if (lastOutputs.length > 1) {
      stats = [...(stats || []), { label: 'Files', value: String(lastOutputs.length) }, { label: 'Total size', value: formatBytes(totalBytes) }];
    }
    const result: ToolResult = { outputs: lastOutputs, summary: lastSummary, stats, preview };
    actions.finishJob(job.id, result);
    if (lastOutputs.length) {
      actions.toast(`${tool.name}: ${lastOutputs.length === 1 ? lastOutputs[0].name : `${lastOutputs.length} files ready`}`, 'success');
    }
    return result;
  } catch (err) {
    const e = err as Error;
    if (e.name === 'AbortError') {
      actions.cancelJob(job.id);
      return null;
    }
    const message = friendlyError(e);
    actions.failJob(job.id, message);
    actions.toast(message, 'error');
    return null;
  } finally {
    controllers.delete(job.id);
  }
}

export function friendlyError(e: Error): string {
  const m = e?.message || String(e);
  if (/not password protected/i.test(m)) return 'This PDF is not password protected.';
  if (/NEEDS PASSWORD|Password incorrect|password/i.test(m)) return 'The password you entered is not correct.';
  if (/encrypt/i.test(m)) return 'This PDF is encrypted and cannot be read without the password.';
  if (/Invalid PDF|No PDF header|Failed to parse/i.test(m)) return 'This file is not a valid PDF, or it is damaged. Try Clean & repair.';
  if (/Invalid page range/i.test(m)) return m;
  if (/Cancel/i.test(m)) return 'Cancelled';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'A local asset could not be loaded. Check that the app is installed completely and try again.';
  return m.length > 220 ? m.slice(0, 217) + '…' : m;
}

export function currentSelection(): PdfFile[] {
  const s = getState();
  return s.files;
}
