/** A flag for a country or a nationality, from the names Jolpica uses. */
const CODES: Record<string, string> = {
  Australia: "AU", Australian: "AU", China: "CN", Chinese: "CN", Japan: "JP", Japanese: "JP",
  USA: "US", "United States": "US", American: "US", Canada: "CA", Canadian: "CA",
  Monaco: "MC", Monegasque: "MC", Spain: "ES", Spanish: "ES", Austria: "AT", Austrian: "AT",
  UK: "GB", British: "GB", Belgium: "BE", Belgian: "BE", Hungary: "HU", Hungarian: "HU",
  Netherlands: "NL", Dutch: "NL", Italy: "IT", Italian: "IT", Azerbaijan: "AZ",
  Singapore: "SG", Malaysia: "MY", Mexico: "MX", Mexican: "MX", Brazil: "BR", Brazilian: "BR",
  Qatar: "QA", UAE: "AE", "United Arab Emirates": "AE", Bahrain: "BH", "Saudi Arabia": "SA",
  German: "DE", Germany: "DE", French: "FR", France: "FR", Finnish: "FI", Thai: "TH",
  Danish: "DK", "New Zealander": "NZ", Argentine: "AR", Argentinian: "AR", Swiss: "CH", Polish: "PL",
};
export function flag(name: string | null | undefined) {
  const code = name ? CODES[name] : undefined;
  return code ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : "";
}
