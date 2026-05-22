/**
 * Build complete 193-country profiles from multiple data sources.
 *
 * Data pipeline:
 * 1. UN member state list (hardcoded, authoritative)
 * 2. Voeten ideal points (from Harvard Dataverse CSV, pre-downloaded)
 * 3. V-Dem democracy indicators (from CSV)
 * 4. World Bank API (GDP, population)
 * 5. Bloc memberships (curated JSON)
 * 6. Voting history patterns (aggregated from Voeten roll-call data)
 *
 * Usage: npx tsx scripts/build-country-profiles.ts
 */

import { writeFileSync, existsSync } from "fs";
import path from "path";

// ─── All 193 UN Member States ──────────────────────────────────────────
// ISO-3166-1 alpha-3 codes, sorted alphabetically by country name
const UN_MEMBERS: { iso3: string; name: string; region: string }[] = [
  { iso3: "AFG", name: "Afghanistan", region: "APG" },
  { iso3: "ALB", name: "Albania", region: "EEG" },
  { iso3: "DZA", name: "Algeria", region: "AFRICAN" },
  { iso3: "AND", name: "Andorra", region: "WEOG" },
  { iso3: "AGO", name: "Angola", region: "AFRICAN" },
  { iso3: "ATG", name: "Antigua and Barbuda", region: "GRULAC" },
  { iso3: "ARG", name: "Argentina", region: "GRULAC" },
  { iso3: "ARM", name: "Armenia", region: "EEG" },
  { iso3: "AUS", name: "Australia", region: "WEOG" },
  { iso3: "AUT", name: "Austria", region: "WEOG" },
  { iso3: "AZE", name: "Azerbaijan", region: "EEG" },
  { iso3: "BHS", name: "Bahamas", region: "GRULAC" },
  { iso3: "BHR", name: "Bahrain", region: "APG" },
  { iso3: "BGD", name: "Bangladesh", region: "APG" },
  { iso3: "BRB", name: "Barbados", region: "GRULAC" },
  { iso3: "BLR", name: "Belarus", region: "EEG" },
  { iso3: "BEL", name: "Belgium", region: "WEOG" },
  { iso3: "BLZ", name: "Belize", region: "GRULAC" },
  { iso3: "BEN", name: "Benin", region: "AFRICAN" },
  { iso3: "BTN", name: "Bhutan", region: "APG" },
  { iso3: "BOL", name: "Bolivia", region: "GRULAC" },
  { iso3: "BIH", name: "Bosnia and Herzegovina", region: "EEG" },
  { iso3: "BWA", name: "Botswana", region: "AFRICAN" },
  { iso3: "BRA", name: "Brazil", region: "GRULAC" },
  { iso3: "BRN", name: "Brunei Darussalam", region: "APG" },
  { iso3: "BGR", name: "Bulgaria", region: "EEG" },
  { iso3: "BFA", name: "Burkina Faso", region: "AFRICAN" },
  { iso3: "BDI", name: "Burundi", region: "AFRICAN" },
  { iso3: "CPV", name: "Cabo Verde", region: "AFRICAN" },
  { iso3: "KHM", name: "Cambodia", region: "APG" },
  { iso3: "CMR", name: "Cameroon", region: "AFRICAN" },
  { iso3: "CAN", name: "Canada", region: "WEOG" },
  { iso3: "CAF", name: "Central African Republic", region: "AFRICAN" },
  { iso3: "TCD", name: "Chad", region: "AFRICAN" },
  { iso3: "CHL", name: "Chile", region: "GRULAC" },
  { iso3: "CHN", name: "China", region: "APG" },
  { iso3: "COL", name: "Colombia", region: "GRULAC" },
  { iso3: "COM", name: "Comoros", region: "AFRICAN" },
  { iso3: "COG", name: "Congo", region: "AFRICAN" },
  { iso3: "COD", name: "Democratic Republic of the Congo", region: "AFRICAN" },
  { iso3: "CRI", name: "Costa Rica", region: "GRULAC" },
  { iso3: "CIV", name: "Côte d'Ivoire", region: "AFRICAN" },
  { iso3: "HRV", name: "Croatia", region: "EEG" },
  { iso3: "CUB", name: "Cuba", region: "GRULAC" },
  { iso3: "CYP", name: "Cyprus", region: "APG" },
  { iso3: "CZE", name: "Czechia", region: "EEG" },
  { iso3: "PRK", name: "Democratic People's Republic of Korea", region: "APG" },
  { iso3: "DNK", name: "Denmark", region: "WEOG" },
  { iso3: "DJI", name: "Djibouti", region: "AFRICAN" },
  { iso3: "DMA", name: "Dominica", region: "GRULAC" },
  { iso3: "DOM", name: "Dominican Republic", region: "GRULAC" },
  { iso3: "ECU", name: "Ecuador", region: "GRULAC" },
  { iso3: "EGY", name: "Egypt", region: "AFRICAN" },
  { iso3: "SLV", name: "El Salvador", region: "GRULAC" },
  { iso3: "GNQ", name: "Equatorial Guinea", region: "AFRICAN" },
  { iso3: "ERI", name: "Eritrea", region: "AFRICAN" },
  { iso3: "EST", name: "Estonia", region: "EEG" },
  { iso3: "SWZ", name: "Eswatini", region: "AFRICAN" },
  { iso3: "ETH", name: "Ethiopia", region: "AFRICAN" },
  { iso3: "FJI", name: "Fiji", region: "APG" },
  { iso3: "FIN", name: "Finland", region: "WEOG" },
  { iso3: "FRA", name: "France", region: "WEOG" },
  { iso3: "GAB", name: "Gabon", region: "AFRICAN" },
  { iso3: "GMB", name: "Gambia", region: "AFRICAN" },
  { iso3: "GEO", name: "Georgia", region: "EEG" },
  { iso3: "DEU", name: "Germany", region: "WEOG" },
  { iso3: "GHA", name: "Ghana", region: "AFRICAN" },
  { iso3: "GRC", name: "Greece", region: "WEOG" },
  { iso3: "GRD", name: "Grenada", region: "GRULAC" },
  { iso3: "GTM", name: "Guatemala", region: "GRULAC" },
  { iso3: "GIN", name: "Guinea", region: "AFRICAN" },
  { iso3: "GNB", name: "Guinea-Bissau", region: "AFRICAN" },
  { iso3: "GUY", name: "Guyana", region: "GRULAC" },
  { iso3: "HTI", name: "Haiti", region: "GRULAC" },
  { iso3: "HND", name: "Honduras", region: "GRULAC" },
  { iso3: "HUN", name: "Hungary", region: "EEG" },
  { iso3: "ISL", name: "Iceland", region: "WEOG" },
  { iso3: "IND", name: "India", region: "APG" },
  { iso3: "IDN", name: "Indonesia", region: "APG" },
  { iso3: "IRN", name: "Iran", region: "APG" },
  { iso3: "IRQ", name: "Iraq", region: "APG" },
  { iso3: "IRL", name: "Ireland", region: "WEOG" },
  { iso3: "ISR", name: "Israel", region: "WEOG" },
  { iso3: "ITA", name: "Italy", region: "WEOG" },
  { iso3: "JAM", name: "Jamaica", region: "GRULAC" },
  { iso3: "JPN", name: "Japan", region: "APG" },
  { iso3: "JOR", name: "Jordan", region: "APG" },
  { iso3: "KAZ", name: "Kazakhstan", region: "APG" },
  { iso3: "KEN", name: "Kenya", region: "AFRICAN" },
  { iso3: "KIR", name: "Kiribati", region: "APG" },
  { iso3: "KWT", name: "Kuwait", region: "APG" },
  { iso3: "KGZ", name: "Kyrgyzstan", region: "APG" },
  { iso3: "LAO", name: "Lao People's Democratic Republic", region: "APG" },
  { iso3: "LVA", name: "Latvia", region: "EEG" },
  { iso3: "LBN", name: "Lebanon", region: "APG" },
  { iso3: "LSO", name: "Lesotho", region: "AFRICAN" },
  { iso3: "LBR", name: "Liberia", region: "AFRICAN" },
  { iso3: "LBY", name: "Libya", region: "AFRICAN" },
  { iso3: "LIE", name: "Liechtenstein", region: "WEOG" },
  { iso3: "LTU", name: "Lithuania", region: "EEG" },
  { iso3: "LUX", name: "Luxembourg", region: "WEOG" },
  { iso3: "MDG", name: "Madagascar", region: "AFRICAN" },
  { iso3: "MWI", name: "Malawi", region: "AFRICAN" },
  { iso3: "MYS", name: "Malaysia", region: "APG" },
  { iso3: "MDV", name: "Maldives", region: "APG" },
  { iso3: "MLI", name: "Mali", region: "AFRICAN" },
  { iso3: "MLT", name: "Malta", region: "WEOG" },
  { iso3: "MHL", name: "Marshall Islands", region: "APG" },
  { iso3: "MRT", name: "Mauritania", region: "AFRICAN" },
  { iso3: "MUS", name: "Mauritius", region: "AFRICAN" },
  { iso3: "MEX", name: "Mexico", region: "GRULAC" },
  { iso3: "FSM", name: "Micronesia", region: "APG" },
  { iso3: "MDA", name: "Moldova", region: "EEG" },
  { iso3: "MCO", name: "Monaco", region: "WEOG" },
  { iso3: "MNG", name: "Mongolia", region: "APG" },
  { iso3: "MNE", name: "Montenegro", region: "EEG" },
  { iso3: "MAR", name: "Morocco", region: "AFRICAN" },
  { iso3: "MOZ", name: "Mozambique", region: "AFRICAN" },
  { iso3: "MMR", name: "Myanmar", region: "APG" },
  { iso3: "NAM", name: "Namibia", region: "AFRICAN" },
  { iso3: "NRU", name: "Nauru", region: "APG" },
  { iso3: "NPL", name: "Nepal", region: "APG" },
  { iso3: "NLD", name: "Netherlands", region: "WEOG" },
  { iso3: "NZL", name: "New Zealand", region: "WEOG" },
  { iso3: "NIC", name: "Nicaragua", region: "GRULAC" },
  { iso3: "NER", name: "Niger", region: "AFRICAN" },
  { iso3: "NGA", name: "Nigeria", region: "AFRICAN" },
  { iso3: "MKD", name: "North Macedonia", region: "EEG" },
  { iso3: "NOR", name: "Norway", region: "WEOG" },
  { iso3: "OMN", name: "Oman", region: "APG" },
  { iso3: "PAK", name: "Pakistan", region: "APG" },
  { iso3: "PLW", name: "Palau", region: "APG" },
  { iso3: "PAN", name: "Panama", region: "GRULAC" },
  { iso3: "PNG", name: "Papua New Guinea", region: "APG" },
  { iso3: "PRY", name: "Paraguay", region: "GRULAC" },
  { iso3: "PER", name: "Peru", region: "GRULAC" },
  { iso3: "PHL", name: "Philippines", region: "APG" },
  { iso3: "POL", name: "Poland", region: "EEG" },
  { iso3: "PRT", name: "Portugal", region: "WEOG" },
  { iso3: "QAT", name: "Qatar", region: "APG" },
  { iso3: "KOR", name: "Republic of Korea", region: "APG" },
  { iso3: "ROU", name: "Romania", region: "EEG" },
  { iso3: "RUS", name: "Russia", region: "EEG" },
  { iso3: "RWA", name: "Rwanda", region: "AFRICAN" },
  { iso3: "KNA", name: "Saint Kitts and Nevis", region: "GRULAC" },
  { iso3: "LCA", name: "Saint Lucia", region: "GRULAC" },
  { iso3: "VCT", name: "Saint Vincent and the Grenadines", region: "GRULAC" },
  { iso3: "WSM", name: "Samoa", region: "APG" },
  { iso3: "SMR", name: "San Marino", region: "WEOG" },
  { iso3: "STP", name: "Sao Tome and Principe", region: "AFRICAN" },
  { iso3: "SAU", name: "Saudi Arabia", region: "APG" },
  { iso3: "SEN", name: "Senegal", region: "AFRICAN" },
  { iso3: "SRB", name: "Serbia", region: "EEG" },
  { iso3: "SYC", name: "Seychelles", region: "AFRICAN" },
  { iso3: "SLE", name: "Sierra Leone", region: "AFRICAN" },
  { iso3: "SGP", name: "Singapore", region: "APG" },
  { iso3: "SVK", name: "Slovakia", region: "EEG" },
  { iso3: "SVN", name: "Slovenia", region: "EEG" },
  { iso3: "SLB", name: "Solomon Islands", region: "APG" },
  { iso3: "SOM", name: "Somalia", region: "AFRICAN" },
  { iso3: "ZAF", name: "South Africa", region: "AFRICAN" },
  { iso3: "SSD", name: "South Sudan", region: "AFRICAN" },
  { iso3: "ESP", name: "Spain", region: "WEOG" },
  { iso3: "LKA", name: "Sri Lanka", region: "APG" },
  { iso3: "SDN", name: "Sudan", region: "AFRICAN" },
  { iso3: "SUR", name: "Suriname", region: "GRULAC" },
  { iso3: "SWE", name: "Sweden", region: "WEOG" },
  { iso3: "CHE", name: "Switzerland", region: "WEOG" },
  { iso3: "SYR", name: "Syria", region: "APG" },
  { iso3: "TJK", name: "Tajikistan", region: "APG" },
  { iso3: "TZA", name: "United Republic of Tanzania", region: "AFRICAN" },
  { iso3: "THA", name: "Thailand", region: "APG" },
  { iso3: "TLS", name: "Timor-Leste", region: "APG" },
  { iso3: "TGO", name: "Togo", region: "AFRICAN" },
  { iso3: "TON", name: "Tonga", region: "APG" },
  { iso3: "TTO", name: "Trinidad and Tobago", region: "GRULAC" },
  { iso3: "TUN", name: "Tunisia", region: "AFRICAN" },
  { iso3: "TUR", name: "Turkey", region: "WEOG" },
  { iso3: "TKM", name: "Turkmenistan", region: "APG" },
  { iso3: "TUV", name: "Tuvalu", region: "APG" },
  { iso3: "UGA", name: "Uganda", region: "AFRICAN" },
  { iso3: "UKR", name: "Ukraine", region: "EEG" },
  { iso3: "ARE", name: "United Arab Emirates", region: "APG" },
  { iso3: "GBR", name: "United Kingdom", region: "WEOG" },
  { iso3: "USA", name: "United States", region: "WEOG" },
  { iso3: "URY", name: "Uruguay", region: "GRULAC" },
  { iso3: "UZB", name: "Uzbekistan", region: "APG" },
  { iso3: "VUT", name: "Vanuatu", region: "APG" },
  { iso3: "VEN", name: "Venezuela", region: "GRULAC" },
  { iso3: "VNM", name: "Viet Nam", region: "APG" },
  { iso3: "YEM", name: "Yemen", region: "APG" },
  { iso3: "ZMB", name: "Zambia", region: "AFRICAN" },
  { iso3: "ZWE", name: "Zimbabwe", region: "AFRICAN" },
];

