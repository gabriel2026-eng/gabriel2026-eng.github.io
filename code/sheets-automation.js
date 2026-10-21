/**
 * ORDER AUTOMATION: Google Form -> sheet -> emails -> status
 * ==========================================================
 * Portfolio demo, for a fictional company ("Oak & Form Woodworks").
 *
 * What it does, for every new order submitted through the Google Form:
 *   1. reads the answers from the form and checks the data (valid email, quantity, product);
 *   2. calculates the total from the "Products" sheet and gives the order a number (CMD-0001, CMD-0002...);
 *   3. adds a clean row to the "Orders" sheet, with the status "New" (or "To check", if something is wrong);
 *   4. sends the customer a confirmation email with the order summary;
 *   5. sends the owner a notification, with a direct link to the row;
 *   6. marks in the sheet that both emails went out (✔ and the date).
 * In addition: an "Orders" menu for changing the status, automatic colors per status and a daily summary
 * of the "New" orders that have been waiting too long.
 *
 * Installation (details in README.md):
 *   Extensions -> Apps Script -> paste this code -> fill in SETARI -> run configureazaFoaia(),
 *   then instaleazaTriggere() and, finally, testeazaFluxul().
 *
 * Nothing in this code contains passwords or keys. It runs in the client's own Google account;
 * the data of their customers does not reach anyone else.
 */

// ==========================================================================
// 1. SETTINGS: the only place you edit for a new company
// ==========================================================================
const SETARI = {
  numeFirma: 'Oak & Form Woodworks',
  emailProprietar: 'owner@example.example', // Notifications arrive HERE. Put the real address.
  emailRaspuns: '',            // optional: the address the customer replies to (if empty, your own account is used)
  telefonFirma: '0700 000 000',
  moneda: 'lei',
  prefixComanda: 'CMD',
  fusOrar: 'Europe/Bucharest',
  foaieComenzi: 'Orders',      // the clean sheet, with one order per row
  foaieProduse: 'Products',    // the product list with prices; the client can edit it without touching the code
  oreReminder: 24,             // a "New" order older than this many hours appears in the daily summary
  oraRezumat: 8,               // the hour at which the daily summary is sent
  trimiteEmailuri: true        // set to false to test without sending any email
};

// The question titles in the Google Form. They must be IDENTICAL to the ones in the form.
const CAMPURI = {
  nume: 'Full name',
  email: 'Email',
  telefon: 'Phone',
  produs: 'Product',
  cantitate: 'Quantity',
  adresa: 'Delivery address',
  observatii: 'Notes'
};

// The column number of each field in the "Orders" sheet
const COL = {
  nr: 1, data: 2, nume: 3, email: 4, telefon: 5, produs: 6, cantitate: 7,
  total: 8, adresa: 9, observatii: 10, stare: 11, confirmare: 12, notificare: 13
};

const STARI = {
  NOUA: 'New',
  IN_LUCRU: 'In progress',
  LIVRATA: 'Delivered',
  ANULATA: 'Cancelled',
  DE_VERIFICAT: 'To check'
};

const CULORI_STARE = {
  'New': '#fff2cc',
  'In progress': '#cfe2f3',
  'Delivered': '#d9ead3',
  'Cancelled': '#f4cccc',
  'To check': '#fce5cd'
};

// Products placed in the "Products" sheet at the first setup (the client replaces them with their own)
const PRODUSE_EXEMPLU = [
  ['Oak cutting board', 120, 3],
  ['Ash plant stand', 95, 3],
  ['Set of 4 wooden plates', 160, 5],
  ['Walnut wall shelf', 280, 7],
  ['Storage box with lid', 210, 5],
  ['Oak coffee table', 640, 15]
];

const EMAIL_VALID = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_CANTITATE = 999;

// ==========================================================================
// 2. MAIN FLOW (runs by itself for every order from the form)
// ==========================================================================

/**
 * Installed trigger: "On form submit". It is created by instaleazaTriggere().
 * @param {Object} e The event provided by Google; e.namedValues holds the answers, keyed by question title.
 */
function onFormSubmit(e) {
  if (!e || !e.namedValues) {
    Logger.log('onFormSubmit is run only by the form. For a test, run testeazaFluxul().');
    return;
  }
  // Two customers can submit almost at the same time: the lock prevents two orders from getting the same number.
  const lacat = LockService.getScriptLock();
  lacat.waitLock(30000);
  try {
    proceseazaComanda_(extrageComanda_(e.namedValues));
  } catch (eroare) {
    // If something breaks, the owner finds out immediately; the answer stays in the form's response sheet anyway.
    raporteazaEroare_(eroare, e.namedValues);
  } finally {
    lacat.releaseLock();
  }
}

