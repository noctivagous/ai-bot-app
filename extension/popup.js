// Popup: pairing-token entry + a plain-language state line.

const tokenInput = document.getElementById('token');
const stateEl = document.getElementById('state');

async function refresh() {
  const stored = await chrome.storage.local.get('pairingToken');
  if (stored.pairingToken && !tokenInput.value) tokenInput.value = stored.pairingToken;
  let state = null;
  try {
    state = await chrome.runtime.sendMessage({ type: 'md-state' });
  } catch {
    state = null;
  }
  if (!stored.pairingToken) {
    stateEl.innerHTML = '<span class="bad">No pairing token saved yet.</span>';
  } else if (state?.bridgeOpen) {
    stateEl.innerHTML =
      '<span class="ok">Bridge: connected.</span> ' +
      (state.tabRegistered ? 'Muse tab: registered.' : 'Muse tab: open muse.ai to register.');
  } else {
    stateEl.innerHTML =
      '<span class="bad">Bridge: not connected.</span> Is the bridge running (npm start in bridge/)?';
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  await chrome.storage.local.set({ pairingToken: token });
  stateEl.textContent = 'Saved — reconnecting…';
  setTimeout(refresh, 800);
});

void refresh();
