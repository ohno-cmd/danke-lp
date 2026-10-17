/* =========================================================
   Danke LP
   ========================================================= */

/*
 * 予約の送信先（Google Apps Script のウェブアプリURL / gas/予約受付.gs）
 * Apps Script を「新しいデプロイ」で作り直した場合はURLが変わるので、ここも差し替えてください。
 */
const RESERVE_ENDPOINT = 'https://script.google.com/macros/s/AKfycby6WtU03w_q_1t9ydVkbZj2ZeeLZqhOL-hB9YcTrNh3IxiY2Co2HZQ27y5zMCmCKVBl/exec';

/*
 * 予約カレンダーの設定
 * 祝日は自動計算します。年末年始・臨時休業などは extraClosedDates に 'YYYY-MM-DD' で追加してください。
 */
const RESERVATION = {
  closedWeekdays: [1, 2], // 0=日 1=月 2=火 … 6=土
  firstTime: '10:00',
  lastTime: '16:00',
  stepMinutes: 30,
  minDaysAhead: 1,        // 1 = 翌日から選択可（当日予約はお電話で）
  maxDaysAhead: 90,       // 何日先まで選べるか
  extraClosedDates: [],   // 例：['2026-12-30', '2026-12-31']
};

document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  initFadeIn();
  initStickyCta();
  initSlider();
  initForm();
  initTracking();
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});

/* ---------- 成果計測（Meta Pixel / Googleアナリティクス4） ---------- */
// Meta のイベント名 → GA4 のイベント名
const GA4_EVENTS = {
  Lead: 'generate_lead', // 予約フォーム送信完了（GA4の推奨イベント）
  Contact: 'phone_click', // 電話ボタンのタップ
};

function track(event) {
  if (typeof window.fbq === 'function') window.fbq('track', event);
  if (typeof window.gtag === 'function' && GA4_EVENTS[event]) window.gtag('event', GA4_EVENTS[event]);
}

function initTracking() {
  // 電話ボタンのタップ
  document.querySelectorAll('a[href^="tel:"]').forEach((a) => {
    a.addEventListener('click', () => track('Contact'));
  });
}

/* ---------- スクロールでふわっと表示 ---------- */
function initFadeIn() {
  const targets = document.querySelectorAll('.fade');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  targets.forEach((el) => io.observe(el));
}

/* ---------- 追従CTA：FV通過後に表示、予約フォーム付近では隠す ---------- */
function initStickyCta() {
  const bar = document.getElementById('sticky-cta');
  const fv = document.getElementById('top');
  const reserve = document.getElementById('reserve');
  if (!bar || !fv || !reserve || !('IntersectionObserver' in window)) return;

  let pastFv = false;
  let atReserve = false;
  const update = () => {
    const show = pastFv && !atReserve;
    bar.classList.toggle('is-shown', show);
    bar.setAttribute('aria-hidden', String(!show));
    bar.querySelectorAll('a').forEach((a) => a.setAttribute('tabindex', show ? '0' : '-1'));
  };

  new IntersectionObserver(([entry]) => {
    pastFv = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    update();
  }).observe(fv);

  new IntersectionObserver(([entry]) => {
    atReserve = entry.isIntersecting;
    update();
  }).observe(reserve);
}

/* ---------- ビフォーアフター スライダー ---------- */
function initSlider() {
  document.querySelectorAll('[data-slider]').forEach((slider) => {
    const track = slider.querySelector('[data-slider-track]');
    const slides = Array.from(track.children);
    const dotsWrap = slider.querySelector('[data-slider-dots]');
    const prev = slider.querySelector('[data-slider-prev]');
    const next = slider.querySelector('[data-slider-next]');
    let current = 0;

    // 1組だけのときは矢印・ドットを出さない
    if (slides.length < 2) {
      slider.querySelector('.slider__nav').hidden = true;
      return;
    }

    const dots = slides.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slider__dot';
      b.setAttribute('aria-label', `${i + 1}枚目を表示`);
      b.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(b);
      return b;
    });

    const setCurrent = (i) => {
      current = i;
      dots.forEach((d, j) => d.setAttribute('aria-current', String(j === i)));
    };

    const goTo = (i) => {
      const n = (i + slides.length) % slides.length;
      track.scrollTo({ left: slides[n].offsetLeft - track.offsetLeft, behavior: 'smooth' });
      setCurrent(n);
    };

    prev.addEventListener('click', () => goTo(current - 1));
    next.addEventListener('click', () => goTo(current + 1));

    // スワイプ後に現在位置を同期
    let timer;
    track.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        if (i !== current) setCurrent(Math.min(Math.max(i, 0), slides.length - 1));
      }, 80);
    }, { passive: true });

    setCurrent(0);
  });
}

