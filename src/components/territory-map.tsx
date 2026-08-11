import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { TerritorialUnit } from "@/types";

export type MapMetric = "population" | "contacts" | "coverage" | "density";

interface Props {
  units: TerritorialUnit[];
  contactCounts: Record<string, number>;
  metric: MapMetric;
  selectedId?: string | null;
  onSelect: (unit: TerritorialUnit) => void;
}

const SCALE = ["#F1E7D8", "#E0C89B", "#C79E5E", "#A8763E", "#7A4E23"];

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

export default function TerritoryMap({
  units,
  contactCounts,
  metric,
  selectedId,
  onSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const values = useMemo(
    () => units.map((u) => metricValue(u, contactCounts[u.section_code] ?? 0, metric)),
    [units, contactCounts, metric],
  );
  const max = Math.max(...values, 1);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView(
      [22.77, -102.58],
      9,
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
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    units.forEach((u, i) => {
      const contacts = contactCounts[u.section_code] ?? 0;
      const value = values[i] ?? 0;
      const idx = Math.min(SCALE.length - 1, Math.floor((value / max) * SCALE.length));
      const color = SCALE[idx] ?? SCALE[0]!;
      const popup = `
        <div style="font-family:Manrope,sans-serif;min-width:180px">
          <strong>Sección ${u.section_code}</strong><br/>
          <span style="opacity:.7">${u.municipio}${u.localidad ? " · " + u.localidad : ""}</span>
          <hr style="margin:6px 0;border-color:#e4dccd"/>
          Población: <b>${(u.population ?? 0).toLocaleString("es-MX")}</b><br/>
          Hogares: <b>${(u.households ?? 0).toLocaleString("es-MX")}</b><br/>
          Contactos: <b>${contacts}</b>
        </div>`;

      if (u.geometry) {
        const poly = L.geoJSON(u.geometry as never, {
          style: {
            color: selectedId === u.id ? "#7A2E2E" : "#8b7a5f",
            weight: selectedId === u.id ? 3 : 1,
            fillColor: color,
            fillOpacity: 0.75,
          },
        });
        poly.on("click", () => onSelect(u));
        poly.bindPopup(popup);
        poly.addTo(layer);
        const b = poly.getBounds();
        if (b.isValid()) bounds.push(b.getNorthEast(), b.getSouthWest());
      } else if (u.centroid_lat != null && u.centroid_lng != null) {
        const marker = L.circleMarker([u.centroid_lat, u.centroid_lng], {
          radius: 8,
          color: "#7A2E2E",
          weight: selectedId === u.id ? 3 : 1,
          fillColor: color,
          fillOpacity: 0.85,
        });
        marker.on("click", () => onSelect(u));
        marker.bindPopup(popup);
        marker.addTo(layer);
        bounds.push([u.centroid_lat, u.centroid_lng]);
      }
    });

    if (bounds.length) {
      map.fitBounds(L.latLngBounds(bounds).pad(0.15));
    }
  }, [units, contactCounts, metric, selectedId, max, values, onSelect]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-border">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-md border border-border bg-card/95 p-3 text-xs shadow-sm">
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
