import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './ui'

// Effective date shown at the top of the policy. Update this whenever the
// policy text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Data Retention and Deletion Policy text, shown on the
// standalone /data-retention page reached from Settings. It forms part of
// the Terms of Use and Privacy Policy. Plain-English and deliberately
// conservative — NOT legal advice, and should be reviewed by a solicitor
// before being relied on commercially.
export function DataRetentionContent() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p>
        This Data Retention and Deletion Policy forms part of the RefrigHandle
        Terms of Use and Privacy Policy.
      </p>

      <Section title="1. Purpose">
        <p>
          This Policy explains how RefrigHandle manages the retention, export,
          closure and deletion of information stored within the Services.
        </p>
        <p>
          Nothing in this Policy transfers legal record-keeping obligations from
          the Account Owner to RefrigHandle.
        </p>
      </Section>

      <Section title="2. Ownership of records">
        <p>
          All Business Data entered into RefrigHandle remains the property of the
          Account Owner.
        </p>
        <p>The Account Owner is responsible for:</p>
        <Bullets
          items={[
            'maintaining accurate records;',
            'exporting records where necessary;',
            'complying with applicable laws and regulations;',
            'retaining records for any required statutory periods.',
          ]}
        />
        <p>RefrigHandle is not a records custodian or archival service.</p>
      </Section>

      <Section title="3. Active accounts">
        <p>
          While an Account remains active, RefrigHandle may retain Business Data
          for the purpose of:
        </p>
        <Bullets
          items={[
            'providing the Services;',
            'maintaining synchronisation across devices;',
            'security monitoring;',
            'backup and disaster recovery;',
            'improving reliability and performance.',
          ]}
        />
      </Section>

      <Section title="4. Exporting data">
        <p>
          The Account Owner is responsible for exporting and securely retaining
          copies of records it wishes to preserve.
        </p>
        <p>
          RefrigHandle may provide export tools, reports or downloadable files to
          assist with this process.
        </p>
        <p>
          The availability of export functionality does not transfer
          responsibility for record retention to RefrigHandle.
        </p>
      </Section>

      <Section title="5. Account closure">
        <p>The Account Owner may request closure of an Account at any time.</p>
        <p>
          Before requesting closure, the Account Owner should export and securely
          retain copies of all records it wishes to keep.
        </p>
        <p>Following account closure:</p>
        <Bullets
          items={[
            'access to the Services may cease;',
            'Authorised Users may lose access;',
            'Business Data may become unavailable;',
            'deletion processes may commence.',
          ]}
        />
      </Section>

      <Section title="6. Retention after closure">
        <p>
          Following account closure, RefrigHandle may retain certain information
          for a reasonable period where necessary for:
        </p>
        <Bullets
          items={[
            'security purposes;',
            'fraud prevention;',
            'dispute resolution;',
            'backup and disaster recovery;',
            'enforcement of contractual rights;',
            'compliance with applicable laws.',
          ]}
        />
        <p>Retention periods may vary depending on operational requirements.</p>
      </Section>

      <Section title="7. Permanent deletion">
        <p>
          Business Data may be permanently deleted once it is no longer reasonably
          required for operational, legal, security or administrative purposes.
        </p>
        <p>Once permanently deleted, information may not be recoverable.</p>
        <p>
          RefrigHandle is not responsible for losses arising from the Account
          Owner’s failure to maintain independent copies of records.
        </p>
      </Section>

      <Section title="8. Backup systems">
        <p>
          RefrigHandle may maintain backup systems to assist with disaster
          recovery and service continuity.
        </p>
        <p>
          Backup systems are designed for operational recovery and are not
          intended to function as customer archives.
        </p>
        <p>
          Information contained in backup systems may persist for a period of time
          after deletion from active systems.
        </p>
      </Section>

      <Section title="9. Legal requirements">
        <p>
          Where required by law, court order or lawful request from an authorised
          authority, RefrigHandle may retain or disclose information as required.
        </p>
      </Section>

      <Section title="10. Business transfers">
        <p>
          If RefrigHandle or its assets are sold, merged or transferred, Business
          Data and associated information may be transferred to the successor
          entity, subject to applicable laws.
        </p>
      </Section>

      <Section title="11. No guarantee of recovery">
        <p>
          RefrigHandle does not guarantee that deleted information can be
          recovered.
        </p>
        <p>
          The Account Owner should not rely upon RefrigHandle as its sole backup
          or long-term storage solution.
        </p>
      </Section>

      <Section title="12. Abandoned accounts">
        <p>
          RefrigHandle may identify Accounts that have remained inactive for an
          extended period.
        </p>
        <p>
          Where an Account is considered abandoned, RefrigHandle may, at its
          discretion:
        </p>
        <Bullets
          items={[
            'provide notice to the Account Owner where reasonably practicable;',
            'restrict access to the Services;',
            'archive information;',
            'commence deletion processes;',
            'permanently remove Business Data.',
          ]}
        />
        <p>
          The Account Owner remains responsible for maintaining independent copies
          of records and should not rely upon RefrigHandle to retain inactive or
          abandoned Accounts indefinitely.
        </p>
      </Section>

      <Section title="13. Changes to this Policy">
        <p>RefrigHandle may amend this Policy from time to time.</p>
        <p>
          Updated versions become effective when published through the
          RefrigHandle website or application. Continued use of the Services
          constitutes acceptance of the revised Policy.
        </p>
      </Section>

      <Section title="14. Contact information">
        <p>RefrigHandle</p>
        <p>
          For questions about this Policy, contact us at [insert contact email].
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
export default function DataRetentionPage() {
  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to Settings
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Data Retention and Deletion Policy
      </h2>
      <Card>
        <DataRetentionContent />
      </Card>
    </div>
  )
}
