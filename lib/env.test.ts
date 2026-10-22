import { afterEach, describe, expect, it } from "vitest";
import { getRequiredEnvVar } from "./env";

describe("getRequiredEnvVar", () => {
  afterEach(() => { delete process.env.FOCUS_TEST_VAR; });
  it("returns a configured value", () => {
    process.env.FOCUS_TEST_VAR = "value";
    expect(getRequiredEnvVar("FOCUS_TEST_VAR")).toBe("value");
  });
  it.each([undefined, ""])("throws a clear error when the value is %j", (value) => {
    if (value !== undefined) process.env.FOCUS_TEST_VAR = value;
    expect(() => getRequiredEnvVar("FOCUS_TEST_VAR")).toThrow("Missing required environment variable: FOCUS_TEST_VAR");
  });
});
