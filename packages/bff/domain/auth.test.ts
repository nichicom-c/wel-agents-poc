import { describe, expect, test } from "bun:test";

import { authContextFromJwtClaims, deriveRuntimeSessionId } from "./auth.ts";

const CONVERSATION_ID = "chat-00000000-0000-4000-8000-000000000000";

describe("authContextFromJwtClaims", () => {
  test("sub から userId と actorId を作る", () => {
    expect(
      authContextFromJwtClaims({
        email: "user@example.com",
        sub: "user-123",
      }),
    ).toEqual({
      actorId: "u-user-123",
      displayName: "user@example.com",
      userId: "user-123",
    });
  });

  test("sub がなければ undefined", () => {
    expect(authContextFromJwtClaims({ email: "user@example.com" })).toBe(
      undefined,
    );
  });

  test("claim 名を指定できる", () => {
    expect(
      authContextFromJwtClaims(
        {
          "custom:actor_id": "operator-1",
          username: "user-1",
        },
        {
          actorClaim: "custom:actor_id",
          userIdClaim: "username",
        },
      ),
    ).toEqual({
      actorId: "u-operator-1",
      userId: "user-1",
    });
  });
});

describe("deriveRuntimeSessionId", () => {
  test("userId と conversationId から runtime session ID を導出する", () => {
    const first = deriveRuntimeSessionId("user-123", CONVERSATION_ID);
    const second = deriveRuntimeSessionId("other-user", CONVERSATION_ID);

    expect(first).toMatch(/^u[A-Za-z0-9_-]+-chat-/);
    expect(first).not.toBe(second);
    expect(first.endsWith(CONVERSATION_ID)).toBe(true);
  });
});
