/**
 * Normalizare număr de telefon pentru România
 * Format returnat: 07XXXXXXXX (10 cifre cu 0)
 *
 * @param {string} phone - Număr de telefon în orice format
 * @returns {string|null} - Număr normalizat sau null dacă invalid
 */
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Elimină toate caracterele non-numerice
  let cleaned = phone.replace(/\D/g, '');

  // Elimină prefixul de țară +40 dacă există
  if (cleaned.startsWith('40')) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0040')) {
    cleaned = cleaned.substring(4);
  }

  // Dacă nu începe cu 0 și are 9 cifre (7XXXXXXXX), adaugă 0
  if (!cleaned.startsWith('0') && cleaned.length === 9 && cleaned.startsWith('7')) {
    cleaned = '0' + cleaned;
  }

  // Validare: trebuie să fie 07XXXXXXXX sau 02XXXXXXXX (numere românești)
  if (cleaned.length !== 10) {
    console.log(`   ❌ Număr invalid (lungime ${cleaned.length}): ${phone} → ${cleaned}`);
    return null;
  }

  if (!cleaned.startsWith('07') && !cleaned.startsWith('02') && !cleaned.startsWith('03')) {
    console.log(`   ❌ Nu e număr românesc: ${phone} → ${cleaned}`);
    return null;
  }

  console.log(`   📞 Normalizare telefon: ${phone} → ${cleaned}`);
  return cleaned;
}

module.exports = { normalizePhoneNumber };
