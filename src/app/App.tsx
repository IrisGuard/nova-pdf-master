import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, getState, useStore } from '../lib/store';
import { addFileList, activeFile } from '../lib/files';
import { TOOLS, TOOL_MAP, CATEGORY_LABELS, defaultOptions } from '../lib/tools';
import type { PdfFile } from '../lib/types';
import { downloadBytes, formatBytes, uid } from '../lib/util';
import { textToPdf } from '../lib/pdf/ops/convert';
import { Icon, Logo } from './components/Icon';
import { PdfViewer, PageSurface, releasePdfDoc } from './components/PdfView';
import { ToolWorkspace } from './components/ToolWorkspace';
import { cancelJob } from '../lib/runner';

const toolIcons: Record<string, string> = {
  merge: 'merge', split: 'split', organize: 'organize', rotate: 'rotate', extract: 'extract', crop: 'crop',
  resize: 'resize', nup: 'grid', booklet: 'booklet', watermark: 'watermark', pagenumbers: 'numbers',
  headerfooter: 'header', bates: 'bates', sign: 'pen', annotate: 'annotate', forms: 'form', metadata: 'tag',
  clean: 'clean', 'pdf-to-images': 'image', 'images-to-pdf': 'images', 'pdf-to-text': 'text', 'pdf-to-html': 'html',
  'pdf-to-markdown': 'markdown', 'pdf-to-json': 'json', 'text-to-pdf': 'type', 'pdf-to-pdfa': 'archive',
  compress: 'compress', grayscale: 'droplet', ocr: 'scan', protect: 'lock', unlock: 'unlock', redact: 'redact',
  info: 'info', compare: 'compare',
};