/**
 * The order steps, in sequence. Both onFormSubmit and testeazaFluxul use it.
 * @param {Object} c The order extracted from the form (see extrageComanda_).
 * @return {{rand: number, comanda: Object}} The new row and the completed order.
 */
function proceseazaComanda_(c) {
  const foaie = foaieComenzi_();

  verificaComanda_(c);                       // fills in c.probleme
  calculeazaTotal_(c);                       // fills in c.pretUnitar, c.total, c.termenZile
  c.nr = genereazaNumarComanda_(foaie);
  c.data = new Date();
  const stare = c.probleme.length ? STARI.DE_VERIFICAT : STARI.NOUA;

  const rand = adaugaRand_(foaie, c, stare); // the row appears in the sheet before the emails go out

  const confirmare = trimiteConfirmareClient_(c);
  foaie.getRange(rand, COL.confirmare).setValue(confirmare.mesaj);

  const notificare = trimiteNotificareProprietar_(c, foaie, rand);
  foaie.getRange(rand, COL.notificare).setValue(notificare.mesaj);

  return { rand: rand, comanda: c };
}

/** Turns the form answers into a plain object. */
function extrageComanda_(namedValues) {
  const citeste = function (titlu) {
    const v = namedValues[titlu];
    return v && v.length ? String(v[0]).trim() : '';
  };
  return {
    nume: citeste(CAMPURI.nume),
    email: citeste(CAMPURI.email).toLowerCase(),
    telefon: citeste(CAMPURI.telefon),
    produs: citeste(CAMPURI.produs),
    cantitate: citeste(CAMPURI.cantitate),
    adresa: citeste(CAMPURI.adresa),
    observatii: citeste(CAMPURI.observatii),
    probleme: []
  };
}

/** Checks the data and records in c.probleme everything a person needs to look at. Does not throw errors. */
function verificaComanda_(c) {
  if (!c.nume) c.probleme.push('customer name is missing');
  if (!EMAIL_VALID.test(c.email)) c.probleme.push('email missing or invalid, the customer cannot receive the confirmation');
  if (!c.adresa) c.probleme.push('delivery address is missing');

  const cantitate = Number(String(c.cantitate).replace(',', '.'));
  if (!Number.isInteger(cantitate) || cantitate < 1 || cantitate > MAX_CANTITATE) {
    c.probleme.push('invalid quantity: "' + c.cantitate + '"');
    c.cantitate = '';
  } else {
    c.cantitate = cantitate;
  }
}

/** Looks the product up in the "Products" sheet and calculates the total. */
function calculeazaTotal_(c) {
  c.pretUnitar = null;
  c.total = '';
  c.termenZile = null;

  const produs = cautaProdus_(c.produs);
  if (!produs) {
    c.probleme.push('unknown product in the "' + SETARI.foaieProduse + '" sheet: "' + c.produs + '"');
    return;
  }
  c.produs = produs.nume;                    // the exact name, as it appears in the catalog
  c.pretUnitar = produs.pret;
  c.termenZile = produs.termenZile;
  if (c.cantitate !== '') c.total = produs.pret * c.cantitate;
}

/** Reads the "Products" sheet (A: name, B: price, C: lead time in working days) and looks up a product. */
function cautaProdus_(nume) {
  const foaie = SpreadsheetApp.getActive().getSheetByName(SETARI.foaieProduse);
  if (!foaie || foaie.getLastRow() < 2 || !nume) return null;
  const date = foaie.getRange(2, 1, foaie.getLastRow() - 1, 3).getValues();
  const cautat = nume.trim().toLowerCase();
  for (let i = 0; i < date.length; i++) {
    if (String(date[i][0]).trim().toLowerCase() === cautat) {
      const pret = Number(date[i][1]);
      if (!isFinite(pret)) return null;
      return { nume: String(date[i][0]).trim(), pret: pret, termenZile: Number(date[i][2]) || null };
    }
  }
  return null;
}

/** The next order number: CMD-0001, CMD-0002... It is based on the highest number in the sheet. */
function genereazaNumarComanda_(foaie) {
  let maxim = 0;
  if (foaie.getLastRow() > 1) {
    const numere = foaie.getRange(2, COL.nr, foaie.getLastRow() - 1, 1).getValues();
    numere.forEach(function (rand) {
      const m = /(\d+)\s*$/.exec(String(rand[0]));
      if (m) maxim = Math.max(maxim, parseInt(m[1], 10));
    });
  }
  return SETARI.prefixComanda + '-' + String(maxim + 1).padStart(4, '0');
}

