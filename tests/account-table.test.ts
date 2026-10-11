import { describe, expect, test } from "bun:test";
import { accountAt, accountTable } from "../src/account-table.ts";

const pool = { name: "default", home: ".codex", accounts: ["account-a", "account-b"] };
describe("account table", () => {
  test("native sign-in state does not fabricate remaining usage", () => {
    const output = accountTable(pool, {
      accounts: [
        { account: "account-a", authenticated: true },
        { account: "account-b", authenticated: false },
      ],
    });
    expect(output).toContain("signed-in");
    expect(output).toContain("signed-out");
    expect(output).not.toContain("0%");
  });
  test("retains usage windows, current marker, plan and reset credits", () => {
    const output = accountTable(
      pool,
      {
        current: "account-a",
        accounts: [
          {
            account: "account-a",
            plan: "plus",
            resetCredits: 0,
            rateLimits: {
              primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 2000000000 },
              secondary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: 2000001000 },
            },
          },
          { account: "account-b", resetError: "query_failure" },
        ],
      },
      { now: 0 },
    );
    for (const value of [
      "5-hour left",
      "5-hour resets",
      "weekly left",
      "weekly resets",
      "reset credits",
      "plus",
      "0%",
      "88%",
      "limited",
      "query failed",
      "* current profile",
    ])
      expect(output).toContain(value);
    expect(output).toMatch(/account-a.*\s0$/m);
    expect(output).toContain("account-b");
  });
  test("unknown values never become zero", () => {
    const output = accountTable(pool, { accounts: [{ account: "account-a" }] });
    expect(output).toContain("unknown");
    expect(output).not.toContain("0%");
  });
  test("number selection refuses invalid numbers", () => {
    expect(accountAt(pool, "2")).toBe("account-b");
    for (const input of ["0", "3", "-1", "1.5", "NaN", "9999999999999999999"])
      expect(() => accountAt(pool, input)).toThrow("account_number_invalid");
  });
});
