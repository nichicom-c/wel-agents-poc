import { textField } from "./chat-session.ts";

export { deriveRuntimeSessionId } from "./chat-session.ts";

const DEFAULT_USER_ID_CLAIM = "sub";
const DEFAULT_ACTOR_CLAIM = "sub";
export type JwtClaims = Record<string, unknown>;

export type AuthenticatedUserContext = {
  actorId: string;
  displayName?: string;
  userId: string;
};

export type AuthClaimOptions = {
  actorClaim?: string;
  userIdClaim?: string;
};

export function authContextFromJwtClaims(
  claims: JwtClaims,
  options: AuthClaimOptions = {},
): AuthenticatedUserContext | undefined {
  const userId = textField(
    claims[options.userIdClaim ?? DEFAULT_USER_ID_CLAIM],
  );

  if (!userId) {
    return undefined;
  }

  const actorSource =
    textField(claims[options.actorClaim ?? DEFAULT_ACTOR_CLAIM]) || userId;
  const displayName =
    textField(claims.email) || textField(claims.preferred_username);

  return {
    actorId: toActorId(actorSource),
    ...(displayName ? { displayName } : {}),
    userId,
  };
}

function toActorId(value: string): string {
  const sanitized = value.replaceAll(/[^A-Za-z0-9_-]/g, "-");
  const actorId = `u-${sanitized}`.slice(0, 128);
  return /^[A-Za-z0-9]/.test(actorId) ? actorId : `u-${actorId}`.slice(0, 128);
}
