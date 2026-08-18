import { describe, expect, it } from "vitest";
import { insertCmsMediaToken } from "./CmsMarkdown";
import { permissionCodeForHref } from "../../shared/permissionCodes";

describe("cms markdown tokens", () => {
  it("appends a cms-media token", () => {
    expect(insertCmsMediaToken("", 12, "Store front")).toBe("![Store front](cms-media:12)");
    expect(insertCmsMediaToken("Hello", 3, "")).toBe("Hello\n\n![image](cms-media:3)\n");
  });
});

describe("cms permission hrefs", () => {
  it("maps reader and editor paths to cms.pages", () => {
    expect(permissionCodeForHref("/app/cms/p/store-hours")).toBe("cms.pages");
    expect(permissionCodeForHref("/app/cms/pages/42")).toBe("cms.pages");
    expect(permissionCodeForHref("/app/cms/pages/settings")).toBe("cms.pages");
    expect(permissionCodeForHref("/app/cms/media")).toBe("cms.media");
  });
});
