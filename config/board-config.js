/**
 * Configurare mapare Board ID → Coloane Monday
 *
 * Când adăugăm noi parteneri, extindem acest config cu:
 * - Board-uri noi (Credius, CreditFix, iCredit)
 * - Coloane noi (email, cnp pentru CreditFix)
 */

const BOARD_CONFIG = {
  // Board FLEX dedicat (trimite doar la Mediatel)
  '2077716319': {
    boardName: 'FLEX',
    columns: {
      phone: 'phone_1__1'    // Column ID specific pentru board FLEX
    }
  },

  // Board IFN - HUB central pentru toți partenerii
  // Când agent selectează "TRIMIS" în coloana unui partener → webhook specific
  '5056951158': {
    boardName: 'IFN',
    columns: {
      phone: 'phone',                     // Column ID pentru telefon
      email: 'email',                     // Column ID pentru email
      cnp: 'cnp__1',                      // Column ID pentru CNP
      cashingMethod: 'dropdown__1',       // Column ID pentru metodă încasare (Cash/Card)
      employer: 'angajator2__1',          // Column ID pentru Angajator (pentru BC Credit Rapid)
      income: 'numbers__1',               // Column ID pentru Salariu (pentru BC Credit Rapid)
      amount: 'numeric_mkwr1ncc'          // Column ID pentru Suma IFN (pentru BC Credit Rapid)
    }
  }
};

module.exports = { BOARD_CONFIG };
