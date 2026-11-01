/* -------------------------------------------------------------
       Logo & Favicon Synchronization Handlers
       ------------------------------------------------------------- */
    function handleCustomLogoLoad(img) {
      img.style.display = 'block';
      const defaultSvg = document.getElementById('default-logo-svg');
      if (defaultSvg) defaultSvg.style.display = 'none';
      const favSvg = document.getElementById('hub-favicon-svg');
      if (favSvg) favSvg.href = img.src;
    }

    function handleCustomLogoError(img) {
      if (!img.dataset.triedPng) {
        img.dataset.triedPng = 'true';
        img.src = '/assets/logo.png';
      } else {
        img.style.display = 'none';
        const defaultSvg = document.getElementById('default-logo-svg');
        if (defaultSvg) defaultSvg.style.display = 'block';
      }
    }

    /* -------------------------------------------------------------
       App Catalog & Categorization Metadata
       ------------------------------------------------------------- */
    const APP_CATALOG = {
      photocraft: {
        num: "01",
        title: "PhotoCraft",
        category: "graphics",
        categoryName: "Graphics & Photo",
        categoryTag: "IMAGE EDITOR",
        alt: "Photoshop alt",
        accentColor: "#2563eb",
        stage: "EARLY ALPHA",
        web: true,
        tagline: "Photo & Raster Image Editor",
        desc: "The open-source image editor you already know how to use.",
        monogram: "Ph",
        gradient: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)"
      },
      vectorcraft: {
        num: "02",
        title: "VectorCraft",
        category: "vector",
        categoryName: "Vector & Design",
        categoryTag: "VECTOR ILLUSTRATION",
        alt: "Illustrator alt",
        accentColor: "#f97316",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "Vector Illustration & SVG",
        desc: "Fast, open-source vector illustration, reimagined in pure Rust.",
        monogram: "Vc",
        gradient: "linear-gradient(135deg, #ea580c 0%, #f97316 100%)"
      },
      filmcraft: {
        num: "03",
        title: "FilmCraft",
        category: "graphics",
        categoryName: "Video & Motion",
        categoryTag: "VIDEO EDITOR",
        alt: "Premiere alt",
        accentColor: "#7c3aed",
        stage: "IN DEVELOPMENT",
        web: false,
        tagline: "Video Editing & Timeline",
        desc: "Professional, open-source video editing, rebuilt from scratch in Rust.",
        monogram: "Fc",
        gradient: "linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%)"
      },
      lightcraft: {
        num: "04",
        title: "LightCraft",
        category: "graphics",
        categoryName: "Graphics & Photo",
        categoryTag: "PHOTO LIBRARY & RAW DEVELO...",
        alt: "Lightroom alt",
        accentColor: "#f59e0b",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "RAW Photo Developer",
        desc: "An open-source photo library and raw developer that runs on your machine.",
        monogram: "Lc",
        gradient: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)"
      },
      pdfcraft: {
        num: "05",
        title: "PDFCraft",
        category: "documents",
        categoryName: "Documents",
        categoryTag: "PDF WORKBENCH",
        alt: "Acrobat alt",
        accentColor: "#ef4444",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "PDF Document Studio",
        desc: "Fast PDF reading, document annotations, page reordering, and publishing.",
        monogram: "Pd",
        gradient: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)"
      },
      effectcraft: {
        num: "06",
        title: "EffectCraft",
        category: "graphics",
        categoryName: "Graphics & Photo",
        categoryTag: "MOTION GRAPHICS & VFX",
        alt: "After Effects alt",
        accentColor: "#ec4899",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "VFX & Shader Studio",
        desc: "GPU-accelerated procedural motion graphics, shaders, and real-time VFX.",
        monogram: "Ef",
        gradient: "linear-gradient(135deg, #db2777 0%, #ec4899 100%)"
      },
      designcraft: {
        num: "07",
        title: "DesignCraft",
        category: "vector",
        categoryName: "Vector & Design",
        categoryTag: "PAGE LAYOUT & PUBLISHING",
        alt: "InDesign alt",
        accentColor: "#84cc16",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "UI/UX & Layout Studio",
        desc: "Publication layout for booklets, guides, multi-page spreads, and typography.",
        monogram: "Dc",
        gradient: "linear-gradient(135deg, #65a30d 0%, #84cc16 100%)"
      },
      figcraft: {
        num: "08",
        title: "FigCraft",
        category: "vector",
        categoryName: "Vector & Design",
        categoryTag: "INTERFACE DESIGN",
        alt: "Figma alt",
        accentColor: "#06b6d4",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "Interactive Canvas Studio",
        desc: "Modern screen design, auto-layouts, infinite canvas, and interactive UI prototyping.",
        monogram: "Fg",
        gradient: "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)"
      },
      wordcraft: {
        num: "09",
        title: "WordCraft",
        category: "documents",
        categoryName: "Documents",
        categoryTag: "DOCUMENT EDITOR",
        alt: "Word alt",
        accentColor: "#0284c7",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "Rich Text & Document Editor",
        desc: "Distraction-free rich documents, Markdown briefs, and publication export.",
        monogram: "Wc",
        gradient: "linear-gradient(135deg, #0369a1 0%, #0284c7 100%)"
      },
      soundcraft: {
        num: "10",
        title: "SoundCraft",
        category: "audio",
        categoryName: "Audio",
        categoryTag: "AUDIO SYNTHESIZER & DAW",
        alt: "Pro Tools alt",
        accentColor: "#d946ef",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "Audio Synthesizer & DAW",
        desc: "Multi-track audio sessions, waveform synthesis, and procedural sound design.",
        monogram: "Sc",
        gradient: "linear-gradient(135deg, #c026d3 0%, #d946ef 100%)"
      },
      deckcraft: {
        num: "11",
        title: "DeckCraft",
        category: "documents",
        categoryName: "Documents",
        categoryTag: "SLIDE DECKS & PRESENTATIONS",
        alt: "PowerPoint alt",
        accentColor: "#f43f5e",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "Slide Decks & Presentations",
        desc: "Rapid presentation builder with code highlighting, visual charts, and export.",
        monogram: "Dk",
        gradient: "linear-gradient(135deg, #e11d48 0%, #f43f5e 100%)"
      },
      cadcraft: {
        num: "12",
        title: "CADCraft",
        category: "cad",
        categoryName: "3D & CAD",
        categoryTag: "3D PARAMETRIC CAD",
        alt: "AutoCAD alt",
        accentColor: "#14b8a6",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "3D Parametric CAD Studio",
        desc: "Parametric 2D/3D drafting, dimensional modeling, and STEP/STL 3D printing export.",
        monogram: "Cd",
        gradient: "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)"
      },
      gridcraft: {
        num: "13",
        title: "GridCraft",
        category: "documents",
        categoryName: "Documents",
        categoryTag: "DATA GRID & SPREADSHEETS",
        alt: "Excel alt",
        accentColor: "#10b981",
        stage: "IN DEVELOPMENT",
        web: true,
        tagline: "Data Grid & Spreadsheets",
        desc: "High-performance calculation engine, reactive data tables, and financial modeling.",
        monogram: "Gc",
        gradient: "linear-gradient(135deg, #059669 0%, #10b981 100%)"
      }
    };

    /* Helper: generate default metadata for any unknown app */
    function getAppMeta(appName) {
      const key = appName.toLowerCase();
      if (APP_CATALOG[key]) return APP_CATALOG[key];

      const cleanTitle = appName.charAt(0).toUpperCase() + appName.slice(1);
      const mono = cleanTitle.substring(0, 2);
      return {
        num: "01",
        title: cleanTitle,
        category: "graphics",
        categoryName: "Creative Tool",
        categoryTag: cleanTitle.toUpperCase(),
        alt: "",
        accentColor: "#4e7bfb",
        stage: "READY",
        web: true,
        tagline: "WebAssembly Studio App",
        desc: `High performance self-hosted ${cleanTitle} creative tool.`,
        monogram: mono,
        gradient: "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)"
      };
    }

    /* -------------------------------------------------------------
       ArtCraft App Workspaces & Preview Vectors (getartcraft.com/apps)
       ------------------------------------------------------------- */
    function getAppPreviewSvg(app) {
      const key = (app || '').toLowerCase();
      switch (key) {
        case 'photocraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0b0d14"/>
              <rect x="0" y="0" width="320" height="22" fill="#131722"/>
              <circle cx="14" cy="11" r="3" fill="#ef4444"/>
              <circle cx="24" cy="11" r="3" fill="#f59e0b"/>
              <circle cx="34" cy="11" r="3" fill="#10b981"/>
              <text x="48" y="14" fill="#64748b" font-family="monospace" font-size="8.5" font-weight="600">PhotoCraft &bull; the_great_wave.psd</text>
              <rect x="254" y="22" width="66" height="138" fill="#10131d"/>
              <rect x="260" y="30" width="54" height="12" rx="2" fill="#1e2434"/>
              <rect x="260" y="48" width="54" height="16" rx="2" fill="#161b28"/>
              <rect x="260" y="70" width="54" height="16" rx="2" fill="#161b28"/>
              <path d="M 0 160 L 0 110 C 30 110 50 140 80 120 C 110 100 130 60 160 50 C 180 43 190 60 175 75 C 160 90 140 100 120 115 C 150 110 180 120 254 160 Z" fill="#1e3a8a"/>
              <path d="M 0 160 L 0 125 C 40 125 70 145 100 130 C 130 115 145 80 170 65 C 180 59 188 70 180 78 C 170 88 150 105 130 120 C 160 122 200 135 254 160 Z" fill="#2563eb"/>
              <path d="M 160 50 C 163 42 168 45 170 48 C 173 40 178 45 180 50 C 175 55 170 58 165 55 Z" fill="#f8fafc"/>
              <path d="M 140 70 C 143 64 148 67 150 72 C 145 74 142 72 140 70 Z" fill="#f8fafc"/>
              <circle cx="195" cy="46" r="8" fill="#ef4444" opacity="0.85"/>
            </svg>
          `;
        case 'vectorcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#090a12"/>
              <rect x="0" y="0" width="320" height="22" fill="#121420"/>
              <text x="14" y="14" fill="#f97316" font-family="monospace" font-size="8.5" font-weight="700">VECTORCRAFT &bull; NEON_DRIVE.svg</text>
              <defs>
                <linearGradient id="v-sun" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#fbbf24"/>
                  <stop offset="50%" stop-color="#f97316"/>
                  <stop offset="100%" stop-color="#ec4899"/>
                </linearGradient>
              </defs>
              <circle cx="160" cy="82" r="38" fill="url(#v-sun)"/>
              <line x1="122" y1="78" x2="198" y2="78" stroke="#090a12" stroke-width="2"/>
              <line x1="126" y1="85" x2="194" y2="85" stroke="#090a12" stroke-width="3"/>
              <line x1="130" y1="93" x2="190" y2="93" stroke="#090a12" stroke-width="3.5"/>
              <line x1="138" y1="102" x2="182" y2="102" stroke="#090a12" stroke-width="4"/>
              <line x1="0" y1="160" x2="160" y2="105" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
              <line x1="60" y1="160" x2="160" y2="105" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
              <line x1="120" y1="160" x2="160" y2="105" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
              <line x1="160" y1="160" x2="160" y2="105" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
              <line x1="200" y1="160" x2="160" y2="105" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
              <line x1="260" y1="160" x2="160" y2="105" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
              <line x1="320" y1="160" x2="160" y2="105" stroke="#06b6d4" stroke-width="1.2" opacity="0.6"/>
              <line x1="0" y1="116" x2="320" y2="116" stroke="#06b6d4" stroke-width="1" opacity="0.4"/>
              <line x1="0" y1="128" x2="320" y2="128" stroke="#06b6d4" stroke-width="1.2" opacity="0.5"/>
              <line x1="0" y1="144" x2="320" y2="144" stroke="#06b6d4" stroke-width="1.4" opacity="0.7"/>
              <circle cx="95" cy="52" r="3" fill="#38bdf8"/>
              <circle cx="135" cy="42" r="3" fill="#38bdf8"/>
              <line x1="95" y1="52" x2="135" y2="42" stroke="#38bdf8" stroke-width="1" stroke-dasharray="2 2"/>
            </svg>
          `;
        case 'filmcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0a0b10"/>
              <rect x="0" y="0" width="320" height="22" fill="#12141e"/>
              <text x="14" y="14" fill="#a855f7" font-family="monospace" font-size="8.5" font-weight="700">FILMCRAFT &bull; Scene_08 [4K 24fps]</text>
              <rect x="80" y="28" width="160" height="74" rx="3" fill="#141824" stroke="#252c3e" stroke-width="1"/>
              <path d="M 120 74 L 140 50 L 165 74 Z" fill="#6366f1" opacity="0.7"/>
              <path d="M 155 74 L 175 42 L 205 74 Z" fill="#a855f7" opacity="0.8"/>
              <circle cx="195" cy="45" r="6" fill="#fbbf24"/>
              <rect x="10" y="110" width="300" height="42" rx="2" fill="#0f111a"/>
              <rect x="14" y="114" width="70" height="10" rx="2" fill="#7c3aed" opacity="0.9"/>
              <rect x="88" y="114" width="90" height="10" rx="2" fill="#2563eb" opacity="0.9"/>
              <rect x="182" y="114" width="110" height="10" rx="2" fill="#10b981" opacity="0.9"/>
              <rect x="14" y="128" width="110" height="10" rx="2" fill="#06b6d4" opacity="0.8"/>
              <rect x="128" y="128" width="80" height="10" rx="2" fill="#f59e0b" opacity="0.8"/>
              <line x1="140" y1="108" x2="140" y2="154" stroke="#ef4444" stroke-width="1.5"/>
              <polygon points="137,108 143,108 140,113" fill="#ef4444"/>
            </svg>
          `;
        case 'lightcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#090a0f"/>
              <rect x="0" y="0" width="320" height="22" fill="#11131c"/>
              <text x="14" y="14" fill="#f59e0b" font-family="monospace" font-size="8.5" font-weight="700">LIGHTCRAFT &bull; DSC_4912.RAW [ISO 100]</text>
              <rect x="12" y="28" width="220" height="122" rx="3" fill="#181c26"/>
              <path d="M 12 150 L 40 85 L 80 120 L 125 65 L 170 125 L 210 95 L 232 150 Z" fill="#2d3748"/>
              <path d="M 125 65 L 140 85 L 120 90 Z" fill="#f1f5f9"/>
              <path d="M 40 85 L 50 100 L 35 105 Z" fill="#e2e8f0"/>
              <rect x="240" y="28" width="70" height="122" rx="2" fill="#0d0f17"/>
              <path d="M 245 46 C 255 40 270 36 290 40 C 300 42 305 46 305 46" stroke="#f59e0b" stroke-width="1.5" fill="none"/>
              <line x1="248" y1="62" x2="302" y2="62" stroke="#252c3c" stroke-width="2"/>
              <circle cx="275" cy="62" r="3" fill="#f59e0b"/>
              <line x1="248" y1="77" x2="302" y2="77" stroke="#252c3c" stroke-width="2"/>
              <circle cx="285" cy="77" r="3" fill="#f59e0b"/>
              <line x1="248" y1="92" x2="302" y2="92" stroke="#252c3c" stroke-width="2"/>
              <circle cx="265" cy="92" r="3" fill="#f59e0b"/>
              <line x1="248" y1="107" x2="302" y2="107" stroke="#252c3c" stroke-width="2"/>
              <circle cx="280" cy="107" r="3" fill="#f59e0b"/>
            </svg>
          `;
        case 'pdfcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0a0c12"/>
              <rect x="0" y="0" width="320" height="22" fill="#131520"/>
              <text x="14" y="14" fill="#ef4444" font-family="monospace" font-size="8.5" font-weight="700">PDFCRAFT &bull; Showcase_Issue_08.pdf</text>
              <rect x="14" y="32" width="28" height="38" rx="2" fill="#1a1e2a" stroke="#2f384d" stroke-width="1"/>
              <rect x="14" y="76" width="28" height="38" rx="2" fill="#252c3d" stroke="#ef4444" stroke-width="1"/>
              <rect x="14" y="120" width="28" height="32" rx="2" fill="#1a1e2a"/>
              <rect x="70" y="28" width="180" height="126" rx="3" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
              <rect x="80" y="36" width="160" height="24" fill="#ef4444" rx="2"/>
              <text x="88" y="52" fill="#ffffff" font-family="sans-serif" font-size="9.5" font-weight="800">PrintCraft Showcase</text>
              <rect x="80" y="68" width="75" height="4" fill="#94a3b8" rx="1"/>
              <rect x="80" y="76" width="70" height="4" fill="#cbd5e1" rx="1"/>
              <rect x="80" y="84" width="75" height="4" fill="#cbd5e1" rx="1"/>
              <rect x="80" y="92" width="65" height="4" fill="#cbd5e1" rx="1"/>
              <rect x="165" y="68" width="75" height="45" rx="2" fill="#fed7aa"/>
            </svg>
          `;
        case 'effectcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#06070c"/>
              <rect x="0" y="0" width="320" height="22" fill="#10121d"/>
              <text x="14" y="14" fill="#ec4899" font-family="monospace" font-size="8.5" font-weight="700">EFFECTCRAFT &bull; Comp_VFX_01</text>
              <defs>
                <radialGradient id="fx-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#ec4899"/>
                  <stop offset="50%" stop-color="#8b5cf6"/>
                  <stop offset="100%" stop-color="#06070c" stop-opacity="0"/>
                </radialGradient>
              </defs>
              <circle cx="160" cy="72" r="38" fill="url(#fx-glow)" opacity="0.8"/>
              <text x="160" y="76" fill="#ffffff" font-family="monospace" font-size="11" font-weight="900" letter-spacing="2" text-anchor="middle">EFFECTCRAFT</text>
              <rect x="20" y="118" width="280" height="32" rx="2" fill="#0d0f18"/>
              <line x1="20" y1="130" x2="300" y2="130" stroke="#1f2538" stroke-width="1"/>
              <polygon points="60,130 64,126 68,130 64,134" fill="#ec4899"/>
              <polygon points="120,130 124,126 128,130 124,134" fill="#f59e0b"/>
              <polygon points="190,130 194,126 198,130 194,134" fill="#06b6d4"/>
              <polygon points="260,130 264,126 268,130 264,134" fill="#10b981"/>
            </svg>
          `;
        case 'designcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0a0c10"/>
              <rect x="0" y="0" width="320" height="22" fill="#131620"/>
              <text x="14" y="14" fill="#84cc16" font-family="monospace" font-size="8.5" font-weight="700">DESIGNCRAFT &bull; Editorial_Spread.craft</text>
              <rect x="40" y="32" width="115" height="115" rx="2" fill="#f8fafc" stroke="#3b82f6" stroke-width="1"/>
              <rect x="165" y="32" width="115" height="115" rx="2" fill="#f8fafc" stroke="#3b82f6" stroke-width="1"/>
              <rect x="50" y="42" width="95" height="50" rx="1" fill="#fdba74"/>
              <rect x="50" y="100" width="95" height="6" fill="#1e293b" rx="1"/>
              <rect x="50" y="112" width="95" height="3" fill="#64748b" rx="1"/>
              <rect x="50" y="118" width="85" height="3" fill="#94a3b8" rx="1"/>
              <rect x="175" y="42" width="45" height="95" rx="1" fill="#f1f5f9"/>
              <rect x="178" y="48" width="39" height="3" fill="#475569"/>
              <rect x="178" y="54" width="39" height="2" fill="#94a3b8"/>
              <rect x="178" y="59" width="35" height="2" fill="#94a3b8"/>
              <rect x="225" y="42" width="45" height="95" rx="1" fill="#f1f5f9"/>
              <rect x="228" y="48" width="39" height="3" fill="#475569"/>
              <rect x="228" y="54" width="39" height="2" fill="#94a3b8"/>
            </svg>
          `;
        case 'figcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0b0d14"/>
              <rect x="0" y="0" width="320" height="22" fill="#131622"/>
              <text x="14" y="14" fill="#06b6d4" font-family="monospace" font-size="8.5" font-weight="700">FIGCRAFT &bull; Mobile_App_System.fig</text>
              <rect x="40" y="34" width="65" height="114" rx="6" fill="#181c28" stroke="#06b6d4" stroke-width="1.5"/>
              <rect x="50" y="46" width="45" height="14" rx="3" fill="#06b6d4" opacity="0.6"/>
              <rect x="50" y="66" width="45" height="8" rx="2" fill="#2d3748"/>
              <rect x="50" y="80" width="45" height="20" rx="3" fill="#10b981" opacity="0.7"/>
              <rect x="125" y="34" width="65" height="114" rx="6" fill="#181c28" stroke="#3b82f6" stroke-width="1"/>
              <circle cx="157" cy="55" r="10" fill="#6366f1"/>
              <rect x="135" y="74" width="45" height="6" rx="2" fill="#3b82f6"/>
              <rect x="135" y="86" width="45" height="25" rx="3" fill="#1e2434"/>
              <rect x="210" y="34" width="65" height="114" rx="6" fill="#181c28" stroke="#252b3d" stroke-width="1"/>
              <rect x="220" y="46" width="45" height="40" rx="4" fill="#ec4899" opacity="0.5"/>
            </svg>
          `;
        case 'wordcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0a0c12"/>
              <rect x="0" y="0" width="320" height="22" fill="#121520"/>
              <text x="14" y="14" fill="#0284c7" font-family="monospace" font-size="8.5" font-weight="700">WORDCRAFT &bull; Architecture_Proposal.docx</text>
              <rect x="80" y="28" width="160" height="126" rx="2" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>
              <rect x="95" y="40" width="80" height="8" rx="2" fill="#0284c7"/>
              <rect x="95" y="56" width="130" height="4" rx="1" fill="#334155"/>
              <rect x="95" y="64" width="125" height="4" rx="1" fill="#64748b"/>
              <rect x="95" y="72" width="130" height="4" rx="1" fill="#64748b"/>
              <rect x="95" y="86" width="120" height="22" rx="2" fill="#e0f2fe" stroke="#38bdf8" stroke-width="1"/>
              <rect x="105" y="94" width="90" height="4" rx="1" fill="#0369a1"/>
              <rect x="95" y="116" width="130" height="4" rx="1" fill="#64748b"/>
              <rect x="95" y="124" width="115" height="4" rx="1" fill="#64748b"/>
            </svg>
          `;
        case 'soundcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#09090f"/>
              <rect x="0" y="0" width="320" height="22" fill="#12121e"/>
              <text x="14" y="14" fill="#d946ef" font-family="monospace" font-size="8.5" font-weight="700">SOUNDCRAFT &bull; Cyberpunk_Beat_140bpm.daw</text>
              <rect x="14" y="28" width="292" height="34" rx="3" fill="#141424"/>
              <path d="M 20 45 Q 35 30 50 45 T 80 45 T 110 45 T 140 45 T 170 45 T 200 45 T 230 45 T 260 45 T 290 45" stroke="#d946ef" stroke-width="2.2" fill="none"/>
              <rect x="14" y="68" width="292" height="34" rx="3" fill="#141424"/>
              <path d="M 20 85 Q 40 70 60 85 T 100 85 T 140 85 T 180 85 T 220 85 T 260 85 T 295 85" stroke="#06b6d4" stroke-width="2.2" fill="none"/>
              <rect x="14" y="108" width="292" height="34" rx="3" fill="#141424"/>
              <path d="M 20 125 Q 30 115 40 125 T 60 125 T 80 125 T 100 125 T 120 125 T 140 125 T 160 125 T 180 125 T 200 125 T 220 125 T 240 125 T 260 125 T 280 125" stroke="#f59e0b" stroke-width="2.2" fill="none"/>
              <line x1="150" y1="24" x2="150" y2="148" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3 3"/>
            </svg>
          `;
        case 'deckcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0c0d14"/>
              <rect x="0" y="0" width="320" height="22" fill="#141624"/>
              <text x="14" y="14" fill="#f43f5e" font-family="monospace" font-size="8.5" font-weight="700">DECKCRAFT &bull; Series_A_PitchDeck.deck</text>
              <rect x="60" y="32" width="200" height="114" rx="4" fill="#161826" stroke="#25283d" stroke-width="1"/>
              <rect x="75" y="45" width="100" height="10" rx="2" fill="#f43f5e"/>
              <rect x="75" y="60" width="130" height="4" rx="1" fill="#94a3b8"/>
              <rect x="75" y="74" width="48" height="44" rx="3" fill="#1f2336"/>
              <text x="85" y="94" fill="#38bdf8" font-family="sans-serif" font-size="11" font-weight="800">10x</text>
              <rect x="131" y="74" width="48" height="44" rx="3" fill="#1f2336"/>
              <text x="140" y="94" fill="#10b981" font-family="sans-serif" font-size="11" font-weight="800">99%</text>
              <rect x="187" y="74" width="48" height="44" rx="3" fill="#1f2336"/>
              <text x="195" y="94" fill="#f59e0b" font-family="sans-serif" font-size="11" font-weight="800">Rust</text>
            </svg>
          `;
        case 'cadcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#070a0e"/>
              <rect x="0" y="0" width="320" height="22" fill="#0f141c"/>
              <text x="14" y="14" fill="#14b8a6" font-family="monospace" font-size="8.5" font-weight="700">CADCRAFT &bull; Mechanical_Bearing.step [3D]</text>
              <line x1="0" y1="40" x2="320" y2="40" stroke="#112128" stroke-width="1"/>
              <line x1="0" y1="70" x2="320" y2="70" stroke="#112128" stroke-width="1"/>
              <line x1="0" y1="100" x2="320" y2="100" stroke="#112128" stroke-width="1"/>
              <line x1="0" y1="130" x2="320" y2="130" stroke="#112128" stroke-width="1"/>
              <line x1="50" y1="22" x2="50" y2="160" stroke="#112128" stroke-width="1"/>
              <line x1="120" y1="22" x2="120" y2="160" stroke="#112128" stroke-width="1"/>
              <line x1="190" y1="22" x2="190" y2="160" stroke="#112128" stroke-width="1"/>
              <line x1="260" y1="22" x2="260" y2="160" stroke="#112128" stroke-width="1"/>
              <polygon points="160,50 215,75 160,100 105,75" fill="#134e4a" fill-opacity="0.5" stroke="#14b8a6" stroke-width="1.8"/>
              <polygon points="105,75 160,100 160,140 105,115" fill="#0f3d3a" fill-opacity="0.6" stroke="#14b8a6" stroke-width="1.8"/>
              <polygon points="215,75 160,100 160,140 215,115" fill="#0f2f2c" fill-opacity="0.7" stroke="#14b8a6" stroke-width="1.8"/>
              <line x1="225" y1="75" x2="225" y2="115" stroke="#f59e0b" stroke-width="1.2"/>
              <text x="230" y="98" fill="#f59e0b" font-family="monospace" font-size="8.5">h=40</text>
            </svg>
          `;
        case 'gridcraft':
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#080b0c"/>
              <rect x="0" y="0" width="320" height="22" fill="#0f1517"/>
              <text x="14" y="14" fill="#10b981" font-family="monospace" font-size="8.5" font-weight="700">GRIDCRAFT &bull; Q4_Financial_Model.grid</text>
              <rect x="14" y="28" width="292" height="18" fill="#141e1c"/>
              <text x="45" y="41" fill="#10b981" font-family="monospace" font-size="9" font-weight="700">A</text>
              <text x="105" y="41" fill="#10b981" font-family="monospace" font-size="9" font-weight="700">B</text>
              <text x="165" y="41" fill="#10b981" font-family="monospace" font-size="9" font-weight="700">C</text>
              <text x="225" y="41" fill="#10b981" font-family="monospace" font-size="9" font-weight="700">D</text>
              <rect x="14" y="48" width="292" height="22" fill="#0c1213" stroke="#172421" stroke-width="1"/>
              <text x="30" y="63" fill="#cbd5e1" font-family="monospace" font-size="8.5">Revenue</text>
              <text x="95" y="63" fill="#10b981" font-family="monospace" font-size="8.5">$1,450,000</text>
              <text x="160" y="63" fill="#10b981" font-family="monospace" font-size="8.5">+24.5%</text>
              <rect x="14" y="72" width="292" height="24" fill="#0c1213" stroke="#172421" stroke-width="1"/>
              <rect x="90" y="73" width="60" height="22" fill="#064e3b" stroke="#10b981" stroke-width="2"/>
              <text x="96" y="88" fill="#ffffff" font-family="monospace" font-size="8.5" font-weight="800">$840,200</text>
              <rect x="14" y="98" width="292" height="22" fill="#0c1213" stroke="#172421" stroke-width="1"/>
              <rect x="14" y="122" width="292" height="22" fill="#0c1213" stroke="#172421" stroke-width="1"/>
            </svg>
          `;
        default:
          return `
            <svg viewBox="0 0 320 160" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="320" height="160" fill="#0d1017"/>
              <circle cx="160" cy="80" r="40" fill="#4e7bfb" fill-opacity="0.15"/>
              <path d="M140 105 L160 55 L180 105 Z" stroke="#4e7bfb" stroke-width="2" fill="none"/>
              <text x="160" y="130" fill="#8a96a8" font-family="monospace" font-size="10" text-anchor="middle" font-weight="700">ARTCRAFT APP</text>
            </svg>
          `;
      }
    }

    function getAppMascotSvg(app) {
      const key = (app || '').toLowerCase();
      switch (key) {
        case 'photocraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2L9 9H15L12 2ZM4 7L2 14L8 12L4 7ZM20 7L16 12L22 14L20 7ZM6 13L9 16L12 14L15 16L18 13L15 22L12 18L9 22L6 13Z"/></svg>`;
        case 'vectorcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2C8 4 6 8 6 12C6 16 10 20 12 22C14 20 18 16 18 12C18 8 16 4 12 2ZM10 9C10.55 9 11 9.45 11 10C11 10.55 10.55 11 10 11C9.45 11 9 10.55 9 10C9 9.45 9.45 9 10 9ZM14 9C14.55 9 15 9.45 15 10C15 10.55 14.55 11 14 11C13.45 11 13 10.55 13 10C13 9.45 13.45 9 14 9ZM12 17C10.5 17 9.5 15.5 9.5 15.5H14.5C14.5 15.5 13.5 17 12 17Z"/></svg>`;
        case 'filmcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><circle cx="8" cy="11" r="3"/><circle cx="16" cy="11" r="3"/><path d="M12 14L11 16H13L12 14Z"/><path d="M12 3C7 3 4 7 4 13C4 18 8 21 12 21C16 21 20 18 20 13C20 7 17 3 12 3ZM12 19C9 19 6 16.5 6 13C6 9 8 5 12 5C16 5 18 9 18 13C18 16.5 15 19 12 19Z"/></svg>`;
        case 'lightcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M4 4L7 11L10 9L12 11L14 9L17 11L20 4L18 14C18 18 15 21 12 21C9 21 6 18 6 14L4 4Z"/></svg>`;
        case 'pdfcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2L4 9L7 11L12 7L17 11L20 9L12 2ZM12 9L2 14L6 16L12 12L18 16L22 14L12 9ZM12 14L8 18L12 22L16 18L12 14Z"/></svg>`;
        case 'effectcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>`;
        case 'designcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 4C10 2 6 2 4 4C2 6 2 10 4 13C6 16 11 19 12 21C13 19 18 16 20 13C22 10 22 6 20 4C18 2 14 2 12 4ZM11 11H5C4.5 11 4 9 5 8C6 7 9 7 11 9V11ZM13 11V9C15 7 18 7 19 8C20 9 19.5 11 19 11H13Z"/></svg>`;
        case 'figcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 3C7 3 3 7 3 12C3 17 7 21 12 21C16 21 19 18 20 14L17 14C16.5 16.5 14.5 18 12 18C8.7 18 6 15.3 6 12C6 8.7 8.7 6 12 6C14 6 16 7 17 9H13V12H21V3H18L16.5 5C15 3.8 13.5 3 12 3Z"/></svg>`;
        case 'wordcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z"/></svg>`;
        case 'soundcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M3 10V14H5V10H3ZM7 7V17H9V7H7ZM11 3V21H13V3H11ZM15 7V17H17V7H15ZM19 10V14H21V10H19Z"/></svg>`;
        case 'deckcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M19 3H5C3.9 3 3 3.9 3 5V15C3 16.1 3.9 17 5 17H11V19H8V21H16V19H13V17H19C20.1 17 21 16.1 21 15V5C21 3.9 20.1 3 19 3ZM19 15H5V5H19V15ZM10 7L15 10L10 13V7Z"/></svg>`;
        case 'cadcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M12 2C10.9 2 10 2.9 10 4C10 4.4 10.1 4.8 10.4 5.1L5.5 19.3L7.4 20L11 9.5V11H13V9.5L16.6 20L18.5 19.3L13.6 5.1C13.9 4.8 14 4.4 14 4C14 2.9 13.1 2 12 2Z"/></svg>`;
        case 'gridcraft':
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><path d="M3 3V21H21V3H3ZM9 9H5V5H9V9ZM15 9H11V5H15V9ZM19 9H17V5H19V9ZM9 15H5V11H9V15ZM15 15H11V11H15V15ZM19 15H17V11H19V15ZM9 19H5V17H9V19ZM15 19H11V17H15V19ZM19 19H17V17H19V19Z"/></svg>`;
        default:
          return `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22"><polygon points="12,2 2,22 22,22"/></svg>`;
      }
    }

    /* -------------------------------------------------------------
       State Management
       ------------------------------------------------------------- */
    let rawApps = [];
    let currentCategory = 'all';
    let searchQuery = '';
    let isSyncing = false;
    let syncPollTimer = null;
    let pinnedApps = new Set(JSON.parse(localStorage.getItem('artcraft_pinned_apps') || '[]'));

    function savePinnedApps() {
      localStorage.setItem('artcraft_pinned_apps', JSON.stringify([...pinnedApps]));
      fetch('/api/pinned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: [...pinnedApps] })
      }).catch(() => { });
    }

    function togglePin(appName) {
      const meta = getAppMeta(appName);
      if (pinnedApps.has(appName)) {
        pinnedApps.delete(appName);
        showToast('Unpinned', `Removed ${meta.title} from pinned apps`, 'info');
      } else {
        pinnedApps.add(appName);
        showToast('Pinned to Top', `📌 ${meta.title} is now pinned to the top`, 'success');
      }
      savePinnedApps();
      updateCategoryCounts();
      renderGrid();
    }

    /* DOM references */
    const pinnedSection = document.getElementById('pinned-section');
    const pinnedGrid = document.getElementById('pinned-grid');
    const pinnedBadgeCount = document.getElementById('pinned-badge-count');
    const mainSection = document.getElementById('main-section');
    const mainSectionTitle = document.getElementById('main-section-title');
    const mainBadgeCount = document.getElementById('main-badge-count');
    const appsGrid = document.getElementById('apps-grid');
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');
    const searchShortcut = document.getElementById('search-shortcut');
    const categoryPills = document.getElementById('category-pills');
    const btnSyncAll = document.getElementById('btn-sync-all');
    const btnSyncLabel = document.getElementById('btn-sync-label');
    const gridStatusCount = document.getElementById('grid-status-count');
    const toastContainer = document.getElementById('toast-container');

    /* -------------------------------------------------------------
       Toast Notification System
       ------------------------------------------------------------- */
    let lastToastText = '';
    let lastToastTime = 0;

    function showToast(title, message, type = 'success') {
      const now = Date.now();
      const toastKey = `${title}:${message}`;
      if (toastKey === lastToastText && (now - lastToastTime) < 2000) {
        return; // suppress duplicate toast within 2 seconds
      }
      lastToastText = toastKey;
      lastToastTime = now;

      // Keep max 3 toasts visible at a time
      while (toastContainer.children.length >= 3) {
        toastContainer.firstElementChild.remove();
      }

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;

      const icon = type === 'success' ? '✓' : type === 'info' ? 'ℹ' : '⚠';

      toast.innerHTML = `
        <div class="toast-icon">${icon}</div>
        <div class="toast-content">
          <div class="toast-title">${escapeHtml(title)}</div>
          <div class="toast-message">${escapeHtml(message)}</div>
        </div>
      `;

      toastContainer.appendChild(toast);

      setTimeout(() => {
        toast.style.animation = 'toastIn 0.2s reverse forwards';
        setTimeout(() => toast.remove(), 250);
      }, 3500);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatDate(isoStr) {
      if (!isoStr) return 'Recently';
      try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return 'Recently';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {
        return 'Recently';
      }
    }

    /* -------------------------------------------------------------
       Global Version Menu Helper
       ------------------------------------------------------------- */
    function closeAllVersionMenus() {
      document.querySelectorAll('.version-menu').forEach(m => {
        m.style.display = 'none';
        m.classList.remove('dropup');
      });
      document.querySelectorAll('.active-version-btn').forEach(b => {
        b.classList.remove('open');
        b.setAttribute('aria-expanded', 'false');
      });
      document.querySelectorAll('.app-card').forEach(c => {
        c.classList.remove('has-menu-open');
      });
    }

    /* -------------------------------------------------------------
       Card Builder
       ------------------------------------------------------------- */
    function buildAppCard(appInfo) {
      const meta = getAppMeta(appInfo.app);
      let activeTag = appInfo.active || (appInfo.releases[0] ? appInfo.releases[0].tag : 'latest');
      const releases = appInfo.releases || [];
      const isPinned = pinnedApps.has(appInfo.app);

      // Find release date for active version
      const activeRelease = releases.find(r => r.tag === activeTag) || releases[0] || {};
      const updatedDate = formatDate(activeRelease.downloaded_at);

      const card = document.createElement('div');
      card.className = `app-card ${isPinned ? 'is-pinned' : ''}`;
      card.dataset.app = appInfo.app;
      card.dataset.category = meta.category;

      const mascotSvg = getAppMascotSvg(appInfo.app);

      if (currentTheme === 'artcraft') {
        const previewSvg = getAppPreviewSvg(appInfo.app);
        card.innerHTML = `
          <!-- ArtCraft Theme Top Header (Numbered box + Category Tag) -->
          <div class="artcraft-card-topbar">
            <div class="artcraft-num-box" style="background: ${meta.accentColor || '#2563eb'};">${meta.num || '01'}</div>
            <span class="artcraft-category-tag">${escapeHtml(meta.categoryTag || meta.categoryName.toUpperCase())}</span>
          </div>

          <!-- ArtCraft Theme Preview Graphic -->
          <a href="/${appInfo.app}/" class="artcraft-card-preview" target="_blank" rel="noopener" title="Launch ${meta.title}">
            <img src="/previews/${appInfo.app}.webp" 
                 alt="${meta.title} Interface Preview" 
                 class="artcraft-preview-img" 
                 loading="lazy" 
                 decoding="async"
                 onerror="if (this.dataset.triedOnline !== 'true') { this.dataset.triedOnline = 'true'; this.src = 'https://getartcraft.com/images/apps/${appInfo.app}/${appInfo.app === 'filmcraft' ? 'color' : 'hero'}.webp'; } else { this.style.display='none'; this.nextElementSibling.style.display='block'; }">
            <div class="artcraft-preview-fallback" style="display: none; width: 100%; height: 100%;">
              ${previewSvg}
            </div>
          </a>

          <!-- Card Main Content -->
          <div class="card-inner-content">
            <!-- App Icon overlapping preview -->
            <div class="artcraft-icon-wrapper">
              <a href="/${appInfo.app}/" class="app-icon-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
                <div class="app-icon-slot" style="background: ${meta.accentColor || '#2563eb'};">
                  <img src="/icons/${appInfo.app}.webp" alt="${meta.title} Icon" class="app-icon-img"
                       onerror="if (this.dataset.triedSvg !== 'true') { this.dataset.triedSvg = 'true'; this.src = '/icons/${appInfo.app}.svg'; } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }">
                  <div class="app-icon-fallback" style="background: ${meta.gradient}; display: none;">
                    ${mascotSvg || meta.monogram}
                  </div>
                </div>
              </a>
            </div>

            <!-- Title & Description Block -->
            <div class="card-meta">
              <div class="card-title-row">
                <a href="/${appInfo.app}/" class="app-title-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
                  <h3 class="app-title" title="${meta.title}">${meta.title}</h3>
                </a>
                <button class="btn-pin ${isPinned ? 'pinned' : ''}" id="pin-${appInfo.app}" title="${isPinned ? 'Unpin from favorites' : 'Pin to favorites'}">
                  <svg viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22"></line>
                    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                  </svg>
                </button>
              </div>
              <p class="app-desc">${meta.desc}</p>
            </div>

            <!-- Release Badges (Active Release Dropdown & Updated Date) -->
            <div class="artcraft-badges-row">
              <div class="version-dropdown-container">
                <button type="button" class="active-version-btn artcraft-pill-stage ${releases.length > 1 ? 'has-dropdown' : 'single-version'}" id="chip-${appInfo.app}" title="${releases.length > 1 ? `Click to choose version (${releases.length} installed)` : escapeHtml(activeTag)}" aria-haspopup="${releases.length > 1 ? 'true' : 'false'}" aria-expanded="false" style="border-color: ${meta.accentColor || '#4e7bfb'}; color: ${meta.accentColor || '#4e7bfb'};">
                  <span class="version-tag-text" id="tag-text-${appInfo.app}">${escapeHtml(activeTag)}</span>
                  ${releases.length > 1 ? `
                  <svg class="chip-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>` : ''}
                </button>
                <div class="version-menu" id="menu-${appInfo.app}"></div>
              </div>
              <span class="artcraft-date-text" id="date-${appInfo.app}">UPDATED ${updatedDate.toUpperCase()}</span>
            </div>

            <!-- ArtCraft Bottom Explore / Launch Action Button -->
            <a href="/${appInfo.app}/" class="artcraft-explore-btn" target="_blank" rel="noopener">
              <span>EXPLORE ${meta.title.toUpperCase()}</span>
              <span class="artcraft-arrow">↗</span>
            </a>
          </div>
        `;
      } else {
        // Original Glass Theme Card Layout
        card.innerHTML = `
          <div class="card-top">
            <a href="/${appInfo.app}/" class="app-icon-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
              <div class="app-icon-slot" style="background: ${meta.accentColor || '#2563eb'};">
                <img src="/icons/${appInfo.app}.svg" alt="${meta.title} Icon" class="app-icon-img"
                     onerror="if (this.dataset.triedWebp !== 'true') { this.dataset.triedWebp = 'true'; this.src = '/icons/${appInfo.app}.webp'; } else { this.style.display='none'; this.nextElementSibling.style.display='flex'; }">
                <div class="app-icon-fallback" style="background: ${meta.gradient}; display: none;">
                  ${mascotSvg || meta.monogram}
                </div>
              </div>
            </a>
            <div class="card-meta">
              <div class="card-title-row">
                <a href="/${appInfo.app}/" class="app-title-link" target="_blank" rel="noopener" title="Launch ${meta.title}">
                  <h3 class="app-title" title="${meta.title}">${meta.title}</h3>
                  <svg class="launch-icon-mini" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                </a>
                <div class="card-badge-actions" style="display: flex; align-items: center; gap: 0.45rem;">
                  <span class="app-category-pill">${meta.categoryName}</span>
                  <button class="btn-pin ${isPinned ? 'pinned' : ''}" id="pin-${appInfo.app}" title="${isPinned ? 'Unpin from favorites' : 'Pin to favorites'}">
                    <svg viewBox="0 0 24 24" fill="${isPinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="12" y1="17" x2="12" y2="22"></line>
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                    </svg>
                  </button>
                </div>
              </div>
              <div class="app-tagline">${meta.tagline}</div>
              <p class="app-desc">${meta.desc}</p>
            </div>
          </div>

          <div class="card-details">
            <div class="release-info">
              <div class="active-badge-group">
                <span style="color: var(--text-muted); font-size: 0.7rem;">Active:</span>
                <div class="version-dropdown-container">
                  <button type="button" class="active-version-btn" id="chip-${appInfo.app}" title="Click to choose version" aria-haspopup="true" aria-expanded="false">
                    <span class="version-tag-text" id="tag-text-${appInfo.app}">${escapeHtml(activeTag)}</span>
                    <svg class="chip-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                  <div class="version-menu" id="menu-${appInfo.app}"></div>
                </div>
              </div>
              <span class="updated-date" id="date-${appInfo.app}">Updated ${updatedDate}</span>
            </div>
            <span class="releases-count-badge">${releases.length} ${releases.length === 1 ? 'version' : 'versions'}</span>
          </div>
        `;
      }

      // Pin button handler
      const pinBtn = card.querySelector(`#pin-${appInfo.app}`);
      pinBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePin(appInfo.app);
      });

      // Version switcher elements
      const chipBtn = card.querySelector(`#chip-${appInfo.app}`);
      const menuEl = card.querySelector(`#menu-${appInfo.app}`);
      const tagTextEl = card.querySelector(`#tag-text-${appInfo.app}`);
      const dateEl = card.querySelector(`#date-${appInfo.app}`);

      function renderVersionMenu() {
        menuEl.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'version-menu-header';
        header.textContent = 'Installed Versions';
        menuEl.appendChild(header);

        if (releases.length === 0) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'version-menu-item active';
          item.innerHTML = `<span>${escapeHtml(activeTag)}</span> <span style="color:var(--text-secondary);font-size:0.75rem;">✓</span>`;
          menuEl.appendChild(item);
          return;
        }

        releases.forEach(r => {
          const isCurrent = r.tag === activeTag;
          const item = document.createElement('button');
          item.type = 'button';
          item.className = `version-menu-item ${isCurrent ? 'active' : ''}`;
          item.innerHTML = `
            <span>${escapeHtml(r.tag)}</span>
            ${isCurrent ? '<span style="color:var(--text-secondary);font-size:0.75rem;">✓</span>' : ''}
          `;

          item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllVersionMenus();

            if (r.tag === activeTag) return;

            chipBtn.disabled = true;
            try {
              const res = await fetch(`/api/${appInfo.app}/switch/${encodeURIComponent(r.tag)}`, {
                method: 'POST'
              });
              const data = await res.json();

              if (data.ok) {
                activeTag = r.tag;
                tagTextEl.textContent = activeTag;
                if (r.downloaded_at && dateEl) {
                  if (currentTheme === 'artcraft') {
                    dateEl.textContent = `UPDATED ${formatDate(r.downloaded_at).toUpperCase()}`;
                  } else {
                    dateEl.textContent = `Updated ${formatDate(r.downloaded_at)}`;
                  }
                }
                renderVersionMenu();
                showToast('Version Activated', `${meta.title} switched to ${r.tag}`, 'success');
              } else {
                showToast('Switch Failed', data.error || 'Could not change active version.', 'error');
              }
            } catch (err) {
              showToast('Network Error', err.message, 'error');
            } finally {
              chipBtn.disabled = false;
            }
          });

          menuEl.appendChild(item);
        });
      }

      renderVersionMenu();

      // Toggle version menu
      chipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // In ArtCraft theme, do not expand if only one version is installed
        if (currentTheme === 'artcraft' && releases.length <= 1) {
          return;
        }

        const isOpen = menuEl.style.display === 'flex';
        closeAllVersionMenus();

        if (!isOpen) {
          const rect = chipBtn.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          if (spaceBelow < 250 && rect.top > 250) {
            menuEl.classList.add('dropup');
          } else {
            menuEl.classList.remove('dropup');
          }
          menuEl.style.display = 'flex';
          chipBtn.classList.add('open');
          chipBtn.setAttribute('aria-expanded', 'true');
          card.classList.add('has-menu-open');
        }
      });

      return card;
    }

    /* -------------------------------------------------------------
       Rendering & Filtering
       ------------------------------------------------------------- */
    function renderGrid() {
      pinnedGrid.innerHTML = '';
      appsGrid.innerHTML = '';

      const query = searchQuery.trim().toLowerCase();

      const filtered = rawApps.filter(app => {
        const meta = getAppMeta(app.app);

        // Category filter
        if (currentCategory === 'pinned') {
          if (!pinnedApps.has(app.app)) return false;
        } else if (currentCategory !== 'all' && meta.category !== currentCategory) {
          return false;
        }

        // Search query filter
        if (query) {
          const matchName = meta.title.toLowerCase().includes(query) || app.app.toLowerCase().includes(query);
          const matchTagline = meta.tagline.toLowerCase().includes(query);
          const matchDesc = meta.desc.toLowerCase().includes(query);
          const matchCategory = meta.categoryName.toLowerCase().includes(query);
          const matchAlt = meta.alt ? meta.alt.toLowerCase().includes(query) : false;
          const matchVersions = (app.releases || []).some(r => r.tag.toLowerCase().includes(query));
          return matchName || matchTagline || matchDesc || matchCategory || matchAlt || matchVersions;
        }

        return true;
      });

      // Split into pinned and unpinned lists
      const pinnedList = filtered.filter(app => pinnedApps.has(app.app));
      const unpinnedList = filtered.filter(app => !pinnedApps.has(app.app));

      // Sort both lists (by official ArtCraft lineup number in ArtCraft theme, or alphabetically in Glass theme)
      if (currentTheme === 'artcraft') {
        pinnedList.sort((a, b) => (getAppMeta(a.app).num || '99').localeCompare(getAppMeta(b.app).num || '99'));
        unpinnedList.sort((a, b) => (getAppMeta(a.app).num || '99').localeCompare(getAppMeta(b.app).num || '99'));
      } else {
        pinnedList.sort((a, b) => getAppMeta(a.app).title.localeCompare(getAppMeta(b.app).title));
        unpinnedList.sort((a, b) => getAppMeta(a.app).title.localeCompare(getAppMeta(b.app).title));
      }

      // Update global count & ArtCraft section headers
      gridStatusCount.textContent = `Showing ${filtered.length} of ${rawApps.length} creative tools`;
      const pinnedMeta = document.getElementById('artcraft-pinned-meta');
      const lineupTitle = document.getElementById('artcraft-lineup-title');

      // 1. Pinned Favorites Section (top)
      if (pinnedList.length > 0) {
        pinnedSection.style.display = 'block';
        pinnedBadgeCount.textContent = pinnedList.length;
        if (pinnedMeta) {
          pinnedMeta.textContent = `${pinnedList.length} ${pinnedList.length === 1 ? 'APP' : 'APPS'} PINNED`;
        }
        if (lineupTitle) {
          lineupTitle.textContent = '02 / THE LINEUP';
        }
        const pinnedFragment = document.createDocumentFragment();
        pinnedList.forEach(app => pinnedFragment.appendChild(buildAppCard(app)));
        pinnedGrid.appendChild(pinnedFragment);
      } else {
        pinnedSection.style.display = 'none';
        if (lineupTitle) {
          lineupTitle.textContent = '01 / THE LINEUP';
        }
      }

      // 2. Main Tools Section (bottom)
      if (currentCategory === 'pinned') {
        // If "Pinned" tab is active, only show pinned section
        mainSection.style.display = 'none';
        if (pinnedList.length === 0) {
          pinnedSection.style.display = 'block';
          if (pinnedMeta) {
            pinnedMeta.textContent = '0 APPS PINNED';
          }
          pinnedGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">📌</div>
              <h3 class="empty-title">No Pinned Applications</h3>
              <p class="empty-desc">
                Click the pin icon on any tool card to add it to your pinned favorites.
              </p>
              <button class="btn-sync" onclick="clearFilters()">View All Tools</button>
            </div>
          `;
        }
        return;
      }

      mainSection.style.display = 'block';
      mainBadgeCount.textContent = unpinnedList.length;

      if (filtered.length === 0) {
        if (rawApps.length === 0) {
          appsGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">🎨</div>
              <h3 class="empty-title">No Applications Found</h3>
              <p class="empty-desc">
                No apps have been downloaded yet. Add your repositories to <code>/config/apps.conf</code> and click "Sync Releases" to fetch them.
              </p>
              <button class="btn-sync" onclick="triggerSync()">Sync Now</button>
            </div>
          `;
        } else {
          appsGrid.innerHTML = `
            <div class="empty-state">
              <div class="empty-icon">🔍</div>
              <h3 class="empty-title">No Matching Tools</h3>
              <p class="empty-desc">
                No application matches your current search or category filter.
              </p>
              <button class="btn-sync" onclick="clearFilters()">Reset Filters</button>
            </div>
          `;
        }
        return;
      }

      const appsFragment = document.createDocumentFragment();
      unpinnedList.forEach(app => {
        appsFragment.appendChild(buildAppCard(app));
      });
      appsGrid.appendChild(appsFragment);
    }

    function updateCategoryCounts() {
      const counts = { all: rawApps.length, pinned: 0, graphics: 0, vector: 0, documents: 0, cad: 0, audio: 0 };
      rawApps.forEach(app => {
        const meta = getAppMeta(app.app);
        if (counts[meta.category] !== undefined) {
          counts[meta.category]++;
        }
        if (pinnedApps.has(app.app)) {
          counts.pinned++;
        }
      });

      document.getElementById('count-all').textContent = counts.all;
      document.getElementById('count-pinned').textContent = counts.pinned;
      document.getElementById('count-graphics').textContent = counts.graphics;
      document.getElementById('count-vector').textContent = counts.vector;
      document.getElementById('count-documents').textContent = counts.documents;
      document.getElementById('count-cad').textContent = counts.cad;
      document.getElementById('count-audio').textContent = counts.audio;
      document.getElementById('footer-total-apps').textContent = `${rawApps.length} apps installed`;
    }

    function clearFilters() {
      currentCategory = 'all';
      searchQuery = '';
      searchInput.value = '';
      searchClear.style.display = 'none';
      searchShortcut.style.display = 'block';

      document.querySelectorAll('.filter-pill').forEach(p => {
        p.classList.toggle('active', p.dataset.category === 'all');
      });

      renderGrid();
    }

    /* -------------------------------------------------------------
       API Calls
       ------------------------------------------------------------- */
    async function fetchManifest() {
      try {
        const res = await fetch('/api/manifest');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Merge server pinned apps if local storage is empty
        if (data.pinned && Array.isArray(data.pinned) && data.pinned.length > 0 && pinnedApps.size === 0) {
          data.pinned.forEach(p => pinnedApps.add(p));
          localStorage.setItem('artcraft_pinned_apps', JSON.stringify([...pinnedApps]));
        }

        rawApps = data.apps || [];
        updateCategoryCounts();
        renderGrid();

        if (data.system) {
          updateSystemStatus(data.system);
        }
      } catch (err) {
        console.error('Failed to load manifest:', err);
        appsGrid.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">⚠️</div>
            <h3 class="empty-title">Unable to Connect to Hub API</h3>
            <p class="empty-desc">
              Could not communicate with the local sidecar API at <code>/api/manifest</code>. Make sure the container is healthy.
            </p>
            <button class="btn-sync" onclick="fetchManifest()">Retry</button>
          </div>
        `;
      }
    }

    async function checkStatus() {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const sys = await res.json();
          updateSystemStatus(sys);
        }
      } catch (e) {
        // quiet ignore on background status check
      }
    }

    function stopSyncPolling() {
      if (syncPollTimer) {
        clearInterval(syncPollTimer);
        syncPollTimer = null;
      }
    }

    function startSyncPolling() {
      stopSyncPolling();
      syncPollTimer = setInterval(pollSyncStatus, 2500);
    }

    function updateSystemStatus(sys) {
      if (!sys) return;

      const active = sys.is_syncing || sys.status === 'syncing';
      isSyncing = active;

      if (active) {
        btnSyncAll.disabled = true;
        btnSyncAll.classList.add('spinning');
        btnSyncLabel.textContent = 'Syncing...';
      } else {
        btnSyncAll.disabled = false;
        btnSyncAll.classList.remove('spinning');
        btnSyncLabel.textContent = 'Sync Releases';
        stopSyncPolling();
      }

      if (sys.last_sync) {
        document.getElementById('footer-last-sync').textContent = `Last checked: ${formatDate(sys.last_sync)}`;
      }
      if (sys.schedule) {
        document.getElementById('footer-cron-schedule').textContent = `Schedule: ${sys.schedule}`;
      }
    }

    async function triggerSync() {
      if (isSyncing) return;

      try {
        btnSyncAll.disabled = true;
        btnSyncAll.classList.add('spinning');
        btnSyncLabel.textContent = 'Starting...';

        const res = await fetch('/api/sync', { method: 'POST' });
        const data = await res.json();

        if (res.ok && data.ok) {
          showToast('Sync Triggered', 'Checking upstream GitHub releases in the background...', 'info');
          isSyncing = true;
          updateSystemStatus({ is_syncing: true });
          startSyncPolling();
        } else {
          showToast('Sync Alert', data.error || 'Could not start sync.', 'error');
          isSyncing = false;
          updateSystemStatus({ is_syncing: false });
        }
      } catch (err) {
        showToast('Error', err.message, 'error');
        isSyncing = false;
        updateSystemStatus({ is_syncing: false });
      }
    }

    let isPollingCheck = false;
    async function pollSyncStatus() {
      if (!isSyncing || isPollingCheck) return;
      isPollingCheck = true;

      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const sys = await res.json();
          const stillRunning = sys.is_syncing || sys.status === 'syncing';
          if (!stillRunning) {
            // Completely finished!
            isSyncing = false;
            stopSyncPolling();
            updateSystemStatus(sys);
            showToast('Sync Complete', 'Applications updated successfully.', 'success');
            await fetchManifest();
          }
        }
      } catch (e) {
        // silent retry on next interval
      } finally {
        isPollingCheck = false;
      }
    }

    /* -------------------------------------------------------------
       Event Listeners
       ------------------------------------------------------------- */
    // Category pill click
    categoryPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;

      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');

      currentCategory = btn.dataset.category || 'all';
      renderGrid();
    });

    // Search input
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      if (searchQuery.length > 0) {
        searchClear.style.display = 'block';
        searchShortcut.style.display = 'none';
      } else {
        searchClear.style.display = 'none';
        searchShortcut.style.display = 'block';
      }
      renderGrid();
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.style.display = 'none';
      searchShortcut.style.display = 'block';
      searchInput.focus();
      renderGrid();
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.version-dropdown-container')) {
        closeAllVersionMenus();
      }
    });

    // Keyboard shortcut '/' to search & Escape to dismiss
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      } else if (e.key === 'Escape') {
        closeAllVersionMenus();
        if (searchInput === document.activeElement) {
          searchInput.blur();
        }
      }
    });

    // Sync button
    btnSyncAll.addEventListener('click', triggerSync);

    /* -------------------------------------------------------------
       Theme Management (ArtCraft Theme & Glass Themes)
       ------------------------------------------------------------- */
    const THEME_KEY = 'artcraft_hub_theme';
    let currentTheme = localStorage.getItem(THEME_KEY) || 'artcraft';

    function applyTheme(theme, notify = false) {
      currentTheme = theme;
      if (theme === 'artcraft') {
        document.documentElement.setAttribute('data-theme', 'artcraft');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      localStorage.setItem(THEME_KEY, theme);
      updateThemeButtonUI();
      if (rawApps && rawApps.length > 0) {
        renderGrid();
      }
      if (notify) {
        const name = theme === 'artcraft' ? 'ArtCraft Theme' : 'Glass Theme';
        showToast('Theme Updated', `Switched to ${name}`, 'info');
      }
    }

    function toggleTheme() {
      const nextTheme = currentTheme === 'artcraft' ? 'glass' : 'artcraft';
      applyTheme(nextTheme, true);
    }

    function updateThemeButtonUI() {
      const label = document.getElementById('theme-btn-label');
      const iconArtcraft = document.querySelector('.theme-icon-artcraft');
      const iconGlass = document.querySelector('.theme-icon-glass');
      const btn = document.getElementById('btn-theme-toggle');
      if (!label) return;

      if (currentTheme === 'artcraft') {
        label.textContent = 'ArtCraft Theme';
        if (iconArtcraft) iconArtcraft.style.display = 'block';
        if (iconGlass) iconGlass.style.display = 'none';
        if (btn) btn.title = 'Active: ArtCraft Theme (Click to switch to Glass Theme)';
      } else {
        label.textContent = 'Glass Theme';
        if (iconArtcraft) iconArtcraft.style.display = 'none';
        if (iconGlass) iconGlass.style.display = 'block';
        if (btn) btn.title = 'Active: Glass Theme (Click to switch to ArtCraft Theme)';
      }
    }

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', toggleTheme);
    }

    /* -------------------------------------------------------------
       Initialization & Global API Exports
       ------------------------------------------------------------- */
    window.clearFilters = clearFilters;
    window.triggerSync = triggerSync;
    window.handleCustomLogoLoad = handleCustomLogoLoad;
    window.handleCustomLogoError = handleCustomLogoError;

    applyTheme(currentTheme, false);
    fetchManifest();