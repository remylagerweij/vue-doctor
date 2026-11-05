/**
 * Authentication vocabulary of Nuxt server code, shared by `auth-missing`, `csrf-on-mutating-routes`
 * and the project pre-scan that finds the auth helpers in `server/utils` (utils/server-project-facts.ts).
 */

/** Functions that read the cookie-backed session of h3, nuxt-auth-utils, @nuxtjs/supabase and @sidebase/nuxt-auth. */
export const COOKIE_SESSION_FUNCTIONS: readonly string[] = [
  "serverSupabaseUser",
  "serverSupabaseClient",
  "serverSupabaseSession",
  "getUserSession",
  "requireUserSession",
  "getServerSession",
  "getToken",
  "useSession",
  "getSession",
  "getCookie",
  "parseCookies",
];

/** `requireAdmin`, `ensureAdmin`, `assertOrgMember`, `requirePlatformOperator`: a project guard by naming convention. */
export const AUTH_HELPER_NAME =
  /^(?:require|ensure|assert|verify|check|must)(?:[A-Z]\w*)?(?:Admin|Auth|User|Session|Operator|Org|Member|Role|Permission|Owner)/;
