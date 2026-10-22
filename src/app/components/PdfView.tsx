import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfFile } from '../../lib/types';
import { closePdf, openPdfjs } from '../../lib/pdf/render';
import { Icon } from './Icon';

const cache = new Map<string, Promise<PDFDocumentProxy>>();

export function getPdfDoc(file: PdfFile): Promise<PDFDocumentProxy> {
  let hit = cache.get(file.id);
  if (!hit) {
    hit = openPdfjs(file.bytes, file.password);
    cache.set(file.id, hit);
  }
  return hit;
}

export function releasePdfDoc(fileId: string) {
  const hit = cache.get(fileId);
  cache.delete(fileId);
  hit?.then((d) => closePdf(d)).catch(() => undefined);
}

export function usePdfDoc(file: PdfFile | null) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setDoc(null);
    setError(null);
    if (!file) return;
    getPdfDoc(file)
      .then((d) => {
        if (alive) setDoc(d);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message || 'Could not open this PDF');
      });
    return () => {
      alive = false;
    };
  }, [file?.id, file?.password]);
  return { doc, error };
}

type PageSurfaceProps = {
  file: PdfFile;
  page: number;
  className?: string;
  /** Called with rendered size in CSS pixels and the page's viewport aspect. */
  onSize?: (size: { width: number; height: number; ratio: number }) => void;
  children?: ReactNode;
  quality?: number;
};

export function PageSurface({ file, page, className = '', onSize, children, quality = 1.6 }: PageSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1 / 1.414);
  const [ready, setReady] = useState(false);
  const { doc } = usePdfDoc(file);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let raf = 0;
    const measure = () => {
      const width = host.clientWidth;
      if (width > 0) host.style.setProperty('--pw', width + 'px');
    };
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    measure();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    (async () => {
      try {
        setReady(false);
        const p = await doc.getPage(page);
        if (cancelled) return;
        const base = p.getViewport({ scale: 1 });
        setRatio(base.width / base.height);
        const host = hostRef.current;
        if (!host) return;
        const cssWidth = Math.max(120, host.clientWidth);
        const dpr = Math.min(2, window.devicePixelRatio || 1) * quality;
        const viewport = p.getViewport({ scale: (cssWidth / base.width) * dpr });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const task = p.render({ canvasContext: ctx, viewport, canvas } as never);
        renderTask = task as unknown as { cancel: () => void };
        await task.promise;
        if (cancelled) return;
        setReady(true);
        onSize?.({ width: cssWidth, height: cssWidth / (base.width / base.height), ratio: base.width / base.height });
        p.cleanup();
      } catch (err) {
        if (!cancelled && (err as Error).name !== 'RenderingCancelledException') {
          // The viewer keeps the previous page visible; the job layer surfaces the real error.
          console.warn('page render failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        renderTask?.cancel();
      } catch {
        /* already finished */
      }
    };
  }, [doc, page, quality, file.id]);

  return (
    <div
      ref={hostRef}
      className={`page-surface ${className} ${ready ? 'is-ready' : 'is-loading'}`}
      style={{ aspectRatio: `${ratio}` }}
    >
      <canvas ref={canvasRef} className="page-canvas" />
      <div className="page-overlay">{children}</div>
      {!ready && <div className="page-shimmer" />}
    </div>
  );
}

export function PageThumb({ file, page, active, onClick }: { file: PdfFile; page: number; active: boolean; onClick: () => void }) {
  return (
    <button className={`thumb ${active ? 'active' : ''}`} onClick={onClick} type="button" aria-label={`Page ${page}`}>
      <span className="thumb-paper">
        <PageSurface file={file} page={page} quality={0.7} />
      </span>
      <span className="thumb-number">{page}</span>
    </button>
  );
}

