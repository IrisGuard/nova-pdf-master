import { useEffect, useState } from 'react';
import type { OptionValue } from '../../lib/types';
import type { EditorProps } from './PageEditors';
import { listFormFields, type FormFieldInfo } from '../../lib/pdf/ops/forms';
import { inspectDocument, type DocumentInfo } from '../../lib/pdf/ops/analyze';
import { formatBytes } from '../../lib/util';
import { Icon } from '../components/Icon';

export function FormsEditor({ file, options, setOption }: EditorProps) {
  const [fields, setFields] = useState<FormFieldInfo[] | null>(null);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, string>>((options.values as unknown as Record<string, string>) || {});
  const [flatten, setFlatten] = useState(Boolean(options.flatten));

  useEffect(() => {
    let alive = true;
    setFields(null);
    setError('');
    listFormFields({ name: file.name, bytes: file.bytes, password: file.password })
      .then((f) => {
        if (!alive) return;
        setFields(f);
        const initial: Record<string, string> = {};
        for (const x of f) initial[x.name] = x.value;
        setValues(initial);
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [file.id]);

  useEffect(() => {
    setOption('values', values as unknown as OptionValue);
  }, [values]);
  useEffect(() => {
    setOption('flatten', flatten);
  }, [flatten]);

  if (error) return <div className="editor-simple"><p className="error-text">{error}</p></div>;
  if (!fields) return <div className="editor-simple"><p className="muted">Reading form fields…</p></div>;
  if (!fields.length) {
    return (
      <div className="editor-simple">
        <div className="empty-state">
          <Icon name="form" size={30} />
          <h3>No interactive fields</h3>
          <p>This PDF has no AcroForm fields. To add visible text, use <b>Annotate</b> instead.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-simple forms-editor">
      <div className="editor-head">
        <div>
          <h3>{fields.length} form field{fields.length === 1 ? '' : 's'}</h3>
          <p>Fill the fields below. Values are written straight into the PDF form.</p>
        </div>
        <label className="opt-check inline">
          <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
          <span>Flatten after filling</span>
        </label>
      </div>
      <div className="form-grid">
        {fields.map((f) => (
          <div className="field-row" key={f.name}>
            <label htmlFor={`form-${f.name}`}>
              {f.name}
              <span className="field-type">{f.type}{f.required ? ' · required' : ''}</span>
            </label>
            {f.type === 'checkbox' ? (
              <label className="opt-check">
                <input
                  type="checkbox"
                  checked={values[f.name] === 'true'}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked ? 'true' : 'false' }))}
                />
                <span>{values[f.name] === 'true' ? 'Checked' : 'Unchecked'}</span>
              </label>
            ) : f.type === 'dropdown' || f.type === 'radio' || f.type === 'list' ? (
              <select
                id={`form-${f.name}`}
                value={values[f.name] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              >
                <option value="">— choose —</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : f.type === 'signature' ? (
              <span className="muted">Signature fields are left untouched.</span>
            ) : (
              <input
                id={`form-${f.name}`}
                value={values[f.name] || ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                placeholder={f.readOnly ? 'Read-only field' : 'Type a value'}
                readOnly={f.readOnly}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetadataEditor({ file, options, setOption }: EditorProps) {
  const [info, setInfo] = useState<DocumentInfo | null>(null);
  const [fields, setFields] = useState<Record<string, string>>((options.fields as unknown as Record<string, string>) || {});
  const [removeAll, setRemoveAll] = useState(false);

  useEffect(() => {
    inspectDocument({ name: file.name, bytes: file.bytes, password: file.password }).then((i) => {
      setInfo(i);
      setFields({ title: i.title, author: i.author, subject: i.subject, keywords: i.keywords, creator: i.creator, producer: i.producer });
    });
  }, [file.id]);

  useEffect(() => {
    setOption('fields', fields as unknown as OptionValue);
  }, [fields]);
  useEffect(() => {
    setOption('removeAll', removeAll);
  }, [removeAll]);

  if (!info) return <div className="editor-simple"><p className="muted">Reading metadata…</p></div>;

  return (
    <div className="editor-simple">
      <div className="editor-head">
        <div>
          <h3>Document metadata</h3>
          <p>This is the information readers and search engines see.</p>
        </div>
        <label className="opt-check inline">
          <input type="checkbox" checked={removeAll} onChange={(e) => setRemoveAll(e.target.checked)} />
          <span>Remove all metadata</span>
        </label>
      </div>
      <div className="meta-grid">
        {[
          ['title', 'Title'],
          ['author', 'Author'],
          ['subject', 'Subject'],
          ['keywords', 'Keywords (comma separated)'],
          ['creator', 'Creator'],
          ['producer', 'Producer'],
        ].map(([key, label]) => (
          <div className="field-row" key={key}>
            <label htmlFor={`meta-${key}`}>{label}</label>
            <input
              id={`meta-${key}`}
              value={fields[key] || ''}
              disabled={removeAll}
              onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="meta-foot">
        <span className="pill">{info.pages} pages</span>
        <span className="pill">{formatBytes(info.size)}</span>
        <span className="pill">{info.pdfVersion}</span>
        <span className="pill">{info.fonts.length} fonts</span>
      </div>
    </div>
  );
}

export function InfoEditor({ file }: EditorProps) {
  const [info, setInfo] = useState<DocumentInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setInfo(null);
    setError('');
    inspectDocument({ name: file.name, bytes: file.bytes, password: file.password })
      .then(setInfo)
      .catch((e) => setError((e as Error).message));
  }, [file.id]);

  if (error) return <div className="editor-simple"><p className="error-text">{error}</p></div>;
  if (!info) return <div className="editor-simple"><p className="muted">Inspecting document…</p></div>;

  return (
    <div className="editor-simple info-editor">
      <div className="info-hero">
        <div className="info-icon"><Icon name="file" size={26} /></div>
        <div>
          <h3>{info.title || file.name}</h3>
          <p>{info.pages} pages · {formatBytes(info.size)} · {info.pdfVersion}</p>
        </div>
      </div>
      <div className="info-grid">
        <div><span>Pages</span><b>{info.pages}</b></div>
        <div><span>File size</span><b>{formatBytes(info.size)}</b></div>
        <div><span>Page size</span><b>{[...new Set(info.pageSizes.map((p) => p.label))].join(', ')}</b></div>
        <div><span>Rotation</span><b>{[...new Set(info.pageSizes.map((p) => p.rotation))].map((r) => `${r}°`).join(', ')}</b></div>
        <div><span>Author</span><b>{info.author || '—'}</b></div>
        <div><span>Subject</span><b>{info.subject || '—'}</b></div>
        <div><span>Creator</span><b>{info.creator || '—'}</b></div>
        <div><span>Producer</span><b>{info.producer || '—'}</b></div>
        <div><span>Forms</span><b>{info.hasForms ? 'Yes' : 'No'}</b></div>
        <div><span>Attachments</span><b>{info.hasAttachments ? 'Yes' : 'No'}</b></div>
        <div><span>JavaScript</span><b className={info.hasJavaScript ? 'warn-text' : ''}>{info.hasJavaScript ? 'Present' : 'None'}</b></div>
        <div><span>Encryption</span><b>{info.encrypted ? 'Password protected' : 'None'}</b></div>
      </div>
      <div className="info-section">
        <h4>Fonts ({info.fonts.length})</h4>
        <div className="font-chips">
          {info.fonts.length ? info.fonts.map((f) => <span key={f} className="font-chip">{f}</span>) : <span className="muted">No embedded font names found.</span>}
        </div>
      </div>
      <div className="info-section">
        <h4>Page sizes</h4>
        <div className="size-list">
          {info.pageSizes.slice(0, 40).map((p) => (
            <div key={p.page}><span>Page {p.page}</span><span>{p.width} × {p.height} pt</span><span>{p.label}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}
