import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './ui'

// Effective date shown at the top of the policy. Update this whenever the
// policy text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Acceptable Use Policy text, shown on the standalone
// /acceptable-use page reached from Settings. It forms part of the Terms of
// Use. Plain-English and deliberately conservative — NOT legal advice, and
// should be reviewed by a solicitor before being relied on commercially.
export function AcceptableUseContent() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p>
        This Acceptable Use Policy (“Policy”) forms part of the RefrigHandle
        Terms of Use and applies to all Account Owners and Authorised Users.
      </p>
      <p>
        By accessing or using RefrigHandle, you agree to comply with this
        Policy.
      </p>

      <Section title="1. Purpose">
        <p>
          RefrigHandle is intended to assist businesses in recording and
          managing refrigerant-related information.
        </p>
        <p>
          This Policy exists to protect the security, reliability and integrity
          of the Services and to ensure that all users can use RefrigHandle
          safely and lawfully.
        </p>
      </Section>

      <Section title="2. Lawful use">
        <p>You may only use RefrigHandle for lawful purposes.</p>
        <p>
          You must comply with all applicable laws, regulations and industry
          requirements relevant to your activities.
        </p>
        <p>RefrigHandle does not authorise or permit unlawful conduct.</p>
      </Section>

      <Section title="3. Prohibited activities">
        <p>You must not:</p>
        <Bullets
          items={[
            'use RefrigHandle for illegal purposes;',
            'provide false or misleading information;',
            'impersonate another person or organisation;',
            'attempt to gain unauthorised access to accounts, systems or data;',
            'interfere with the operation or security of the Services;',
            'intentionally introduce malware, viruses or harmful code;',
            'conduct denial-of-service attacks or similar activities;',
            'use automated tools to scrape or extract information without permission;',
            'reverse engineer, decompile or attempt to discover source code except where permitted by law;',
            'use the Services in a manner likely to damage RefrigHandle or other users.',
          ]}
        />
      </Section>

      <Section title="4. Account sharing">
        <p>
          The Account Owner is responsible for controlling access to Authorised
          Users.
        </p>
        <p>Users must not:</p>
        <Bullets
          items={[
            'share passwords with unauthorised persons;',
            'allow external parties to access the Services without approval;',
            'circumvent user permissions or security controls.',
          ]}
        />
      </Section>

      <Section title="5. Misuse of data">
        <p>Users must not:</p>
        <Bullets
          items={[
            'access information belonging to another Account Owner without authorisation;',
            'attempt to bypass security restrictions;',
            'copy or distribute data that they are not entitled to access;',
            'use information obtained through RefrigHandle for unlawful purposes.',
          ]}
        />
      </Section>

      <Section title="6. Intellectual property">
        <p>Users must not:</p>
        <Bullets
          items={[
            'copy or reproduce RefrigHandle software;',
            'remove copyright notices;',
            'use RefrigHandle branding without permission;',
            'create competing products using RefrigHandle software or content.',
          ]}
        />
        <p>
          Business Data entered by Account Owners remains the property of the
          Account Owner.
        </p>
      </Section>

      <Section title="7. Age restrictions">
        <p>All users of RefrigHandle must be at least 18 years of age.</p>
        <p>
          The Account Owner is responsible for ensuring compliance with this
          requirement.
        </p>
      </Section>

      <Section title="8. Security">
        <p>
          Users must take reasonable steps to protect their accounts and
          devices.
        </p>
        <p>Users should:</p>
        <Bullets
          items={[
            'maintain secure passwords;',
            'keep devices updated;',
            'promptly report suspected unauthorised access;',
            'protect exported records and backups.',
          ]}
        />
      </Section>

      <Section title="9. Fair usage">
        <p>RefrigHandle is intended for ordinary and reasonable business use.</p>
        <p>
          Users must not use the Services in a manner that unreasonably consumes
          system resources, negatively affects other users, or places excessive
          demands on the Services.
        </p>
        <p>Examples may include:</p>
        <Bullets
          items={[
            'excessive storage usage;',
            'excessive uploads unrelated to the purpose of the Services;',
            'automated or abusive activity;',
            'attempts to bypass subscription limits;',
            'using RefrigHandle for purposes unrelated to refrigerant management and associated business operations.',
          ]}
        />
        <p>
          RefrigHandle may impose reasonable usage limits, restrict
          functionality or require users to upgrade to an appropriate
          subscription plan where necessary to maintain the stability and
          performance of the Services.
        </p>
      </Section>

      <Section title="10. Monitoring and enforcement">
        <p>RefrigHandle may investigate suspected breaches of this Policy.</p>
        <p>Where reasonably necessary, RefrigHandle may:</p>
        <Bullets
          items={[
            'suspend access;',
            'restrict functionality;',
            'remove content;',
            'terminate Accounts;',
            'report unlawful activity to appropriate authorities.',
          ]}
        />
        <p>
          RefrigHandle is not required to provide advance notice where immediate
          action is necessary to protect the Services or other users.
        </p>
      </Section>

      <Section title="11. Changes to this Policy">
        <p>RefrigHandle may amend this Policy from time to time.</p>
        <p>
          Updated versions become effective when published through the
          RefrigHandle website or application. Continued use of the Services
          constitutes acceptance of the revised Policy.
        </p>
      </Section>

      <Section title="12. Contact information">
        <p>RefrigHandle</p>
        <p>
          For questions about this Policy, contact us at legal@refrighandle.com.
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
export default function AcceptableUsePage() {
  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to Settings
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Acceptable Use Policy
      </h2>
      <Card>
        <AcceptableUseContent />
      </Card>
    </div>
  )
}
