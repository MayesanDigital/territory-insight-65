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

LAS COALICIONES SE DETECTAN, NO SE ASUMEN
-----------------------------------------
En las elecciones municipales la coalición se pacta municipio por municipio. PAN,
PRI y PRD fueron juntos en unos ayuntamientos y por separado en otros: en Jerez
2024 la columna PAN_PRI_PRD viene vacía porque cada uno llevó su propia
candidatura, y el PRD resultó la fuerza más votada.

Dar por hecha una coalición estatal sumaba tres candidaturas rivales en un mismo
bloque e inventaba un ganador que no existió. Por eso, para cada municipio se mira
si las columnas de combinación tienen votos: si los tienen, esos partidos iban
coaligados allí y se agrupan; si están vacías, cada partido cuenta por separado.

Cada sección guarda dos vistas complementarias:
  * `partidos`   — votos propios de cada partido, sin agrupar. Cifra literal del acta.
  * `resultados` — fuerzas agrupadas según la coalición real de ese municipio, que
                   es lo que determina quién ganó la sección.

Uso:
    python scripts/etl_resultados_electorales.py <carpeta_datos> <salida.json>
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

# --- Columnas por proceso -----------------------------------------------------

PARTIDOS_2021 = ["PAN", "PRI", "PRD", "PVEM", "PT", "MC", "NA", "MORENA",
                 "ES", "PAZ", "MD", "PP", "FAM", "PES", "RSP", "FXM"]
COMBOS_2021 = ["PAN-PRI-PRD", "PAN-PRI", "PAN-PRD", "PRI-PRD",
               "PT-PVEM-MORENA-NAZ", "PT-PVEM-MORENA", "PT-PVEM-NAZ", "PT-MORENA-NAZ",
               "PVEM-MORENA-NAZ", "PT-PVEM", "PT-MORENA", "PT-NAZ", "PVEM-MORENA",
               "PVEM-NAZ", "MORENA-NAZ"]

PARTIDOS_AYU_2024 = ["PAN", "PRI", "PRD", "PT", "PVEM", "MC", "MORENA",
                     "NAZ", "PES", "MAZ", "FMZ", "RPZ"]
COMBOS_AYU_2024 = ["PVEM_MORENA", "PT_NAZ_PES", "PT_NAZ", "PT_PES", "NAZ_PES",
                   "PAN_PRI_PRD", "PAN_PRI", "PAN_PRD", "PRI_PRD"]

PARTIDOS_PRES_2024 = ["PAN", "PRI", "PRD", "PVEM", "PT", "MC", "MORENA"]
COMBOS_PRES_2024 = ["PAN_PRI_PRD", "PAN_PRI", "PAN_PRD", "PRI_PRD",
                    "PVEM_PT_MORENA", "PVEM_PT", "PVEM_MORENA", "PT_MORENA"]

# En las combinaciones el IEEZ escribe NAZ donde la columna propia se llama NA.
ALIAS = {"NAZ": "NA"}

NOMBRE = {
    "PAN": "PAN", "PRI": "PRI", "PRD": "PRD", "PVEM": "PVEM", "PT": "PT",
    "MC": "Movimiento Ciudadano", "NA": "Nueva Alianza", "MORENA": "Morena",
    "ES": "Encuentro Solidario", "PAZ": "PAZ", "MD": "MD", "PP": "PP",
    "FAM": "Fuerza por México", "PES": "PES", "RSP": "Redes Sociales",
    "FXM": "Fuerza por México", "MAZ": "MAZ", "FMZ": "FMZ", "RPZ": "RPZ",
}


def norm(clave):
    """Colapsa espacios y mayúsculas: el IEEZ publica cabeceras como 'MORENA- NAZ'."""
    return str(clave).replace(" ", "").replace("\n", "").upper().strip()


def miembros(combo):
    """Partidos que integran una columna de combinación, ya normalizados."""
    tokens = norm(combo).replace("_", "-").split("-")
    return [ALIAS.get(t, t) for t in tokens if t]


def clave_seccion(numero):
    return str(int(numero)).zfill(4)