/** Adds the order as a new row and returns the row number. */
function adaugaRand_(foaie, c, stare) {
  const rand = foaie.getLastRow() + 1;
  const valori = [[
    c.nr, c.data, c.nume, c.email, c.telefon, c.produs, c.cantitate,
    c.total, c.adresa, c.observatii, stare, '', ''
  ]];
  foaie.getRange(rand, 1, 1, valori[0].length).setValues(valori);
  foaie.getRange(rand, COL.data).setNumberFormat('dd.mm.yyyy hh:mm');
  foaie.getRange(rand, COL.total).setNumberFormat('#,##0.00');
  if (c.probleme.length) {
    foaie.getRange(rand, COL.stare).setNote('To check: ' + c.probleme.join('; '));
  }
  return rand;
}

// ==========================================================================
// 3. EMAILS
// ==========================================================================

/** The confirmation email to the customer. Returns {trimis, mesaj}; mesaj goes into the sheet, under "Customer confirmation". */
function trimiteConfirmareClient_(c) {
  if (!EMAIL_VALID.test(c.email)) {
    return { trimis: false, mesaj: '✖ not sent: email missing or invalid' };
  }
  if (!SETARI.trimiteEmailuri) {
    return { trimis: false, mesaj: '– disabled in SETARI' };
  }
  const email = construiesteEmailClient_(c);
  const optiuni = { to: c.email, subject: email.subiect, body: email.text, htmlBody: email.html, name: SETARI.numeFirma };
  if (SETARI.emailRaspuns) optiuni.replyTo = SETARI.emailRaspuns;
  try {
    MailApp.sendEmail(optiuni);
    return { trimis: true, mesaj: '✔ ' + formateazaData_(new Date()) };
  } catch (eroare) {
    return { trimis: false, mesaj: '✖ send error: ' + eroare.message };
  }
}

