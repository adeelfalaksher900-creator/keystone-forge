# Keystone privacy policy

_Last updated: October 29, 2026_

Keystone is an Atlassian Forge app. It runs entirely on Atlassian's infrastructure and sends no data to any external service.

**What it reads.** Jira work items (summary, status, components, labels, parent, assignee, reporter, dates, comment authors and status-change history) in projects you choose, read with your own Jira permissions.

**What it stores** (in Forge storage, inside your Atlassian site's app data):
- a cache of the work-item fields above for up to 6 hours, to keep the app fast;
- availability entries that users set (account ID, status, dates, an optional 140-character note, who set it and when);
- the default project for the Rovo agent.

Comment text and descriptions are not stored.

**Who can see it.** Only users of your site who can already browse the project. Cached data is served only after a live permission check.

**What it writes.** Jira tasks, only when a user clicks "Create handover tasks".

**Deletion.** Uninstalling Keystone removes its stored data under Atlassian's Forge data retention rules. A user can clear their availability at any time by setting it back to "Available".

**Contact.** Open an issue at https://github.com/adeelfalaksher900-creator/keystone-forge/issues
