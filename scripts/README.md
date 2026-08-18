# Scripts de datos

## Resultados electorales por sección

Alimenta el comparativo que aparece en el detalle de sección del mapa.

### Fuentes

Ambas oficiales, públicas y **agregadas por sección**. No contienen datos de personas.

| Proceso | Fuente | Formato |
|---|---|---|
| Ayuntamiento 2024 | IEEZ · Cómputos Proceso Electoral 2023-2024 | XLSX por casilla |
| Ayuntamiento 2021 | IEEZ · Cómputo Proceso Electoral Local 2020-2021 | XLSX por casilla |
| Gubernatura 2021 | IEEZ · Cómputo Proceso Electoral Local 2020-2021 | XLSX por casilla |
| Presidencial 2024 | INE · Cómputos Distritales 2024 | JSON por sección, uno por distrito federal |

Los dos procesos locales de Zacatecas son 2021 y 2024. En 2024 no hubo gubernatura
—toca en 2027—, así que las presidencias municipales son la única elección
comparable de forma directa entre ambos años.

Descarga:

```bash
# Proceso local 2020-2021 (IEEZ): trae gubernatura, diputaciones y ayuntamientos
curl -L -o datos/computo2021.xlsx \
  "https://ieez.org.mx/PE2021/Doc/C%C3%93MPUTO%20DE%20ELECCI%C3%93N%20PROCESO%20ELECTORAL%202020-2021.xlsx"

# Proceso local 2023-2024 (IEEZ): ayuntamientos y diputaciones
curl -L -o datos/computo2024_local.xlsx \
  "https://ieez.org.mx/PE2024/Resultados%20computos%20eleccion%20de%20Ayuntamiento%20y%20Diputaciones%20por%20casilla%20y%20municipio.xlsx"

# Presidencial 2024 (INE) — Zacatecas es la entidad 32, con 4 distritos federales
for d in 1 2 3 4; do
  curl -o "datos/pres2024_32_$d.json" \
    "https://computos2024.ine.mx/assets/JSON/PRESIDENTE/DISTRITAL/Presidente_DISTRITAL_32_$d.json"
done
```

### Transformación

```bash
python scripts/etl_resultados_electorales.py datos/ datos/resultados.json
```

Normaliza todas las fuentes a la misma forma y agrupa los votos en **bloques**. Esto
último no es cosmético: en una coalición el voto se reparte entre la columna de cada
partido y las columnas de cada combinación marcada en la boleta. Sumar solo `MORENA`
perdería los votos emitidos marcando MORENA junto al PVEM. La cifra comparable es el
total del bloque.

**Las coaliciones cambian entre procesos y cada elección declara las suyas.** En 2021 el
PT concurrió con Morena, el PVEM y Nueva Alianza. En los ayuntamientos de 2024 fue por
separado, coaligado con NAZ y PES, mientras Morena iba con el PVEM. Forzar un bloque
único entre ambos años falsearía la comparación, así que cada año conserva sus alianzas
reales. Se nota en el resultado: en 2024 el bloque PT-NAZ-PES sacó 10.87 % por su cuenta,
y esa separación es la que dejó a PAN-PRI-PRD como primera fuerza estatal en votos
municipales pese a no crecer.

### Carga

La escritura está restringida a administradores por RLS. Se carga con el CLI de Supabase,
que usa las credenciales del proyecto enlazado:

```bash
supabase db query --linked -f datos/carga.sql
```

El SQL se genera a partir de `resultados.json` con un `INSERT ... SELECT` desde
`jsonb_to_recordset`, con `ON CONFLICT` sobre `(org_id, section_code, election_year,
election_type)` para que recargar sea idempotente.

> `SUPABASE_SERVICE_ROLE_KEY` está vacía en `.env`. Si algún día se rellena, se puede
> cargar por la API REST en vez de por el CLI.

### Validación

Los totales estatales deben acercarse a los resultados publicados. Al cargar por primera
vez dieron:

| | Calculado | Publicado |
|---|---|---|
| Gubernatura 2021 · Morena y aliados | 49.33 % | ~48.7 % |
| Gubernatura 2021 · PAN-PRI-PRD | 38.43 % | ~38.3 % |
| Participación gubernatura 2021 | 50.86 % | ~50 % |
| Participación presidencial 2024 | 60.74 % | ~61 % nacional |

Las diferencias corresponden a PREP contra cómputo final.

Las elecciones municipales sirven de contraste cruzado: su participación debe parecerse
a la del proceso hermano del mismo año, y así sale — 50.68 % en 2021 frente al 50.86 %
de la gubernatura, y 59.44 % en 2024 frente al 60.74 % de la presidencial.

### Cobertura

| Proceso | Secciones |
|---|---|
| Ayuntamiento 2024 | 1 764 |
| Ayuntamiento 2021 | 1 742 |
| Gubernatura 2021 | 1 743 |
| Presidencial 2024 | 1 766 |

Las secciones sin resultado en alguno de los procesos son consecuencia del
**reseccionamiento**: entre 2021 y 2024 el INE dividió y renumeró secciones. La interfaz
las muestra como "sin resultados" en lugar de estimar cifras que no existen.
