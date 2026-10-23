import { useEffect, useRef, useState } from 'react';
import type { OptionValue, PdfFile } from '../../lib/types';
import type { Annotation, Placement } from '../../lib/pdf/ops/edit';
import type { RedactionBox } from '../../lib/pdf/ops/secure';
import { dataUrlToBytes } from '../../lib/util';
import { PageSurface } from '../components/PdfView';
import { Icon } from '../components/Icon';

export type EditorProps = {
  file: PdfFile;
  options: Record<string, OptionValue>;
  setOption: (k: string, v: OptionValue) => void;
  setOptions: (patch: Record<string, OptionValue>) => void;
};

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function PageNav({ page, total, onChange }: { page: number; total: number; onChange: (n: number) => void }) {
  return (
    <div className="page-nav">
      <button className="icon-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <Icon name="arrowLeft" size={16} />
      </button>
      <span>
        Page <b>{page}</b> of {total}
      </span>
      <button className="icon-btn" disabled={page >= total} onClick={() => onChange(page + 1)}>
        <Icon name="arrowRight" size={16} />
      </button>
    </div>
  );
}

function useDraw(active: boolean, onRect: (r: Rect) => void, onPath?: (pts: Point[]) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<Point | null>(null);
  const [ghost, setGhost] = useState<Rect | null>(null);
  const [path, setPath] = useState<Point[]>([]);
  const drawing = useRef(false);

  const norm = (e: React.PointerEvent): Point => {
    const box = ref.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - box.left) / box.width), y: clamp01((e.clientY - box.top) / box.height) };
  };

  const down = (e: React.PointerEvent) => {
    if (!active) return;
    if ((e.target as HTMLElement).closest('[data-box]')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = norm(e);
    start.current = p;
    drawing.current = true;
    if (onPath) setPath([p]);
    else setGhost({ x: p.x, y: p.y, width: 0, height: 0 });
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !start.current) return;
    const p = norm(e);
    if (onPath) setPath((old) => [...old, p]);
    else {
      const s = start.current;
      setGhost({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), width: Math.abs(p.x - s.x), height: Math.abs(p.y - s.y) });
    }
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (onPath) {
      if (path.length > 1) onPath(path);
      setPath([]);
    } else if (ghost && ghost.width > 0.005 && ghost.height > 0.005) {
      onRect(ghost);
      setGhost(null);
    } else setGhost(null);
    start.current = null;
  };

  return { ref, ghost, path, handlers: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up } };
}

/* ────────────────────────────── SIGN ────────────────────────────── */

