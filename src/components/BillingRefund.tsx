import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from './ui'

// Effective date shown at the top of the policy. Update this whenever the
// policy text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Billing and Refund Policy text, shown on the standalone
// /billing page reached from Settings. It forms part of the Terms of Use.
// Plain-English and deliberately conservative — NOT legal advice, and should
// be reviewed by a solicitor before being relied on commercially.
export function BillingRefundContent() {
  return (
    <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p>
        This Billing and Refund Policy forms part of the RefrigHandle Terms of
        Use.
      </p>
      <p>
        Nothing in this Policy excludes, restricts or modifies rights that
        cannot lawfully be excluded under the Australian Consumer Law.
      </p>

      <Section title="1. Purpose">
        <p>
          This Policy explains how subscription charges, billing, cancellations
          and refund requests are handled by RefrigHandle.
        </p>
        <p>By subscribing to the Services, the Account Owner accepts this Policy.</p>
      </Section>

      <Section title="2. Subscription charges">
        <p>
          Subscriptions are charged in advance according to the selected billing
          period.
        </p>
        <p>
          Fees are payable whether or not the Services are actively used during
          that period.
        </p>
        <p>
          Subscription fees represent payment for access to the Services and are
          not based upon usage levels.
        </p>
        <p>
          RefrigHandle may change subscription plans, pricing and billing
          arrangements from time to time.
        </p>
      </Section>

      <Section title="3. Cancellation">
        <p>The Account Owner may cancel a subscription at any time.</p>
        <p>
          Cancellation prevents future renewals only and does not entitle the
          Account Owner to a full or partial refund for the current billing
          period.
        </p>
        <p>
          Access to paid features may continue until the expiry of the existing
          subscription period.
        </p>
      </Section>

      <Section title="4. No refunds for change of mind">
        <p>
          Unless required by law, RefrigHandle does not provide refunds for:
        </p>
        <Bullets
          items={[
            'change of mind;',
            'failure to use the Services;',
            'dissatisfaction arising from features that were accurately described;',
            'accidental purchases;',
            'incorrect plan selection;',
            'employee turnover;',
            'staff training requirements;',
            'business closure;',
            'loss of internet access;',
            'temporary interruptions outside RefrigHandle’s reasonable control;',
            'failure to cancel before renewal;',
            'unused portions of subscription periods.',
          ]}
        />
      </Section>

      <Section title="5. Annual and long-term subscriptions">
        <p>
          Where annual or other long-term subscription plans are offered, early
          cancellation does not entitle the Account Owner to a prorated or
          partial refund.
        </p>
        <p>
          The Account Owner remains responsible for all fees already charged.
        </p>
      </Section>

      <Section title="6. Outstanding amounts">
        <p>
          Cancellation or account closure does not cancel or extinguish any
          outstanding fees, invoices or payment obligations owed to RefrigHandle.
        </p>
        <p>RefrigHandle reserves the right to pursue recovery of unpaid amounts.</p>
      </Section>

      <Section title="7. Account suspension or termination">
        <p>If an Account is suspended or terminated due to:</p>
        <Bullets
          items={[
            'breach of the Terms of Use;',
            'breach of the Acceptable Use Policy;',
            'fraudulent activity;',
            'misuse of the Services;',
            'unlawful conduct;',
          ]}
        />
        <p>no refund will be provided.</p>
      </Section>

      <Section title="8. Billing errors">
        <p>
          If RefrigHandle determines that an incorrect charge or duplicate
          payment has occurred, RefrigHandle may issue a refund or account credit
          at its discretion.
        </p>
      </Section>

      <Section title="9. Promotional offers">
        <p>Discounts, credits, free trials and promotional offers:</p>
        <Bullets
          items={[
            'may be withdrawn or modified at any time;',
            'have no cash value unless expressly stated otherwise;',
            'are not redeemable for cash;',
            'do not create ongoing entitlement to discounted pricing.',
          ]}
        />
      </Section>

      <Section title="10. Subscription changes">
        <p>
          Upgrades, downgrades and plan changes may take effect immediately or at
          the beginning of the next billing cycle, as determined by RefrigHandle.
        </p>
        <p>
          Unused portions of previous subscription periods are generally
          non-refundable.
        </p>
      </Section>

      <Section title="11. Discretionary refunds">
        <p>
          RefrigHandle may, but is not obliged to, provide refunds, credits or
          other remedies on a case-by-case basis.
        </p>
        <p>
          Any refund or credit issued in one instance does not create an
          obligation to provide similar refunds in future circumstances.
        </p>
      </Section>

      <Section title="12. Chargebacks and payment disputes">
        <p>
          If an Account Owner initiates a chargeback, payment reversal or dispute
          through a financial institution or payment provider, RefrigHandle may:
        </p>
        <Bullets
          items={[
            'suspend access to the Services;',
            'restrict account functionality;',
            'terminate the Account;',
            'recover outstanding amounts and associated fees where permitted by law.',
          ]}
        />
        <p>
          The existence of a payment dispute does not automatically cancel
          obligations owed to RefrigHandle.
        </p>
      </Section>

      <Section title="13. Late payments">
        <p>
          Where payment is not successfully processed or an invoice remains
          unpaid after its due date, RefrigHandle may, without limiting any other
          rights available:
        </p>
        <Bullets
          items={[
            'issue payment reminders;',
            'suspend access to some or all Services;',
            'restrict account functionality;',
            'prevent the creation of new records or users;',
            'terminate the Account for continued non-payment;',
            'recover outstanding amounts through lawful collection processes.',
          ]}
        />
        <p>
          The Account Owner remains responsible for all fees incurred prior to
          suspension or termination.
        </p>
        <p>
          Any costs reasonably incurred by RefrigHandle in recovering overdue
          amounts, including collection costs and fees charged by payment
          providers, may be recoverable to the extent permitted by law.
        </p>
        <p>
          RefrigHandle is not responsible for losses suffered by the Account
          Owner arising from suspension or restriction resulting from unpaid
          amounts.
        </p>
      </Section>

      <Section title="14. Australian Consumer Law">
        <p>
          Nothing in this Billing and Refund Policy excludes, restricts or
          modifies any rights or remedies available under the Australian Consumer
          Law.
        </p>
        <p>
          Where the Services fail to comply with guarantees that cannot lawfully
          be excluded, customers may be entitled to remedies provided by law.
        </p>
      </Section>

      <Section title="15. Changes to this Policy">
        <p>RefrigHandle may amend this Billing and Refund Policy from time to time.</p>
        <p>
          Updated versions become effective when published through the
          RefrigHandle website or application. Continued use of the Services
          constitutes acceptance of the revised Policy.
        </p>
      </Section>

      <Section title="16. Contact information">
        <p>RefrigHandle</p>
        <p>
          For billing enquiries, contact us at [insert contact email].
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
export default function BillingRefundPage() {
  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to Settings
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Billing and Refund Policy
      </h2>
      <Card>
        <BillingRefundContent />
      </Card>
    </div>
  )
}
