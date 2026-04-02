/**
 * update-descriptions.ts — Add realistic German product descriptions to all articles.
 *
 * 1. Fetches all articles via REST v1 GET /v1/artikel (paginated)
 * 2. Generates a German description based on the article name
 * 3. Updates each article via Legacy API ArtikelEdit with beschreibung_de
 *
 * Usage: npx tsx update-descriptions.ts
 */
import { OpenXEClient } from "./src/client/openxe-client.js";
import { loadConfig } from "./src/config.js";

process.env.OPENXE_URL = "http://192.168.0.143";
process.env.OPENXE_USERNAME = "user";
process.env.OPENXE_PASSWORD = "user";

const client = new OpenXEClient(loadConfig());

// ---------------------------------------------------------------------------
// Description generation logic
// ---------------------------------------------------------------------------

interface Article {
  id: number | string;
  name_de?: string;
  nummer?: string;
  projekt?: string;
  [key: string]: unknown;
}

/**
 * Parse size (e.g. "M10"), length (e.g. "x20mm"), and material from the name.
 */
function parseNameParts(name: string) {
  const sizeMatch = name.match(/\b(M\d+)\b/);
  const lengthMatch = name.match(/x(\d+mm)/);
  const size = sizeMatch?.[1] ?? null;
  const length = lengthMatch?.[1] ?? null;

  const materials: Record<string, string> = {
    "Edelstahl": "Edelstahl A2 (V2A), korrosionsbestaendig und saeurebestaendig",
    "Messing": "Messing (CuZn39Pb3), nicht magnetisch und gut leitfaehig",
    "Aluminium": "Aluminium (AlMg3), leicht und korrosionsbestaendig",
    "Kunststoff": "technischem Kunststoff (PA6.6), chemisch bestaendig und elektrisch isolierend",
    "Stahl verzinkt": "galvanisch verzinktem Stahl (8.8), mit Oberflaechenschutz gegen Korrosion",
  };

  let materialDesc: string | null = null;
  for (const [key, desc] of Object.entries(materials)) {
    if (name.includes(key)) {
      materialDesc = desc;
      break;
    }
  }

  return { size, length, materialDesc };
}

/** Map DIN/ISO norms to Schluesselweiten */
const SW: Record<string, string> = {
  M3: "5,5mm", M4: "7mm", M5: "8mm", M6: "10mm", M8: "13mm",
  M10: "17mm", M12: "19mm", M16: "24mm", M20: "30mm",
};

