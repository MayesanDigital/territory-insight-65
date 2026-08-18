import { z } from "zod";

/**
 * Esquemas de validación compartidos.
 *
 * Duplican a propósito las restricciones que ya impone la base de datos
 * (edad 18–120, consentimiento obligatorio). La base es la autoridad real —RLS
 * y CHECK no se pueden esquivar desde el cliente—, pero repetirlas aquí
 * convierte un error 400 críptico en un mensaje junto al campo equivocado.
 */

/**
 * Teléfono mexicano: 10 dígitos, con lada internacional opcional.
 * Se valida sobre los dígitos, no sobre el formato, para aceptar
 * "492 123 4567", "(492) 123-4567" y "+52 492 123 4567" por igual.
 */
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 13;

export const digitsOnly = (value: string) => value.replace(/\D/g, "");

const tieneDigitosValidos = (v: string) => {
  const d = digitsOnly(v);
  return d.length >= PHONE_MIN_DIGITS && d.length <= PHONE_MAX_DIGITS;
};

/** Versión opcional, para formularios donde el teléfono no se exige. */
export const phoneSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || tieneDigitosValidos(v), {
    message: "Debe tener 10 dígitos (la lada +52 es opcional)",
  });

export const GENEROS = ["femenino", "masculino", "no_especificado"] as const;

/** Clasificación de seguimiento del contacto. Coincide con el CHECK de la base. */
export const CATEGORIAS = ["fidelizado", "seguro"] as const;

export const CATEGORIA_ETIQUETA: Record<(typeof CATEGORIAS)[number], string> = {
  fidelizado: "Fidelizado",
  seguro: "Seguro",
};

/**
 * Campo de selección obligatorio. Arranca vacío para que la persona que captura
 * elija de forma consciente en lugar de aceptar un valor por defecto.
 */
const seleccionObligatoria = (opciones: readonly string[], mensaje: string) =>
  z.string().refine((v) => opciones.includes(v), { message: mensaje });

export const contactSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede exceder 120 caracteres"),

  age: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), { message: "La edad debe ser un número entero" })
    .refine(
      (v) => {
        if (v === "") return true;
        const n = Number(v);
        return n >= 18 && n <= 120;
      },
      // El mínimo de 18 no es arbitrario: registrar datos personales de menores
      // exige consentimiento de quien ejerce la patria potestad, que esta
      // plataforma no recaba. La base lo impone con un CHECK.
      { message: "Solo se registran personas mayores de edad (18 a 120)" },
    ),

  gender: seleccionObligatoria(GENEROS, "Selecciona el género"),

  category: seleccionObligatoria(CATEGORIAS, "Selecciona la categoría"),

  phone: z
    .string()
    .trim()
    .min(1, "El teléfono es obligatorio")
    .refine(tieneDigitosValidos, {
      message: "Debe tener 10 dígitos (la lada +52 es opcional)",
    }),

  address: z
    .string()
    .trim()
    .min(5, "La dirección debe tener al menos 5 caracteres")
    .max(200, "La dirección no puede exceder 200 caracteres"),

  municipio: z.string().trim().min(1, "El municipio es obligatorio").max(120),

  section_code: z
    .string()
    .trim()
    .min(1, "La sección es obligatoria")
    .refine((v) => /^\d{1,5}$/.test(v), {
      message: "La sección se compone solo de dígitos",
    }),

  notes: z.string().trim().max(500, "Las notas no pueden exceder 500 caracteres"),

  // Viene premarcado porque el consentimiento se recaba antes de la captura.
  // Sigue siendo obligatorio: la base lo impone con un CHECK y no se puede
  // guardar un contacto sin él.
  consent_storage: z.boolean().refine((v) => v === true, {
    message: "Sin consentimiento no se pueden almacenar datos personales",
  }),

  consent_comms: z.boolean(),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

export const emptyContact: ContactFormValues = {
  full_name: "",
  age: "",
  // Género y categoría arrancan vacíos: son obligatorios y deben elegirse.
  gender: "",
  category: "",
  phone: "",
  address: "",
  municipio: "",
  section_code: "",
  notes: "",
  consent_storage: true,
  consent_comms: true,
};

/** Normaliza el teléfono antes de guardarlo, para que no convivan formatos. */
export function normalizePhone(value: string): string | null {
  const d = digitsOnly(value);
  if (d.length === 0) return null;
  if (d.length === PHONE_MIN_DIGITS) return d;
  // Con lada, se conserva tal cual para no perder información del país.
  return d;
}
