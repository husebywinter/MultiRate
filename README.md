# MultiRate – Ratejustering (Power BI custom visual)

Viser timerate per prosjekt og år som en stablet stolpe:

| Segment | Betydning |
|---|---|
| Grå | Kost ved siste justering |
| Oransje | Kostøkning siden siste justering |
| Blå | Profitt |
| Grønn | Justering dette året |
| Rødt skravert | Gap til forventet rate (kun ujusterte år): rate × ((1 + sats)^år uten − 1) |

Til høyre: faktisk rate og margin. Status per år: *Oppstart*, *Justert* eller *N år uten*.

## Installer

Importer `dist/rateAdjustmentVisual*.pbiviz` i Power BI (Visualiseringer → … → Importer et visualobjekt fra en fil).

## Data

Spørringen i [`sql/RateAar.pq`](sql/RateAar.pq) gir én rad per prosjekt × ansatt × år.

| Felt i visualen | Kolonne | Aggregering |
|---|---|---|
| Gruppe (prosjekt) | ProjectNumber (eller prosjektnavn) | – |
| År | Year | – |
| Timer | Hours | Sum |
| Timepris (siste rate) | LastHourlyRate | **Gjennomsnitt** |
| Forrige års rate | PrevYearLastHourlyRate | **Gjennomsnitt** |
| Kost i dag | LastUnitCost | **Gjennomsnitt** |
| Kost ved siste justering | KostVedJustering | **Gjennomsnitt** |
| År uten justering | AarUtenJustering | **Maksimum** |
| Oppstart (1/0) | Oppstart | **Maksimum** |
| Justert (1/0) | RateAdjusted | **Maksimum** |

Visualen er laget for én ansatt om gangen (filtrer på ansatt). Med flere ansatte per prosjekt blir ratene et uvektet snitt.

## Formatering

- **Beregning:** forventet årlig justering (standard 4,5 %), automatisk/manuell akse-start
- **Farger:** alle segmenter, statusfarger og tekst
- **Oppsett:** skriftstørrelse, maks radhøyde, forklaring, margin-kolonne, rutenett, sortering

Klikk på en rad eller et gruppenavn for å kryssfiltrere; Ctrl+klikk for flervalg.

## Bygg

```bash
npm install
npx pbiviz package
```

`test/harness.html` viser visualen med eksempeldata i en vanlig nettleser (kompiler `src/chart.ts` til `test/chart.js` først).