export function App() {
  const files = useStore((s) => s.files);
  const activeId = useStore((s) => s.activeId);
  const toolId = useStore((s) => s.toolId);
  const theme = useStore((s) => s.theme);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const jobs = useStore((s) => s.jobs);
  const passwordRequest = useStore((s) => s.passwordRequest);
  const toasts = useStore((s) => s.toasts);
  const netRequests = useStore((s) => s.netRequests);
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState(false);
  const [activity, setActivity] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = files.find((f) => f.id === activeId) || files[0] || null;
  const tool = toolId ? TOOL_MAP.get(toolId) : null;
  const running = jobs.filter((j) => j.status === 'running').length;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f3f2ec' : '#07080b');
  }, [theme]);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) void addFileList(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        actions.setPalette(!getState().paletteOpen);
      } else if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        inputRef.current?.click();
      } else if (e.key === 'Escape') {
        if (getState().paletteOpen) actions.setPalette(false);
        else if (getState().toolId) actions.setTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function openTool(id: string) {
    actions.setTool(id);
  }

  async function makeSample() {
    const text = `# NOVA PDF Master\n\nThis is a sample document generated in your browser. Nothing was downloaded and nothing was uploaded.\n\n## What you can do\n\n- Merge, split and reorganise pages with live previews\n- Sign, annotate and truly redact sensitive content\n- Compress, convert and OCR scans without a server\n- Encrypt any PDF with AES-256\n\n## Why local matters\n\nMost online PDF tools ask you to upload a private document to a machine you do not control. NOVA PDF never does that. The engine is PDF.js and pdf-lib, running inside this tab.\n\n> Open a real file whenever you are ready. Your document never leaves this device.\n\n## A few words in Greek\n\nΑυτό το έγγραφο δημιουργήθηκε τοπικά, χωρίς αποστολή σε διακομιστή. Η επεξεργασία PDF μπορεί να είναι ιδιωτική.\n\n---\n\nAdd your own pages, run a tool, and download the result. No account, no watermark, no file-size limit.`;
    try {
      const r = await textToPdf(text, {
        pageSize: 'a4',
        orientation: 'portrait',
        margin: 64,
        fontSize: 11,
        lineHeight: 1.55,
        font: 'sans',
        numbers: true,
        title: 'NOVA PDF Master — sample',
      });
      const file: PdfFile = {
        id: uid('sample'),
        name: 'nova-pdf-sample.pdf',
        bytes: r.bytes,
        size: r.bytes.byteLength,
        mime: 'application/pdf',
        pageCount: r.pages,
        encrypted: false,
        addedAt: Date.now(),
      };
      actions.addFiles([file]);
      actions.toast('Sample PDF created locally', 'success');
    } catch (e) {
      actions.toast('Could not create the sample: ' + (e as Error).message, 'error');
    }
  }

  return (
    <div className={`app ${dragging ? 'is-dragging' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg,image/webp,image/avif"
        className="hidden-input"
        onChange={(e) => {
          if (e.target.files?.length) void addFileList(e.target.files);
          e.target.value = '';
        }}
      />

      <header className="topbar">
        <div className="topbar-left">
          <Logo />
          <span className="topbar-sep" />
          <span className="topbar-label">{tool ? tool.name : 'Workspace'}</span>
        </div>
        <div className="topbar-right">
          <div id="nova-lang-slot" className="lang-slot" aria-label="Language" />
          <span className="privacy-pill" title="The badge counts any non-GET or cross-origin request. NOVA PDF never uploads documents.">
            <Icon name="shield" size={13} />
            {netRequests === 0 ? '0 uploads' : `${netRequests} external`}
          </span>
          <button className="cmd-btn" onClick={() => actions.setPalette(true)}>
            <Icon name="search" size={14} />
            <span>Search tools</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className="icon-btn" onClick={() => inputRef.current?.click()} title="Open PDF (Ctrl+O)">
            <Icon name="plus" size={18} />
          </button>
          <button className="icon-btn" onClick={() => setActivity((a) => !a)} title="Activity">
            <Icon name="layers" size={18} />
            {running > 0 && <span className="dot" />}
          </button>
          <button className="icon-btn" onClick={() => actions.toggleTheme()} title="Toggle theme">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
          </button>
        </div>
      </header>

      <div className="filebar">
        <div className="filebar-tabs">
          {files.map((f) => (
            <button
              key={f.id}
              className={`file-tab ${f.id === active?.id ? 'active' : ''}`}
              onClick={() => actions.setActive(f.id)}
              title={f.name}
            >
              <Icon name={/^image\//.test(f.mime) ? 'image' : 'file'} size={13} />
              <span>{f.name}</span>
              {f.pageCount > 0 && <em>{f.pageCount}p</em>}
              <span
                className="tab-close"
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  releasePdfDoc(f.id);
                  actions.removeFile(f.id);
                }}
              >
                <Icon name="close" size={11} />
              </span>
            </button>
          ))}
          <button className="file-tab add" onClick={() => inputRef.current?.click()}>
            <Icon name="plus" size={14} /> Open
          </button>
        </div>
      </div>

      <div className="app-body">
        <aside className="rail">
          <div className="rail-search">
            <Icon name="search" size={15} />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a tool…" />
            {filter && (
              <button onClick={() => setFilter('')} aria-label="Clear">
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
          <div className="rail-scroll">
            {(['organize', 'edit', 'convert', 'optimize', 'secure', 'extract'] as const).map((cat) => {
              const items = TOOLS.filter((t) => t.category === cat && t.name.toLowerCase().includes(filter.toLowerCase()));
              if (!items.length) return null;
              return (
                <div className="rail-group" key={cat}>
                  <div className="rail-title">{CATEGORY_LABELS[cat]}</div>
                  {items.map((t) => (
                    <button
                      key={t.id}
                      className={`rail-item ${tool?.id === t.id ? 'active' : ''}`}
                      onClick={() => openTool(t.id)}
                      title={t.short}
                    >
                      <span className="rail-icon"><Icon name={toolIcons[t.id] || 'file'} size={16} /></span>
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <div className="rail-foot">
            <span className="local-dot" />
            <div>
              <b>Local engine</b>
              <span>PDF.js + pdf-lib</span>
            </div>
          </div>
        </aside>

        <main className="app-main">
          {tool ? (
            <ToolWorkspace tool={tool} files={files} active={active} onClose={() => actions.setTool(null)} />
          ) : active ? (
            <PdfViewer file={active} />
          ) : (
            <Hero onOpen={() => inputRef.current?.click()} onTool={openTool} onSample={makeSample} />
          )}
        </main>
      </div>

      <footer className="statusbar">
        <div className="status-left">
          <span>{files.length ? `${files.length} document${files.length === 1 ? '' : 's'} open` : 'No document open'}</span>
          {files.length > 0 && <span className="muted">{formatBytes(files.reduce((s, f) => s + f.size, 0))} in memory</span>}
        </div>
        <div className="status-right">
          <span>Nothing leaves this tab</span>
          <span className="status-sep" />
          <span className="muted">v1.0</span>
        </div>
      </footer>

      {activity && <ActivityDrawer onClose={() => setActivity(false)} />}
      {paletteOpen && <CommandPalette onClose={() => actions.setPalette(false)} onTool={openTool} onOpen={() => inputRef.current?.click()} />}
      {passwordRequest && <PasswordDialog fileName={passwordRequest.fileName} onSubmit={(v) => passwordRequest.resolve(v)} />}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => actions.dismissToast(t.id)}>
            <Icon name={t.kind === 'error' ? 'warn' : t.kind === 'success' ? 'check' : 'info'} size={15} />
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            <Icon name="download" size={34} />
            <h2>Drop to open</h2>
            <p>PDFs and images stay on this device.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Hero({ onOpen, onTool, onSample }: { onOpen: () => void; onTool: (id: string) => void; onSample: () => void }) {
  const quick = ['merge', 'split', 'compress', 'sign', 'redact', 'ocr'];
  return (
    <div className="hero">
      <div className="hero-noise" />
      <div className="hero-inner">
        <div className="hero-badge"><span /> Local-first PDF workstation</div>
        <h1>
          Every PDF tool.
          <br />
          <span>Zero uploads.</span>
        </h1>
        <p className="hero-sub">
          Merge, edit, convert, compress, sign, redact and OCR — entirely inside your browser.
          No account, no server, no watermark, no file leaving your device.
        </p>
        <div className="hero-actions">
          <button className="hero-open" onClick={onOpen}>
            <Icon name="plus" size={17} /> Open PDF or image
          </button>
          <button className="hero-sample" onClick={onSample}>Generate a sample PDF</button>
        </div>
        <div className="dropzone" onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
          <div className="dropzone-ring">
            <Icon name="download" size={26} />
          </div>
          <div>
            <b>Drop files anywhere</b>
            <span>PDF · PNG · JPG · WebP · AVIF — up to your device's memory</span>
          </div>
        </div>
        <div className="quick-row">
          {quick.map((id) => {
            const t = TOOL_MAP.get(id)!;
            return (
              <button key={id} onClick={() => onTool(id)}>
                <Icon name={toolIcons[id]} size={16} />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hero-proof">
        <div className="proof">
          <Icon name="shield" size={18} />
          <div><b>File never uploaded</b><span>No network request carries your document.</span></div>
        </div>
        <div className="proof">
          <Icon name="spark" size={18} />
          <div><b>Full engine, offline</b><span>PDF.js + pdf-lib + OCR compiled for the browser.</span></div>
        </div>
        <div className="proof">
          <Icon name="lock" size={18} />
          <div><b>AES-256 encryption</b><span>Protect files locally, with real permissions.</span></div>
        </div>
      </div>
    </div>
  );
}

function CommandPalette({ onClose, onTool, onOpen }: { onClose: () => void; onTool: (id: string) => void; onOpen: () => void }) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return TOOLS;
    return TOOLS.filter((t) => (t.name + ' ' + t.short + ' ' + t.category).toLowerCase().includes(needle));
  }, [q]);
  const [cursor, setCursor] = useState(0);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            placeholder="Search 30+ PDF tools…"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setCursor((c) => Math.min(results.length - 1, c + 1));
              if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1));
              if (e.key === 'Enter') {
                if (results[cursor]) {
                  onTool(results[cursor].id);
                  onClose();
                }
              }
              if (e.key === 'Escape') onClose();
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {results.length === 0 && <div className="palette-empty">No tool matches “{q}”.</div>}
          {results.map((t, i) => (
            <button
              key={t.id}
              className={`palette-item ${i === cursor ? 'active' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                onTool(t.id);
                onClose();
              }}
            >
              <span className="palette-icon"><Icon name={toolIcons[t.id] || 'file'} size={16} /></span>
              <span className="palette-text"><b>{t.name}</b><em>{t.short}</em></span>
              <span className="palette-cat">{CATEGORY_LABELS[t.category]}</span>
            </button>
          ))}
        </div>
        <div className="palette-foot">
          <button onClick={() => { onOpen(); onClose(); }}>
            <Icon name="plus" size={13} /> Open a file
          </button>
          <span>↑↓ to navigate · Enter to run</span>
        </div>
      </div>
    </div>
  );
}

