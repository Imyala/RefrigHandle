// One clear statement of the record-retention obligation, without quoting
// specific periods — requirements vary and change, so we point at the
// authorities and leave the period to the business / their adviser. Colour
// and size are inherited from the parent, so it drops cleanly into the
// amber closure card or a muted note.
export function RetentionNotice() {
  return (
    <>
      <p>
        You are responsible for retaining your own records for the period
        required by applicable laws and regulations. Retention periods vary
        depending on your circumstances and may include requirements from the
        Australian Taxation Office (ATO), the Australian Refrigeration Council
        (ARC/ARCtick), ASIC and other authorities.
      </p>
      <p className="mt-1">
        If you are unsure which requirements apply, seek advice from the
        relevant authority or your own adviser.
      </p>
    </>
  )
}
