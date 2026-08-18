/**
 * Captura las vistas de la aplicación para la documentación.
 *
 * Conduce Chrome por el protocolo DevTools: hace falta inyectar la sesión de
 * Supabase en localStorage antes de navegar, y eso no se puede hacer con las
 * banderas de línea de comandos de un navegador headless.
 *
 * La sesión se obtiene con una cuenta temporal de QA que se crea y se borra
 * dentro de este mismo script.
 *
 * Uso:  bun run scripts/docs/capture-views.ts
 */

import { createClient } from "@supabase/supabase-js";

const PROJECT = "dewnxfapnfheeokfdryg";
const SUPABASE_URL = `https://${PROJECT}.supabase.co`;
const PUBLISHABLE = "sb_publishable_YiLrJO8bm6mqtBvm3m01BA__UPK6juu";
const APP = "http://localhost:8080";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const OUT_DIR = new URL("../../data/docs/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const PORT = 9333;

export interface View {
  slug: string;
  path: string;
  title: string;
  /** Espera extra en ms cuando la vista carga datos pesados. */
  settle?: number;
  /** JS a ejecutar antes de capturar, p. ej. abrir un desplegable. */
  prepare?: string;
}

const VIEWS: View[] = [
  { slug: "dashboard", path: "/dashboard", title: "Dashboard ejecutivo", settle: 3500 },
  {
    slug: "mapa",
    path: "/mapa",
    title: "Mapa territorial",
    // Las teselas del mapa tardan más que los datos; el sondeo de esqueletos no
    // las cubre porque Leaflet no usa Skeleton.
    settle: 6000,
  },
  { slug: "secciones", path: "/secciones", title: "Catálogo de secciones", settle: 3500 },
  { slug: "contactos", path: "/contactos", title: "Contactos", settle: 2500 },
  { slug: "analytics", path: "/analytics", title: "Analytics demográfico", settle: 3500 },
  { slug: "monitor", path: "/monitor", title: "Monitor público", settle: 3000 },
  { slug: "menciones", path: "/menciones", title: "Menciones", settle: 2500 },
  { slug: "reportes", path: "/reportes", title: "Reportes", settle: 2000 },
  { slug: "importar", path: "/importar", title: "Importación de datos", settle: 1500 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------------
// Cliente CDP mínimo sobre WebSocket
// -----------------------------------------------------------------------------
class CDP {
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, (v: unknown) => void>();

  async connect(wsUrl: string) {
    this.ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error(`WebSocket: ${String(e)}`));
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (msg.id !== undefined) {
        const resolve = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        resolve?.(msg.error ? { __error: msg.error.message } : msg.result);
      }
    };
  }

  /**
   * `sessionId` viaja como campo de primer nivel del mensaje, no dentro de
   * `params`: metido en params, Chrome dirige la orden al target del navegador
   * y responde "'Page.captureScreenshot' wasn't found", porque ese dominio solo
   * existe en el target de la página.
   */
  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve as (v: unknown) => void);
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

// -----------------------------------------------------------------------------
async function main() {
  const keysProc = Bun.spawnSync(["cmd", "/c", "supabase", "projects", "api-keys", "--project-ref", PROJECT]);
  const SERVICE = (
    JSON.parse(keysProc.stdout.toString().trim()) as { keys: Array<{ id: string; api_key: string }> }
  ).keys.find((k) => k.id === "service_role")!.api_key;

  const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

  const stamp = Date.now();
  const email = `docs-${stamp}@mayesandigital.com`;
  const password = `Docs-${stamp}-Aa1!`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) throw new Error(`No se pudo crear la cuenta: ${createError?.message}`);
  const uid = created.user.id;

  const { data: org } = await admin.from("organizations").select("id").eq("slug", "zacatecas").single();
  await admin.from("profiles").update({ org_id: org!.id, full_name: "Documentación" }).eq("id", uid);
  await admin.from("user_roles").delete().eq("user_id", uid);
  await admin.from("user_roles").insert({ user_id: uid, org_id: org!.id, role: "ADMIN" });

  let chrome: ReturnType<typeof Bun.spawn> | null = null;
  try {
    // Sesión por API: es lo que se inyecta después en el navegador.
    const sb = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false } });
    const { data: signed, error: signError } = await sb.auth.signInWithPassword({ email, password });
    if (signError || !signed.session) throw new Error(`Sesión: ${signError?.message}`);

    const storageKey = `sb-${PROJECT}-auth-token`;
    const storageValue = JSON.stringify({
      access_token: signed.session.access_token,
      refresh_token: signed.session.refresh_token,
      expires_at: signed.session.expires_at,
      expires_in: signed.session.expires_in,
      token_type: "bearer",
      user: signed.session.user,
    });

    await Bun.write(`${OUT_DIR}.keep`, "");

    chrome = Bun.spawn(
      [
        CHROME,
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${OUT_DIR}chrome-profile`,
        "--window-size=1440,1000",
        "--hide-scrollbars",
        "--force-device-scale-factor=2",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "about:blank",
      ],
      { stdout: "ignore", stderr: "ignore" },
    );

    // Esperar a que el puerto de depuración responda.
    let wsUrl = "";
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        wsUrl = ((await res.json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl;
        if (wsUrl) break;
      } catch {
        /* aún no levanta */
      }
    }
    if (!wsUrl) throw new Error("Chrome no expuso el puerto de depuración");

    const browser = new CDP();
    await browser.connect(wsUrl);

    const { targetId } = await browser.send<{ targetId: string }>("Target.createTarget", {
      url: "about:blank",
    });
    const { sessionId } = await browser.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    // Con `flatten` cada mensaje lleva su sessionId; se envuelve para no repetirlo.
    const page = {
      send: <T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}) =>
        browser.send<T>(method, params, sessionId),
    };

    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 2,
      mobile: false,
    });

    // Primero el origen, para poder escribir en su localStorage.
    await page.send("Page.navigate", { url: `${APP}/auth` });
    await sleep(3000);
    await page.send("Runtime.evaluate", {
      expression: `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(storageValue)}); true;`,
    });

    const captured: Array<{ slug: string; title: string; file: string }> = [];

    /**
     * Espera a que desaparezcan los esqueletos de carga.
     *
     * Un tiempo fijo no sirve: el dashboard resuelve 1,828 secciones y tarda
     * mucho más que la vista de reportes. Se sondea el DOM porque es la señal
     * real de que los datos llegaron, y así ninguna captura sale en blanco.
     */
    const waitForData = async (maxMs = 40000) => {
      const started = Date.now();
      while (Date.now() - started < maxMs) {
        const res = await page.send<{ result?: { value?: number } }>("Runtime.evaluate", {
          expression: "document.querySelectorAll('.animate-pulse').length",
          returnByValue: true,
        });
        if (res.result?.value === 0) return true;
        await sleep(700);
      }
      return false;
    };

    for (const view of VIEWS) {
      await page.send("Page.navigate", { url: `${APP}${view.path}` });
      await sleep(1500);
      const ready = await waitForData();
      if (!ready) console.log(`  … ${view.slug}: seguía cargando al agotar la espera`);
      // Margen para que Recharts termine de animar las series.
      await sleep(view.settle ?? 1500);

      if (view.prepare) {
        await page.send("Runtime.evaluate", { expression: view.prepare });
        await sleep(1500);
      }

      const shot = await page.send<{ data?: string; __error?: string }>("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      if (!shot.data) {
        console.log(`  ✗ ${view.slug}: ${shot.__error ?? "sin datos"}`);
        continue;
      }

      const file = `${OUT_DIR}${view.slug}.png`;
      await Bun.write(file, Buffer.from(shot.data, "base64"));
      const size = (await Bun.file(file).size) / 1024;
      console.log(`  ✓ ${view.slug.padEnd(12)} ${size.toFixed(0).padStart(5)} KB  ${view.title}`);
      captured.push({ slug: view.slug, title: view.title, file });
    }

    await Bun.write(`${OUT_DIR}manifest.json`, JSON.stringify(captured, null, 2));
    console.log(`\n${captured.length}/${VIEWS.length} vistas capturadas en ${OUT_DIR}`);
    browser.close();
  } finally {
    chrome?.kill();
    await admin.auth.admin.deleteUser(uid);
    console.log("cuenta temporal eliminada");
  }
}

await main();
