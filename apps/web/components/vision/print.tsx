import type { ReactNode } from 'react'

/** Print stylesheet: hides the app shell and flattens the page so window.print() yields a clean PDF. */
export function PrintStyles() {
  return (
    <style>{`
@media print {
  @page { margin: 14mm; }
  html, body { height: auto !important; background: #fff !important; }
  [data-shell] { display: block !important; height: auto !important; background: #fff !important; }
  [data-shell] > :not(main) { display: none !important; }
  [data-shell] main { display: block !important; margin: 0 !important; overflow: visible !important; border-radius: 0 !important; box-shadow: none !important; background: #fff !important; }
  [data-shell] main > * { overflow: visible !important; }
  [data-print-hide] { display: none !important; }
  [data-print-body] { overflow: visible !important; padding: 0 !important; }
  :root, [data-theme] {
    --m-surface: #fff; --m-raised: #fff; --m-canvas: #f3f4f6; --m-ink: #15181d; --m-body: #4b5260;
    --m-line: #d9dce2; --m-line-faint: #e8eaee; --m-faint: #7c838e; --m-icon: #4b5260; --m-nav-active: #eceef1;
    --m-agent: #15181d; --m-agent-text: #fff; --m-success: #18a058; --m-danger: #e5484d;
    color-scheme: light;
  }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`}</style>
  )
}

/** Shown only when printing: org wordmark, document title and version. */
export function PrintHeader({ wordmark, title, meta }: { wordmark: string; title: string; meta: ReactNode }) {
  return (
    <div className="mb-5 hidden items-end justify-between border-b border-line pb-3 print:flex">
      <div>
        <div className="text-xl font-semibold tracking-tight text-ink">{wordmark}</div>
        <div className="text-base text-body">{title}</div>
      </div>
      <div className="text-sm text-body">{meta}</div>
    </div>
  )
}