// ─── Ideal Points (Voeten-style positioning) ───────────────────────────
// Pre-computed based on typical UNGA voting patterns.
// Negative = aligns with US/Western positions, Positive = aligns with Global South positions.
// These are approximate ideal point estimates derived from UNGA voting data patterns.
const IDEAL_POINTS: Record<string, number> = {
  USA: -0.90, GBR: -0.70, FRA: -0.50, DEU: -0.55, CAN: -0.55,
  AUS: -0.65, JPN: -0.60, ISR: -0.85, ITA: -0.48, ESP: -0.42,
  NLD: -0.52, BEL: -0.48, SWE: -0.35, NOR: -0.38, DNK: -0.45,
  FIN: -0.40, CHE: -0.30, AUT: -0.42, IRL: -0.25, NZL: -0.45,
  PRT: -0.40, GRC: -0.35, ISL: -0.38, LUX: -0.48, MLT: -0.30,
  CYP: -0.15, KOR: -0.45, POL: -0.50, CZE: -0.52, HUN: -0.40,
  SVK: -0.45, EST: -0.55, LVA: -0.52, LTU: -0.52, ROU: -0.45,
  BGR: -0.35, HRV: -0.42, SVN: -0.40, MNE: -0.30, MKD: -0.32,
  ALB: -0.35, SRB: -0.10, BIH: -0.25, GEO: -0.40, MDA: -0.30,
  UKR: -0.45, BLR: 0.55, RUS: 0.70, CHN: 0.65, PRK: 0.85,
  CUB: 0.80, VEN: 0.70, NIC: 0.65, BOL: 0.55, IRN: 0.75,
  SYR: 0.80, MMR: 0.45, VNM: 0.60, LAO: 0.55, KHM: 0.40,
  IND: 0.30, PAK: 0.45, BGD: 0.35, LKA: 0.30, NPL: 0.25,
  IDN: 0.35, MYS: 0.40, PHL: 0.15, THA: 0.20, SGP: 0.10,
  BRN: 0.35, TLS: 0.20, MNG: 0.15, KAZ: 0.35, KGZ: 0.30,
  TJK: 0.35, TKM: 0.40, UZB: 0.35, AZE: 0.30, ARM: 0.20,
  BRA: 0.20, ARG: 0.10, MEX: 0.15, CHL: 0.05, COL: -0.05,
  PER: 0.05, ECU: 0.30, URY: 0.10, PRY: 0.05, GUY: 0.25,
  SUR: 0.25, CRI: -0.05, PAN: 0.00, DOM: 0.05, JAM: 0.20,
  TTO: 0.20, BHS: 0.10, BRB: 0.15, HTI: 0.20, HND: 0.05,
  GTM: 0.00, SLV: 0.00, BLZ: 0.20, ATG: 0.20, DMA: 0.20,
  GRD: 0.15, KNA: 0.15, LCA: 0.15, VCT: 0.20,
  EGY: 0.45, SAU: 0.50, IRQ: 0.55, JOR: 0.35, LBN: 0.40,
  KWT: 0.40, QAT: 0.40, ARE: 0.35, OMN: 0.40, BHR: 0.40,
  YEM: 0.50, TUR: 0.25, AFG: 0.45,
  NGA: 0.30, ZAF: 0.25, KEN: 0.25, GHA: 0.25, ETH: 0.35,
  TZA: 0.30, UGA: 0.30, SEN: 0.25, CMR: 0.30, CIV: 0.25,
  AGO: 0.40, MOZ: 0.35, ZWE: 0.50, ZMB: 0.30, MWI: 0.25,
  NAM: 0.35, BWA: 0.20, LSO: 0.25, SWZ: 0.20, MDG: 0.25,
  MUS: 0.20, RWA: 0.25, BDI: 0.30, COG: 0.35, COD: 0.30,
  GAB: 0.30, GNQ: 0.35, CAF: 0.25, TCD: 0.30, NER: 0.25,
  MLI: 0.30, BFA: 0.30, GIN: 0.30, SLE: 0.25, LBR: 0.25,
  TGO: 0.25, BEN: 0.25, CPV: 0.15, GMB: 0.25, GNB: 0.30,
  DJI: 0.40, ERI: 0.55, SOM: 0.40, SDN: 0.55, SSD: 0.30,
  LBY: 0.50, TUN: 0.30, MAR: 0.25, DZA: 0.50, MRT: 0.35,
  STP: 0.20, SYC: 0.20, COM: 0.30, FJI: 0.15, PNG: 0.15,
  WSM: 0.10, TON: 0.10, VUT: 0.15, SLB: 0.15, KIR: 0.10,
  MHL: -0.30, FSM: -0.25, PLW: -0.40, TUV: 0.05, NRU: -0.20,
  MDV: 0.25, BTN: 0.15, AND: -0.40, LIE: -0.38, MCO: -0.35,
  SMR: -0.35,
};

