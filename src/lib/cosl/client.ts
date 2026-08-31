/**
 * Minimal authenticated HTTP client for auction.cosl.org.
 *
 * The COSL auction site is ASP.NET Core Identity + Razor Pages. Login is a
 * cookie flow: GET the login page to obtain the antiforgery cookie + token,
 * POST credentials, then reuse the `.AspNetCore.Identity.Application` cookie.
 *
 * Node's global fetch does not persist cookies, so we keep a tiny cookie jar
 * here. No third-party dependency, no headless browser.
 */

export const COSL_BASE_URL = process.env.COSL_BASE_URL || "https://auction.cosl.org";

const LOGIN_PATH = "/Identity/Account/Login";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export class CoslAuthError extends Error {}

export class CoslSession {
  private jar = new Map<string, string>();

  private cookieHeader(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private storeSetCookies(res: Response): void {
    // undici exposes getSetCookie(); fall back to the single-header getter.
    const headers = res.headers as Headers & { getSetCookie?: () => string[] };
    const single = headers.get("set-cookie");
    const raw: string[] = headers.getSetCookie
      ? headers.getSetCookie()
      : single
      ? [single]
      : [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (value === "" || value === '""') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  /** Fetch against COSL, sending the jar and capturing any Set-Cookie. */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = path.startsWith("http") ? path : `${COSL_BASE_URL}${path}`;
    const headers = new Headers(init.headers);
    headers.set("user-agent", USER_AGENT);
    if (this.jar.size) headers.set("cookie", this.cookieHeader());

    const res = await fetch(url, { ...init, headers, redirect: init.redirect ?? "manual" });
    this.storeSetCookies(res);
    return res;
  }

  get authenticated(): boolean {
    return this.jar.has(".AspNetCore.Identity.Application");
  }
}

function extractVerificationToken(html: string): string | null {
  const m = html.match(
    /name="__RequestVerificationToken"[^>]*\svalue="([^"]+)"/i,
  );
  return m ? m[1] : null;
}

/**
 * Logs into COSL and returns a session carrying the auth cookie.
 * Throws CoslAuthError on bad credentials or an unexpected login response.
 */
export async function coslLogin(email: string, password: string): Promise<CoslSession> {
  if (!email || !password) {
    throw new CoslAuthError("COSL_EMAIL / COSL_PASSWORD not configured");
  }

  const session = new CoslSession();

  // 1. GET the login page -> antiforgery cookie + token
  const pageRes = await session.fetch(LOGIN_PATH, { redirect: "manual" });
  if (!pageRes.ok) {
    throw new CoslAuthError(`login page returned HTTP ${pageRes.status}`);
  }
  const token = extractVerificationToken(await pageRes.text());
  if (!token) throw new CoslAuthError("could not find __RequestVerificationToken on login page");

  // 2. POST credentials
  const form = new URLSearchParams({
    "Input.Email": email,
    "Input.Password": password,
    "Input.RememberMe": "false",
    __RequestVerificationToken: token,
  });
  const loginRes = await session.fetch(LOGIN_PATH, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });

  // Success = a redirect (302/303) away from the login page + the identity cookie.
  const redirected = loginRes.status >= 300 && loginRes.status < 400;
  if (!redirected || !session.authenticated) {
    if (loginRes.status === 200) {
      throw new CoslAuthError("login rejected (invalid credentials or account locked)");
    }
    throw new CoslAuthError(`unexpected login response: HTTP ${loginRes.status}`);
  }

  return session;
}
