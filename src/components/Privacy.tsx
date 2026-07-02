import type { ReactNode } from 'react'
import { BackLink } from './BackLink'
import { Card } from './ui'

// Effective date shown at the top of the policy. Update this whenever the
// policy text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '2 July 2026'

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

      <Section title="3. Information the app holds — and where it lives">
        <p>
          RefrigHandle is an offline-first application.{' '}
          <strong>
            Everything you enter is stored on your own device
          </strong>{' '}
          (in your browser's local storage) — RefrigHandle does not operate
          server accounts and does not receive, see, or hold a copy of your
          data.
        </p>
        <SubHead>Information you enter, stored on your device</SubHead>
        <Bullets
          items={[
            'Business identity: business name, ABN, Refrigerant Trading Authorisation number and expiry',
            'Technician profiles: names, roles, Refrigerant Handling Licence numbers and expiries, and (if set) a hashed profile password',
            'Operational records: customer/site records, equipment, cylinders, refrigerant transactions, jobs, audit logs, notes',
            'Photos and customer signatures you attach (stored on the device only; never synced)',
            'A local diagnostics log of app errors on this device (never sent anywhere unless you copy and share it yourself)',
          ]}
        />
        <SubHead>What leaves your device</SubHead>
        <Bullets
          items={[
            'Nothing, by default. There are no analytics, no tracking, no advertising identifiers, and RefrigHandle does not collect your IP address, email, phone number or billing details — the app has no billing today.',
            'Optional cloud sync (off by default): if your business sets up its own Supabase project and turns sync on, your Business Data (excluding photos and signatures) is uploaded to THAT project — infrastructure your business chooses and controls, in the region it picks. See the in-app sync notes for the security model.',
            'Password screening: when you set a profile password, the first 5 characters of a one-way hash (SHA-1 prefix) are sent to the Have I Been Pwned breach-checking service to warn you if the password is known-breached. The password itself, and never anything identifying you, cannot be derived from this prefix (k-anonymity). If you are offline the check is skipped.',
            'Standard web hosting: like any website, the server that delivers the app (e.g. GitHub Pages) may keep ordinary access logs (IP address, browser type) under its own privacy policy. RefrigHandle does not receive these.',
          ]}
        />
      </Section>

      <Section title="4. Why information is handled this way">
        <p>The information you enter exists to:</p>
        <Bullets
          items={[
            'keep the refrigerant-handling records your business is required to keep;',
            'produce reports (equipment logbooks, quarterly figures, audit packs) for your own compliance;',
            'synchronise Business Data between your own devices, if you enable sync;',
            'warn you about weak or breached profile passwords, if you set one.',
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

      <Section title="6. How information is stored and protected">
        <p>Information is stored:</p>
        <Bullets
          items={[
            'on your devices (browser local storage and on-device attachment storage);',
            'in backup files you export yourself and keep wherever you choose;',
            'in your own Supabase project, only if your business enables the optional self-hosted sync.',
          ]}
        />
        <p>
          On-device protections include hashed profile passwords (never stored
          in plain text), an append-only tamper-evident change log, and
          role-gated destructive actions. Because the data lives on your
          device, device security (screen lock, who you hand the phone to)
          and your own backups are part of protecting it. No method of
          electronic storage can guarantee absolute security.
        </p>
      </Section>

      <Section title="7. Third-party services">
        <p>The app touches exactly two third-party services, both described in section 3:</p>
        <Bullets
          items={[
            'Have I Been Pwned — anonymous breached-password screening when you set a profile password;',
            'Supabase — only if your business sets up and enables its own sync project; the project belongs to your business, not to RefrigHandle.',
          ]}
        />
        <p>
          RefrigHandle uses no analytics, advertising, email delivery or
          payment providers.
        </p>
      </Section>

      <Section title="8. Disclosure of information">
        <p>
          RefrigHandle does not sell personal information — and because your
          data lives on your devices (or in your own sync project), RefrigHandle
          is not in a position to disclose it. Disclosure of Business Data is
          controlled by the Account Owner: who they hand a device to, who they
          share a Team ID with, and who they send exports to.
        </p>
      </Section>

      <Section title="9. Overseas processing">
        <p>
          By default, no information is processed overseas by RefrigHandle. If
          your business enables the optional sync, your data is stored in the
          Supabase region your business selected when it created its project —
          choose an Australian region if your obligations require onshore
          storage. The Have I Been Pwned service (which receives only an
          anonymous 5-character hash prefix) is operated internationally.
        </p>
      </Section>

      <Section title="10. Data retention">
        <p>
          Records stay on your device until you remove them or clear the
          browser's site data — the app never deletes your records on its own
          (removed records go to an in-app recycle bin). Browsers can evict
          site data under storage pressure; the app requests persistent
          storage and reminds you to export backups because{' '}
          <strong>
            your exported backups are the durable copy of the record
          </strong>
          .
        </p>
        <p>
          The Account Owner remains responsible for retaining records for the
          periods required by applicable laws and regulations and should not
          rely solely on RefrigHandle as a long-term archival service.
        </p>
      </Section>

      <Section title="11. Account closure and deletion">
        <p>
          Closing the account is an on-device action: the app first downloads
          a ZIP of the business's records for the Account Owner to keep, then
          erases the app's data from that device. Do this on each device the
          business used.
        </p>
        <Bullets
          items={[
            'Export and securely retain copies of all records before closing — the erase is immediate on that device;',
            'if your business used the optional self-hosted sync, also delete the row in your own Supabase project (the in-app sync notes show the one-line SQL) — RefrigHandle has no access to it and cannot delete it for you;',
            'RefrigHandle retains nothing after closure, because it held nothing: there is no server-side account to delete.',
          ]}
        />
      </Section>

      <Section title="12. Cookies and analytics">
        <p>
          RefrigHandle uses <strong>no cookies and no analytics</strong>. The
          browser's local storage is used solely to keep your own records and
          settings on your device — nothing in it is read by, or transmitted
          to, RefrigHandle or any third party.
        </p>
      </Section>

      <Section title="13. Access and correction">
        <p>
          Your information is on your device, so you can access and correct it
          directly in the app at any time (corrections to compliance records
          are made as append-only re-statements, preserving the original for
          audit). RefrigHandle itself holds no Personal Information about you
          to produce or correct; for questions, contact us at the address in
          section 18.
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

      <Section title="16. Licence information">
        <p>
          RefrigHandle does not verify Refrigerant Handling Licence numbers or
          the identity of users. Users and businesses are solely responsible for
          ensuring that all licence information entered into the platform is
          accurate, current, and compliant with applicable laws and regulations.
          RefrigHandle relies on information provided by users and makes no
          representation regarding the validity of any licence.
        </p>
      </Section>

      <Section title="17. Changes to this Privacy Policy">
        <p>This Privacy Policy may be updated from time to time.</p>
        <p>
          The latest version will be made available through the RefrigHandle
          website or application. Continued use of the Services after publication
          of an updated Privacy Policy constitutes acceptance of the revised
          Privacy Policy.
        </p>
      </Section>

      <Section title="18. Contact information">
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
      <BackLink>← Back to Settings</BackLink>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Privacy Policy
      </h2>
      <Card>
        <PrivacyContent />
      </Card>
    </div>
  )
}