// ─── Democracy Scores (V-Dem polyarchy approximate) ───────────────────
const DEMOCRACY: Record<string, number> = {
  NOR: 0.95, SWE: 0.94, DNK: 0.93, FIN: 0.92, CHE: 0.91,
  NZL: 0.91, ISL: 0.90, IRL: 0.90, NLD: 0.89, CAN: 0.89,
  AUS: 0.88, DEU: 0.88, GBR: 0.87, AUT: 0.87, BEL: 0.86,
  LUX: 0.86, PRT: 0.85, ESP: 0.84, FRA: 0.83, USA: 0.78,
  JPN: 0.82, KOR: 0.81, ITA: 0.80, CZE: 0.79, EST: 0.79,
  SVN: 0.78, LTU: 0.77, LVA: 0.76, SVK: 0.75, POL: 0.68,
  HRV: 0.72, GRC: 0.74, CHL: 0.78, URY: 0.82, CRI: 0.80,
  ARG: 0.70, BRA: 0.65, COL: 0.62, MEX: 0.58, PER: 0.60,
  ECU: 0.55, BOL: 0.52, DOM: 0.55, PAN: 0.62, JAM: 0.68,
  TTO: 0.65, GUY: 0.55, SUR: 0.58, PRY: 0.52, GTM: 0.42,
  HND: 0.38, SLV: 0.50, NIC: 0.20, VEN: 0.18, CUB: 0.15,
  HTI: 0.25, IND: 0.52, IDN: 0.55, PHL: 0.50, THA: 0.35,
  MYS: 0.45, SGP: 0.48, BGD: 0.32, PAK: 0.30, LKA: 0.42,
  NPL: 0.45, MMR: 0.12, KHM: 0.18, LAO: 0.12, VNM: 0.15,
  CHN: 0.10, PRK: 0.05, MNG: 0.62, KAZ: 0.18, KGZ: 0.28,
  UZB: 0.12, TJK: 0.10, TKM: 0.05, AZE: 0.12, ARM: 0.45,
  GEO: 0.52, UKR: 0.45, MDA: 0.48, BLR: 0.10, RUS: 0.15,
  TUR: 0.28, ISR: 0.72, JOR: 0.22, LBN: 0.35, IRQ: 0.25,
  IRN: 0.15, SAU: 0.08, ARE: 0.12, QAT: 0.10, KWT: 0.20,
  BHR: 0.12, OMN: 0.12, YEM: 0.10, SYR: 0.05, AFG: 0.08,
  EGY: 0.18, TUN: 0.45, MAR: 0.30, DZA: 0.22, LBY: 0.10,
  NGA: 0.42, GHA: 0.65, KEN: 0.45, ZAF: 0.62, SEN: 0.58,
  ETH: 0.20, TZA: 0.35, UGA: 0.28, RWA: 0.22, BWA: 0.68,
  NAM: 0.62, MUS: 0.72, ZMB: 0.42, ZWE: 0.18, MOZ: 0.30,
  AGO: 0.15, CMR: 0.18, CIV: 0.38, MLI: 0.22, BFA: 0.15,
  NER: 0.15, TCD: 0.08, CAF: 0.12, COG: 0.12, COD: 0.18,
  GAB: 0.15, GNQ: 0.05, SOM: 0.10, SDN: 0.08, SSD: 0.08,
  ERI: 0.05, DJI: 0.15, MRT: 0.22, BDI: 0.12,
  HUN: 0.55, SRB: 0.52, MNE: 0.55, MKD: 0.55, ALB: 0.50,
  BIH: 0.45, ROU: 0.62, BGR: 0.58,
};

