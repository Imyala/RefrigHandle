import type { ReactNode } from 'react'
import { BackLink } from './BackLink'
import { Card } from './ui'

// Effective date shown at the top of the policy. Update this whenever the
// policy text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Security Policy and Responsible Disclosure Policy text,
// shown on the standalone /security page reached from Settings. Plain-English
// and deliberately conservative — NOT legal advice, and should be reviewed by
// a solicitor before being relied on commercially.
export function SecurityContent() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p>
        This Security Policy explains RefrigHandle’s approach to protecting
        information and sets out the process for reporting potential security
        vulnerabilities.
      </p>

      <Section title="1. Purpose">
        <p>
          RefrigHandle recognises the importance of protecting Business Data and
          maintaining the security, integrity and availability of the Services.
        </p>
        <p>
          While no system can guarantee absolute security, RefrigHandle seeks to
          implement reasonable administrative, technical and operational
          safeguards.
        </p>
      </Section>

      <Section title="2. Security measures">
        <p>RefrigHandle may implement security measures including:</p>
        <Bullets
          items={[
            'user authentication controls;',
            'password protection;',
            'encrypted communications where reasonably practicable;',
            'access controls;',
            'monitoring for suspicious activity;',
            'backup and disaster recovery procedures;',
            'software updates and maintenance.',
          ]}
        />
        <p>Security measures may change over time as the Services evolve.</p>
      </Section>

      <Section title="3. Shared responsibility">
        <p>
          Security is a shared responsibility between RefrigHandle and the Account
          Owner.
        </p>
        <p>The Account Owner is responsible for:</p>
        <Bullets
          items={[
            'maintaining secure passwords;',
            'controlling Authorised User access;',
            'protecting exported records;',
            'securing devices used to access the Services;',
            'promptly removing users who no longer require access.',
          ]}
        />
        <p>
          RefrigHandle is not responsible for security incidents caused by actions
          or omissions of the Account Owner or Authorised Users.
        </p>
      </Section>

      <Section title="4. No guarantee of security">
        <p>
          Although reasonable efforts are made to protect information, RefrigHandle
          cannot guarantee that the Services will be free from:
        </p>
        <Bullets
          items={[
            'unauthorised access;',
            'cyberattacks;',
            'malware;',
            'data loss;',
            'service interruptions.',
          ]}
        />
        <p>
          Users acknowledge that use of online services involves inherent risks.
        </p>
      </Section>

      <Section title="5. Security incidents">
        <p>
          Where RefrigHandle becomes aware of a significant security incident
          affecting the Services, RefrigHandle may:
        </p>
        <Bullets
          items={[
            'investigate the incident;',
            'take steps to contain the issue;',
            'restore affected systems;',
            'notify affected users where considered appropriate or required by law.',
          ]}
        />
        <p>
          The timing and content of any notifications will be determined by
          RefrigHandle based on the circumstances of the incident.
        </p>
      </Section>

      <Section title="6. Responsible disclosure">
        <p>
          If a person discovers a suspected vulnerability affecting RefrigHandle,
          they are encouraged to report it responsibly.
        </p>
        <p>
          Reports should include sufficient information to allow investigation.
        </p>
      </Section>

      <Section title="7. Prohibited activities">
        <p>Responsible disclosure does not authorise:</p>
        <Bullets
          items={[
            'accessing information belonging to other users;',
            'modifying or deleting data;',
            'disrupting the Services;',
            'conducting denial-of-service attacks;',
            'exploiting vulnerabilities for personal gain;',
            'publicly disclosing vulnerabilities before RefrigHandle has had a reasonable opportunity to investigate.',
          ]}
        />
        <p>Any unauthorised activity may result in legal action.</p>
      </Section>

      <Section title="8. Third-party services">
        <p>
          RefrigHandle relies on third-party providers for certain aspects of the
          Services.
        </p>
        <p>
          RefrigHandle is not responsible for vulnerabilities or incidents arising
          solely from third-party systems outside its reasonable control.
        </p>
      </Section>

      <Section title="9. Changes to this Policy">
        <p>RefrigHandle may amend this Policy from time to time.</p>
        <p>
          Updated versions become effective when published through the
          RefrigHandle website or application. Continued use of the Services
          constitutes acceptance of the revised Policy.
        </p>
      </Section>

      <Section title="10. Contact information">
        <p>RefrigHandle</p>
        <p>
          To report a suspected security vulnerability, contact us at
          legal@refrighandle.com.
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
export default function SecurityPage() {
  return (
    <div className="space-y-4">
      <BackLink>← Back to Settings</BackLink>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Security and Responsible Disclosure Policy
      </h2>
      <Card>
        <SecurityContent />
      </Card>
    </div>
  )
}
