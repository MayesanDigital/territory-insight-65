"""
Normaliza resultados electorales por sección para el comparativo territorial.

Fuentes (todas oficiales, públicas y agregadas por sección):

  Ayuntamientos 2021  IEEZ — Cómputo Proceso Electoral Local 2020-2021.
  Gubernatura 2021    XLSX a nivel casilla, hojas *_COMP_AYU_Zac y *_COMP_GOB_Zac.
                      https://ieez.org.mx/PE_2021.html

  Ayuntamientos 2024  IEEZ — Resultados cómputos por casilla y municipio.
                      XLSX a nivel casilla, hoja AYUNTAMIENTOS.
                      https://ieez.org.mx/PE_2024.html

  Presidencial 2024   INE — Cómputos Distritales 2024.
                      JSON a nivel sección, uno por distrito federal.
                      https://computos2024.ine.mx

Por qué se agrupa en bloques y no por partido suelto: el voto de una coalición se
reparte entre la columna de cada partido y las columnas de cada combinación
marcada en la boleta. Sumar solo "MORENA" perdería los votos emitidos marcando
MORENA junto al PVEM. La cifra comparable es el total del bloque.

Las coaliciones cambian entre procesos, así que cada elección declara las suyas.
En 2021 el PT concurrió con Morena; en los ayuntamientos de 2024 fue por separado,
en coalición con NAZ y PES. Forzar un bloque único entre ambos años falsearía la
comparación, de modo que cada año conserva sus alianzas reales.

Uso:
    python scripts/etl_resultados_electorales.py <carpeta_datos> <salida.json>
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

# --- Coaliciones por proceso --------------------------------------------------
# Cada bloque declara su etiqueta visible y las columnas que lo componen.

BLOQUES_LOCALES_2021 = {
    "morena": {
        "etiqueta": "Morena y aliados",
        "columnas": [
            "PT", "PVEM", "MORENA", "NA",
            "PT-PVEM-MORENA-NAZ", "PT-PVEM-MORENA", "PT-PVEM-NAZ", "PT-MORENA-NAZ",
            "PVEM-MORENA-NAZ", "PT-PVEM", "PT-MORENA", "PT-NAZ", "PVEM-MORENA",
            "PVEM-NAZ", "MORENA-NAZ",
        ],
    },
    "pan_pri_prd": {
        "etiqueta": "PAN-PRI-PRD",
        "columnas": ["PAN", "PRI", "PRD", "PAN-PRI-PRD", "PAN-PRI", "PAN-PRD", "PRI-PRD"],
    },
    "mc": {"etiqueta": "Movimiento Ciudadano", "columnas": ["MC"]},
    "otros": {
        "etiqueta": "Otros",
        "columnas": [
            "ES", "PAZ", "MD", "PP", "FAM", "PES", "RSP", "FXM",
            "PL_1", "PL_2", "PL_X",
            "CAND_IND_1", "CAND_IND_2", "CAND_IND_3", "CAND_IND_X",
        ],
    },
}

BLOQUES_AYUNTAMIENTOS_2024 = {
    "morena": {"etiqueta": "Morena-PVEM", "columnas": ["MORENA", "PVEM", "PVEM_MORENA"]},
    "pt_aliados": {
        "etiqueta": "PT-NAZ-PES",
        "columnas": ["PT", "NAZ", "PES", "PT_NAZ_PES", "PT_NAZ", "PT_PES", "NAZ_PES"],
    },
    "pan_pri_prd": {
        "etiqueta": "PAN-PRI-PRD",
        "columnas": ["PAN", "PRI", "PRD", "PAN_PRI_PRD", "PAN_PRI", "PAN_PRD", "PRI_PRD"],
    },
    "mc": {"etiqueta": "Movimiento Ciudadano", "columnas": ["MC"]},
    "otros": {"etiqueta": "Otros", "columnas": ["MAZ", "FMZ", "RPZ"]},
}

BLOQUES_PRESIDENCIAL_2024 = {
    "morena": {
        "etiqueta": "PVEM-PT-Morena",
        "columnas": ["PVEM", "PT", "MORENA", "PVEM_PT_MORENA", "PVEM_PT", "PVEM_MORENA", "PT_MORENA"],
    },
    "pan_pri_prd": {
        "etiqueta": "PAN-PRI-PRD",
        "columnas": ["PAN", "PRI", "PRD", "PAN_PRI_PRD", "PAN_PRI", "PAN_PRD", "PRI_PRD"],
    },
    "mc": {"etiqueta": "Movimiento Ciudadano", "columnas": ["MC"]},
    "otros": {"etiqueta": "Otros", "columnas": []},
}


def normaliza(clave):
    """Colapsa espacios y mayúsculas: el IEEZ publica cabeceras como 'MORENA- NAZ'."""
    return str(clave).replace(" ", "").replace("\n", "").upper().strip()


def seccion_a_clave(numero):
    """Las secciones del INE van a cuatro dígitos, como en territorial_units."""
    return str(int(numero)).zfill(4)


def entero(valor):
    try:
        return int(float(valor))
    except (TypeError, ValueError):
        return 0


def indice_columnas(bloques):
    """Columna normalizada → bloque al que pertenece."""
    return {normaliza(c): b for b, cfg in bloques.items() for c in cfg["columnas"]}


def acumulador(bloques):
    return {b: 0 for b in bloques}


# --- Lectores -----------------------------------------------------------------

def leer_xlsx_ieez(ruta, hoja, bloques, fila_encabezado, col_seccion,
                   col_lista, col_total, col_nulos, col_noreg):
    """
    Agrega un cómputo del IEEZ por casilla a nivel sección.

    `fila_encabezado` es cuántas filas hay que saltar antes del encabezado: los dos
    archivos traen filas de título de distinto alto.
    """
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    ws = wb[hoja]
    filas = ws.iter_rows(values_only=True)

    for _ in range(fila_encabezado):
        next(filas)
    encabezado = [normaliza(c) if c is not None else "" for c in next(filas)]
    idx = {h: i for i, h in enumerate(encabezado) if h}
    por_bloque = indice_columnas(bloques)

    def num(fila, nombre):
        i = idx.get(normaliza(nombre))
        return entero(fila[i]) if i is not None and i < len(fila) else 0

    secciones = defaultdict(
        lambda: {"votos": acumulador(bloques), "nulos": 0, "no_registrados": 0,
                 "lista_nominal": 0, "total": 0, "actas": 0}
    )

    i_seccion = idx[normaliza(col_seccion)]
    for fila in filas:
        if not fila or i_seccion >= len(fila) or fila[i_seccion] in (None, ""):
            continue
        try:
            clave = seccion_a_clave(fila[i_seccion])
        except (TypeError, ValueError):
            continue

        s = secciones[clave]
        s["actas"] += 1
        s["lista_nominal"] += num(fila, col_lista)
        s["total"] += num(fila, col_total)
        s["nulos"] += num(fila, col_nulos)
        s["no_registrados"] += num(fila, col_noreg)

        for columna, i in idx.items():
            bloque = por_bloque.get(columna)
            if bloque and i < len(fila):
                s["votos"][bloque] += entero(fila[i])

    return secciones


def leer_presidencial_2024(rutas_json, bloques):
    """Lee los nodos de nivel SECCION de cada distrito federal."""
    por_bloque = indice_columnas(bloques)
    secciones = {}

    for ruta in rutas_json:
        with open(ruta, encoding="utf-8") as f:
            distrito = json.load(f)

        for hijo in distrito.get("entidadesHijas", []):
            # idNodo 0 son Voto Anticipado y Prisión Preventiva: no son secciones.
            if hijo.get("nivelNodo") != "SECCION" or not hijo.get("idNodo"):
                continue

            votos = acumulador(bloques)
            nulos = no_reg = 0

            for p in hijo.get("votosActaPartidoCoalicion", []):
                siglas = normaliza(p.get("siglasPartido") or "")
                total = entero(p.get("total"))
                if siglas == "VN":
                    nulos += total
                elif siglas == "CNR":
                    no_reg += total
                else:
                    votos[por_bloque.get(siglas, "otros")] += total

            secciones[seccion_a_clave(hijo["idNodo"])] = {
                "votos": votos,
                "nulos": nulos,
                "no_registrados": no_reg,
                "lista_nominal": entero(hijo.get("listaNominal")),
                "total": entero(hijo.get("totalVotos")),
                "actas": entero(hijo.get("totalActas")),
            }

    return secciones


def a_registro(clave, datos, bloques, anio, tipo, etiqueta, fuente):
    total = datos["total"]
    lista = datos["lista_nominal"]

    resultados = [
        {
            "bloque": b,
            "etiqueta": bloques[b]["etiqueta"],
            "votos": v,
            "porcentaje": round(v / total * 100, 2) if total else 0,
        }
        for b, v in datos["votos"].items()
        if v > 0
    ]
    resultados.sort(key=lambda r: r["votos"], reverse=True)

    return {
        "section_code": clave,
        "election_year": anio,
        "election_type": tipo,
        "election_label": etiqueta,
        "lista_nominal": lista,
        "total_votos": total,
        "votos_nulos": datos["nulos"],
        "no_registrados": datos["no_registrados"],
        "actas": datos["actas"],
        "participacion": round(total / lista * 100, 2) if lista else None,
        # `ganador` guarda la etiqueta visible para no tener que resolverla al pintar.
        "ganador": resultados[0]["etiqueta"] if resultados else None,
        "resultados": resultados,
        "source": fuente,
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    datos = Path(sys.argv[1])
    salida = Path(sys.argv[2])
    registros = []
    resumen = []

    procesos = [
        {
            "lector": lambda: leer_xlsx_ieez(
                datos / "computo2024_local.xlsx", "AYUNTAMIENTOS",
                BLOQUES_AYUNTAMIENTOS_2024, fila_encabezado=2,
                col_seccion="SECCIÓN", col_lista="LISTA NOMINAL",
                col_total="VTOTAL", col_nulos="NULOS", col_noreg="NOREG",
            ),
            "bloques": BLOQUES_AYUNTAMIENTOS_2024,
            "anio": 2024, "tipo": "ayuntamiento", "etiqueta": "Ayuntamiento 2024",
            "fuente": "IEEZ · Cómputos Proceso Electoral 2023-2024",
        },
        {
            "lector": lambda: leer_xlsx_ieez(
                datos / "computo2021.xlsx", "20210720_1830_COMP_AYU_Zac",
                BLOQUES_LOCALES_2021, fila_encabezado=1,
                col_seccion="SECCION", col_lista="LISTA_NOMINAL_CASILLA",
                col_total="TOTAL_VOTOS", col_nulos="NUM_VOTOS_NULOS",
                col_noreg="NO_REGISTRADOS",
            ),
            "bloques": BLOQUES_LOCALES_2021,
            "anio": 2021, "tipo": "ayuntamiento", "etiqueta": "Ayuntamiento 2021",
            "fuente": "IEEZ · Cómputo Proceso Electoral Local 2020-2021",
        },
        {
            "lector": lambda: leer_xlsx_ieez(
                datos / "computo2021.xlsx", "20210720_1830_COMP_GOB_Zac",
                BLOQUES_LOCALES_2021, fila_encabezado=1,
                col_seccion="SECCION", col_lista="LISTA_NOMINAL_CASILLA",
                col_total="TOTAL_VOTOS", col_nulos="NUM_VOTOS_NULOS",
                col_noreg="NO_REGISTRADOS",
            ),
            "bloques": BLOQUES_LOCALES_2021,
            "anio": 2021, "tipo": "gubernatura", "etiqueta": "Gubernatura 2021",
            "fuente": "IEEZ · Cómputo Proceso Electoral Local 2020-2021",
        },
        {
            "lector": lambda: leer_presidencial_2024(
                sorted(datos.glob("pres2024_32_*.json")), BLOQUES_PRESIDENCIAL_2024
            ),
            "bloques": BLOQUES_PRESIDENCIAL_2024,
            "anio": 2024, "tipo": "presidencial", "etiqueta": "Presidencial 2024",
            "fuente": "INE · Cómputos Distritales 2024",
        },
    ]

    for p in procesos:
        secciones = p["lector"]()
        registros += [
            a_registro(k, v, p["bloques"], p["anio"], p["tipo"], p["etiqueta"], p["fuente"])
            for k, v in secciones.items()
        ]
        resumen.append((p["etiqueta"], len(secciones)))

    salida.write_text(json.dumps(registros, ensure_ascii=False), encoding="utf-8")

    for etiqueta, n in resumen:
        print(f"{etiqueta:<22} {n:>5} secciones")
    print(f"\nRegistros escritos: {len(registros)} → {salida}")


if __name__ == "__main__":
    main()
