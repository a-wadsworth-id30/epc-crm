import { expect, test } from "@playwright/test";
import {
  formFieldsBody,
  normaliseFormFields,
  normaliseLeadEmail,
  shouldReplaceSubmittedFormFields,
} from "../src/lib/attribution/form-fields";

test("promotes email from captured field metadata", () => {
  const fields = normaliseFormFields({
    fields: [
      {
        name: "field_7",
        label: "Email address",
        type: "email",
        value: "lead@example.com",
      },
      {
        name: "field_8",
        label: "Message",
        value: "Please call me",
      },
    ],
    message: "Please call me",
  });

  expect(normaliseLeadEmail(undefined, fields)).toBe("lead@example.com");
  expect(fields.map((field) => field.label)).toEqual(["Email address", "Message"]);
  expect(formFieldsBody("Please call me", fields)).toContain(
    "Email address: lead@example.com",
  );
});

test("includes mapped email once when fields are missing", () => {
  const fields = normaliseFormFields({
    name: "Jane Lead",
    email: "jane@example.com",
    phone: "07700 900123",
    message: "Need pricing",
  });

  expect(normaliseLeadEmail("jane@example.com", fields)).toBe("jane@example.com");
  expect(fields.filter((field) => field.label === "Email")).toHaveLength(1);
  expect(formFieldsBody("Need pricing", fields)).toContain("Email: jane@example.com");
  expect(formFieldsBody("Need pricing", fields)).toContain("Message: Need pricing");
});

test("keeps full project enquiry fields for duplicate enrichment", () => {
  const partialFields = normaliseFormFields({
    name: "Adam Wadsworth",
    email: "a.wadsworth@id30.com",
    phone: "07394486272",
  });
  const fullFields = normaliseFormFields({
    name: "Adam Wadsworth",
    email: "a.wadsworth@id30.com",
    phone: "07394486272",
    fields: [
      { name: "name", label: "Name", type: "text", value: "Adam Wadsworth" },
      {
        name: "telephone",
        label: "Telephone",
        type: "tel",
        value: "07394486272",
      },
      {
        name: "email",
        label: "Email",
        type: "email",
        value: "a.wadsworth@id30.com",
      },
      { name: "company-name", label: "Company Name", value: "iD30" },
      { name: "website-url", label: "Website URL", value: "https://id30.com" },
      {
        name: "we-sell-provide",
        label: "We sell/provide",
        value: "Digital services",
      },
      {
        name: "description",
        label: "Description",
        value: "We need better attribution capture from all project fields.",
      },
      { name: "budget", label: "£10-£20K", value: "£10-£20K" },
      {
        name: "timeframe",
        label: "Within the next 3 months",
        value: "Within the next 3 months",
      },
      { name: "day", label: "Mon", value: "Mon" },
      { name: "time", label: "AM", value: "AM" },
    ],
  });

  expect(partialFields).toHaveLength(3);
  expect(fullFields).toHaveLength(11);
  expect(
    shouldReplaceSubmittedFormFields({
      existingFields: partialFields,
      candidateFields: fullFields,
      existingBody: formFieldsBody(undefined, partialFields),
      candidateBody: formFieldsBody(undefined, fullFields),
    }),
  ).toBe(true);
  expect(formFieldsBody(undefined, fullFields)).toContain("Company Name: iD30");
  expect(formFieldsBody(undefined, fullFields)).toContain(
    "Description: We need better attribution capture from all project fields.",
  );
});
