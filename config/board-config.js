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
      phone: 'phone',        // Column ID pentru telefon în IFN
      email: 'email',        // Pentru CreditFix (viitor)
      cnp: 'cnp'             // Pentru CreditFix (viitor)
    }
  }
};

module.exports = { BOARD_CONFIG };
