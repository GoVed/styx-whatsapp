/**
 * SVG Templates for Built-In Sticker Generation
 */
export const stickers = {
  cat_shrug: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <radialGradient id="catFur" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#FFFDF7"/>
          <stop offset="70%" stop-color="#F2E8D5"/>
          <stop offset="100%" stop-color="#DFD1B8"/>
        </radialGradient>
        <radialGradient id="earPink" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFB8C6"/>
          <stop offset="100%" stop-color="#E58A9B"/>
        </radialGradient>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000000" flood-opacity="0.25"/>
        </filter>
      </defs>
      <g filter="url(#shadow)">
        <path d="M 120 180 L 150 90 L 220 150 L 292 150 L 362 90 L 392 180 C 440 230 450 320 400 390 C 360 450 152 450 112 390 C 62 320 72 230 120 180 Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="24" stroke-linejoin="round"/>
        <path d="M 140 370 C 130 430 382 430 372 370 C 400 310 390 220 350 170 C 310 160 202 160 162 170 C 122 220 112 310 140 370 Z" fill="url(#catFur)"/>
        <polygon points="150,175 160,95 225,150" fill="url(#catFur)" stroke="#D4C3A3" stroke-width="4"/>
        <polygon points="165,160 172,115 210,145" fill="url(#earPink)"/>
        <polygon points="362,175 352,95 287,150" fill="url(#catFur)" stroke="#D4C3A3" stroke-width="4"/>
        <polygon points="347,160 340,115 302,145" fill="url(#earPink)"/>
        <ellipse cx="256" cy="240" rx="115" ry="95" fill="url(#catFur)" stroke="#D4C3A3" stroke-width="4"/>
        <ellipse cx="195" cy="275" rx="16" ry="10" fill="#FFAAA6" opacity="0.6"/>
        <ellipse cx="317" cy="275" rx="16" ry="10" fill="#FFAAA6" opacity="0.6"/>
        <path d="M 185 235 Q 205 215 225 235" fill="none" stroke="#2D3142" stroke-width="6" stroke-linecap="round"/>
        <path d="M 287 235 Q 307 215 327 235" fill="none" stroke="#2D3142" stroke-width="6" stroke-linecap="round"/>
        <path d="M 180 210 Q 205 200 220 215" fill="none" stroke="#7A6855" stroke-width="4" stroke-linecap="round"/>
        <path d="M 332 210 Q 307 200 292 215" fill="none" stroke="#7A6855" stroke-width="4" stroke-linecap="round"/>
        <polygon points="256,260 250,252 262,252" fill="#E58A9B"/>
        <path d="M 244 265 Q 256 272 256 260 Q 256 272 268 265" fill="none" stroke="#2D3142" stroke-width="4" stroke-linecap="round"/>
        <line x1="140" y1="250" x2="190" y2="255" stroke="#9C8974" stroke-width="3" stroke-linecap="round"/>
        <line x1="135" y1="265" x2="185" y2="265" stroke="#9C8974" stroke-width="3" stroke-linecap="round"/>
        <line x1="372" y1="250" x2="322" y2="255" stroke="#9C8974" stroke-width="3" stroke-linecap="round"/>
        <line x1="377" y1="265" x2="327" y2="265" stroke="#9C8974" stroke-width="3" stroke-linecap="round"/>
        <g transform="translate(100, 270) rotate(-25)">
          <path d="M 0 0 C -20 -10 -30 20 -20 45 C -10 65 20 65 30 45 C 35 25 20 0 0 0 Z" fill="url(#catFur)" stroke="#D4C3A3" stroke-width="4"/>
          <ellipse cx="-2" cy="30" rx="14" ry="10" fill="#FFB8C6" opacity="0.8"/>
          <circle cx="-10" cy="12" r="4" fill="#FFB8C6" opacity="0.8"/>
          <circle cx="0" cy="8" r="4" fill="#FFB8C6" opacity="0.8"/>
          <circle cx="10" cy="12" r="4" fill="#FFB8C6" opacity="0.8"/>
        </g>
        <g transform="translate(412, 270) rotate(25)">
          <path d="M 0 0 C 20 -10 30 20 20 45 C 10 65 -20 65 -30 45 C -35 25 -20 0 0 0 Z" fill="url(#catFur)" stroke="#D4C3A3" stroke-width="4"/>
          <ellipse cx="2" cy="30" rx="14" ry="10" fill="#FFB8C6" opacity="0.8"/>
          <circle cx="10" cy="12" r="4" fill="#FFB8C6" opacity="0.8"/>
          <circle cx="0" cy="8" r="4" fill="#FFB8C6" opacity="0.8"/>
          <circle cx="-10" cy="12" r="4" fill="#FFB8C6" opacity="0.8"/>
        </g>
        <circle cx="390" cy="130" r="32" fill="#10B981" stroke="#FFFFFF" stroke-width="5"/>
        <text x="390" y="143" font-family="Arial, sans-serif" font-size="38" font-weight="900" fill="#FFFFFF" text-anchor="middle">?</text>
        <rect x="136" y="420" width="240" height="42" rx="21" fill="#1E293B" stroke="#FFFFFF" stroke-width="4"/>
        <text x="256" y="448" font-family="'JetBrains Mono', monospace, sans-serif" font-size="20" font-weight="bold" fill="#34D399" text-anchor="middle">¯\\_(ツ)_/¯</text>
      </g>
    </svg>
  `,
  cat_sad_crying: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <radialGradient id="sadFur" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#E2E8F0"/>
          <stop offset="100%" stop-color="#94A3B8"/>
        </radialGradient>
        <linearGradient id="tearGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#38BDF8"/>
          <stop offset="100%" stop-color="#0284C7"/>
        </linearGradient>
      </defs>
      <path d="M 130 190 L 155 100 L 225 160 L 287 160 L 357 100 L 382 190 C 430 240 435 340 385 400 C 345 450 167 450 127 400 C 77 340 82 240 130 190 Z" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="20"/>
      <ellipse cx="256" cy="260" rx="125" ry="110" fill="url(#sadFur)"/>
      <polygon points="145,200 130,120 205,170" fill="url(#sadFur)"/>
      <polygon points="367,200 382,120 307,170" fill="url(#sadFur)"/>
      <ellipse cx="205" cy="245" rx="26" ry="32" fill="#0F172A"/>
      <ellipse cx="307" cy="245" rx="26" ry="32" fill="#0F172A"/>
      <circle cx="198" cy="235" r="10" fill="#FFFFFF"/>
      <circle cx="212" cy="255" r="5" fill="#FFFFFF"/>
      <circle cx="300" cy="235" r="10" fill="#FFFFFF"/>
      <circle cx="314" cy="255" r="5" fill="#FFFFFF"/>
      <path d="M 195 270 C 180 320 160 360 175 400 C 190 420 220 420 215 390 C 210 350 215 300 210 270 Z" fill="url(#tearGrad)" opacity="0.9"/>
      <path d="M 317 270 C 332 320 352 360 337 400 C 322 420 292 420 297 390 C 302 350 297 300 302 270 Z" fill="url(#tearGrad)" opacity="0.9"/>
      <path d="M 236 300 Q 256 288 276 300 Q 256 310 236 300" fill="#E2E8F0" stroke="#0F172A" stroke-width="4"/>
      <path d="M 210 90 Q 210 60 240 60 Q 260 45 285 60 Q 310 60 310 90 Z" fill="#64748B"/>
      <line x1="230" y1="100" x2="225" y2="120" stroke="#38BDF8" stroke-width="3" stroke-linecap="round"/>
      <line x1="260" y1="100" x2="255" y2="125" stroke="#38BDF8" stroke-width="3" stroke-linecap="round"/>
      <line x1="290" y1="100" x2="285" y2="120" stroke="#38BDF8" stroke-width="3" stroke-linecap="round"/>
    </svg>
  `,
  cat_celebrate: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <radialGradient id="partyFur" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#FED7AA"/>
          <stop offset="100%" stop-color="#FB923C"/>
        </radialGradient>
      </defs>
      <ellipse cx="256" cy="270" rx="120" ry="105" fill="url(#partyFur)" stroke="#FFFFFF" stroke-width="16"/>
      <polygon points="256,70 210,195 302,195" fill="#EC4899" stroke="#FDE047" stroke-width="6"/>
      <circle cx="256" cy="65" r="14" fill="#FDE047"/>
      <polygon points="160,200 140,120 215,180" fill="url(#partyFur)"/>
      <polygon points="352,200 372,120 297,180" fill="url(#partyFur)"/>
      <path d="M 185 260 Q 210 240 235 260" fill="none" stroke="#431407" stroke-width="7" stroke-linecap="round"/>
      <path d="M 277 260 Q 302 240 327 260" fill="none" stroke="#431407" stroke-width="7" stroke-linecap="round"/>
      <path d="M 230 285 Q 256 340 282 285 Z" fill="#EF4444" stroke="#431407" stroke-width="4"/>
      <circle cx="100" cy="140" r="10" fill="#38BDF8"/>
      <polygon points="120,200 135,185 110,185" fill="#FACC15"/>
      <circle cx="400" cy="150" r="12" fill="#A855F7"/>
      <rect x="380" y="220" width="14" height="14" rx="3" fill="#22C55E" transform="rotate(25 380 220)"/>
      <text x="256" y="440" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#FACC15" stroke="#431407" stroke-width="4" text-anchor="middle">🎉 YAAAY! 🎉</text>
    </svg>
  `,
  cat_thumbs_up: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <radialGradient id="thumbCat" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#FEF08A"/>
          <stop offset="100%" stop-color="#EAB308"/>
        </radialGradient>
      </defs>
      <ellipse cx="230" cy="250" rx="115" ry="95" fill="url(#thumbCat)" stroke="#FFFFFF" stroke-width="16"/>
      <polygon points="140,180 130,100 200,160" fill="url(#thumbCat)"/>
      <polygon points="320,180 330,100 260,160" fill="url(#thumbCat)"/>
      <circle cx="190" cy="240" r="12" fill="#1C1917"/>
      <circle cx="186" cy="236" r="4" fill="#FFFFFF"/>
      <path d="M 260 240 Q 280 255 300 240" fill="none" stroke="#1C1917" stroke-width="6" stroke-linecap="round"/>
      <path d="M 220 270 Q 240 285 260 270" fill="none" stroke="#1C1917" stroke-width="5" stroke-linecap="round"/>
      <g transform="translate(320, 240)">
        <ellipse cx="50" cy="70" rx="45" ry="35" fill="#FEF08A" stroke="#FFFFFF" stroke-width="10"/>
        <rect x="25" y="-10" width="30" height="60" rx="15" fill="#FEF08A" stroke="#FFFFFF" stroke-width="8"/>
        <circle cx="40" cy="10" r="8" fill="#F43F5E"/>
        <ellipse cx="50" cy="70" rx="20" ry="15" fill="#F43F5E"/>
      </g>
      <polygon points="360,190 366,205 381,211 366,217 360,232 354,217 339,211 354,205" fill="#FDE047"/>
    </svg>
  `,
  cat_facepalm: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <ellipse cx="256" cy="270" rx="120" ry="105" fill="#FED7AA" stroke="#FFFFFF" stroke-width="16"/>
      <polygon points="160,200 135,115 215,175" fill="#FED7AA"/>
      <polygon points="352,200 377,115 297,175" fill="#FED7AA"/>
      <ellipse cx="195" cy="260" rx="14" ry="18" fill="#1E293B"/>
      <line x1="180" y1="235" x2="215" y2="245" stroke="#7C2D12" stroke-width="4"/>
      <path d="M 200 320 Q 220 330 240 315 Q 260 330 280 320" fill="none" stroke="#1E293B" stroke-width="5" stroke-linecap="round"/>
      <g transform="translate(260, 200) rotate(15)">
        <rect x="0" y="0" width="85" height="120" rx="40" fill="#FDBA74" stroke="#FFFFFF" stroke-width="8"/>
        <line x1="25" y1="90" x2="25" y2="115" stroke="#C2410C" stroke-width="3"/>
        <line x1="45" y1="90" x2="45" y2="115" stroke="#C2410C" stroke-width="3"/>
        <line x1="65" y1="90" x2="65" y2="115" stroke="#C2410C" stroke-width="3"/>
      </g>
      <path d="M 130 220 C 130 190 150 170 150 170 C 150 170 170 190 170 220 C 170 235 155 245 140 240 C 130 235 130 230 130 220 Z" fill="#38BDF8"/>
      <text x="256" y="440" font-family="Arial, sans-serif" font-size="32" font-weight="900" fill="#EA580C" text-anchor="middle">🤦 FACEPALM</text>
    </svg>
  `,
  cat_typing_laptop: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <ellipse cx="256" cy="220" rx="110" ry="90" fill="#334155" stroke="#FFFFFF" stroke-width="14"/>
      <polygon points="160,160 140,80 215,140" fill="#334155"/>
      <polygon points="352,160 372,80 297,140" fill="#334155"/>
      <rect x="170" y="195" width="172" height="42" rx="12" fill="#022C22" stroke="#10B981" stroke-width="4"/>
      <text x="256" y="224" font-family="monospace" font-size="20" font-weight="bold" fill="#34D399" text-anchor="middle">&lt;DEV_MODE/&gt;</text>
      <polygon points="140,380 372,380 412,430 100,430" fill="#0F172A" stroke="#38BDF8" stroke-width="4"/>
      <rect x="160" y="280" width="192" height="105" rx="8" fill="#047857" stroke="#34D399" stroke-width="4"/>
      <text x="256" y="340" font-family="monospace" font-size="28" font-weight="bold" fill="#A7F3D0" text-anchor="middle">SYNDAE AI</text>
      <ellipse cx="190" cy="385" rx="25" ry="18" fill="#64748B"/>
      <ellipse cx="322" cy="385" rx="25" ry="18" fill="#64748B"/>
    </svg>
  `,
  cat_sleepy: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <rect x="100" y="260" width="312" height="150" rx="35" fill="#E0F2FE" stroke="#BAE6FD" stroke-width="8"/>
      <ellipse cx="230" cy="270" rx="90" ry="75" fill="#FDE047"/>
      <polygon points="150,220 140,160 195,210" fill="#FDE047"/>
      <polygon points="270,220 290,160 245,210" fill="#FDE047"/>
      <path d="M 180 270 Q 200 285 220 270" fill="none" stroke="#713F12" stroke-width="5" stroke-linecap="round"/>
      <path d="M 235 270 Q 255 285 275 270" fill="none" stroke="#713F12" stroke-width="5" stroke-linecap="round"/>
      <path d="M 120 310 C 180 290 340 290 400 310 L 400 420 L 120 420 Z" fill="#6366F1" stroke="#FFFFFF" stroke-width="6"/>
      <text x="350" y="210" font-family="'Comic Sans MS', sans-serif" font-size="34" font-weight="bold" fill="#818CF8">Z</text>
      <text x="385" y="170" font-family="'Comic Sans MS', sans-serif" font-size="44" font-weight="bold" fill="#6366F1">z</text>
      <text x="425" y="125" font-family="'Comic Sans MS', sans-serif" font-size="56" font-weight="bold" fill="#4F46E5">z</text>
    </svg>
  `,
  cat_peace_out: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <ellipse cx="240" cy="250" rx="110" ry="90" fill="#F472B6" stroke="#FFFFFF" stroke-width="14"/>
      <polygon points="150,190 135,110 205,170" fill="#F472B6"/>
      <polygon points="330,190 345,110 275,170" fill="#F472B6"/>
      <polygon points="160,220 225,220 215,260 170,260" fill="#0F172A"/>
      <polygon points="255,220 320,220 310,260 265,260" fill="#0F172A"/>
      <line x1="225" y1="230" x2="255" y2="230" stroke="#0F172A" stroke-width="6"/>
      <g transform="translate(340, 240)">
        <rect x="0" y="40" width="60" height="60" rx="20" fill="#F472B6" stroke="#FFFFFF" stroke-width="8"/>
        <rect x="8" y="-20" width="18" height="70" rx="9" fill="#F472B6" stroke="#FFFFFF" stroke-width="6"/>
        <rect x="32" y="-20" width="18" height="70" rx="9" fill="#F472B6" stroke="#FFFFFF" stroke-width="6"/>
      </g>
      <text x="256" y="440" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#EC4899" stroke="#FFFFFF" stroke-width="4" text-anchor="middle">PEACE OUT ✌️</text>
    </svg>
  `,
  thumbs_up_classic: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <radialGradient id="goldGrad" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stop-color="#FEF08A"/>
          <stop offset="50%" stop-color="#FACC15"/>
          <stop offset="100%" stop-color="#CA8A04"/>
        </radialGradient>
      </defs>
      <g transform="translate(60, 40)">
        <rect x="80" y="40" width="85" height="190" rx="42" fill="url(#goldGrad)" stroke="#FFFFFF" stroke-width="16" transform="rotate(-15 120 130)"/>
        <rect x="110" y="170" width="220" height="190" rx="60" fill="url(#goldGrad)" stroke="#FFFFFF" stroke-width="16"/>
        <rect x="220" y="170" width="120" height="48" rx="24" fill="url(#goldGrad)" stroke="#FFFFFF" stroke-width="8"/>
        <rect x="230" y="218" width="115" height="48" rx="24" fill="url(#goldGrad)" stroke="#FFFFFF" stroke-width="8"/>
        <rect x="225" y="266" width="115" height="48" rx="24" fill="url(#goldGrad)" stroke="#FFFFFF" stroke-width="8"/>
        <rect x="215" y="314" width="115" height="46" rx="23" fill="url(#goldGrad)" stroke="#FFFFFF" stroke-width="8"/>
      </g>
    </svg>
  `,
  fire_lit: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <radialGradient id="fireOuter" cx="50%" cy="80%" r="70%">
          <stop offset="0%" stop-color="#F97316"/>
          <stop offset="100%" stop-color="#DC2626"/>
        </radialGradient>
        <radialGradient id="fireInner" cx="50%" cy="75%" r="60%">
          <stop offset="0%" stop-color="#FEF08A"/>
          <stop offset="100%" stop-color="#F59E0B"/>
        </radialGradient>
      </defs>
      <path d="M 256 40 C 290 120 390 200 390 320 C 390 410 320 470 256 470 C 192 470 122 410 122 320 C 122 220 200 130 256 40 Z" fill="url(#fireOuter)" stroke="#FFFFFF" stroke-width="16"/>
      <path d="M 256 180 C 280 230 330 280 330 340 C 330 400 290 435 256 435 C 222 435 182 400 182 340 C 182 280 230 230 256 180 Z" fill="url(#fireInner)"/>
      <circle cx="210" cy="110" r="14" fill="#F59E0B"/>
      <circle cx="310" cy="140" r="10" fill="#EF4444"/>
    </svg>
  `,
  party_popper: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <polygon points="120,420 180,240 300,360" fill="#EAB308" stroke="#FFFFFF" stroke-width="12"/>
      <polygon points="120,420 150,330 240,420" fill="#CA8A04"/>
      <circle cx="260" cy="180" r="14" fill="#EC4899"/>
      <circle cx="340" cy="220" r="16" fill="#3B82F6"/>
      <circle cx="380" cy="140" r="12" fill="#10B981"/>
      <circle cx="220" cy="100" r="18" fill="#F97316"/>
      <path d="M 240 240 Q 300 150 400 180 Q 450 200 440 120" fill="none" stroke="#A855F7" stroke-width="10" stroke-linecap="round"/>
      <path d="M 200 200 Q 250 80 340 70 Q 380 60 360 30" fill="none" stroke="#F43F5E" stroke-width="8" stroke-linecap="round"/>
    </svg>
  `,
  mind_blown: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <circle cx="256" cy="310" r="130" fill="#FACC15" stroke="#FFFFFF" stroke-width="16"/>
      <circle cx="205" cy="290" r="28" fill="#FFFFFF" stroke="#000000" stroke-width="4"/>
      <circle cx="205" cy="290" r="12" fill="#000000"/>
      <circle cx="307" cy="290" r="28" fill="#FFFFFF" stroke="#000000" stroke-width="4"/>
      <circle cx="307" cy="290" r="12" fill="#000000"/>
      <ellipse cx="256" cy="370" rx="24" ry="34" fill="#000000"/>
      <ellipse cx="256" cy="130" rx="150" ry="75" fill="#8B5CF6" stroke="#FFFFFF" stroke-width="10"/>
      <circle cx="180" cy="120" r="45" fill="#EC4899"/>
      <circle cx="330" cy="120" r="45" fill="#06B6D4"/>
      <circle cx="256" cy="100" r="50" fill="#F43F5E"/>
      <text x="256" y="145" font-family="Arial, sans-serif" font-size="32" font-weight="900" fill="#FFFFFF" text-anchor="middle">✨ MIND BLOWN ✨</text>
    </svg>
  `,
  pleading_eyes: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <circle cx="256" cy="256" r="180" fill="#FBBF24" stroke="#FFFFFF" stroke-width="16"/>
      <g transform="translate(180, 230)">
        <ellipse cx="0" cy="0" rx="48" ry="60" fill="#1E293B"/>
        <ellipse cx="-12" cy="-20" rx="24" ry="32" fill="#FFFFFF"/>
        <circle cx="16" cy="22" r="12" fill="#FFFFFF"/>
        <circle cx="-18" cy="24" r="7" fill="#FFFFFF"/>
      </g>
      <g transform="translate(332, 230)">
        <ellipse cx="0" cy="0" rx="48" ry="60" fill="#1E293B"/>
        <ellipse cx="-12" cy="-20" rx="24" ry="32" fill="#FFFFFF"/>
        <circle cx="16" cy="22" r="12" fill="#FFFFFF"/>
        <circle cx="-18" cy="24" r="7" fill="#FFFFFF"/>
      </g>
      <path d="M 140 160 Q 180 180 210 160" fill="none" stroke="#78350F" stroke-width="8" stroke-linecap="round"/>
      <path d="M 372 160 Q 332 180 302 160" fill="none" stroke="#78350F" stroke-width="8" stroke-linecap="round"/>
      <path d="M 236 340 Q 256 325 276 340" fill="none" stroke="#78350F" stroke-width="7" stroke-linecap="round"/>
    </svg>
  `,
  coffee_steam: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <rect x="130" y="210" width="220" height="200" rx="30" fill="#3B82F6" stroke="#FFFFFF" stroke-width="14"/>
      <path d="M 350 250 C 420 250 420 370 350 370" fill="none" stroke="#3B82F6" stroke-width="32" stroke-linecap="round"/>
      <path d="M 350 250 C 420 250 420 370 350 370" fill="none" stroke="#FFFFFF" stroke-width="12" stroke-linecap="round"/>
      <path d="M 240 285 C 240 265 220 255 205 270 C 190 285 240 330 240 330 C 240 330 290 285 275 270 C 260 255 240 265 240 285 Z" fill="#FFFFFF"/>
      <path d="M 180 180 Q 200 130 170 80 Q 190 40 210 20" fill="none" stroke="#93C5FD" stroke-width="8" stroke-linecap="round"/>
      <path d="M 240 180 Q 260 120 230 70 Q 250 30 270 10" fill="none" stroke="#93C5FD" stroke-width="10" stroke-linecap="round"/>
      <path d="M 300 180 Q 320 130 290 80 Q 310 40 330 20" fill="none" stroke="#93C5FD" stroke-width="8" stroke-linecap="round"/>
    </svg>
  `,
  dog_happy_wag: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <circle cx="256" cy="256" r="140" fill="#F59E0B" stroke="#FFFFFF" stroke-width="16"/>
      <ellipse cx="120" cy="240" rx="45" ry="85" fill="#B45309" stroke="#FFFFFF" stroke-width="10" transform="rotate(15 120 240)"/>
      <ellipse cx="392" cy="240" rx="45" ry="85" fill="#B45309" stroke="#FFFFFF" stroke-width="10" transform="rotate(-15 392 240)"/>
      <ellipse cx="205" cy="230" rx="16" ry="22" fill="#1E293B"/>
      <circle cx="200" cy="222" r="6" fill="#FFFFFF"/>
      <ellipse cx="307" cy="230" rx="16" ry="22" fill="#1E293B"/>
      <circle cx="302" cy="222" r="6" fill="#FFFFFF"/>
      <ellipse cx="256" cy="275" rx="36" ry="24" fill="#FEF3C7"/>
      <polygon points="256,272 240,260 272,260" fill="#1E293B"/>
      <path d="M 242 300 C 242 340 270 340 270 300 Z" fill="#F43F5E"/>
      <text x="256" y="445" font-family="Arial, sans-serif" font-size="34" font-weight="900" fill="#D97706" stroke="#FFFFFF" stroke-width="4" text-anchor="middle">GOOD BOY! 🐶</text>
    </svg>
  `
};
export default stickers;