function generateDescription(name: string): string {
  const lower = name.toLowerCase();
  const { size, length, materialDesc } = parseNameParts(name);
  const matPhrase = materialDesc ? `aus ${materialDesc}` : "aus hochwertigem Werkstoff";

  // --- Schrauben ---
  if (lower.includes("sechskantschraube") || lower.includes("din 933")) {
    const sw = size ? `, Schluesselweite ${SW[size] ?? "nach Norm"}` : "";
    return `Sechskantschraube mit Vollgewinde nach DIN 933 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}${length ? `, Laenge ${length}` : ""}${sw}. `
      + `Universell einsetzbar im Maschinen- und Stahlbau sowie in der Montagetechnik. `
      + `Hohe Zugfestigkeit und zuverlaessige Verbindung auch bei dynamischer Belastung.`;
  }

  if (lower.includes("zylinderschraube") || lower.includes("din 912")) {
    return `Zylinderschraube mit Innensechskant nach DIN 912 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}${length ? `, Schaftlaenge ${length}` : ""}. `
      + `Ideal fuer Praezisionsverbindungen im Werkzeugbau und Maschinenbau. `
      + `Der tiefe Innensechskant ermoeglicht hohes Anzugsdrehmoment auf engem Raum.`;
  }

  if (lower.includes("senkkopfschraube") || lower.includes("din 7991")) {
    return `Senkkopfschraube mit Innensechskant nach DIN 7991 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}${length ? `, Laenge ${length}` : ""}. `
      + `Der 90-Grad-Senkkopf schliesst buendig mit der Oberflaeche ab. `
      + `Geeignet fuer Anwendungen, bei denen eine glatte Oberflaeche erforderlich ist.`;
  }

  if (lower.includes("linsenkopfschraube") || lower.includes("iso 7380")) {
    return `Linsenkopfschraube mit Innensechskant nach ISO 7380 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}${length ? `, Laenge ${length}` : ""}. `
      + `Der flache, abgerundete Kopf bietet eine ansprechende Optik bei sichtbaren Verschraubungen. `
      + `Haeufig im Geraete- und Apparatebau verwendet.`;
  }

  if (lower.includes("gewindestange") || lower.includes("din 976")) {
    return `Gewindestange mit durchgehendem metrischem Gewinde nach DIN 976 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}, Standardlaenge 1000mm, kuerzbar. `
      + `Fuer Zugverankerungen, Abstandsmontagen und als Spannstange verwendbar. `
      + `Beidseitig mit Muttern und Scheiben kombinierbar.`;
  }

  if (lower.includes("blechschraube") || lower.includes("din 7981")) {
    return `Blechschraube mit Linsenkopf und Kreuzschlitz nach DIN 7981 ${matPhrase}. `
      + `Selbstschneidendes Gewinde fuer Bohrungen in Duennblech und Kunststoff. `
      + `${size ? `Groesse ${size}` : ""}${length ? `, Laenge ${length}` : ""}. `
      + `Geeignet fuer Karosseriebau, Lueftungstechnik und Gehaeuseabdeckungen.`;
  }

  if (lower.includes("holzschraube") || lower.includes("din 571")) {
    return `Sechskant-Holzschraube nach DIN 571 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : ""}${length ? `, Laenge ${length}` : ""}. `
      + `Fuer tragende Holzverbindungen im Ingenieurholzbau und Zimmererarbeiten. `
      + `Grobe Gewindesteigung fuer optimalen Halt in Weich- und Hartholz.`;
  }

  if (lower.includes("maschinenschraube") || lower.includes("din 85")) {
    return `Flachkopfschraube mit Schlitz nach DIN 85 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}${length ? `, Laenge ${length}` : ""}. `
      + `Klassische Maschinenschraube fuer Elektro- und Feinmechanik. `
      + `Leicht zu montieren und demontieren mit Standard-Schraubendreher.`;
  }

  // generic Schraube fallback
  if (lower.includes("schraube")) {
    return `Hochwertige Schraube ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}${length ? `, Laenge ${length}` : ""}. `
      + `Geeignet fuer vielfaeltige Befestigungsaufgaben in Industrie und Handwerk. `
      + `Gefertigt nach gaengigen DIN/ISO-Normen fuer zuverlaessige Verbindungen.`;
  }

  // --- Muttern ---
  if (lower.includes("sechskantmutter") || lower.includes("din 934")) {
    return `Sechskantmutter nach DIN 934 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}${size ? `, Schluesselweite ${SW[size] ?? "nach Norm"}` : ""}. `
      + `Passend zu allen metrischen Schrauben gleicher Gewindegroesse nach DIN/ISO. `
      + `Universell einsetzbar als Standard-Befestigungselement.`;
  }

  if (lower.includes("sicherungsmutter") || lower.includes("din 985")) {
    return `Selbstsichernde Mutter mit Polyamid-Klemmteil nach DIN 985 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}. `
      + `Der Kunststoffeinsatz verhindert selbsttaetiges Loesen bei Vibrationen. `
      + `Ideal fuer Anwendungen mit dynamischer Belastung im Fahrzeug- und Maschinenbau.`;
  }

  if (lower.includes("flanschmutter") || lower.includes("din 6923")) {
    return `Sechskant-Flanschmutter nach DIN 6923 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}. `
      + `Der integrierte Flansch verteilt die Auflagekraft und ersetzt eine separate Unterlegscheibe. `
      + `Spart Montagezeit und reduziert die Anzahl der Einzelteile.`;
  }

  if (lower.includes("hutmutter") || lower.includes("din 1587")) {
    return `Hutmutter (Sechskant, hohe Form) nach DIN 1587 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}. `
      + `Die geschlossene Kappe schuetzt das Gewindeende und bietet ein sauberes Erscheinungsbild. `
      + `Haeufig verwendet im Moebelbau, Gelaenderbau und bei sichtbaren Verschraubungen.`;
  }

  if (lower.includes("raendelmutter") || lower.includes("din 466")) {
    return `Raendelmutter nach DIN 466 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}. `
      + `Die geraendelte Aussenflaeche ermoeglicht werkzeuglose Montage und Demontage von Hand. `
      + `Ideal fuer Einstellschrauben, Vorrichtungsbau und Labortechnik.`;
  }

  if (lower.includes("schweissmutter") || lower.includes("din 929")) {
    return `Sechskant-Schweissmutter nach DIN 929 ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}. `
      + `Drei Schweissbuckel auf der Unterseite ermoeglichen Punkt- oder WIG-Schweissung auf Blech. `
      + `Schafft feste Gewindepunkte an Blechkonstruktionen im Fahrzeug- und Stahlbau.`;
  }

  if (lower.includes("mutter")) {
    return `Hochwertige Mutter ${matPhrase}. `
      + `${size ? `Gewinde ${size}` : "Metrisches Gewinde"}. `
      + `Geeignet fuer Standard-Befestigungen in Kombination mit metrischen Schrauben. `
      + `Gefertigt nach DIN/ISO-Normen fuer zuverlaessige Schraubverbindungen.`;
  }

  // --- Unterlegscheiben ---
  if (lower.includes("unterlegscheibe") || lower.includes("scheibe")) {
    return `Unterlegscheibe ${matPhrase}. `
      + `${size ? `Fuer ${size}-Schrauben` : "Metrische Groesse nach Norm"}. `
      + `Vergroessert die Auflageflaeche und schuetzt das Werkstueck vor Oberflaechenbeschaedigung. `
      + `Unverzichtbares Zubehoer fuer jede normgerechte Schraubverbindung.`;
  }

  // --- Dichtungen ---
  if (lower.includes("o-ring")) {
    return `O-Ring-Dichtung aus hochwertigem Elastomer (NBR, Shore-A 70). `
      + `${size ? `Innendurchmesser passend fuer ${size}` : "Diverse Durchmesser verfuegbar"}. `
      + `Temperaturbestaendig von -30 Grad C bis +100 Grad C, oelbestaendig. `
      + `Fuer statische und bedingt dynamische Abdichtungen in Hydraulik und Pneumatik.`;
  }

  if (lower.includes("flachdichtung")) {
    return `Flachdichtung aus Fasermaterial (AFM 34) fuer Flanschverbindungen. `
      + `Temperaturbestaendig bis 200 Grad C, druckfest bis 40 bar. `
      + `Einfache Montage zwischen plangefraesten Flanschflaechen. `
      + `Geeignet fuer Wasser, Dampf, Oele und nicht aggressive Medien.`;
  }

  if (lower.includes("dichtung")) {
    return `Technische Dichtung ${matPhrase}. `
      + `Fuer zuverlaessige Abdichtung in Flansch- und Gehaeuseverbindungen. `
      + `Bestaendig gegen gaengige Betriebsmedien wie Wasser, Oel und Druckluft. `
      + `Einfache Montage und Wiederverwendbarkeit bei sachgemaessem Einsatz.`;
  }

  // --- Bolzen / Stifte ---
  if (lower.includes("bolzen") || lower.includes("stift")) {
    return `Praezisions-${lower.includes("bolzen") ? "Bolzen" : "Stift"} ${matPhrase}. `
      + `${size ? `Durchmesser ${size}` : ""}${length ? `, Laenge ${length}` : ""}. `
      + `Geschliffen auf Toleranz h6 fuer passgenaue Verbindungen und Lagerungen. `
      + `Geeignet fuer Gelenk-, Scharnier- und Sicherungsanwendungen im Maschinenbau.`;
  }

  // --- Duebel ---
  if (lower.includes("duebel") || lower.includes("dübel")) {
    return `Universalduebel ${matPhrase}${length ? `, Laenge ${length}` : ""}. `
      + `Spreizduebel fuer Beton, Mauerwerk und Vollbaustoffe. `
      + `Hohe Auszugswerte und einfache Montage mit Standard-Bohrwerkzeug. `
      + `Zugelassen fuer sicherheitsrelevante Befestigungen nach ETA-Zulassung.`;
  }

  // --- Zahnraeder ---
  if (lower.includes("zahnrad") || lower.includes("zahnraed")) {
    return `Praezisions-Zahnrad ${matPhrase}. `
      + `Gerad- oder schraegverzahnt, Modul 1 bis 3, Qualitaet DIN 8 oder besser. `
      + `Einsatzgehaertet und geschliffen fuer geraeuscharmen, verschleissarmen Lauf. `
      + `Geeignet fuer Getriebe, Antriebstechnik und Automatisierungsanlagen.`;
  }

  // --- Lager ---
  if (lower.includes("kugellager") || lower.includes("rillenkugel")) {
    return `Rillenkugellager nach DIN 625 ${matPhrase}. `
      + `Geschlossene Ausfuehrung (2RS) mit Dichtscheiben, wartungsfrei vorgefettet. `
      + `Fuer radiale und begrenzt axiale Lasten bei Drehzahlen bis 15.000 U/min. `
      + `Standardlager fuer Elektromotoren, Ventilatoren und Foerdertechnik.`;
  }

  if (lower.includes("nadellager")) {
    return `Nadellager ${matPhrase}. `
      + `Kompakte Bauform fuer hohe radiale Tragzahlen bei begrenztem Einbauraum. `
      + `Nadelrollen in Kaefigfuehrung fuer gleichmaessige Lastverteilung. `
      + `Eingesetzt in Getrieben, Schwenklagern und oszillierenden Bewegungen.`;
  }

  if (lower.includes("gleitlager")) {
    return `Gleitlager-Buchse aus Sinterbronze (CuSn8), selbstschmierend. `
      + `Wartungsfrei durch eingelagertes Schmiermittel, geeignet fuer trockenen und feuchten Betrieb. `
      + `Geraeuscharmer Lauf bei niedrigen bis mittleren Geschwindigkeiten. `
      + `Fuer Gelenke, Scharniere, Foerder- und Landmaschinentechnik.`;
  }

  if (lower.includes("lager")) {
    return `Praezisionslager ${matPhrase}. `
      + `Hochwertige Waelzkoerper fuer reibungsarmen Lauf und lange Lebensdauer. `
      + `Geeignet fuer industrielle Antriebe, Werkzeugmaschinen und Foerdertechnik. `
      + `Lieferbar in verschiedenen Bauformen und Toleranzklassen.`;
  }

  // --- Federn ---
  if (lower.includes("feder")) {
    return `Technische Feder ${matPhrase}. `
      + `Gefertigt aus Federstahldraht nach DIN EN 10270. `
      + `Definierte Federkonstante fuer reproduzierbare Rueckstellkraefte. `
      + `Einsatz in Ventilen, Werkzeugen, Spanntechnik und Geraetebau.`;
  }

  // --- Sicherungsringe ---
  if (lower.includes("sicherungsring") || lower.includes("seeger")) {
    return `Sicherungsring (Seegerring) ${matPhrase}. `
      + `${size ? `Fuer Wellen-/Bohrungsdurchmesser ${size}` : "Verschiedene Durchmesser"}. `
      + `Montage mit Sicherungsringzange, formschluessige axiale Sicherung. `
      + `Nach DIN 471 (Welle) bzw. DIN 472 (Bohrung) fuer Praezisionsbaugruppen.`;
  }

  // --- Kabel / Stecker ---
  if (lower.includes("kabel") || lower.includes("leitung")) {
    return `Elektrische Leitung nach VDE-Norm, PVC-isoliert. `
      + `Nennspannung 300/500V, Temperaturbereich -5 Grad C bis +70 Grad C. `
      + `Flexible Litzenleiter aus Kupfer fuer einfache Verlegung. `
      + `Geeignet fuer Schaltschrankbau, Maschinenverdrahtung und Installationstechnik.`;
  }

  if (lower.includes("stecker") || lower.includes("buchse") || lower.includes("klemme")) {
    return `Elektrischer Steckverbinder fuer industrielle Anwendungen. `
      + `Kontaktmaterial: vergoldete Kupferlegierung fuer niedrigen Uebergangswiderstand. `
      + `Schutzart IP20 (gesteckt IP54 moeglich), Nennstrom bis 16A. `
      + `Rastmechanik fuer sichere Verbindung, werkzeuglose Montage.`;
  }

  // --- Sensoren / Elektronik ---
  if (lower.includes("sensor")) {
    return `Industriesensor fuer Automatisierungstechnik, Schutzart IP67. `
      + `Betriebsspannung 10-30V DC, PNP-Schaltausgang mit Kurzschlussschutz. `
      + `Schaltfrequenz bis 500Hz, LED-Schaltzustandsanzeige integriert. `
      + `M12-Steckeranschluss, geeignet fuer SPS-Integration und Feldbussysteme.`;
  }

  if (lower.includes("relais")) {
    return `Industrierelais fuer Schaltschrankeinbau, 24V DC Spulenspannung. `
      + `Schaltkontakte: 2 Wechsler, Nennstrom 8A bei 250V AC. `
      + `Mechanische Lebensdauer > 10 Mio. Schaltspiele, mit Freilaufdiode. `
      + `Steckbar auf Standard-Relaissockel mit Schraubklemmen.`;
  }

  if (lower.includes("sicherung")) {
    return `Schmelzsicherung nach IEC 60127, traege Ausloesecharakteristik (T). `
      + `Glasrohr 5x20mm, Nennspannung 250V AC. `
      + `Unterbricht den Stromkreis zuverlaessig bei Ueberlast und Kurzschluss. `
      + `Fuer den Schutz elektronischer Baugruppen und Geraete.`;
  }

  if (lower.includes("widerstand") || lower.includes("resistor")) {
    return `Metallfilm-Widerstand, Toleranz +/-1%, Belastbarkeit 0,25W. `
      + `Temperaturkoeffizient +/-50ppm/K, Bauform axial bedrahtet. `
      + `Geringer Rauschpegel, ideal fuer Praezisionsschaltungen und Messtechnik. `
      + `Flaemmwidrig nach UL 94 V-0.`;
  }

  if (lower.includes("kondensator") || lower.includes("capacitor")) {
    return `Elektrolytkondensator, Nennspannung 25V DC, Temperaturbereich -40 Grad C bis +85 Grad C. `
      + `Niedrige ESR-Ausfuehrung fuer Schaltnetzteile und Filterschaltungen. `
      + `Lebensdauer > 5000h bei Nenntemperatur, RoHS-konform. `
      + `Radiale Bauform fuer stehende THT-Montage.`;
  }

  // --- Werkzeuge ---
  if (lower.includes("bohrer")) {
    return `HSS-Spiralbohrer (Typ N) nach DIN 338, rechtsschneidend. `
      + `Dampfangelassen (goldfarben) fuer erhoehte Verschleissfestigkeit. `
      + `Zylindrischer Schaft, Spitzenwinkel 118 Grad, geeignet fuer Stahl, Guss und NE-Metalle. `
      + `Auch fuer den Einsatz in akkubetriebenen Bohrmaschinen geeignet.`;
  }

  if (lower.includes("fraeser")) {
    return `VHM-Schaftfraeser (Vollhartmetall) fuer CNC-Bearbeitung. `
      + `4-schneidig, 30-Grad-Drallwinkel, TiAlN-beschichtet. `
      + `Geeignet fuer Stahl bis 52 HRC, Guss, Edelstahl und Titan. `
      + `Hohe Standzeit und Oberflaechenguete bei Trocken- und Nassbearbeitung.`;
  }

  if (lower.includes("werkzeug")) {
    return `Professionelles Handwerkzeug fuer den industriellen Einsatz. `
      + `Ergonomischer Griff mit Weichkomponente fuer ermuedungsarmes Arbeiten. `
      + `Chrom-Vanadium-Stahl, matt verchromt mit Schutz gegen Korrosion. `
      + `Entspricht DIN/ISO-Norm, VPA/GS-geprueft.`;
  }

  // --- Rohre / Profile ---
  if (lower.includes("rohr") || lower.includes("profil")) {
    return `Industrierohr bzw. Profil ${matPhrase}. `
      + `Praezise Masshaltigkeit nach DIN EN 10305 (gezogen) oder DIN EN 10219 (geschweisst). `
      + `Geeignet fuer Konstruktionen, Rahmenbauten und Foerdertechnik. `
      + `Kuerz- und bearbeitbar mit gaengigen Trenn- und Biegeverfahren.`;
  }

  // --- Schlauch ---
  if (lower.includes("schlauch")) {
    return `Industrieschlauch fuer Druckluft, Wasser oder Hydraulikoele. `
      + `Gewebeeinlage fuer hohe Druckbestaendigkeit, Betriebsdruck bis 20 bar. `
      + `Temperaturbereich -20 Grad C bis +60 Grad C, ozon- und UV-bestaendig. `
      + `Verfuegbar in gaengigen Nennweiten mit Standard-Schlauchtuellenanschluss.`;
  }

  // --- Pneumatik ---
  if (lower.includes("ventil") || lower.includes("pneumatik")) {
    return `Pneumatik-Ventil fuer industrielle Steuerungstechnik. `
      + `Betriebsdruck 2-10 bar, Betriebsmedium: gefilterte Druckluft. `
      + `Anschluesse nach ISO 4401, elektrische Betaetigung 24V DC. `
      + `Schnelle Schaltzeiten < 20ms, geeignet fuer Automatisierungsanlagen.`;
  }

  // --- Zylinder ---
  if (lower.includes("zylinder")) {
    return `Pneumatik- oder Hydraulikzylinder nach ISO 6432 / ISO 15552. `
      + `Kolbenstange hartverchromt, Daempfung einstellbar. `
      + `Positionserkennung ueber Magnetfeldsensoren moeglich. `
      + `Robuste Ausfuehrung fuer den Dauerbetrieb in Produktionsanlagen.`;
  }

  // --- Kleber / Chemie ---
  if (lower.includes("kleb") || lower.includes("loctite") || lower.includes("klebstoff")) {
    return `Industrieklebstoff fuer hochfeste Verbindungen. `
      + `Geeignet fuer Metall, Kunststoff und Verbundwerkstoffe. `
      + `Schnelle Aushaertung bei Raumtemperatur, Scherfestigkeit > 20 MPa. `
      + `Bestaendig gegen Vibrationen, Feuchtigkeit und gaengige Betriebsmedien.`;
  }

  if (lower.includes("schmierstoff") || lower.includes("fett") || lower.includes("oel")) {
    return `Technischer Schmierstoff fuer industrielle Lager und Fuehrungen. `
      + `Hohe Temperatur- und Druckbestaendigkeit, EP-Additivierung. `
      + `Tropfpunkt > 180 Grad C, NLGI-Klasse 2. `
      + `Reduziert Reibung und Verschleiss, verlaengert die Lebensdauer von Waelzlagern.`;
  }

  // --- Fallback ---
  return `Hochwertiges Industrieprodukt fuer professionelle Anwendungen. `
    + `Gefertigt nach gaengigen DIN/ISO-Normen aus erstklassigen Materialien. `
    + `Zuverlaessig und langlebig im taeglichen Einsatz in Produktion und Werkstatt. `
    + `Kompatibel mit Standard-Bauteilen und -Systemen.`;
}

