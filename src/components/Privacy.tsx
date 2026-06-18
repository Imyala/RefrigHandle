import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './ui'

// Effective date shown at the top of the policy. Update this whenever the
// policy text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Privacy Policy text, shown on the standalone /privacy
// page reached from Settings. Plain-English and deliberately conservative —
// it is NOT legal advice and should be reviewed by a solicitor before being
// relied on commercially.
export function PrivacyContent() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p>
        This Privacy Policy explains how RefrigHandle collects, uses, stores and
        protects information when providing the RefrigHandle platform and
        related services.
      </p>
      <p>
        By using RefrigHandle, you acknowledge that information may be collected
        and processed in accordance with this Privacy Policy.
      </p>

      <Section title="1. Introduction">
        <p>
          RefrigHandle is committed to protecting privacy and handling
          information responsibly. This Privacy Policy applies to all users of
          RefrigHandle, including Account Owners and Authorised Users.
        </p>
      </Section>

      <Section title="2. Definitions">
        <p>
          <strong>Account Owner</strong> means the business, company, sole
          trader, partnership, trust, government entity or other organisation
          that has registered for RefrigHandle.
        </p>
        <p>
          <strong>Authorised User</strong> means an employee, contractor or
          other person granted access to an Account by the Account Owner.
        </p>
        <p>
          <strong>Business Data</strong> means information entered into
          RefrigHandle, including customer records, site records, refrigerant
          records, cylinder records, audit logs, technician information, notes
          and attachments.
        </p>
        <p>
          <strong>Personal Information</strong> means information that
          identifies or reasonably identifies an individual.
        </p>
      </Section>

      <Section title="3. Information we collect">
        <p>We may collect the following categories of information.</p>
        <SubHead>Account information</SubHead>
        <Bullets
          items={[
            'Name',
            'Email address',
            'Business name',
            'ABN',
            'Phone number',
            'Billing information',
            'User roles and permissions',
          ]}
        />
        <SubHead>Operational information</SubHead>
        <Bullets
          items={[
            'Customer records',
            'Site records',
            'Equipment information',
            'Refrigerant transactions',
            'Cylinder information',
            'Technician activity records',
            'Audit logs',
            'Notes and attachments',
          ]}
        />
        <SubHead>Technical information</SubHead>
        <Bullets
          items={[
            'Device information',
            'Browser information',
            'Operating system',
            'IP address',
            'Error reports',
            'Login activity',
          ]}
        />
        <SubHead>Payment information</SubHead>
        <p>
          Payment processing may be performed by third-party payment providers.
          RefrigHandle does not store complete credit card information.
        </p>
      </Section>

      <Section title="4. Why we collect information">
        <p>Information is collected to:</p>
        <Bullets
          items={[
            'provide and maintain the Services;',
            'create and manage Accounts;',
            'synchronise Business Data;',
            'provide customer support;',
            'improve performance and reliability;',
            'detect misuse or security threats;',
            'communicate with users;',
            'process payments;',
            'comply with legal obligations.',
          ]}
        />
      </Section>

      <Section title="5. Business Data ownership">
        <p>Business Data remains the property of the Account Owner.</p>
        <p>
          Authorised Users acknowledge that information entered into RefrigHandle
          is entered on behalf of the Account Owner.
        </p>
        <p>
          The Account Owner controls access to Business Data and may add or
          remove Authorised Users.
        </p>
      </Section>

      <Section title="6. How information is stored">
        <p>Information may be stored:</p>
        <Bullets
          items={[
            'on user devices;',
            'on secure cloud infrastructure;',
            'in backup systems;',
            'by trusted third-party service providers.',
          ]}
        />
        <p>
          Reasonable security measures are used to protect information from
          unauthorised access, misuse or loss. However, no method of electronic
          storage or transmission can guarantee absolute security.
        </p>
      </Section>

      <Section title="7. Third-party service providers">
        <p>
          RefrigHandle may use third-party providers to assist in operating the
          Services, including providers of:
        </p>
        <Bullets
          items={[
            'cloud hosting;',
            'authentication;',
            'analytics;',
            'email delivery;',
            'payment processing;',
            'backup and storage services.',
          ]}
        />
        <p>These providers may process information on our behalf.</p>
      </Section>

      <Section title="8. Disclosure of information">
        <p>RefrigHandle does not sell personal information.</p>
        <p>Information may be disclosed:</p>
        <Bullets
          items={[
            'with your consent;',
            'to service providers assisting us;',
            'where required by law;',
            'to protect the rights, safety or security of users or RefrigHandle;',
            'in connection with the sale, merger or transfer of the business.',
          ]}
        />
      </Section>

      <Section title="9. Overseas processing">
        <p>
          Some third-party providers used by RefrigHandle may process or store
          information outside Australia.
        </p>
        <p>
          RefrigHandle takes reasonable steps to ensure that such providers
          maintain appropriate privacy and security standards.
        </p>
      </Section>

      <Section title="10. Data retention">
        <p>Information is retained only for as long as reasonably necessary to:</p>
        <Bullets
          items={[
            'provide the Services;',
            'maintain security;',
            'resolve disputes;',
            'comply with legal obligations;',
            'maintain backup and recovery systems.',
          ]}
        />
        <p>
          The Account Owner remains responsible for retaining records for the
          periods required by applicable laws and regulations and should not
          rely solely on RefrigHandle as a long-term archival service.
        </p>
      </Section>

      <Section title="11. Account closure and deletion">
        <p>The Account Owner may request account closure at any time.</p>
        <p>
          Before closing an Account, the Account Owner should export and securely
          retain copies of all records it wishes to keep.
        </p>
        <p>Following account closure:</p>
        <Bullets
          items={[
            'access to the Services may cease;',
            'Authorised Users may lose access;',
            'Business Data may be deleted in accordance with internal retention practices.',
          ]}
        />
        <p>
          Certain information may be retained where reasonably necessary for
          security, fraud prevention, dispute resolution, legal compliance or
          backup purposes.
        </p>
      </Section>

      <Section title="12. Cookies and analytics">
        <p>
          RefrigHandle may use cookies and similar technologies to:
        </p>
        <Bullets
          items={[
            'maintain login sessions;',
            'improve functionality;',
            'analyse usage;',
            'enhance performance.',
          ]}
        />
        <p>
          Users may disable cookies through browser settings, although some
          features may not function correctly.
        </p>
      </Section>

      <Section title="13. Access and correction">
        <p>
          Users may request access to Personal Information held by RefrigHandle
          and may request correction of inaccurate information. Requests may be
          refused where permitted by law.
        </p>
      </Section>

      <Section title="14. Age restrictions">
        <p>
          RefrigHandle is intended for use by businesses and organisations and is
          not directed toward persons under 18 years of age. All users of
          RefrigHandle, including Authorised Users, must be at least 18 years of
          age.
        </p>
        <p>
          RefrigHandle does not knowingly collect personal information from
          persons under 18 years of age. If RefrigHandle becomes aware that
          information relating to a person under 18 years of age has been
          collected, RefrigHandle may suspend access, remove the information, or
          take any other action considered appropriate.
        </p>
        <p>
          The Account Owner is responsible for ensuring that all Authorised Users
          satisfy the age requirements contained in the Terms of Use.
        </p>
      </Section>

      <Section title="15. Regulatory status">
        <p>RefrigHandle is an independent software platform.</p>
        <p>
          Unless expressly stated otherwise, RefrigHandle is not operated by,
          endorsed by, or acting on behalf of the Australian Refrigeration
          Council (ARC), ARCtick, the Australian Taxation Office (ATO), ASIC, or
          any government authority.
        </p>
        <p>
          References to legislation, industry schemes or regulatory bodies are
          provided for general informational purposes only.
        </p>
      </Section>

      <Section title="16. Changes to this Privacy Policy">
        <p>This Privacy Policy may be updated from time to time.</p>
        <p>
          The latest version will be made available through the RefrigHandle
          website or application. Continued use of the Services after publication
          of an updated Privacy Policy constitutes acceptance of the revised
          Privacy Policy.
        </p>
      </Section>

      <Section title="17. Contact information">
        <p>RefrigHandle</p>
        <p>
          For privacy enquiries, or to request access to or correction of your
          information, contact us at legal@refrighandle.com.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      {children}
    </section>
  )
}

function SubHead({ children }: { children: ReactNode }) {
  return (
    <p className="font-medium text-slate-800 dark:text-slate-200">{children}</p>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  )
}

// Standalone page reached from Settings, so users can read the policy any
// time after setup.
export default function PrivacyPage() {
  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to Settings
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Privacy Policy
      </h2>
      <Card>
        <PrivacyContent />
      </Card>
    </div>
  )
}
