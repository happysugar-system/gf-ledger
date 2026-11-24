const PROJECT = 'https://zwprphmfgobkektzsuti.supabase.co';
const KEY = 'sb_publishable__wtlccECQwOVd3-LvRVFYQ_2dCUlPVR';
export const FIELDS = ['GPS有無', '代車貸出先', '代車貸出エリア', '代車貸出備考'];

export function validateFields(fields) {
  if (!fields || FIELDS.some(name => typeof fields[name] !== (name === 'GPS有無' ? 'boolean' : 'string'))) {
    throw new Error('保存データを確認できませんでした。再読込してください。');
  }
  return Object.fromEntries(FIELDS.map(name => [name, fields[name]]));
}

// Keep the same request ID across timeouts and reloads so retries are idempotent.
export class DemoSave {
  constructor(api, storage, userId, uuid = () => crypto.randomUUID()) {
    this.api = api;
    this.storage = storage;
    this.key = 'gf-demo-v2-pending:' + userId;
    this.uuid = uuid;
    this.original = null;
    this.pending = JSON.parse(storage.getItem(this.key) || 'null');
    if (this.pending) {
      const { request_id, expected, changes } = this.pending;
      if (!/^[0-9a-f-]{36}$/i.test(request_id || '') || !expected || !changes ||
          !Object.keys(changes).length || Object.keys(changes).some(name => !FIELDS.includes(name) ||
          typeof changes[name] !== (name === 'GPS有無' ? 'boolean' : 'string') ||
          typeof expected[name] !== typeof changes[name])) {
        throw new Error('保存確認情報が不正です。管理者に確認してください。');
      }
    }
  }
  async read() {
    const response = await this.api('read');
    this.original = validateFields(response.fields);
    return this.original;
  }
  async submit(fields) {
    if (!this.pending) {
      validateFields(fields);
      if (!this.original) throw new Error('最新データを先に取得してください。');
      const expected = {}, changes = {};
      for (const name of FIELDS) {
        const value = fields[name];
        if (value === this.original[name]) continue;
        if (typeof value === 'string' && (value.length > 1000 || /^\s*[=+@-]/.test(value))) {
          throw new Error(name + 'の入力を確認してください。');
        }
        expected[name] = this.original[name];
        changes[name] = value;
      }
      if (!Object.keys(changes).length) return 'unchanged';
      const pending = { request_id: this.uuid(), expected, changes };
      this.storage.setItem(this.key, JSON.stringify(pending));
      this.pending = pending;
    }
    try {
      await this.api('save', this.pending);
    } catch (error) {
      if (error.status === 400) this.clear();
      if (error.status === 409) {
        try {
          await this.api('status', { request_id: this.pending.request_id });
          return 'accepted';
        } catch (statusError) {
          if (statusError.status === 404) {
            await this.read();
            this.clear();
            return 'conflict';
          }
        }
      }
      if (!error.status || error.status >= 500) return 'accepted';
      throw error;
    }
    return 'accepted';
  }
  clear() {
    this.storage.removeItem(this.key);
    this.pending = null;
  }
  async check() {
    if (!this.pending) { await this.read(); return 'loaded'; }
    let response;
    try {
      response = await this.api('status', { request_id: this.pending.request_id });
    } catch (error) {
      if (error.status === 404) return 'not_received';
      throw error;
    }
    if (response.state === 'replica_verified' && response.verified_at) {
      const changes = this.pending.changes;
      if (!Object.keys(changes).every(name => response.changes?.[name] === changes[name])) {
        throw new Error('保存結果が送信内容と一致しません。管理者に確認してください。');
      }
      await this.read();
      const matches = Object.keys(changes).every(name => this.original[name] === changes[name]);
      this.clear();
      return matches ? 'verified' : 'subsequently_changed';
    }
    if (['conflict', 'rejected', 'reconciliation_required'].includes(response.state)) {
      await this.read();
      this.clear();
    }
    return response.state;
  }
}

