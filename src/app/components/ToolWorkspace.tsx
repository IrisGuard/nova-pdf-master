import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import type { Job, OptionValue, PdfFile, ToolDef } from '../../lib/types';
import { defaultOptions } from '../../lib/tools';
import { actions, useStore } from '../../lib/store';
import { runTool, cancelJob } from '../../lib/runner';
import { formatBytes, downloadBytes } from '../../lib/util';
import { OptionsForm } from './Options';
import { Icon } from './Icon';
import { PageSurface } from './PdfView';
import { OrganizeEditor } from '../editors/OrganizeEditor';
import { SignEditor, AnnotateEditor, RedactEditor } from '../editors/PageEditors';
import { FormsEditor, InfoEditor, MetadataEditor } from '../editors/DataEditors';
import { MergeEditor, CompareEditor } from '../editors/FlowEditors';

const toolIcons: Record<string, string> = {
  merge: 'merge', split: 'split', organize: 'organize', rotate: 'rotate', extract: 'extract', crop: 'crop',
  resize: 'resize', nup: 'grid', booklet: 'booklet', watermark: 'watermark', pagenumbers: 'numbers',
  headerfooter: 'header', bates: 'bates', sign: 'pen', annotate: 'annotate', forms: 'form', metadata: 'tag',
  clean: 'clean', 'pdf-to-images': 'image', 'images-to-pdf': 'images', 'pdf-to-text': 'text', 'pdf-to-html': 'html',
  'pdf-to-markdown': 'markdown', 'pdf-to-json': 'json', 'text-to-pdf': 'type', 'pdf-to-pdfa': 'archive',
  compress: 'compress', grayscale: 'droplet', ocr: 'scan', protect: 'lock', unlock: 'unlock', redact: 'redact',
  info: 'info', compare: 'compare',
};

