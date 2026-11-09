# MultiRate – Ratejustering (Power BI custom visual)

Viser timerate per prosjekt og år som en stablet stolpe:

| Segment | Betydning |
|---|---|
| Lys gul | Kost ved forrige justering (i justerte år: kosten ved justeringen før) |
| Mørk gul | Kostøkning siden da |
| Grønn | Profitt fra før |
| Mørkere grønn | Profitt fra årets justering, adskilt med stiplet linje (= forrige rate) |
| Rødt skravert | Gap til forventet rate (kun ujusterte år): rate × ((1 + sats)^år uten − 1) |

Til høyre: faktisk rate, endring fra i fjor, margin og timer (med liten volumstolpe). Status per år: *Oppstart*, *Justert* eller *N år uten*.

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
| Kost ved forrige justering | KostForrigeJustering | **Gjennomsnitt** |
| År uten justering | AarUtenJustering | **Maksimum** |
| Oppstart (1/0) | Oppstart | **Maksimum** |
| Justert (1/0) | RateAdjusted | **Maksimum** |

Visualen er laget for én ansatt om gangen (filtrer på ansatt). Med flere ansatte per prosjekt blir ratene et uvektet snitt.

## Formatering

- **Beregning:** forventet årlig justering (standard 4,5 %), automatisk/manuell akse-start
- **Farger:** alle segmenter, statusfarger og tekst
- **Oppsett:** skriftstørrelse, maks radhøyde, forklaring, margin-kolonne, timer-kolonne, rutenett, sortering

Klikk på en rad eller et gruppenavn for å kryssfiltrere; Ctrl+klikk for flervalg.

## Bygg

```bash
npm install
npx pbiviz package
```

`test/harness.html` viser visualen med eksempeldata i en vanlig nettleser (kompiler `src/chart.ts` til `test/chart.js` først).
