import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type User = {
  id: string;
  role: "ADMIN" | "USER";
};

type ModuleWithLoad = typeof Module & {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};

const moduleWithLoad = Module as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;

moduleWithLoad._load = function loadWithServerOnlyStub(
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
) {
  if (request === "server-only") {
    return {};
  }

  return Reflect.apply(originalLoad, this, [request, parent, isMain]);
};

type AccessWhere = (user: User) => unknown;

let contactAccessWhere: AccessWhere;
let companyAccessWhere: AccessWhere;

before(async () => {
  ({ contactAccessWhere, companyAccessWhere } = await import(
    "../src/lib/crm-resource-access"
  ));
});

describe("CRM resource access", () => {
  it("lets normal users see contacts and companies they created", () => {
    const user = { id: "user-1", role: "USER" } satisfies User;
    const expected = {
      OR: [
        { createdByUserId: user.id },
        {
          opportunities: {
            some: { OR: [{ ownerId: user.id }, { ownerId: null }] },
          },
        },
      ],
    };

    assert.deepEqual(contactAccessWhere(user), expected);
    assert.deepEqual(companyAccessWhere(user), expected);
  });

  it("keeps admin contact and company access unscoped", () => {
    const admin = { id: "admin-1", role: "ADMIN" } satisfies User;

    assert.deepEqual(contactAccessWhere(admin), {});
    assert.deepEqual(companyAccessWhere(admin), {});
  });
});