export function ToolWorkspace({ tool, files, active, onClose }: { tool: ToolDef; files: PdfFile[]; active: PdfFile | null; onClose: () => void }) {
  const [options, setOptions] = useState<Record<string, OptionValue>>(() => defaultOptions(tool));
  const [batch, setBatch] = useState(false);
  const jobs = useStore((s) => s.jobs);
  const job = useMemo(() => jobs.find((j) => j.tool === tool.id), [jobs, tool.id]);
  const running = job?.status === 'running';

  useEffect(() => {
    setOptions(defaultOptions(tool));
  }, [tool.id]);

  const setOption = (key: string, value: OptionValue) => setOptions((o) => ({ ...o, [key]: value }));
  const setOptionsPatch = (patch: Record<string, OptionValue>) => setOptions((o) => ({ ...o, ...patch }));

  function inputFiles(): PdfFile[] {
    if (tool.accepts === 'none') return files;
    if (tool.editor === 'merge') {
      const ids = (options.mergeIds as string[]) || [];
      return ids
        .map((id) => files.find((f) => f.id === id))
        .filter((f): f is PdfFile => !!f && /pdf/.test(f.mime));
    }
    if (tool.editor === 'compare') {
      const pdfs = files.filter((f) => /pdf/.test(f.mime));
      const a = pdfs.find((f) => f.id === options.aId) || pdfs[0];
      const b = pdfs.find((f) => f.id === options.bId) || pdfs[1] || pdfs[0];
      return [a, b].filter(Boolean) as PdfFile[];
    }
    if (tool.accepts === 'images') {
      const imgs = files.filter((f) => /^image\//.test(f.mime));
      if (imgs.length) return imgs;
      return active ? [active] : [];
    }
    if (tool.batch && batch) {
      const pdfs = files.filter((f) => /pdf/.test(f.mime));
      if (pdfs.length) return pdfs;
    }
    if (active && /pdf/.test(active.mime)) return [active];
    const firstPdf = files.find((f) => /pdf/.test(f.mime));
    return firstPdf ? [firstPdf] : active ? [active] : files.slice(0, 1);
  }

  async function run() {
    const picked = inputFiles();
    if (tool.accepts === 'pdf' && !picked.length) {
      actions.toast('Open a PDF first', 'error');
      return;
    }
    if (tool.minFiles && picked.length < tool.minFiles) {
      actions.toast(`This tool needs ${tool.minFiles} documents`, 'error');
      return;
    }
    if (tool.accepts === 'images' && !picked.some((f) => /^image\//.test(f.mime))) {
      actions.toast('This tool needs images, not a PDF', 'error');
      return;
    }
    await runTool(tool, picked, options as Record<string, unknown>, batch);
  }

  const canRun = tool.id !== 'info';
  const editor = renderEditor(tool, active, files, options, setOption, setOptionsPatch);

  return (
    <div className="tool-page">
      <header className="tool-page-head">
        <div className="tool-title">
          <span className="tool-icon"><Icon name={toolIcons[tool.id] || 'file'} size={19} /></span>
          <div>
            <h2>{tool.name}</h2>
            <p>{tool.short}</p>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close tool (Esc)">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div className="tool-page-body">
        <div className="tool-stage">{editor ?? <GenericStage tool={tool} file={active} files={files} />}</div>
        <aside className="tool-panel">
          {tool.options && tool.options.length > 0 && !tool.editor && (
            <OptionsForm toolId={tool.id} defs={tool.options} values={options} onChange={setOption} disabled={running} />
          )}
          {tool.options && tool.options.length > 0 && tool.editor && (
            <OptionsForm toolId={tool.id} defs={tool.options} values={options} onChange={setOption} disabled={running} />
          )}

          {tool.accepts !== 'none' && tool.batch && files.length > 1 && (
            <label className="opt-check batch-toggle">
              <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} disabled={running} />
              <span>
                Batch — apply to all {files.length} open files
                <em>Results come back as one download each.</em>
              </span>
            </label>
          )}

          {canRun && (
            <div className="run-block">
              {running ? (
                <>
                  <div className="progress-line">
                    <span style={{ width: `${Math.round((job?.progress || 0) * 100)}%` }} />
                  </div>
                  <div className="run-meta">
                    <span>{job?.message || 'Working…'}</span>
                    <span>{Math.round((job?.progress || 0) * 100)}%</span>
                  </div>
                  <button className="ghost-btn wide danger-text" onClick={() => job && cancelJob(job.id)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className={`run-btn ${tool.editor ? 'editor' : ''}`} onClick={run}>
                  <span>{runLabel(tool)}</span>
                  <Icon name="arrowRight" size={17} />
                </button>
              )}
              {tool.id === 'protect' && <p className="opt-hint">AES-256 encryption happens in this tab. Nothing is transmitted.</p>}
              {tool.id === 'redact' && <p className="opt-hint">Redaction flattens pages; the original file is untouched.</p>}
            </div>
          )}

          {job && job.status === 'done' && <ResultCard job={job} tool={tool} />}
          {job && job.status === 'error' && (
            <div className="result-error">
              <Icon name="warn" size={16} />
              <span>{job.error}</span>
            </div>
          )}

          <div className="panel-privacy">
            <Icon name="shield" size={14} />
            <span>Processed locally. No upload, no account, no queue.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

function runLabel(tool: ToolDef) {
  if (tool.editor === 'merge') return 'Merge documents';
  if (tool.editor === 'organize') return 'Apply page order';
  if (tool.editor === 'sign') return 'Apply signature';
  if (tool.editor === 'annotate') return 'Apply annotations';
  if (tool.editor === 'redact') return 'Redact permanently';
  if (tool.editor === 'forms') return 'Fill & save';
  if (tool.editor === 'metadata') return 'Save metadata';
  if (tool.editor === 'compare') return 'Compare documents';
  if (tool.id === 'compress') return 'Compress PDF';
  if (tool.id === 'ocr') return 'Start OCR';
  if (tool.id === 'protect') return 'Encrypt PDF';
  return 'Run ' + tool.name.replace(/^Convert /, '');
}

function renderEditor(
  tool: ToolDef,
  active: PdfFile | null,
  files: PdfFile[],
  options: Record<string, OptionValue>,
  setOption: (k: string, v: OptionValue) => void,
  setOptions: (p: Record<string, OptionValue>) => void,
) {
  if (!tool.editor) return null;
  const pdfs = files.filter((f) => /pdf/.test(f.mime));
  if (tool.editor === 'merge') return <MergeEditor files={pdfs.length ? pdfs : files} options={options} setOption={setOption} />;
  if (tool.editor === 'compare') return <CompareEditor files={pdfs.length ? pdfs : files} options={options} setOption={setOption} />;
  if (!active) return <div className="editor-simple"><p className="error-text">Open a document to use this tool.</p></div>;
  const props = { file: active, options, setOption, setOptions };
  switch (tool.editor) {
    case 'organize':
      return <OrganizeEditor file={active} options={options} setOption={setOption} />;
    case 'sign':
      return <SignEditor {...props} />;
    case 'annotate':
      return <AnnotateEditor {...props} />;
    case 'redact':
      return <RedactEditor {...props} />;
    case 'forms':
      return <FormsEditor {...props} />;
    case 'metadata':
      return <MetadataEditor {...props} />;
    case 'info':
      return <InfoEditor {...props} />;
    default:
      return null;
  }
}

function GenericStage({ tool, file, files }: { tool: ToolDef; file: PdfFile | null; files: PdfFile[] }) {
  if (tool.accepts === 'none') {
    return (
      <div className="generic-stage">
        <div className="generic-art">
          <span className="art-doc" />
          <span className="art-doc two" />
          <Icon name={toolIcons[tool.id] || 'type'} size={44} />
        </div>
        <div className="generic-copy">
          <h3>Type or paste your text</h3>
          <p>Markdown headings, lists and code blocks are supported. Greek and every Latin accent render correctly.</p>
        </div>
      </div>
    );
  }
  if (!file) {
    return (
      <div className="generic-stage empty">
        <Icon name="file" size={38} />
        <h3>Open a document</h3>
        <p>Drag a PDF into this window or use the Open button.</p>
      </div>
    );
  }
  return (
    <div className="generic-stage doc-stage">
      <div className="doc-preview">
        <PageSurface file={file} page={1} quality={1.3} />
      </div>
      <div className="doc-facts">
        <div className="doc-facts-head">
          <Icon name="file" size={17} />
          <b>{file.name}</b>
        </div>
        <div className="fact-grid">
          <div><span>Pages</span><b>{file.pageCount || '—'}</b></div>
          <div><span>Size</span><b>{formatBytes(file.size)}</b></div>
          <div><span>Format</span><b>PDF</b></div>
          <div><span>Protection</span><b>{file.encrypted ? 'Password' : 'None'}</b></div>
        </div>
        {tool.batch && files.length > 1 && (
          <p className="opt-hint">Batch mode is available — turn it on in the panel to process all open documents.</p>
        )}
        {tool.id === 'pdf-to-images' && <p className="hint-card">Every page is rendered on this device at the exact DPI you choose.</p>}
        {tool.id === 'compress' && <p className="hint-card">Scanned PDFs shrink the most. Text-only PDFs do better with the lossless method.</p>}
        {tool.id === 'ocr' && <p className="hint-card">First run downloads the language model once, then OCR works offline.</p>}
      </div>
    </div>
  );
}

function ResultCard({ job, tool }: { job: Job; tool: ToolDef }) {
  const outs = job.outputs || [];
  const stats = job.stats || [];
  const preview = job.preview;

  async function downloadAll() {
    const zip = new JSZip();
    for (const o of outs) zip.file(o.name, o.bytes);
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    downloadBytes(bytes, `nova-${tool.id}-${outs.length}-files.zip`, 'application/zip');
  }

  return (
    <div className="result-card">
      <div className="result-head">
        <span className="result-check"><Icon name="check" size={13} /></span>
        <b>{job.summary || 'Done'}</b>
      </div>
      {preview && <img className="result-preview" src={preview} alt="Result preview" />}
      {stats.length > 0 && (
        <div className="result-stats">
          {stats.map((s, i) => (
            <div key={i}><span>{s.label}</span><b>{s.value}</b></div>
          ))}
        </div>
      )}
      <div className="result-outputs">
        {outs.map((o) => (
          <div className="output-row" key={o.id}>
            <span className="output-icon"><Icon name={o.mime === 'application/pdf' ? 'file' : 'download'} size={15} /></span>
            <div className="output-meta">
              <b title={o.name}>{o.name}</b>
              <span>{formatBytes(o.bytes.byteLength)}</span>
            </div>
            <button className="mini-btn" onClick={() => downloadBytes(o.bytes, o.name, o.mime)} title="Download">
              <Icon name="download" size={14} />
            </button>
            {o.mime === 'application/pdf' && (
              <button
                className="mini-btn"
                title="Open in this workspace"
                onClick={() => actions.addOutputAsFile(o)}
              >
                <Icon name="eye" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      {outs.length > 1 && (
        <button className="ghost-btn wide" onClick={downloadAll}>
          <Icon name="download" size={14} /> Download all as ZIP
        </button>
      )}
    </div>
  );
}