export function mountDemoSave(root, onClose, onRead) {
  root.innerHTML = `<button class="back" data-back>← 車両詳細へ</button>
    <div class="box"><h2>GPS・代車貸出情報</h2><p>保存対象　V999999（テスト車両）</p>
    <form data-login>
      <div class="field"><label for="save-email">テスト用メールアドレス</label><input id="save-email" type="email" required autocomplete="username"></div>
      <div class="field"><label for="save-password">パスワード</label><input id="save-password" type="password" required autocomplete="current-password"></div>
      <button class="action primary">ログイン</button>
    </form>
    <form data-editor hidden>
      <div class="field"><label><input data-field="GPS有無" type="checkbox" style="width:auto"> GPS有無</label></div>
      <div class="field"><label for="save-company">代車貸出先</label><input id="save-company" data-field="代車貸出先" maxlength="1000"></div>
      <div class="field"><label for="save-area">代車貸出エリア</label><input id="save-area" data-field="代車貸出エリア" maxlength="1000"></div>
      <div class="field"><label for="save-note">代車貸出備考</label><textarea id="save-note" data-field="代車貸出備考" maxlength="1000"></textarea></div>
      <button class="action primary" data-save>変更を保存</button>
      <button class="action secondary" type="button" data-refresh>最新状態・保存状況を確認</button>
      <button class="action secondary" type="button" data-login-again>再ログイン</button>
      <button class="action secondary" type="button" data-logout>ログアウト</button>
    </form>
    <p role="status" aria-live="polite" data-message></p></div>`;
  const $ = selector => root.querySelector(selector);
  const message = text => $('[data-message]').textContent = text;
  const login = $('[data-login]'), editor = $('[data-editor]');
  let client, controller, busy = false;
  function lock(value) {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll('button,input,textarea').forEach(element => element.disabled = value);
    editor.querySelectorAll('[data-field]').forEach(element => element.disabled = value || !!controller?.pending);
    $('[data-logout]').disabled = value || !!controller?.pending;
    $('[data-save]').textContent = controller?.pending ? '同じ保存内容を再送する' : '変更を保存';
  }
  function display() {
    if (!controller.original) return;
    editor.querySelectorAll('[data-field]').forEach(element => {
      const name = element.dataset.field;
      const value = controller.pending?.changes[name] ?? controller.original[name];
      if (element.type === 'checkbox') element.checked = value;
      else element.value = value;
    });
    onRead(controller.original);
  }
  const messages = {
    loaded: '最新の保存データを取得しました。',
    unchanged: '変更はありません。',
    verified: 'スプシ保存・Supabase反映を確認しました。',
    subsequently_changed: '保存後にデータが更新されています。最新値を表示しました。',
    conflict: '別の更新と重なりました。最新値を確認して入力し直してください。',
    rejected: '保存が受け付けられませんでした。最新値を表示しました。',
    reconciliation_required: '保存結果の管理者確認が必要です。最新値を表示しました。',
    not_received: '保存の受付を確認できません。「同じ保存内容を再送する」を押してください。',
  };
  async function check() {
    for (let count = 0; count < 24; count++) {
      let state;
      try { state = await controller.check(); }
      catch (error) {
        if (error.status && error.status < 500) throw error;
        message('通信が不安定です。再送せず保存状況を確認しています…');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      if (state === 'not_received' && count < 3) { await new Promise(resolve => setTimeout(resolve, 3000)); continue; }
      if (Object.hasOwn(messages, state)) { display(); message(messages[state]); return; }
      message('保存処理中です。反映を確認しています…');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    message('反映の確認待ちです。「最新状態・保存状況を確認」を押してください。');
  }
  async function run(action) {
    if (busy) return;
    lock(true);
    try { await action(); }
    catch (error) { message('確認できませんでした。' + error.message); }
    finally { lock(false); }
  }
  async function api(action, extra = {}) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('再ログインしてください。');
    const response = await fetch(PROJECT + '/functions/v1/gf-vehicle-demo-editor-v2', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + session.access_token, apikey: KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ action, vehicle_id: 'V999999', ...extra }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(response.status === 401 ? '再ログインしてください。' :
        response.status === 403 ? 'このアカウントにはテスト車両の編集権限がありません。' :
        '通信結果を確認できません。保存状況を再確認してください。');
      error.status = response.status;
      throw error;
    }
    return data;
  }
  login.onsubmit = event => {
    event.preventDefault();
    run(async () => {
      message('ログインを確認しています…');
      if (!client) {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.0');
        client = createClient(PROJECT, KEY, { auth: { persistSession: false } });
      }
      const password = $('#save-password').value;
      $('#save-password').value = '';
      const result = await client.auth.signInWithPassword({ email: $('#save-email').value.trim(), password });
      if (result.error) throw new Error('メールアドレス・パスワードを確認してください。');
      controller = new DemoSave(api, sessionStorage, result.data.user.id);
      await controller.read();
      login.hidden = true;
      editor.hidden = false;
      display();
      if (controller.pending) await check();
      else message(messages.loaded);
    });
  };
  editor.onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const fields = Object.fromEntries([...editor.querySelectorAll('[data-field]')]
        .map(element => [element.dataset.field, element.type === 'checkbox' ? element.checked : element.value]));
      message('変更内容を送信しています…');
      const state = await controller.submit(fields);
      if (state === 'accepted') await check();
      else { display(); message(messages[state]); }
    });
  };
  $('[data-refresh]').onclick = () => run(check);
  $('[data-login-again]').onclick = () => { login.hidden = false; editor.hidden = true; message('同じアカウントでログインすると保存状況を引き継ぎます。'); };
  $('[data-logout]').onclick = () => run(async () => {
    if (controller.pending) return;
    await client.auth.signOut();
    controller = null;
    editor.reset();
    editor.hidden = true;
    login.hidden = false;
    message('ログアウトしました。');
  });
  $('[data-back]').onclick = () => { if (!busy) onClose(); };
  return { open() { root.hidden = false; } };
}
