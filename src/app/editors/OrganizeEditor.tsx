import { useEffect, useMemo, useState } from 'react';
import type { OptionValue, PdfFile } from '../../lib/types';
import type { OrganizePlanItem } from '../../lib/pdf/ops/organize';
import { PageSurface } from '../components/PdfView';
import { Icon } from '../components/Icon';

type Props = {
  file: PdfFile;
  options: Record<string, OptionValue>;
  setOption: (k: string, v: OptionValue) => void;
};

export function OrganizeEditor({ file, options, setOption }: Props) {
  const initial = useMemo<OrganizePlanItem[]>(() => {
    const existing = options.plan as unknown as OrganizePlanItem[] | undefined;
    if (existing && existing.length) return existing;
    return Array.from({ length: Math.max(1, file.pageCount) }, (_, i) => ({
      source: i,
      page: i,
      rotate: 0,
      id: `p${i}-${Math.random().toString(36).slice(2, 7)}`,
    }));
  }, [file.id, file.pageCount]);

  const [plan, setPlan] = useState<OrganizePlanItem[]>(initial);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    setPlan(initial);
  }, [initial]);

  useEffect(() => {
    setOption('plan', plan as unknown as OptionValue);
  }, [plan]);

  const update = (id: string, patch: Partial<OrganizePlanItem>) =>
    setPlan((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  function move(from: number, to: number) {
    if (from === to) return;
    setPlan((p) => {
      const copy = [...p];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  }

  return (
    <div className="organize-editor">
      <div className="editor-head">
        <div>
          <h3>Page canvas</h3>
          <p>Drag to reorder. Rotate, duplicate or remove pages. The PDF is rebuilt on apply.</p>
        </div>
        <div className="editor-actions">
          <span className="pill">{plan.length} of {file.pageCount} pages</span>
          <button className="mini-btn" onClick={() => setPlan(initial)}>
            <Icon name="undo" size={14} /> Reset
          </button>
          <button
            className="mini-btn"
            onClick={() =>
              setPlan((p) => {
                const last = p[p.length - 1];
                return [...p, { source: last?.source ?? 0, page: last?.page ?? 0, rotate: 0, id: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` }];
              })
            }
          >
            <Icon name="copy" size={14} /> Duplicate last
          </button>
        </div>
      </div>
      <div className="page-grid">
        {plan.map((item, index) => (
          <div
            key={item.id}
            className={`page-card ${dragIndex === index ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, index);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <div className="page-card-paper">
              <PageSurface file={file} page={Math.min(file.pageCount || 1, item.page + 1)} quality={0.75} />
              <span className="page-badge">{index + 1}</span>
              {item.rotate !== 0 && <span className="rot-badge">{item.rotate}°</span>}
            </div>
            <div className="page-card-tools">
              <button title="Rotate left" onClick={() => update(item.id, { rotate: (item.rotate + 270) % 360 })}>
                <Icon name="undo" size={14} />
              </button>
              <button title="Rotate right" onClick={() => update(item.id, { rotate: (item.rotate + 90) % 360 })}>
                <Icon name="rotate" size={14} />
              </button>
              <button title="Duplicate" onClick={() => setPlan((p) => [...p.slice(0, index + 1), { ...item, id: `${item.id}-d${Date.now()}` }, ...p.slice(index + 1)])}>
                <Icon name="copy" size={14} />
              </button>
              <button
                title="Remove"
                className="danger"
                onClick={() => setPlan((p) => (p.length > 1 ? p.filter((x) => x.id !== item.id) : p))}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
