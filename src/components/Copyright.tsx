import type { ReactNode } from 'react'
import { BackLink } from './BackLink'
import { Card } from './ui'

// Effective date shown at the top of the policy. Update this whenever the
// policy text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Copyright and Trademark Policy text, shown on the
// standalone /copyright page reached from Settings. Plain-English and
// deliberately conservative — NOT legal advice, and should be reviewed by a
// solicitor before being relied on commercially.
export function CopyrightContent() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p>
        This Copyright and Trademark Policy applies to the Refrigister website,
        applications, documentation and related services.
      </p>

      <Section title="1. Purpose">
        <p>
          This Policy explains the ownership of intellectual property associated
          with Refrigister and the conditions under which Refrigister materials
          may be used.
        </p>
      </Section>

      <Section title="2. Ownership of Refrigister materials">
        <p>
          Unless otherwise stated, Refrigister and its licensors own all
          intellectual property rights associated with the Services, including:
        </p>
        <Bullets
          items={[
            'software and source code;',
            'databases and system architecture;',
            'logos and branding;',
            'website content;',
            'documentation and guides;',
            'graphics and icons;',
            'reports and templates;',
            'text, layouts and designs.',
          ]}
        />
        <p>
          These materials are protected by copyright and other applicable
          intellectual property laws.
        </p>
      </Section>

      <Section title="3. Business Data ownership">
        <p>
          Business Data entered into Refrigister remains the property of the
          Account Owner.
        </p>
        <p>Nothing in this Policy transfers ownership of Business Data to Refrigister.</p>
        <p>
          Refrigister receives only the limited rights necessary to store,
          process and transmit Business Data for the purpose of providing the
          Services.
        </p>
      </Section>

      <Section title="4. Limited permission to use the Services">
        <p>
          Subject to the Terms of Use, Refrigister grants users a limited,
          non-exclusive, non-transferable and revocable licence to use the
          Services for internal business purposes.
        </p>
        <p>No ownership rights are transferred to users.</p>
      </Section>

      <Section title="5. Restrictions">
        <p>Without prior written permission, users must not:</p>
        <Bullets
          items={[
            'copy or reproduce Refrigister software;',
            'distribute source code;',
            'remove copyright notices;',
            'modify or create derivative works from the Services;',
            'use Refrigister branding in a misleading manner;',
            'represent themselves as being affiliated with Refrigister;',
            'create competing products using Refrigister materials.',
          ]}
        />
      </Section>

      <Section title="6. Refrigister name and branding">
        <p>
          The Refrigister name, logos, graphics and branding are proprietary to
          Refrigister.
        </p>
        <p>
          Use of Refrigister branding in advertising, websites, publications or
          other materials requires prior written permission unless otherwise
          authorised.
        </p>
        <p>
          Nothing in this Policy grants users any ownership rights in Refrigister
          branding.
        </p>
      </Section>

      <Section title="7. Screenshots and references">
        <p>
          Users may refer to Refrigister by name and may use limited screenshots
          for:
        </p>
        <Bullets
          items={[
            'reviews;',
            'training materials;',
            'educational purposes;',
            'internal business documentation;',
          ]}
        />
        <p>provided that:</p>
        <Bullets
          items={[
            'the material is not misleading;',
            'the material does not imply endorsement by Refrigister;',
            'copyright notices are not removed.',
          ]}
        />
        <p>
          Refrigister may request removal of material that is inaccurate,
          misleading or damaging to its reputation.
        </p>
      </Section>

      <Section title="8. Third-party intellectual property">
        <p>
          Some materials or services used by Refrigister may belong to third
          parties.
        </p>
        <p>
          All third-party intellectual property remains the property of its
          respective owners.
        </p>
        <p>Nothing in this Policy grants rights to third-party intellectual property.</p>
      </Section>

      <Section title="9. Reporting infringement">
        <p>
          If you believe that your copyright or intellectual property rights have
          been infringed by material associated with Refrigister, please contact:
        </p>
        <p>Email: legal@refrigister.com</p>
        <p>Please provide:</p>
        <Bullets
          items={[
            'your contact details;',
            'details of the material concerned;',
            'the basis of your claim;',
            'any supporting information reasonably required to investigate the matter.',
          ]}
        />
      </Section>

      <Section title="10. Changes to this Policy">
        <p>Refrigister may amend this Policy from time to time.</p>
        <p>
          Updated versions become effective when published through the website or
          application. Continued use of the Services constitutes acceptance of the
          revised Policy.
        </p>
      </Section>

      <Section title="11. Contact information">
        <p>Refrigister</p>
        <p>For questions about this Policy, contact us at legal@refrigister.com.</p>
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
export default function CopyrightPage() {
  return (
    <div className="space-y-4">
      <BackLink>← Back to Settings</BackLink>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Copyright and Trademark Policy
      </h2>
      <Card>
        <CopyrightContent />
      </Card>
    </div>
  )
}
