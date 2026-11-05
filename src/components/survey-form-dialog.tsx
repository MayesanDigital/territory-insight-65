import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { surveyService, VOTO_OTRO, type SurveyEtapa } from "@/services/surveyService";
import { PARTIDOS } from "@/services/strategyService";
import { useAuth } from "@/hooks/useAuth";
import {
  emptyMedicion,
  emptyResultados,
  medicionSchema,
  resultadosSchema,
  type MedicionFormValues,
  type ResultadosFormValues,
} from "@/lib/validation";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  etapa: SurveyEtapa;
  sectionCode: string;
  municipio: string;
  /** Nombre del candidato, para preguntar por él con su nombre y no en abstracto. */
  candidato: string | null;
}

/** Opciones de intención de voto: catálogo de partidos más las no-respuestas. */
function OpcionesVoto() {
  return (
    <SelectContent>
      {PARTIDOS.map((p) => (
        <SelectItem key={p.siglas} value={p.siglas}>
          <span translate="no">{p.nombre}</span>
        </SelectItem>
      ))}
      {Object.entries(VOTO_OTRO).map(([clave, etiqueta]) => (
        <SelectItem key={clave} value={clave}>
          {etiqueta}
        </SelectItem>
      ))}
    </SelectContent>
  );
}

export function SurveyFormDialog({
  open,
  onOpenChange,
  etapa,
  sectionCode,
  municipio,
  candidato,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        {etapa === "medicion" ? (
          <FormularioMedicion
            sectionCode={sectionCode}
            municipio={municipio}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <FormularioResultados
            sectionCode={sectionCode}
            municipio={municipio}
            candidato={candidato}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Texto que acompaña a las dos cabeceras. */
function Encabezado({
  titulo,
  descripcion,
  sectionCode,
  municipio,
}: {
  titulo: string;
  descripcion: string;
  sectionCode: string;
  municipio: string;
}) {
  return (
    <DialogHeader>
      <DialogTitle>{titulo}</DialogTitle>
      <DialogDescription>
        Sección {sectionCode} · {municipio}. {descripcion}
      </DialogDescription>
    </DialogHeader>
  );
}

function FormularioMedicion({
  sectionCode,
  municipio,
  onDone,
}: {
  sectionCode: string;
  municipio: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();

  const form = useForm<MedicionFormValues>({
    resolver: zodResolver(medicionSchema),
    defaultValues: emptyMedicion,
  });

  // Limpiar al cambiar de sección: arrastrar la respuesta anterior sería
  // atribuirle a esta sección lo que dijo alguien de otra.
  useEffect(() => {
    form.reset(emptyMedicion);
  }, [sectionCode, form]);

  const guardar = useMutation({
    mutationFn: async (v: MedicionFormValues) => {
      if (!orgId) throw new Error("Sin organización activa");
      await surveyService.add({
        org_id: orgId,
        section_code: sectionCode,
        etapa: "medicion",
        nombre: v.nombre.trim() || null,
        voto_partido: v.voto_partido,
        voto_detalle: v.voto_detalle.trim() || null,
        promesas_incumplidas: v.promesas_incumplidas.trim(),
        necesidad_entidad: v.necesidad_entidad.trim(),
        necesidad_municipio: v.necesidad_municipio.trim(),
        created_by: user?.id ?? null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["encuestas"] });
      toast.success("Muestra registrada");
      form.reset(emptyMedicion);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar la muestra"),
  });

  return (
    <>
      <Encabezado
        titulo="Primera medición"
        descripcion="Se levanta antes de la visita del candidato: mide el punto de partida y recoge lo que la gente dice que necesita."
        sectionCode={sectionCode}
        municipio={municipio}
      />

      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => guardar.mutate(v))}>
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Puede dejarse en blanco" {...field} />
                </FormControl>
                <FormDescription>
                  No hace falta para el porcentaje: lo que se pregunta sin nombre se contesta con
                  más franqueza.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="voto_partido"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Por qué candidato votaría usted?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elige una opción" />
                    </SelectTrigger>
                  </FormControl>
                  <OpcionesVoto />
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="voto_detalle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Dio un nombre? (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre del candidato que mencionó" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="promesas_incumplidas"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  ¿Cuáles son las promesas que todos los candidatos le hacen y no cumplen?
                </FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Con sus palabras, tal como lo dijo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="necesidad_entidad"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Cuál es la necesidad que usted nota en su entidad?</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Con sus palabras, tal como lo dijo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="necesidad_municipio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Qué cree usted que necesita el municipio para mejorar?</FormLabel>
                <FormControl>
                  <Textarea rows={3} placeholder="Con sus palabras, tal como lo dijo" {...field} />
                </FormControl>
                <FormDescription>
                  De estas respuestas sale el discurso de la visita, así que conviene no resumirlas.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Registrar muestra"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}

function FormularioResultados({
  sectionCode,
  municipio,
  candidato,
  onDone,
}: {
  sectionCode: string;
  municipio: string;
  candidato: string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();
  // Respaldo neutro: un nombre no dice el género de nadie.
  const quien = candidato?.trim() || "la candidatura";

  const form = useForm<ResultadosFormValues>({
    resolver: zodResolver(resultadosSchema),
    defaultValues: emptyResultados,
  });

  useEffect(() => {
    form.reset(emptyResultados);
  }, [sectionCode, form]);

  const guardar = useMutation({
    mutationFn: async (v: ResultadosFormValues) => {
      if (!orgId) throw new Error("Sin organización activa");
      await surveyService.add({
        org_id: orgId,
        section_code: sectionCode,
        etapa: "resultados",
        nombre: v.nombre.trim() || null,
        conoce_candidato: v.conoce_candidato === "si",
        cree_cambio: v.cree_cambio === "si",
        votaria_por_el: v.votaria_por_el === "si",
        voto_partido: v.voto_partido,
        voto_detalle: v.voto_detalle.trim() || null,
        created_by: user?.id ?? null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["encuestas"] });
      toast.success("Muestra registrada");
      form.reset(emptyResultados);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar la muestra"),
  });

  /** Pregunta de sí/no. Sin valor por omisión: premarcar una inventa la respuesta. */
  const siNo = (name: "conoce_candidato" | "cree_cambio" | "votaria_por_el", pregunta: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{pregunta}</FormLabel>
          <FormControl>
            <RadioGroup
              className="flex gap-6"
              onValueChange={field.onChange}
              value={field.value ?? ""}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="si" id={`${name}-si`} />
                <Label htmlFor={`${name}-si`} className="font-normal">
                  Sí
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="no" id={`${name}-no`} />
                <Label htmlFor={`${name}-no`} className="font-normal">
                  No
                </Label>
              </div>
            </RadioGroup>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <>
      <Encabezado
        titulo="Resultados"
        descripcion="Se levanta dos días después de la visita: mide si la visita movió el conocimiento y la aceptación del candidato."
        sectionCode={sectionCode}
        municipio={municipio}
      />

      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => guardar.mutate(v))}>
          <FormField
            control={form.control}
            name="nombre"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Puede dejarse en blanco" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {siNo("conoce_candidato", `¿Conoce usted a ${quien}?`)}
          {siNo("cree_cambio", "¿Cree que puede hacer un cambio?")}
          {siNo("votaria_por_el", `¿Votaría por ${quien}?`)}

          <FormField
            control={form.control}
            name="voto_partido"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Por cuál candidato o partido votaría?</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elige una opción" />
                    </SelectTrigger>
                  </FormControl>
                  <OpcionesVoto />
                </Select>
                <FormDescription>
                  Es la misma pregunta de la primera medición: es lo que permite comparar las dos.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="voto_detalle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Dio un nombre? (opcional)</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre del candidato que mencionó" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending ? "Guardando…" : "Registrar muestra"}
            </Button>
          </DialogFooter>
        </form>
      </Form>
    </>
  );
}
