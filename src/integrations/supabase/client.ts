// Cliente de Supabase del navegador.
//
// Nació generado por la plataforma que armó el proyecto; se conserva su forma,
// pero ya se edita a mano: aquí vive el reintento por sesión caducada.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

/**
 * Renovación de sesión compartida.
 *
 * Al volver a una pestaña que llevaba horas abierta, varias consultas salen a la
 * vez con el token ya vencido. Sin esto, cada una pediría su propia renovación y
 * todas menos la primera fallarían: el token de refresco se consume al usarse.
 */
let renovacionEnCurso: Promise<boolean> | null = null;

function renuevaSesion(client: () => SupabaseClient<Database>): Promise<boolean> {
  renovacionEnCurso ??= client()
    .auth.refreshSession()
    .then(({ data, error }) => !error && !!data.session)
    .catch(() => false)
    .finally(() => {
      renovacionEnCurso = null;
    });
  return renovacionEnCurso;
}

/** La respuesta dice que el token expiró o dejó de ser válido. */
async function esSesionCaducada(res: Response): Promise<boolean> {
  if (res.status !== 401 && res.status !== 403) return false;
  try {
    const texto = await res.clone().text();
    return /JWT expired|PGRST30[13]|invalid claim|token is expired/i.test(texto);
  } catch {
    return res.status === 401;
  }
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    // Las llamadas a /auth/v1 quedan fuera del reintento: renovar la sesión es
    // justamente una de ellas y se entraría en bucle.
    const reintentable = !url.includes('/auth/v1/');

    return fetch(input, { ...init, headers }).then(async (res) => {
      if (!reintentable || !(await esSesionCaducada(res))) return res;

      // Sesión vencida: se renueva una sola vez y se repite la consulta con el
      // token nuevo. Antes, la pantalla se quedaba con "JWT expired" hasta que
      // alguien recargaba a mano.
      const renovada = await renuevaSesion(() => supabase);
      if (!renovada) {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
          await supabase.auth.signOut().catch(() => undefined);
          window.location.assign('/auth');
        }
        return res;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers.set('Authorization', `Bearer ${data.session.access_token}`);
      }
      return fetch(input, { ...init, headers });
    });
  };
}


function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const SUPABASE_URL = import.meta.env['VITE_SUPABASE_URL'] || process.env['SUPABASE_URL'];
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || process.env['SUPABASE_PUBLISHABLE_KEY'];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Revisa el archivo .env en local o las variables de entorno del proyecto en Vercel.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
    },
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

