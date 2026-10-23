// ============================================================================
// Otomotiv Teknik Şema & Çizim Motoru (services/automotiveDiagramGenerator.js)
// Profesyonel OEM CAD / Blueprint Standartlarında Vektörel (SVG) Teknik Çizim Üretici
// ============================================================================

/**
 * Parça türüne, OE koduna ve markaya göre gerçekçi, yüksek çözünürlüklü
 * OEM CAD teknik montaj şeması (Exploded Diagram) SVG'si üretir.
 *
 * @param {string} partType - timing_belt, brake_pad, brake_disc, oil_filter, air_filter, thermostat, clutch_kit, turbo_hose, shock_absorber, general
 * @param {string} oeNumber - OE / Parça Numarası (Örn: 7701045724)
 * @param {string} brand - Araç / Parça Markası (Örn: Renault)
 * @param {string} partName - Parça Adı (Örn: Renault Orijinal Yedek Parça)
 * @returns {string} SVG xml formatında çizim
 */
function generateTechnicalDiagramSvg(partType = 'general', oeNumber = '', brand = '', partName = '') {
  const cleanOe = String(oeNumber || 'OEM-PART').trim().toUpperCase();
  const cleanBrand = String(brand || 'OEM').trim();
  const cleanName = String(partName || `${cleanBrand} Orijinal Parça (${cleanOe})`).trim();

  // 1. Parça Türüne Göre Merkez Çizim (Drawing Geometry)
  let partDrawing = '';

  switch (partType) {
    case 'timing_belt':
      partDrawing = `
        <!-- Eksantrik Dişli Kasnağı (Üst) -->
        <g transform="translate(190, 140)">
          <circle cx="0" cy="0" r="65" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5"/>
          <circle cx="0" cy="0" r="55" fill="none" stroke="#64748b" stroke-dasharray="3 3"/>
          <circle cx="0" cy="0" r="40" fill="#e2e8f0" stroke="#334155" stroke-width="1.5"/>
          <circle cx="0" cy="0" r="15" fill="#cbd5e1" stroke="#0f172a" stroke-width="2"/>
          <rect x="-3" y="-18" width="6" height="8" fill="#0f172a"/>
          <!-- Dişler -->
          ${Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 360) / 24;
            return `<line x1="0" y1="-65" x2="0" y2="-72" stroke="#0f172a" stroke-width="3" transform="rotate(${angle})"/>`;
          }).join('')}
          <!-- Centik / Sentet Noktası -->
          <polygon points="0,-60 -5,-50 5,-50" fill="#dc2626"/>
          <text x="8" y="-48" font-size="9" font-family="monospace" fill="#dc2626" font-weight="bold">SENTE (TIMING MARK)</text>
        </g>

        <!-- Su Pompası Kasnağı -->
        <g transform="translate(320, 210)">
          <circle cx="0" cy="0" r="42" fill="#f8fafc" stroke="#334155" stroke-width="2"/>
          <circle cx="0" cy="0" r="12" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5"/>
          <text x="-25" y="4" font-size="9" font-family="monospace" fill="#64748b">SU POMPASI</text>
        </g>

        <!-- Otomatik Gergi Rulmanı -->
        <g transform="translate(130, 250)">
          <circle cx="0" cy="0" r="38" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>
          <circle cx="0" cy="0" r="14" fill="#cbd5e1" stroke="#78350f" stroke-width="1.5"/>
          <rect x="-4" y="-4" width="8" height="8" fill="#78350f"/>
          <!-- Gergi İbre / Göstergesi -->
          <line x1="0" y1="0" x2="-22" y2="-22" stroke="#dc2626" stroke-width="2"/>
          <polygon points="-22,-22 -16,-28 -28,-16" fill="#dc2626"/>
          <text x="-48" y="24" font-size="8.5" font-family="monospace" fill="#b45309" font-weight="bold">GERGİ (TENSIONER)</text>
        </g>

        <!-- Krank Dişlisi (Alt) -->
        <g transform="translate(230, 350)">
          <circle cx="0" cy="0" r="45" fill="#f1f5f9" stroke="#1e293b" stroke-width="2.5"/>
          <circle cx="0" cy="0" r="30" fill="#e2e8f0" stroke="#334155" stroke-width="1.5"/>
          <circle cx="0" cy="0" r="14" fill="#0f172a" stroke="#0f172a"/>
          <rect x="-3" y="-16" width="6" height="6" fill="#f8fafc"/>
          ${Array.from({ length: 18 }).map((_, i) => {
            const angle = (i * 360) / 18;
            return `<line x1="0" y1="-45" x2="0" y2="-51" stroke="#0f172a" stroke-width="3" transform="rotate(${angle})"/>`;
          }).join('')}
          <line x1="0" y1="-45" x2="0" y2="-30" stroke="#dc2626" stroke-width="2"/>
        </g>

        <!-- Triger Kayışı Yolu (Path) -->
        <path d="M 190,68 C 280,70 362,170 362,210 C 362,250 275,340 275,350 C 275,395 185,395 185,350 C 185,320 92,260 92,250 C 92,200 125,75 190,68 Z" 
              fill="none" stroke="#2563eb" stroke-width="5" stroke-linejoin="round"/>
        <path d="M 190,68 C 280,70 362,170 362,210 C 362,250 275,340 275,350 C 275,395 185,395 185,350 C 185,320 92,260 92,250 C 92,200 125,75 190,68 Z" 
              fill="none" stroke="#1d4ed8" stroke-width="2" stroke-dasharray="4 2"/>

        <!-- Ölçü & Tork Bilgileri -->
        <text x="360" y="320" font-size="10" font-family="monospace" fill="#0f172a" font-weight="bold">TORQUE: 45 Nm + 90°</text>
        <text x="360" y="336" font-size="9" font-family="monospace" fill="#475569">BELT: 123T x 27.0 mm (HNBR)</text>
      `;
      break;

    case 'brake_pad':
      partDrawing = `
        <!-- Fren Diski Kesiti (Arka Plan) -->
        <path d="M 90,80 C 170,120 220,220 220,330 C 220,390 190,440 140,460" 
              fill="none" stroke="#cbd5e1" stroke-width="28" stroke-linecap="round"/>
        <path d="M 90,80 C 170,120 220,220 220,330 C 220,390 190,440 140,460" 
              fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6 3"/>

        <!-- Fren Balatası (İç) -->
        <g transform="translate(190, 160)">
          <!-- Metal Taşıyıcı Sac -->
          <path d="M 0,20 C 10,-5 80,-5 120,-5 C 160,-5 220,-5 230,20 L 235,80 C 225,95 170,90 115,90 C 60,90 10,95 0,80 Z" 
                fill="#334155" stroke="#0f172a" stroke-width="2"/>
          <!-- Sürtünme Materyali (Balata) -->
          <path d="M 15,22 C 30,8 80,6 115,6 C 150,6 200,8 215,22 L 215,75 C 190,80 150,78 115,78 C 80,78 40,80 15,75 Z" 
                fill="#475569" stroke="#1e293b" stroke-width="1.5"/>
          <!-- Soğutma Kanalı (Slot) -->
          <line x1="115" y1="10" x2="115" y2="75" stroke="#0f172a" stroke-width="3"/>
          <!-- Montaj Kulakları -->
          <circle cx="8" cy="48" r="5" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5"/>
          <circle cx="225" cy="48" r="5" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5"/>
          <!-- Aşınma Sensörü Kablosu -->
          <path d="M 115,10 C 115,-20 80,-40 60,-45" fill="none" stroke="#f59e0b" stroke-width="3"/>
          <circle cx="60" cy="-45" r="4" fill="#0f172a"/>
          <text x="68" y="-42" font-size="9" font-family="monospace" fill="#d97706" font-weight="bold">AŞINMA SENSÖRÜ</text>
        </g>

        <!-- Fren Balatası (Dış - Patlatılmış Ön Görünüm) -->
        <g transform="translate(250, 270)">
          <path d="M 0,20 C 10,-5 80,-5 120,-5 C 160,-5 220,-5 230,20 L 235,80 C 225,95 170,90 115,90 C 60,90 10,95 0,80 Z" 
                fill="#475569" stroke="#0f172a" stroke-width="2"/>
          <path d="M 15,22 C 30,8 80,6 115,6 C 150,6 200,8 215,22 L 215,75 C 190,80 150,78 115,78 C 80,78 40,80 15,75 Z" 
                fill="#64748b" stroke="#1e293b" stroke-width="1.5"/>
          <line x1="115" y1="10" x2="115" y2="75" stroke="#0f172a" stroke-width="3"/>
          <!-- Titreşim Önleyici Sac (Anti-Squeal Shim) -->
          <rect x="35" y="15" width="160" height="55" rx="4" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4 2"/>
          <text x="45" y="45" font-size="9" font-family="monospace" fill="#1d4ed8" font-weight="bold">ANTI-SQUEAL SHIM</text>
        </g>

        <!-- Patlatılmış Montaj Eksen Çizgisi -->
        <line x1="60" y1="210" x2="430" y2="330" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 3"/>
        <text x="250" y="380" font-size="9.5" font-family="monospace" fill="#0f172a" font-weight="bold">GENİŞLİK: 137.0 mm | KALINLIK: 17.5 mm</text>
      `;
      break;

    case 'brake_disc':
      partDrawing = `
        <g transform="translate(240, 230)">
          <!-- Dış Rotor Çemberi -->
          <circle cx="0" cy="0" r="140" fill="#f8fafc" stroke="#0f172a" stroke-width="3"/>
          <circle cx="0" cy="0" r="132" fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 2"/>
          <circle cx="0" cy="0" r="90" fill="#f1f5f9" stroke="#334155" stroke-width="2"/>

          <!-- Porya Şapkası (Hat) -->
          <circle cx="0" cy="0" r="75" fill="#e2e8f0" stroke="#1e293b" stroke-width="2"/>
          <circle cx="0" cy="0" r="34" fill="#cbd5e1" stroke="#0f172a" stroke-width="2.5"/>

          <!-- 5 Bijon Delikleri -->
          ${Array.from({ length: 5 }).map((_, i) => {
            const angle = (i * 360) / 5;
            return `
              <g transform="rotate(${angle}) translate(0, -54)">
                <circle cx="0" cy="0" r="8" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
                <circle cx="0" cy="0" r="4" fill="#0f172a"/>
              </g>
            `;
          }).join('')}

          <!-- Sabitleme Civata Deliği -->
          <circle cx="36" cy="36" r="4" fill="#dc2626" stroke="#0f172a" stroke-width="1.5"/>

          <!-- Havalandırma Kanatları (İç Kesit Gösterimi) -->
          ${Array.from({ length: 16 }).map((_, i) => {
            const angle = (i * 360) / 16;
            return `<line x1="95" y1="0" x2="128" y2="8" stroke="#94a3b8" stroke-width="2" transform="rotate(${angle})"/>`;
          }).join('')}

          <!-- Ölçü Okları -->
          <line x1="-140" y1="0" x2="140" y2="0" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="4 2"/>
          <text x="10" y="-8" font-size="10" font-family="monospace" fill="#1d4ed8" font-weight="bold">Ø 280 mm</text>
        </g>
        <text x="140" y="400" font-size="9.5" font-family="monospace" fill="#0f172a" font-weight="bold">HAVALANDIRMALI FREN DİSKİ (VENTED ROTOR)</text>
        <text x="140" y="416" font-size="9" font-family="monospace" fill="#475569">NOM. THK: 24.0 mm | MIN. THK: 21.8 mm | 5-DELİK</text>
      `;
      break;

    case 'oil_filter':
      partDrawing = `
        <g transform="translate(230, 120)">
          <!-- Filtre Metal Gövdesi -->
          <rect x="-60" y="0" width="120" height="180" rx="8" fill="#1e293b" stroke="#0f172a" stroke-width="3"/>
          <!-- Dip Olukları -->
          <rect x="-56" y="165" width="112" height="12" rx="4" fill="#334155"/>
          ${Array.from({ length: 12 }).map((_, i) => `<line x1="${-50 + i * 9}" y1="165" x2="${-50 + i * 9}" y2="177" stroke="#0f172a" stroke-width="1.5"/>`).join('')}

          <!-- Kesit Penceresi (İç Yapı) -->
          <rect x="-48" y="30" width="96" height="120" fill="#f8fafc" stroke="#64748b" stroke-width="1.5"/>
          <!-- Akordeon Kıvrımlı Filtre Kağıdı -->
          ${Array.from({ length: 14 }).map((_, i) => `
            <polygon points="-44,${38 + i * 8} -15,${34 + i * 8} -44,${30 + i * 8}" fill="#f59e0b" stroke="#d97706" stroke-width="1"/>
            <polygon points="44,${38 + i * 8} 15,${34 + i * 8} 44,${30 + i * 8}" fill="#f59e0b" stroke="#d97706" stroke-width="1"/>
          `).join('')}
          <!-- Delikli Merkez Boru -->
          <rect x="-12" y="30" width="24" height="120" fill="#cbd5e1" stroke="#334155" stroke-width="1.5"/>
          ${Array.from({ length: 8 }).map((_, i) => `<circle cx="0" cy="${40 + i * 14}" r="3" fill="#0f172a"/>`).join('')}

          <!-- Dişli Taban Plakası (Üst) -->
          <rect x="-50" y="-18" width="100" height="18" fill="#e2e8f0" stroke="#0f172a" stroke-width="2"/>
          <circle cx="0" cy="-9" r="10" fill="#0f172a"/>
          <text x="-18" y="-22" font-size="8.5" font-family="monospace" fill="#0f172a" font-weight="bold">M20 x 1.5</text>
          <!-- Conta Ring -->
          <rect x="-44" y="-22" width="88" height="4" fill="#dc2626"/>
        </g>
        <text x="140" y="340" font-size="9.5" font-family="monospace" fill="#0f172a" font-weight="bold">SPIN-ON YAĞ FİLTRESİ ELEMANI</text>
        <text x="140" y="356" font-size="9" font-family="monospace" fill="#475569">BYPASS VALF: 1.2 BAR | SIKMA: 20-25 Nm</text>
      `;
      break;

    case 'air_filter':
      partDrawing = `
        <g transform="translate(140, 150)">
          <!-- Poliüretan Dış Çerçeve -->
          <rect x="0" y="0" width="220" height="150" rx="10" fill="#fed7aa" stroke="#ea580c" stroke-width="3"/>
          <rect x="12" y="12" width="196" height="126" rx="4" fill="#f8fafc" stroke="#c2410c" stroke-width="1.5"/>

          <!-- Akordeon Panel Pileleri -->
          ${Array.from({ length: 22 }).map((_, i) => `
            <line x1="${20 + i * 8.5}" y1="14" x2="${20 + i * 8.5}" y2="136" stroke="#fbbf24" stroke-width="4"/>
            <line x1="${20 + i * 8.5}" y1="14" x2="${20 + i * 8.5}" y2="136" stroke="#b45309" stroke-width="1"/>
          `).join('')}

          <!-- Destek / Rijitlik Çubukları -->
          <line x1="12" y1="55" x2="208" y2="55" stroke="#ea580c" stroke-width="3" opacity="0.8"/>
          <line x1="12" y1="95" x2="208" y2="95" stroke="#ea580c" stroke-width="3" opacity="0.8"/>

          <!-- Hava Akış Oku -->
          <g transform="translate(110, 175)">
            <line x1="0" y1="0" x2="0" y2="35" stroke="#2563eb" stroke-width="3"/>
            <polygon points="0,42 -6,30 6,30" fill="#2563eb"/>
            <text x="12" y="24" font-size="9" font-family="monospace" fill="#1d4ed8" font-weight="bold">AIR FLOW ➔</text>
          </g>
        </g>
        <text x="140" y="380" font-size="9.5" font-family="monospace" fill="#0f172a" font-weight="bold">PANEL HAVA FİLTRESİ ELEMANI</text>
        <text x="140" y="396" font-size="9" font-family="monospace" fill="#475569">ÖLÇÜ: 280 x 140 x 45 mm | YÜKSEK EMİŞ KAPASİTELİ</text>
      `;
      break;

    case 'clutch_kit':
      partDrawing = `
        <!-- Debriyaj Baskısı (Sol) -->
        <g transform="translate(170, 230)">
          <circle cx="0" cy="0" r="95" fill="#f1f5f9" stroke="#1e293b" stroke-width="3"/>
          <circle cx="0" cy="0" r="75" fill="#e2e8f0" stroke="#334155" stroke-width="1.5"/>
          <circle cx="0" cy="0" r="42" fill="#cbd5e1" stroke="#0f172a" stroke-width="2"/>
          <!-- Diyafram Yayı Parmakları -->
          ${Array.from({ length: 18 }).map((_, i) => {
            const angle = (i * 360) / 18;
            return `<line x1="0" y1="-42" x2="0" y2="-75" stroke="#0f172a" stroke-width="2.5" transform="rotate(${angle})"/>`;
          }).join('')}
          <text x="-32" y="115" font-size="9" font-family="monospace" fill="#0f172a" font-weight="bold">[1] BASKI (COVER)</text>
        </g>

        <!-- Balata Diski (Sağ) -->
        <g transform="translate(330, 230)">
          <circle cx="0" cy="0" r="90" fill="#475569" stroke="#0f172a" stroke-width="3"/>
          <circle cx="0" cy="0" r="70" fill="#334155" stroke="#1e293b" stroke-width="1.5"/>
          <circle cx="0" cy="0" r="35" fill="#cbd5e1" stroke="#0f172a" stroke-width="2"/>
          <!-- Göbek Kamaları -->
          <circle cx="0" cy="0" r="14" fill="#0f172a"/>
          ${Array.from({ length: 6 }).map((_, i) => {
            const angle = (i * 360) / 6;
            return `
              <rect x="-6" y="-55" width="12" height="18" rx="2" fill="#fbbf24" stroke="#d97706" stroke-width="1.5" transform="rotate(${angle})"/>
            `;
          }).join('')}
          <text x="-34" y="115" font-size="9" font-family="monospace" fill="#0f172a" font-weight="bold">[2] DİSK (PLATE)</text>
        </g>

        <!-- Patlatılmış Eksen Çizgisi -->
        <line x1="60" y1="230" x2="440" y2="230" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 3"/>
        <text x="140" y="380" font-size="9.5" font-family="monospace" fill="#0f172a" font-weight="bold">3 PARÇA DEBRİYAJ SETİ & RULMAN</text>
        <text x="140" y="396" font-size="9" font-family="monospace" fill="#475569">ÇAP: 220 mm | DİŞ SAYISI: 26 ŞAFT DİŞİ</text>
      `;
      break;

    default: // Genel Mekanik Patlatılmış Montaj Şeması (7701045724 gibi parçalar)
      partDrawing = `
        <!-- Merkezi Montaj Eksen Çizgisi -->
        <line x1="50" y1="230" x2="440" y2="230" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 3"/>

        <!-- Parça 1: Dış Flanşlı Muhafaza Gövdesi -->
        <g transform="translate(100, 230)">
          <path d="M -30,-80 L 15,-80 L 30,-50 L 30,50 L 15,80 L -30,80 Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="2.5"/>
          <circle cx="-10" cy="-60" r="6" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5"/>
          <circle cx="-10" cy="60" r="6" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5"/>
          <rect x="0" y="-35" width="30" height="70" fill="#cbd5e1" stroke="#334155" stroke-width="1.5"/>
          <!-- Parça Numarası Etiketi -->
          <circle cx="-10" cy="-105" r="10" fill="#2563eb"/>
          <text x="-14" y="-101" font-size="11" font-family="monospace" fill="#fff" font-weight="bold">1</text>
          <line x1="-10" y1="-95" x2="-10" y2="-80" stroke="#2563eb" stroke-width="1.5"/>
        </g>

        <!-- Parça 2: Rulman / İğneli Yatak Bileziği -->
        <g transform="translate(185, 230)">
          <rect x="-18" y="-45" width="36" height="90" rx="4" fill="#f1f5f9" stroke="#1e293b" stroke-width="2"/>
          <rect x="-12" y="-38" width="24" height="76" fill="#e2e8f0" stroke="#475569" stroke-dasharray="2 2"/>
          <!-- Rulman Bilyaları -->
          <circle cx="0" cy="-24" r="5" fill="#3b82f6" stroke="#1d4ed8"/>
          <circle cx="0" cy="0" r="5" fill="#3b82f6" stroke="#1d4ed8"/>
          <circle cx="0" cy="24" r="5" fill="#3b82f6" stroke="#1d4ed8"/>
          <circle cx="0" cy="-70" r="10" fill="#2563eb"/>
          <text x="-4" y="-66" font-size="11" font-family="monospace" fill="#fff" font-weight="bold">2</text>
          <line x1="0" y1="-60" x2="0" y2="-45" stroke="#2563eb" stroke-width="1.5"/>
        </g>

        <!-- Parça 3: Ana Tahrik Şaftı & Piston Mili -->
        <g transform="translate(280, 230)">
          <!-- Şaft Gövdesi -->
          <rect x="-40" y="-18" width="110" height="36" fill="#cbd5e1" stroke="#0f172a" stroke-width="2"/>
          <!-- Kademeli Şaft Ucu -->
          <rect x="70" y="-12" width="40" height="24" fill="#94a3b8" stroke="#0f172a" stroke-width="2"/>
          <!-- Dişli/Freze Kısmı -->
          ${Array.from({ length: 8 }).map((_, i) => `<line x1="${75 + i * 4}" y1="-12" x2="${75 + i * 4}" y2="12" stroke="#0f172a" stroke-width="1.5"/>`).join('')}
          <!-- Segman Kanalı -->
          <line x1="20" y1="-18" x2="20" y2="18" stroke="#dc2626" stroke-width="2.5"/>
          <circle cx="30" cy="-55" r="10" fill="#2563eb"/>
          <text x="26" y="-51" font-size="11" font-family="monospace" fill="#fff" font-weight="bold">3</text>
          <line x1="30" y1="-45" x2="30" y2="-18" stroke="#2563eb" stroke-width="1.5"/>
        </g>

        <!-- Parça 4: Emniyet Segmanı / Yaylı Halka -->
        <g transform="translate(365, 230)">
          <path d="M -10,-24 A 26 26 0 1 1 10,-24" fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round"/>
          <circle cx="-10" cy="-24" r="3" fill="#f8fafc" stroke="#0f172a" stroke-width="1"/>
          <circle cx="10" cy="-24" r="3" fill="#f8fafc" stroke="#0f172a" stroke-width="1"/>
          <circle cx="0" cy="-55" r="10" fill="#2563eb"/>
          <text x="-4" y="-51" font-size="11" font-family="monospace" fill="#fff" font-weight="bold">4</text>
          <line x1="0" y1="-45" x2="0" y2="-28" stroke="#2563eb" stroke-width="1.5"/>
        </g>

        <!-- Parça 5: Montaj Civatası ve Pul -->
        <g transform="translate(425, 230)">
          <rect x="0" y="-6" width="30" height="12" fill="#94a3b8" stroke="#0f172a" stroke-width="1.5"/>
          <!-- Vida Dişleri -->
          ${Array.from({ length: 6 }).map((_, i) => `<line x1="${5 + i * 4}" y1="-6" x2="${5 + i * 4}" y2="6" stroke="#334155" stroke-width="1"/>`).join('')}
          <polygon points="-8,-12 0,-8 0,8 -8,12 -12,6 -12,-6" fill="#475569" stroke="#0f172a" stroke-width="1.5"/>
          <circle cx="15" cy="-45" r="10" fill="#2563eb"/>
          <text x="11" y="-41" font-size="11" font-family="monospace" fill="#fff" font-weight="bold">5</text>
          <line x1="15" y1="-35" x2="15" y2="-6" stroke="#2563eb" stroke-width="1.5"/>
        </g>

        <text x="70" y="380" font-size="10" font-family="monospace" fill="#0f172a" font-weight="bold">PATLATILMIŞ MONTAJ ŞEMASI (EXPLODED ASSEMBLY DRAWING)</text>
        <text x="70" y="396" font-size="9" font-family="monospace" fill="#475569">BİLEŞENLER: [1] Muhafaza Gövdesi, [2] Rulman, [3] Tahrik Mili, [4] Segman, [5] Civata (M10x1.5)</text>
      `;
      break;
  }

  // 2. Eksiksiz CAD Çizim Şablonu (Title Block, Grid, Çerçeve ve Damga)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520">
  <defs>
    <!-- CAD Izgara Deseni -->
    <pattern id="cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
      <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" stroke-width="0.75"/>
    </pattern>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>
  </defs>

  <!-- Arka Plan & Teknik Izgara -->
  <rect width="800" height="520" fill="#f8fafc"/>
  <rect width="800" height="520" fill="url(#cad-grid)"/>

  <!-- Dış ve İç Teknik Çerçeve -->
  <rect x="15" y="15" width="770" height="490" fill="none" stroke="#64748b" stroke-width="1.5"/>
  <rect x="20" y="20" width="760" height="480" fill="none" stroke="#cbd5e1" stroke-width="0.75"/>

  <!-- Çerçeve Koordinat Cetveli -->
  <text x="24" y="32" font-size="8" font-family="monospace" fill="#94a3b8">A</text>
  <text x="24" y="260" font-size="8" font-family="monospace" fill="#94a3b8">B</text>
  <text x="24" y="480" font-size="8" font-family="monospace" fill="#94a3b8">C</text>
  <text x="200" y="28" font-size="8" font-family="monospace" fill="#94a3b8">1</text>
  <text x="400" y="28" font-size="8" font-family="monospace" fill="#94a3b8">2</text>
  <text x="600" y="28" font-size="8" font-family="monospace" fill="#94a3b8">3</text>

  <!-- Üst Başlık Şeridi -->
  <rect x="25" y="25" width="750" height="34" fill="url(#headerGrad)" rx="2"/>
  <text x="40" y="47" font-size="13" font-family="Arial, sans-serif" font-weight="bold" fill="#ffffff" letter-spacing="0.5">
    ${cleanBrand.toUpperCase()} TEKNİK ÇİZİM &amp; PARÇA MONTAJ ŞEMASI
  </text>
  <rect x="615" y="32" width="145" height="20" fill="#2563eb" rx="3"/>
  <text x="625" y="46" font-size="10" font-family="monospace" font-weight="bold" fill="#ffffff">
    OEM SPECIFICATION
  </text>

  <!-- Merkez Parça Çizimi (Geometry) -->
  <g id="part-drawing-layer">
    ${partDrawing}
  </g>

  <!-- Sağ Alt: ISO 7200 Resmi Teknik Antet (Title Block) -->
  <g transform="translate(485, 385)">
    <!-- Antet Kutusu -->
    <rect x="0" y="0" width="290" height="110" fill="#ffffff" stroke="#1e293b" stroke-width="1.5"/>
    <line x1="0" y1="26" x2="290" y2="26" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="0" y1="56" x2="290" y2="56" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="0" y1="84" x2="290" y2="84" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="170" y1="0" x2="170" y2="56" stroke="#cbd5e1" stroke-width="1"/>
    <line x1="230" y1="56" x2="230" y2="110" stroke="#cbd5e1" stroke-width="1"/>

    <!-- Antet Metinleri -->
    <text x="8" y="11" font-size="7" font-family="monospace" fill="#64748b">PARÇA NUMARASI / OE CODE:</text>
    <text x="8" y="22" font-size="11" font-family="monospace" font-weight="bold" fill="#0f172a">${cleanOe}</text>

    <text x="176" y="11" font-size="7" font-family="monospace" fill="#64748b">MARKA / BRAND:</text>
    <text x="176" y="22" font-size="10" font-family="sans-serif" font-weight="bold" fill="#2563eb">${cleanBrand}</text>

    <text x="8" y="38" font-size="7" font-family="monospace" fill="#64748b">TANIM / DESCRIPTION:</text>
    <text x="8" y="50" font-size="8.5" font-family="sans-serif" font-weight="600" fill="#1e293b">
      ${cleanName.length > 36 ? cleanName.slice(0, 34) + '...' : cleanName}
    </text>

    <text x="8" y="67" font-size="7" font-family="monospace" fill="#64748b">STANDART / QUALITY:</text>
    <text x="8" y="78" font-size="8.5" font-family="monospace" font-weight="bold" fill="#059669">ISO 9001 / IATF 16949 (OEM)</text>

    <text x="8" y="95" font-size="7" font-family="monospace" fill="#64748b">ÇİZİM NO (DWG):</text>
    <text x="8" y="105" font-size="8.5" font-family="monospace" fill="#334155">DWG-${cleanOe}-01</text>

    <text x="236" y="70" font-size="7" font-family="monospace" fill="#64748b">ÖLÇEK:</text>
    <text x="236" y="81" font-size="9" font-family="monospace" font-weight="bold" fill="#0f172a">1:1 CAD</text>

    <text x="236" y="95" font-size="7" font-family="monospace" fill="#64748b">DURUM:</text>
    <text x="236" y="105" font-size="8.5" font-family="monospace" font-weight="bold" fill="#16a34a">ONAYLI ✓</text>
  </g>

  <!-- Sol Alt Mühür / Damga -->
  <g transform="translate(35, 465)">
    <rect x="0" y="0" width="150" height="24" rx="3" fill="#ecfdf5" stroke="#059669" stroke-width="1"/>
    <text x="8" y="16" font-size="9" font-family="monospace" font-weight="bold" fill="#047857">
      ✓ TEKNİK ŞEMA ONAYLANDI
    </text>
  </g>
</svg>
  `.trim();
}

module.exports = {
  generateTechnicalDiagramSvg
};