/** Builds the subject and body of the email (plain text and HTML). */
function construiesteEmailClient_(c) {
  const arePret = c.total !== '' && c.total !== null && c.total !== undefined;
  const rezumat = [
    ['Order', c.nr],
    ['Product', c.produs + (c.cantitate !== '' ? ' × ' + c.cantitate : '')]
  ];
  if (arePret) rezumat.push(['Total', formateazaSuma_(c.total) + ' ' + SETARI.moneda]);
  if (c.termenZile) {
    rezumat.push(['Estimated delivery time', c.termenZile + ' working days (around ' +
      Utilities.formatDate(adaugaZileLucratoare_(new Date(), c.termenZile), SETARI.fusOrar, 'dd.MM.yyyy') + ')']);
  }
  if (c.adresa) rezumat.push(['Delivery address', c.adresa]);

  const salut = 'Hello ' + (c.nume || 'there') + ',';
  const intro = 'We have received your order and are getting it ready.';
  const dacaLipseste = arePret ? '' :
    'We will confirm the exact price and delivery time separately, within one working day at the latest.';
  const final = 'If anything is not correct, reply to this email or call us at ' + SETARI.telefonFirma + '.';
  const semnatura = 'Thank you,\n' + SETARI.numeFirma;

  const text = [salut, '', intro, '', rezumat.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n'), '']
    .concat(dacaLipseste ? [dacaLipseste, ''] : [])
    .concat([final, '', semnatura]).join('\n');

  const randuri = rezumat.map(function (r) {
    return '<tr><td style="padding:6px 16px 6px 0;color:#6a5a4c">' + esc_(r[0]) + '</td>' +
      '<td style="padding:6px 0"><strong>' + esc_(r[1]) + '</strong></td></tr>';
  }).join('');
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#2b2018;max-width:520px">' +
    '<p>' + esc_(salut) + '</p><p>' + esc_(intro) + '</p>' +
    '<table style="border-collapse:collapse;margin:12px 0">' + randuri + '</table>' +
    (dacaLipseste ? '<p>' + esc_(dacaLipseste) + '</p>' : '') +
    '<p>' + esc_(final) + '</p><p>Thank you,<br>' + esc_(SETARI.numeFirma) + '</p></div>';

  return { subiect: 'We received your order ' + c.nr + ' | ' + SETARI.numeFirma, text: text, html: html };
}

/** The notification to the owner, with a direct link to the row in the sheet. */
function trimiteNotificareProprietar_(c, foaie, rand) {
  if (!SETARI.trimiteEmailuri) {
    return { trimis: false, mesaj: '– disabled in SETARI' };
  }
  const link = SpreadsheetApp.getActive().getUrl() + '#gid=' + foaie.getSheetId() + '&range=A' + rand;
  const total = c.total !== '' ? formateazaSuma_(c.total) + ' ' + SETARI.moneda : 'not calculated';
  const linii = [
    'New order: ' + c.nr,
    '',
    'Customer: ' + c.nume + ' · ' + c.email + (c.telefon ? ' · ' + c.telefon : ''),
    'Product: ' + c.produs + (c.cantitate !== '' ? ' × ' + c.cantitate : ''),
    'Total: ' + total,
    'Delivery: ' + (c.adresa || '(missing)')
  ];
  if (c.observatii) linii.push('Notes: ' + c.observatii);
  if (c.probleme.length) {
    linii.push('', '⚠ TO CHECK: ' + c.probleme.join('; '));
  }
  linii.push('', 'Open the row in the sheet: ' + link);

  const subiect = (c.probleme.length ? '[To check] ' : '[New order] ') +
    c.nr + ' · ' + (c.nume || 'unknown customer') + (c.total !== '' ? ' · ' + formateazaSuma_(c.total) + ' ' + SETARI.moneda : '');
  try {
    MailApp.sendEmail({ to: SETARI.emailProprietar, subject: subiect, body: linii.join('\n'), name: SETARI.numeFirma });
    return { trimis: true, mesaj: '✔ ' + formateazaData_(new Date()) };
  } catch (eroare) {
    return { trimis: false, mesaj: '✖ send error: ' + eroare.message };
  }
}

/** If the flow stops halfway, the owner receives the raw data so that the order is not lost. */
function raporteazaEroare_(eroare, namedValues) {
  console.error(eroare);
  try {
    const date = Object.keys(namedValues).map(function (k) { return k + ': ' + namedValues[k].join(', '); });
    MailApp.sendEmail({
      to: SETARI.emailProprietar,
      subject: '[Error] The order automation has stopped',
      body: 'An error occurred while processing an order:\n' + eroare.message +
        '\n\nThe form response (you can also find it in the responses sheet):\n' + date.join('\n'),
      name: SETARI.numeFirma
    });
  } catch (_) { /* if the email does not work either, the record in Executions remains */ }
}

// ==========================================================================
// 4. STATUS AND MENU
// ==========================================================================

/** Adds the "Orders" menu when the spreadsheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📦 Orders')
    .addItem('Mark as: In progress', 'marcheazaInLucru')
    .addItem('Mark as: Delivered', 'marcheazaLivrata')
    .addItem('Mark as: Cancelled', 'marcheazaAnulata')
    .addSeparator()
    .addItem('Resend the customer confirmation', 'retrimiteConfirmarea')
    .addItem('Send the new-orders summary now', 'reminderComenziNoi')
    .addSeparator()
    .addItem('Set up the sheets (first time)', 'configureazaFoaia')
    .addItem('Install the triggers', 'instaleazaTriggere')
    .addItem('Test the flow', 'testeazaFluxul')
    .addToUi();
}

function marcheazaInLucru() { marcheazaSelectia_(STARI.IN_LUCRU); }
function marcheazaLivrata() { marcheazaSelectia_(STARI.LIVRATA); }
function marcheazaAnulata() { marcheazaSelectia_(STARI.ANULATA); }

/** Sets the requested status on all selected rows of the "Orders" sheet. The color comes from conditional formatting. */
function marcheazaSelectia_(stare) {
  const foaie = SpreadsheetApp.getActiveSheet();
  if (foaie.getName() !== SETARI.foaieComenzi) {
    SpreadsheetApp.getUi().alert('First select the rows in the "' + SETARI.foaieComenzi + '" sheet.');
    return;
  }
  const selectie = foaie.getActiveRange();
  const primul = Math.max(selectie.getRow(), 2);   // row 1 is the header
  const ultimul = Math.min(selectie.getLastRow(), foaie.getLastRow());
  if (ultimul < primul) return;
  foaie.getRange(primul, COL.stare, ultimul - primul + 1, 1).clearNote().setValue(stare);
  SpreadsheetApp.getActive().toast((ultimul - primul + 1) + ' order(s) marked: ' + stare);
}

/** Resends the confirmation email for the selected row (for example after the customer has corrected their email address). */
function retrimiteConfirmarea() {
  const foaie = SpreadsheetApp.getActiveSheet();
  const rand = foaie.getActiveRange().getRow();
  if (foaie.getName() !== SETARI.foaieComenzi || rand < 2) {
    SpreadsheetApp.getUi().alert('Select a row in the "' + SETARI.foaieComenzi + '" sheet.');
    return;
  }
  const v = foaie.getRange(rand, 1, 1, COL.notificare).getValues()[0];
  const c = {
    nr: v[COL.nr - 1], nume: String(v[COL.nume - 1]), email: String(v[COL.email - 1]).trim().toLowerCase(),
    produs: String(v[COL.produs - 1]), cantitate: v[COL.cantitate - 1], total: v[COL.total - 1],
    adresa: String(v[COL.adresa - 1]), probleme: []
  };
  const produs = cautaProdus_(c.produs);
  c.termenZile = produs ? produs.termenZile : null;
  const rezultat = trimiteConfirmareClient_(c);
  foaie.getRange(rand, COL.confirmare).setValue(rezultat.mesaj);
  SpreadsheetApp.getActive().toast(rezultat.mesaj);
}

/** Daily summary: the "New" orders that have been waiting for more than SETARI.oreReminder hours. Runs by itself, in the morning. */
function reminderComenziNoi() {
  const foaie = foaieComenzi_();
  if (foaie.getLastRow() < 2) return;
  const date = foaie.getRange(2, 1, foaie.getLastRow() - 1, COL.stare).getValues();
  const acum = new Date();
  const restante = [];
  date.forEach(function (rand) {
    if (rand[COL.stare - 1] !== STARI.NOUA) return;
    const primita = rand[COL.data - 1] instanceof Date ? rand[COL.data - 1] : new Date(rand[COL.data - 1]);
    if (isNaN(primita.getTime())) return;
    const ore = (acum - primita) / 3600000;
    if (ore >= SETARI.oreReminder) {
      restante.push({ ore: ore, text: rand[COL.nr - 1] + ' · ' + rand[COL.nume - 1] + ' · ' + rand[COL.produs - 1] +
        ' × ' + rand[COL.cantitate - 1] + ' · waiting for ' + descrieDurata_(ore) });
    }
  });
  if (!restante.length || !SETARI.trimiteEmailuri) return;
  restante.sort(function (a, b) { return b.ore - a.ore; });
  MailApp.sendEmail({
    to: SETARI.emailProprietar,
    subject: restante.length + ' new order(s) waiting for a reply',
    body: 'Orders with the status "New" for more than ' + SETARI.oreReminder + ' hours:\n\n' +
      restante.map(function (r) { return '• ' + r.text; }).join('\n') +
      '\n\nOpen the sheet: ' + SpreadsheetApp.getActive().getUrl(),
    name: SETARI.numeFirma
  });
}

// ==========================================================================
// 5. INSTALLATION AND TEST (run only once)
// ==========================================================================

/** Creates the "Orders" and "Products" sheets, with header, status list and status colors. Can be run again without harm. */
function configureazaFoaia() {
  const ss = SpreadsheetApp.getActive();

  const produse = ss.getSheetByName(SETARI.foaieProduse) || ss.insertSheet(SETARI.foaieProduse);
  if (produse.getLastRow() === 0) {
    produse.getRange(1, 1, 1, 3).setValues([['Product', 'Unit price (' + SETARI.moneda + ')', 'Lead time (working days)']])
      .setFontWeight('bold').setBackground('#2b2018').setFontColor('#ffffff');
    produse.getRange(2, 1, PRODUSE_EXEMPLU.length, 3).setValues(PRODUSE_EXEMPLU);
    produse.setFrozenRows(1);
    produse.setColumnWidth(1, 260);
    produse.setColumnWidth(2, 140);
    produse.setColumnWidth(3, 180);
  }

  const foaie = ss.getSheetByName(SETARI.foaieComenzi) || ss.insertSheet(SETARI.foaieComenzi);
  const antet = ['Order no.', 'Date received', 'Customer name', 'Email', 'Phone', 'Product', 'Quantity',
    'Total (' + SETARI.moneda + ')', 'Delivery address', 'Notes', 'Status', 'Customer confirmation', 'Owner notification'];
  foaie.getRange(1, 1, 1, antet.length).setValues([antet])
    .setFontWeight('bold').setBackground('#2b2018').setFontColor('#ffffff').setVerticalAlignment('middle');
  foaie.setFrozenRows(1);
  [110, 130, 180, 220, 120, 220, 80, 100, 260, 220, 110, 170, 170].forEach(function (latime, i) {
    foaie.setColumnWidth(i + 1, latime);
  });

  // The status list (dropdown) for the "Status" column, on the first 1000 rows
  const lista = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(CULORI_STARE), true).setAllowInvalid(false).build();
  foaie.getRange(2, COL.stare, 999, 1).setDataValidation(lista);

  // The color of the "Status" cell follows the text, no matter who changes it (script or person)
  const zona = foaie.getRange(2, COL.stare, 999, 1);
  const reguli = Object.keys(CULORI_STARE).map(function (stare) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(stare).setBackground(CULORI_STARE[stare]).setRanges([zona]).build();
  });
  foaie.setConditionalFormatRules(reguli);

  ss.toast('The "' + SETARI.foaieComenzi + '" and "' + SETARI.foaieProduse + '" sheets are ready. Next: run instaleazaTriggere().');
}