/* ---------- 予約フォーム ---------- */
function initForm() {
  const form = document.getElementById('reserve-form');
  const thanks = document.getElementById('thanks');
  const formError = document.getElementById('form-error');
  if (!form) return;

  const rules = {
    name: (v) => (v ? '' : 'お名前を入力してください'),
    tel: (v) => {
      if (!v) return '電話番号を入力してください';
      const digits = toHalfWidth(v).replace(/[\s()\-‐‑‒–—―−ー]/g, '');
      if (!/^\d+$/.test(digits)) return '電話番号は数字で入力してください';
      if (!/^0\d{9,10}$/.test(digits)) return '電話番号の形式をご確認ください（例：090-1234-5678）';
      return '';
    },
    dog: (v) => (v ? '' : 'ワンちゃんのお名前を入力してください'),
    breed: (v) => (v ? '' : '犬種を入力してください'),
  };

  const fields = Object.keys(rules).map((name) => form.elements[name]);
  const touched = new Set();
  const prefs = initPrefs(form);

  const validate = (input) => {
    const msg = rules[input.name](input.value.trim());
    const err = document.getElementById(`${input.id}-err`);
    if (touched.has(input.name)) {
      err.textContent = msg;
      input.setAttribute('aria-invalid', String(Boolean(msg)));
      input.classList.toggle('is-valid', !msg);
    }
    return !msg;
  };

  fields.forEach((input) => {
    input.addEventListener('blur', () => {
      if (input.value.trim()) touched.add(input.name);
      validate(input);
    });
    input.addEventListener('input', () => validate(input));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    fields.forEach((input) => touched.add(input.name));
    const invalid = fields.filter((input) => !validate(input));
    const invalidPref = prefs.validate(true);
    if (invalid.length || invalidPref) {
      (invalid[0] || invalidPref).focus();
      return;
    }

    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = '送信中…';
    formError.hidden = true;

    try {
      await sendReservation({
        name: form.elements.name.value.trim(),
        tel: toHalfWidth(form.elements.tel.value.trim()),
        dog: form.elements.dog.value.trim(),
        breed: form.elements.breed.value.trim(),
        pref1: form.elements.pref1.value,
        pref2: form.elements.pref2.value,
        pref3: form.elements.pref3.value,
        website: form.elements.website.value, // いたずら送信対策（人は入力しない欄）
      });
      form.hidden = true;
      thanks.hidden = false;
      thanks.focus();
      track('Lead'); // 予約フォーム送信完了
    } catch (err) {
      formError.hidden = false;
      button.disabled = false;
      button.textContent = '無料特典付きで予約する';
    }
  });
}

