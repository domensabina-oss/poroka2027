// Site configuration (facts that are not language-specific).
window.SITE_CONFIG = {
  // Apps Script web app URL (ends in /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbzAAHrGr8fBEqEKkyWXjk_OAADRufEjQwkmS1sZpnMq9hV3OuA9vNS4tCM-kTxz3lVJhw/exec',

  // Wedding date, YYYY-MM-DD. Shown localised: "sobota, 19. junij 2027" / "Saturday, 19 June 2027".
  WEDDING_DATE: '2027-06-19',

  VENUE_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Villa Paradiso d\'Istria, Kućibreg 3, 52462 Kućibreg, Croatia'),

  // Recommended route from Ljubljana (via the Črni Kal exit and Belvedur) as a Google Maps directions link.
  ROUTE_MAP_URL: 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent('Ljubljana, Slovenia') +
    '&destination=' + encodeURIComponent('Kućibreg 3, 52462 Kućibreg, Croatia') +
    '&waypoints=' + encodeURIComponent('Belvedur, Koper, Slovenia') + '&travelmode=driving',

  CONTACT_EMAIL: 'sabinadomensmuc@gmail.com',

  // Programme highlights (24h). "title" (catchphrase) and "label" (plain description) are keys in js/i18n.js, so each line exists in SL and EN.
  TIMETABLE: [
    { time: '13:00', title: 'tt_t_arrival',  label: 'tt_arrival' },
    { time: '15:00', title: 'tt_t_ceremony', label: 'tt_ceremony' },
    { time: '18:00', title: 'tt_t_dinner',   label: 'tt_dinner' },
    { time: '20:30', title: 'tt_t_party',    label: 'tt_party' },
    { time: '22:00', title: 'tt_t_cake',     label: 'tt_cake' },
    { time: '00:00', title: 'tt_t_end',      label: 'tt_end' }
  ],

  // Villa photo, e.g. 'images/villa.jpg'. Leave empty until we have photos we are allowed to use – the photo frame is hidden while empty.
  PHOTO_URL: ''
};
