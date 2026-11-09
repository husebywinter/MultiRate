"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import Card = formattingSettings.SimpleCard;
import Model = formattingSettings.Model;

const num = (min: number, max: number) => ({
    minValue: { type: powerbi.visuals.ValidatorType.Min as const, value: min },
    maxValue: { type: powerbi.visuals.ValidatorType.Max as const, value: max }
});

class CalcCard extends Card {
    adjustmentRate = new formattingSettings.NumUpDown({
        name: "adjustmentRate",
        displayName: "Forventet årlig justering (%)",
        value: 4.5,
        options: num(0, 50)
    });
    autoAxis = new formattingSettings.ToggleSwitch({
        name: "autoAxis",
        displayName: "Automatisk akse-start",
        value: true
    });
    axisMin = new formattingSettings.NumUpDown({
        name: "axisMin",
        displayName: "Akse-start (manuell)",
        value: 0,
        options: num(0, 100000)
    });
    name = "calc";
    displayName = "Beregning";
    slices = [this.adjustmentRate, this.autoAxis, this.axisMin];
}

const color = (name: string, displayName: string, value: string) =>
    new formattingSettings.ColorPicker({ name, displayName, value: { value } });

class ColorsCard extends Card {
    costAtAdj = color("costAtAdj", "Kost ved forrige justering", "#B4B2A9");
    costIncrease = color("costIncrease", "Kostøkning siden da", "#EF9F27");
    profit = color("profit", "Profitt", "#639922");
    adjustment = color("adjustment", "Justering dette året", "#27500A");
    gap = color("gap", "Gap til forventet rate", "#E24B4A");
    statusOk = color("statusOk", "Status: justert", "#1D9E75");
    statusBad = color("statusBad", "Status: ujustert", "#E24B4A");
    text = color("text", "Tekst", "#252423");
    name = "colors";
    displayName = "Farger";
    slices = [this.costAtAdj, this.costIncrease, this.profit, this.adjustment, this.gap,
        this.statusOk, this.statusBad, this.text];
}

class LayoutCard extends Card {
    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize", displayName: "Skriftstørrelse", value: 11, options: num(7, 24)
    });
    maxRowHeight = new formattingSettings.NumUpDown({
        name: "maxRowHeight", displayName: "Maks radhøyde (px)", value: 30, options: num(12, 80)
    });
    showLegend = new formattingSettings.ToggleSwitch({ name: "showLegend", displayName: "Vis forklaring", value: true });
    showMargin = new formattingSettings.ToggleSwitch({ name: "showMargin", displayName: "Vis margin-kolonne", value: true });
    showHours = new formattingSettings.ToggleSwitch({ name: "showHours", displayName: "Vis timer-kolonne", value: true });
    showGrid = new formattingSettings.ToggleSwitch({ name: "showGrid", displayName: "Vis rutenett", value: true });
    sortByHours = new formattingSettings.ToggleSwitch({ name: "sortByHours", displayName: "Sorter grupper etter timer", value: true });
    name = "layout";
    displayName = "Oppsett";
    slices = [this.fontSize, this.maxRowHeight, this.showLegend, this.showMargin, this.showHours, this.showGrid, this.sortByHours];
}

export class VisualFormattingSettingsModel extends Model {
    calc = new CalcCard();
    colors = new ColorsCard();
    layout = new LayoutCard();
    cards = [this.calc, this.colors, this.layout];
}
