import { useEffect, useMemo, useState } from 'react';
import type { OptionValue, PdfFile } from '../../lib/types';
import type { EditorProps } from './PageEditors';
import { formatBytes } from '../../lib/util';
import { Icon } from '../components/Icon';

type MergeProps = {
  files: PdfFile[];
  options: Record<string, OptionValue>;
  setOption: (k: string, v: OptionValue) => void;
};

export function MergeEditor({ files, options, setOption }: MergeProps) {
  const [order, setOrder] = useState<string[]>(() => {
    const saved = options.mergeIds as string[] | undefined;
    const known = new Set(files.map((f) => f.id));
    const kept = (saved || []).filter((id) => known.has(id));
    const missing = files.map((f) => f.id).filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  });
  const [enabled, setEnabled] = useState<string[]>(() => {
    const saved = options.mergeIds as string[] | undefined;
    return saved && saved.length ? saved : files.map((f) => f.id);
  });

  useEffect(() => {
    const known = new Set(files.map((f) => f.id));
    setOrder((o) => [...o.filter((id) => known.has(id)), ...files.map((f) => f.id).filter((id) => !o.includes(id))]);
    setEnabled((e) => e.filter((id) => known.has(id)));
  }, [files.map((f) => f.id).join(',')]);

  useEffect(() => {
    setOption('mergeIds', order.filter((id) => enabled.includes(id)));
  }, [order, enabled]);

  const map = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);
  const selected = order.filter((id) => map.has(id) && enabled.includes(id));
  const totalPages = selected.reduce((s, id) => s + (map.get(id)?.pageCount || 0), 0);

  return (
    <div className="editor-simple">
      <div className="editor-head">
        <div>
          <h3>Build the merged document</h3>
          <p>Every open PDF is included. Untick what you do not need, or move files up and down.</p>
        </div>
        <span className="pill">{selected.length} files · {totalPages} pages</span>
      </div>
      <div className="merge-list">
        {order.map((id, index) => {
          const f = map.get(id);
          if (!f) return null;
          const on = enabled.includes(id);
          return (
            <div className={`merge-row ${on ? '' : 'off'}`} key={id}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => setEnabled((list) => (e.target.checked ? [...list, id] : list.filter((x) => x !== id)))}
              />
              <span className="merge-index">{index + 1}</span>
              <div className="merge-file">
                <b>{f.name}</b>
                <span>{f.pageCount} pages · {formatBytes(f.size)}</span>
              </div>
              <div className="merge-actions">
                <button disabled={index === 0} onClick={() => setOrder((o) => { const c = [...o]; [c[index - 1], c[index]] = [c[index], c[index - 1]]; return c; })} title="Move up">
                  <Icon name="arrowLeft" size={14} style={{ transform: 'rotate(90deg)' }} />
                </button>
                <button disabled={index === order.length - 1} onClick={() => setOrder((o) => { const c = [...o]; [c[index + 1], c[index]] = [c[index], c[index + 1]]; return c; })} title="Move down">
                  <Icon name="arrowRight" size={14} style={{ transform: 'rotate(90deg)' }} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="tip-inline"><Icon name="info" size={14} /> The order on this list is the order in the final PDF.</p>
    </div>
  );
}

export function CompareEditor({ files, options, setOption }: MergeProps) {
  const [aId, setAId] = useState(String(options.aId || files[0]?.id || ''));
  const [bId, setBId] = useState(String(options.bId || files[1]?.id || files[0]?.id || ''));
  const [dpi, setDpi] = useState(Number(options.dpi || 110));

  useEffect(() => {
    setOption('aId', aId);
    setOption('bId', bId);
    setOption('dpi', dpi);
  }, [aId, bId, dpi]);

  if (files.length < 2) {
    return (
      <div className="editor-simple">
        <div className="empty-state">
          <Icon name="compare" size={30} />
          <h3>Open two documents</h3>
          <p>Comparison needs two PDFs. Open the old and new version, then come back.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-simple">
      <div className="editor-head">
        <div>
          <h3>Compare two versions</h3>
          <p>Pages are rendered side by side and every changed region is highlighted in red.</p>
        </div>
      </div>
      <div className="compare-picks">
        <div className="field-row">
          <label>Original</label>
          <select value={aId} onChange={(e) => setAId(e.target.value)}>
            {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="compare-vs">vs</div>
        <div className="field-row">
          <label>Revised</label>
          <select value={bId} onChange={(e) => setBId(e.target.value)}>
            {files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label>Resolution</label>
          <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            <option value={80}>80 DPI — fast</option>
            <option value={110}>110 DPI — balanced</option>
            <option value={150}>150 DPI — precise</option>
          </select>
        </div>
      </div>
      <div className="tip">
        <Icon name="info" size={14} />
        <span>The HTML report includes a side-by-side image and a red diff overlay for every page.</span>
      </div>
    </div>
  );
}
