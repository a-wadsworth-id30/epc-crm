import assert from "node:assert/strict";
import Module from "node:module";
import { before, describe, it } from "node:test";

type CurrentUser = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  landline: string | null;
  mobile: string | null;
  email: string;
  role: "ADMIN" | "USER";
};

type ContactSegmentCriteria = {
  match: "all" | "any";
  rules: Array<{
    type: "opportunity_stage_in";
    values: ["WON"];
    label: string;
  }>;
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

type ContactWhereForSegment = (
  criteria: ContactSegmentCriteria,
  user?: CurrentUser,
) => unknown;

let contactWhereForSegment: ContactWhereForSegment;

before(async () => {
  ({ contactWhereForSegment } = await import("../src/lib/contact-segments"));
});

const user = {
  id: "user-1",
  name: "User One",
  firstName: "User",
  lastName: "One",
  avatarUrl: null,
  landline: null,
  mobile: null,
  email: "user@example.com",
  role: "USER",
} satisfies CurrentUser;

const admin = {
  ...user,
  id: "admin-1",
  role: "ADMIN",
} satisfies CurrentUser;

const wonSegment = {
  match: "all",
  rules: [
    {
      type: "opportunity_stage_in",
      values: ["WON"],
      label: "Has a won sale",
    },
  ],
} satisfies ContactSegmentCriteria;

describe("contact segment access filters", () => {
  it("scopes normal users at both contact and opportunity-rule levels", () => {
    const where = contactWhereForSegment(wonSegment, user) as {
      AND: unknown[];
    };

    assert.deepEqual(where.AND[0], {
      OR: [
        { createdByUserId: user.id },
        {
          opportunities: {
            some: { OR: [{ ownerId: user.id }, { ownerId: null }] },
          },
        },
      ],
    });

    assert.deepEqual(where.AND[1], {
      AND: [
        {
          opportunities: {
            some: {
              AND: [
                { OR: [{ ownerId: user.id }, { ownerId: null }] },
                { stage: { in: ["WON"] } },
              ],
            },
          },
        },
      ],
    });
  });

  it("keeps admin segment filters unscoped", () => {
    assert.deepEqual(contactWhereForSegment(wonSegment, admin), {
      AND: [
        {
          opportunities: {
            some: { stage: { in: ["WON"] } },
          },
        },
      ],
    });
  });
});
