/* Tiny inline SVG charts — no dependencies. */
'use strict';
const Charts = {
  // series: [{name, color, points:[{x:number, y:number}], dash?, dots?}], opts: {h, yMin, yMax, xLabel(x), yFmt, refLine:{y,color,label}}
  line(series, opts = {}) {
    const W = 340, H = opts.h || 160, L = 34, R = 8, T = 10, B = 22;
    const all = series.flatMap(s => s.points);
    if (!all.length) return `<div class="empty">No data yet</div>`;
    let x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
    let y0 = opts.yMin ?? Math.min(...all.map(p => p.y)), y1 = opts.yMax ?? Math.max(...all.map(p => p.y));
    if (opts.refLine) { y0 = Math.min(y0, opts.refLine.y); y1 = Math.max(y1, opts.refLine.y); }
    if (x0 === x1) { x0 -= 1; x1 += 1; }
    if (y0 === y1) { y0 -= 1; y1 += 1; }
    const pad = (y1 - y0) * 0.08; if (opts.yMin == null) y0 -= pad; if (opts.yMax == null) y1 += pad;
    const X = x => L + (x - x0) / (x1 - x0) * (W - L - R);
    const Y = y => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
    const fmt = opts.yFmt || (v => Math.round(v * 10) / 10);
    let g = '';
    for (let i = 0; i <= 3; i++) {
      const v = y0 + (y1 - y0) * i / 3, y = Y(v);
      g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 4}" y="${y + 3}" class="ax" text-anchor="end">${fmt(v)}</text>`;
    }
    if (opts.xLabel) {
      g += `<text x="${L}" y="${H - 6}" class="ax">${opts.xLabel(x0)}</text><text x="${W - R}" y="${H - 6}" class="ax" text-anchor="end">${opts.xLabel(x1)}</text>`;
    }
    if (opts.refLine) g += `<line x1="${L}" x2="${W - R}" y1="${Y(opts.refLine.y)}" y2="${Y(opts.refLine.y)}" stroke="${opts.refLine.color || '#888'}" stroke-dasharray="4 4"/>`;
    for (const s of series) {
      if (!s.points.length) continue;
      const pts = [...s.points].sort((a, b) => a.x - b.x);
      g += `<polyline fill="none" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} points="${pts.map(p => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`;
      if (s.dots !== false) g += pts.map(p => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="${s.color}"/>`).join('');
    }
    const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}</svg>${legend}`;
  },
  // bars: [{label, v, color?}], opts: {h, target, targetColor, yFmt}
  bars(bars, opts = {}) {
    const W = 340, H = opts.h || 150, L = 30, R = 6, T = 10, B = 22;
    if (!bars.length) return `<div class="empty">No data yet</div>`;
    const max = Math.max(1, opts.target || 0, ...bars.map(b => b.v)) * 1.1;
    const bw = (W - L - R) / bars.length;
    const Y = v => T + (1 - v / max) * (H - T - B);
    let g = '';
    for (let i = 0; i <= 2; i++) { const v = max * i / 2; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${L - 4}" y="${Y(v) + 3}" class="ax" text-anchor="end">${(opts.yFmt || Math.round)(v)}</text>`; }
    bars.forEach((b, i) => {
      const x = L + i * bw + bw * 0.15, w = bw * 0.7, y = Y(b.v);
      g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${(H - B - y).toFixed(1)}" rx="2" fill="${b.color || 'var(--acc)'}"/>`;
      if (b.label && (bars.length <= 12 || i % Math.ceil(bars.length / 8) === 0)) g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(b.label)}</text>`;
    });
    if (opts.target) g += `<line x1="${L}" x2="${W - R}" y1="${Y(opts.target)}" y2="${Y(opts.target)}" stroke="${opts.targetColor || '#f5c542'}" stroke-dasharray="4 4"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${g}</svg>`;
  },
};
