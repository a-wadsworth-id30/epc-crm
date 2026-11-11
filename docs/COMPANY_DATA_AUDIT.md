# Company Data Audit

Last reviewed: 2026-11-11

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
- a CRM user-backed owner plus retained legacy owner text;
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
4. Company ownership is now user-backed for permissions, reassignment and
   reporting. Unmatched legacy free-text values remain visible until reviewed.
5. Company documents are supported, but Company Type-specific checklists and
   compliance scoring are not.
6. Name-only matching remains necessary for legacy data but creates duplicate
   risk. Domain and registration identifiers should become additional matching
   signals.
7. The cached `Contact.companyName` must remain during the compatibility period
   because several integrations still read or write it.
8. The later confirmed installer/subcontractor use case requires one Person to
   hold active relationships with multiple Companies. The additive affiliation
   model now supports this while preserving the existing primary Company link.

## Recommended delivery decisions

### Company ownership

Use `Company.ownerUserId` for assignment, filtering, search, export and access
scope. Admins may assign any active CRM user; standard users may assign only
themselves or leave a Company unassigned. Preserve the legacy `Company.owner`
text for imports and historical review. Automatically link it only when its
normalised value identifies exactly one active user, avoiding guesses where
names are duplicated or no longer active.

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

Keep `Contact.companyId` optional and treat it as the primary compatibility
link. Store the complete set of Person/Company links in
`CompanyContactAffiliation`, including Company-specific responsibilities. Do not
overwrite a Person's home address with a Company address. Changes made by
integration writers through `Contact.companyId` must stay synchronised with the
affiliation table.

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

## Task 2 foundation

The additive Company Type foundation is implemented through
`20261110230000_company_type_foundation`:

- add `CompanyType` and nullable `Company.companyTypeId`;
- seed the initial types;
- backfill existing Companies to `Other` during migration;
- preserve Company status, links and cached names;
- rename only the visible `Company` Person Type labels;
- add compatibility fallbacks until the production migration is confirmed.

## Task 4 relationship controls

The original relationship controls established one optional primary Company
per Person. The later multi-company delivery extends the Company detail screen
to support:

- searching accessible People by name, email or telephone;
- linking an unassigned Person as primary;
- adding a second or later Company without replacing the primary link;
- promoting an additional relationship to primary;
- unlinking a Person without deleting their CRM record;
- concurrency checks that stop a stale screen overwriting a newer assignment;
- privacy-safe AuditLog events containing record IDs rather than person data.

The Person create/edit flow writes the same relationship audit events. The
legacy `Contact.companyId` and `companyName` fields remain the compatibility
contract for integrations.

## Task 5 configurable forms

All Company creation and editing routes now use the data-backed Company Type
configuration, including Companies, Company detail and global quick create.
The selected type controls which structured fields are displayed. Required
fields block saving, completeness fields remain advisory, and values retain
their configured text, decimal, date, boolean or multi-select representation.

The server reloads the active type and field definitions within the write
transaction, applies role-template edit restrictions and ignores fields the
current user cannot edit. Pages omit hidden definitions and values before
serialising props. View-only values are displayed but preserved rather than
submitted. Switching a Company to another type retains values from its former
type so a later reversal does not destroy existing organisational data.

## Task 6 company detail workspace

The Company workspace now presents the selected Company Type as record context
and shows the visible type-specific values in Overview. A completeness panel
tracks only fields configured as required to save or required for completeness;
optional fields do not reduce the score and types without tracked requirements
do not display a misleading zero-percent state. The workspace uses the same
role-filtered definitions and values as the edit form, so restricted company
data is not exposed through the detail view.

## Task 7 Company document requirements

Admins can define ordered required or optional controlled document types for
each Company Type in Settings > Company Types. The Company Documents workspace
matches private record files by their controlled document metadata and displays
the resulting checklist without relying on filenames. Missing required types
are prioritised in the existing upload flow and suggested in secure customer
upload requests, whose server action reloads the configured label and
instructions. Existing document issue dates, expiry dates and renewal-task
support remain the single implementation for both People and Companies.

## Task 8 Company list filters

The Companies list now has a compact count-bearing Company Type row plus
server-side lifecycle and owner filters in the shared filter drawer. Selecting
a Company Type exposes only that type's structured select, yes/no and date
filters and any fields configured as table columns. The default all-companies
view deliberately keeps those type-specific controls hidden to avoid increasing
screen density as Craig adds more types and fields. Search includes authorised
custom fields marked searchable, while every query remains combined with the
existing Company access scope.

## Task 9 Company import and export

The Companies list now exports the same permission-scoped result represented
by its search, Company Type, lifecycle, owner and structured-field URL filters.
Exports include authorised typed fields, are capped at 5,000 records, neutralise
spreadsheet formulas and record metadata-only audit evidence.

Admins can import up to 500 Companies from a 2 MB CSV through a mandatory
preview and confirmation workflow. Templates expose stable Company Type slugs
and `custom:field_key` columns. Preview and final confirmation both validate
active types, required/typed values and duplicate identity. A normalised domain
is preferred for matching; exact normalised name is the fallback only when the
row has no domain. Imports are intentionally create-only and never overwrite an
existing Company.

## Task 10 integration compatibility

Company matching now follows one compatibility rule across manual People/Sales
creation, People CSV imports, website attribution and Pipedrive. Explicit CRM
Company IDs and Pipedrive external organisation links remain authoritative.
Name fallback is allowed only when exactly one normalised Company name matches.

When duplicate names exist, manual workflows ask the user to select the exact
Company, People imports and attribution retain the legacy cached name without
inventing a link, and Pipedrive creates a distinct `Other` Company tied to the
provider organisation ID. This preserves the existing `Contact.companyName`
compatibility contract while stopping arbitrary `findFirst` links. People CSV
preview explains whether a Company will be linked, and import audit metadata
records aggregate linked/unlinked counts without storing customer values.

## Company contact responsibilities and affiliations

Every Company affiliation carries controlled contact responsibilities: Primary,
Commercial, Technical, Accounts and Compliance. The existing free-text
`Contact.role` remains the Person's job title. Responsibility changes require
access to both records and are written to the audit log without copying Person
data. Existing values are migrated onto the primary affiliation; the legacy
array mirrors only that primary link during the compatibility period.

The additive `20261111113000_company_contact_affiliations` migration backfills
one primary affiliation from every existing `Contact.companyId`. A partial
unique index permits at most one primary Company per Person. Database triggers
keep direct Contact writes compatible: changing the primary retains the old
Company as an additional affiliation, clearing the primary removes that link,
and Company-specific responsibilities are never copied to a different Company.

## Company hierarchy

Companies can optionally reference a parent Company for head-office, regional
branch or subsidiary structures. The additive
`20261111121500_company_hierarchy` migration does not infer links from names,
domains or addresses. The Company Overview exposes only parent and child
records available through the current user's Company access policy. Updates
validate the full ancestor chain, reject self-links and cycles, and store only
record IDs in the audit event. Removing a parent or deleting it leaves the
child Company, People, sales and documents intact.

## Duplicate Company merge

Admins can merge an existing duplicate into the Company they are viewing. The
operation deliberately keeps the retained Company's populated profile and
fills only missing profile values from the duplicate. It unions controlled
contact responsibilities, preserves one primary Company per Person, moves
sales, tasks, notes, files, secure document workflows, signature requests,
custom field values and provider links, and repairs parent/child relationships.
Conflicting custom field values remain on the retained Company. The transaction
deletes the duplicate only after all moves succeed and writes an ID-only,
aggregate-count audit event so customer data is not copied into AuditLog.
