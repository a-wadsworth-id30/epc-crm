import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formConversationSummary,
  formFieldsBody,
  normaliseFormFields,
  normaliseLeadEmail,
  shouldReplaceSubmittedFormFields,
} from "../src/lib/attribution/form-fields";

describe("attribution form field normalization", () => {
  it("captures explicit, mapped and extra fields while filtering sensitive data", () => {
    const fields = normaliseFormFields({
      name: "Adam Wadsworth",
      email: "a.wadsworth@id30.com",
      phone: "07394 486272",
      companyName: "iD30",
      message: "Please call me back.",
      fields: [
        {
          name: "projectType",
          label: "Project type",
          type: "checkbox",
          value: ["Website", "CRM"],
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          value: "Never store this",
        },
        {
          name: "cardNumber",
          label: "Card number",
          value: "4111111111111111",
        },
      ],
      budget: 5000,
      newsletterOptIn: true,
    });

    assert.deepEqual(
      fields.map((field) => [field.name, field.label, field.value]),
      [
        ["projectType", "Project type", "Website, CRM"],
        ["name", "Name", "Adam Wadsworth"],
        ["email", "Email", "a.wadsworth@id30.com"],
        ["phone", "Phone", "07394 486272"],
        ["companyName", "Company", "iD30"],
        ["message", "Message", "Please call me back."],
        ["budget", "Budget", "5000"],
        ["newsletterOptIn", "Newsletter Opt In", "true"],
      ],
    );
  });

  it("deduplicates equivalent email, phone and message fields from mixed form styles", () => {
    const fields = normaliseFormFields({
      email: "a.wadsworth@id30.com",
      phone: "07394 486 272",
      message: "I need a new CRM.",
      formFields: [
        {
          name: "emailAddress",
          label: "Email address",
          type: "email",
          value: "a.wadsworth@id30.com",
        },
        {
          name: "telephone",
          label: "Telephone",
          type: "tel",
          value: "07394486272",
        },
        {
          name: "enquiry",
          label: "Enquiry",
          value: "I need a new CRM.",
        },
        {
          name: "serviceRequired",
          label: "Service required",
          value: "CRM implementation",
        },
      ],
    });

    assert.equal(fields.filter((field) => field.label.includes("Email")).length, 1);
    assert.equal(
      fields.filter((field) => /phone|telephone/i.test(field.label)).length,
      1,
    );
    assert.equal(
      fields.filter((field) => /message|enquiry/i.test(field.label)).length,
      1,
    );
    assert.ok(
      fields.some(
        (field) =>
          field.name === "serviceRequired" &&
          field.value === "CRM implementation",
      ),
    );
  });

  it("falls back to a captured email field when the direct email is absent or invalid", () => {
    const fields = normaliseFormFields({
      email: "not an email",
      fields: {
        workEmail: "lead@example.com",
        name: "Example Lead",
      },
    });

    assert.equal(normaliseLeadEmail("not an email", fields), "lead@example.com");
  });

  it("builds conversation body text without duplicating the mapped message", () => {
    const fields = normaliseFormFields({
      message: "Please send more details.",
      formFields: [
        {
          name: "message",
          label: "Message",
          value: "Please send more details.",
        },
        {
          name: "preferredContactTime",
          label: "Preferred contact time",
          value: "Morning",
        },
      ],
    });

    assert.equal(
      formFieldsBody("Please send more details.", fields),
      [
        "Submitted form fields:",
        "Message: Please send more details.",
        "Preferred contact time: Morning",
      ].join("\n"),
    );
  });

  it("prefers richer replacement submissions for existing sparse conversations", () => {
    const candidateFields = normaliseFormFields({
      name: "Adam Wadsworth",
      email: "a.wadsworth@id30.com",
      formFields: {
        projectType: "CRM",
        budget: "5000",
      },
    });

    assert.equal(
      shouldReplaceSubmittedFormFields({
        existingFields: [{ label: "Email", value: "a.wadsworth@id30.com" }],
        candidateFields,
        existingBody: "Submitted form fields:\nEmail: a.wadsworth@id30.com",
        candidateBody: formFieldsBody(undefined, candidateFields),
      }),
      true,
    );

    assert.equal(
      formConversationSummary(undefined, candidateFields),
      "Website enquiry submitted with 4 captured fields.",
    );
  });
});
