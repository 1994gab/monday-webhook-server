/**
 * Sistem de coadă pentru IFN-SMS
 * Procesare secvențială a SMS-urilor trimise către 4Pay
 */

// Configurare delay între SMS-uri (în secunde)
const DELAY_SECONDS = 2;  // 2 secunde între SMS-uri (protecție API 4Pay)

// Starea cozii
let queue = [];
let isProcessing = false;
let processedCount = 0;
let failedCount = 0;
let startTime = null;
let processHandler = null;

/**
 * Adaugă un SMS în coadă
 */
function addToQueue(smsData) {
  const queueItem = {
    ...smsData,
    addedAt: new Date(),
    position: queue.length + 1
  };

  queue.push(queueItem);

  console.log(`📋 [IFN-SMS QUEUE] Item adăugat: poziție ${queueItem.position}, total în coadă: ${queue.length}`);

  // Pornește procesarea dacă nu rulează deja
  startProcessing();

  return queueItem.position;
}

/**
 * Procesează coada secvențial
 */
async function startProcessing() {
  if (isProcessing || queue.length === 0) {
    return;
  }

  isProcessing = true;

  if (!startTime) {
    startTime = new Date();
  }

  const totalToProcess = processedCount + queue.length;

  console.log(`\n🚀 [IFN-SMS QUEUE] Start procesare: ${queue.length} SMS-uri în coadă`);

  while (queue.length > 0) {
    const item = queue.shift();
    const currentNumber = processedCount + 1;
    const remainingInQueue = queue.length;

    try {
      // Apelează handler-ul de procesare
      if (processHandler) {
        await processHandler(item, currentNumber, totalToProcess);
        processedCount++;
      }

      // Pauză între SMS-uri (protecție API 4Pay)
      if (remainingInQueue > 0) {
        console.log(`   ⏳ Aștept ${DELAY_SECONDS} secunde... (${remainingInQueue} rămas)`);
        await delay(DELAY_SECONDS * 1000);
      }

    } catch (error) {
      failedCount++;
      console.error(`   ❌ [IFN-SMS QUEUE] Eroare: ${error.message}`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ [IFN-SMS QUEUE] Finalizat: ${processedCount} procesate, ${failedCount} eșuate, durată ${duration}s\n`);

  // Reset pentru următorul batch
  isProcessing = false;
  failedCount = 0;
  startTime = null;
}

/**
 * Setează handler-ul care procesează fiecare SMS
 */
function setProcessHandler(handler) {
  processHandler = handler;
}

/**
 * Utility pentru delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Obține status-ul curent al cozii
 */
function getQueueStatus() {
  return {
    queueLength: queue.length,
    isProcessing: isProcessing,
    processedCount: processedCount,
    failedCount: failedCount,
    items: queue.map((item, index) => ({
      position: index + 1,
      itemId: item.itemId,
      addedAt: item.addedAt
    }))
  };
}

/**
 * Golește coada (pentru emergency)
 */
function clearQueue() {
  const count = queue.length;
  queue = [];
  return count;
}

module.exports = {
  addToQueue,
  setProcessHandler,
  getQueueStatus,
  clearQueue
};
