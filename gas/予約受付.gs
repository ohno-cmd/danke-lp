/**
 * Danke LP 予約受付（Google Apps Script）
 * LPの予約フォームから送られた内容を、このスプレッドシートに1行ずつ追加します。
 *
 * ■ 設定
 *   NOTIFY_EMAIL に通知先メールアドレスを入れると、予約のたびに内容入りのメールが届きます。
 *   空欄（''）ならメールは送りません。
 */
const NOTIFY_EMAIL = '';
const SHEET_NAME = '予約一覧';
const HEADERS = ['受付日時', 'お名前', '電話番号', 'ワンちゃんのお名前', '犬種', '第1希望', '第2希望', '第3希望', '対応状況', 'メモ'];

/** LPからの送信を受け取る */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const p = (e && e.parameter) || {};

    // いたずら送信対策：人には見えない欄（website）に入力があれば保存せず終了
    if (p.website) return json({ ok: true });

    const required = ['name', 'tel', 'dog', 'breed', 'pref1'];
    const missing = required.filter((k) => !String(p[k] || '').trim());
    if (missing.length) return json({ ok: false, error: 'missing: ' + missing.join(',') });

    const v = {
      name: clean(p.name), tel: clean(p.tel), dog: clean(p.dog), breed: clean(p.breed),
      pref1: clean(p.pref1), pref2: clean(p.pref2), pref3: clean(p.pref3),
    };

    getSheet().appendRow([
      new Date(), v.name, "'" + v.tel, v.dog, v.breed, v.pref1, v.pref2, v.pref3, '未対応', '',
    ]);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail({
        to: NOTIFY_EMAIL,
        subject: '【Danke】LPから予約が入りました（' + v.name + ' 様）',
        body: [
          'LPの予約フォームから新しい予約が入りました。',
          '',
          'お名前　　　：' + v.name,
          '電話番号　　：' + v.tel,
          'ワンちゃん　：' + v.dog + '（' + v.breed + '）',
          '第1希望　　：' + v.pref1,
          '第2希望　　：' + (v.pref2 || '―'),
          '第3希望　　：' + (v.pref3 || '―'),
          '',
          '予約一覧：' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
        ].join('\n'),
      });
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** ブラウザでURLを開いたときの動作確認用 */
function doGet() {
  return ContentService.createTextOutput('Danke 予約受付：動作中');
}

/**
 * 初回の権限許可とテスト用。
 * エディタ上部で「testPost」を選んで「実行」すると、テスト行が1行追加されます（確認後は行を削除してください）。
 */
function testPost() {
  doPost({ parameter: {
    name: 'テスト 太郎', tel: '090-1234-5678', dog: 'モモ', breed: 'トイプードル',
    pref1: '2026年10月14日（水）10:00', pref2: '', pref3: '',
  } });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#F3EBE0');
    sheet.getRange('A:A').setNumberFormat('yyyy/mm/dd hh:mm');
    sheet.setColumnWidths(1, HEADERS.length, 140);
  }
  return sheet;
}

// 長すぎる入力を切り詰め、= + - @ で始まる値は数式として扱われないようにする
function clean(value) {
  const s = String(value || '').trim().slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
