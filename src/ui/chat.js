// chat.js — DOM bottom sheet "Parler à Elon Man": quick-reply chips, a text field, and the brain settings
// (Démo / Passerelle PC + URL). Animated with Motion (vendor/motion.js, MIT) when it is loaded.
// The sheet only collects text and settings; the scene owns the brain and the robot.
import { CHIPS } from '../brain/demo.js';
import { normalizeUrl } from '../brain/gateway.js';

const M = () => (typeof window !== 'undefined' && window.Motion) || null;

export function createChat({ getPrefs, setPrefs, onAsk, onTest, onOpenChange }) {
  const root = document.createElement('div');
  root.id = 'chat';
  root.hidden = true;
  root.innerHTML = `
    <div class="chat-scrim" data-close></div>
    <section class="chat-card" role="dialog" aria-modal="true" aria-labelledby="chat-title">
      <header class="chat-head">
        <h2 id="chat-title">Parler à Elon Man</h2>
        <span class="chat-mode" data-mode>DÉMO</span>
        <button class="chat-x" type="button" data-close aria-label="Fermer">✕</button>
      </header>
      <ol class="chat-log" aria-live="polite"></ol>
      <div class="chat-chips">${CHIPS.map((c) => `<button type="button" class="chip">${c}</button>`).join('')}</div>
      <form class="chat-ask" autocomplete="off">
        <input name="q" maxlength="140" placeholder="Écris-lui quelque chose…" enterkeyhint="send" aria-label="Message">
        <button type="submit">Envoyer</button>
      </form>
      <details class="chat-set">
        <summary>Cerveau</summary>
        <div class="set-row" role="radiogroup" aria-label="Cerveau">
          <label><input type="radio" name="brain" value="demo"> Démo (hors ligne)</label>
          <label><input type="radio" name="brain" value="gateway"> Passerelle PC</label>
        </div>
        <label class="set-url">Adresse de la passerelle (HTTPS)
          <input name="url" type="url" inputmode="url" placeholder="https://elonman.ton-tailnet.ts.net" spellcheck="false">
        </label>
        <div class="set-row"><button type="button" class="set-test">Tester</button><span class="set-status" aria-live="polite"></span></div>
        <p class="set-note">Aucune clé ici. La passerelle doit être en HTTPS, accepter CORS pour passcool17.github.io,
          et sinon Elon Man répond en mode démo.</p>
      </details>
    </section>`;
  document.body.appendChild(root);

  const $ = (s) => root.querySelector(s);
  const card = $('.chat-card'), log = $('.chat-log'), form = $('.chat-ask'), input = form.q;
  const modeEl = $('[data-mode]'), urlEl = $('input[name=url]'), status = $('.set-status');
  let open = false;

  const syncSettings = () => {
    const b = getPrefs().brain;
    root.querySelectorAll('input[name=brain]').forEach((r) => { r.checked = r.value === b.mode; });
    urlEl.value = b.url || '';
  };
  const save = () => {
    const mode = root.querySelector('input[name=brain]:checked')?.value === 'gateway' ? 'gateway' : 'demo';
    const url = urlEl.value.trim();
    setPrefs({ mode, url });
    if (mode === 'gateway' && url && !normalizeUrl(url)) status.textContent = 'Adresse refusée : HTTPS obligatoire.';
  };
  root.querySelectorAll('input[name=brain]').forEach((r) => r.addEventListener('change', save));
  urlEl.addEventListener('change', save);
  $('.set-test').addEventListener('click', async () => {
    save();
    status.textContent = 'Test…';
    const r = await onTest(urlEl.value.trim());
    status.textContent = r.ok ? 'Passerelle OK ✓' : `Injoignable (${r.error || 'erreur'}) → mode démo`;
  });

  const add = (who, text, note) => {
    const li = document.createElement('li');
    li.className = who;
    li.textContent = text;
    if (note) { const s = document.createElement('small'); s.textContent = note; li.appendChild(s); }
    log.appendChild(li);
    while (log.children.length > 8) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
    M()?.animate(li, { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] }, { duration: 0.22 });
  };

  const ask = async (text) => {
    const t = String(text || '').trim();
    if (!t) return;
    add('me', t);
    input.value = '';
    const r = await onAsk(t);
    add('bot', r.reply, r.used === 'gateway' ? 'PC' : r.fellBack ? 'PC injoignable → démo' : 'démo');
  };
  root.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => api.close()));
  // keep game keys (1-4) from firing while typing
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') api.close(); });
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  const api = {
    get isOpen() { return open; },
    setMode(label, kind) { modeEl.textContent = label; modeEl.dataset.kind = kind; },
    open() {
      if (open) return;
      open = true; syncSettings(); root.hidden = false; onOpenChange?.(true);
      const mo = M();
      if (mo) {
        mo.animate($('.chat-scrim'), { opacity: [0, 1] }, { duration: 0.2 });
        mo.animate(card, { transform: ['translateY(100%)', 'translateY(0%)'] }, { type: 'spring', bounce: 0.18, duration: 0.45 });
        mo.animate(root.querySelectorAll('.chip'), { opacity: [0, 1], transform: ['scale(0.9)', 'scale(1)'] }, { delay: mo.stagger(0.03, { startDelay: 0.12 }), duration: 0.2 });
      }
    },
    async close() {
      if (!open) return;
      open = false; onOpenChange?.(false);
      const mo = M();
      if (mo) {
        mo.animate($('.chat-scrim'), { opacity: 0 }, { duration: 0.18 });
        await mo.animate(card, { transform: 'translateY(100%)' }, { duration: 0.22, ease: 'easeIn' });
      }
      root.hidden = true;
    },
    ask,
  };
  return api;
}
