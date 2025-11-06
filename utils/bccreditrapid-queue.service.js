/**
 * Sistem de coadă pentru BC Credit Rapid
 * Procesare secvențială a lead-urilor trimise către BC Credit Rapid API
 */

// Configurare delay FIX între lead-uri (în secunde)
const DELAY_SECONDS = 2;  // Fix 2 secunde între lead-uri (optimizat pentru viteză)

// Starea cozii
let queue = [];
let isProcessing = false;
let processedCount = 0;
let failedCount = 0;
let startTime = null;
let processHandler = null;

/**
 * Adaugă un lead în coadă
 */
function addToQueue(leadData) {
  const queueItem = {
    ...leadData,
    addedAt: new Date(),
    position: queue.length + 1
  };

  queue.push(queueItem);

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

  const totalToProcess = processedCount + queue.length + 1;

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

      // Pauză FIX între request-uri către BC Credit Rapid (protecție API)
      if (remainingInQueue > 0) {
        await delay(DELAY_SECONDS * 1000);
      }

    } catch (error) {
      failedCount++;
      console.error(`   ❌ [BC CREDIT RAPID QUEUE] Eroare: ${error.message}`);
    }
  }

  // Reset pentru următorul batch (păstrăm processedCount pentru numerotare globală)
  isProcessing = false;
  // processedCount NU se resetează - numerotare globală continuă
  failedCount = 0;
  startTime = null;
}

/**
 * Setează handler-ul care procesează fiecare lead
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
