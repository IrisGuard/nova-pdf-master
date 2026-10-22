import type { OptionDef, OptionValue } from '../../lib/types';
import { Icon } from './Icon';

type Props = {
  toolId: string;
  defs: OptionDef[];
  values: Record<string, OptionValue>;
  onChange: (key: string, value: OptionValue) => void;
  disabled?: boolean;
};

function visible(toolId: string, def: OptionDef, v: Record<string, OptionValue>): boolean {
  if (toolId === 'split') {
    if (def.key === 'ranges') return v.mode === 'ranges';
    if (def.key === 'every') return v.mode === 'every';
    if (def.key === 'targetMb') return v.mode === 'size';
  }
  if (toolId === 'watermark') {
    if (def.key === 'text' || def.key === 'size' || def.key === 'color' || def.key === 'rotation' || def.key === 'tile' || def.key === 'bold') return v.mode === 'text';
    if (def.key === 'image' || def.key === 'scale') return v.mode === 'image';
  }
  if (toolId === 'compress') {
    if (def.key === 'dpi' || def.key === 'quality' || def.key === 'grayscale') return v.mode === 'raster';
    if (def.key === 'stripAnnotations') return v.mode === 'lossless' || v.mode === 'raster';
  }
  if (toolId === 'protect' && def.key === 'highQualityPrint') return Boolean(v.allowPrinting);
  if (toolId === 'pdf-to-images' && def.key === 'quality') return v.format !== 'png';
  return true;
}

export function OptionsForm({ toolId, defs, values, onChange, disabled }: Props) {
  return (
    <div className="options">
      {defs.filter((d) => visible(toolId, d, values)).map((def) => {
        const value = values[def.key];
        if (def.kind === 'check') {
          return (
            <label key={def.key} className="opt-check">
              <input
                type="checkbox"
                checked={Boolean(value)}
                disabled={disabled}
                onChange={(e) => onChange(def.key, e.target.checked)}
              />
              <span>
                {def.label}
                {def.hint && <em>{def.hint}</em>}
              </span>
            </label>
          );
        }
        return (
          <div className="opt" key={def.key}>
            <label htmlFor={`opt-${def.key}`}>{def.label}</label>
            {def.kind === 'select' && (
              <select
                id={`opt-${def.key}`}
                value={String(value ?? def.def)}
                disabled={disabled}
                onChange={(e) => onChange(def.key, e.target.value)}
              >
                {def.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}
            {def.kind === 'number' && (
              <div className="num-wrap">
                <input
                  id={`opt-${def.key}`}
                  type="number"
                  value={Number(value ?? def.def)}
                  min={def.min}
                  max={def.max}
                  step={def.step ?? 1}
                  disabled={disabled}
                  onChange={(e) => onChange(def.key, e.target.value === '' ? 0 : Number(e.target.value))}
                />
                {def.suffix && <span>{def.suffix}</span>}
              </div>
            )}
            {def.kind === 'range' && (
              <div className="range-wrap">
                <input
                  id={`opt-${def.key}`}
                  type="range"
                  min={def.min}
                  max={def.max}
                  step={def.step}
                  value={Number(value ?? def.def)}
                  disabled={disabled}
                  onChange={(e) => onChange(def.key, Number(e.target.value))}
                />
                <span className="range-value">
                  {def.key === 'opacity' ? `${Math.round(Number(value ?? def.def) * 100)}%` : Number(value ?? def.def).toFixed(2)}
                </span>
              </div>
            )}
            {def.kind === 'text' && (
              <input
                id={`opt-${def.key}`}
                type="text"
                value={String(value ?? '')}
                placeholder={def.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(def.key, e.target.value)}
              />
            )}
            {def.kind === 'pages' && (
              <input
                id={`opt-${def.key}`}
                type="text"
                value={String(value ?? 'all')}
                placeholder="all · 1-3, 5"
                disabled={disabled}
                onChange={(e) => onChange(def.key, e.target.value)}
              />
            )}
            {def.kind === 'password' && (
              <input
                id={`opt-${def.key}`}
                type="password"
                autoComplete="new-password"
                value={String(value ?? '')}
                placeholder={def.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(def.key, e.target.value)}
              />
            )}
            {def.kind === 'textarea' && (
              <textarea
                id={`opt-${def.key}`}
                rows={def.rows ?? 5}
                value={String(value ?? '')}
                placeholder={def.placeholder}
                disabled={disabled}
                onChange={(e) => onChange(def.key, e.target.value)}
              />
            )}
            {def.kind === 'color' && (
              <div className="color-wrap">
                <input
                  id={`opt-${def.key}`}
                  type="color"
                  value={String(value ?? '#000000')}
                  disabled={disabled}
                  onChange={(e) => onChange(def.key, e.target.value)}
                />
                <code>{String(value ?? '#000000')}</code>
              </div>
            )}
            {def.kind === 'file' && (
              <label className={`file-drop ${value instanceof File ? 'has-file' : ''}`}>
                <input
                  type="file"
                  accept={def.accept}
                  disabled={disabled}
                  onChange={(e) => onChange(def.key, e.target.files?.[0] || '')}
                />
                <Icon name="image" size={16} />
                <span>{value instanceof File ? value.name : 'Choose image'}</span>
              </label>
            )}
            {def.kind === 'multi' && (
              <div className="chips">
                {def.options.map((o) => {
                  const arr = Array.isArray(value) ? (value as string[]) : [];
                  const on = arr.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`chip ${on ? 'on' : ''}`}
                      disabled={disabled}
                      onClick={() => {
                        const next = on ? arr.filter((x) => x !== o.value) : [...arr, o.value];
                        onChange(def.key, next.length ? next : [o.value]);
                      }}
                    >
                      {on && <Icon name="check" size={12} />}
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}
            {def.hint && <p className="opt-hint">{def.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}