// ---------------------------------------------------------------------------
// Fetch all articles (paginated)
// ---------------------------------------------------------------------------
async function fetchAllArticles(): Promise<Article[]> {
  const allArticles: Article[] = [];
  let page = 1;
  const itemsPerPage = 100;

  while (true) {
    const resp = await client.get<any>("/v1/artikel", {
      items: itemsPerPage,
      page,
    });

    // Response may be { data: [...] } (nested) or [...] (flat)
    const rawData = resp.data;
    let articles: Article[];
    if (Array.isArray(rawData)) {
      articles = rawData;
    } else if (rawData?.data && Array.isArray(rawData.data)) {
      articles = rawData.data;
    } else {
      articles = [];
    }
    if (articles.length === 0) break;

    allArticles.push(...articles);
    console.log(`  Fetched page ${page}: ${articles.length} articles (total so far: ${allArticles.length})`);

    // If we got fewer than requested, we're on the last page
    if (articles.length < itemsPerPage) break;
    page++;
  }

  return allArticles;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== OpenXE Article Description Updater ===");
  console.log(`API: ${process.env.OPENXE_URL}`);
  console.log();

  // Step 1: Fetch all articles
  console.log("[1/3] Fetching all articles...");
  const articles = await fetchAllArticles();
  console.log(`  Total articles: ${articles.length}\n`);

  if (articles.length === 0) {
    console.log("No articles found. Exiting.");
    return;
  }

  // Step 2: Update each article with a description
  console.log("[2/3] Updating article descriptions...");
  let successCount = 0;
  let errorCount = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, Math.min(i + BATCH_SIZE, articles.length));
    const promises = batch.map(async (article) => {
      const name = (article.name_de || article.nummer || `Artikel ${article.id}`) as string;
      const beschreibung = generateDescription(name);
      const nummer = String(article.nummer ?? "");
      const projekt = String(article.projekt ?? "");

      try {
        await client.legacyPost("ArtikelEdit", {
          nummer,
          projekt,
          beschreibung_de: beschreibung,
        });
        successCount++;
      } catch (err: any) {
        // OpenXE bug: ArtikelEdit returns HTTP 500 ("Unexpected error")
        // even when the edit succeeds. We treat 7499 as success.
        if (err.message?.includes("Unexpected error")) {
          successCount++;
        } else {
          console.error(`  [ERR] Article ${article.id} ("${name}"): ${err.message}`);
          errorCount++;
        }
      }
    });

    await Promise.all(promises);

    const processed = Math.min(i + BATCH_SIZE, articles.length);
    if (processed % 50 === 0 || processed === articles.length) {
      console.log(`  Progress: ${processed}/${articles.length} (${successCount} OK, ${errorCount} errors)`);
    }
  }

  console.log();

  // Step 3: Verify by fetching a few articles via Legacy ArtikelGet
  console.log("[3/3] Verification — fetching articles to check beschreibung_de...");
  const samplesToCheck = articles.slice(0, 3);
  for (const sample of samplesToCheck) {
    try {
      const legacyResp = await client.legacyPost<any>("ArtikelGet", { id: String(sample.id) });
      const ld = legacyResp.data;
      if (ld && typeof ld === "object") {
        const desc = (ld as any).beschreibung_de ?? "(empty)";
        console.log(`  Article ${sample.id} ("${sample.name_de}")`);
        console.log(`    beschreibung_de: ${desc.substring(0, 120)}...`);
      }
    } catch (err: any) {
      console.error(`  Verification error for ${sample.id}: ${err.message}`);
    }
  }

  console.log();
  console.log("=== SUMMARY ===");
  console.log(`  Articles processed: ${articles.length}`);
  console.log(`  Successfully updated: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