/* ---------- 希望日時（第1〜第3希望） ---------- */
function initPrefs(form) {
  const calendar = initCalendar();
  const items = Array.from(form.querySelectorAll('[data-pref]')).map((el) => ({
    n: Number(el.dataset.pref),
    btn: el.querySelector('[data-pref-open]'),
    label: el.querySelector('[data-pref-value]'),
    input: el.querySelector('[data-pref-input]'),
    clear: el.querySelector('[data-pref-clear]'),
    err: el.querySelector('.field__err'),
    value: null, // { date: 'YYYY-MM-DD', time: 'HH:MM' }
  }));
  let showErrors = false;

  const set = (item, value) => {
    item.value = value;
    item.input.value = value ? formatSlot(value.date, value.time, true) : '';
    item.label.textContent = value ? formatSlot(value.date, value.time) : '日付と時間を選ぶ';
    item.btn.classList.toggle('is-filled', Boolean(value));
    if (item.clear) item.clear.hidden = !value;
    validate(showErrors);
  };

  // 第1希望は必須、同じ日時の重複は不可
  const validate = (show) => {
    showErrors = showErrors || show;
    let firstInvalid = null;
    items.forEach((item) => {
      let msg = '';
      if (item.n === 1 && !item.value) msg = '第1希望の日時を選択してください';
      const dup = item.value && items.find((o) => o.n < item.n && o.value
        && o.value.date === item.value.date && o.value.time === item.value.time);
      if (dup) msg = `第${dup.n}希望と同じ日時です。別の日時を選択してください`;
      if (showErrors) {
        item.err.textContent = msg;
        item.btn.setAttribute('aria-invalid', String(Boolean(msg)));
      }
      if (msg && !firstInvalid) firstInvalid = item.btn;
    });
    return firstInvalid;
  };

  items.forEach((item) => {
    item.btn.addEventListener('click', () => {
      const taken = items.filter((o) => o !== item && o.value).map((o) => `${o.value.date} ${o.value.time}`);
      calendar.open({
        title: `第${item.n}希望の日時を選択`,
        current: item.value,
        taken,
        opener: item.btn,
        onSelect: (value) => set(item, value),
      });
    });
    if (item.clear) {
      item.clear.addEventListener('click', () => {
        set(item, null);
        item.btn.focus();
      });
    }
  });

  return { validate };
}

/* ---------- 予約カレンダー ---------- */
function initCalendar() {
  const dialog = document.getElementById('cal');
  const title = document.getElementById('cal-title');
  const ym = dialog.querySelector('[data-cal-ym]');
  const days = dialog.querySelector('[data-cal-days]');
  const prev = dialog.querySelector('[data-cal-prev]');
  const next = dialog.querySelector('[data-cal-next]');
  const times = dialog.querySelector('[data-cal-times]');
  const timesLabel = dialog.querySelector('[data-cal-times-label]');
  const slots = dialog.querySelector('[data-cal-slots]');
  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  let opts = null;
  let view = null;       // 表示中の月（1日）
  let selected = null;   // 選択中の日付 'YYYY-MM-DD'

  const today = startOfDay(new Date());
  const minDate = addDays(today, RESERVATION.minDaysAhead);
  const maxDate = addDays(today, RESERVATION.maxDaysAhead);

  const closedReason = (d) => {
    const key = toKey(d);
    if (d < minDate || d > maxDate) return '受付対象外';
    if (RESERVATION.closedWeekdays.includes(d.getDay())) return '定休日';
    const holiday = jpHolidays(d.getFullYear()).get(key);
    if (holiday) return `祝日（${holiday}）`;
    if (RESERVATION.extraClosedDates.includes(key)) return '休業日';
    return '';
  };

  const renderMonth = () => {
    const y = view.getFullYear();
    const m = view.getMonth();
    ym.textContent = `${y}年${m + 1}月`;
    prev.disabled = new Date(y, m, 1) <= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    next.disabled = new Date(y, m, 1) >= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);

    days.textContent = '';
    for (let i = 0; i < new Date(y, m, 1).getDay(); i++) {
      days.appendChild(document.createElement('span'));
    }
    const last = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const date = new Date(y, m, d);
      const key = toKey(date);
      const reason = closedReason(date);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cal__day';
      b.textContent = d;
      if (date.getDay() === 0) b.classList.add('is-sun');
      if (date.getDay() === 6) b.classList.add('is-sat');
      if (+date === +today) b.classList.add('is-today');
      b.disabled = Boolean(reason);
      b.setAttribute('aria-label', `${m + 1}月${d}日 ${WEEK[date.getDay()]}曜日${reason ? `（${reason}）` : ''}`);
      b.setAttribute('aria-pressed', String(key === selected));
      b.addEventListener('click', () => selectDate(key));
      days.appendChild(b);
    }
  };

  const selectDate = (key) => {
    selected = key;
    days.querySelectorAll('.cal__day').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.textContent === String(fromKey(key).getDate())));
    });
    const date = fromKey(key);
    timesLabel.textContent = `${date.getMonth() + 1}月${date.getDate()}日（${WEEK[date.getDay()]}）の時間を選択`;
    slots.textContent = '';
    timeSlots().forEach((time) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cal__slot';
      b.textContent = time;
      const taken = opts.taken.includes(`${key} ${time}`);
      b.disabled = taken;
      if (taken) b.title = 'ほかの希望で選択済みです';
      const isCurrent = opts.current && opts.current.date === key && opts.current.time === time;
      b.setAttribute('aria-pressed', String(Boolean(isCurrent)));
      b.addEventListener('click', () => {
        opts.onSelect({ date: key, time });
        close();
      });
      slots.appendChild(b);
    });
    times.hidden = false;
    times.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const close = () => {
    if (dialog.open) dialog.close();
  };

  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('is-locked');
    if (opts && opts.opener) opts.opener.focus();
  });
  // 背景（ダイアログの外側）をタップしたら閉じる
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  dialog.querySelector('[data-cal-close]').addEventListener('click', close);
  prev.addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    renderMonth();
  });
  next.addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    renderMonth();
  });

  return {
    open(options) {
      opts = options;
      title.textContent = options.title;
      selected = options.current ? options.current.date : null;
      const base = selected ? fromKey(selected) : minDate;
      view = new Date(base.getFullYear(), base.getMonth(), 1);
      times.hidden = true;
      renderMonth();
      if (selected) selectDate(selected);
      document.documentElement.classList.add('is-locked');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    },
  };
}

