const fs = require('fs');
const path = require('path');

const logosDir = path.join(__dirname, 'assets', 'logos');
if (!fs.existsSync(logosDir)) {
  fs.mkdirSync(logosDir, { recursive: true });
}

const logos = {
  'all-brands.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="46" fill="#f8fafc" stroke="#f97316" stroke-width="5"/>
    <path d="M26 50h48M50 26v48" stroke="#f97316" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="50" cy="50" rx="36" ry="18" stroke="#334155" stroke-width="3.5"/>
    <ellipse cx="50" cy="50" rx="18" ry="36" stroke="#334155" stroke-width="3.5"/>
    <circle cx="50" cy="50" r="8" fill="#f97316"/>
  </svg>`,

  'volkswagen.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="#001e50"/>
    <circle cx="50" cy="50" r="41" fill="none" stroke="#ffffff" stroke-width="4"/>
    <path d="M28 32l16 35 6-13 6 13 16-35h-6l-13 28-3-7 7-16h-6l-4 9-4-9h-6l7 16-3 7-13-28h-7z" fill="#ffffff"/>
    <circle cx="50" cy="50" r="46" fill="none" stroke="#001e50" stroke-width="2"/>
  </svg>`,

  'renault.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M50 4L84 50 50 96 16 50Z" fill="none" stroke="#111827" stroke-width="12" stroke-linejoin="miter"/>
    <path d="M50 24L68 50 50 76 32 50Z" fill="#ffcc00"/>
    <path d="M50 32L62 50 50 68 38 50Z" fill="#ffffff"/>
  </svg>`,

  'fiat.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect x="6" y="16" width="88" height="68" rx="20" fill="#98002e"/>
    <rect x="10" y="20" width="80" height="60" rx="16" fill="none" stroke="#e2e8f0" stroke-width="3"/>
    <text x="50" y="60" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">FIAT</text>
  </svg>`,

  'ford.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">
    <ellipse cx="60" cy="35" rx="56" ry="31" fill="#002c6c" stroke="#ffffff" stroke-width="4"/>
    <ellipse cx="60" cy="35" rx="52" ry="27" fill="none" stroke="#c0c7d0" stroke-width="2"/>
    <text x="60" y="44" font-family="'Brush Script MT', 'Segoe Script', cursive, sans-serif" font-size="38" font-style="italic" font-weight="bold" fill="#ffffff" text-anchor="middle">Ford</text>
  </svg>`,

  'bmw.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="#111827"/>
    <circle cx="50" cy="50" r="44" fill="none" stroke="#d1d5db" stroke-width="2"/>
    <circle cx="50" cy="50" r="28" fill="#ffffff"/>
    <path d="M50 22A28 28 0 0 1 78 50H50V22z" fill="#0066b1"/>
    <path d="M50 50H22a28 28 0 0 1 28-28v28z" fill="#ffffff"/>
    <path d="M50 50v28A28 28 0 0 1 22 50h28z" fill="#0066b1"/>
    <path d="M50 50h28a28 28 0 0 1-28 28V50z" fill="#ffffff"/>
    <circle cx="50" cy="50" r="28" fill="none" stroke="#d1d5db" stroke-width="2"/>
    <text x="32" y="19" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#ffffff">B</text>
    <text x="50" y="15" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#ffffff" text-anchor="middle">M</text>
    <text x="68" y="19" font-family="Arial, sans-serif" font-size="11" font-weight="900" fill="#ffffff">W</text>
  </svg>`,

  'mercedes-benz.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="46" fill="#1e293b"/>
    <circle cx="50" cy="50" r="43" fill="none" stroke="#e2e8f0" stroke-width="4"/>
    <circle cx="50" cy="50" r="6" fill="#e2e8f0"/>
    <polygon points="50,11 47,48 50,52 53,48" fill="#e2e8f0"/>
    <polygon points="16,70 48,53 50,50 46,47" fill="#e2e8f0"/>
    <polygon points="84,70 54,47 50,50 52,53" fill="#e2e8f0"/>
  </svg>`,

  'toyota.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
    <ellipse cx="60" cy="40" rx="55" ry="36" fill="none" stroke="#eb0a1e" stroke-width="7"/>
    <ellipse cx="60" cy="30" rx="28" ry="16" fill="none" stroke="#eb0a1e" stroke-width="6"/>
    <ellipse cx="60" cy="45" rx="14" ry="30" fill="none" stroke="#eb0a1e" stroke-width="6"/>
  </svg>`,

  'hyundai.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 75">
    <ellipse cx="60" cy="37.5" rx="55" ry="32" fill="none" stroke="#002c5f" stroke-width="7"/>
    <path d="M42 22c4 10 7 21 8 31m28-31c-3 10-6 21-8 31m-25-15h24" stroke="#002c5f" stroke-width="8" stroke-linecap="round"/>
  </svg>`,

  'audi.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 50">
    <circle cx="25" cy="25" r="18" fill="none" stroke="#111827" stroke-width="5"/>
    <circle cx="55" cy="25" r="18" fill="none" stroke="#111827" stroke-width="5"/>
    <circle cx="85" cy="25" r="18" fill="none" stroke="#111827" stroke-width="5"/>
    <circle cx="115" cy="25" r="18" fill="none" stroke="#111827" stroke-width="5"/>
  </svg>`,

  'opel.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="44" fill="none" stroke="#0f172a" stroke-width="8"/>
    <polygon points="26,44 60,44 42,66 74,44 54,44 68,26" fill="#fcbf00" stroke="#0f172a" stroke-width="2"/>
    <polygon points="12,47 52,47 40,59 88,47 62,47 70,39" fill="#0f172a"/>
  </svg>`,

  'peugeot.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 110">
    <path d="M50 6L88 20v45c0 25-22 36-38 41C34 101 12 90 12 65V20Z" fill="#111827" stroke="#3b82f6" stroke-width="3"/>
    <path d="M44 32c4-4 12-4 16 0 5 5 2 12-2 15 5 2 10 8 8 15-2 6-8 9-14 9m0-39v39m0-22h12" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none"/>
    <circle cx="56" cy="38" r="3" fill="#3b82f6"/>
  </svg>`,

  'honda.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 85">
    <rect x="8" y="6" width="84" height="73" rx="14" fill="none" stroke="#cc0000" stroke-width="8"/>
    <path d="M26 22l8 42h10l-2-20h16l-2 20h10l8-42h-11l-3 15H38l-3-15H26z" fill="#cc0000"/>
  </svg>`,

  'nissan.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="44" fill="none" stroke="#c3002f" stroke-width="8"/>
    <rect x="6" y="38" width="88" height="24" rx="4" fill="#1e293b"/>
    <text x="50" y="55" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">NISSAN</text>
  </svg>`,

  'kia.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
    <path d="M16 48V12m0 20l20-20m-14 14l16 22M56 12v36m24-36l-18 36m14-18h16m-4 18l14-36" stroke="#05141f" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`,

  'skoda.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="45" fill="none" stroke="#0e3a2f" stroke-width="8"/>
    <circle cx="50" cy="50" r="40" fill="#0e3a2f"/>
    <path d="M50 20c15 0 25 10 25 25 0 8-5 15-12 18l12 17H60L50 62l-6 18H32l10-25c-4-4-6-9-6-15 0-15 11-20 14-20z" fill="#78faae"/>
    <circle cx="50" cy="38" r="4" fill="#0e3a2f"/>
  </svg>`,

  'seat.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 90">
    <path d="M22 20h56L66 38H34l-4 14h48L66 70H14l12-24h32l4-12H22Z" fill="#cb002c"/>
  </svg>`,

  'citroen.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 90">
    <polygon points="50,8 86,34 76,42 50,22 24,42 14,34" fill="#da291c"/>
    <polygon points="50,46 86,72 76,80 50,60 24,80 14,72" fill="#da291c"/>
  </svg>`,

  'dacia.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70">
    <path d="M24 16h24l12 19-12 19H24l12-19Z" fill="none" stroke="#646b53" stroke-width="8" stroke-linejoin="round"/>
    <path d="M96 16H72L60 35l12 19h24l-12-19Z" fill="none" stroke="#646b53" stroke-width="8" stroke-linejoin="round"/>
  </svg>`,

  'volvo.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="48" cy="52" r="38" fill="none" stroke="#003057" stroke-width="8"/>
    <path d="M72 28L92 8m0 0H74m18 0v18" stroke="#003057" stroke-width="8" stroke-linecap="square"/>
    <rect x="12" y="44" width="72" height="16" fill="#003057"/>
    <text x="48" y="56" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">VOLVO</text>
  </svg>`,

  'chery.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80">
    <ellipse cx="60" cy="40" rx="52" ry="32" fill="none" stroke="#c8102e" stroke-width="7"/>
    <polygon points="60,20 40,56 50,56 60,38 70,56 80,56" fill="#c8102e"/>
    <circle cx="60" cy="46" r="6" fill="#ffffff"/>
  </svg>`
};

for (const [name, content] of Object.entries(logos)) {
  fs.writeFileSync(path.join(logosDir, name), content.trim(), 'utf8');
}
console.log(`Generated ${Object.keys(logos).length} official brand logos in ${logosDir}`);
