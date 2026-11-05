import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Megaphone, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MUESTRA_MINIMA,
  generaDiscurso,
  panoramaDe,
  VOTO_OTRO,
  type SurveyResponse,
} from "@/services/surveyService";
import { PARTIDOS, colorPartido } from "@/services/strategyService";

/**
 * Panorama de una sección a partir de sus dos mediciones.
 *
 * Mantiene separado lo que cada medición puede responder. El conocimiento y la
 * aceptación solo se preguntan en la segunda, así que no tienen un "antes"
 * contra el que compararse; lo que se compara entre las dos es la intención de
 * voto, que es la única pregunta que ambas comparten. Presentar un crecimiento
 * de conocimiento "desde cero" sería inventar una medición que no se hizo.
 */

const fmt = (n: number) => n.toLocaleString("es-MX");

/** Siglas del partido de la candidatura, si se reconocen en el catálogo. */
export function siglasDeCandidatura(partido: string | null | undefined): string | null {
  const v = (partido ?? "").trim();
  if (!v) return null;
  const alto = v.toUpperCase();
  const porSiglas = PARTIDOS.find((p) => p.siglas === alto);
  if (porSiglas) return porSiglas.siglas;
  const porNombre = PARTIDOS.find((p) => p.nombre.toUpperCase() === alto);
  return porNombre?.siglas ?? null;
}

function etiquetaVoto(clave: string): string {
  return (
    PARTIDOS.find((p) => p.siglas === clave)?.nombre ??
    VOTO_OTRO[clave as keyof typeof VOTO_OTRO] ??
    clave
  );
}

export function SectionSurveyPanorama({
  respuestas,
  sectionCode,
  municipio,
  candidato,
  partidoCandidatura,
}: {
  respuestas: SurveyResponse[];
  sectionCode: string;
  municipio: string;
  candidato: string | null;
  partidoCandidatura: string | null;
}) {
  const panorama = useMemo(() => panoramaDe(respuestas), [respuestas]);
  // Se nombra a la candidatura por su nombre. El respaldo es neutro porque un
  // nombre no dice el género de nadie, y la pregunta se hizo sobre esa persona.
  const quien = candidato?.trim() || "la candidatura";
  const siglas = siglasDeCandidatura(partidoCandidatura);
  const { primera, segunda } = panorama;

  const pct = (parte: number, total: number) =>
    total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

  // Intención por nuestra candidatura en cada medición. Es lo comparable.
  const miIntencion1 = siglas ? pct(primera.voto[siglas] ?? 0, primera.votoRespondido) : null;
  const miIntencion2 = siglas ? pct(segunda.voto[siglas] ?? 0, segunda.votoRespondido) : null;
  const crecimiento =
    miIntencion1 !== null && miIntencion2 !== null
      ? Math.round((miIntencion2 - miIntencion1) * 10) / 10
      : null;

  if (primera.muestras === 0 && segunda.muestras === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin muestras levantadas en esta sección. Empieza por la primera medición: es la que recoge
        las necesidades con las que se arma el discurso de la visita.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Etapa titulo="Primera medición" nota="Antes de la visita" muestras={primera.muestras} />
        <Etapa titulo="Resultados" nota="Después de la visita" muestras={segunda.muestras} />
      </div>

      {/* --- Conocimiento y aceptación: solo de la segunda medición. --- */}
      {segunda.muestras > 0 && (
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Conocimiento y aceptación
          </p>
          <div className="space-y-1.5">
            <Barra
              etiqueta={`Conoce a ${quien}`}
              si={segunda.conoce.si}
              de={segunda.conoce.de}
              color="#4A5D6B"
            />
            <Barra
              etiqueta="Cree que puede hacer un cambio"
              si={segunda.creeCambio.si}
              de={segunda.creeCambio.de}
              color="#8B6B3E"
            />
            <Barra
              etiqueta={`Votaría por ${quien}`}
              si={segunda.votariaPorEl.si}
              de={segunda.votariaPorEl.de}
              color="#2F6B4F"
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            Estas tres preguntas solo existen en la segunda medición, así que no tienen un antes con
            el que compararse. El porcentaje se calcula sobre quienes contestaron la pregunta.
          </p>
        </div>
      )}

      {/* --- Lo único comparable entre ambas mediciones. --- */}
      {siglas && (primera.votoRespondido > 0 || segunda.votoRespondido > 0) && (
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
            Intención de voto por <span translate="no">{etiquetaVoto(siglas)}</span>
          </p>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <Cifra etiqueta="Antes" valor={miIntencion1} muestras={primera.votoRespondido} />
            <Cifra etiqueta="Después" valor={miIntencion2} muestras={segunda.votoRespondido} />
            {crecimiento !== null && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Cambio</p>
                <p
                  className={`font-display text-xl font-semibold tabular-nums ${
                    crecimiento > 0 ? "text-[#2F6B4F]" : crecimiento < 0 ? "text-destructive" : ""
                  }`}
                >
                  {crecimiento > 0 ? "+" : ""}
                  {crecimiento} pts
                </p>
              </div>
            )}
          </div>
          {crecimiento === null && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Hacen falta las dos mediciones para poder comparar.
            </p>
          )}
          {(primera.votoRespondido < MUESTRA_MINIMA || segunda.votoRespondido < MUESTRA_MINIMA) && (
            <p className="mt-1 text-[11px] text-destructive">
              Menos de {MUESTRA_MINIMA} muestras en alguna de las dos mediciones: el porcentaje se
              mueve demasiado con cada respuesta para darlo por representativo.
            </p>
          )}
        </div>
      )}

      {!siglas && (
        <p className="text-[11px] text-muted-foreground">
          Para comparar la intención de voto hace falta registrar el partido de la candidatura en su
          ficha. Sin eso no se sabe qué opción contar como propia.
        </p>
      )}

      {/* --- Reparto completo de la intención de voto. --- */}
      {segunda.votoRespondido > 0 && (
        <Reparto
          titulo="Intención de voto · después"
          voto={segunda.voto}
          de={segunda.votoRespondido}
        />
      )}
      {primera.votoRespondido > 0 && (
        <Reparto
          titulo="Intención de voto · antes"
          voto={primera.voto}
          de={primera.votoRespondido}
        />
      )}

      {/* --- Lo que dijo la gente. --- */}
      <Menciones titulo="Necesidades del municipio" lista={panorama.necesidadesMunicipio} />
      <Menciones titulo="Necesidades de la entidad" lista={panorama.necesidadesEntidad} />
      <Menciones titulo="Promesas que no les cumplieron" lista={panorama.promesas} />

      <Discurso
        panorama={panorama}
        sectionCode={sectionCode}
        municipio={municipio}
        candidato={candidato}
      />
    </div>
  );
}

