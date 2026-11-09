"use strict";

// Ren DOM/SVG-rendering uten avhengighet til Power BI-API-et, slik at den kan
// testes i en vanlig nettleser (se test/harness.html).

export interface RowData {
    index: number;
    group: string;
    year: string;
    hours: number | null;
    rate: number | null;
    prevRate: number | null;
    cost: number | null;
    costAtAdj: number | null;
    yearsWithout: number | null;
    startup: number | null;
    adjusted: number | null;
}

export interface ChartColors {
    costAtAdj: string;
    costIncrease: string;
    profit: string;
    adjustment: string;
    gap: string;
    statusOk: string;
    statusBad: string;
    text: string;
}

export interface ChartOptions {
    width: number;
    height: number;
    adjustmentRate: number;     // f.eks. 0.045
    autoAxis: boolean;
    axisMin: number;
    fontSize: number;
    maxRowHeight: number;
    showLegend: boolean;
    showMargin: boolean;
    showHours: boolean;
    showGrid: boolean;
    sortByHours: boolean;
    colors: ChartColors;
    selected: Set<number>;
}

export interface Segments {
    s1: number; s2: number; s3: number; s4: number; s5: number;
    rate: number;
    expectedRate: number;
    margin: number | null;
    delta: number | null;
    deltaPct: number | null;
    lostRevenue: number;
    status: string;
    statusKind: "start" | "ok" | "bad" | "none";
}

export interface ChartCallbacks {
    onSelect(indices: number[], multi: boolean): void;
    onClear(): void;
    onContextMenu(index: number | null, x: number, y: number): void;
    onHover(row: RowData | null, seg: Segments | null, x: number, y: number): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const nf = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });
const fmt = (v: number) => nf.format(Math.round(v));

export function computeSegments(r: RowData, g: number): Segments {
    const R = r.rate ?? 0;
    const C = r.cost ?? 0;
    const K = r.costAtAdj ?? C;
    const P = r.prevRate;
    const n = Math.max(0, Math.round(r.yearsWithout ?? 0));
    const isStart = (r.startup ?? 0) > 0;
    const isAdj = !isStart && (r.adjusted ?? 0) > 0;

    const s1 = Math.max(0, Math.min(K, C));
    const s2 = Math.max(0, C - K);
    // Profitt opp til forrige rate (eller kost hvis den er høyere), resten er årets justering.
    const base = isAdj && P !== null ? Math.min(R, Math.max(P, C)) : R;
    const s3 = Math.max(0, base - C);
    const s4 = isAdj ? Math.max(0, R - Math.max(base, C)) : 0;
    const unadj = !isStart && !isAdj && n >= 1;
    const s5 = unadj ? R * (Math.pow(1 + g, n) - 1) : 0;

    let status = "";
    let statusKind: Segments["statusKind"] = "none";
    if (isStart) { status = "Oppstart"; statusKind = "start"; }
    else if (isAdj) { status = "Justert"; statusKind = "ok"; }
    else if (unadj) { status = `${n} år uten`; statusKind = "bad"; }

    return {
        s1, s2, s3, s4, s5,
        rate: R,
        expectedRate: R + s5,
        margin: R ? (R - C) / R : null,
        delta: isAdj && P !== null ? R - P : null,
        deltaPct: isAdj && P ? (R - P) / P : null,
        lostRevenue: s5 * (r.hours ?? 0),
        status, statusKind
    };
}

interface Group { name: string; hours: number; rows: { row: RowData; seg: Segments }[] }

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
    if (parent) parent.appendChild(e);
    return e;
}

function text(parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number> = {}): SVGTextElement {
    const t = el("text", { x, y, "dominant-baseline": "central", ...attrs }, parent);
    t.textContent = s;
    return t;
}

const textWidth = (s: string, font: number, bold = false) => s.length * font * (bold ? 0.6 : 0.56);

function niceStep(range: number, target: number): number {
    const raw = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
}

// Rektangel som sti, valgfritt med sikksakk-venstrekant (avkuttet akse).
function barPath(xa: number, xb: number, y: number, h: number, zig: boolean): string {
    if (!zig) return `M${xa},${y}H${xb}V${y + h}H${xa}Z`;
    const z = Math.min(4, (xb - xa) / 2);
    const steps = 4;
    let d = `M${xa + z},${y}H${xb}V${y + h}H${xa + z}`;
    for (let i = 1; i <= steps; i++) {
        const yy = y + h - (h * i) / steps;
        d += `L${i % 2 ? xa : xa + z},${yy}`;
    }
    return d + "Z";
}

