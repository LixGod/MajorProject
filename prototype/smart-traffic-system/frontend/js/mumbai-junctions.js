/**
 * Mumbai Major Junctions Database
 * 50+ junctions with lat/lon, type, and landmark notes.
 */
const MUMBAI_JUNCTIONS = [
  // SOUTH MUMBAI
  { id: "marine-lines", name: "Marine Lines Junction", lat: 18.9432, lon: 72.8233, ways: 4, area: "South Mumbai", note: "Near Marine Lines station" },
  { id: "flora-fountain", name: "Flora Fountain (Hutatma Chowk)", lat: 18.9328, lon: 72.8350, ways: 5, area: "Fort", note: "Historic 5-way junction" },
  { id: "churchgate", name: "Churchgate Junction", lat: 18.9351, lon: 72.8330, ways: 4, area: "Churchgate", note: "Near Churchgate station" },
  { id: "csmt", name: "CSMT Junction", lat: 18.9398, lon: 72.8354, ways: 6, area: "Fort", note: "Chhatrapati Shivaji Maharaj Terminus" },
  { id: "masjid-bunder", name: "Masjid Bunder Junction", lat: 18.9476, lon: 72.8362, ways: 4, area: "Masjid Bunder", note: "Near Masjid Bunder station" },
  { id: "crawford-market", name: "Crawford Market Junction", lat: 18.9456, lon: 72.8334, ways: 4, area: "Crawford Market", note: "Muhammad Ali Road junction" },
  { id: "haji-ali", name: "Haji Ali Junction", lat: 18.9820, lon: 72.8092, ways: 4, area: "Worli", note: "Lala Lajpat Rai Marg junction" },
  { id: "worli-naka", name: "Worli Naka", lat: 19.0070, lon: 72.8190, ways: 4, area: "Worli", note: "Annie Besant Road junction" },
  { id: "parel-tee", name: "Parel T-Junction (Elphinstone)", lat: 18.9996, lon: 72.8325, ways: 4, area: "Parel", note: "Dr. B.A. Road" },

  // CENTRAL / LOWER PAREL
  { id: "lower-parel", name: "Lower Parel Junction", lat: 18.9934, lon: 72.8282, ways: 4, area: "Lower Parel", note: "Senapati Bapat Marg" },
  { id: "dadar-tee", name: "Dadar TT Circle", lat: 19.0194, lon: 72.8432, ways: 6, area: "Dadar", note: "Major 6-way traffic circle" },
  { id: "dadar-west", name: "Dadar West Junction", lat: 19.0176, lon: 72.8396, ways: 4, area: "Dadar West", note: "Gokhale Road junction" },
  { id: "mahim-causeway", name: "Mahim Causeway Junction", lat: 19.0390, lon: 72.8406, ways: 4, area: "Mahim", note: "SV Road junction" },
  { id: "dharavi-cross", name: "Dharavi Cross Road", lat: 19.0388, lon: 72.8528, ways: 4, area: "Dharavi", note: "90 Feet Road" },
  { id: "sion-junction", name: "Sion Junction", lat: 19.0459, lon: 72.8625, ways: 5, area: "Sion", note: "Eastern Express Highway junction" },

  // BANDRA
  { id: "bandra-linking", name: "Bandra Linking Road Junction", lat: 19.0586, lon: 72.8286, ways: 4, area: "Bandra West", note: "Linking Road & Turner Road" },
  { id: "bandra-station", name: "Bandra Station Junction", lat: 19.0544, lon: 72.8402, ways: 4, area: "Bandra East", note: "Hill Road junction" },
  { id: "bkc-junction", name: "BKC G-Block Junction", lat: 19.0658, lon: 72.8691, ways: 4, area: "BKC", note: "Maker Maxity BKC" },
  { id: "bkc-north", name: "BKC North Avenue Junction", lat: 19.0704, lon: 72.8718, ways: 4, area: "BKC", note: "C-69 Junction" },
  { id: "turner-road", name: "Turner Road & SV Road", lat: 19.0543, lon: 72.8282, ways: 4, area: "Bandra West", note: "Near Mount Mary steps" },

  // ANDHERI
  { id: "andheri-west-sv", name: "Andheri West SV Road Junction", lat: 19.1197, lon: 72.8362, ways: 4, area: "Andheri West", note: "SV Road & Datta Mandir" },
  { id: "andheri-station", name: "Andheri Station Junction", lat: 19.1197, lon: 72.8465, ways: 6, area: "Andheri", note: "Major 6-way junction near station" },
  { id: "jb-nagar", name: "JB Nagar Junction", lat: 19.1091, lon: 72.8760, ways: 4, area: "Andheri East", note: "Near Seepz" },
  { id: "sahar-junction", name: "Sahar Junction", lat: 19.0996, lon: 72.8756, ways: 4, area: "Sahar", note: "Near airport" },
  { id: "vile-parle-sv", name: "Vile Parle SV Road Junction", lat: 19.0972, lon: 72.8381, ways: 4, area: "Vile Parle", note: "SV Road & Irla junction" },

  // WESTERN SUBURBS (SANTACRUZ — BORIVALI)
  { id: "santacruz-linking", name: "Santacruz Linking Road", lat: 19.0833, lon: 72.8328, ways: 4, area: "Santacruz West", note: "Juhu Tara Road junction" },
  { id: "juhu-circle", name: "Juhu Circle", lat: 19.1025, lon: 72.8261, ways: 4, area: "Juhu", note: "JVPD scheme junction" },
  { id: "kandivali-sv", name: "Kandivali SV Road Junction", lat: 19.2046, lon: 72.8428, ways: 4, area: "Kandivali West", note: "SV Road & Thakur Village" },
  { id: "malad-linking", name: "Malad Linking Road Junction", lat: 19.1864, lon: 72.8409, ways: 4, area: "Malad West", note: "Mindspace junction" },
  { id: "borivali-sv", name: "Borivali SV Road Junction", lat: 19.2302, lon: 72.8566, ways: 4, area: "Borivali West", note: "Station road junction" },
  { id: "goregaon-filmcity", name: "Goregaon Film City Road", lat: 19.1567, lon: 72.8468, ways: 4, area: "Goregaon", note: "JVLR junction" },

  // EASTERN SUBURBS
  { id: "kurla-lbs", name: "Kurla LBS Marg Junction", lat: 19.0728, lon: 72.8785, ways: 5, area: "Kurla West", note: "LBS & CST Road" },
  { id: "ghatkopar-lbs", name: "Ghatkopar LBS Marg", lat: 19.0868, lon: 72.9074, ways: 4, area: "Ghatkopar West", note: "LBS Marg & Tilak Nagar" },
  { id: "vikhroli-eastern", name: "Vikhroli Eastern Express", lat: 19.1092, lon: 72.9242, ways: 4, area: "Vikhroli", note: "EEH junction" },
  { id: "powai-hiranandani", name: "Powai Hiranandani Junction", lat: 19.1178, lon: 72.9068, ways: 4, area: "Powai", note: "Hiranandani Gardens" },
  { id: "mulund-lbs", name: "Mulund LBS Junction", lat: 19.1766, lon: 72.9392, ways: 4, area: "Mulund West", note: "LBS Marg entry" },
  { id: "thane-station", name: "Thane Station Junction", lat: 19.1972, lon: 72.9614, ways: 5, area: "Thane", note: "Cadbury Junction" },
  { id: "ghansoli", name: "Ghansoli Junction (Navi Mumbai)", lat: 19.1173, lon: 73.0084, ways: 4, area: "Navi Mumbai", note: "Palm Beach Road" },
  { id: "vashi-circle", name: "Vashi Circle", lat: 19.0740, lon: 73.0092, ways: 6, area: "Vashi", note: "Sector 30 junction" },
  { id: "belapur-junction", name: "CBD Belapur Junction", lat: 19.0230, lon: 73.0313, ways: 4, area: "Belapur", note: "Sector 11 junction" },

  // KEY ARTERIES
  { id: "western-express-andheri", name: "WEH & JVLR Junction", lat: 19.1210, lon: 72.8690, ways: 4, area: "Andheri East", note: "Western Express Highway" },
  { id: "eastern-express-kurla", name: "EEH & LBS Junction (Kurla)", lat: 19.0752, lon: 72.8902, ways: 4, area: "Kurla East", note: "Eastern Express Highway" },
  { id: "jvlr-powai", name: "JVLR & Powai Lake Junction", lat: 19.1226, lon: 72.9013, ways: 4, area: "Powai", note: "Jogeshwari–Vikhroli Link Road" },
  { id: "sion-panvel", name: "Sion–Panvel Highway Junction", lat: 19.0521, lon: 72.9068, ways: 4, area: "Chembur", note: "Sion-Panvel Highway" },
  { id: "chembur-easternexpress", name: "Chembur EEH Junction", lat: 19.0612, lon: 72.8994, ways: 4, area: "Chembur", note: "Diamond Garden junction" },
  { id: "kanjurmarg-eastern", name: "Kanjurmarg EEH Junction", lat: 19.1353, lon: 72.9411, ways: 4, area: "Kanjurmarg", note: "Eastern Express Highway" },

  // HARBOURLINE / DOCKYARD
  { id: "wadala-tlc", name: "Wadala T-Junction", lat: 19.0221, lon: 72.8612, ways: 4, area: "Wadala", note: "Antop Hill junction" },
  { id: "chunabhatti", name: "Chunabhatti Junction", lat: 19.0467, lon: 72.8750, ways: 4, area: "Chunabhatti", note: "Sion-Trombay Road" },
  { id: "govandi", name: "Govandi Junction", lat: 19.0652, lon: 72.9132, ways: 4, area: "Govandi", note: "Near Deonar" },
  { id: "mankhurd-junction", name: "Mankhurd Junction", lat: 19.0445, lon: 72.9308, ways: 4, area: "Mankhurd", note: "Sion-Panvel Highway & EEH" },
];

// Group by area for the dropdown
const JUNCTION_AREAS = [...new Set(MUMBAI_JUNCTIONS.map(j => j.area))].sort();