/** Installs the two triggers: the new order from the form and the daily summary. Run again, it does not duplicate anything. */
function instaleazaTriggere() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const functie = t.getHandlerFunction();
    if (functie === 'onFormSubmit' || functie === 'reminderComenziNoi') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('reminderComenziNoi').timeBased().everyDays(1).atHour(SETARI.oraRezumat)
    .inTimezone(SETARI.fusOrar).create();
  ss.toast('Triggers installed: new order from the form + daily summary at ' + SETARI.oraRezumat + ':00.');
}

/**
 * Test without the form: simulates an order. The "customer's" email is the owner's,
 * so nobody else receives anything. The test row can be deleted from the sheet afterwards.
 */
function testeazaFluxul() {
  const probe = {};
  probe[CAMPURI.nume] = ['Test customer'];
  probe[CAMPURI.email] = [SETARI.emailProprietar];
  probe[CAMPURI.telefon] = ['0700 000 000'];
  probe[CAMPURI.produs] = [PRODUSE_EXEMPLU[0][0]];
  probe[CAMPURI.cantitate] = ['2'];
  probe[CAMPURI.adresa] = ['1 Example St., Cluj-Napoca'];
  probe[CAMPURI.observatii] = ['TEST ORDER: you can delete it'];
  const rezultat = proceseazaComanda_(extrageComanda_(probe));
  SpreadsheetApp.getActive().toast('Test succeeded: ' + rezultat.comanda.nr + ' (row ' + rezultat.rand + '). Check your email.');
}

