import { describe, expect, it } from "vitest";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";

describe("Instagram database integration safety", () => {
  it("skips local integration when it has not been explicitly enabled", () => {
    expect(validateInstagramDatabaseTarget({})).toBe(false);
  });

  it("accepts matching disposable loopback database targets", () => {
    expect(
      validateInstagramDatabaseTarget({
        CI: "true",
        DATABASE_URL: "postgresql://user:actual-password@127.0.0.1:5432/markos_ci_test",
        INSTAGRAM_DATABASE_TEST_URL: "postgresql://user:different-password@localhost:5432/markos_ci_test"
      })
    ).toBe(true);
  });

  it.each([
    ["missing CI opt-in", { CI: "true", DATABASE_URL: "postgresql://localhost/markos_ci_test" }],
    [
      "missing actual Prisma target",
      {
        CI: "true",
        INSTAGRAM_DATABASE_TEST_URL: "postgresql://localhost/markos_ci_test"
      }
    ],
    [
      "unsafe actual target",
      {
        CI: "true",
        DATABASE_URL: "postgresql://database.internal/markos",
        INSTAGRAM_DATABASE_TEST_URL: "postgresql://localhost/markos_ci_test"
      }
    ],
    [
      "mismatched declared target",
      {
        CI: "true",
        DATABASE_URL: "postgresql://localhost/markos_ci_test",
        INSTAGRAM_DATABASE_TEST_URL: "postgresql://localhost/other_ci_test"
      }
    ]
  ])("rejects %s without exposing connection values", (_label, environment) => {
    let message = "";
    try {
      validateInstagramDatabaseTarget(environment);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain("actual-password");
    expect(message).not.toContain("database.internal");
    expect(message).not.toContain("postgresql://");
  });
});
