import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { Json } from "@/integrations/supabase/types";
import { CENSUS_DISPLAY_LABEL, type TerritorialUnit } from "@/types";
import type { GanadorSeccion } from "@/services/electionsService";

export type MapMetric = "population" | "contacts" | "coverage" | "density";

/**
 * Contactos de una sección, desglosados por categoría de seguimiento.
 * `total` incluye los contactos sin categorizar (altas anteriores al campo),
 * por lo que fidelizado + seguro no tiene por qué sumar total.
 */
export interface SectionContacts {
  total: number;
  fidelizado: number;
  seguro: number;
}

export const SIN_CONTACTOS: SectionContacts = { total: 0, fidelizado: 0, seguro: 0 };

interface Props {
  units: TerritorialUnit[];
  /**
   * Polígonos por id de sección, solo de las secciones actualmente acotadas.
   * Las que no aparezcan aquí se dibujan como punto en su centroide: es lo que
   * permite mostrar el estado completo sin descargar 15 MB de geometría.
   */
  geometryById: Record<string, Json>;
  contactCounts: Record<string, SectionContacts>;
  /** Ganador de la última elección municipal, por clave de sección. */
  winners?: Record<string, GanadorSeccion>;
  /** Meta de contactos fijada por la campaña, por clave de sección. */
  goals?: Record<string, number>;
  metric: MapMetric;
  selectedId?: string | null;
  onSelect: (unit: TerritorialUnit) => void;
  /** Abre el alta de contacto ya situada en esta sección. */
  onAddContact?: (unit: TerritorialUnit) => void;
  /** Oculta el botón de alta cuando el rol no puede escribir. */
  canAddContact?: boolean;
}

const SCALE = ["#F1E7D8", "#E0C89B", "#C79E5E", "#A8763E", "#7A4E23"];
const SELECTED = "#7A2E2E";
const BORDER = "#8b7a5f";

function metricValue(u: TerritorialUnit, contacts: number, metric: MapMetric) {
  switch (metric) {
    case "population":
      return u.population ?? 0;
    case "contacts":
      return contacts;
    case "coverage":
      return u.population ? (contacts / u.population) * 100 : 0;
    case "density":
      return u.households ? (u.population ?? 0) / u.households : 0;
  }
}

const fmt = (n: number) => n.toLocaleString("es-MX");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Barra proporcional para el popup. Leaflet solo acepta HTML, no JSX. */
function bar(label: string, value: number, total: number, color: string) {
  const p = pct(value, total);
  return `
    <div style="display:flex;align-items:center;gap:6px;margin:2px 0">
      <span style="width:44px;font-size:11px;opacity:.75">${label}</span>
      <span style="flex:1;height:7px;background:#EFE9DE;border-radius:4px;overflow:hidden">
        <span style="display:block;height:100%;width:${p}%;background:${color}"></span>
      </span>
      <span style="width:64px;text-align:right;font-size:11px;font-variant-numeric:tabular-nums">
        ${fmt(value)} <span style="opacity:.6">${p}%</span>
      </span>
    </div>`;
}

/**
 * El popup se construye como elemento del DOM, no como cadena, para poder
 * colgarle un listener real al botón. Con `bindPopup(string)` Leaflet reescribe
 * el HTML en cada apertura y cualquier manejador se pierde.
 */
function buildPopup(
  u: TerritorialUnit,
  contacts: SectionContacts,
  onAdd: ((unit: TerritorialUnit) => void) | undefined,
  canAdd: boolean,
  winner?: GanadorSeccion,
  goal?: number,
): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = popupHtml(u, contacts, winner, goal);

  if (onAdd && canAdd) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "+ Registrar contacto en esta sección";
    button.style.cssText = [
      "width:100%",
      "margin-top:10px",
      "padding:7px 10px",
      "border:0",
      "border-radius:6px",
      "background:#7A2E2E",
      "color:#fff",
      "font-family:inherit",
      "font-size:12px",
      "font-weight:600",
      "cursor:pointer",
    ].join(";");
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      onAdd(u);
    });
    el.appendChild(button);
  }

  return el;
}

