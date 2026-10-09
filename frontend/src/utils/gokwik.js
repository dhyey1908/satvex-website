// SANDBOX ONLY. Everything GoKwik-specific on the frontend lives in this
// one file, mirroring how cashfree.js isolates Cashfree. Built against
// gokwik_integration_notes.md (GoKwik's web-integration page, pasted in
// 2026-10-09 since the live page 404s for us) — anything not in the notes
// is marked TODO(confirm) rather than guessed.

let scriptPromise = null;

function loadGoKwikScript() {
  if (window.gokwikSdk) return Promise.resolve(window.gokwikSdk);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.gokwik.co/integration.js';
      script.async = true;
      script.onload = () => resolve(window.gokwikSdk);
      script.onerror = () => reject(new Error('Could not load the GoKwik checkout script.'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// Wraps gokwikSdk.initPayment + its on('success')/on('failure')/
// on('modal_closed') callbacks in a single Promise so Checkout.jsx can
// await one call, same shape as redirectToCashfreeCheckout. Resolves with
// { outcome: 'success' | 'failure' | 'modal_closed', data }.
//
// TODO(confirm): the notes don't say whether these are one-shot callbacks
// or need to be unregistered — assuming one-shot per payment attempt here.
export async function openGoKwikCheckout({ mid, moid, orderType, requestId, gokwikOid, environment }) {
  const gokwikSdk = await loadGoKwikScript();

  return new Promise((resolve, reject) => {
    gokwikSdk.on('success', (data) => resolve({ outcome: 'success', data }));
    gokwikSdk.on('failure', (data) => resolve({ outcome: 'failure', data }));
    gokwikSdk.on('modal_closed', (data) => resolve({ outcome: 'modal_closed', data }));

    try {
      const merchantInfo = {
        order_type: orderType,
        mid,
        moid,
        environment,
        request_id: requestId,
        gokwik_oid: gokwikOid,
      };

      // 'auto' mode matters here: the payment widget (gokwik.js) loads
      // asynchronously and only registers its message listener once it
      // emits 'ready'. Calling initPayment plainly races that — the
      // postMessage can fire before anyone's listening and silently gets
      // dropped (this was the actual bug: no popup ever opened, and the
      // only visible symptom was an unrelated analytics-ping 400). 'auto'
      // still fires an immediate (possibly-too-early, harmless) attempt,
      // but also registers a retry for the real 'ready' event, which is
      // what the SDK's own source confirms is required for a reliable
      // first call. Fixes rerunning fine too, since this is a no-op after
      // 'ready' has already fired on repeat calls in the same session.
      gokwikSdk.initPayment(merchantInfo, 'auto');
    } catch (err) {
      reject(err);
    }
  });
}