function timeSlots() {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const list = [];
  for (let t = toMin(RESERVATION.firstTime); t <= toMin(RESERVATION.lastTime); t += RESERVATION.stepMinutes) {
    list.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return list;
}

function formatSlot(key, time, withYear = false) {
  const d = fromKey(key);
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${withYear ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日（${w}）${time}`;
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* ---------- 日本の祝日（内閣府の規則に基づき計算） ---------- */
const holidayCache = new Map();
function jpHolidays(y) {
  if (holidayCache.has(y)) return holidayCache.get(y);
  const h = new Map();
  const add = (m, d, name) => h.set(toKey(new Date(y, m - 1, d)), name);
  const nthMonday = (m, n) => 1 + ((8 - new Date(y, m - 1, 1).getDay()) % 7) + 7 * (n - 1);
  const shunbun = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  const shubun = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

  add(1, 1, '元日');
  add(1, nthMonday(1, 2), '成人の日');
  add(2, 11, '建国記念の日');
  add(2, 23, '天皇誕生日');
  add(3, shunbun, '春分の日');
  add(4, 29, '昭和の日');
  add(5, 3, '憲法記念日');
  add(5, 4, 'みどりの日');
  add(5, 5, 'こどもの日');
  add(7, nthMonday(7, 3), '海の日');
  add(8, 11, '山の日');
  add(9, nthMonday(9, 3), '敬老の日');
  add(9, shubun, '秋分の日');
  add(10, nthMonday(10, 2), 'スポーツの日');
  add(11, 3, '文化の日');
  add(11, 23, '勤労感謝の日');

  // 国民の休日：祝日にはさまれた平日
  Array.from(h.keys()).forEach((key) => {
    const mid = addDays(fromKey(key), 1);
    if (!h.has(toKey(mid)) && h.has(toKey(addDays(mid, 1))) && mid.getDay() !== 0) {
      h.set(toKey(mid), '国民の休日');
    }
  });
  // 振替休日：日曜の祝日の後の、最初の祝日でない日
  Array.from(h.keys()).forEach((key) => {
    const d = fromKey(key);
    if (d.getDay() !== 0) return;
    let sub = addDays(d, 1);
    while (h.has(toKey(sub))) sub = addDays(sub, 1);
    h.set(toKey(sub), '振替休日');
  });

  holidayCache.set(y, h);
  return h;
}

async function sendReservation(data) {
  if (!RESERVE_ENDPOINT) {
    // ダミー送信（送信先URLの設定前）
    console.info('[Danke] ダミー送信:', data);
    await new Promise((r) => setTimeout(r, 600));
    return;
  }
  // URLSearchParams で送るとプリフライトなしの単純なリクエストになり、Apps Script の応答を読める
  const res = await fetch(RESERVE_ENDPOINT, { method: 'POST', body: new URLSearchParams(data) });
  const result = await res.json();
  if (!result.ok) throw new Error(result.error || 'reservation failed');
}

// 全角英数・記号を半角に揃える
function toHalfWidth(str) {
  return str.normalize('NFKC');
}