function popupHtml(
  u: TerritorialUnit,
  contacts: SectionContacts,
  winner?: GanadorSeccion,
  goal?: number,
) {
  const total = u.population ?? 0;
  const cobertura = total > 0 ? ((contacts.total / total) * 100).toFixed(2) : "0.00";
  const sinCategoria = contacts.total - contacts.fidelizado - contacts.seguro;

  const demografia = u.has_demographics
    ? `
      <div style="margin-top:8px">
        <p style="margin:0 0 3px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.6">Edad</p>
        ${bar("0–17", u.pop_0_17, total, "#A8763E")}
        ${bar("18–24", u.pop_18_24, total, "#C79E5E")}
        ${bar("25–59", u.pop_25_59, total, "#8B6B3E")}
        ${bar("60+", u.pop_60_plus, total, "#7A4E23")}
      </div>
      <div style="margin-top:8px">
        <p style="margin:0 0 3px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.6">Género</p>
        ${bar("Mujeres", u.women, total, "#7A2E2E")}
        ${bar("Hombres", u.men, total, "#4A5D6B")}
        ${u.gender_other > 0 ? bar("Otro", u.gender_other, total, "#9A9A9A") : ""}
      </div>`
    : `<p style="margin:8px 0 0;font-size:11px;color:#9B4A4A">
         Sin datos censales: sección creada tras el censo.
       </p>`;

  // Avance sobre la meta. Sin meta fijada el bloque no se dibuja: una barra al
  // 0 % sugiere retraso cuando lo que ocurre es que nadie fijó objetivo.
  const metaHtml =
    goal && goal > 0
      ? (() => {
          const avance = Math.round((contacts.total / goal) * 1000) / 10;
          const segmento = (v: number, color: string) =>
            v > 0
              ? `<span style="display:block;height:100%;width:${Math.min((v / goal) * 100, 100)}%;background:${color};float:left"></span>`
              : "";
          return `
      <div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:#F6F1E7">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
          <span style="opacity:.7">Meta ${fmt(goal)} contactos</span>
          <b style="${avance >= 100 ? "color:#2F6B4F" : ""}">${avance}%</b>
        </div>
        <span style="display:block;height:7px;background:#E4DCCD;border-radius:4px;overflow:hidden">
          ${segmento(contacts.fidelizado, "#7A4E23")}
          ${segmento(contacts.seguro, "#4A5D6B")}
          ${segmento(sinCategoria, "#B9AFA0")}
        </span>
        <div style="font-size:10px;opacity:.65;margin-top:3px">
          Faltan ${fmt(Math.max(0, goal - contacts.total))} para la meta
        </div>
      </div>`;
        })()
      : "";

  // Resultado de la última elección municipal. Es el contexto político que
  // explica la sección; sin él, el popup solo describe demografía.
  const eleccionHtml = winner?.ganador
    ? `
      <div style="margin-top:6px;padding:6px 8px;border-radius:6px;border:1px solid #E4DCCD">
        <p style="margin:0 0 3px;font-size:10px;letter-spacing:.09em;text-transform:uppercase;opacity:.6">
          ${winner.etiqueta}
        </p>
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <b translate="no">${winner.ganador}</b>
          <span style="opacity:.7">${winner.participacion !== null ? `${winner.participacion}% part.` : ""}</span>
        </div>
        <div style="font-size:10px;opacity:.6;margin-top:2px">
          ${fmt(winner.totalVotos)} votos emitidos
        </div>
      </div>`
    : "";

  return `
    <div style="font-family:Manrope,system-ui,sans-serif;min-width:250px;color:#1C1A17">
      <strong style="font-size:14px">Sección ${u.section_code}</strong>
      <div style="opacity:.7;font-size:11px">
        ${u.municipio}${u.section_type ? ` · ${u.section_type}` : ""}${
          u.district !== null ? ` · Distrito ${u.district}` : ""
        }
      </div>
      <hr style="margin:6px 0;border:0;border-top:1px solid #E4DCCD"/>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span>Población</span><b>${fmt(total)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span>Hogares</span><b>${fmt(u.households)}</b>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span>Contactos</span><b>${contacts.total} <span style="opacity:.6">(${cobertura}%)</span></b>
      </div>
      <div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:#F6F1E7">
        <div style="display:flex;justify-content:space-between;font-size:12px">
          <span style="display:flex;align-items:center;gap:5px">
            <span style="width:8px;height:8px;border-radius:50%;background:#7A4E23;display:inline-block"></span>
            Fidelizados
          </span>
          <b>${fmt(contacts.fidelizado)}</b>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:3px">
          <span style="display:flex;align-items:center;gap:5px">
            <span style="width:8px;height:8px;border-radius:50%;background:#4A5D6B;display:inline-block"></span>
            Seguros
          </span>
          <b>${fmt(contacts.seguro)}</b>
        </div>
        ${
          sinCategoria > 0
            ? `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px;opacity:.6">
                 <span>Sin categorizar</span><b>${fmt(sinCategoria)}</b>
               </div>`
            : ""
        }
      </div>
      ${metaHtml}
      ${eleccionHtml}
      ${demografia}
      <p style="margin:8px 0 0;font-size:10px;opacity:.55">${CENSUS_DISPLAY_LABEL}</p>
    </div>`;
}

