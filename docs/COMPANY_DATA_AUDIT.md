# Company Data Audit

Last reviewed: 2026-11-10

## Purpose

This audit establishes the safe starting point for improving Companies without
turning organisations into People or forcing every person to belong to a
company.

The intended product rule is:

- People are individuals.
- Companies are organisations.
- A person may exist without a company.
- A company may exist without a linked person.
- Company classification and person classification remain separate.

## Live UI evidence

The authenticated production UI showed the following on 2026-11-10:

- People: 11,358.
- Companies: 730.
- People assigned to the `Company` Person Type: 0.
- The first page of Companies contained 25 records. All 25 had one linked
  person, no domain, no assigned owner, no location, `Prospect` status and no
  displayed sales/task/note activity.

The first-page observations are a sample, not a whole-database aggregate. They
strongly indicate that many Company records were created as lightweight
organisation links during import and need enrichment rather than replacement.

## Current architecture

### People and organisations

`Contact.companyId` is an optional foreign key to `Company`. A person is not
required to have a company. The model also retains `Contact.companyName` as a
compatibility cache for legacy imports and integrations.

The current relationship is one Company to many People, with at most one linked
Company per person. A person's role is stored on the person rather than on a
separate relationship record.

### Company records

Company records currently contain:

- name;
- domain;
- lifecycle status;
- a free-text owner;
- one postal address;
- linked People, sales, tasks, notes and documents.

Company status is fixed to the normal `Prospect`, `Active` and `Inactive`
choices in the UI. Company fields, types and document requirements are not yet
admin-configurable.

### Creation and imports

- Creating or editing a person can resolve a Company by ID, match a Company by
  case-insensitive name or create a Company from a new name.
- Creating a Company can also create up to ten linked People. Those People use
  the existing default/system Person Type assignment.
- Renaming a Company updates the cached `companyName` on linked People.
- Deleting a Company unlinks its People and clears the cached company name.
- Pipedrive maintains external organisation-to-Company links and can create or
  reuse Company records during import.
- Sales quick-create, attribution and telephony paths consume the current
  optional company link and must remain compatible during staged changes.

## Findings

1. The separate Company model is the correct organisation record and should be
   retained.
2. The `Company` Person Type is misleading because Person Types classify
   individuals. It currently has zero assigned People in the live UI.
3. The Company model is materially less configurable than the Person model.
4. Free-text Company owner values cannot provide reliable permissions,
   reassignment or reporting.
5. Company documents are supported, but Company Type-specific checklists and
   compliance scoring are not.
6. Name-only matching remains necessary for legacy data but creates duplicate
   risk. Domain and registration identifiers should become additional matching
   signals.
7. The cached `Contact.companyName` must remain during the compatibility period
   because several integrations still read or write it.
8. A many-to-many person/company relationship is not required for the first
   release. The current optional primary Company link satisfies the confirmed
   requirement and avoids unnecessary migration risk. Additional affiliations
   can be introduced later without forcing them into the first schema change.

## Recommended delivery decisions

### Company Types

Introduce a separate, data-backed `CompanyType` model. Seed neutral
classification choices such as Customer, Installer Company, Trade Partner,
Supplier, Subcontractor and Other. Keep lifecycle status separate from Company
Type.

Existing Companies should be backfilled to `Other`, not guessed from their
name or current `Prospect` lifecycle status.

### Person Type terminology

Rename the visible system Person Type from `Company` to `Company Contact` while
preserving its stable system key and slug for compatibility. Do not delete it.
This lets integrations and historical records continue to resolve safely while
making it clear that it represents an individual associated with an
organisation.

### Relationship scope

Keep `Contact.companyId` optional and treat it as the primary Company link for
the first release. Improve linking and unlinking from both the Person and
Company screens. Do not overwrite a person's home address with a Company
address.

Before adding multi-company affiliations, confirm a real use case requiring one
person to hold active roles at multiple organisations. If confirmed, introduce
a relationship table in a separate migration while retaining `companyId` as
the primary compatibility link during transition.

## Reusable aggregate audit

Run the following with an authorised read-only or runtime database connection:

```bash
npm run maintenance:company-data-audit
```

The command emits aggregate counts only. It does not output names, email
addresses, telephone numbers, postal addresses, document metadata or other
customer information. It checks:

- linked and unlinked People;
- legacy company-name-only People;
- Company Person Type usage;
- Companies without People;
- missing Company profile data;
- normalised duplicate name and domain groups;
- cached-name mismatches;
- Company documents;
- Pipedrive Company links.

The local development database was unavailable during this review, and
production `DATABASE_URL` is intentionally not retrievable through the local
Netlify CLI. The deeper aggregate query therefore remains pending until David
or another authorised operator supplies a temporary read-only Neon connection
or runs the command in an approved environment.

## Task 2 entry criteria

Task 2 can proceed without production writes because its migration is additive:

- add `CompanyType` and nullable `Company.companyTypeId`;
- seed the initial types;
- backfill existing Companies to `Other` during migration;
- preserve Company status, links and cached names;
- rename only the visible `Company` Person Type labels;
- add compatibility fallbacks until the production migration is confirmed.

