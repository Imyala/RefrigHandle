declare module 'tz-lookup' {
  // Resolve an IANA timezone (e.g. "Australia/Sydney") from coordinates.
  export default function tzlookup(lat: number, lon: number): string
}
