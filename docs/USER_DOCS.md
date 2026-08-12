# iD30 CRM User Docs

## How To Log In

Go to `/signin`, enter your email and password, then select **Sign in**.

![Login](assets/screenshots/login.png)

## Dashboard Overview

The dashboard shows counts for sales opportunities, clients, contacts, tasks and notes plus a recent task table.

![Dashboard](assets/screenshots/dashboard.png)

## Managing Sales

Open **Sales** from the sidebar to review pipeline value, stage breakdown, opportunity probability, close dates and next steps.

Open a sale to work from the lead workspace. Use **Conversation** for the full
communication timeline and AI-assisted replies, **Lead** for customer/value/scope
details, and **Discovery** for lead, category and product question packs that
match the products attached to the lead.

## Managing Clients

Open **Clients** from the sidebar to view company records, statuses and related record counts.
When adding a company, use **Add contact** in the create form to include one or
more people at the same organisation, including their role or job title.
Open a company name to view the organisation record, linked contacts and linked
leads.

![Clients](assets/screenshots/clients.png)

## Managing Contacts

Open **Contacts > People** to view people linked to client companies. Use
**Contacts > Companies** for account-level organisations, and **Contacts >
Segments** to create reusable groups from contact fields, sales activity,
products, tags and recent lead history.

People records can be edited with a manual postal address: address line 1,
address line 2, city, county, postcode and country.
When the Companies module is enabled, the company field can link to an existing
organisation or create a new one by name. When the module is disabled, it is a
plain company-name field on the contact.

Open a person record to see the full customer conversation across every linked
lead. The latest conversation item opens by default, older items stay as compact
rows, and **Reply** opens the AI-assisted email, SMS or phone-script composer.
Email and SMS replies are logged against the most relevant linked lead, shown in
the reply panel before sending.

Use the contact record header actions to create a linked lead, edit the person,
merge a duplicate contact into the current record, or delete the contact.

Segments can be drafted from a plain-language prompt, such as "people that have
started digital marketing in the last 12 months". The CRM converts the prompt
into safe segment rules and shows the current number of matching people before
the segment is saved.

![Contacts](assets/screenshots/contacts.png)

## Managing Tasks

Open **Tasks** to review follow-up work by due date. The page opens on **My
tasks** by default so users see work assigned to them first. Use **All tasks**
to unfilter the owner view when you need to review the wider team queue.

Tasks are ordered by urgency, with overdue items first, followed by work due
today and upcoming work. Use the quick views for open, overdue, today,
upcoming and completed tasks, and use the due-date range controls to focus the
table on a specific period.

Rows show the source of the task, linked contact or sale record, due date,
status, assignee and quick actions. Use the check action to complete a task
once the follow-up has been handled.

![Tasks](assets/screenshots/tasks.png)

## Settings Overview

Settings are split into:

- General Settings
- Company / Organisation Profile
- Users & Permissions
- Integrations
- Security
- System / Developer Settings

Normal users only see settings they are allowed to access.

## Integrations Overview

Open **Settings > Integrations** to manage connected services. Cloudflare R2 is included as the default file storage integration for CRM uploads, quote packs and recordings. Twilio is included for voice, SMS and WhatsApp connection settings.

![Integrations](assets/screenshots/integrations.png)

Each card has a status badge and a configure button. R2 and Twilio connection details are entered in their integration cards and encrypted before being saved.

Twilio browser calling requires Account SID, API Key SID, API Key Secret, TwiML App SID, voice caller ID and webhook base URL. Contact phone numbers open the CRM softphone rather than the operating system dialler.

## Managing Users As An Admin

Admins can open **Settings > Users & Permissions** to add users, change roles and delete other users.

![Users](assets/screenshots/users.png)

There is no public signup. New users must be created by an admin.

## Editing Your Own Profile

Open **Profile** from the user menu to update your name or change your password.

![Profile](assets/screenshots/profile.png)

## Common Troubleshooting

- If you cannot log in, ask an admin to confirm your account is active.
- If you cannot see Users & Permissions, your account is not an admin.
- If screenshots are missing in this document, run `npm run docs:generate` after the app and database are set up.