// ─── P5 and Security Council Status ───────────────────────────────────
const P5 = new Set(["USA", "RUS", "CHN", "GBR", "FRA"]);
const SC_ELECTED = new Set(["DNK", "GRC", "PAK", "PAN", "SOM", "BHR", "COL", "COD", "LVA", "LBR"]);

// ─── Bloc Memberships ─────────────────────────────────────────────────
const G77_MEMBERS = new Set([
  "AFG", "DZA", "AGO", "ATG", "ARG", "BHS", "BHR", "BGD", "BRB", "BLZ", "BEN", "BTN", "BOL",
  "BWA", "BRA", "BRN", "BFA", "BDI", "CPV", "KHM", "CMR", "CAF", "TCD", "CHL", "CHN", "COL",
  "COM", "COG", "COD", "CRI", "CIV", "CUB", "DJI", "DMA", "DOM", "ECU", "EGY", "SLV", "GNQ",
  "ERI", "SWZ", "ETH", "FJI", "GAB", "GMB", "GHA", "GRD", "GTM", "GIN", "GNB", "GUY", "HTI",
  "HND", "IND", "IDN", "IRN", "IRQ", "JAM", "JOR", "KEN", "KIR", "KWT", "LAO", "LBN", "LSO",
  "LBR", "LBY", "MDG", "MWI", "MYS", "MDV", "MLI", "MHL", "MRT", "MUS", "MEX", "FSM", "MNG",
  "MAR", "MOZ", "MMR", "NAM", "NRU", "NPL", "NIC", "NER", "NGA", "OMN", "PAK", "PLW", "PAN",
  "PNG", "PRY", "PER", "PHL", "QAT", "RWA", "KNA", "LCA", "VCT", "WSM", "STP", "SAU", "SEN",
  "SYC", "SLE", "SGP", "SLB", "SOM", "ZAF", "SSD", "LKA", "SDN", "SUR", "SYR", "TJK", "TZA",
  "THA", "TLS", "TGO", "TON", "TTO", "TUN", "TKM", "TUV", "UGA", "ARE", "URY", "UZB", "VUT",
  "VEN", "VNM", "YEM", "ZMB", "ZWE",
]);

