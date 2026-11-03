import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRegisterAllowed } from "../lib/auth";

const KEY = "ALLOW_REGISTER";
const orig = process.env[KEY];

beforeEach(() => {
  delete process.env[KEY];
});
afterEach(() => {
  if (orig === undefined) delete process.env[KEY];
  else process.env[KEY] = orig;
});

describe("isRegisterAllowed 注册开关", () => {
  it("未设置时默认允许（保持现状）", () => {
    expect(isRegisterAllowed()).toBe(true);
  });

  it("空字符串视为允许", () => {
    process.env[KEY] = "";
    expect(isRegisterAllowed()).toBe(true);
  });

  it("0 / false / off / no / disabled（含大写）均视为禁用", () => {
    for (const v of ["0", "false", "off", "no", "disabled", "FALSE", "OFF"]) {
      process.env[KEY] = v;
      expect(isRegisterAllowed(), `ALLOW_REGISTER=${v} 应禁用`).toBe(false);
    }
  });

  it("1 / true / on / yes（含大写）均视为允许", () => {
    for (const v of ["1", "true", "on", "yes", "TRUE"]) {
      process.env[KEY] = v;
      expect(isRegisterAllowed(), `ALLOW_REGISTER=${v} 应允许`).toBe(true);
    }
  });
});
