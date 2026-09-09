# Asset provenance

- Underpond original logo: Vector.svg supplied by Relja Diklić.
- Typography: supplied PP Neue Montreal, rendered to vector outlines. Font binaries are not redistributed.
- Sculptural logo illustration: OpenAI built-in imagegen, September 6, 2026. Original logo supplied as reference. Art direction: dark polished chrome, red illuminated edges, black reflective surface, wide composition, negative space for typography, no text. This is a sculptural interpretation, accompanied by the unchanged original logo.
- WinnerArc screens: original public App Store assets, obtained from https://apps.apple.com/rs/app/winnerarc/id6746265207 on September 6, 2026. A fixed, framed product preview without changing the UI. The surrounding focus ring, completion check and habit marks are an illustrative motion cycle, not live app data.
- Systems, game illustrations and contribution terrain: authored SVG geometry. Game illustrations are conceptual, not screenshots.
- Contribution data: authenticated GitHub GraphQL contributionCalendar for RexDotDev; dated snapshot, 2025-09-07 through 2026-09-06. 7,808 contributions and 290 active days. The terrain is a stylized visualization of exact daily counts, not a claim of productivity or commercial impact.
- Daily refresh: `.github/workflows/profile-visuals.yml`, 03:17 UTC, plus manual dispatch. `scripts/refresh-terrain.py` retrieves the rolling annual GitHub contribution calendar using the repository GITHUB_TOKEN. Only aggregate counts are published. The last successful refresh date is visible; failed fetches leave the previous SVG intact.
- Terrain typography: `scripts/terrain-glyphs.json` contains vector outlines for the required display characters derived from the supplied font; no font binary or runtime font dependency.
- Animation: self-contained CSS/SVG. All SVGs respect prefers-reduced-motion. Hero also offers an explicit still image. No JavaScript, external fonts, tracking, or public analytics tokens.