function PasswordDialog({ fileName, onSubmit }: { fileName: string; onSubmit: (v: string | null) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="modal-backdrop">
      <div className="dialog">
        <div className="dialog-icon"><Icon name="lock" size={22} /></div>
        <h3>Password required</h3>
        <p><b>{fileName}</b> is encrypted. Enter its password to open it locally.</p>
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="PDF password"
          onKeyDown={(e) => e.key === 'Enter' && onSubmit(value)}
        />
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={() => onSubmit(null)}>Skip file</button>
          <button className="primary-btn" onClick={() => onSubmit(value)}>Unlock</button>
        </div>
        <p className="dialog-note"><Icon name="shield" size={12} /> The password is used in memory only.</p>
      </div>
    </div>
  );
}

function ActivityDrawer({ onClose }: { onClose: () => void }) {
  const jobs = useStore((s) => s.jobs);
  return (
    <div className="activity">
      <div className="activity-head">
        <b>Activity</b>
        <div className="activity-actions">
          <button className="mini-btn" onClick={() => actions.clearJobs()}>Clear</button>
          <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
      </div>
      <div className="activity-list">
        {jobs.length === 0 && <p className="empty-hint">Jobs you run will appear here. Everything runs locally.</p>}
        {jobs.map((j) => (
          <div className="activity-row" key={j.id}>
            <span className={`job-state ${j.status}`} />
            <div className="job-main">
              <div className="job-title">
                <b>{j.title}</b>
                <span>{j.status === 'running' ? `${Math.round(j.progress * 100)}%` : j.status}</span>
              </div>
              <div className={`job-bar ${j.status}`}>
                <span style={{ width: `${j.status === 'done' ? 100 : Math.round(j.progress * 100)}%` }} />
              </div>
              <div className="job-meta">{j.error || j.summary || j.message}</div>
              {j.outputs.length > 0 && (
                <div className="job-outputs">
                  {j.outputs.map((o) => (
                    <button key={o.id} onClick={() => downloadBytes(o.bytes, o.name, o.mime)}>
                      <Icon name="download" size={12} /> {o.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {j.status === 'running' ? (
              <button className="mini-btn" onClick={() => cancelJob(j.id)}>Cancel</button>
            ) : (
              <button className="mini-btn" onClick={() => actions.removeJob(j.id)} title="Remove">
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