export default function TerritoryMap({
  units,
  geometryById,
  contactCounts,
  winners = {},
  goals = {},
  metric,
  selectedId,
  onSelect,
  onAddContact,
  canAddContact = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  /**
   * Capa dibujada por id de sección, para poder resaltar sin volver a dibujar.
   * Se guarda el grupo GeoJSON completo, no sus sublayers: un MultiPolygon
   * tiene varias y quedarse con la última dejaría el resto sin resaltar.
   */
  const shapesRef = useRef(
    new Map<string, { setStyle: (s: L.PathOptions) => unknown; bringToFront: () => unknown }>(),
  );

  // El manejador se lee por referencia para que cambiar de callback no cuente
  // como motivo para redibujar el mapa entero.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onAddRef = useRef(onAddContact);
  onAddRef.current = onAddContact;

  /**
   * Ganadores y metas se leen por referencia, igual que los manejadores.
   *
   * Iban en las dependencias del efecto que dibuja el mapa, y como el padre los
   * pasa con un `?? {}` de respaldo, cada render creaba un objeto nuevo: el
   * efecto se disparaba sin parar, borrando y redibujando las 1,800 capas una y
   * otra vez. En escritorio se notaba como lentitud; en móvil agotaba la memoria
   * y el navegador pedía recargar la página.
   *
   * El popup se construye en el momento de abrirse, así que leer de la
   * referencia le da igualmente el dato más reciente.
   */
  const winnersRef = useRef(winners);
  winnersRef.current = winners;
  const goalsRef = useRef(goals);
  goalsRef.current = goals;

  /**
   * Sección cuyo popup está abierto. Al guardar un contacto cambian los
   * conteos, el mapa se redibuja y el popup se destruiría; con esto se vuelve a
   * abrir ya con la cifra actualizada.
   */
  const openPopupIdRef = useRef<string | null>(null);
  /** Capa a la que está atado el popup de cada sección. */
  const popupOwnersRef = useRef(new Map<string, L.Layer>());

  const values = useMemo(
    () => units.map((u) => metricValue(u, (contactCounts[u.section_code] ?? SIN_CONTACTOS).total, metric)),
    [units, contactCounts, metric],
  );
  const max = Math.max(...values, 1);

  // Reencuadrar solo cuando cambia el CONJUNTO dibujado. Si dependiera de cada
  // render, seleccionar una sección devolvería la vista al estado completo y
  // parecería que el mapa "se aleja solo".
  const fitKey = `${units.length}|${Object.keys(geometryById).length}|${units[0]?.id ?? ""}|${
    units[units.length - 1]?.id ?? ""
  }`;
  const lastFitRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
      [22.77, -102.58],
      8,
    );
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      shapesRef.current.clear();
      popupOwnersRef.current.clear();
    };
  }, []);

  // --- Dibujar. Deliberadamente sin `selectedId` entre las dependencias: ---
  // limpiar las capas aquí destruiría el popup recién abierto por el clic.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    shapesRef.current.clear();
    popupOwnersRef.current.clear();
    const bounds: L.LatLngExpression[] = [];

    units.forEach((u, i) => {
      const contacts = contactCounts[u.section_code] ?? SIN_CONTACTOS;
      const value = values[i] ?? 0;
      const idx = Math.min(SCALE.length - 1, Math.floor((value / max) * SCALE.length));
      const color = SCALE[idx] ?? SCALE[0]!;
      const content = () =>
        buildPopup(
          u,
          contacts,
          onAddRef.current,
          canAddContact,
          winnersRef.current[u.section_code],
          goalsRef.current[u.section_code],
        );

      const track = (l: L.Layer) => {
        l.on("popupopen", () => {
          openPopupIdRef.current = u.id;
        });
        l.on("popupclose", () => {
          if (openPopupIdRef.current === u.id) openPopupIdRef.current = null;
        });
      };

      const geometry = geometryById[u.id];
      if (geometry) {
        const poly = L.geoJSON(geometry as never, {
          style: { color: BORDER, weight: 1, fillColor: color, fillOpacity: 0.75 },
        });
        poly.on("click", () => onSelectRef.current(u));
        poly.bindPopup(content, { maxWidth: 340, minWidth: 260 });
        track(poly);
        poly.addTo(layer);
        shapesRef.current.set(u.id, poly);
        popupOwnersRef.current.set(u.id, poly);
        const b = poly.getBounds();
        if (b.isValid()) bounds.push(b.getNorthEast(), b.getSouthWest());
      } else if (u.centroid_lat != null && u.centroid_lng != null) {
        const marker = L.circleMarker([u.centroid_lat, u.centroid_lng], {
          radius: 5,
          color: BORDER,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.85,
        });
        marker.on("click", () => onSelectRef.current(u));
        marker.bindPopup(content, { maxWidth: 340, minWidth: 260 });
        track(marker);
        marker.addTo(layer);
        shapesRef.current.set(u.id, marker);
        popupOwnersRef.current.set(u.id, marker);
        bounds.push([u.centroid_lat, u.centroid_lng]);
      }
    });

    if (bounds.length && lastFitRef.current !== fitKey) {
      lastFitRef.current = fitKey;
      map.fitBounds(L.latLngBounds(bounds).pad(0.15));
    }

    // Reabrir el popup que estaba abierto antes de redibujar. Es lo que hace
    // que, tras registrar un contacto, la ficha reaparezca con el conteo nuevo
    // en vez de desaparecer.
    const reopen = openPopupIdRef.current;
    if (reopen) {
      const owner = popupOwnersRef.current.get(reopen);
      if (owner) owner.openPopup();
    }
  }, [units, geometryById, contactCounts, metric, max, values, fitKey, canAddContact]);

  // --- Resaltar. Solo cambia el estilo; nunca redibuja ni mueve la vista. ---
  useEffect(() => {
    for (const [id, shape] of shapesRef.current) {
      const active = id === selectedId;
      shape.setStyle({ color: active ? SELECTED : BORDER, weight: active ? 3 : 1 });
      if (active) shape.bringToFront();
    }
  }, [selectedId, units, geometryById]);

  return (
    // `isolate` mantiene todo el apilamiento del mapa —capas de Leaflet y esta
    // leyenda— dentro de su propio contexto, para que no tape los diálogos.
    <div className="relative isolate h-full w-full overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-md border border-border bg-card/95 p-3 text-xs shadow-sm">
        <p className="mb-2 font-medium uppercase tracking-wider">Escala</p>
        <div className="flex items-center gap-1">
          {SCALE.map((c) => (
            <span key={c} className="h-3 w-6" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>0</span>
          <span>{max.toLocaleString("es-MX", { maximumFractionDigits: 1 })}</span>
        </div>
      </div>
    </div>
  );
}
