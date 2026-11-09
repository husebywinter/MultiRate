"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;

import { VisualFormattingSettingsModel } from "./settings";
import { renderChart, RowData, Segments } from "./chart";

const nf = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

function toNum(v: PrimitiveValue | undefined): number | null {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    const n = Number(v);
    return isFinite(n) ? n : null;
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private rows: RowData[] = [];
    private ids: ISelectionId[] = [];
    private selected = new Set<number>();
    private lastOptions: VisualUpdateOptions | undefined;
    private uid = Array.from(window.crypto.getRandomValues(new Uint32Array(1)))[0].toString(36);

    constructor(options: VisualConstructorOptions) {
        this.target = options.element;
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.formattingSettingsService = new FormattingSettingsService();
        this.target.classList.add("rav-root");
        this.selectionManager.registerOnSelectCallback(() => this.syncSelection());
    }

    public update(options: VisualUpdateOptions): void {
        this.lastOptions = options;
        const dv: DataView | undefined = options.dataViews && options.dataViews[0];
        this.formattingSettings = dv
            ? this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dv)
            : new VisualFormattingSettingsModel();
        this.parse(dv);
        this.syncSelection(false);
        this.render();
    }

    private parse(dv: DataView | undefined): void {
        this.rows = [];
        this.ids = [];
        const cat = dv?.categorical;
        if (!cat?.categories?.length) return;
        const groupCat = cat.categories.find(c => c.source.roles?.["group"]);
        const yearCat = cat.categories.find(c => c.source.roles?.["year"]);
        const n = (groupCat ?? yearCat)?.values.length ?? 0;
        const val = (role: string) => cat.values?.find(v => v.source.roles?.[role])?.values;
        const hours = val("hours"), rate = val("rate"), prev = val("prevRate"), cost = val("cost"),
            kAdj = val("costAtAdj"), yw = val("yearsWithout"), st = val("startup"), adj = val("adjusted");
        if (!rate) return;

        for (let i = 0; i < n; i++) {
            if (toNum(rate[i]) === null) continue;
            this.rows.push({
                index: i,
                group: groupCat ? String(groupCat.values[i] ?? "(tom)") : "Alle",
                year: yearCat ? String(yearCat.values[i] ?? "") : "",
                hours: toNum(hours?.[i]),
                rate: toNum(rate[i]),
                prevRate: toNum(prev?.[i]),
                cost: toNum(cost?.[i]),
                costAtAdj: toNum(kAdj?.[i]),
                yearsWithout: toNum(yw?.[i]),
                startup: toNum(st?.[i]),
                adjusted: toNum(adj?.[i])
            });
            let b = this.host.createSelectionIdBuilder();
            if (groupCat) b = b.withCategory(groupCat, i);
            if (yearCat) b = b.withCategory(yearCat, i);
            this.ids[i] = b.createSelectionId();
        }
    }

    private syncSelection(rerender = true): void {
        const sel = this.selectionManager.getSelectionIds() as ISelectionId[];
        this.selected.clear();
        if (sel.length) {
            this.ids.forEach((id, i) => { if (id && sel.some(s => s.equals(id))) this.selected.add(i); });
        }
        if (rerender) this.render();
    }

    private render(): void {
        const opts = this.lastOptions;
        if (!opts) return;
        const s = this.formattingSettings;
        const w = opts.viewport.width, h = opts.viewport.height;
        this.target.style.width = `${w}px`;
        this.target.style.height = `${h}px`;
        this.target.style.overflowY = "auto";
        this.target.style.overflowX = "hidden";

        renderChart(this.target, this.rows, {
            width: w,
            height: h,
            adjustmentRate: (s.calc.adjustmentRate.value ?? 4.5) / 100,
            autoAxis: s.calc.autoAxis.value,
            axisMin: s.calc.axisMin.value ?? 0,
            fontSize: s.layout.fontSize.value ?? 11,
            maxRowHeight: s.layout.maxRowHeight.value ?? 30,
            showLegend: s.layout.showLegend.value,
            showMargin: s.layout.showMargin.value,
            showHours: s.layout.showHours.value,
            showGrid: s.layout.showGrid.value,
            sortByHours: s.layout.sortByHours.value,
            colors: {
                costAtAdj: s.colors.costAtAdj.value.value,
                costIncrease: s.colors.costIncrease.value.value,
                profit: s.colors.profit.value.value,
                adjustment: s.colors.adjustment.value.value,
                gap: s.colors.gap.value.value,
                statusOk: s.colors.statusOk.value.value,
                statusBad: s.colors.statusBad.value.value,
                text: s.colors.text.value.value
            },
            selected: this.selected
        }, {
            onSelect: (indices, multi) => this.select(indices, multi),
            onClear: () => { this.selectionManager.clear().then(() => this.syncSelection()); },
            onContextMenu: (index, x, y) => {
                const id = index !== null ? this.ids[index] : undefined;
                this.selectionManager.showContextMenu(id ?? {}, { x, y });
            },
            onHover: (row, seg, x, y) => this.tooltip(row, seg, x, y)
        }, this.uid);
    }

    private select(indices: number[], multi: boolean): void {
        const ids = indices.map(i => this.ids[i]).filter(Boolean);
        const alreadyOnly = !multi && indices.length === this.selected.size && indices.every(i => this.selected.has(i));
        if (alreadyOnly) {
            this.selectionManager.clear().then(() => this.syncSelection());
            return;
        }
        this.selectionManager.select(ids, multi).then(() => this.syncSelection());
    }

    private tooltip(row: RowData | null, seg: Segments | null, x: number, y: number): void {
        const ts = this.host.tooltipService;
        if (!ts?.enabled()) return;
        if (!row || !seg) {
            ts.hide({ immediately: true, isTouchEvent: false });
            return;
        }
        const f = (v: number | null) => (v === null ? "–" : nf.format(Math.round(v)));
        const items: powerbi.extensibility.VisualTooltipDataItem[] = [
            { displayName: "Gruppe", value: row.group },
            { displayName: "År", value: row.year },
            { displayName: "Status", value: seg.status || "–" },
            { displayName: "Timer", value: f(row.hours) },
            { displayName: "Timepris", value: f(seg.rate) },
            { displayName: "Forrige års rate", value: f(row.prevRate) },
            { displayName: "Kost i dag", value: f(row.cost) },
            { displayName: "Kost ved forrige justering", value: f(row.costAtAdj) },
            { displayName: "Endring fra i fjor", value: seg.delta === null ? "–" : `${f(seg.delta)} kr (${((seg.deltaPct ?? 0) * 100).toFixed(1)} %)` },
            { displayName: "Margin", value: seg.margin === null ? "–" : `${(seg.margin * 100).toFixed(1)} %` }
        ];
        if (seg.s5 > 0) {
            items.push(
                { displayName: "Forventet rate", value: f(seg.expectedRate) },
                { displayName: "Gap kr/t", value: f(seg.s5) },
                { displayName: "Tapt inntekt", value: `${f(seg.lostRevenue)} kr` }
            );
        }
        const rect = this.target.getBoundingClientRect();
        ts.show({
            coordinates: [x - rect.left, y - rect.top],
            isTouchEvent: false,
            dataItems: items,
            identities: this.ids[row.index] ? [this.ids[row.index]] : []
        });
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
