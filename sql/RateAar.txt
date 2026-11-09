// RateAar – én rad per prosjekt × ansatt × år
// Alle vindusfunksjoner kjører på år-nivå (liten tabell), ikke på enkeltføringer.
let
    Kilde = Databricks.Catalogs(Servername, Database, [Catalog=null, Database=null, EnableQueryResultDownload = "0"]),
    maconomy_dev_Database = Kilde{[Name="maconomy_dev",Kind="Database"]}[Data],

    Sql = "
        WITH per_year AS (
            SELECT
                ProjectNumber,
                Year,
                EmployeeNumber,
                MIN(EntryDate)                      AS FirstEntryDate,
                MAX(EntryDate)                      AS LastEntryDate,
                SUM(Hours)                          AS Hours,
                MIN_BY(HourlyRate,    EntryDate)    AS FirstHourlyRate,
                MAX_BY(HourlyRate,    EntryDate)    AS LastHourlyRate,
                MIN_BY(FirstCostUnit, EntryDate)    AS FirstUnitCost,
                MAX_BY(LastCostUnit,  EntryDate)    AS LastUnitCost
            FROM maconomy_dev.gold.portfoliomanagement_fact_employee_hourly_rate
            GROUP BY
                ProjectNumber,
                Year,
                EmployeeNumber
        ),
        with_prev AS (
            SELECT
                *,
                LAG(LastHourlyRate) OVER (PARTITION BY ProjectNumber, EmployeeNumber ORDER BY Year)
                    AS PrevYearLastHourlyRate
            FROM per_year
        ),
        flags AS (
            SELECT
                *,
                CASE WHEN PrevYearLastHourlyRate IS NULL THEN 1 ELSE 0 END      AS Oppstart,
                CASE
                    WHEN LastHourlyRate <> FirstHourlyRate
                      OR COALESCE(FirstHourlyRate <> PrevYearLastHourlyRate, FALSE)
                    THEN 1 ELSE 0
                END                                                              AS RateAdjusted
            FROM with_prev
        ),
        fwd AS (
            SELECT
                *,
                LAST_VALUE(CASE WHEN Oppstart = 1 OR RateAdjusted = 1 THEN Year END, true)
                    OVER (PARTITION BY ProjectNumber, EmployeeNumber ORDER BY Year
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)     AS SisteJusteringsAar,
                LAST_VALUE(CASE WHEN Oppstart = 1 OR RateAdjusted = 1 THEN LastUnitCost END, true)
                    OVER (PARTITION BY ProjectNumber, EmployeeNumber ORDER BY Year
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)     AS KostVedJustering
            FROM flags
        )
        SELECT
            ProjectNumber,
            EmployeeNumber,
            Year,
            Hours,
            LastHourlyRate,
            PrevYearLastHourlyRate,
            LastUnitCost,
            KostVedJustering,
            -- Kost ved forrige justering: i justerte år hentes kosten fra justeringen før,
            -- slik at kostøkningen som utløste justeringen synes.
            CASE WHEN RateAdjusted = 1
                 THEN LAG(KostVedJustering) OVER (PARTITION BY ProjectNumber, EmployeeNumber ORDER BY Year)
                 ELSE KostVedJustering
            END                                                                  AS KostForrigeJustering,
            SisteJusteringsAar,
            Year - SisteJusteringsAar                                            AS AarUtenJustering,
            Oppstart,
            RateAdjusted,
            CASE WHEN Oppstart = 0 AND RateAdjusted = 0 THEN 1 ELSE 0 END        AS Ujustert
        FROM fwd
    ",

    Resultat = Value.NativeQuery(maconomy_dev_Database, Sql, null, [EnableFolding = true]),
    #"Endret type" = Table.TransformColumnTypes(Resultat, {
        {"Hours",                  type number},
        {"LastHourlyRate",         type number},
        {"PrevYearLastHourlyRate", type number},
        {"LastUnitCost",           type number},
        {"KostVedJustering",       type number},
        {"KostForrigeJustering",   type number},
        {"Year",                   Int64.Type},
        {"SisteJusteringsAar",     Int64.Type},
        {"AarUtenJustering",       Int64.Type},
        {"Oppstart",               Int64.Type},
        {"RateAdjusted",           Int64.Type},
        {"Ujustert",               Int64.Type}
    }, "en-US"),
    // Testfiltre – fjernes senere
    #"Filtered Rows" = Table.SelectRows(#"Endret type", each Text.Contains([EmployeeNumber], "106934")),
    #"Filtered Rows1" = Table.SelectRows(#"Filtered Rows", each ([ProjectNumber] = "10209127-05"))
in
    #"Filtered Rows1"