export function SignEditor({ file, options, setOption }: EditorProps) {
  const [page, setPage] = useState(1);
  const [ratio, setRatio] = useState(1 / 1.414);
  const [placements, setPlacements] = useState<Placement[]>((options.placements as unknown as Placement[]) || []);
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typed, setTyped] = useState('');
  const [sig, setSig] = useState<{ dataUrl: string; mime: string; bytes: Uint8Array; w: number; h: number } | null>(null);
  const [queued, setQueued] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOption('placements', placements as unknown as OptionValue);
  }, [placements]);

  useEffect(() => {
    setPage(1);
    setPlacements([]);
  }, [file.id]);

  function makeImage(dataUrl: string, w: number, h: number, mime = 'image/png') {
    const bytes = dataUrlToBytes(dataUrl);
    setSig({ dataUrl, mime, bytes, w, h });
  }

  function addToPage(asset = sig) {
    if (!asset) {
      setQueued(true);
      return;
    }
    const width = 0.3;
    const height = clamp01(width * (asset.h / asset.w) * (1 / ratio));
    setPlacements((p) => [
      ...p,
      {
        id: `sig-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        page: page - 1,
        x: 0.5 - width / 2,
        y: 0.72,
        width,
        height,
        rotation: 0,
        opacity: 1,
        kind: 'image',
        imageBytes: asset.bytes,
        imageMime: asset.mime,
        dataUrl: asset.dataUrl,
      },
    ]);
    setQueued(false);
  }

  useEffect(() => {
    if (queued && sig) addToPage(sig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, sig]);

  function startDrag(e: React.PointerEvent, item: Placement) {
    e.stopPropagation();
    const box = overlayRef.current!.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: item.x, y: item.y };
    const move = (ev: PointerEvent) => {
      setPlacements((p) =>
        p.map((x) =>
          x.id === item.id
            ? {
                ...x,
                x: Math.min(1 - x.width, Math.max(0, orig.x + (ev.clientX - startX) / box.width)),
                y: Math.min(1 - x.height, Math.max(0, orig.y + (ev.clientY - startY) / box.height)),
              }
            : x,
        ),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startResize(e: React.PointerEvent, item: Placement) {
    e.stopPropagation();
    const box = overlayRef.current!.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { w: item.width, h: item.height };
    const move = (ev: PointerEvent) => {
      setPlacements((p) =>
        p.map((x) =>
          x.id === item.id
            ? {
                ...x,
                width: Math.min(1 - x.x, Math.max(0.04, orig.w + (ev.clientX - startX) / box.width)),
                height: Math.min(1 - x.y, Math.max(0.02, orig.h + (ev.clientY - startY) / box.height)),
              }
            : x,
        ),
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  const pagePlacements = placements.filter((p) => p.page === page - 1);

  return (
    <div className="editor-grid">
      <div className="editor-canvas">
        <PageNav page={page} total={file.pageCount} onChange={setPage} />
        <div className="page-holder editor-page">
          <PageSurface file={file} page={page} onSize={(s) => setRatio(s.ratio)}>
            <div ref={overlayRef} className="abs-fill">
              {pagePlacements.map((p) => (
                <div
                  key={p.id}
                  data-box
                  className="placed"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.width * 100}%`, height: `${p.height * 100}%` }}
                  onPointerDown={(e) => startDrag(e, p)}
                >
                  {p.dataUrl && <img src={p.dataUrl} alt="signature" draggable={false} />}
                  <span className="resize-handle" onPointerDown={(e) => startResize(e, p)} />
                  <button
                    className="placed-delete"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => setPlacements((arr) => arr.filter((x) => x.id !== p.id))}
                    title="Remove"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>
              ))}
            </div>
          </PageSurface>
        </div>
        <p className="editor-caption">Drag the signature to move it. Pull the corner to resize.</p>
      </div>

      <div className="editor-side">
        <div className="tabs">
          <button className={tab === 'draw' ? 'on' : ''} onClick={() => setTab('draw')}>Draw</button>
          <button className={tab === 'type' ? 'on' : ''} onClick={() => setTab('type')}>Type</button>
          <button className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>Upload</button>
        </div>

        {tab === 'draw' && <SignaturePad onReady={makeImage} />}
        {tab === 'type' && (
          <div className="type-sign">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your name" aria-label="Type your signature name" />
            <div className="type-preview" style={{ fontFamily: '"Segoe Script","Brush Script MT",cursive' }}>
              {typed || 'Your name'}
            </div>
            <button
              className="primary-btn"
              disabled={!typed.trim()}
              onClick={() => {
                const canvas = document.createElement('canvas');
                canvas.width = 1400;
                canvas.height = 380;
                const ctx = canvas.getContext('2d')!;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#101014';
                ctx.font = 'italic 96px "Segoe Script","Brush Script MT",cursive';
                ctx.textBaseline = 'middle';
                ctx.fillText(typed, 60, canvas.height / 2);
                makeImage(canvas.toDataURL('image/png'), canvas.width, canvas.height);
              }}
            >
              Use this signature
            </button>
          </div>
        )}
        {tab === 'upload' && (
          <label className="file-drop tall">
            <input
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Upload a signature image"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const url = URL.createObjectURL(f);
                const img = new Image();
                img.src = url;
                await img.decode();
                makeImage(url, img.naturalWidth, img.naturalHeight, f.type || 'image/png');
              }}
            />
            <Icon name="image" size={22} />
            <span>Upload a signature image</span>
            <em>Transparent PNG works best</em>
          </label>
        )}

        <button className="primary-btn wide" onClick={() => addToPage()} disabled={!sig}>
          <Icon name="plus" size={15} /> Place on page {page}
        </button>
        {!sig && <p className="opt-hint">Create or upload a signature first.</p>}

        {placements.length > 0 && (
          <div className="placed-list">
            <div className="side-title">Placed ({placements.length})</div>
            {placements.map((p) => (
              <div key={p.id} className="placed-row">
                <span>Page {p.page + 1}</span>
                <button onClick={() => setPage(p.page + 1)}>View</button>
                <button className="danger" onClick={() => setPlacements((arr) => arr.filter((x) => x.id !== p.id))}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        {sig && (
          <button className="ghost-btn wide" onClick={() => { setSig(null); setQueued(false); }}>
            Clear signature
          </button>
        )}
      </div>
    </div>
  );
}

function SignaturePad({ onReady }: { onReady: (dataUrl: string, w: number, h: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 700 * dpr;
    canvas.height = 240 * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111116';
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 700, y: ((e.clientY - r.top) / r.height) * 240 };
  };

  return (
    <div className="sig-pad-wrap">
      <canvas
        ref={ref}
        className="sig-pad"
        onPointerDown={(e) => {
          drawing.current = true;
          last.current = pos(e);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current || !last.current) return;
          const p = pos(e);
          const ctx = ref.current!.getContext('2d')!;
          ctx.beginPath();
          ctx.moveTo(last.current.x, last.current.y);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          last.current = p;
        }}
        onPointerUp={() => {
          drawing.current = false;
          last.current = null;
        }}
        onPointerLeave={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="sig-pad-actions">
        <button
          className="mini-btn"
          onClick={() => {
            const c = ref.current!;
            const ctx = c.getContext('2d')!;
            ctx.clearRect(0, 0, c.width, c.height);
          }}
        >
          Clear
        </button>
        <button
          className="primary-btn"
          onClick={() => {
            const c = ref.current!;
            onReady(c.toDataURL('image/png'), c.width, c.height);
          }}
        >
          Use drawing
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────── ANNOTATE ────────────────────────────── */

type AnnoTool = 'text' | 'highlight' | 'rect' | 'pen';

export function AnnotateEditor({ file, options, setOption }: EditorProps) {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Annotation[]>((options.annotations as unknown as Annotation[]) || []);
  const [tool, setTool] = useState<AnnoTool>('text');
  const [color, setColor] = useState('#f4c542');
  const [textColor, setTextColor] = useState('#d92d4b');
  const [size, setSize] = useState(14);
  const [opacity, setOpacity] = useState(0.45);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setOption('annotations', items as unknown as OptionValue);
  }, [items]);
  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [file.id]);

  const draw = useDraw(
    true,
    (r) => {
      const base = { id: `a${Date.now()}`, page: page - 1, ...r };
      if (tool === 'text') {
        const item: Annotation = { ...base, type: 'text', text: 'Note', size, color: textColor, opacity: 1 };
        setItems((p) => [...p, item]);
        setSelected(item.id);
      } else if (tool === 'rect') {
        setItems((p) => [...p, { ...base, type: 'rect', color: textColor, opacity: 1, borderWidth: 2, fill: false }]);
      } else {
        setItems((p) => [...p, { ...base, type: 'highlight', color, opacity, borderWidth: 0, fill: true }]);
      }
    },
    (pts) => {
      setItems((p) => [...p, { id: `a${Date.now()}`, type: 'pen', page: page - 1, points: pts, color: textColor, width: 2.5, opacity: 1 }]);
    },
  );

  const pageItems = items.filter((i) => i.page === page - 1);

  return (
    <div className="editor-grid">
      <div className="editor-canvas">
        <PageNav page={page} total={file.pageCount} onChange={setPage} />
        <div className="anno-toolbar">
          {(['text', 'highlight', 'rect', 'pen'] as AnnoTool[]).map((t) => (
            <button key={t} className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>
              <Icon name={t === 'text' ? 'type' : t === 'pen' ? 'pen' : t === 'highlight' ? 'annotate' : 'grid'} size={14} />
              {t === 'rect' ? 'Box' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <span className="divider" />
          <label className="anno-color">
            <input type="color" aria-label="Annotation colour" value={tool === 'highlight' ? color : textColor} onChange={(e) => (tool === 'highlight' ? setColor : setTextColor)(e.target.value)} />
          </label>
          {tool === 'text' && (
            <label className="anno-size">
              <input type="number" aria-label="Text size in points" min={6} max={72} value={size} onChange={(e) => setSize(Number(e.target.value))} /> pt
            </label>
          )}
          {tool === 'highlight' && (
            <input className="anno-opacity" aria-label="Highlight opacity" type="range" min={0.1} max={0.8} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
          )}
        </div>
        <div className="page-holder editor-page">
          <PageSurface file={file} page={page}>
            <div ref={draw.ref} className="abs-fill draw-layer" {...draw.handlers}>
              {pageItems.map((a) => {
                if (a.type === 'text') {
                  return (
                    <div
                      key={a.id}
                      data-box
                      className={`anno-text ${selected === a.id ? 'selected' : ''}`}
                      style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, color: a.color, fontSize: `${Math.max(7, a.size * 0.9)}px` }}
                      onPointerDown={(e) => { e.stopPropagation(); setSelected(a.id); }}
                    >
                      {a.text}
                    </div>
                  );
                }
                if (a.type === 'pen') {
                  const d = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x * 1000},${p.y * 1000}`).join(' ');
                  return (
                    <svg key={a.id} className="abs-fill" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                      <path d={d} fill="none" stroke={a.color} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                    </svg>
                  );
                }
                return (
                  <div
                    key={a.id}
                    data-box
                    className={`anno-rect ${a.type}`}
                    style={{
                      left: `${a.x * 100}%`,
                      top: `${a.y * 100}%`,
                      width: `${a.width * 100}%`,
                      height: `${a.height * 100}%`,
                      borderColor: a.type === 'rect' ? a.color : 'transparent',
                      background: a.type === 'highlight' ? a.color : 'transparent',
                      opacity: a.type === 'highlight' ? a.opacity : 1,
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                );
              })}
              {draw.ghost && (
                <div
                  className="anno-rect ghost"
                  style={{ left: `${draw.ghost.x * 100}%`, top: `${draw.ghost.y * 100}%`, width: `${draw.ghost.width * 100}%`, height: `${draw.ghost.height * 100}%`, borderColor: textColor }}
                />
              )}
              {draw.path.length > 1 && (
                <svg className="abs-fill" viewBox="0 0 1000 1000" preserveAspectRatio="none">
                  <path d={draw.path.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x * 1000},${p.y * 1000}`).join(' ')} fill="none" stroke={textColor} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                </svg>
              )}
            </div>
          </PageSurface>
        </div>
        <p className="editor-caption">Draw directly on the page. Text notes can be edited in the list.</p>
      </div>

      <div className="editor-side">
        <div className="side-title">Annotations on page {page}</div>
        {pageItems.length === 0 && <p className="empty-hint">Nothing yet — choose a tool and drag on the page.</p>}
        {pageItems.map((a) => (
          <div key={a.id} className={`anno-row ${selected === a.id ? 'selected' : ''}`} onClick={() => setSelected(a.id)}>
            {a.type === 'text' ? (
              <input
                value={a.text}
                aria-label="Annotation text"
                onChange={(e) => setItems((p) => p.map((x) => (x.id === a.id && x.type === 'text' ? { ...x, text: e.target.value } : x)))}
              />
            ) : (
              <span className="anno-label">{a.type === 'pen' ? 'Freehand' : a.type === 'highlight' ? 'Highlight' : 'Box'}</span>
            )}
            <button className="danger" onClick={() => setItems((p) => p.filter((x) => x.id !== a.id))} title="Delete">
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
        {items.length > 0 && (
          <button className="ghost-btn wide" onClick={() => setItems([])}>
            <Icon name="trash" size={13} /> Clear all annotations
          </button>
        )}
        <div className="tip">
          <Icon name="info" size={14} />
          <span>Annotations are written as vector objects — they stay sharp at any zoom.</span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── REDACT ────────────────────────────── */

export function RedactEditor({ file, options, setOption }: EditorProps) {
  const [page, setPage] = useState(1);
  const [boxes, setBoxes] = useState<RedactionBox[]>((options.boxes as unknown as RedactionBox[]) || []);
  const [dpi, setDpi] = useState(200);

  useEffect(() => {
    setOption('boxes', boxes as unknown as OptionValue);
    setOption('dpi', dpi);
  }, [boxes, dpi]);
  useEffect(() => {
    setPage(1);
    setBoxes([]);
  }, [file.id]);

  const draw = useDraw(true, (r) => setBoxes((p) => [...p, { page: page - 1, ...r }]));

  const pageBoxes = boxes.filter((b) => b.page === page - 1);

  return (
    <div className="editor-grid">
      <div className="editor-canvas">
        <PageNav page={page} total={file.pageCount} onChange={setPage} />
        <div className="page-holder editor-page">
          <PageSurface file={file} page={page}>
            <div ref={draw.ref} className="abs-fill draw-layer redact-layer" {...draw.handlers}>
              {pageBoxes.map((b, i) => (
                <div
                  key={i}
                  data-box
                  className="redact-box"
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={() => setBoxes((p) => p.filter((x) => x !== b))}
                >
                  <span>{i + 1}</span>
                </div>
              ))}
              {draw.ghost && (
                <div
                  className="redact-box ghost"
                  style={{ left: `${draw.ghost.x * 100}%`, top: `${draw.ghost.y * 100}%`, width: `${draw.ghost.width * 100}%`, height: `${draw.ghost.height * 100}%` }}
                />
              )}
            </div>
          </PageSurface>
        </div>
        <p className="editor-caption">Drag a box over anything private. Double-click a box to remove it.</p>
      </div>

      <div className="editor-side">
        <div className="warn-box">
          <Icon name="warn" size={16} />
          <div>
            <b>This is destructive — and that is the point.</b>
            <p>The page is flattened and the covered text is physically removed. It cannot be selected, copied or recovered.</p>
          </div>
        </div>
        <div className="opt">
          <label>Output resolution</label>
          <select value={dpi} aria-label="Redaction output resolution" onChange={(e) => setDpi(Number(e.target.value))}>
            <option value={150}>150 DPI — fast</option>
            <option value={200}>200 DPI — balanced</option>
            <option value={300}>300 DPI — print</option>
          </select>
        </div>
        <div className="side-title">Marked areas ({boxes.length})</div>
        {boxes.length === 0 && <p className="empty-hint">No areas yet. Drag on the page to mark them.</p>}
        <div className="redact-list">
          {boxes.map((b, i) => (
            <div key={i} className="redact-row">
              <span className="redact-dot" />
              <span>Page {b.page + 1}</span>
              <span className="muted">{Math.round(b.width * 100)}% × {Math.round(b.height * 100)}%</span>
              <button className="danger" onClick={() => setBoxes((p) => p.filter((x) => x !== b))}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
        {boxes.length > 0 && (
          <button className="ghost-btn wide" onClick={() => setBoxes([])}>
            <Icon name="trash" size={13} /> Clear all
          </button>
        )}
      </div>
    </div>
  );
}