export function PdfViewer({ file }: { file: PdfFile }) {
  const [page, setPage] = useState(1);
  const [showThumbs, setShowThumbs] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<{ page: number; snippet: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const { doc, error } = usePdfDoc(file);

  useEffect(() => {
    setPage(1);
    setHits(null);
    setQuery('');
    setSearchOpen(false);
  }, [file.id]);

  useEffect(() => {
    if (page < 1) setPage(1);
    if (file.pageCount && page > file.pageCount) setPage(file.pageCount);
  }, [file.pageCount, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setPage((p) => Math.min(file.pageCount || 1, p + 1));
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setPage((p) => Math.max(1, p - 1));
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(3, z + 0.15));
      if (e.key === '-') setZoom((z) => Math.max(0.4, z - 0.15));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file.pageCount]);

  async function search() {
    if (!doc || !query.trim()) return;
    setSearching(true);
    const found: { page: number; snippet: string }[] = [];
    const needle = query.trim().toLowerCase();
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const tc = await p.getTextContent();
      const text = (tc.items as Array<{ str?: string }>).map((it) => it.str || '').join(' ');
      const idx = text.toLowerCase().indexOf(needle);
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        found.push({ page: i, snippet: '…' + text.slice(start, idx + needle.length + 60).replace(/\s+/g, ' ') + '…' });
      }
      p.cleanup();
      if (found.length >= 60) break;
    }
    setHits(found);
    setSearching(false);
  }

  const total = doc?.numPages || file.pageCount || 0;

  return (
    <div className={`viewer ${showThumbs ? 'with-thumbs' : ''}`}>
      {showThumbs && total > 0 && (
        <aside className="thumbs">
          <div className="thumbs-head">
            <span>Pages</span>
            <span className="muted">{total}</span>
          </div>
          <div className="thumbs-scroll">
            {Array.from({ length: Math.min(total, 250) }, (_, i) => (
              <PageThumb key={i} file={file} page={i + 1} active={page === i + 1} onClick={() => setPage(i + 1)} />
            ))}
          </div>
        </aside>
      )}
      <div className="viewer-main">
        <div className="viewer-bar">
          <div className="viewer-pager">
            <button className="icon-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} title="Previous page">
              <Icon name="arrowLeft" size={16} />
            </button>
            <label className="page-field">
              <input
                value={page}
                inputMode="numeric"
                onChange={(e) => {
                  const v = parseInt(e.target.value.replace(/\D/g, ''), 10);
                  if (v) setPage(Math.min(total || 1, Math.max(1, v)));
                }}
                aria-label="Page number"
              />
              <span>/ {total || '—'}</span>
            </label>
            <button className="icon-btn" disabled={page >= total} onClick={() => setPage((p) => Math.min(total || 1, p + 1))} title="Next page">
              <Icon name="arrowRight" size={16} />
            </button>
          </div>
          <div className="viewer-tools">
            <button className={`icon-btn ${searchOpen ? 'on' : ''}`} onClick={() => setSearchOpen((s) => !s)} title="Search in document">
              <Icon name="search" size={16} />
            </button>
            <button className="icon-btn" onClick={() => setShowThumbs((s) => !s)} title="Toggle thumbnails">
              <Icon name="panel" size={16} />
            </button>
            <span className="divider" />
            <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))} title="Zoom out">
              <Icon name="zoomOut" size={16} />
            </button>
            <button className="zoom-label" onClick={() => setZoom(1)} title="Reset zoom">{Math.round(zoom * 100)}%</button>
            <button className="icon-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.15))} title="Zoom in">
              <Icon name="zoomIn" size={16} />
            </button>
            <button className="icon-btn" onClick={() => setZoom(1)} title="Fit width">
              <Icon name="fit" size={16} />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="search-row">
            <Icon name="search" size={16} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Find text in this document…"
            />
            <button className="mini-btn" onClick={search} disabled={searching}>{searching ? 'Searching…' : 'Find'}</button>
            {hits && <span className="muted">{hits.length} hits</span>}
          </div>
        )}
        {hits && hits.length > 0 && (
          <div className="search-hits">
            {hits.slice(0, 12).map((h, i) => (
              <button key={i} onClick={() => setPage(h.page)}>
                <b>p.{h.page}</b> <span>{h.snippet}</span>
              </button>
            ))}
          </div>
        )}

        {error ? (
          <div className="viewer-error">
            <Icon name="warn" size={22} />
            <div>
              <b>This PDF could not be opened</b>
              <p>{file.encrypted ? 'It is password protected. Re-open it and enter the password.' : error}</p>
            </div>
          </div>
        ) : (
          <div className="viewer-stage">
            <div className="page-holder" style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: 900 * zoom }}>
              <PageSurface file={file} page={Math.min(page, total || 1)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