def entero(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


class Coaliciones:
    """
    Agrupa los partidos que concurrieron juntos en un municipio.

    Union-find: dos partidos caen en el mismo grupo si aparecen juntos en alguna
    columna de combinación CON VOTOS allí. Las combinaciones parciales (PAN-PRI,
    PAN-PRD…) pertenecen a la misma alianza que la completa, y la unión las funde
    en un único grupo sin tener que tratarlas aparte.
    """

    def __init__(self):
        self.padre = {}

    def _raiz(self, x):
        self.padre.setdefault(x, x)
        while self.padre[x] != x:
            self.padre[x] = self.padre[self.padre[x]]
            x = self.padre[x]
        return x

    def unir(self, a, b):
        ra, rb = self._raiz(a), self._raiz(b)
        if ra != rb:
            self.padre[rb] = ra

    def grupo(self, partido):
        return self._raiz(partido)


def construye_fuerzas(votos_partido, votos_combo, coaliciones):
    """
    Reparte los votos entre fuerzas políticas reales.

    Cada partido aporta sus votos propios al grupo que le corresponda y cada
    combinación los suyos al grupo de sus integrantes. Un partido que no se
    coaligó en ese municipio forma grupo de uno y conserva su cifra intacta.
    """
    acumulado = defaultdict(int)
    integrantes = defaultdict(set)

    for partido, v in votos_partido.items():
        if v <= 0:
            continue
        g = coaliciones.grupo(partido)
        acumulado[g] += v
        integrantes[g].add(partido)

    for combo, v in votos_combo.items():
        ms = miembros(combo)
        if not ms or v <= 0:
            continue
        g = coaliciones.grupo(ms[0])
        acumulado[g] += v
        integrantes[g].update(ms)

    fuerzas = []
    for g, v in acumulado.items():
        partes = sorted(integrantes[g])
        etiqueta = ("-".join(NOMBRE.get(p, p) for p in partes)
                    if len(partes) > 1 else NOMBRE.get(partes[0], partes[0]))
        fuerzas.append({
            "bloque": "-".join(partes).lower(),
            "etiqueta": etiqueta,
            "votos": v,
            "partidos": partes,
        })
    return fuerzas


def lee_xlsx_ieez(ruta, hoja, partidos, combos, salto, c_muni, c_secc,
                  c_lista, c_total, c_nulos, c_noreg):
    wb = openpyxl.load_workbook(ruta, read_only=True, data_only=True)
    ws = wb[hoja]
    filas = list(ws.iter_rows(values_only=True))
    for _ in range(salto):
        filas.pop(0)
    hdr = [norm(c) if c is not None else "" for c in filas.pop(0)]
    idx = {h: i for i, h in enumerate(hdr) if h}

    def num(fila, nombre):
        i = idx.get(norm(nombre))
        return entero(fila[i]) if i is not None and i < len(fila) else 0

    i_secc = idx.get(norm(c_secc))
    i_muni = idx.get(norm(c_muni))

    # Primera pasada: qué combinaciones tuvieron votos en cada municipio.
    combos_activos = defaultdict(set)
    datos = []
    for fila in filas:
        if i_secc is None or i_secc >= len(fila) or fila[i_secc] in (None, ""):
            continue
        try:
            secc = clave_seccion(fila[i_secc])
        except (TypeError, ValueError):
            continue
        muni = str(fila[i_muni] or "").strip().upper() if i_muni is not None else ""
        datos.append((muni, secc, fila))
        for combo in combos:
            if num(fila, combo) > 0:
                combos_activos[muni].add(combo)

    alianzas = {}
    for muni, activos in combos_activos.items():
        c = Coaliciones()
        for combo in activos:
            ms = miembros(combo)
            for m in ms[1:]:
                c.unir(ms[0], m)
        alianzas[muni] = c

    secciones = defaultdict(lambda: {
        "partidos": defaultdict(int), "combos": defaultdict(int),
        "nulos": 0, "no_registrados": 0, "lista_nominal": 0, "total": 0,
        "actas": 0, "municipio": "",
    })

    for muni, secc, fila in datos:
        s = secciones[secc]
        s["municipio"] = muni
        s["actas"] += 1
        s["lista_nominal"] += num(fila, c_lista)
        s["total"] += num(fila, c_total)
        s["nulos"] += num(fila, c_nulos)
        s["no_registrados"] += num(fila, c_noreg)
        for p in partidos:
            s["partidos"][ALIAS.get(norm(p), norm(p))] += num(fila, p)
        for combo in combos:
            v = num(fila, combo)
            if v:
                s["combos"][combo] += v

    for s in secciones.values():
        s["coaliciones"] = alianzas.get(s["municipio"], Coaliciones())
    return secciones


def lee_presidencial(rutas, partidos, combos):
    validos = {norm(p) for p in partidos}
    validos_combo = {norm(c) for c in combos}

    crudo = []
    activos = set()
    for ruta in rutas:
        with open(ruta, encoding="utf-8") as f:
            distrito = json.load(f)
        for hijo in distrito.get("entidadesHijas", []):
            # idNodo 0 son Voto Anticipado y Prisión Preventiva: no son secciones.
            if hijo.get("nivelNodo") != "SECCION" or not hijo.get("idNodo"):
                continue
            crudo.append(hijo)
            for p in hijo.get("votosActaPartidoCoalicion", []):
                sig = norm(p.get("siglasPartido") or "")
                if sig in validos_combo and entero(p.get("total")) > 0:
                    activos.add(sig)

    # La coalición presidencial fue única en todo el estado, pero se detecta igual.
    coaliciones = Coaliciones()
    for combo in activos:
        ms = miembros(combo)
        for m in ms[1:]:
            coaliciones.unir(ms[0], m)

    secciones = {}
    for hijo in crudo:
        votos_p, votos_c = defaultdict(int), defaultdict(int)
        nulos = noreg = 0
        for p in hijo.get("votosActaPartidoCoalicion", []):
            sig = norm(p.get("siglasPartido") or "")
            v = entero(p.get("total"))
            if sig == "VN":
                nulos += v
            elif sig == "CNR":
                noreg += v
            elif sig in validos:
                votos_p[ALIAS.get(sig, sig)] += v
            elif sig in validos_combo and v:
                votos_c[sig] += v

        secciones[clave_seccion(hijo["idNodo"])] = {
            "partidos": votos_p, "combos": votos_c, "nulos": nulos,
            "no_registrados": noreg,
            "lista_nominal": entero(hijo.get("listaNominal")),
            "total": entero(hijo.get("totalVotos")),
            "actas": entero(hijo.get("totalActas")),
            "municipio": "", "coaliciones": coaliciones,
        }
    return secciones


def a_registro(clave, d, anio, tipo, etiqueta, fuente):
    total = d["total"]

    def pct(v):
        return round(v / total * 100, 2) if total else 0

    # Votos propios de cada partido, sin agrupar. Cifra literal del acta.
    partidos = sorted(
        [{"siglas": p, "nombre": NOMBRE.get(p, p), "votos": v, "porcentaje": pct(v)}
         for p, v in d["partidos"].items() if v > 0],
        key=lambda x: x["votos"], reverse=True,
    )

    # Votos de coalición: en la boleta son una marca conjunta, no de un partido.
    coaliciones = sorted(
        [{"siglas": c.replace("_", "-"), "votos": v, "porcentaje": pct(v)}
         for c, v in d["combos"].items() if v > 0],
        key=lambda x: x["votos"], reverse=True,
    )

    fuerzas = construye_fuerzas(d["partidos"], d["combos"], d["coaliciones"])
    for f in fuerzas:
        f["porcentaje"] = pct(f["votos"])
    fuerzas.sort(key=lambda x: x["votos"], reverse=True)

    return {
        "section_code": clave,
        "election_year": anio,
        "election_type": tipo,
        "election_label": etiqueta,
        "lista_nominal": d["lista_nominal"],
        "total_votos": total,
        "votos_nulos": d["nulos"],
        "no_registrados": d["no_registrados"],
        "actas": d["actas"],
        "participacion": (round(total / d["lista_nominal"] * 100, 2)
                          if d["lista_nominal"] else None),
        "ganador": fuerzas[0]["etiqueta"] if fuerzas else None,
        "resultados": fuerzas,
        "partidos": {"partidos": partidos, "coaliciones": coaliciones},
        "source": fuente,
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    datos, salida = Path(sys.argv[1]), Path(sys.argv[2])
    registros, resumen = [], []

    procesos = [
        (lambda: lee_xlsx_ieez(datos / "computo2024_local.xlsx", "AYUNTAMIENTOS",
                               PARTIDOS_AYU_2024, COMBOS_AYU_2024, 2, "MUNICIPIO",
                               "SECCIÓN", "LISTA NOMINAL", "VTOTAL", "NULOS", "NOREG"),
         2024, "ayuntamiento", "Ayuntamiento 2024",
         "IEEZ · Cómputos Proceso Electoral 2023-2024"),
        (lambda: lee_xlsx_ieez(datos / "computo2021.xlsx", "20210720_1830_COMP_AYU_Zac",
                               PARTIDOS_2021, COMBOS_2021, 1, "MUNICIPIO_LOCAL",
                               "SECCION", "LISTA_NOMINAL_CASILLA", "TOTAL_VOTOS",
                               "NUM_VOTOS_NULOS", "NO_REGISTRADOS"),
         2021, "ayuntamiento", "Ayuntamiento 2021",
         "IEEZ · Cómputo Proceso Electoral Local 2020-2021"),
        (lambda: lee_xlsx_ieez(datos / "computo2021.xlsx", "20210720_1830_COMP_GOB_Zac",
                               PARTIDOS_2021, COMBOS_2021, 1, "MUNICIPIO_LOCAL",
                               "SECCION", "LISTA_NOMINAL_CASILLA", "TOTAL_VOTOS",
                               "NUM_VOTOS_NULOS", "NO_REGISTRADOS"),
         2021, "gubernatura", "Gubernatura 2021",
         "IEEZ · Cómputo Proceso Electoral Local 2020-2021"),
        (lambda: lee_presidencial(sorted(datos.glob("pres2024_32_*.json")),
                                 PARTIDOS_PRES_2024, COMBOS_PRES_2024),
         2024, "presidencial", "Presidencial 2024",
         "INE · Cómputos Distritales 2024"),
    ]

    for lector, anio, tipo, etiqueta, fuente in procesos:
        secciones = lector()
        registros += [a_registro(k, v, anio, tipo, etiqueta, fuente)
                      for k, v in secciones.items()]
        resumen.append((etiqueta, len(secciones)))

    salida.write_text(json.dumps(registros, ensure_ascii=False), encoding="utf-8")

    for etiqueta, n in resumen:
        print(f"{etiqueta:<22} {n:>5} secciones")
    print(f"\nRegistros escritos: {len(registros)} -> {salida}")


if __name__ == "__main__":
    main()
