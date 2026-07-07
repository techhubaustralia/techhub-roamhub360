import { describe, expect, it } from "vitest";
import { expectedAudiences, isMicrosoftIssuer } from "./teams-token";

const APP_ID = "29c0b446-4e76-4a61-a5ff-c265e5f75ab2";
const TENANT = "72f988bf-86f1-41af-91ab-2d7cd011db47";

describe("expectedAudiences", () => {
  it("always accepts the bare client id and api://<id> forms", () => {
    const auds = expectedAudiences(APP_ID);
    expect(auds).toContain(APP_ID);
    expect(auds).toContain(`api://${APP_ID}`);
  });

  it("derives the manifest resource URI from APP_URL host", () => {
    const auds = expectedAudiences(APP_ID, "https://app.roamhub360.com");
    // Teams manifest webApplicationInfo.resource is api://app.roamhub360.com/<id>
    expect(auds).toContain(`api://app.roamhub360.com/${APP_ID}`);
  });

  it("includes an explicit override and de-duplicates", () => {
    const override = `api://custom.example.com/${APP_ID}`;
    const auds = expectedAudiences(APP_ID, "https://app.roamhub360.com", override);
    expect(auds).toContain(override);
    expect(new Set(auds).size).toBe(auds.length);
  });

  it("ignores a malformed APP_URL without throwing", () => {
    expect(() => expectedAudiences(APP_ID, "not a url")).not.toThrow();
  });
});

describe("isMicrosoftIssuer", () => {
  it("accepts a v2.0 tenant issuer", () => {
    expect(isMicrosoftIssuer(`https://login.microsoftonline.com/${TENANT}/v2.0`)).toBe(true);
  });

  it("accepts a v1.0 sts issuer", () => {
    expect(isMicrosoftIssuer(`https://sts.windows.net/${TENANT}/`)).toBe(true);
  });

  it("rejects a lookalike / non-Microsoft issuer", () => {
    expect(isMicrosoftIssuer("https://login.microsoftonline.com.evil.com/x/v2.0")).toBe(false);
    expect(isMicrosoftIssuer("https://accounts.google.com")).toBe(false);
    expect(isMicrosoftIssuer("")).toBe(false);
  });
});
