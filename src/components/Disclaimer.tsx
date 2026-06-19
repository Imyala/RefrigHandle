import type { ReactNode } from 'react'
import { BackLink } from './BackLink'
import { Card } from './ui'

// Effective date shown at the top of the disclaimer. Update this whenever
// the text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Website Disclaimer and General Information Disclaimer
// text, shown on the standalone /disclaimer page reached from Settings.
// Plain-English and deliberately conservative — NOT legal advice, and should
// be reviewed by a solicitor before being relied on commercially.
export function DisclaimerContent() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p>
        This Disclaimer applies to the RefrigHandle website, applications, tools,
        calculators, reports, articles and all other content made available by
        RefrigHandle.
      </p>

      <Section title="1. Purpose">
        <p>
          The information provided by RefrigHandle is intended for general
          informational and educational purposes only.
        </p>
        <p>
          While reasonable efforts are made to maintain accurate and up-to-date
          information, RefrigHandle does not guarantee the completeness, accuracy
          or suitability of any information provided.
        </p>
      </Section>

      <Section title="2. No professional advice">
        <p>Information provided by RefrigHandle does not constitute:</p>
        <Bullets
          items={[
            'legal advice;',
            'tax advice;',
            'accounting advice;',
            'engineering advice;',
            'regulatory advice;',
            'technical certification;',
            'professional consulting services.',
          ]}
        />
        <p>
          Users should obtain independent advice appropriate to their
          circumstances.
        </p>
      </Section>

      <Section title="3. User responsibility">
        <p>
          The Account Owner and Authorised Users remain solely responsible for:
        </p>
        <Bullets
          items={[
            'verifying information before relying upon it;',
            'complying with applicable laws and regulations;',
            'exercising professional judgment;',
            'ensuring the accuracy of records and calculations.',
          ]}
        />
        <p>
          RefrigHandle does not assume responsibility for decisions made by users.
        </p>
      </Section>

      <Section title="4. Refrigerant and technical information">
        <p>
          Technical information, pressure values, refrigerant data, calculators,
          fault codes, charging information and similar content are provided for
          general reference purposes only.
        </p>
        <p>Actual operating conditions may vary.</p>
        <p>Users should always:</p>
        <Bullets
          items={[
            'follow manufacturer documentation;',
            'comply with applicable standards;',
            'exercise appropriate professional judgment.',
          ]}
        />
      </Section>

      <Section title="5. Regulatory information">
        <p>
          References to legislation, standards, industry schemes and regulatory
          bodies are provided for informational purposes only.
        </p>
        <p>
          RefrigHandle does not guarantee that such information is current,
          complete or applicable to every circumstance.
        </p>
        <p>
          Users remain responsible for understanding and complying with their own
          legal obligations.
        </p>
      </Section>

      <Section title="6. No association with regulatory authorities">
        <p>
          Unless expressly stated otherwise, RefrigHandle is an independent
          software platform and is not operated by, endorsed by, or acting on
          behalf of:
        </p>
        <Bullets
          items={[
            'the Australian Refrigeration Council (ARC);',
            'ARCtick;',
            'the Australian Taxation Office (ATO);',
            'ASIC;',
            'any government authority.',
          ]}
        />
      </Section>

      <Section title="7. Calculators and automated features">
        <p>
          Calculators, reports, automated functions and generated outputs are
          provided as tools to assist users.
        </p>
        <p>
          RefrigHandle does not guarantee that calculations or generated
          information will be free from error.
        </p>
        <p>
          Users are responsible for reviewing and verifying results before relying
          upon them.
        </p>
      </Section>

      <Section title="8. AI features">
        <p>
          Where artificial intelligence or automated assistance features are
          provided, outputs may contain errors, omissions or inaccuracies.
        </p>
        <p>
          AI-generated content should be independently reviewed and verified
          before use.
        </p>
        <p>
          RefrigHandle accepts no responsibility for decisions made solely on the
          basis of AI-generated information.
        </p>
      </Section>

      <Section title="9. External links">
        <p>
          The RefrigHandle website or Services may contain links to third-party
          websites.
        </p>
        <p>
          RefrigHandle does not control and is not responsible for the content,
          accuracy or practices of third-party websites.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the maximum extent permitted by law, RefrigHandle excludes liability
          for any loss, damage or expense arising from reliance on information
          provided through the Services.
        </p>
        <p>
          Nothing in this Disclaimer excludes rights that cannot lawfully be
          excluded under the Australian Consumer Law.
        </p>
      </Section>

      <Section title="11. Changes to this Disclaimer">
        <p>RefrigHandle may amend this Disclaimer from time to time.</p>
        <p>
          Updated versions become effective when published through the website or
          application. Continued use of the Services constitutes acceptance of the
          revised Disclaimer.
        </p>
      </Section>

      <Section title="12. Contact information">
        <p>RefrigHandle</p>
        <p>
          For questions about this Disclaimer, contact us at
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

// Standalone page reached from Settings, so users can read the disclaimer any
// time after setup.
export default function DisclaimerPage() {
  return (
    <div className="space-y-4">
      <BackLink>← Back to Settings</BackLink>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Website and General Information Disclaimer
      </h2>
      <Card>
        <DisclaimerContent />
      </Card>
    </div>
  )
}
