# Attribution Retention

The Tracking Engine keeps attribution snapshots, records, number assignments and debug events for the number of days configured in **Settings > Attribution > Session Settings**.

Manual visitor/session export and delete are available on the Session Settings
page. Export includes the matching attribution data plus directly linked CRM
contacts, opportunities, communications, email messages, calls, queue entries
and file metadata. Export/delete actions write `AuditLog` records for admin
review.

Manual purge is available on the Session Settings page.

For automated cleanup, schedule a daily request:

```bash
curl -X POST https://crm.id30.com/api/attribution/privacy/purge \
  -H "Authorization: Bearer $ATTRIBUTION_RETENTION_SECRET"
```

Set `ATTRIBUTION_RETENTION_SECRET` or `CRON_SECRET` in production. The endpoint
deletes only Tracking Engine attribution data older than the configured
retention window; it does not delete CRM contacts, opportunities,
communications or media files. Retention purge runs write a system `AuditLog`
record.
