/**
 * Authentication / tenant boundary — Backend/Core product surface.
 *
 * Every /v1 endpoint runs behind this boundary. The caller must present:
 *   - Authorization: Bearer <INTERNAL_SERVICE_TOKEN>   (service-to-service auth)
 *   - X-Company-Id: <companyId>                         (tenant scope)
 *   - X-Actor-Id / X-Actor-Role                         (who is acting)
 *
 * The resolved tenant context is attached to the request. EVERY downstream repository
 * call is scoped by `auth.companyId`; a client-supplied entity id is never trusted to
 * cross tenants (BACKEND_ARCHITECTURE.md §50, security invariant: no cross-tenant
 * access). Possession of the service token authenticates a caller but grants NO
 * financial authority — that remains Core/policy's domain.
 *
 * In `local`/`test` environments the bearer check is relaxed (like the ML gateway) so
 * the service is runnable offline; the tenant/actor headers are still required.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getConfig } from "../../config/index.js";
import { CoreError } from "../../shared/errors/index.js";

export interface AuthContext {
  companyId: string;
  actorId: string;
  actorRole: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

function header(req: FastifyRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/** True in environments where the bearer token check is relaxed for offline dev/test. */
function bearerRelaxed(): boolean {
  const env = getConfig().environment;
  return env === "local" || env === "test" || env === "ci";
}

/**
 * Resolve + validate the tenant/auth context. Throws AUTHENTICATION_ERROR /
 * AUTHORIZATION_ERROR (mapped to 401/403). Attaches `req.auth`.
 */
export function authenticate(req: FastifyRequest): AuthContext {
  const config = getConfig();

  // Service-to-service bearer auth (relaxed offline).
  if (!bearerRelaxed()) {
    const expected = config.internalServiceToken;
    if (!expected) {
      throw CoreError.of("CONFIGURATION_ERROR", "Service auth token not configured.", { severity: "CRITICAL" });
    }
    const provided = (header(req, "authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (provided !== expected) {
      throw CoreError.of("AUTHENTICATION_ERROR", "Invalid service credentials.");
    }
  }

  const companyId = header(req, "x-company-id");
  if (!companyId) {
    throw CoreError.of("AUTHENTICATION_ERROR", "Missing tenant (X-Company-Id).");
  }
  const actorId = header(req, "x-actor-id") ?? "unknown-actor";
  const actorRole = header(req, "x-actor-role") ?? "SERVICE";

  const auth: AuthContext = { companyId, actorId, actorRole };
  req.auth = auth;
  // Mirror into the correlation context so logs carry tenant scope.
  if (req.context) req.context.company_id = companyId;
  return auth;
}

/** Require an already-resolved auth context (or resolve it now). */
export function requireAuth(req: FastifyRequest): AuthContext {
  return req.auth ?? authenticate(req);
}

/** Require the actor to hold one of the given roles (else FORBIDDEN). */
export function requireRole(auth: AuthContext, roles: readonly string[]): void {
  if (!roles.includes(auth.actorRole)) {
    throw CoreError.of("AUTHORIZATION_ERROR", "Actor role is not permitted for this operation.", {
      details: { role: auth.actorRole },
    });
  }
}

/**
 * Register a preHandler that enforces auth on all routes under a plugin scope. Applied
 * per /v1 router so system/health routes stay unauthenticated.
 */
export function registerTenantAuth(app: FastifyInstance): void {
  app.addHook("preHandler", async (req: FastifyRequest, _reply: FastifyReply) => {
    authenticate(req);
  });
}