export function renderChart(container: HTMLElement, rows: RowData[], o: ChartOptions, cb: ChartCallbacks, uid: string): void {
    while (container.firstChild) container.removeChild(container.firstChild);
    container.style.color = o.colors.text;

    if (!rows.length) {
        const msg = document.createElement("div");
        msg.className = "rav-empty";
        msg.textContent = "Legg til Gruppe, År, Timer, Timepris, Kost i dag og Kost ved forrige justering.";
        container.appendChild(msg);
        return;
    }

    const g = o.adjustmentRate;

    // ---- Grupper -----------------------------------------------------------
    const map = new Map<string, Group>();
    for (const row of rows) {
        let grp = map.get(row.group);
        if (!grp) { grp = { name: row.group, hours: 0, rows: [] }; map.set(row.group, grp); }
        grp.hours += row.hours ?? 0;
        grp.rows.push({ row, seg: computeSegments(row, g) });
    }
    const groups = [...map.values()];
    groups.forEach(gr => gr.rows.sort((a, b) => a.row.year.localeCompare(b.row.year, "nb", { numeric: true })));
    if (o.sortByHours) groups.sort((a, b) => b.hours - a.hours);

    // ---- Forklaring (HTML, brytes over flere linjer) -------------------------
    let legendH = 0;
    const fontBase = o.fontSize;
    if (o.showLegend) {
        const lg = document.createElement("div");
        lg.className = "rav-legend";
        lg.style.fontSize = `${fontBase}px`;
        const groupsLg: [string, [string, string, boolean][]][] = [
            ["Kost:", [["ved forrige justering", o.colors.costAtAdj, false], ["økning siden", o.colors.costIncrease, false]]],
            ["Profitt:", [["fra før", o.colors.profit, false], ["årets justering", o.colors.adjustment, false]]],
            ["", [[`Gap til forventet rate (${(g * 100).toLocaleString("nb-NO")} %/år)`, o.colors.gap, true]]]
        ];
        for (const [title, items] of groupsLg) {
          const grpEl = document.createElement("span");
          grpEl.className = "rav-legend-group";
          if (title) {
            const t = document.createElement("span");
            t.className = "rav-legend-title";
            t.textContent = title;
            grpEl.appendChild(t);
          }
          lg.appendChild(grpEl);
          for (const [label, c, hatch] of items) {
            const it = document.createElement("span");
            it.className = "rav-legend-item";
            const sw = document.createElement("span");
            sw.className = "rav-swatch";
            if (hatch) {
                sw.style.background = `repeating-linear-gradient(45deg, ${c}55 0 2px, ${c}22 2px 5px)`;
                sw.style.border = `1px solid ${c}`;
            } else {
                sw.style.background = c;
            }
            it.appendChild(sw);
            const tx = document.createElement("span");
            tx.textContent = label;
            it.appendChild(tx);
            grpEl.appendChild(it);
          }
        }
        container.appendChild(lg);
        legendH = lg.offsetHeight + 4;
    }

    // ---- Geometri ------------------------------------------------------------
    const nRows = rows.length;
    const nGroups = groups.length;
    const headerH = Math.round(fontBase * 1.6);
    const avail = Math.max(50, o.height - legendH - headerH - 4);
    const rowH = Math.max(12, Math.min(o.maxRowHeight, avail / (nRows + nGroups * 1.15)));
    const groupH = rowH * 1.15;
    const font = Math.min(fontBase, rowH * 0.62);
    const barH = Math.max(6, rowH * 0.72);
    const totalH = headerH + nGroups * groupH + nRows * rowH + 4;
    const svgH = Math.max(totalH, 0);
    const width = Math.max(200, o.width - (totalH > o.height - legendH ? 14 : 0));

    const pad = 4;
    const yearX = pad + font * 0.6;
    const yearW = font * 0.6 + textWidth("2026", font) + font * 0.9;
    let maxStatus = 0;
    for (const gr of groups) for (const r of gr.rows) maxStatus = Math.max(maxStatus, textWidth(r.seg.status, font));
    const statusW = maxStatus + font;
    const marginW = o.showMargin ? textWidth("100 %", font, true) + font * 1.2 : 0;
    const deltaW = textWidth("▲ +100 (+10,0 %)", font * 0.92) + font * 0.6;
    const rateLabelW = textWidth("10 000", font, true) + font * 0.8 + deltaW;
    const hoursW = o.showHours ? font * 9 : 0;
    let maxHours = 0;
    for (const gr of groups) for (const r of gr.rows) maxHours = Math.max(maxHours, r.row.hours ?? 0);
    const marginRight = width - pad - hoursW;
    const hoursX = width - pad - hoursW + font * 1.2;
    const hoursBarMax = Math.max(10, hoursW - font * 1.2 - textWidth("10 000", font * 0.92) - font * 0.6);
    const barX0 = pad + yearW + statusW + 4;
    const barX1 = Math.max(barX0 + 40, width - hoursW - marginW - rateLabelW - pad);

    // Akse
    let vMax = 0;
    let vMinData = Infinity;
    for (const gr of groups) for (const { seg } of gr.rows) {
        vMax = Math.max(vMax, seg.expectedRate, seg.s1 + seg.s2);
        if (seg.s1 > 0) vMinData = Math.min(vMinData, seg.s1);
    }
    if (!isFinite(vMinData)) vMinData = 0;
    let vMin = o.autoAxis ? Math.floor((vMinData * 0.9) / 100) * 100 : o.axisMin;
    if (vMin < 0 || vMin >= vMax) vMin = 0;
    if (vMax <= vMin) vMax = vMin + 1;
    const scale = (v: number) => barX0 + ((Math.max(vMin, v) - vMin) / (vMax - vMin)) * (barX1 - barX0);
    const truncated = vMin > 0;

    // ---- SVG -----------------------------------------------------------------
    const svg = el("svg", { width, height: svgH, class: "rav-svg" });
    container.appendChild(svg);
    const defs = el("defs", {}, svg);
    const patId = `rav-hatch-${uid}`;
    const pat = el("pattern", { id: patId, width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
    el("rect", { width: 6, height: 6, fill: o.colors.gap, "fill-opacity": 0.18 }, pat);
    el("line", { x1: 0, y1: 0, x2: 0, y2: 6, stroke: o.colors.gap, "stroke-width": 1.6, "stroke-opacity": 0.75 }, pat);

    svg.addEventListener("click", (e) => { if (e.target === svg) cb.onClear(); });
    svg.addEventListener("contextmenu", (e) => { if (e.target === svg) { e.preventDefault(); cb.onContextMenu(null, e.clientX, e.clientY); } });

    // Kolonneoverskrifter
    const hdrY = headerH / 2;
    const muted = { fill: o.colors.text, "fill-opacity": 0.6, "font-size": font * 0.92 };
    if (o.showMargin) text(svg, marginRight, hdrY, "Margin", { ...muted, "text-anchor": "end" });
    if (o.showHours) text(svg, hoursX, hdrY, "Timer", muted);

    // Rutenett
    if (o.showGrid) {
        const step = niceStep(vMax - vMin, 5);
        const gridG = el("g", { class: "rav-grid" }, svg);
        for (let v = Math.ceil(vMin / step) * step; v <= vMax; v += step) {
            if (v <= vMin) continue;
            const x = scale(v);
            el("line", { x1: x, x2: x, y1: headerH, y2: totalH - 2, stroke: o.colors.text, "stroke-opacity": 0.1 }, gridG);
        }
    }

    const hasSel = o.selected.size > 0;
    let y = headerH;
    groups.forEach((gr, gi) => {
        // Gruppeoverskrift
        const gG = el("g", { class: "rav-group" }, svg);
        if (gi > 0) el("line", { x1: pad, x2: width - pad, y1: y + 1, y2: y + 1, stroke: o.colors.text, "stroke-opacity": 0.15 }, gG);
        const gy = y + groupH / 2 + 1;
        const nameT = text(gG, pad, gy, gr.name, { fill: o.colors.text, "font-weight": 600, "font-size": font * 1.05 });
        text(gG, pad + textWidth(gr.name, font * 1.05, true) + font, gy, `${fmt(gr.hours)} t`, muted);
        nameT.style.cursor = "pointer";
        const idx = gr.rows.map(r => r.row.index);
        nameT.addEventListener("click", (e) => { e.stopPropagation(); cb.onSelect(idx, e.ctrlKey || e.metaKey); });
        y += groupH;

        for (const { row, seg } of gr.rows) {
            const rg = el("g", { class: "rav-row" }, svg);
            const dim = hasSel && !o.selected.has(row.index);
            if (dim) rg.setAttribute("opacity", "0.3");
            // Treffflate for klikk/hover
            el("rect", { x: 0, y, width, height: rowH, fill: "transparent" }, rg);
            const cy = y + rowH / 2;
            text(rg, yearX, cy, row.year, { fill: o.colors.text, "font-size": font });
            if (seg.status) {
                const c = seg.statusKind === "ok" ? o.colors.statusOk : seg.statusKind === "bad" ? o.colors.statusBad : o.colors.text;
                text(rg, pad + yearW, cy, seg.status, {
                    fill: c, "font-size": font,
                    "fill-opacity": seg.statusKind === "start" ? 0.6 : 1,
                    "font-weight": seg.statusKind === "bad" ? 600 : 400
                });
            }

            const by = cy - barH / 2;
            const parts: { v: number; color: string; label: string; labelColor: string; hatch?: boolean }[] = [
                { v: seg.s1, color: o.colors.costAtAdj, label: fmt(seg.s1), labelColor: "#4A3F00" },
                { v: seg.s2, color: o.colors.costIncrease, label: `+${fmt(seg.s2)}`, labelColor: "#3D3400" },
                { v: seg.s3, color: o.colors.profit, label: fmt(seg.s3), labelColor: "#FFFFFF" },
                { v: seg.s4, color: o.colors.adjustment, label: `+${fmt(seg.s4)}`, labelColor: "#FFFFFF" },
                { v: seg.s5, color: o.colors.gap, label: `+${fmt(seg.s5)}`, labelColor: o.colors.gap, hatch: true }
            ];
            let acc = 0;
            let first = true;
            for (const p of parts) {
                if (p.v <= 0) continue;
                const a = acc, b = acc + p.v;
                acc = b;
                if (b <= vMin) continue;
                const xa = scale(a), xb = scale(b);
                if (xb - xa < 0.5) continue;
                const zig = first && truncated && a < vMin;
                first = false;
                el("path", {
                    d: barPath(xa, xb, by, barH, zig),
                    fill: p.hatch ? `url(#${patId})` : p.color,
                    stroke: p.hatch ? p.color : "none",
                    "stroke-width": p.hatch ? 1 : 0
                }, rg);
                const lw = textWidth(p.label, font * 0.92);
                if (xb - xa > lw + 6) {
                    text(rg, (xa + xb) / 2 + (zig ? 2 : 0), cy, p.label, {
                        fill: p.labelColor, "font-size": font * 0.92, "text-anchor": "middle"
                    });
                }
            }
            // Ratetall etter stolpen (faktisk rate, ikke inkl. gap)
            // Stiplet skillelinje mellom profitt fra før og årets justering (= forrige rate)
            if (seg.s3 > 0 && seg.s4 > 0) {
                const sx = scale(seg.s1 + seg.s2 + seg.s3);
                if (sx > barX0) el("line", { x1: sx, x2: sx, y1: by, y2: by + barH, stroke: "#FFFFFF", "stroke-width": 1.5, "stroke-dasharray": "3 2" }, rg);
            }
            const rx = scale(acc) + 5;
            const rateTxt = fmt(seg.rate);
            text(rg, rx, cy, rateTxt, { fill: o.colors.text, "font-weight": 600, "font-size": font });
            if (seg.delta !== null && seg.deltaPct !== null) {
                const pct = (seg.deltaPct * 100).toLocaleString("nb-NO", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
                const sign = seg.delta >= 0 ? "▲ +" : "▼ ";
                text(rg, rx + textWidth(rateTxt, font, true) + font * 0.6, cy, `${sign}${fmt(seg.delta)} (${seg.delta >= 0 ? "+" : ""}${pct} %)`, {
                    fill: o.colors.statusOk, "font-weight": 600, "font-size": font * 0.92
                });
            }
            if (o.showHours) {
                const hw = Math.max(2, ((row.hours ?? 0) / Math.max(1, maxHours)) * hoursBarMax);
                el("rect", { x: hoursX, y: cy - barH * 0.28, width: hw, height: barH * 0.56, rx: 2, fill: o.colors.text, "fill-opacity": 0.3 }, rg);
                text(rg, hoursX + hw + 5, cy, fmt(row.hours ?? 0), { fill: o.colors.text, "fill-opacity": 0.7, "font-size": font * 0.92 });
            }
            if (o.showMargin && seg.margin !== null) {
                text(rg, marginRight, cy, `${Math.round(seg.margin * 100)} %`, {
                    fill: o.colors.text, "font-size": font, "text-anchor": "end"
                });
            }

            rg.style.cursor = "pointer";
            rg.addEventListener("click", (e) => { e.stopPropagation(); cb.onSelect([row.index], e.ctrlKey || e.metaKey); });
            rg.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); cb.onContextMenu(row.index, e.clientX, e.clientY); });
            rg.addEventListener("mousemove", (e) => cb.onHover(row, seg, e.clientX, e.clientY));
            rg.addEventListener("mouseleave", (e) => cb.onHover(null, null, e.clientX, e.clientY));
            y += rowH;
        }
    });
}
