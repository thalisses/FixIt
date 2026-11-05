import { describe, expect, it } from "vitest";
import { UserRole } from "../entities/User.js";
import {
  getAssetSelectionVisibility,
  isAuthorized,
} from "./authorization.js";

const client = { id: "client-1", role: UserRole.CLIENTE };
const maintainer = { id: "maintainer-1", role: UserRole.MANUTENTOR };
const manager = { id: "manager-1", role: UserRole.GESTOR };
const ownRequest = {
  ownerId: client.id,
  assignedMaintainerId: maintainer.id,
};

describe("authorization policies", () => {
  it("allows all active roles to create requests and select assets", () => {
    for (const user of [client, maintainer, manager]) {
      expect(isAuthorized(user, "request:create")).toBe(true);
      expect(isAuthorized(user, "asset:select")).toBe(true);
    }

    expect(isAuthorized(null, "request:create")).toBe(false);
    expect(isAuthorized(null, "asset:select")).toBe(false);
  });

  it("limits request reads and updates to the allowed owner or assignee", () => {
    expect(isAuthorized(client, "request:read", ownRequest)).toBe(true);
    expect(
      isAuthorized(client, "request:read", {
        ...ownRequest,
        ownerId: "another-client",
      }),
    ).toBe(false);
    expect(isAuthorized(maintainer, "request:read", ownRequest)).toBe(true);
    expect(
      isAuthorized(maintainer, "request:read", {
        ...ownRequest,
        assignedMaintainerId: "another-maintainer",
      }),
    ).toBe(false);
    expect(isAuthorized(manager, "request:read")).toBe(true);

    expect(isAuthorized(client, "request:update", ownRequest)).toBe(false);
    expect(isAuthorized(maintainer, "request:update", ownRequest)).toBe(true);
    expect(isAuthorized(manager, "request:update")).toBe(true);
  });

  it("restricts request management, user management, and reports to Gestor", () => {
    for (const action of [
      "request:manage",
      "users:manage",
      "reports:read",
    ] as const) {
      expect(isAuthorized(manager, action)).toBe(true);
      expect(isAuthorized(client, action)).toBe(false);
      expect(isAuthorized(maintainer, action)).toBe(false);
    }
  });

  it("allows Manutentor and Gestor to manage assets", () => {
    expect(isAuthorized(client, "asset:manage")).toBe(false);
    expect(isAuthorized(maintainer, "asset:manage")).toBe(true);
    expect(isAuthorized(manager, "asset:manage")).toBe(true);
  });

  it("exposes only minimal asset-selection data to Cliente", () => {
    expect(getAssetSelectionVisibility(null)).toBeNull();
    expect(getAssetSelectionVisibility(client)).toBe("minimal");
    expect(getAssetSelectionVisibility(maintainer)).toBe("full");
    expect(getAssetSelectionVisibility(manager)).toBe("full");
  });
});
