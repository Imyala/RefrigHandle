// One clear, fixed statement of the record-retention rules — who enforces
// them and under which laws — leaving it to the business to decide which
// applies to them. Colour and size are inherited from the parent, so it
// drops cleanly into the amber closure card or a muted note.
export function RetentionNotice() {
  return (
    <>
      <p>
        How long you must keep your records before they can be destroyed
        depends on your business — confirm which applies to you:
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          <strong>5 years</strong> — your business and tax records (Australian
          Taxation Office, ATO), and your refrigerant-handling records (Ozone
          Protection and Synthetic Greenhouse Gas Management Regulations 1995,
          administered by the Australian Refrigeration Council / ARCtick). This
          covers most businesses, including sole traders, partnerships and
          trusts.
        </li>
        <li>
          <strong>7 years</strong> — financial records if you trade as a company
          (Pty Ltd), enforced by ASIC under the Corporations Act 2001.
        </li>
      </ul>
      <p className="mt-1">
        If you're unsure which applies, check with the ATO, the ARC, ASIC, or
        your own adviser.
      </p>
    </>
  )
}