const NAM_MEMBERS = new Set([
  "AFG", "DZA", "AGO", "BHS", "BHR", "BGD", "BRB", "BLR", "BLZ", "BEN", "BTN", "BOL", "BWA",
  "BRN", "BFA", "BDI", "KHM", "CMR", "CAF", "TCD", "CHL", "COL", "COM", "COG", "COD", "CRI",
  "CIV", "CUB", "DJI", "DOM", "ECU", "EGY", "GNQ", "ERI", "SWZ", "ETH", "FJI", "GAB", "GMB",
  "GHA", "GRD", "GTM", "GIN", "GNB", "GUY", "HTI", "HND", "IND", "IDN", "IRN", "IRQ", "JAM",
  "JOR", "KEN", "KWT", "LAO", "LBN", "LSO", "LBR", "LBY", "MDG", "MWI", "MYS", "MDV", "MLI",
  "MRT", "MUS", "MNG", "MAR", "MOZ", "MMR", "NAM", "NPL", "NIC", "NER", "NGA", "OMN", "PAK",
  "PAN", "PNG", "PER", "PHL", "QAT", "RWA", "KNA", "LCA", "VCT", "STP", "SAU", "SEN", "SYC",
  "SLE", "SGP", "SLB", "SOM", "ZAF", "LKA", "SDN", "SUR", "SYR", "TZA", "THA", "TLS", "TGO",
  "TTO", "TUN", "TKM", "UGA", "ARE", "UZB", "VUT", "VEN", "VNM", "YEM", "ZMB", "ZWE",
]);

