import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  FileCheck2,
  Columns3,
  Eye,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseImportFile,
  suggestMapping,
  validateRows,
  TARGET_FIELDS,
  type ParsedFile,
  type TargetField,
  type ValidationReport,
} from "@/lib/import-parsers";
import { territoryService, type ImportResult } from "@/services/territoryService";
import { exportCSV, stamped } from "@/lib/export";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({
    meta: [
      { title: "Importar datos | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Asistente de importación territorial: CSV, JSON y GeoJSON con mapeo de columnas, validación y reporte de resultados.",
      },
      { property: "og:title", content: "Importar datos | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Carga secciones territoriales con validación previa y control de duplicados.",
      },
    ],
  }),
  component: ImportarPage,
});

const STEPS = [
  { n: 1, label: "Archivo", icon: Upload },
  { n: 2, label: "Columnas", icon: FileCheck2 },
  { n: 3, label: "Mapeo", icon: Columns3 },
  { n: 4, label: "Preview", icon: Eye },
  { n: 5, label: "Validación", icon: ShieldCheck },
  { n: 6, label: "Importación", icon: Loader2 },
  { n: 7, label: "Reporte", icon: CheckCircle2 },
] as const;

const NONE = "__none__";

function ImportarPage() {
  const qc = useQueryClient();
  const { canAdmin } = useAuth();

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<TargetField, string>>>({});
  const [source, setSource] = useState("manual");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep(1);
    setFile(null);
    setParsed(null);
    setMapping({});
    setReport(null);
    setResult(null);
    setProgress(0);
    setError(null);
  };

  // --- Paso 1: leer el archivo
  const onFile = async (selected: File) => {
    setError(null);
    setBusy(true);
    try {
      const result = await parseImportFile(selected);
      setFile(selected);
      setParsed(result);
      setMapping(suggestMapping(result.columns));
      setStep(2);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  // --- Paso 5: validar
  const runValidation = () => {
    if (!parsed) return;
    setReport(validateRows(parsed.rows, mapping, parsed.geometries));
    setStep(5);
  };

  // --- Paso 6: importar
  const runImport = async () => {
    if (!report) return;
    setBusy(true);
    setStep(6);
    setProgress(0);
    setError(null);
    try {
      const outcome = await territoryService.importUnits(
        report.prepared as never,
        { source, year: Number(year) },
        (done, total) => setProgress(Math.round((done / total) * 100)),
      );
      setResult(outcome);
      qc.invalidateQueries({ queryKey: ["units"] });
      qc.invalidateQueries({ queryKey: ["municipios"] });
      setStep(7);
      if (outcome.failed > 0) toast.warning(`${outcome.imported} importadas, ${outcome.failed} con error`);
      else toast.success(`${outcome.imported} secciones importadas`);
    } catch (e) {
      setError(e);
      setStep(5);
    } finally {
      setBusy(false);
    }
  };

  const missingRequired = useMemo(
    () => TARGET_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label),
    [mapping],
  );

  const preview = useMemo(() => {
    if (!parsed) return [];
    return validateRows(parsed.rows.slice(0, 8), mapping, new Map()).prepared;
  }, [parsed, mapping]);

  if (!canAdmin) {
    return (
      <>
        <PageHeader title="Importar datos" description="Carga de datos territoriales." />
        <ErrorState
          error={new Error("Se requiere rol de administrador para importar territorio.")}
          what="el importador"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Importar datos territoriales"
        description="Admite CSV, JSON y GeoJSON. Los datos se validan antes de tocar la base y nada se escribe hasta el último paso."
        actions={
          step > 1 ? (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" /> Empezar de nuevo
            </Button>
          ) : null
        }
      />

      {/* Indicador de pasos */}
      <div className="mb-6 flex flex-wrap items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ${
                step === s.n
                  ? "bg-primary text-primary-foreground"
                  : step > s.n
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
              }`}
            >
              <span className="tabular-nums">{s.n}</span>
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
          </div>
        ))}
      </div>

      {error != null && (
        <div className="mb-4">
          <ErrorState error={error} what="el archivo" compact />
        </div>
      )}

      {/* Paso 1 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Selecciona el archivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              accept=".csv,.json,.geojson"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Formatos admitidos</p>
              <p>
                <strong>CSV</strong> — una fila por sección, con encabezados. Acepta coma o punto y
                coma como separador.
              </p>
              <p>
                <strong>GeoJSON</strong> — un <code>FeatureCollection</code>; las propiedades de cada
                feature se usan como columnas y su geometría se guarda para el mapa.
              </p>
              <p>
                <strong>JSON</strong> — un arreglo de objetos planos.
              </p>
            </div>
            {busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Leyendo archivo…
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Paso 2 */}
      {step === 2 && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Columnas detectadas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="secondary">{file?.name}</Badge>
              <Badge variant="outline">{parsed.format.toUpperCase()}</Badge>
              <Badge variant="outline">{parsed.rows.length} filas</Badge>
              <Badge variant="outline">{parsed.columns.length} columnas</Badge>
              {parsed.geometries.size > 0 && (
                <Badge>{parsed.geometries.size} geometrías válidas</Badge>
              )}
            </div>

            {parsed.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                <p className="mb-1 flex items-center gap-1 font-medium">
                  <AlertTriangle className="h-3 w-3" /> {parsed.warnings.length} advertencias
                </p>
                {parsed.warnings.slice(0, 5).map((w) => (
                  <p key={w} className="text-muted-foreground">
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {parsed.columns.map((c) => (
                <span key={c} className="rounded border border-border px-2 py-1 text-xs">
                  {c}
                </span>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
              </Button>
              <Button onClick={() => setStep(3)}>
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 3 */}
      {step === 3 && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Mapeo de columnas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Propuesto automáticamente a partir de los nombres. Revisa y corrige lo que haga falta.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {TARGET_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs">
                    {f.label}
                    {f.required && <span className="ml-1 text-destructive">*</span>}
                  </Label>
                  <Select
                    value={mapping[f.key] ?? NONE}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v === NONE ? undefined : v }))
                    }
                  >
                    <SelectTrigger className={f.required && !mapping[f.key] ? "border-destructive" : ""}>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      <SelectItem value={NONE}>Sin asignar</SelectItem>
                      {parsed.columns.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Fuente del dato</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} maxLength={40} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Año de referencia</Label>
                <Input
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Fuente y año identifican esta carga. Importar el mismo territorio con otro año conserva
              ambas versiones en lugar de sustituirlas.
            </p>

            {missingRequired.length > 0 && (
              <p className="text-sm text-destructive">
                Falta asignar: {missingRequired.join(", ")}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
              </Button>
              <Button onClick={() => setStep(4)} disabled={missingRequired.length > 0}>
                Ver preview <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 4 */}
      {step === 4 && parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">4. Preview</CardTitle>
            <p className="text-sm text-muted-foreground">
              Primeras filas ya transformadas. Comprueba que los valores caigan donde deben.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sección</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead className="text-right">Población</TableHead>
                    <TableHead className="text-right">0–17</TableHead>
                    <TableHead className="text-right">60+</TableHead>
                    <TableHead className="text-right">Mujeres</TableHead>
                    <TableHead className="text-right">Hombres</TableHead>
                    <TableHead>Geometría</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium tabular-nums">
                        {String(r["section_code"])}
                      </TableCell>
                      <TableCell>{String(r["municipio"])}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r["population"]).toLocaleString("es-MX")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{String(r["age_0_17"])}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {String(r["age_60_plus"])}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {String(r["gender_female"])}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {String(r["gender_male"])}
                      </TableCell>
                      <TableCell>
                        {parsed.geometries.size > 0 ? (
                          <Badge variant="secondary">sí</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Ajustar mapeo
              </Button>
              <Button onClick={runValidation}>
                Validar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 5 */}
      {step === 5 && report && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5. Validación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Procesadas" value={report.total} />
              <Stat label="Válidas" value={report.valid} tone="ok" />
              <Stat label="Rechazadas" value={report.rejected} tone={report.rejected ? "bad" : undefined} />
              <Stat label="Duplicadas" value={report.duplicates} tone={report.duplicates ? "warn" : undefined} />
            </div>

            {report.issues.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Fila</TableHead>
                      <TableHead className="w-32">Campo</TableHead>
                      <TableHead>Problema</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.issues.slice(0, 200).map((issue, i) => (
                      <TableRow key={i}>
                        <TableCell className="tabular-nums">{issue.row}</TableCell>
                        <TableCell className="text-xs">{issue.field}</TableCell>
                        <TableCell className="text-xs">
                          <Badge
                            variant={issue.severity === "error" ? "destructive" : "secondary"}
                            className="mr-2"
                          >
                            {issue.severity === "error" ? "Error" : "Aviso"}
                          </Badge>
                          {issue.message}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {report.valid === 0 && (
              <p className="text-sm text-destructive">
                Ninguna fila pasó la validación. Revisa el mapeo antes de continuar.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(4)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Atrás
              </Button>
              {report.issues.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    exportCSV(
                      stamped("errores-importacion"),
                      report.issues.map((i) => ({
                        Fila: i.row,
                        Campo: i.field,
                        Severidad: i.severity,
                        Problema: i.message,
                      })),
                    )
                  }
                >
                  Descargar incidencias
                </Button>
              )}
              <Button onClick={runImport} disabled={report.valid === 0 || busy}>
                Importar {report.valid} secciones
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 6 */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">6. Importando…</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">
              {progress}% · No cierres esta pestaña hasta que termine.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Paso 7 */}
      {step === 7 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary" /> 7. Reporte de importación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="Procesados" value={result.processed} />
              <Stat label="Importados" value={result.imported} tone="ok" />
              <Stat label="Con error" value={result.failed} tone={result.failed ? "bad" : undefined} />
              <Stat label="Duplicados en archivo" value={report?.duplicates ?? 0} />
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Fila</TableHead>
                      <TableHead className="w-24">Sección</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.errors.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="tabular-nums">{e.row}</TableCell>
                        <TableCell className="tabular-nums">{e.section}</TableCell>
                        <TableCell className="text-xs">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {result.errors.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    exportCSV(
                      stamped("errores-importacion"),
                      result.errors.map((e) => ({
                        Fila: e.row,
                        Sección: e.section,
                        Error: e.message,
                      })),
                    )
                  }
                >
                  Descargar errores
                </Button>
              )}
              <Button onClick={reset}>Importar otro archivo</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "bad" | "warn" | undefined;
}) {
  const color =
    tone === "ok"
      ? "text-primary"
      : tone === "bad"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-600"
          : "";
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${color}`}>
        {value.toLocaleString("es-MX")}
      </p>
    </div>
  );
}
