// Site configuration (facts that are not language-specific).
window.SITE_CONFIG = {
  // Apps Script web app URL (ends in /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbzAAHrGr8fBEqEKkyWXjk_OAADRufEjQwkmS1sZpnMq9hV3OuA9vNS4tCM-kTxz3lVJhw/exec',

  // Wedding date, YYYY-MM-DD. Shown localised: "sobota, 19. junij 2027" / "Saturday, 19 June 2027".
  WEDDING_DATE: '2027-06-19',

  VENUE_MAP_URL: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Villa Paradiso d\'Istria, Kućibreg 3, 52462 Kućibreg, Croatia'),

  CONTACT_EMAIL: 'sabinadomensmuc@gmail.com',

  // Timetable (24h). "label" is a key in js/i18n.js, so each line exists in SL and EN.
  TIMETABLE: [
    { time: '13:00', label: 'tt_arrival' },
    { time: '14:00', label: 'tt_ceremony' },
    { time: '14:45', label: 'tt_toast' },
    { time: '15:30', label: 'tt_aperitivo' },
    { time: '18:00', label: 'tt_dinner' },
    { time: '20:30', label: 'tt_party' },
    { time: '22:00', label: 'tt_cake' },
    { time: '00:00', label: 'tt_dj_end' },
    { time: '03:00', label: 'tt_end' }
  ],

  // Villa photo, e.g. 'images/villa.jpg'. Leave empty until we have photos we are allowed to use – the photo frame is hidden while empty.
  PHOTO_URL: ''
};