// ==========================================================================
// 6. HELPER FUNCTIONS
// ==========================================================================

/** The "Orders" sheet; if it is missing, says so clearly instead of throwing a cryptic error. */
function foaieComenzi_() {
  const foaie = SpreadsheetApp.getActive().getSheetByName(SETARI.foaieComenzi);
  if (!foaie) throw new Error('The "' + SETARI.foaieComenzi + '" sheet is missing. Run configureazaFoaia().');
  return foaie;
}

function formateazaData_(data) {
  return Utilities.formatDate(data, SETARI.fusOrar, 'dd.MM.yyyy HH:mm');
}

/** 1234.5 -> "1.234,50"; 240 -> "240" (Romanian-style separators: dot for thousands, comma for decimals). */
function formateazaSuma_(n) {
  const parti = Number(n).toFixed(2).split('.');
  const intreg = parti[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parti[1] === '00' ? intreg : intreg + ',' + parti[1];
}

/** Adds working days (excluding Saturday and Sunday) to a date. */
function adaugaZileLucratoare_(data, zile) {
  const d = new Date(data.getTime());
  let ramase = zile;
  while (ramase > 0) {
    d.setDate(d.getDate() + 1);
    const zi = d.getDay();
    if (zi !== 0 && zi !== 6) ramase--;
  }
  return d;
}

/** "5 hours", "24 hours", "3 days", "21 days". The helper takes a third plural form for languages that need one (such as Romanian); English reuses the plural. */
function descrieDurata_(ore) {
  const acord = function (n, unu, mai, multe) { return n + ' ' + (n === 1 ? unu : n >= 20 ? multe : mai); };
  return ore < 48 ? acord(Math.round(ore), 'hour', 'hours', 'hours') : acord(Math.floor(ore / 24), 'day', 'days', 'days');
}

/** Escapes text placed into HTML, so a customer cannot sneak code into an email. */
function esc_(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
