import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/trust")({
  component: TrustPage,
  head: () => ({
    meta: [
      { title: "Trust & Security — GoForVisa" },
      {
        name: "description",
        content:
          "How GoForVisa handles access control, data, and privacy for the internal CRM.",
      },
    ],
  }),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Trust & Security
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is maintained by the GoForVisa team to answer common security
            and privacy questions about the GoForVisa internal CRM. It is editable
            project content, not an independent certification.
          </p>
        </div>

        <Section title="Access & Authentication">
          <p>
            Access to the CRM requires an authenticated account. Sensitive sections
            (finance, salaries, advances, admin) are further restricted by
            role-based permissions (admin, owner CEO, financier) and per-widget
            permissions assigned by an administrator.
          </p>
        </Section>

        <Section title="Data Protection">
          <p>
            All application data is stored in the backend database with row-level
            security enabled. Records are scoped so that only the authenticated
            user and roles authorized for that data can read or modify them.
          </p>
        </Section>

        <Section title="Storage & Files">
          <p>
            Employee photos and contract files are kept in private storage
            buckets. They are not publicly accessible; access is granted on demand
            through short-lived signed links to authorized users.
          </p>
        </Section>

        <Section title="Secrets & Integrations">
          <p>
            Third-party credentials (Telegram bot token, Google Sheets API key,
            Lovable AI key, backend service keys) are stored as server-side
            secrets and are never shipped to the browser. External calls happen in
            server functions or the Telegram webhook endpoint.
          </p>
        </Section>

        <Section title="Shared Responsibility">
          <p>
            The hosting platform provides infrastructure, authentication
            primitives, and the database engine. The GoForVisa team is responsible
            for application access rules, role assignments, and how data is used
            inside the CRM. Customers / employees are responsible for keeping
            their own login credentials secure.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            For security questions or to report a concern, contact the GoForVisa
            administrator inside the workspace.
          </p>
        </Section>

        <div className="pt-4">
          <Link
            to="/"
            className="text-sm font-medium text-primary hover:underline"
          >
            ← Back to app
          </Link>
        </div>
      </div>
    </div>
  );
}