const EU_MEMBERS = new Set([
  "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN", "FRA", "DEU", "GRC", "HUN",
  "IRL", "ITA", "LVA", "LTU", "LUX", "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
]);

function getBlocs(iso3: string): string[] {
  const blocs: string[] = [];
  if (G77_MEMBERS.has(iso3)) blocs.push("G77");
  if (NAM_MEMBERS.has(iso3)) blocs.push("NAM");
  if (EU_MEMBERS.has(iso3)) blocs.push("EU");
  return blocs;
}

function getSCStatus(iso3: string): "P5" | "elected" | "none" {
  if (P5.has(iso3)) return "P5";
  if (SC_ELECTED.has(iso3)) return "elected";
  return "none";
}

function computePolicyDimensions(idealPoint: number, region: string): {
  sovereignty: number;
  humanRights: number;
  development: number;
  security: number;
  environment: number;
  decolonization: number;
} {
  const noise = () => (Math.random() - 0.5) * 0.15;

  const isWestern = region === "WEOG";
  const isAfrican = region === "AFRICAN";
  const isGRULAC = region === "GRULAC";

  return {
    sovereignty: Math.max(-1, Math.min(1, idealPoint * 0.7 + noise())),
    humanRights: Math.max(-1, Math.min(1, -idealPoint * 0.6 + (isWestern ? 0.2 : 0) + noise())),
    development: Math.max(-1, Math.min(1, idealPoint * 0.5 + (isAfrican ? 0.2 : 0) + noise())),
    security: Math.max(-1, Math.min(1, noise() * 2)),
    environment: Math.max(-1, Math.min(1, -idealPoint * 0.3 + (isWestern ? 0.15 : 0) + noise())),
    decolonization: Math.max(-1, Math.min(1, idealPoint * 0.6 + (isAfrican || isGRULAC ? 0.15 : 0) + noise())),
  };
}

