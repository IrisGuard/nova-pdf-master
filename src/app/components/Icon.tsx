import type { SVGProps } from 'react';

const paths: Record<string, string> = {
  merge: 'M8 3v6a4 4 0 0 0 4 4h8M8 21v-6a4 4 0 0 1 4-4h8M17 3l3 3-3 3M17 15l3 3-3 3',
  split: 'M12 3v6M12 15v6M6 3v4a3 3 0 0 0 3 3h6M6 21v-4a3 3 0 0 1 3-3h6M3 12h3M18 12h3',
  organize: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  rotate: 'M21 12a9 9 0 1 1-3-6.7M21 3v6h-6',
  extract: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M14 3v8h8M14 3l8 8M9 14h6M9 18h4',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  resize: 'M4 4h10v10H4zM14 14h6v6h-6zM14 9h3a3 3 0 0 1 3 3v2M9 15v2a3 3 0 0 0 3 3h2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7zM11 7h2M7 11v2M17 11v2M11 17h2',
  booklet: 'M3 5a2 2 0 0 1 2-2h6v18H5a2 2 0 0 1-2-2zM21 5a2 2 0 0 0-2-2h-6v18h6a2 2 0 0 0 2-2zM11 7h2M11 11h2M11 15h2',
  watermark: 'M4 4h16v16H4zM8 15l3-4 2 2 3-5 2 7',
  numbers: 'M5 9h14M5 15h14M9 4l-1 16M16 4l-1 16',
  header: 'M4 4h16v16H4zM4 9h16M8 13h8M8 17h5',
  bates: 'M4 5h16v14H4zM8 9h8M8 13h5M15 16h2',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  annotate: 'M4 4h10v16H4zM18 8h2v12h-2M14 12h4M14 16h4',
  form: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h4',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  clean: 'M3 21h18M6 21V9l6-6 6 6v12M9 21v-6h6v6',
  image: 'M3 4h18v16H3zM8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 20',
  images: 'M7 3h12a2 2 0 0 1 2 2v12M3 7h12a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2zM7 16l3-3 2 2 3-4 2 3',
  text: 'M4 4h16M4 9h16M4 14h10M4 19h7',
  html: 'M4 4l2 16h12l2-16zM8 8h8M9 12h6M9 16h6',
  markdown: 'M3 5h18v14H3zM6 15V9l2 2 2-2v6M15 9v6M13 13l2 2 2-2',
  json: 'M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1',
  type: 'M4 7V4h16v3M9 20h6M12 4v16',
  archive: 'M3 4h18v6H3zM5 10h14v10H5zM10 14h4',
  compress: 'M4 9h16M4 15h16M7 4l-3 5 3 5M17 20l3-5-3-5',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3M4 12h16',
  lock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 8 0v3M12 15v2',
  unlock: 'M5 11h14v10H5zM8 11V8a4 4 0 0 1 7.5-2M12 15v2',
  redact: 'M4 4h16v16H4zM8 8h8M8 12h4M7 20L20 7',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-5M12 8h.01',
  compare: 'M12 3v18M7 7 3 12l4 5M17 7l4 5-4 5M4 12h5M15 12h5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  download: 'M12 3v12M7 11l5 5 5-5M4 21h16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  copy: 'M9 9h10v12H9zM5 15V3h10',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  check: 'M4 12l5 5L20 6',
  warn: 'M12 3l9 17H3zM12 9v5M12 17h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  panel: 'M3 4h18v16H3zM9 4v16',
  spark: 'M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6',
  zoomIn: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M11 8v6M8 11h6',
  zoomOut: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3M8 11h6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  command: 'M9 3a3 3 0 1 1-3 3v12a3 3 0 1 1 3-3h6a3 3 0 1 1 3 3V6a3 3 0 1 1-3 3z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 18l9 5 9-5',
  grid2: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
};

export function Icon({ name, size = 18, ...props }: { name: keyof typeof paths | string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.65}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.file} />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <span className="logo-mark">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <path d="M8 3h11l6 6v20H8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M19 3v6h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 17l3 6 2-4 2 2 3-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span className="logo-type">
          NOVA <b>PDF</b>
        </span>
      )}
    </div>
  );
}
