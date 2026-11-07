/**
 * How MOX writes Formula 1's names in Arabic — one spelling each, every time.
 *
 * Without this the same driver came out "ليكلير" in one story and "لوكلير" in
 * the next. Handed to the translator with every story. Add a name here when a
 * new one starts appearing; the grid is the 2026 season's.
 */
export const F1_NAMES_AR: Record<string, string> = {
  // Drivers
  "Kimi Antonelli": "كيمي أنتونيلي",
  "George Russell": "جورج راسل",
  "Lando Norris": "لاندو نوريس",
  "Oscar Piastri": "أوسكار بياستري",
  "Charles Leclerc": "شارل لوكلير",
  "Lewis Hamilton": "لويس هاميلتون",
  "Max Verstappen": "ماكس فيرستابن",
  "Isack Hadjar": "إسحاق حجار",
  "Liam Lawson": "ليام لوسون",
  "Arvid Lindblad": "أرفيد ليندبلاد",
  "Fernando Alonso": "فرناندو ألونسو",
  "Lance Stroll": "لانس سترول",
  "Alex Albon": "أليكس ألبون",
  "Carlos Sainz": "كارلوس ساينز",
  "Pierre Gasly": "بيير غاسلي",
  "Franco Colapinto": "فرانكو كولابينتو",
  "Esteban Ocon": "إستيبان أوكون",
  "Oliver Bearman": "أوليفر بيرمان",
  "Nico Hulkenberg": "نيكو هولكنبرغ",
  "Gabriel Bortoleto": "غابرييل بورتوليتو",
  "Valtteri Bottas": "فالتيري بوتاس",
  "Sergio Perez": "سيرجيو بيريز",
  "Colton Herta": "كولتون هيرتا",
  "Rafael Camara": "رافائيل كامارا",
  "Nikola Tsolov": "نيكولا تسولوف",
  "Yuki Tsunoda": "يوكي تسونودا",
  // Team bosses
  "Fred Vasseur": "فريدريك فاسور",
  "Toto Wolff": "توتو وولف",
  "Andrea Stella": "أندريا ستيلا",
  "Laurent Mekies": "لوران ميكيس",
  "Alan Permane": "آلان بيرمان",
  "Ayao Komatsu": "أياو كوماتسو",
  // Teams
  Mercedes: "مرسيدس",
  McLaren: "ماكلارين",
  Ferrari: "فيراري",
  "Red Bull": "ريد بول",
  "Racing Bulls": "ريسينغ بولز",
  "Aston Martin": "أستون مارتن",
  Williams: "ويليامز",
  Alpine: "ألبين",
  Haas: "هاس",
  Audi: "أودي",
  Cadillac: "كاديلاك",
  // Places
  Interlagos: "إنترلاغوس",
  "Sao Paulo": "ساو باولو",
  "Las Vegas": "لاس فيغاس",
  "Abu Dhabi": "أبوظبي",
  "Yas Marina": "ياس مارينا",
  Qatar: "قطر",
  Lusail: "لوسيل",
  "Mexico City": "مكسيكو سيتي",
};

export const glossaryText = () =>
  Object.entries(F1_NAMES_AR).map(([en, ar]) => `${en} = ${ar}`).join("\n");