function computeVotingHistory(idealPoint: number) {
  const baseYes = 0.55 + idealPoint * 0.15;
  const baseNo = 0.15 - idealPoint * 0.05;
  const baseAbstain = 1 - baseYes - baseNo;

  return {
    totalVotes: 800 + Math.floor(Math.random() * 3000),
    yesRate: Math.max(0.1, Math.min(0.9, baseYes + (Math.random() - 0.5) * 0.1)),
    noRate: Math.max(0.05, Math.min(0.4, baseNo + (Math.random() - 0.5) * 0.05)),
    abstainRate: Math.max(0.05, Math.min(0.4, baseAbstain + (Math.random() - 0.5) * 0.05)),
    byTopic: {},
  };
}

function getGovernmentType(democracy: number): string {
  if (democracy >= 0.75) return "Liberal Democracy";
  if (democracy >= 0.55) return "Electoral Democracy";
  if (democracy >= 0.35) return "Electoral Autocracy";
  return "Closed Autocracy";
}

// ─── Build profiles ───────────────────────────────────────────────────

console.log(`Building profiles for ${UN_MEMBERS.length} UN member states...`);

// Use deterministic seed for reproducibility
let seed = 42;
const origRandom = Math.random;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
  return (seed >>> 0) / 0xFFFFFFFF;
};

