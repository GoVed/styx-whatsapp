/**
 * Renders the HTML page for WhatsApp QR pairing and status display.
 * @param {object} status
 * @param {string} initialQrUrl
 * @param {string} latestQr
 * @returns {string}
 */
export function renderQrPage(status, initialQrUrl = '', latestQr = '') {
  if (status.status === 'connected') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>WhatsApp Connected - Syndae</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="background:#090d16;color:#10b981;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:3rem;text-align:center;">
        <div style="max-width:440px;margin:0 auto;background:#0d1527;border:1px solid #059669;padding:2.5rem;border-radius:1rem;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
          <div style="font-size:3.5rem;margin-bottom:1rem;color:#34d399;">✓</div>
          <h2 style="margin:0 0 0.5rem 0;color:#fff;font-size:1.5rem;">WhatsApp Connected!</h2>
          <p style="color:#6ee7b7;font-size:0.9rem;">Your account is linked and ready for Syndae Agent OS.</p>
          <div style="background:#052e16;color:#a7f3d0;padding:0.75rem 1rem;border-radius:0.5rem;font-family:monospace;font-size:1rem;margin-top:1.5rem;border:1px solid #065f46;">
            ${status.user?.phone || status.user?.id || 'Linked'}
          </div>
          <p style="color:#64748b;font-size:0.8rem;margin-top:1.5rem;">
            You can now close this tab and chat with Syndae!
          </p>
        </div>
      </body>
      </html>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Pair WhatsApp - Syndae</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; }
        body { background:#090d16; color:#fff; font-family:-apple-system,BlinkMacSystemFont,sans-serif; padding:2rem 1rem; margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; }
        .card { max-width:460px; width:100%; background:#0d1527; border:1px solid #1e293b; padding:2.5rem 2rem; border-radius:1.25rem; box-shadow:0 20px 40px rgba(0,0,0,0.6); text-align:center; }
        .badge { display:inline-flex; align-items:center; gap:6px; background:#064e3b; color:#34d399; font-size:0.75rem; font-weight:600; padding:4px 10px; border-radius:999px; margin-bottom:1rem; border:1px solid #059669; }
        .badge .dot { width:8px; height:8px; background:#34d399; border-radius:50%; animation:pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.8); } 100% { opacity:1; transform:scale(1); } }
        h2 { margin:0 0 0.5rem 0; font-size:1.35rem; font-weight:700; }
        p { color:#94a3b8; font-size:0.875rem; line-height:1.5; margin:0 0 1.5rem 0; }
        .qr-box { background:#fff; padding:16px; border-radius:16px; display:inline-block; box-shadow:0 8px 24px rgba(0,0,0,0.3); position:relative; min-width:280px; min-height:280px; }
        .qr-box img { display:block; width:280px; height:280px; }
        .steps { text-align:left; background:#131d33; padding:1rem 1.25rem; border-radius:0.75rem; margin-top:1.5rem; font-size:0.8rem; color:#cbd5e1; border:1px solid #1e293b; }
        .steps ol { margin:0; padding-left:1.2rem; }
        .steps li { margin-bottom:0.4rem; }
        .steps li:last-child { margin-bottom:0; }
        .footer { color:#64748b; font-size:0.75rem; margin-top:1.25rem; }
      </style>
    </head>
    <body>
      <div class="card" id="cardContainer">
        <div class="badge"><span class="dot"></span> LIVE PAIRING ACTIVE</div>
        <h2>Scan with WhatsApp</h2>
        <p>Open WhatsApp on your mobile phone to connect this companion agent.</p>
        
        <div class="qr-box">
          <img id="qrImg" src="${initialQrUrl}" alt="WhatsApp Pairing QR Code" style="${initialQrUrl ? '' : 'display:none;'}" />
          <div id="loadingText" style="display:${initialQrUrl ? 'none' : 'flex'};align-items:center;justify-content:center;height:280px;color:#0f172a;font-weight:600;font-size:0.9rem;">
            Generating fresh QR code...
          </div>
        </div>

        <div class="steps">
          <ol>
            <li>Open <b>WhatsApp</b> on your phone</li>
            <li>Tap <b>Settings</b> (iOS) or <b>⋮ Menu</b> (Android)</li>
            <li>Select <b>Linked Devices</b></li>
            <li>Tap <b>Link a Device</b> and point camera here</li>
          </ol>
        </div>

        <div class="footer" id="statusText">Live auto-refresh enabled. Code stays permanently fresh.</div>
      </div>

      <script>
        let lastQr = "${latestQr}";
        async function pollStatus() {
          try {
            const res = await fetch('/qr/raw');
            if (!res.ok) return;
            const data = await res.json();
            
            if (data.connected) {
              document.getElementById('cardContainer').innerHTML = \`
                <div style="font-size:3.5rem;margin-bottom:1rem;color:#34d399;">✓</div>
                <h2 style="margin:0 0 0.5rem 0;color:#fff;font-size:1.5rem;">WhatsApp Connected!</h2>
                <p style="color:#6ee7b7;font-size:0.9rem;">Your account is linked and ready for Syndae Agent OS.</p>
                <div style="background:#052e16;color:#a7f3d0;padding:0.75rem 1rem;border-radius:0.5rem;font-family:monospace;font-size:1rem;margin-top:1.5rem;border:1px solid #065f46;">
                  \${data.user?.phone || data.user?.id || 'Linked'}
                </div>
                <p style="color:#64748b;font-size:0.8rem;margin-top:1.5rem;">
                  You can now close this tab and chat with Syndae!
                </p>
              \`;
              return;
            }

            if (data.qrDataUrl && data.qr !== lastQr) {
              lastQr = data.qr;
              const img = document.getElementById('qrImg');
              const loading = document.getElementById('loadingText');
              if (img) {
                img.src = data.qrDataUrl;
                img.style.display = 'block';
              }
              if (loading) loading.style.display = 'none';
            }
          } catch (err) {
            console.debug('Polling error', err);
          }
        }
        setInterval(pollStatus, 1500);
      </script>
    </body>
    </html>
  `;
}

export default { renderQrPage };
