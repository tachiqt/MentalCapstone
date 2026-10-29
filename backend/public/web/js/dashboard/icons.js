/** SmartCare Lucide icons (inline) — no Iconify CDN */
(function (SC) {
  const PATHS = {
    'arrow-right': "\u003cpath d=\"M5 12h14\" /\u003e\n  \u003cpath d=\"m12 5 7 7-7 7\" /\u003e",
    'arrow-up-right': "\u003cpath d=\"M7 7h10v10\" /\u003e\n  \u003cpath d=\"M7 17 17 7\" /\u003e",
    'badge-check': "\u003cpath d=\"M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z\" /\u003e\n  \u003cpath d=\"m9 12 2 2 4-4\" /\u003e",
    'ban': "\u003cpath d=\"M4.929 4.929 19.07 19.071\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"12\" r=\"10\" /\u003e",
    'bell': "\u003cpath d=\"M10.268 21a2 2 0 0 0 3.464 0\" /\u003e\n  \u003cpath d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" /\u003e",
    'bell-off': "\u003cpath d=\"M10.268 21a2 2 0 0 0 3.464 0\" /\u003e\n  \u003cpath d=\"M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742\" /\u003e\n  \u003cpath d=\"m2 2 20 20\" /\u003e\n  \u003cpath d=\"M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05\" /\u003e",
    'bell-ring': "\u003cpath d=\"M10.268 21a2 2 0 0 0 3.464 0\" /\u003e\n  \u003cpath d=\"M22 8c0-2.3-.8-4.3-2-6\" /\u003e\n  \u003cpath d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" /\u003e\n  \u003cpath d=\"M4 2C2.8 3.7 2 5.7 2 8\" /\u003e",
    'book-open': "\u003cpath d=\"M12 7v14\" /\u003e\n  \u003cpath d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\" /\u003e",
    'brain': "\u003cpath d=\"M12 18V5\" /\u003e\n  \u003cpath d=\"M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4\" /\u003e\n  \u003cpath d=\"M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5\" /\u003e\n  \u003cpath d=\"M17.997 5.125a4 4 0 0 1 2.526 5.77\" /\u003e\n  \u003cpath d=\"M18 18a4 4 0 0 0 2-7.464\" /\u003e\n  \u003cpath d=\"M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517\" /\u003e\n  \u003cpath d=\"M6 18a4 4 0 0 1-2-7.464\" /\u003e\n  \u003cpath d=\"M6.003 5.125a4 4 0 0 0-2.526 5.77\" /\u003e",
    'building-2': "\u003cpath d=\"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z\" /\u003e\n  \u003cpath d=\"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2\" /\u003e\n  \u003cpath d=\"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2\" /\u003e\n  \u003cpath d=\"M10 6h4\" /\u003e\n  \u003cpath d=\"M10 10h4\" /\u003e\n  \u003cpath d=\"M10 14h4\" /\u003e\n  \u003cpath d=\"M10 18h4\" /\u003e",
    'calendar': "\u003cpath d=\"M8 2v4\" /\u003e\n  \u003cpath d=\"M16 2v4\" /\u003e\n  \u003crect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /\u003e\n  \u003cpath d=\"M3 10h18\" /\u003e",
    'calendar-days': "\u003cpath d=\"M8 2v4\" /\u003e\n  \u003cpath d=\"M16 2v4\" /\u003e\n  \u003crect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /\u003e\n  \u003cpath d=\"M3 10h18\" /\u003e\n  \u003cpath d=\"M8 14h.01\" /\u003e\n  \u003cpath d=\"M12 14h.01\" /\u003e\n  \u003cpath d=\"M16 14h.01\" /\u003e\n  \u003cpath d=\"M8 18h.01\" /\u003e\n  \u003cpath d=\"M12 18h.01\" /\u003e\n  \u003cpath d=\"M16 18h.01\" /\u003e",
    'calendar-plus': "\u003cpath d=\"M16 19h6\" /\u003e\n  \u003cpath d=\"M16 2v4\" /\u003e\n  \u003cpath d=\"M19 16v6\" /\u003e\n  \u003cpath d=\"M21 12.598V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5\" /\u003e\n  \u003cpath d=\"M3 10h18\" /\u003e\n  \u003cpath d=\"M8 2v4\" /\u003e",
    'calendar-x': "\u003cpath d=\"M8 2v4\" /\u003e\n  \u003cpath d=\"M16 2v4\" /\u003e\n  \u003crect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" /\u003e\n  \u003cpath d=\"M3 10h18\" /\u003e\n  \u003cpath d=\"m14 14-4 4\" /\u003e\n  \u003cpath d=\"m10 14 4 4\" /\u003e",
    'check-circle': "\u003cpath d=\"M21.801 10A10 10 0 1 1 17 3.335\" /\u003e\n  \u003cpath d=\"m9 11 3 3L22 4\" /\u003e",
    'check-circle-2': "\u003ccircle cx=\"12\" cy=\"12\" r=\"10\" /\u003e\n  \u003cpath d=\"m9 12 2 2 4-4\" /\u003e",
    'chevron-left': "\u003cpath d=\"m15 18-6-6 6-6\" /\u003e",
    'chevron-right': "\u003cpath d=\"m9 18 6-6-6-6\" /\u003e",
    'chevrons-left': "\u003cpath d=\"m11 17-5-5 5-5\" /\u003e\n  \u003cpath d=\"m18 17-5-5 5-5\" /\u003e",
    'chevrons-right': "\u003cpath d=\"m6 17 5-5-5-5\" /\u003e\n  \u003cpath d=\"m13 17 5-5-5-5\" /\u003e",
    'circle-help': "\u003ccircle cx=\"12\" cy=\"12\" r=\"10\" /\u003e\n  \u003cpath d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\" /\u003e\n  \u003cpath d=\"M12 17h.01\" /\u003e",
    'circle-play': "\u003cpath d=\"M9 9.003a1 1 0 0 1 1.517-.859l4.997 2.997a1 1 0 0 1 0 1.718l-4.997 2.997A1 1 0 0 1 9 14.996z\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"12\" r=\"10\" /\u003e",
    'clipboard-check': "\u003crect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" /\u003e\n  \u003cpath d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" /\u003e\n  \u003cpath d=\"m9 14 2 2 4-4\" /\u003e",
    'clipboard-list': "\u003crect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" /\u003e\n  \u003cpath d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" /\u003e\n  \u003cpath d=\"M12 11h4\" /\u003e\n  \u003cpath d=\"M12 16h4\" /\u003e\n  \u003cpath d=\"M8 11h.01\" /\u003e\n  \u003cpath d=\"M8 16h.01\" /\u003e",
    'clock': "\u003cpath d=\"M12 6v6l4 2\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"12\" r=\"10\" /\u003e",
    'download': "\u003cpath d=\"M12 15V3\" /\u003e\n  \u003cpath d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /\u003e\n  \u003cpath d=\"m7 10 5 5 5-5\" /\u003e",
    'ellipsis': "\u003ccircle cx=\"12\" cy=\"12\" r=\"1\" /\u003e\n  \u003ccircle cx=\"19\" cy=\"12\" r=\"1\" /\u003e\n  \u003ccircle cx=\"5\" cy=\"12\" r=\"1\" /\u003e",
    'ellipsis-vertical': "\u003ccircle cx=\"12\" cy=\"12\" r=\"1\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"5\" r=\"1\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"19\" r=\"1\" /\u003e",
    'eye': "\u003cpath d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"12\" r=\"3\" /\u003e",
    'eye-off': "\u003cpath d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /\u003e\n  \u003cpath d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /\u003e\n  \u003cpath d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /\u003e\n  \u003cpath d=\"m2 2 20 20\" /\u003e",
    'facebook': "\u003cpath d=\"M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z\" /\u003e",
    'file-bar-chart': "\u003cpath d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /\u003e\n  \u003cpath d=\"M14 2v4a2 2 0 0 0 2 2h4\" /\u003e\n  \u003cpath d=\"M8 18v-2\" /\u003e\n  \u003cpath d=\"M12 18v-4\" /\u003e\n  \u003cpath d=\"M16 18v-6\" /\u003e",
    'file-spreadsheet': "\u003cpath d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /\u003e\n  \u003cpath d=\"M14 2v4a2 2 0 0 0 2 2h4\" /\u003e\n  \u003cpath d=\"M8 13h2\" /\u003e\n  \u003cpath d=\"M14 13h2\" /\u003e\n  \u003cpath d=\"M8 17h2\" /\u003e\n  \u003cpath d=\"M14 17h2\" /\u003e",
    'file-text': "\u003cpath d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\" /\u003e\n  \u003cpath d=\"M14 2v4a2 2 0 0 0 2 2h4\" /\u003e\n  \u003cpath d=\"M10 9H8\" /\u003e\n  \u003cpath d=\"M16 13H8\" /\u003e\n  \u003cpath d=\"M16 17H8\" /\u003e",
    'graduation-cap': "\u003cpath d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" /\u003e\n  \u003cpath d=\"M22 10v6\" /\u003e\n  \u003cpath d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" /\u003e",
    'heart': "\u003cpath d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" /\u003e",
    'heart-handshake': "\u003cpath d=\"M19.414 14.414C21 12.828 22 11.5 22 9.5a5.5 5.5 0 0 0-9.591-3.676.6.6 0 0 1-.818.001A5.5 5.5 0 0 0 2 9.5c0 2.3 1.5 4 3 5.5l5.535 5.362a2 2 0 0 0 2.879.052 2.12 2.12 0 0 0-.004-3 2.124 2.124 0 1 0 3-3 2.124 2.124 0 0 0 3.004 0 2 2 0 0 0 0-2.828l-1.881-1.882a2.41 2.41 0 0 0-3.409 0l-1.71 1.71a2 2 0 0 1-2.828 0 2 2 0 0 1 0-2.828l2.823-2.762\" /\u003e",
    'id-card': "\u003cpath d=\"M16 10h2\" /\u003e\n  \u003cpath d=\"M16 14h2\" /\u003e\n  \u003cpath d=\"M6.17 15a3 3 0 0 1 5.66 0\" /\u003e\n  \u003ccircle cx=\"9\" cy=\"11\" r=\"2\" /\u003e\n  \u003crect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\" /\u003e",
    'info': "\u003ccircle cx=\"12\" cy=\"12\" r=\"10\" /\u003e\n  \u003cpath d=\"M12 16v-4\" /\u003e\n  \u003cpath d=\"M12 8h.01\" /\u003e",
    'key-round': "\u003cpath d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\" /\u003e\n  \u003ccircle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" /\u003e",
    'layout-dashboard': "\u003crect width=\"7\" height=\"9\" x=\"3\" y=\"3\" rx=\"1\" /\u003e\n  \u003crect width=\"7\" height=\"5\" x=\"14\" y=\"3\" rx=\"1\" /\u003e\n  \u003crect width=\"7\" height=\"9\" x=\"14\" y=\"12\" rx=\"1\" /\u003e\n  \u003crect width=\"7\" height=\"5\" x=\"3\" y=\"16\" rx=\"1\" /\u003e",
    'list': "\u003cpath d=\"M3 5h.01\" /\u003e\n  \u003cpath d=\"M3 12h.01\" /\u003e\n  \u003cpath d=\"M3 19h.01\" /\u003e\n  \u003cpath d=\"M8 5h13\" /\u003e\n  \u003cpath d=\"M8 12h13\" /\u003e\n  \u003cpath d=\"M8 19h13\" /\u003e",
    'list-checks': "\u003cpath d=\"M13 5h8\" /\u003e\n  \u003cpath d=\"M13 12h8\" /\u003e\n  \u003cpath d=\"M13 19h8\" /\u003e\n  \u003cpath d=\"m3 17 2 2 4-4\" /\u003e\n  \u003cpath d=\"m3 7 2 2 4-4\" /\u003e",
    'list-plus': "\u003cpath d=\"M16 5H3\" /\u003e\n  \u003cpath d=\"M11 12H3\" /\u003e\n  \u003cpath d=\"M16 19H3\" /\u003e\n  \u003cpath d=\"M18 9v6\" /\u003e\n  \u003cpath d=\"M21 12h-6\" /\u003e",
    'lock': "\u003crect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\" /\u003e\n  \u003cpath d=\"M7 11V7a5 5 0 0 1 10 0v4\" /\u003e",
    'log-out': "\u003cpath d=\"m16 17 5-5-5-5\" /\u003e\n  \u003cpath d=\"M21 12H9\" /\u003e\n  \u003cpath d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\" /\u003e",
    'mail': "\u003cpath d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\" /\u003e\n  \u003crect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\" /\u003e",
    'mail-check': "\u003cpath d=\"M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h8\" /\u003e\n  \u003cpath d=\"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7\" /\u003e\n  \u003cpath d=\"m16 19 2 2 4-4\" /\u003e",
    'map-pin': "\u003cpath d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"10\" r=\"3\" /\u003e",
    'menu': "\u003cpath d=\"M4 5h16\" /\u003e\n  \u003cpath d=\"M4 12h16\" /\u003e\n  \u003cpath d=\"M4 19h16\" /\u003e",
    'monitor-smartphone': "\u003cpath d=\"M18 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h8\" /\u003e\n  \u003cpath d=\"M10 19v-3.96 3.15\" /\u003e\n  \u003cpath d=\"M7 19h5\" /\u003e\n  \u003crect width=\"6\" height=\"10\" x=\"16\" y=\"12\" rx=\"2\" /\u003e",
    'pencil': "\u003cpath d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" /\u003e\n  \u003cpath d=\"m15 5 4 4\" /\u003e",
    'pill': "\u003cpath d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\" /\u003e\n  \u003cpath d=\"m8.5 8.5 7 7\" /\u003e",
    'scale': "\u003cpath d=\"m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z\" /\u003e\n  \u003cpath d=\"m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z\" /\u003e\n  \u003cpath d=\"M7 21h10\" /\u003e\n  \u003cpath d=\"M12 3v18\" /\u003e\n  \u003cpath d=\"M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2\" /\u003e",
    'search': "\u003cpath d=\"m21 21-4.34-4.34\" /\u003e\n  \u003ccircle cx=\"11\" cy=\"11\" r=\"8\" /\u003e",
    'send': "\u003cpath d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\" /\u003e\n  \u003cpath d=\"m21.854 2.147-10.94 10.939\" /\u003e",
    'settings': "\u003cpath d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"12\" r=\"3\" /\u003e",
    'settings-2': "\u003cpath d=\"M14 17H5\" /\u003e\n  \u003cpath d=\"M19 7h-9\" /\u003e\n  \u003ccircle cx=\"17\" cy=\"17\" r=\"3\" /\u003e\n  \u003ccircle cx=\"7\" cy=\"7\" r=\"3\" /\u003e",
    'shield': "\u003cpath d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /\u003e",
    'shield-check': "\u003cpath d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" /\u003e\n  \u003cpath d=\"m9 12 2 2 4-4\" /\u003e",
    'sliders-horizontal': "\u003cpath d=\"M10 5H3\" /\u003e\n  \u003cpath d=\"M12 19H3\" /\u003e\n  \u003cpath d=\"M14 3v4\" /\u003e\n  \u003cpath d=\"M16 17v4\" /\u003e\n  \u003cpath d=\"M21 12h-9\" /\u003e\n  \u003cpath d=\"M21 19h-5\" /\u003e\n  \u003cpath d=\"M21 5h-7\" /\u003e\n  \u003cpath d=\"M8 10v4\" /\u003e\n  \u003cpath d=\"M8 12H3\" /\u003e",
    'sparkles': "\u003cpath d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" /\u003e\n  \u003cpath d=\"M20 2v4\" /\u003e\n  \u003cpath d=\"M22 4h-4\" /\u003e\n  \u003ccircle cx=\"4\" cy=\"20\" r=\"2\" /\u003e",
    'stethoscope': "\u003cpath d=\"M11 2v2\" /\u003e\n  \u003cpath d=\"M5 2v2\" /\u003e\n  \u003cpath d=\"M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\" /\u003e\n  \u003cpath d=\"M8 15a6 6 0 0 0 12 0v-3\" /\u003e\n  \u003ccircle cx=\"20\" cy=\"10\" r=\"2\" /\u003e",
    'trash-2': "\u003cpath d=\"M10 11v6\" /\u003e\n  \u003cpath d=\"M14 11v6\" /\u003e\n  \u003cpath d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" /\u003e\n  \u003cpath d=\"M3 6h18\" /\u003e\n  \u003cpath d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" /\u003e",
    'trending-up': "\u003cpath d=\"M16 7h6v6\" /\u003e\n  \u003cpath d=\"m22 7-8.5 8.5-5-5L2 17\" /\u003e",
    'user': "\u003cpath d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\" /\u003e\n  \u003ccircle cx=\"12\" cy=\"7\" r=\"4\" /\u003e",
    'user-check': "\u003cpath d=\"m16 11 2 2 4-4\" /\u003e\n  \u003cpath d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /\u003e\n  \u003ccircle cx=\"9\" cy=\"7\" r=\"4\" /\u003e",
    'user-cog': "\u003cpath d=\"M10 15H6a4 4 0 0 0-4 4v2\" /\u003e\n  \u003cpath d=\"m14.305 16.53.923-.382\" /\u003e\n  \u003cpath d=\"m15.228 13.852-.923-.383\" /\u003e\n  \u003cpath d=\"m16.852 12.228-.383-.923\" /\u003e\n  \u003cpath d=\"m16.852 17.772-.383.924\" /\u003e\n  \u003cpath d=\"m19.148 12.228.383-.923\" /\u003e\n  \u003cpath d=\"m19.53 18.696-.382-.924\" /\u003e\n  \u003cpath d=\"m20.772 13.852.924-.383\" /\u003e\n  \u003cpath d=\"m20.772 16.148.924.383\" /\u003e\n  \u003ccircle cx=\"18\" cy=\"15\" r=\"3\" /\u003e\n  \u003ccircle cx=\"9\" cy=\"7\" r=\"4\" /\u003e",
    'user-plus': "\u003cpath d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /\u003e\n  \u003ccircle cx=\"9\" cy=\"7\" r=\"4\" /\u003e\n  \u003cline x1=\"19\" x2=\"19\" y1=\"8\" y2=\"14\" /\u003e\n  \u003cline x1=\"22\" x2=\"16\" y1=\"11\" y2=\"11\" /\u003e",
    'user-round': "\u003ccircle cx=\"12\" cy=\"8\" r=\"5\" /\u003e\n  \u003cpath d=\"M20 21a8 8 0 0 0-16 0\" /\u003e",
    'users': "\u003cpath d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /\u003e\n  \u003cpath d=\"M16 3.128a4 4 0 0 1 0 7.744\" /\u003e\n  \u003cpath d=\"M22 21v-2a4 4 0 0 0-3-3.87\" /\u003e\n  \u003ccircle cx=\"9\" cy=\"7\" r=\"4\" /\u003e",
    'users-round': "\u003cpath d=\"M18 21a8 8 0 0 0-16 0\" /\u003e\n  \u003ccircle cx=\"10\" cy=\"8\" r=\"5\" /\u003e\n  \u003cpath d=\"M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3\" /\u003e",
    'x': "\u003cpath d=\"M18 6 6 18\" /\u003e\n  \u003cpath d=\"m6 6 12 12\" /\u003e",
    'circle-off': "\u003cpath d=\"m2 2 20 20\" /\u003e\n  \u003cpath d=\"M8.35 2.69A10 10 0 0 1 21.3 15.65\" /\u003e\n  \u003cpath d=\"M19.08 19.08A10 10 0 1 1 4.92 4.92\" /\u003e",
    'rotate-ccw': "\u003cpath d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /\u003e\n  \u003cpath d=\"M3 3v5h5\" /\u003e",
  };

  SC.iconPaths = PATHS;

  SC.icon = function (name, opts) {
    const o = opts || {};
    const size = Number(o.size) || 16;
    const inner = PATHS[name];
    if (!inner) return '';
    const cls = ['sc-icon', o.className || ''].filter(Boolean).join(' ');
    const stroke = o.strokeWidth || 2;
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  };

  SC.iconImgTag = function (name, opts) {
    // Compatibility helper for places that still expect an <img>-like slot.
    return SC.icon(name, opts);
  };

  function iconNameFromSrc(src) {
    if (!src) return '';
    const m = String(src).match(/lucide\/([a-z0-9-]+)\.svg/i);
    return m ? m[1] : '';
  }

  SC.replaceIconifyImg = function (img) {
    if (!img || img.dataset.scIconized === '1') return false;
    const name = iconNameFromSrc(img.getAttribute('src') || img.src || '');
    if (!name || !PATHS[name]) return false;
    const size = parseInt(img.getAttribute('width') || img.getAttribute('height') || '16', 10) || 16;
    const svgHtml = SC.icon(name, { size, className: img.className || '' });
    if (!svgHtml) return false;
    const holder = document.createElement('template');
    holder.innerHTML = svgHtml.trim();
    const node = holder.content.firstChild;
    if (!node) return false;
    node.dataset.scIconized = '1';
    if (img.id) node.id = img.id;
    if (img.getAttribute('alt') != null) node.setAttribute('aria-label', img.getAttribute('alt') || '');
    img.replaceWith(node);
    return true;
  };

  SC.hydrateIcons = function (root) {
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('img[src*="api.iconify.design/lucide/"]').forEach((img) => {
      SC.replaceIconifyImg(img);
    });
  };

  let observing = false;
  SC.watchIcons = function () {
    if (observing || typeof MutationObserver === 'undefined') return;
    observing = true;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.target?.tagName === 'IMG') {
          SC.replaceIconifyImg(m.target);
          continue;
        }
        m.addedNodes && m.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.tagName === 'IMG') SC.replaceIconifyImg(node);
          else if (node.querySelectorAll) SC.hydrateIcons(node);
        });
      }
    });
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src'],
    });
  };

  function bootIcons() {
    SC.hydrateIcons(document);
    SC.watchIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootIcons);
  } else {
    bootIcons();
  }
})(window.SmartCareApp = window.SmartCareApp || {});