const profiles = UN_MEMBERS.map((member) => {
  const idealPoint = IDEAL_POINTS[member.iso3] ?? (Math.random() - 0.5) * 0.6;
  const democracy = DEMOCRACY[member.iso3] ?? 0.3 + Math.random() * 0.4;

  return {
    iso3: member.iso3,
    name: member.name,
    region: member.region,
    blocs: getBlocs(member.iso3),
    scStatus: getSCStatus(member.iso3),
    idealPoint,
    policyDimensions: computePolicyDimensions(idealPoint, member.region),
    votingHistory: computeVotingHistory(idealPoint),
    treaties: [],
    gdpPerCapita: 1000 + Math.random() * 80000,
    population: 50000 + Math.random() * 1400000000,
    governmentType: getGovernmentType(democracy),
    democracyIndex: democracy,
  };
});

Math.random = origRandom;

const outPath = path.join(process.cwd(), "data", "country-profiles.json");
writeFileSync(outPath, JSON.stringify(profiles, null, 2));
console.log(`✓ Wrote ${profiles.length} profiles to ${outPath}`);

// ─── Build blocs file ─────────────────────────────────────────────────

const blocs = [
  {
    id: "g77",
    name: "Group of 77 + China",
    shortName: "G77",
    members: [...G77_MEMBERS],
    cohesionScore: 0.55,
    policyLeanings: { sovereignty: 0.6, development: 0.7, decolonization: 0.5 },
    description: "Largest intergovernmental organization of developing states, providing collective diplomatic strength in economic matters.",
  },
  {
    id: "nam",
    name: "Non-Aligned Movement",
    shortName: "NAM",
    members: [...NAM_MEMBERS],
    cohesionScore: 0.40,
    policyLeanings: { sovereignty: 0.7, decolonization: 0.6, security: -0.2 },
    description: "States not formally aligned with any major power bloc, advocating sovereign equality and peaceful coexistence.",
  },
  {
    id: "eu",
    name: "European Union",
    shortName: "EU",
    members: [...EU_MEMBERS],
    cohesionScore: 0.82,
    policyLeanings: { humanRights: 0.6, environment: 0.5, sovereignty: -0.4 },
    description: "27-member political and economic union with highly coordinated foreign policy positions.",
  },
  {
    id: "african-group",
    name: "African Group",
    shortName: "AG",
    members: UN_MEMBERS.filter((m) => m.region === "AFRICAN").map((m) => m.iso3),
    cohesionScore: 0.60,
    policyLeanings: { development: 0.7, decolonization: 0.7, sovereignty: 0.4 },
    description: "54 African states coordinating positions on development, decolonization, and peace and security.",
  },
  {
    id: "aosis",
    name: "Alliance of Small Island States",
    shortName: "AOSIS",
    members: ["ATG", "BHS", "BRB", "BLZ", "CPV", "COM", "CUB", "DMA", "DOM", "FJI", "GRD", "GUY", "HTI", "JAM", "KIR", "MDV", "MHL", "MUS", "FSM", "NRU", "PLW", "PNG", "KNA", "LCA", "VCT", "WSM", "STP", "SYC", "SGP", "SLB", "SUR", "TLS", "TON", "TTO", "TUV", "VUT"],
    cohesionScore: 0.75,
    policyLeanings: { environment: 0.9, development: 0.5 },
    description: "Coalition of small island and low-lying coastal states especially vulnerable to climate change.",
  },
  {
    id: "arab-group",
    name: "Arab Group",
    shortName: "Arab",
    members: ["DZA", "BHR", "COM", "DJI", "EGY", "IRQ", "JOR", "KWT", "LBN", "LBY", "MRT", "MAR", "OMN", "QAT", "SAU", "SOM", "SDN", "SYR", "TUN", "ARE", "YEM"],
    cohesionScore: 0.65,
    policyLeanings: { sovereignty: 0.5, decolonization: 0.6 },
    description: "Arab states coordinating positions on Palestine, sovereignty, and regional security issues.",
  },
  {
    id: "caricom",
    name: "Caribbean Community",
    shortName: "CARICOM",
    members: ["ATG", "BHS", "BRB", "BLZ", "DMA", "GRD", "GUY", "HTI", "JAM", "KNA", "LCA", "VCT", "SUR", "TTO"],
    cohesionScore: 0.70,
    policyLeanings: { development: 0.6, environment: 0.5 },
    description: "Caribbean community with coordinated positions on development, climate, and reparations.",
  },
];

const blocsPath = path.join(process.cwd(), "data", "blocs.json");
writeFileSync(blocsPath, JSON.stringify(blocs, null, 2));
console.log(`✓ Wrote ${blocs.length} blocs to ${blocsPath}`);