function Etapa({ titulo, nota, muestras }: { titulo: string; nota: string; muestras: number }) {
  return (
    <div className="rounded-md border border-border/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{titulo}</p>
      <p className="font-display text-xl font-semibold tabular-nums">
        {fmt(muestras)}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          {muestras === 1 ? "muestra" : "muestras"}
        </span>
      </p>
      <p className="text-[10px] text-muted-foreground">{nota}</p>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  muestras,
}: {
  etiqueta: string;
  valor: number | null;
  muestras: number;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="font-display text-xl font-semibold tabular-nums">
        {valor === null ? "—" : `${valor}%`}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">de {fmt(muestras)}</span>
      </p>
    </div>
  );
}

function Barra({
  etiqueta,
  si,
  de,
  color,
}: {
  etiqueta: string;
  si: number;
  de: number;
  color: string;
}) {
  const p = de > 0 ? Math.round((si / de) * 1000) / 10 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-[46%] shrink-0 truncate text-xs text-muted-foreground">{etiqueta}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: color }} />
      </div>
      <span className="w-[86px] shrink-0 text-right text-xs tabular-nums">
        {p}%{" "}
        <span className="text-muted-foreground">
          ({si}/{de})
        </span>
      </span>
    </div>
  );
}

function Reparto({
  titulo,
  voto,
  de,
}: {
  titulo: string;
  voto: Record<string, number>;
  de: number;
}) {
  const filas = Object.entries(voto).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">{titulo}</p>
      <div className="space-y-1">
        {filas.map(([clave, n]) => (
          <div key={clave} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{
                backgroundColor: PARTIDOS.some((p) => p.siglas === clave)
                  ? colorPartido(clave)
                  : "#9A9A9A",
              }}
            />
            <span className="flex-1 truncate" translate="no">
              {etiquetaVoto(clave)}
            </span>
            <span className="tabular-nums">{n}</span>
            <span className="w-12 text-right tabular-nums text-muted-foreground">
              {Math.round((n / de) * 1000) / 10}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Respuestas abiertas, de la más repetida a la menos. */
function Menciones({
  titulo,
  lista,
}: {
  titulo: string;
  lista: Array<{ texto: string; veces: number }>;
}) {
  const [abierto, setAbierto] = useState(false);
  if (lista.length === 0) return null;
  const visibles = abierto ? lista : lista.slice(0, 4);

  return (
    <div>
      <p className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        {titulo} <span className="normal-case tracking-normal">({lista.length})</span>
      </p>
      <ul className="space-y-1">
        {visibles.map((m) => (
          <li key={m.texto} className="flex items-start gap-2 text-xs">
            <Badge variant="secondary" className="shrink-0 tabular-nums">
              {m.veces}
            </Badge>
            <span className="leading-snug">{m.texto}</span>
          </li>
        ))}
      </ul>
      {lista.length > 4 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          {abierto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {abierto ? "Ver menos" : `Ver las ${lista.length}`}
        </button>
      )}
    </div>
  );
}

/** Discurso para la visita, armado con las respuestas de la primera medición. */
function Discurso({
  panorama,
  sectionCode,
  municipio,
  candidato,
}: {
  panorama: ReturnType<typeof panoramaDe>;
  sectionCode: string;
  municipio: string;
  candidato: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const discurso = useMemo(
    () => generaDiscurso(panorama, { seccion: sectionCode, municipio, candidato }),
    [panorama, sectionCode, municipio, candidato],
  );

  if (!discurso) return null;

  const imprimir = () => {
    const w = window.open("", "_blank", "width=760,height=900");
    if (!w) return;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>${esc(discurso.titulo)}</title>
      <style>
        body{font:15px/1.6 Georgia,serif;max-width:40em;margin:3em auto;padding:0 1.5em;color:#1C1A17}
        h1{font-size:1.3em;border-bottom:2px solid #7A2E2E;padding-bottom:.4em}
        h2{font-size:.78em;text-transform:uppercase;letter-spacing:.09em;color:#6b6b6b;margin-top:2em}
        .eje{margin:1.1em 0;padding-left:1em;border-left:3px solid #C79E5E}
        .dijo{font-style:italic}
        .veces{font-size:.8em;color:#6b6b6b}
        .aviso{background:#FBF3E4;border:1px solid #E0C89B;padding:.8em 1em;font-size:.85em}
        ul{padding-left:1.2em}
      </style></head><body>
      <h1>${esc(discurso.titulo)}</h1>
      ${discurso.advertencia ? `<p class="aviso">${esc(discurso.advertencia)}</p>` : ""}
      <h2>Apertura</h2><p>${esc(discurso.apertura)}</p>
      <h2>Ejes, con lo que dijo la gente</h2>
      ${discurso.ejes
        .map(
          (e) => `<div class="eje">
            <p class="dijo">"${esc(e.necesidad)}"</p>
            <p class="veces">Lo mencionaron ${e.veces} ${e.veces === 1 ? "persona" : "personas"}</p>
            <p>${esc(e.compromiso)}</p>
          </div>`,
        )
        .join("")}
      ${
        discurso.promesasIncumplidas.length
          ? `<h2>Lo que les prometieron y no llegó</h2><ul>${discurso.promesasIncumplidas
              .map((p) => `<li>"${esc(p.texto)}" <span class="veces">(${p.veces})</span></li>`)
              .join("")}</ul>`
          : ""
      }
      <h2>Cierre</h2><p>${esc(discurso.cierre)}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-primary"
        >
          {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Megaphone className="h-4 w-4" />
          Discurso para la visita
        </button>
        <Button size="sm" variant="outline" onClick={imprimir}>
          <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
        </Button>
      </div>

      {abierto && (
        <div className="mt-3 space-y-3 text-sm">
          {discurso.advertencia && (
            <p className="rounded-md bg-muted px-2.5 py-2 text-xs text-destructive">
              {discurso.advertencia}
            </p>
          )}
          <p className="leading-relaxed">{discurso.apertura}</p>

          {discurso.ejes.map((e) => (
            <div key={e.necesidad} className="border-l-2 border-[#C79E5E] pl-3">
              <p className="italic leading-snug">“{e.necesidad}”</p>
              <p className="text-[11px] text-muted-foreground">
                Lo mencionaron {e.veces} {e.veces === 1 ? "persona" : "personas"}
              </p>
              <p className="mt-1 leading-relaxed">{e.compromiso}</p>
            </div>
          ))}

          {discurso.promesasIncumplidas.length > 0 && (
            <div>
              <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                Lo que les prometieron y no llegó
              </p>
              <ul className="space-y-0.5">
                {discurso.promesasIncumplidas.map((p) => (
                  <li key={p.texto} className="text-xs leading-snug">
                    “{p.texto}” <span className="text-muted-foreground">({p.veces})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="leading-relaxed">{discurso.cierre}</p>

          <p className="text-[10px] leading-snug text-muted-foreground">
            Cada eje cita una respuesta de la primera medición tal como se capturó y dice cuántas
            personas la mencionaron. No se añaden temas, cifras ni plazos que no hayan salido de las
            respuestas.
          </p>
        </div>
      )}
    </div>
  );
}
