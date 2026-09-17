/**
 * Propone la escritura correcta de un nombre mal tecleado.
 *
 * Buscar "aridna montiel" devolvió 4 menciones; "Ariadna Montiel", 93. Las
 * fuentes sí traían a la persona —sus titulares venían en la respuesta— pero el
 * filtro las descartaba porque el nombre buscado no aparecía literalmente. Sin
 * un aviso, eso se lee como "no se habla de ella", que es la conclusión opuesta.
 *
 * Se compara el término con los pares de palabras de los titulares que
 * devolvieron las fuentes: si alguno se parece lo bastante y aparece muchas
 * veces, es la escritura buena.
 */

/** Minúsculas y sin acentos, para que "José" y "jose" se comparen igual. */
export function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Cuántas letras hay que cambiar para pasar de una palabra a otra. */
export function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(
        (actual[j - 1] ?? 0) + 1,
        (previa[j] ?? 0) + 1,
        (previa[j - 1] ?? 0) + coste,
      );
    }
    previa = actual;
  }
  return previa[b.length] ?? Math.max(a.length, b.length);
}

/** Tolerancia por longitud: en palabras cortas un error de más ya es otra palabra. */
function margen(palabra: string): number {
  if (palabra.length <= 4) return 1;
  if (palabra.length <= 8) return 2;
  return 3;
}

const PALABRA = /[\p{L}\p{M}]{2,}/gu;

export interface Sugerencia {
  /** Escritura propuesta, tal como aparece en los titulares. */
  termino: string;
  /** Cuántos titulares la traen. */
  apariciones: number;
}

/**
 * Busca una escritura mejor del término entre los titulares recibidos.
 *
 * Devuelve null cuando no hay nada parecido, cuando lo parecido aparece una sola
 * vez —un titular suelto no basta para corregir a nadie— o cuando la propia
 * escritura del usuario es la más frecuente.
 */
export function sugiereTermino(termino: string, titulares: string[]): Sugerencia | null {
  const buscadas = normaliza(termino).match(PALABRA);
  if (!buscadas || buscadas.length < 2) return null;

  const candidatos = new Map<string, { original: string; apariciones: number }>();

  for (const titular of titulares) {
    const original = titular.match(PALABRA);
    if (!original) continue;
    const plano = original.map(normaliza);

    // Ventana del mismo tamaño que el término buscado: "nombre apellido".
    for (let i = 0; i + buscadas.length <= plano.length; i++) {
      const ventana = plano.slice(i, i + buscadas.length);
      let total = 0;
      const cabe = ventana.every((palabra, j) => {
        const objetivo = buscadas[j] ?? "";
        const d = distancia(palabra, objetivo);
        total += d;
        return d <= margen(objetivo);
      });
      // `total === 0` es la escritura del usuario: no hay nada que sugerir.
      if (!cabe || total === 0) continue;

      const clave = ventana.join(" ");
      const previo = candidatos.get(clave);
      if (previo) previo.apariciones++;
      else candidatos.set(clave, { original: original.slice(i, i + buscadas.length).join(" "), apariciones: 1 });
    }
  }

  const propias = titulares.filter((t) => normaliza(t).includes(buscadas.join(" "))).length;

  const mejor = [...candidatos.values()].sort((a, b) => b.apariciones - a.apariciones)[0];
  if (!mejor || mejor.apariciones < 2 || mejor.apariciones <= propias) return null;

  return { termino: mejor.original, apariciones: mejor.apariciones };
}
