// ================================================================
// قاعدة البيانات المحلية - Dexie.js (IndexedDB)
// ================================================================
// db مُعرَّف في الأعلى

// ================================================================
// الإعدادات
// ================================================================
const SUPABASE_URL = 'https://ziehhwdphavnbmltxnmc.supabase.co';
const LOGIN_URL    = SUPABASE_URL + '/functions/v1/login-final';
const SYNC_URL     = SUPABASE_URL + '/functions/v1/offline-sync';

let SESSION = null;
let CUR = '₪';
let currentCustomer = null;
let currentTxId = null;
let repDate = new Date().toISOString().slice(0,10);
let prevScreen = 's-home';
let invRows = [];
let currentInvoice = null;
let custSortMode = 'debt';   // وضع الفرز الحالي
let custSearchQ  = '';       // نص البحث الحالي
let PLAN = null;

// ================================================================
// إعداد المتجر والاتفاقية
// ================================================================
let currentSetupLogo = '🏪';

const TYPE_TO_LOGO = {
  'بقالة':             '🏪',
  'خضروات وفاكهة':    '🥬',
  'لحوم ودواجن':      '🥩',
  'مخبز وحلويات':     '🍞',
  'أدوية وصيدلية':    '💊',
  'أدوات ومواد بناء': '🔧',
  'ملابس وأقمشة':     '👕',
  'إلكترونيات':       '📱',
  'مطعم أو مقهى':     '☕',
  'أخرى':             '🎁'
};

const LOGO_TO_TYPE = {
  '🏪': 'بقالة',
  '🛒': 'بقالة',
  '🥩': 'لحوم ودواجن',
  '🥬': 'خضروات وفاكهة',
  '🍞': 'مخبز وحلويات',
  '🧴': 'بقالة',
  '👕': 'ملابس وأقمشة',
  '💊': 'أدوية وصيدلية',
  '🔧': 'أدوات ومواد بناء',
  '📱': 'إلكترونيات',
  '☕': 'مطعم أو مقهى',
  '🎁': 'أخرى'
};

function setStoreLogo(emoji) {
  currentSetupLogo = emoji;
  const preview = document.getElementById('setup-logo-preview');
  if (preview) preview.textContent = emoji;
  document.querySelectorAll('.logo-btn').forEach(b => {
    b.classList.remove('active');
    if (b.textContent.trim() === emoji) b.classList.add('active');
  });
  // مسح أي صورة مرفوعة
  const imgPrev = document.getElementById('logo-img-preview');
  if (imgPrev) imgPrev.innerHTML = '';
  // تغيير نوع المتجر تلقائياً
  const typeEl = document.getElementById('setup-type');
  if (typeEl && LOGO_TO_TYPE[emoji]) {
    for (let i = 0; i < typeEl.options.length; i++) {
      if (typeEl.options[i].value === LOGO_TO_TYPE[emoji] ||
          typeEl.options[i].text  === LOGO_TO_TYPE[emoji]) {
        typeEl.selectedIndex = i;
        break;
      }
    }
  }
}

function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 500 * 1024) {
    alert('حجم الصورة كبير — الحد الأقصى 500KB');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    currentSetupLogo = e.target.result;
    // عرض المعاينة
    const imgPrev = document.getElementById('logo-img-preview');
    if (imgPrev) {
      imgPrev.innerHTML = `<img src="${e.target.result}"
        style="height:48px;width:48px;object-fit:contain;border-radius:8px">`;
    }
    const prev = document.getElementById('setup-logo-preview');
    if (prev) {
      prev.innerHTML = `<img src="${e.target.result}"
        style="height:60px;width:60px;object-fit:contain;border-radius:10px">`;
    }
    // إلغاء تحديد الإيموجي
    document.querySelectorAll('.logo-btn').forEach(b => b.classList.remove('active'));
  };
  reader.readAsDataURL(file);
}

function onTypeChange() {
  const sel  = document.getElementById('setup-type');
  const type = sel.options[sel.selectedIndex].text;
  const logo = TYPE_TO_LOGO[type];
  if (logo) setStoreLogo(logo);
}

const CURRENCY_NAMES = {
  '₪':'شيكل إسرائيلي جديد','د.أ':'دينار أردني','ر.س':'ريال سعودي',
  'ج.م':'جنيه مصري','د.إ':'درهم إماراتي','ل.س':'ليرة سورية',
  'د.ع':'دينار عراقي','ل.ل':'ليرة لبنانية','د.ك':'دينار كويتي',
  'د.م':'درهم مغربي','د.ت':'دينار تونسي','د.ج':'دينار جزائري',
  'د.ل':'دينار ليبي','ر.ي':'ريال يمني','ج.س':'جنيه سوداني',
  'ر.ق':'ريال قطري','د.ب':'دينار بحريني','ر.ع':'ريال عُماني'
};

function onCountryChange() {
  const sel = document.getElementById('setup-country');
  const opt = sel.options[sel.selectedIndex];
  const sym  = opt.dataset.sym || '';
  const hint = document.getElementById('currency-hint');
  const symEl  = document.getElementById('currency-sym');
  const nameEl = document.getElementById('currency-name');
  if (hint && sym) {
    hint.style.display = 'flex';
    if (symEl)  symEl.textContent  = sym;
    if (nameEl) nameEl.textContent = CURRENCY_NAMES[sym] || sym;
  } else if (hint) {
    hint.style.display = 'none';
  }
}

function acceptTermsAndSetup() {
  // حفظ الموافقة محلياً
  localStorage.setItem('terms_agreed', Date.now().toString());
  showScreen('s-setup-shop');
  // تعبئة الرقم كواتساب افتراضياً
  if (SESSION?.phone) {
    document.getElementById('setup-wa').value = SESSION.phone;
  }
  // تعبئة اسم صاحب المتجر تلقائياً
  const ownerEl = document.getElementById('setup-owner');
  if (SESSION?.name && ownerEl) ownerEl.value = SESSION.name;
  // تفعيل الشعار الافتراضي
  setStoreLogo('🏪');
}

async function saveShopSetup() {
  const shop    = document.getElementById('setup-shop').value.trim();
  const owner   = document.getElementById('setup-owner').value.trim();
  const country = document.getElementById('setup-country').value;
  const city    = document.getElementById('setup-city').value.trim();
  const email   = document.getElementById('setup-email').value.trim();
  const phone   = document.getElementById('setup-wa').value.trim();
  const wa      = document.getElementById('setup-whatsapp').value.trim() || phone;
  const type    = document.getElementById('setup-type').value;
  const err     = document.getElementById('setup-err');

  const isUpgradeMode = localStorage.getItem('upgrade_mode') === '1';

  const showSetupErr = (msg) => {
    err.innerHTML = msg;
    err.style.display = 'block';
    err.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // تحقق من الحقول المطلوبة
  if (!shop)    { showSetupErr('⚠️ أدخل اسم المتجر'); return; }
  if (!owner)   { showSetupErr('⚠️ أدخل اسمك كصاحب المتجر'); return; }
  if (!country) { showSetupErr('⚠️ اختر البلد من القائمة'); return; }
  if (!phone)   { showSetupErr('⚠️ أدخل رقم الهاتف'); return; }

  // حقول إضافية إلزامية عند الاشتراك السحابي
  if (isUpgradeMode) {
    if (!email) { showSetupErr('⚠️ البريد الإلكتروني مطلوب للاشتراك السحابي'); return; }
  }

  err.style.display = 'none';

  // تحديث العملة
  const sel = document.getElementById('setup-country');
  const opt = sel.options[sel.selectedIndex];
  const sym = opt.dataset.sym || SESSION?.currency || '₪';

  try {
    if (!SESSION) throw new Error('لا توجد جلسة — حاول تسجيل الدخول مجدداً');

    // حفظ في الجلسة المحلية فوراً
    SESSION.shop_name       = shop;
    SESSION.name            = owner;
    SESSION.currency        = sym;
    SESSION.store_logo      = currentSetupLogo;
    SESSION.country_code    = country;
    SESSION.onboarding_done = true;
    SESSION.agreed_to_terms = true;
    SESSION.phone           = phone;
    CUR = sym;
    localStorage.setItem('dd_session', JSON.stringify(SESSION));
    localStorage.setItem('session',    JSON.stringify(SESSION));
    localStorage.setItem('onboarding_done', '1');

    // حفظ في Supabase إذا يوجد نت
    if (navigator.onLine) {
      try {
        await fetch(SYNC_URL, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            action: 'save_profile',
            tok: SESSION.token,
            shop_name: shop, owner_name: owner,
            country_code: country, currency_sym: sym,
            store_type: type, store_logo: currentSetupLogo,
            city, email, whatsapp: wa, agreed: true
          })
        });
      } catch(e) { /* صامت — سيُرحَّل لاحقاً */ }
    } else {
      await addToQueue('save_profile', {
        shop_name: shop, owner_name: owner,
        country_code: country, currency_sym: sym,
        store_type: type, store_logo: currentSetupLogo,
        city, email, whatsapp: wa, agreed: true
      });
    }

    // إذا كان في وضع الترقية → افتح موديل الاشتراك
    if (isUpgradeMode) {
      localStorage.removeItem('upgrade_mode');
      document.getElementById('shop-name').textContent = shop;
      showScreen('s-home');
      await loadHomeData();
      updateSubscriptionUI();
      monitorConnection();
      setTimeout(showUpgradeModal, 400);
      return;
    }
    // انتقل للشاشة الرئيسية
    document.getElementById('shop-name').textContent = shop;
    showScreen('s-home');
    await loadHomeData();
    updateSubscriptionUI();
    monitorConnection();
    if (navigator.onLine) setTimeout(doSync, 1000);
    checkLongPending();
    setInterval(checkLongPending, 30 * 60 * 1000);

  } catch(e) {
    showSetupErr('❌ خطأ: ' + e.message);
    console.error('saveShopSetup error:', e);
  }
}

// ================================================================
// نظام الاشتراك — Freemium
// ================================================================
function getPlanInfo() {
  if (PLAN) return PLAN;
  // افتراضي: مجاني
  return {plan:'free',can_sync:false,max_customers:50,label:'مجاني',
          cust_count:0,tx_count:0,price:0};
}

function planBadgeHTML(plan) {
  const cls = plan==='pro'?'plan-pro':plan==='basic'?'plan-basic':
              plan==='trial'?'plan-trial':'plan-free';
  const icon = plan==='pro'?'⭐':plan==='basic'?'🔵':plan==='trial'?'🎁':'🔒';
  const lbl  = PLAN?.label || (plan==='pro'?'محترف':plan==='basic'?'أساسي':
               plan==='trial'?'تجريبي':'مجاني');
  return `<span class="plan-badge ${cls}">${icon} ${lbl}</span>`;
}

function updateSubscriptionUI() {
  const p = getPlanInfo();
  const settingsInfo = document.getElementById('settings-info');
  if (!settingsInfo || !SESSION) return;

  // شريط التقدم للزبائن
  const custPct = p.max_customers===-1 ? 0 : Math.min(100, (p.cust_count/p.max_customers)*100);
  const custColor = custPct>85?'var(--red)':custPct>60?'var(--yel)':'var(--grn)';
  const custLimit = p.max_customers===-1 ? 'غير محدود' : `${p.cust_count} / ${p.max_customers}`;

  settingsInfo.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-size:18px;font-weight:900;color:var(--txt)">${SESSION.shop_name||SESSION.name}</div>
        <div style="font-size:13px;color:var(--txt3);margin-top:3px;direction:ltr">${SESSION.phone||''}</div>
      </div>
      ${planBadgeHTML(p.plan)}
    </div>
    <div style="font-size:13px;color:var(--txt2);margin-bottom:10px">${p.desc||''}</div>
    <div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--txt2);margin-bottom:4px">
        <span>عدد الزبائن</span>
        <span style="font-weight:700;color:${custColor}">${custLimit}</span>
      </div>
      ${p.max_customers!==-1?`<div class="limit-bar">
        <div class="limit-fill" style="width:${custPct}%;background:${custColor}"></div>
      </div>`:''}
    </div>
    ${p.can_sync
      ? `<div style="font-size:13px;color:var(--grn);font-weight:700">
           ✅ النسخ الاحتياطي السحابي مفعّل
           ${p.sub_ends?`— ينتهي ${new Date(p.sub_ends).toLocaleDateString('ar-EG',{day:'numeric',month:'long'})}`:''}
         </div>`
      : `<div style="font-size:13px;color:var(--txt3);font-weight:700">
           🔒 بياناتك محلية فقط — لا نسخ احتياطي
         </div>`}`;

  // شريط الترقية للمجانيين
  const upgradeEl = document.getElementById('upgrade-banner');
  if (!p.can_sync && upgradeEl) {
    upgradeEl.style.display = 'block';
  } else if (upgradeEl) {
    upgradeEl.style.display = 'none';
  }
  // زر الترحيل — للمشتركين فقط
  const syncBtn = document.getElementById('sync-btn');
  if (syncBtn) syncBtn.style.display = p.can_sync ? 'inline-block' : 'none';
  // الشعار المائي
  const wm = document.getElementById('logo-watermark');
  if (wm && SESSION?.store_logo) {
    if (SESSION.store_logo.startsWith('data:')) {
      wm.innerHTML = `<img src="${SESSION.store_logo}"
        style="width:140px;height:140px;object-fit:contain;opacity:0.5">`;
    } else {
      wm.textContent = SESSION.store_logo;
    }
  }

  // تحذير قرب الحد
  if (p.max_customers!==-1 && p.cust_count >= p.max_customers*0.9) {
    const warn = document.getElementById('pending-warn');
    if (warn && warn.style.display==='none') {
      warn.style.display='block';
      warn.style.background='rgba(217,119,6,.9)';
      warn.innerHTML=`⚠️ وصلت لـ ${p.cust_count} من أصل ${p.max_customers} زبون — <b>ارقِّ خطتك قبل الامتلاء</b>`;
    }
  }
}

// فحص اكتمال البيانات قبل الاشتراك السحابي
function checkProfileForCloud() {
  if (!SESSION) return false;
  const missing = [];
  if (!SESSION.shop_name) missing.push('اسم المتجر');
  if (!SESSION.name)      missing.push('اسمك (صاحب المتجر)');
  if (!SESSION.country_code) missing.push('البلد');
  if (!SESSION.phone)     missing.push('رقم الهاتف');
  if (!SESSION.email)     missing.push('البريد الإلكتروني');
  if (!SESSION.whatsapp_phone && !SESSION.phone) missing.push('رقم الواتساب');
  return missing;
}

function goCompleteProfileThenUpgrade() {
  closeModal('m-contact');
  // ضبط وضع "إكمال للسحابة"
  localStorage.setItem('upgrade_mode', '1');
  // الانتقال لشاشة الإعداد مع تمييز الحقول الناقصة
  showScreen('s-setup-shop');
  const waEl = document.getElementById('setup-wa');
  if (SESSION?.phone && waEl) waEl.value = SESSION.phone;
  // تعبئة ما هو موجود مسبقاً
  const shopEl  = document.getElementById('setup-shop');
  const ownerEl = document.getElementById('setup-owner');
  const emailEl = document.getElementById('setup-email');
  const cityEl  = document.getElementById('setup-city');
  const waWaEl  = document.getElementById('setup-whatsapp');
  if (shopEl  && SESSION.shop_name) shopEl.value  = SESSION.shop_name;
  if (ownerEl && SESSION.name)      ownerEl.value = SESSION.name;
  if (emailEl && SESSION.email)     emailEl.value = SESSION.email;
  if (cityEl  && SESSION.city)      cityEl.value  = SESSION.city;
  if (waWaEl  && SESSION.whatsapp_phone) waWaEl.value = SESSION.whatsapp_phone;
  setStoreLogo(SESSION.store_logo || '🏪');
  // تمييز الحقول الناقصة باللون الأحمر
  const missing = checkProfileForCloud();
  if (missing.length > 0) {
    const err = document.getElementById('setup-err');
    if (err) {
      err.innerHTML = `⚠️ لإكمال الاشتراك السحابي يجب تعبئة: <b>${missing.join(' — ')}</b>`;
      err.style.display = 'block';
      err.style.background = 'rgba(251,191,36,.15)';
      err.style.color = '#92400e';
      err.style.border = '1.5px solid rgba(251,191,36,.4)';
      err.style.borderRadius = '10px';
      err.style.padding = '12px';
    }
    // تمييز الحقول الناقصة
    if (!SESSION.email) {
      const el = document.getElementById('setup-email');
      if (el) el.style.borderColor = 'var(--red)';
    }
    if (!SESSION.whatsapp_phone) {
      const el = document.getElementById('setup-whatsapp');
      if (el) el.style.borderColor = 'var(--yel)';
    }
    if (!SESSION.country_code) {
      const el = document.getElementById('setup-country');
      if (el) el.style.borderColor = 'var(--red)';
    }
  }
  // تغيير زر الحفظ
  const saveBtn = document.querySelector('[onclick="saveShopSetup()"]');
  if (saveBtn) {
    saveBtn.textContent = '✅ حفظ والمتابعة للاشتراك';
    saveBtn.style.background = 'linear-gradient(135deg,#1e3a8a,#3b82f6)';
  }
}

function showUpgradeModal() {
  const p = getPlanInfo();
  const currency = p.currency || '₪';
  document.getElementById('contact-title').textContent = '🚀 ارقِّ خطتك';
  document.getElementById('contact-body').innerHTML = `
    <p style="font-size:15px;color:var(--txt2);line-height:1.7;margin-bottom:16px">
      اشترك الآن وتمتع بالنسخ الاحتياطي التلقائي وحماية بياناتك.
    </p>
    <div style="display:grid;gap:12px;margin-bottom:16px">
      <div style="background:rgba(59,130,246,.1);border:2px solid rgba(59,130,246,.3);border-radius:14px;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:18px;font-weight:900;color:var(--pri)">🔵 أساسي</div>
          <div style="font-size:20px;font-weight:900;color:var(--pri)">11 ${currency}<span style="font-size:13px;color:var(--txt3)">/شهر</span></div>
        </div>
        <ul style="padding-right:18px;font-size:14px;color:var(--txt2);line-height:2">
          <li>✅ نسخ احتياطي تلقائي يومياً</li>
          <li>✅ استعادة البيانات على أي جهاز</li>
          <li>✅ حتى 200 زبون</li>
          <li>✅ إرسال كشف الحساب للزبون</li>
          <li>✅ تاريخ آخر 90 يوم</li>
        </ul>
      </div>
      <div style="background:rgba(251,191,36,.1);border:2px solid rgba(251,191,36,.3);border-radius:14px;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:18px;font-weight:900;color:var(--yel)">⭐ محترف</div>
          <div style="font-size:20px;font-weight:900;color:var(--yel)">26 ${currency}<span style="font-size:13px;color:var(--txt3)">/شهر</span></div>
        </div>
        <ul style="padding-right:18px;font-size:14px;color:var(--txt2);line-height:2">
          <li>✅ كل مزايا الأساسي</li>
          <li>✅ زبائن غير محدودين</li>
          <li>✅ كل التاريخ منذ البداية</li>
          <li>⭐ أولوية في الدعم</li>
        </ul>
      </div>
    </div>
    ${(()=>{
      const missing = checkProfileForCloud();
      if (missing.length > 0) {
        return `<div style="background:rgba(251,191,36,.15);border:1.5px solid rgba(251,191,36,.4);
          border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:14px;color:#92400e;line-height:1.7">
          ⚠️ قبل الاشتراك يجب إكمال بياناتك:<br>
          <b>${missing.join(' — ')}</b>
        </div>
        <button onclick="goCompleteProfileThenUpgrade()"
          style="display:block;width:100%;text-align:center;padding:14px;
          background:linear-gradient(135deg,#1e3a8a,#3b82f6);border:none;
          border-radius:12px;color:#fff;font-size:16px;font-weight:800;cursor:pointer;margin-bottom:8px">
          📝 أكمل بياناتك ثم اشترك
        </button>`;
      } else {
        const shopName = encodeURIComponent(SESSION?.shop_name||'تاجر');
        return `<a href="https://wa.me/970591234567?text=أريد الاشتراك — ${shopName}" target="_blank"
          style="display:block;text-align:center;padding:14px;background:linear-gradient(135deg,#065f46,#10b981);
          border-radius:12px;color:#fff;font-size:16px;font-weight:800;text-decoration:none;margin-bottom:8px">
          📲 اشترك الآن عبر واتساب
        </a>`;
      }
    })()}
    <div style="text-align:center;font-size:12px;color:var(--txt3);margin-top:8px">
      14 يوم تجريبي مجاني عند الاشتراك لأول مرة
    </div>`;
  openModal('m-contact');
}

// فحص الحد قبل إضافة زبون
function checkCanAddCustomer() {
  const p = getPlanInfo();
  if (p.max_customers === -1) return true;
  if (p.cust_count >= p.max_customers) {
    showUpgradeModal();
    return false;
  }
  return true;
}

// ================================================================
// إرسال كشف الحساب للزبون
// ================================================================
let stmtCustomer = null;

async function sendStatementToCustomer() {
  if (!currentCustomer) return;
  const cust = await db.get('customers', currentCustomer) || {};
  const txs  = await db.getAllByIndex('transactions','customer_id',currentCustomer);
  stmtCustomer = cust;

  const debts     = txs.filter(t=>!t.is_partial_payment);
  const totalDebt = debts.reduce((s,t)=>s+Number(t.amount||0),0);
  const totalPaid = txs.filter(t=>t.is_partial_payment&&t.status==='مدفوع')
    .reduce((s,t)=>s+Number(t.amount||0),0);
  const bal  = Math.max(0, totalDebt - totalPaid);
  const date = new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const shop = SESSION.shop_name || 'دفتر الدين';

  // ترتيب: معلقة أولاً ثم مسددة
  const buildRows = (list) => list.map((t,i) => {
    const paid = txs.filter(p=>p.partial_payment_parent_id===t.id)
      .reduce((s,p)=>s+Number(p.amount||0),0);
    const rem  = Math.max(0, Number(t.amount)-paid);
    const dt   = t.created_at ? new Date(t.created_at)
      .toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}) : '';
    const isPaid = rem <= 0;
    return `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
      <td style="padding:10px 8px;font-size:15px;font-weight:600">${t.description||'دين'}</td>
      <td style="padding:10px 8px;font-size:13px;color:#64748b;text-align:center;
        font-family:monospace">${dt}</td>
      <td style="padding:10px 8px;font-size:15px;font-weight:700;color:#dc2626;
        text-align:left;font-family:monospace">${Number(t.amount).toFixed(2)} ${CUR}</td>
      <td style="padding:10px 8px;font-size:15px;font-weight:800;text-align:left;
        font-family:monospace;color:${isPaid?'#16a34a':paid>0?'#b45309':'#dc2626'}">
        ${isPaid ? '✓ مسدَّد' : rem.toFixed(2)+' '+CUR}
      </td>
    </tr>`;
  }).join('');

  const unpaid = debts.filter(t=>{
    const p=txs.filter(x=>x.partial_payment_parent_id===t.id).reduce((s,x)=>s+Number(x.amount||0),0);
    return Number(t.amount)-p > 0;
  });
  const paid = debts.filter(t=>{
    const p=txs.filter(x=>x.partial_payment_parent_id===t.id).reduce((s,x)=>s+Number(x.amount||0),0);
    return Number(t.amount)-p <= 0;
  });

  const logoHTML = SESSION?.store_logo?.startsWith('data:')
    ? `<img src="${SESSION.store_logo}" style="height:50px;width:50px;object-fit:contain;border-radius:8px">`
    : `<span style="font-size:36px">${SESSION?.store_logo||'📒'}</span>`;

  const stmtHTML = `<div id="stmt-print" dir="rtl"
    style="font-family:Arial,sans-serif;background:#fff;color:#111;
    padding:20px;border-radius:12px">

    <!-- رأس الكشف -->
    <div style="text-align:center;border-bottom:3px solid #1e3a8a;
      padding-bottom:16px;margin-bottom:16px">
      ${logoHTML}
      <div style="font-size:22px;font-weight:900;color:#1e3a8a;margin-top:8px">${shop}</div>
      ${SESSION?.city?`<div style="font-size:13px;color:#64748b">${SESSION.city}</div>`:''}
      <div style="font-size:14px;font-weight:700;color:#475569;margin-top:4px">
        كشف حساب زبون
      </div>
    </div>

    <!-- بيانات الزبون والتاريخ -->
    <div style="display:flex;justify-content:space-between;
      background:#f8fafc;border-radius:10px;padding:12px 16px;margin-bottom:16px">
      <div>
        <div style="font-size:12px;color:#64748b;font-weight:700">الزبون</div>
        <div style="font-size:19px;font-weight:900">${cust.name||'—'}</div>
        <div style="font-size:14px;color:#3b82f6;direction:ltr">${cust.phone||''}</div>
      </div>
      <div style="text-align:left">
        <div style="font-size:12px;color:#64748b;font-weight:700">تاريخ الكشف</div>
        <div style="font-size:14px;font-weight:700">${date}</div>
        <div style="font-size:12px;color:#64748b;margin-top:4px">${debts.length} معاملة</div>
      </div>
    </div>

    <!-- الديون المعلقة -->
    ${unpaid.length > 0 ? `
    <div style="font-size:14px;font-weight:800;color:#dc2626;
      margin-bottom:8px;padding:6px 0;border-bottom:2px solid #fecaca">
      🔴 المعاملات المعلقة (${unpaid.length})
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#7f1d1d;color:#fff">
        <th style="padding:9px 8px;text-align:right;font-size:13px">البيان</th>
        <th style="padding:9px 8px;text-align:center;font-size:13px">التاريخ</th>
        <th style="padding:9px 8px;text-align:left;font-size:13px">المبلغ</th>
        <th style="padding:9px 8px;text-align:left;font-size:13px">المتبقي</th>
      </tr></thead>
      <tbody>${buildRows(unpaid)}</tbody>
    </table>` : ''}

    <!-- المعاملات المسددة -->
    ${paid.length > 0 ? `
    <div style="font-size:14px;font-weight:800;color:#16a34a;
      margin-bottom:8px;padding:6px 0;border-bottom:2px solid #bbf7d0">
      ✅ المعاملات المسددة (${paid.length})
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#14532d;color:#fff">
        <th style="padding:9px 8px;text-align:right;font-size:13px">البيان</th>
        <th style="padding:9px 8px;text-align:center;font-size:13px">التاريخ</th>
        <th style="padding:9px 8px;text-align:left;font-size:13px">المبلغ</th>
        <th style="padding:9px 8px;text-align:left;font-size:13px">الحالة</th>
      </tr></thead>
      <tbody>${buildRows(paid)}</tbody>
    </table>` : ''}

    <!-- الرصيد الإجمالي -->
    <div style="background:${bal>0?'#fef2f2':'#f0fdf4'};border-radius:12px;
      padding:14px 18px;display:flex;justify-content:space-between;align-items:center;
      border:2px solid ${bal>0?'#fecaca':'#bbf7d0'}">
      <div>
        <div style="font-size:16px;font-weight:800;color:${bal>0?'#991b1b':'#166534'}">
          ${bal>0?'الرصيد المستحق عليك':'حسابك مسوَّى ✓'}
        </div>
        ${bal>0?`<div style="font-size:12px;color:#b91c1c;margin-top:2px">
          يرجى السداد في أقرب وقت</div>`:''}
      </div>
      <div style="font-size:26px;font-weight:900;color:${bal>0?'#dc2626':'#16a34a'};
        font-family:monospace">
        ${bal.toFixed(2)} ${CUR}
      </div>
    </div>

    <div style="text-align:center;margin-top:14px;font-size:12px;color:#94a3b8">
      شكراً لتعاملكم — ${shop}
    </div>
  </div>`;

  document.getElementById('stmt-send-content').innerHTML = stmtHTML;
  openModal('m-stmt-send');
}

function buildStmtText() {
  if (!stmtCustomer) return '';
  const shop = SESSION.shop_name || 'دفتر الدين';
  const date = new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const el   = document.getElementById('stmt-send-content');
  const rows = el.querySelectorAll('tbody tr');
  const balEl= el.querySelector('[style*="font-size:26px"]');

  let txt = `📒 *كشف حساب — ${shop}*
`;
  txt += `👤 *${stmtCustomer.name}*
`;
  txt += `📅 ${date}
`;
  txt += `━━━━━━━━━━━━━━━━━━
`;
  rows.forEach(r => {
    const c = r.querySelectorAll('td');
    if (c.length >= 4) {
      const desc = c[0].textContent.trim();
      const rem  = c[3].textContent.trim();
      txt += `• ${desc} — ${rem}
`;
    }
  });
  txt += `━━━━━━━━━━━━━━━━━━
`;
  if (balEl) txt += `💰 *الرصيد: ${balEl.textContent.trim()}*
`;
  txt += `شكراً لتعاملكم 🙏`;
  return txt;
}

function sendStmtWhatsapp() {
  const phone = (stmtCustomer?.phone||'').replace(/[^0-9]/g,'');
  const txt   = buildStmtText();
  window.open(phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(txt)}`
    : `https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank');
}

function sendStmtEmail() {
  const email = stmtCustomer?.email || '';
  const txt   = buildStmtText();
  window.open(`mailto:${email}?subject=${encodeURIComponent('كشف حساب — '+(stmtCustomer?.name||''))}&body=${encodeURIComponent(txt)}`, '_blank');
}

function printStmt() {
  const content = document.getElementById('stmt-print')?.outerHTML || '';
  const w = window.open('','_blank','width=700,height=900');
  w.document.write(`<html><head><meta charset="utf-8">
    <title>كشف حساب — ${stmtCustomer?.name||''}</title>
    <style>body{margin:20px;background:#fff}
    @media print{body{margin:0}}</style></head>
    <body>${content}
    <script>window.onload=()=>{window.print();window.close()}<\/script>
    </body></html>`);
  w.document.close();
}

// ================================================================
// طلبات التواصل مع المنصة
// ================================================================
const CONTACT_TYPES = {
  data_recovery:{title:'🔄 استعادة البيانات',
    desc:'لاستعادة بياناتك على جهاز جديد أو بعد عطل — يتم التحقق من هويتك أولاً.',
    note:'سيتواصل معك فريق المنصة خلال 24 ساعة للتحقق من هويتك ثم استعادة بياناتك.'},
  change_phone:{title:'📱 تغيير رقم الجوال',
    desc:'لنقل حسابك إلى رقم جوال جديد — يتطلب التحقق من هويتك.',
    note:'لا يمكن تغيير الرقم ذاتياً لحماية حسابك. سيتواصل معك الفريق للتأكيد.'},
  add_phone:{title:'➕ إضافة رقم جوال إضافي',
    desc:'لتمكين الدخول من أكثر من رقم جوال على نفس الحساب.',
    note:'يمكن إضافة أرقام إضافية (زوج، شريك...) — يُفعَّل بعد التحقق من هويتك.'},
  other:{title:'💬 استفسار آخر',desc:'أي سؤال أو مشكلة تقنية أو اقتراح.',note:''}
};

function openContactRequest(type){
  const info=CONTACT_TYPES[type]||CONTACT_TYPES.other;
  document.getElementById('contact-title').textContent=info.title;
  document.getElementById('contact-body').innerHTML=`
    <p style="font-size:15px;color:var(--txt2);line-height:1.7;margin-bottom:14px">${info.desc}</p>
    ${info.note?`<div style="background:rgba(59,130,246,.1);border:1.5px solid rgba(59,130,246,.25);border-radius:10px;padding:12px;font-size:14px;color:var(--pri);margin-bottom:16px;line-height:1.6">ℹ️ ${info.note}</div>`:''}
    <div class="fg"><label>تفاصيل إضافية (اختياري)</label>
      <input type="text" id="contact-details" class="fi" placeholder="اكتب أي معلومات إضافية..."></div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn" style="flex:1;background:var(--bg3);color:var(--txt);border:none;border-radius:10px;padding:13px;font-size:16px;cursor:pointer" onclick="closeModal('m-contact')">إلغاء</button>
      <button class="btn" style="flex:2;background:linear-gradient(135deg,var(--pri),#60a5fa);color:#fff;border:none;border-radius:10px;padding:13px;font-size:16px;font-weight:700;cursor:pointer" onclick="submitContactRequest('${type}')">إرسال الطلب</button>
    </div>
    <a href="https://wa.me/970591234567?text=${encodeURIComponent(info.title+' — '+(SESSION?.name||'تاجر'))}" target="_blank"
      style="display:block;text-align:center;margin-top:12px;padding:12px;background:rgba(37,211,102,.12);border:1.5px solid rgba(37,211,102,.3);border-radius:10px;color:#25d366;font-size:15px;font-weight:700;text-decoration:none">
      📲 أو تواصل واتساب مباشرة</a>`;
  openModal('m-contact');
}

async function submitContactRequest(type){
  const details=document.getElementById('contact-details')?.value?.trim();
  // إرسال عبر Edge Function بدل RPC مباشر (لا يحتاج ANON_KEY)
  if(SESSION && navigator.onLine){
    try{
      await fetch(`${SYNC_URL}`,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'contact_request',
          tok: SESSION.token,
          request_type: type,
          details: details||null
        })
      });
    }catch(e){}
  }
  // حفظ الطلب محلياً إذا لم يوجد نت
  else {
    await addToQueue('contact_request',{type, details: details||null});
  }
  closeModal('m-contact');
  document.getElementById('contact-body').innerHTML=`<div style="text-align:center;padding:24px">
    <div style="font-size:3em;margin-bottom:12px">✅</div>
    <div style="font-size:17px;font-weight:800;color:var(--txt);margin-bottom:8px">تم إرسال طلبك</div>
    <div style="font-size:14px;color:var(--txt2);line-height:1.7">سيتواصل معك فريق المنصة خلال 24 ساعة.</div></div>`;
  openModal('m-contact');
}

// ================================================================
// ================================================================
// معدلات الضريبة حسب البلد
// ================================================================
const TAX_RATES = {
  PS:17, JO:16, SA:15, EG:14, AE:5, SY:10,
  IQ:0,  LB:11, KW:0,  MA:20, TN:19, DZ:19,
  LY:0,  YE:0,  SD:17, QA:0,  BH:10, OM:5
};

const TAX_NAMES = {
  PS:'ضريبة القيمة المضافة (VAT)', JO:'ضريبة المبيعات',
  SA:'ضريبة القيمة المضافة (VAT)', EG:'ضريبة القيمة المضافة',
  AE:'ضريبة القيمة المضافة', LB:'TVA', MA:'TVA',
  TN:'TVA', DZ:'TVA', BH:'VAT', OM:'VAT'
};

const UNITS_LIST = ['كيلو','غرام','علبة','كرتون','كيس','قطعة','لتر','طردة','حبة','متر','باكيت'];

// ================================================================
// إدارة مودال الفاتورة الجديد
// ================================================================
let invType = 'normal'; // normal | tax

function openInvoiceModal() {
  const custName = document.getElementById('add-cust-search')?.value || '';
  const nameEl = document.getElementById('inv-cust-name-display');
  if (nameEl) nameEl.textContent = custName ? `الزبون: ${custName}` : '';
  if (invRows.length === 0) addInvRowModal();
  setInvType(invType);
  renderInvRowsModal();
  document.getElementById('m-inv-modal').classList.add('open');
}

function closeInvoiceModal(confirm) {
  if (!confirm) {
    // إذا لم يؤكد — يمسح الفاتورة
    invRows = [];
    updateInvSummary();
  }
  document.getElementById('m-inv-modal').classList.remove('open');
  if (confirm) {
    const total = calcInvGrandTotal();
    if (total > 0) {
      document.getElementById('add-amount').value = total.toFixed(2);
    }
    updateInvSummary();
  }
}

function setInvType(type) {
  invType = type;
  document.getElementById('inv-type-normal').classList.toggle('active', type==='normal');
  document.getElementById('inv-type-tax').classList.toggle('active', type==='tax');
  const taxInfo = document.getElementById('inv-tax-info');
  const country = SESSION?.country_code || 'PS';
  const rate = TAX_RATES[country] || 0;
  const name = TAX_NAMES[country] || 'ضريبة القيمة المضافة';
  if (type === 'tax') {
    taxInfo.style.display = 'block';
    taxInfo.textContent = rate > 0
      ? `${name} ${rate}% — الأسعار قبل الضريبة، الإجمالي شامل الضريبة`
      : `⚠️ بلدك (${country}) لا توجد ضريبة مضافة مسجلة`;
  } else {
    taxInfo.style.display = 'none';
  }
  renderInvTotals();
}

function addInvRowModal() {
  invRows.push({ id: Date.now(), desc:'', unit:'', qty:1, price:0 });
  renderInvRowsModal();
}

function delInvRowModal(id) {
  invRows = invRows.filter(r => r.id !== id);
  renderInvRowsModal();
  renderInvTotals();
}

function renderInvRowsModal() {
  const container = document.getElementById('inv-rows-modal');
  if (!container) return;
  const country = SESSION?.country_code || 'PS';
  const rate = invType === 'tax' ? (TAX_RATES[country] || 0) : 0;

  container.innerHTML = invRows.map((r, idx) => {
    const rowTotal = r.qty * r.price * (1 + rate/100);
    return `<div class="inv-row-card" id="inv-card-${r.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:14px;font-weight:800;color:var(--txt2)">بند ${idx+1}</div>
        <button onclick="delInvRowModal(${r.id})"
          style="width:28px;height:28px;border:none;border-radius:7px;
          background:rgba(239,68,68,.1);color:var(--red);font-size:16px;cursor:pointer">✕</button>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:13px;color:var(--txt3);font-weight:700;margin-bottom:4px">الصنف</div>
        <input class="inv-field" value="${r.desc}" placeholder="اسم الصنف..."
          oninput="updateInvRowModal(${r.id},'desc',this.value)">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <div style="font-size:13px;color:var(--txt3);font-weight:700;margin-bottom:4px">الوحدة</div>
          <input class="inv-field" id="inv-unit-${r.id}" value="${r.unit}" placeholder="كيلو / علبة..."
            oninput="updateInvRowModal(${r.id},'unit',this.value)">
          <div class="unit-chips">
            ${UNITS_LIST.map(u=>`<button class="unit-chip ${r.unit===u?'active':''}"
              onclick="setUnit(${r.id},'${u}')">${u}</button>`).join('')}
          </div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--txt3);font-weight:700;margin-bottom:4px">الكمية</div>
          <input class="inv-field inv-num" type="number" value="${r.qty}" min="0.01" step="0.01"
            oninput="updateInvRowModal(${r.id},'qty',this.value)">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-size:13px;color:var(--txt3);font-weight:700;margin-bottom:4px">
            السعر ${rate>0?'(قبل الضريبة)':''}
          </div>
          <input class="inv-field inv-num" type="number" value="${r.price}" min="0" step="0.01"
            oninput="updateInvRowModal(${r.id},'price',this.value)">
        </div>
        <div>
          <div style="font-size:13px;color:var(--txt3);font-weight:700;margin-bottom:4px">
            الإجمالي ${rate>0?'(شامل الضريبة)':''}
          </div>
          <div class="inv-field inv-num" id="inv-row-total-${r.id}"
            style="background:var(--bg3);color:var(--grn);font-weight:900;
            display:flex;align-items:center;justify-content:flex-end">
            ${rowTotal.toFixed(2)}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  renderInvTotals();
}

function setUnit(id, unit) {
  const r = invRows.find(r=>r.id===id);
  if (r) {
    r.unit = r.unit === unit ? '' : unit;
    renderInvRowsModal();
  }
}

function updateInvRowModal(id, field, val) {
  const r = invRows.find(r=>r.id===id);
  if (!r) return;
  r[field] = field==='desc'||field==='unit' ? val : (parseFloat(val)||0);
  const country = SESSION?.country_code || 'PS';
  const rate = invType === 'tax' ? (TAX_RATES[country] || 0) : 0;
  const rowTotal = r.qty * r.price * (1 + rate/100);
  const totalEl = document.getElementById(`inv-row-total-${id}`);
  if (totalEl) totalEl.textContent = rowTotal.toFixed(2);
  renderInvTotals();
}

function calcInvGrandTotal() {
  const country = SESSION?.country_code || 'PS';
  const rate = invType === 'tax' ? (TAX_RATES[country] || 0) : 0;
  return invRows.reduce((s,r) => s + r.qty * r.price * (1 + rate/100), 0);
}

function renderInvTotals() {
  const el = document.getElementById('inv-totals-display');
  if (!el) return;
  const country = SESSION?.country_code || 'PS';
  const rate = invType === 'tax' ? (TAX_RATES[country] || 0) : 0;
  const grandTotal = calcInvGrandTotal();
  const taxName = TAX_NAMES[country] || 'الضريبة';

  if (invType === 'tax' && rate > 0) {
    const beforeTax = grandTotal / (1 + rate/100);
    const taxAmt    = grandTotal - beforeTax;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;padding:8px 0;
        border-bottom:1px solid var(--brd);font-size:15px;color:var(--txt2)">
        <span>المجموع قبل الضريبة</span>
        <span class="inv-num" style="font-weight:800">${beforeTax.toFixed(2)} ${CUR}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;
        border-bottom:1px solid var(--brd);font-size:15px;color:var(--yel);font-weight:700">
        <span>${taxName} (${rate}%)</span>
        <span class="inv-num">${taxAmt.toFixed(2)} ${CUR}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;
        font-size:20px;font-weight:900;color:var(--grn)">
        <span>الإجمالي الشامل</span>
        <span class="inv-num">${grandTotal.toFixed(2)} ${CUR}</span>
      </div>`;
  } else {
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;padding:10px 0;
        font-size:20px;font-weight:900;color:var(--grn)">
        <span>إجمالي الفاتورة</span>
        <span class="inv-num">${grandTotal.toFixed(2)} ${CUR}</span>
      </div>`;
  }
}

function updateInvSummary() {
  const summaryEl = document.getElementById('inv-summary');
  const totalEl   = document.getElementById('inv-summary-total');
  const btnEl     = document.getElementById('inv-toggle-btn');
  if (invRows.length > 0 && calcInvGrandTotal() > 0) {
    if (summaryEl) { summaryEl.style.display = 'flex'; }
    if (totalEl)   { totalEl.textContent = calcInvGrandTotal().toFixed(2) + ' ' + CUR; }
    if (btnEl)     { btnEl.style.display = 'none'; }
  } else {
    if (summaryEl) { summaryEl.style.display = 'none'; }
    if (btnEl)     { btnEl.style.display = 'block'; }
    invRows = [];
  }
}

// ================================================================
// بناء HTML الفاتورة للطباعة/المشاركة
// ================================================================
function buildInvHTML(cust, items, type) {
  const country = SESSION?.country_code || 'PS';
  const rate    = type === 'tax' ? (TAX_RATES[country] || 0) : 0;
  const taxName = TAX_NAMES[country] || 'ضريبة القيمة المضافة';
  const date    = new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const shop    = SESSION?.shop_name || 'دفتر الدين';
  const logoHTML = SESSION?.store_logo?.startsWith('data:')
    ? `<img src="${SESSION.store_logo}" style="height:50px;width:50px;object-fit:contain;border-radius:8px">`
    : `<span style="font-size:36px">${SESSION?.store_logo||'📒'}</span>`;

  const grandTotal  = items.reduce((s,r)=>s+r.qty*r.price*(1+rate/100),0);
  const beforeTax   = rate > 0 ? grandTotal/(1+rate/100) : grandTotal;
  const taxAmt      = grandTotal - beforeTax;

  const rows = items.map((r,i)=>{
    const tot = r.qty * r.price * (1+rate/100);
    return `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
      <td style="padding:9px 8px;font-size:15px;font-weight:600">${r.desc||'—'}</td>
      <td style="padding:9px 8px;text-align:center;font-size:14px">${r.unit||'—'}</td>
      <td style="padding:9px 8px;text-align:center;font-family:monospace;font-size:15px">${r.qty}</td>
      <td style="padding:9px 8px;text-align:left;font-family:monospace;font-size:15px">${r.price.toFixed(2)}</td>
      <td style="padding:9px 8px;text-align:left;font-family:monospace;font-size:15px;font-weight:800;color:#065f46">${tot.toFixed(2)}</td>
    </tr>`;
  }).join('');

  return `<div dir="rtl" style="font-family:Arial,sans-serif;background:#fff;color:#111;
    padding:24px;max-width:600px;margin:0 auto;border-radius:12px">
    <div style="text-align:center;border-bottom:3px solid #1e3a8a;padding-bottom:16px;margin-bottom:16px">
      ${logoHTML}
      <div style="font-size:24px;font-weight:900;color:#1e3a8a;margin-top:8px">${shop}</div>
      ${SESSION?.city?`<div style="font-size:13px;color:#64748b">${SESSION.city}</div>`:''}
      ${type==='tax'?`<div style="font-size:13px;font-weight:700;color:#b45309;margin-top:4px">فاتورة ضريبية</div>`:''}
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;
      background:#f8fafc;border-radius:8px;padding:12px">
      <div>
        <div style="font-size:12px;color:#64748b">الزبون</div>
        <div style="font-size:18px;font-weight:800">${cust?.name||'—'}</div>
        <div style="font-size:14px;color:#3b82f6;direction:ltr">${cust?.phone||''}</div>
      </div>
      <div style="text-align:left">
        <div style="font-size:12px;color:#64748b">التاريخ</div>
        <div style="font-size:15px;font-weight:700">${date}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <thead><tr style="background:#1e293b;color:#fff">
        <th style="padding:10px 8px;text-align:right;font-size:14px">الصنف</th>
        <th style="padding:10px 8px;text-align:center;font-size:14px">الوحدة</th>
        <th style="padding:10px 8px;text-align:center;font-size:14px">الكمية</th>
        <th style="padding:10px 8px;text-align:left;font-size:14px">السعر</th>
        <th style="padding:10px 8px;text-align:left;font-size:14px">الإجمالي${rate>0?' (شامل الضريبة)':''}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="background:#f1f5f9;border-radius:10px;padding:12px 16px">
      ${rate>0?`
      <div style="display:flex;justify-content:space-between;padding:6px 0;
        font-size:14px;color:#475569;border-bottom:1px solid #e2e8f0">
        <span>المجموع قبل الضريبة</span>
        <span style="font-family:monospace;font-weight:700">${beforeTax.toFixed(2)} ${CUR}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;
        font-size:14px;color:#b45309;font-weight:700;border-bottom:1px solid #e2e8f0">
        <span>${taxName} (${rate}%)</span>
        <span style="font-family:monospace">${taxAmt.toFixed(2)} ${CUR}</span>
      </div>`:''}
      <div style="display:flex;justify-content:space-between;padding:8px 0;
        font-size:22px;font-weight:900;color:#065f46">
        <span>الإجمالي الشامل</span>
        <span style="font-family:monospace">${grandTotal.toFixed(2)} ${CUR}</span>
      </div>
    </div>
    <div style="text-align:center;margin-top:16px;font-size:13px;color:#94a3b8">
      شكراً لتعاملكم — ${shop}
    </div>
  </div>`;
}

function buildInvText(cust, items, type) {
  const country = SESSION?.country_code || 'PS';
  const rate    = type === 'tax' ? (TAX_RATES[country] || 0) : 0;
  const shop    = SESSION?.shop_name || 'دفتر الدين';
  const date    = new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const grandTotal = items.reduce((s,r)=>s+r.qty*r.price*(1+rate/100),0);
  const beforeTax  = rate>0 ? grandTotal/(1+rate/100) : grandTotal;
  const taxAmt     = grandTotal - beforeTax;
  let txt = `📒 *${shop}*
`;
  txt += `${type==='tax'?'فاتورة ضريبية':'فاتورة مبيعات'} — ${date}
`;
  txt += `━━━━━━━━━━━━━━━━
`;
  txt += `👤 ${cust?.name||'—'}
`;
  txt += `━━━━━━━━━━━━━━━━
`;
  items.forEach(r => {
    const tot = r.qty*r.price*(1+rate/100);
    txt += `• ${r.desc}${r.unit?' ('+r.unit+')':''} × ${r.qty} × ${r.price.toFixed(2)} = *${tot.toFixed(2)} ${CUR}*
`;
  });
  txt += `━━━━━━━━━━━━━━━━
`;
  if (rate>0) {
    txt += `المجموع قبل الضريبة: ${beforeTax.toFixed(2)} ${CUR}
`;
    txt += `الضريبة (${rate}%): ${taxAmt.toFixed(2)} ${CUR}
`;
  }
  txt += `💰 *الإجمالي: ${grandTotal.toFixed(2)} ${CUR}*
`;
  txt += `شكراً لتعاملكم 🙏`;
  return txt;
}

function getInvCust() {
  const custId = document.getElementById('add-cust').value;
  return allCustsCache.find(c=>c.id===custId) || null;
}

function shareInvWhatsapp() {
  const cust = getInvCust();
  const txt  = buildInvText(cust, invRows, invType);
  const phone = (cust?.phone||'').replace(/[^0-9]/g,'');
  const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(txt)}`
    : `https://wa.me/?text=${encodeURIComponent(txt)}`;
  window.open(url, '_blank');
}

function shareInvEmail() {
  const cust  = getInvCust();
  const txt   = buildInvText(cust, invRows, invType);
  const email = cust?.email || SESSION?.email || '';
  const subj  = encodeURIComponent(`فاتورة — ${cust?.name||''}`);
  const body  = encodeURIComponent(txt);
  window.open(`mailto:${email}?subject=${subj}&body=${body}`,'_blank');
}

function printInv() {
  const cust    = getInvCust();
  const html    = buildInvHTML(cust, invRows, invType);
  const w = window.open('','_blank','width=700,height=900');
  w.document.write(`<html><head><meta charset="utf-8">
    <title>فاتورة</title>
    <style>body{margin:20px;font-family:Arial,sans-serif;direction:rtl}
    @media print{body{margin:0}}</style></head>
    <body>${html}
    <script>window.onload=()=>{window.print();window.close()}<\/script>
    </body></html>`);
  w.document.close();
}

// ================================================================
// عرض فاتورة محفوظة
// ================================================================
async function showInvoice(txId) {
  const tx = await db.get('transactions', txId);
  if (!tx || !tx.invoice_items?.length) return;
  const cust = await db.get('customers', tx.customer_id) || {};
  currentInvoice = { tx, cust };
  document.getElementById('inv-print').innerHTML =
    buildInvHTML(cust, tx.invoice_items, tx.invoice_type || 'normal')
      .replace('<div id="inv-print"','<div');
  openModal('m-invoice');
}

function shareInvoiceWhatsapp() {
  if (!currentInvoice) return;
  const { tx, cust } = currentInvoice;
  const txt  = buildInvText(cust, tx.invoice_items||[], tx.invoice_type||'normal');
  const phone = (cust.phone||'').replace(/[^0-9]/g,'');
  window.open(phone?`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`
    :`https://wa.me/?text=${encodeURIComponent(txt)}`,'_blank');
}

function shareInvoiceEmail() {
  if (!currentInvoice) return;
  const { tx, cust } = currentInvoice;
  const txt  = buildInvText(cust, tx.invoice_items||[], tx.invoice_type||'normal');
  window.open(`mailto:${cust.email||''}?subject=${encodeURIComponent('فاتورة — '+(cust.name||''))}&body=${encodeURIComponent(txt)}`,'_blank');
}

// ================================================================
// تهيئة
// ================================================================
async function init() {
  try { await db.open(); } catch(e) { console.warn('DB open failed', e); }

  const saved = localStorage.getItem('dd_session') || localStorage.getItem('session');

  // لا توجد جلسة محفوظة
  if (!saved) {
    showScreen('s-login');
    return;
  }
  // تخصيص شاشة الدخول بمعلومات المتجر المحفوظة
  try {
    const s = JSON.parse(saved);
    if (s?.store_logo || s?.shop_name) {
      const iconEl = document.querySelector('.login-logo .icon');
      const nameEl = document.querySelector('.login-logo h1');
      if (iconEl && s.store_logo) {
        if (s.store_logo.startsWith('data:')) {
          iconEl.innerHTML = `<img src="${s.store_logo}"
            style="height:60px;width:60px;object-fit:contain;border-radius:12px">`;
        } else {
          iconEl.textContent = s.store_logo;
        }
      }
      if (nameEl && s.shop_name) nameEl.textContent = s.shop_name;
    }
  } catch(e) {}

  try {
    SESSION = JSON.parse(saved);
    CUR  = SESSION.currency || '₪';
    PLAN = SESSION.plan || null;

    // فحص انتهاء الجلسة 30 يوم بدون نت
    const savedAt = SESSION.saved_at || Date.now();
    const days30  = 30 * 24 * 3600 * 1000;
    if (Date.now() - savedAt > days30 && !navigator.onLine) {
      showScreen('s-login');
      showErr(document.getElementById('login-err'),
        'انتهت الجلسة — اتصل بالإنترنت مرة واحدة لتجديدها');
      return;
    }

    // فحص الاتفاقية والإعداد
    const localAgreed  = localStorage.getItem('terms_agreed');
    const localOnboard = localStorage.getItem('onboarding_done');

    if (!SESSION.agreed_to_terms && !localAgreed) {
      showScreen('s-terms');
      return;
    }
    if (!SESSION.onboarding_done && !localOnboard) {
      showScreen('s-setup-shop');
      const waEl = document.getElementById('setup-wa');
      if (SESSION.phone && waEl) waEl.value = SESSION.phone;
      setStoreLogo(SESSION.store_logo || '🏪');
      return;
    }

    showScreen('s-home');
    await loadHomeData();
    updateSubscriptionUI();
    monitorConnection();
    if (navigator.onLine) setTimeout(doSync, 1500);
    checkLongPending();
    setInterval(checkLongPending, 30 * 60 * 1000);
    setTimeout(initGlobalMic, 500);

  } catch(e) {
    console.warn('init error', e);
    localStorage.removeItem('dd_session');
    localStorage.removeItem('session');
    showScreen('s-login');
  }
}

// ================================================================
// تسجيل الدخول
// ================================================================
async function doLogin() {
  const phone = document.getElementById('inp-phone').value.trim();
  const pin   = document.getElementById('inp-pin').value.trim();
  const err   = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn');

  if (!phone) { showErr(err, 'أدخل رقم الهاتف'); return; }
  if (!pin)   { showErr(err, 'أدخل الرقم السري'); return; }

  err.style.display = 'none';
  btn.textContent = 'جاري...';
  btn.disabled = true;

  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', phone, pin })
    });
    const d = await res.json();

    if (d.error) { showErr(err, d.error); return; }
    if (d.ok) {
      SESSION = {
        merchant_id:     d.merchant_id,
        token:           d.token,
        name:            d.name,
        shop_name:       d.shop_name,
        currency:        d.currency || '₪',
        country_code:    d.country_code || 'PS',
        store_logo:      d.store_logo || '🏪',
        store_type:      d.store_type,
        email:           d.email,
        whatsapp_phone:  d.whatsapp_phone,
        city:            d.city,
        onboarding_done: d.onboarding_done,
        agreed_to_terms: d.agreed_to_terms,
        phone:           document.getElementById('inp-phone').value.trim(),
        saved_at:        Date.now()
      };
      CUR = SESSION.currency;
      localStorage.setItem('dd_session', JSON.stringify(SESSION));
      localStorage.setItem('session',    JSON.stringify(SESSION));

      // تحقق من الاتفاقية والإعداد
      const localAgreed = localStorage.getItem('terms_agreed');
      const localOnboard = localStorage.getItem('onboarding_done');
      if (!d.agreed_to_terms && !localAgreed) {
        showScreen('s-terms');
        return;
      }
      if (!d.onboarding_done && !localOnboard) {
        showScreen('s-setup-shop');
        if (SESSION.phone) document.getElementById('setup-wa').value = SESSION.phone;
        setStoreLogo(SESSION.store_logo || '🏪');
        return;
      }

      // جلب البيانات الأولية
      await pullFromServer();
      showScreen('s-home');
      await loadHomeData();
      updateSubscriptionUI();
      monitorConnection();
      setTimeout(doSync, 500);
    }
    if (d.need_setup) {
      showErr(err, 'يجب ضبط الرقم السري أولاً عبر المتصفح');
    }
  } catch(e) {
    showErr(err, 'لا يوجد اتصال — تأكد من الإنترنت عند الدخول الأول');
  } finally {
    btn.textContent = 'دخول';
    btn.disabled = false;
  }
}

// ================================================================
// جلب البيانات من السيرفر (أول مرة أو عند الطلب)
// ================================================================
async function pullFromServer() {
  if (!SESSION || !navigator.onLine) return;
  try {
    const res = await fetch(SYNC_URL + '?tok=' + encodeURIComponent(SESSION.token));
    const d = await res.json();
    // حفظ بيانات الخطة حتى لو free_tier
    if (d.plan_info) {
      PLAN = d.plan_info;
      SESSION.plan = PLAN;
      localStorage.setItem('dd_session', JSON.stringify(SESSION));
      localStorage.setItem('session',    JSON.stringify(SESSION));
    }
    if (!d.ok) {
      if (d.free_tier) updateSubscriptionUI();
      return;
    }

    // حفظ في IndexedDB
    const mData = {
      id: SESSION.merchant_id,
      name: d.merchant?.name || '',
      shop_name: d.merchant?.shop_name || '',
      currency_symbol: d.merchant?.currency_symbol || SESSION.currency || '₪',
      phone: d.merchant?.phone || ''
    };
    await db.put('merchant', mData);
    // تحديث العملة فوراً
    if (mData.currency_symbol) {
      CUR = mData.currency_symbol;
      SESSION.currency = CUR;
      localStorage.setItem('dd_session', JSON.stringify(SESSION));
      localStorage.setItem('session', JSON.stringify(SESSION));
    }

    if (d.customers?.length) {
      await db.customers.bulkPut(d.customers);
    }
    if (d.transactions?.length) {
      await db.transactions.bulkPut(d.transactions);
    }
  } catch(e) { /* صامت */ }
}

// ================================================================
// مزامنة التغييرات المحلية للسيرفر (push)
// ================================================================
async function doSync() {
  if (!SESSION || !navigator.onLine) return;
  updateSyncBar('syncing');

  try {
    // جلب التغييرات غير المزامنة
    const pending = await db.getPendingSync();
    if (pending.length === 0) {
      await pullFromServer();
      localStorage.setItem('last_sync', Date.now().toString());
      updateSyncBar('online', 0);
      await loadHomeData();
      updateSubscriptionUI();
      checkLongPending();
      return;
    }

    const changes = pending.map(p => p.data);
    const res = await fetch(SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tok: SESSION.token, changes })
    });
    const d = await res.json();

    if (d.ok) {
      // وضع علامة "تمت المزامنة"
      const qids = pending.map(p => p.qid);
      await db.markSynced(qids);
      await pullFromServer();
      localStorage.setItem('last_sync', Date.now().toString());
      updateSyncBar('online', 0);
      await loadHomeData();
    }
  } catch(e) {
    updateSyncBar('offline', await getPendingCount());
  }
}

async function getPendingCount() {
  return db.getPendingSync().then(a=>a.length);
}

// ================================================================
// تحديث شريط المزامنة
// ================================================================
async function checkLongPending() {
  const pending = await db.getPendingSync();
  if (!pending.length) {
    document.getElementById('pending-warn').style.display = 'none';
    return;
  }
  // أقدم تغيير معلق
  const oldest = pending.reduce((o, p) =>
    (!o || p.created_at < o.created_at) ? p : o, null);
  if (!oldest) return;

  const hoursAgo = (Date.now() - new Date(oldest.created_at).getTime()) / 3600000;
  const warn = document.getElementById('pending-warn');

  if (hoursAgo >= 48) {
    warn.style.display = 'block';
    warn.style.background = 'rgba(239,68,68,.9)';
    warn.innerHTML = `🚨 <b>${pending.length} تغيير</b> لم يُرحَّل منذ أكثر من يومين — بياناتك في خطر! اتصل بالإنترنت الآن.`;
  } else if (hoursAgo >= 12) {
    warn.style.display = 'block';
    warn.style.background = 'rgba(217,119,6,.9)';
    warn.innerHTML = `⚠️ <b>${pending.length} تغيير</b> في انتظار الترحيل منذ ${Math.round(hoursAgo)} ساعة — اتصل بالإنترنت لحفظ بياناتك.`;
  } else {
    warn.style.display = 'none';
  }
}

function getLastSyncText() {
  const last = localStorage.getItem('last_sync');
  if (!last) return '';
  const d = new Date(Number(last));
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1)   return ' — آخر مزامنة: للتو';
  if (diffMin < 60)  return ` — آخر مزامنة: منذ ${diffMin} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24)   return ` — آخر مزامنة: منذ ${diffHr} ساعة`;
  const diffDay = Math.floor(diffHr / 24);
  return ` — آخر مزامنة: منذ ${diffDay} يوم`;
}

let syncTapCount = 0;
let syncTapTimer = null;

function handleStatusBarTap() {
  syncTapCount++;
  if (syncTapTimer) clearTimeout(syncTapTimer);
  const bar = document.getElementById('status-bar');

  if (syncTapCount === 1) {
    if (bar) {
      bar.style.background = 'rgba(251,191,36,.2)';
      bar.querySelector('#status-hint').textContent = '— اضغط مرة ثانية للمزامنة';
    }
    syncTapTimer = setTimeout(() => {
      syncTapCount = 0;
      updateStatusBar();
    }, 2000);
  } else if (syncTapCount >= 2) {
    syncTapCount = 0;
    clearTimeout(syncTapTimer);
    if (bar) bar.querySelector('#status-hint').textContent = '';
    doSync();
  }
}

function updateStatusBar() {
  const bar = document.getElementById('status-bar');
  if (!bar) return;
  const p = getPlanInfo();
  if (!p.can_sync) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  bar.style.cursor  = 'pointer';
  bar.onclick = handleStatusBarTap;
}

function updateSyncBar(state, pending=0) {
  const p = getPlanInfo();
  const bar = document.getElementById('sync-bar');
  const txt = document.getElementById('sync-txt');
  const statusBar = document.getElementById('status-bar');

  // السطر الأول — للمشتركين فقط
  if (bar) {
    if (!p.can_sync) { bar.style.display = 'none'; }
    else {
      bar.style.display = 'flex';
      bar.className = 'sync-bar';
      const lastSync = getLastSyncText();
      if (state === 'online') {
        bar.classList.add('sync-online');
        if (txt) txt.innerHTML = '🟢 متصل' + lastSync;
      } else if (state === 'offline') {
        bar.classList.add('sync-offline');
        const pndTxt = pending > 0 ? ` — ${pending} تغيير معلق` : '';
        if (txt) txt.innerHTML = '🔴 غير متصل' + pndTxt + lastSync;
      } else if (state === 'syncing') {
        bar.classList.add('sync-pending');
        if (txt) txt.innerHTML = '🔄 جاري المزامنة...';
      } else if (state === 'pending') {
        bar.classList.add('sync-pending');
        if (txt) txt.innerHTML = `🟡 ${pending} تغيير في انتظار النت` + getLastSyncText();
      }
    }
  }

  // السطر الثاني — حالة الاتصال للجميع، قابل للضغط مرتين
  if (statusBar && p.can_sync) {
    statusBar.style.display = 'block';
    const icon  = state==='online'?'🟢':state==='offline'?'🔴':state==='syncing'?'🔄':'🟡';
    const label = state==='online'?'متصل':state==='offline'?`غير متصل — ${pending} معلق`:
                  state==='syncing'?'جاري المزامنة...':'في انتظار النت';
    statusBar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;
        padding:8px 16px;font-size:13px;font-weight:700;
        background:var(--bg2);border-bottom:1px solid var(--brd);color:var(--txt2)">
        <span>${icon} ${label}</span>
        <span id="status-hint" style="color:var(--txt3);font-size:12px"></span>
      </div>`;
    statusBar.onclick = handleStatusBarTap;
    statusBar.style.cursor = 'pointer';
  }
}

// ================================================================
// مراقبة الاتصال — مزامنة تلقائية فورية
// ================================================================
function monitorConnection() {
  const badge = document.getElementById('offline-badge');

  async function onOnline() {
    badge.classList.remove('show');
    updateSyncBar('syncing');
    // تأخير قصير للتأكد من استقرار الاتصال
    await new Promise(r => setTimeout(r, 800));
    await doSync();
    checkLongPending();
  }

  function onOffline() {
    badge.classList.add('show');
    getPendingCount().then(n => updateSyncBar('offline', n));
  }

  // طريقة 1: event listener على window
  window.addEventListener('online',  onOnline);
  window.addEventListener('offline', onOffline);

  // طريقة 2: فحص دوري كل 30 ثانية
  setInterval(async () => {
    if (navigator.onLine) {
      const n = await getPendingCount();
      if (n > 0) {
        updateSyncBar('syncing');
        await doSync();
      }
    }
  }, 30 * 1000);

  // طريقة 3: عند عودة المستخدم للتطبيق من الخلفية
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && navigator.onLine) {
      const n = await getPendingCount();
      if (n > 0) {
        updateSyncBar('syncing');
        await doSync();
      } else {
        updateSyncBar('online');
      }
    }
  });

  // الحالة الابتدائية
  if (!navigator.onLine) onOffline();
  else updateSyncBar('online');
}

// ================================================================
// إضافة للـ sync queue
// ================================================================
async function addToQueue(type, data) {
  return db.add('sync_queue', {
    type, data,
    created_at: new Date().toISOString(),
    synced: 0
  });
}

// ================================================================
// إضافة زبون
// ================================================================
async function submitNewCustomer() {
  if (!checkCanAddCustomer()) return; // فحص حد الخطة
  const name  = document.getElementById('nc-name').value.trim();
  const phone = document.getElementById('nc-phone').value.trim();
  const err   = document.getElementById('addcust-err');

  if (!name)  { showErr(err, 'أدخل الاسم'); return; }
  if (!phone) { showErr(err, 'رقم الهاتف مطلوب'); return; }
  if (phone.replace(/\D/g,'').length < 9) { showErr(err, 'رقم الهاتف قصير جداً — يجب 9 أرقام على الأقل'); return; }

  // تحذير عند وجود اسم مشابه
  const similar = allCustsCache.filter(c =>
    c.merchant_id === SESSION.merchant_id &&
    (c.name.includes(name) || name.includes(c.name)) &&
    c.name !== name
  );
  if (similar.length > 0) {
    const names = similar.map(c => c.name).join('، ');
    const ok = confirm(`⚠️ يوجد زبون مشابه: ${names}\n\nهل تريد المتابعة بإضافة "${name}"؟\nإذا أضفت لقباً سيكون أكثر تميزاً.`);
    if (!ok) return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // حفظ فوري محلياً
  await db.put('customers', {
    id, merchant_id: SESSION.merchant_id,
    name, phone,
    has_whatsapp: true,
    created_at: now
  });

  // إضافة لقائمة المزامنة
  await addToQueue('add_customer', { local_id: id, name, phone, created_at: now });

  closeModal('m-addcust');
  document.getElementById('nc-name').value = '';
  document.getElementById('nc-phone').value = '';
  await renderCustomers();
  await populateCustomerSelect();

  // مزامنة إذا يوجد نت
  if (navigator.onLine) doSync();
  else getPendingCount().then(n => updateSyncBar('pending', n));
}

// ================================================================
// إضافة معاملة
// ================================================================
async function submitDebt() {
  const hasInvoice = invRows.length > 0 && calcInvGrandTotal() > 0;
  const invoiceItems = hasInvoice ? invRows.map(r=>({
    desc: r.desc, unit: r.unit||'', qty: r.qty, price: r.price
  })) : null;

  const custId = document.getElementById('add-cust').value;
  const phone  = document.getElementById('add-phone').value.trim();
  const amount = parseFloat(document.getElementById('add-amount').value);
  const desc   = document.getElementById('add-desc').value.trim();
  const err    = document.getElementById('add-err');

  if (!custId)       { showErr(err, 'اختر زبوناً'); return; }
  if (!phone)        { showErr(err, 'رقم الهاتف مطلوب'); return; }
  if (phone.replace(/\D/g,'').length < 9) { showErr(err, 'رقم الهاتف قصير جداً'); return; }
  if (!amount || amount <= 0) { showErr(err, 'أدخل مبلغاً صحيحاً'); return; }

  // تحديث هاتف الزبون إن تغير
  await db.update('customers',custId,{phone});

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  // حفظ فوري محلياً
  await db.put('transactions', {
    id, merchant_id: SESSION.merchant_id,
    customer_id: custId, amount,
    description: desc || 'دين',
    status: 'غير مدفوع',
    invoice_items: invoiceItems,
    invoice_type: hasInvoice ? invType : null,
    created_at: now
  });

  // إضافة لقائمة المزامنة
  await addToQueue('add_transaction', {
    local_id: id, customer_id: custId,
    amount, description: desc || 'دين', created_at: now
  });

  err.style.display = 'none';
  document.getElementById('add-amount').value = '';
  document.getElementById('add-desc').value = '';
  document.getElementById('add-cust').value = '';
  document.getElementById('add-cust-search').value = '';
  document.getElementById('add-phone').value = '';
  renderDescChips();
  // تصفير الفاتورة
  invRows = [];
  invType = 'normal';
  updateInvSummary();

  const lastCustId   = custId;
  const lastCustName = document.getElementById('add-cust-search').value;
  saveRecentCust(lastCustId, lastCustName);

  // عرض خيار "أضف لنفس الزبون"
  const addMore = confirm(`✅ تم الحفظ\n\nهل تريد إضافة معاملة أخرى لـ ${lastCustName}؟`);
  if (addMore) {
    document.getElementById('add-cust-search').value = lastCustName;
    document.getElementById('add-cust').value = lastCustId;
    document.getElementById('add-amount').value = '';
    document.getElementById('add-desc').value = '';
    renderAmountChips('amount-chips','add-amount');
    renderDescChips();
    return;
  }
  await loadHomeData();

  if (navigator.onLine) doSync();
  else getPendingCount().then(n => updateSyncBar('pending', n));
}

// ================================================================
// تسجيل دفعة
// ================================================================
function openPayModal(txId, remaining, custId, desc) {
  currentTxId = txId;
  currentCustomer = custId;
  document.getElementById('pay-remaining').textContent = remaining.toFixed(2) + ' ' + CUR;
  document.getElementById('pay-title').textContent = 'تسجيل دفعة — ' + (desc || 'دين');
  document.getElementById('pay-amount').value = '';
  document.getElementById('pay-name').value = '';
  document.getElementById('pay-rel').value = '';
  document.getElementById('pay-err').style.display = 'none';
  openModal('m-pay');
}

async function submitPayment() {
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const payer  = document.getElementById('pay-name').value.trim();
  const rel    = document.getElementById('pay-rel').value.trim();
  const err    = document.getElementById('pay-err');

  if (!amount || amount <= 0) { showErr(err, 'أدخل المبلغ'); return; }

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  // احسب المتبقي بعد هذه الدفعة
  const allTxs   = await db.getAllByIndex('transactions','customer_id',currentCustomer);
  const prevPaid = allTxs.filter(p => p.partial_payment_parent_id === currentTxId)
    .reduce((s,p) => s + Number(p.amount||0), 0);
  const parentTx = await db.get('transactions', currentTxId);
  const newRem   = Number(parentTx?.amount || 0) - prevPaid - amount;

  // مسدد فقط عند اكتمال السداد الكامل
  await db.update('transactions', currentTxId, {
    status: newRem <= 0 ? 'مدفوع' : 'غير مدفوع',
    payment_confirmed_at: newRem <= 0 ? now : null
  });

  // إضافة قسط كمعاملة محلية
  await db.put('transactions', {
    id, merchant_id: SESSION.merchant_id,
    customer_id: currentCustomer,
    amount,
    description: payer ? `دفع: ${payer}${rel ? ' (' + rel + ')' : ''}` : 'دفعة',
    status: 'مدفوع',
    is_partial_payment: true,
    partial_payment_parent_id: currentTxId,
    created_at: now
  });

  // إضافة لقائمة المزامنة
  await addToQueue('record_payment', {
    local_id: id,
    transaction_id: currentTxId,
    customer_id: currentCustomer,
    amount,
    payer_name: payer || null,
    payer_relationship: rel || null
  });

  closeModal('m-pay');
  await renderStatement(currentCustomer);
  await loadHomeData();

  if (navigator.onLine) doSync();
  else getPendingCount().then(n => updateSyncBar('pending', n));
}

// ================================================================
// رسم الرئيسية
// ================================================================
async function loadHomeData() {
  if (!SESSION) return;
  const mid = SESSION.merchant_id;

  document.getElementById('shop-name').textContent = SESSION.shop_name || 'دفتر الدين';
  buildCustBalances();
  // شعار المتجر في الأعلى
  const logoTop = document.getElementById('shop-logo-top');
  if (logoTop && SESSION.store_logo) {
    if (SESSION.store_logo.startsWith('data:')) {
      logoTop.innerHTML = `<img src="${SESSION.store_logo}"
        style="height:34px;width:34px;object-fit:contain;border-radius:6px">`;
    } else {
      logoTop.textContent = SESSION.store_logo;
    }
  }

  const allTx = await db.getAll('transactions').then(all=>all.filter(t=>t.merchant_id===mid));
  const today  = new Date().toISOString().slice(0,10);
  const pending = allTx.filter(t => t.status === 'غير مدفوع' && !t.is_partial_payment);

  // محصّل اليوم فقط
  const todayPaid = allTx.filter(t =>
    t.is_partial_payment && t.status === 'مدفوع' &&
    (t.created_at||'').slice(0,10) === today
  );
  const todayAmt = todayPaid.reduce((s,t) => s + Number(t.amount||0), 0);

  // العملة من الجلسة أو من قاعدة البيانات المحلية
  const merch = await db.get('merchant', mid).catch(()=>null);
  if (merch?.currency_symbol) CUR = merch.currency_symbol;

  // حساب المتبقي الحقيقي (بعد خصم الدفعات الجزئية)
  const pendingAmt = pending.reduce((s,t) => {
    const paid = allTx.filter(p => p.partial_payment_parent_id === t.id)
      .reduce((ss,p) => ss + Number(p.amount||0), 0);
    return s + Math.max(0, Number(t.amount||0) - paid);
  }, 0);
  const debtorCount = new Set(pending.map(t=>t.customer_id)).size;
  const partialCount = pending.filter(t => {
    const paid = allTx.filter(p => p.partial_payment_parent_id === t.id)
      .reduce((ss,p) => ss + Number(p.amount||0), 0);
    return paid > 0;
  }).length;

  document.getElementById('home-stats').innerHTML = `
    <div class="home-stats-wrap">
      <div class="stat-main">
        <div class="stat-main-left">
          <div class="lbl">الديون المعلقة الآن</div>
          <div class="val">${pendingAmt.toFixed(2)} <span style="font-size:.45em;opacity:.8">${CUR}</span></div>
          <div class="sub">${pending.length > 0 ? pending.length + ' دين غير مسدَّد' : 'لا توجد ديون معلقة'}</div>
        </div>
        <div class="stat-main-right">📋</div>
      </div>
      <div class="stat-mini-row">
        <div class="stat-mini green">
          <div class="ic">💰</div>
          <div>
            <div class="val" style="color:var(--grn)">${todayAmt.toFixed(2)} ${CUR}</div>
            <div class="lbl">محصّل اليوم</div>
          </div>
        </div>
        <div class="stat-mini yellow">
          <div class="ic">👥</div>
          <div>
            <div class="val" style="color:${debtorCount > 0 ? 'var(--yel)' : 'var(--txt3)'}">${debtorCount}</div>
            <div class="lbl">${debtorCount === 0 ? 'لا مديونين' : partialCount > 0 ? `مدين (${partialCount} جزئي)` : 'زبون مدين'}</div>
          </div>
        </div>
      </div>
    </div>`;

  // آخر 10 ديون
  const latest = pending.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0,10);
  const custs  = await db.getAllByIndex('customers','merchant_id',mid);
  const custMap = Object.fromEntries(custs.map(c => [c.id, c]));

  if (!latest.length) {
    document.getElementById('home-txlist').innerHTML =
      '<div class="empty"><div style="font-size:64px;margin-bottom:8px">😊</div><p style="font-size:18px;font-weight:700;color:var(--grn)">لا توجد ديون معلقة</p><p style="font-size:14px;color:var(--txt2)">يوم مريح!</p></div>';
    return;
  }

  document.getElementById('home-txlist').innerHTML = latest.map(t => {
    const c = custMap[t.customer_id] || {};
    const dt   = t.created_at ? new Date(t.created_at) : null;
    const dDay  = dt ? dt.toLocaleDateString('ar-EG', {day:'numeric',month:'short',year:'numeric'}) : '';
    const dTime = dt ? dt.toLocaleTimeString('ar-EG', {hour:'2-digit',minute:'2-digit'}) : '';
    // حساب المتبقي الحقيقي بعد الدفعات
    const paidOnThis = allTx.filter(p => p.partial_payment_parent_id === t.id)
      .reduce((s,p) => s + Number(p.amount||0), 0);
    const rem = Number(t.amount) - paidOnThis;
    const isPartial = paidOnThis > 0 && rem > 0;
    const liId = 'li-'+t.id.slice(0,8);
    setTimeout(()=>{
      const liEl=document.getElementById(liId);
      if(liEl) addLongPressToDebt(liEl,t.id,rem,t.customer_id,t.description||'دين');
    },100);
    return `<div class="list-item" id="${liId}" onclick="openStmt('${t.customer_id}')">
      <div class="li-avatar">${(c.name||'؟')[0]}</div>
      <div class="li-info">
        <div class="li-name">${c.name||'غير معروف'}</div>
        <div class="li-phone">${c.phone||''}</div>
        <div class="li-meta">${t.description||'دين'}</div>
        <div class="li-meta" style="color:var(--txt3);font-size:11px">${dDay} — ${dTime}</div>
      </div>
      <div class="li-right">
        <div class="li-amt" style="color:var(--red)">${rem.toFixed(2)} ${CUR}</div>
        <span class="li-status ${isPartial?'s-partial':'s-unpaid'}">
          ${isPartial?'جزئي':'معلق'}
        </span>
      </div>
    </div>`;
  }).join('');
}

// ================================================================
// رسم قائمة الزبائن
// ================================================================
async function renderCustomers(filter='') {
  custSearchQ = filter;
  const mid   = SESSION.merchant_id;
  let custs   = await db.getAllByIndex('customers','merchant_id',mid);
  const allTx = await db.getAll('transactions').then(all=>all.filter(t=>t.merchant_id===mid));

  if (filter) custs = custs.filter(c =>
    c.name.includes(filter) || (c.phone||'').includes(filter));

  // حساب بيانات كل زبون للفرز
  const custData = custs.map(c => {
    const txs = allTx.filter(t => t.customer_id === c.id && !t.is_partial_payment);
    const unpaidTxs = txs.filter(t => t.status === 'غير مدفوع');
    const debt = unpaidTxs.reduce((s,t) => {
      const paid = allTx.filter(p => p.partial_payment_parent_id === t.id)
        .reduce((ss,p) => ss + Number(p.amount||0), 0);
      return s + Math.max(0, Number(t.amount||0) - paid);
    }, 0);
    const hasPartial = unpaidTxs.some(t => {
      const paid = allTx.filter(p => p.partial_payment_parent_id === t.id)
        .reduce((ss,p) => ss + Number(p.amount||0), 0);
      return paid > 0;
    });
    const oldestDebt = unpaidTxs.reduce((oldest, t) =>
      !oldest || t.created_at < oldest ? t.created_at : oldest, null);
    const newestDebt = unpaidTxs.reduce((newest, t) =>
      !newest || t.created_at > newest ? t.created_at : newest, null);
    return { c, debt, hasPartial, oldestDebt, newestDebt, isPaid: debt <= 0 };
  });

  // الفرز حسب الوضع المختار
  custData.sort((a, b) => {
    switch(custSortMode) {
      case 'debt':    return b.debt - a.debt;
      case 'name':    return (a.c.name||'').localeCompare(b.c.name||'', 'ar');
      case 'partial': {
        if (a.hasPartial && !b.hasPartial) return -1;
        if (!a.hasPartial && b.hasPartial) return 1;
        return b.debt - a.debt;
      }
      case 'oldest':  {
        if (!a.oldestDebt && b.oldestDebt) return 1;
        if (a.oldestDebt && !b.oldestDebt) return -1;
        return (a.oldestDebt||'') < (b.oldestDebt||'') ? -1 : 1;
      }
      case 'newest':  {
        if (!a.newestDebt && b.newestDebt) return 1;
        if (a.newestDebt && !b.newestDebt) return -1;
        return (a.newestDebt||'') > (b.newestDebt||'') ? -1 : 1;
      }
      case 'paid':    return (a.isPaid?0:1) - (b.isPaid?0:1);
      default:        return b.debt - a.debt;
    }
  });

  if (!custData.length) {
    document.getElementById('cust-list').innerHTML = `
      <div class="empty" onclick="openModal('m-addcust')"
        style="cursor:pointer;padding:40px 20px">
        <div style="width:90px;height:90px;border-radius:50%;
          background:linear-gradient(135deg,#e0f2fe,#bfdbfe);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 16px;font-size:40px;
          box-shadow:0 0 0 8px rgba(59,130,246,.1)">👥</div>
        <p style="font-size:18px;font-weight:700;color:var(--txt1);margin:0">لا يوجد زبائن</p>
        <p style="font-size:15px;color:var(--pri);margin:8px 0 0;font-weight:600">اضغط لإضافة زبون جديد</p>
      </div>`;
    return;
  }

  document.getElementById('cust-list').innerHTML = custData.map(({c, debt, hasPartial, isPaid}) => {
    return `<div class="list-item" onclick="openStmt('${c.id}')">
      <div class="li-avatar">${c.name[0]}</div>
      <div class="li-info">
        <div class="li-name">${c.name}</div>
        <div class="li-phone">${c.phone||''}</div>
      </div>
      <div class="li-right">
        <div class="li-amt" style="color:${debt>0?'var(--red)':'var(--grn)'}">
          ${debt.toFixed(2)} ${CUR}
        </div>
        ${debt>0
          ? hasPartial
            ? '<span class="li-status s-partial">جزئي</span>'
            : '<span class="li-status s-unpaid">مديون</span>'
          : '<span class="li-status s-paid">مسدَّد ✓</span>'}
      </div>
    </div>`;
  }).join('');
}

function setSortCustomers(mode, btn) {
  custSortMode = mode;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCustomers(custSearchQ);
}

async function filterCustomers(q) {
  await renderCustomers(q);
  // إذا لا توجد نتائج وهناك نص → اعرض زر الإضافة
  const list = document.getElementById('cust-list');
  if (q.trim() && list && !allCustsCache.some(c =>
    c.merchant_id === SESSION?.merchant_id &&
    c.name.toLowerCase().includes(q.toLowerCase())
  )) {
    list.innerHTML = `
      <div class="empty" style="padding:30px 20px">
        <div style="font-size:40px;margin-bottom:12px">🔍</div>
        <p style="font-size:17px;font-weight:700;color:var(--txt1)">"${q}" غير مسجل</p>
        <p style="font-size:14px;color:var(--txt2);margin-bottom:16px">هل تريد إضافته كزبون جديد؟</p>
        <button onclick="document.getElementById('nc-name').value='${q.replace(/'/g,"\\'")}';openModal('m-addcust')"
          style="padding:12px 24px;background:var(--pri);color:white;border:none;
          border-radius:10px;font-size:16px;font-weight:700;cursor:pointer">
          ➕ إضافة "${q}"
        </button>
      </div>`;
  }
}

// ================================================================
// كشف حساب زبون
// ================================================================
async function openStmt(custId) {
  prevScreen = document.querySelector('.screen.active').id;
  currentCustomer = custId;
  await renderStatement(custId);
  showScreen('s-stmt');
}

async function renderStatement(custId) {
  const c    = await db.get('customers',custId) || {};
  const txs  = await db.getAllByIndex('transactions','customer_id',custId);

  document.getElementById('stmt-name').textContent  = c.name || 'كشف الحساب';
  document.getElementById('stmt-phone').textContent = c.phone || '';

  const allDebts   = txs.filter(t => !t.is_partial_payment);
  const totalDebt  = allDebts.reduce((s,t) => s + Number(t.amount||0), 0);
  const totalPaid  = txs.filter(t => t.is_partial_payment && t.status==='مدفوع')
    .reduce((s,t) => s + Number(t.amount||0), 0);
  const bal = totalDebt - totalPaid;

  // ── تصنيف الديون ──
  const unpaidDebts = allDebts.filter(t => {
    if (t.status === 'مدفوع') return false;
    const pp = txs.filter(p=>p.partial_payment_parent_id===t.id)
      .reduce((s,p)=>s+Number(p.amount||0),0);
    return Number(t.amount) - pp > 0;
  });
  const paidDebts = allDebts.filter(t => {
    const pp = txs.filter(p=>p.partial_payment_parent_id===t.id)
      .reduce((s,p)=>s+Number(p.amount||0),0);
    return Number(t.amount) - pp <= 0;
  });

  // ── الإحصائيات ──
  document.getElementById('stmt-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-num" style="color:var(--red)">${bal.toFixed(2)} ${CUR}</div>
      <div class="stat-lbl">الرصيد المتبقي</div>
    </div>
    <div class="stat-card">
      <div class="stat-num" style="color:var(--txt3);font-size:1.2em">${unpaidDebts.length} / ${allDebts.length}</div>
      <div class="stat-lbl">معلق / الإجمالي</div>
    </div>`;

  if (!allDebts.length) {
    document.getElementById('stmt-txlist').innerHTML =
      '<div class="empty"><div class="em-icon">✅</div><p>لا توجد معاملات</p></div>';
    return;
  }

  // ── دالة بناء بطاقة الدين ──
  const buildTxCard = (t, isVisible) => {
    const payments = txs.filter(p => p.partial_payment_parent_id===t.id && p.is_partial_payment);
    const paid = payments.reduce((s,p) => s+Number(p.amount||0), 0);
    const rem  = Number(t.amount) - paid;
    const isPaid    = rem <= 0;
    const isPartial = paid > 0 && rem > 0;
    const dt    = t.created_at ? new Date(t.created_at) : null;
    const dDay  = dt ? dt.toLocaleDateString('ar-EG',{day:'numeric',month:'short',year:'numeric'}) : '';
    const dTime = dt ? dt.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '';
    const tid   = 'px-' + t.id.replace(/-/g,'').slice(0,8);

    const payList = payments.length > 0 ? `
      <div style="margin-top:8px">
        <button onclick="var el=document.getElementById('${tid}');el.style.display=el.style.display==='none'?'block':'none'"
          style="background:none;border:none;color:var(--pri);font-size:14px;font-weight:700;cursor:pointer;padding:4px 0">
          ▼ ${payments.length} دفعة (${paid.toFixed(2)} ${CUR})
        </button>
        <div id="${tid}" style="display:none;margin-top:6px;padding:10px;background:var(--bg3);border-radius:10px">
          ${payments.map(p => {
            const pd = p.created_at ? new Date(p.created_at) : null;
            const pdStr = pd ? pd.toLocaleDateString('ar-EG',{day:'numeric',month:'short'}) + ' — ' + pd.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}) : '';
            return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--brd);font-size:14px">
              <div><div style="font-weight:700;color:var(--txt)">${p.description||'دفعة'}</div>
                <div style="color:var(--txt3);font-size:12px">${pdStr}</div></div>
              <div style="font-weight:900;color:var(--grn)">${Number(p.amount).toFixed(2)} ${CUR}</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const opacity = isPaid ? 'opacity:.55;' : '';
    return `<div class="tx-item" style="${opacity}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div class="tx-desc">${t.description||'دين'}</div>
          <div class="tx-meta" style="font-size:12px;color:var(--txt3)">${dDay} — ${dTime}</div>
        </div>
        <div style="text-align:left;flex-shrink:0">
          <div class="tx-amt" style="color:${isPaid?'var(--grn)':isPartial?'var(--yel)':'var(--red)'}">
            ${isPaid?'✓ '+Number(t.amount).toFixed(2):rem.toFixed(2)} ${CUR}
          </div>
          <span class="li-status ${isPaid?'s-paid':isPartial?'s-partial':'s-unpaid'}">
            ${isPaid?'مسدَّد':isPartial?'جزئي':'معلق'}
          </span>
        </div>
      </div>
      ${payList}
      ${!isPaid?`<div style="display:flex;gap:8px;margin-top:10px">
        <button style="flex:2;padding:11px;font-size:15px;border:none;border-radius:10px;cursor:pointer;color:#fff;background:linear-gradient(135deg,#065f46,#10b981)"
          onclick="openPayModal('${t.id}',${rem},'${t.customer_id}','${(t.description||'دين').replace(/'/g,"\\'")}')">
          💰 سدّد — متبقي ${rem.toFixed(2)} ${CUR}
        </button>
        ${t.invoice_items?.length?`<button style="flex:1;padding:11px;font-size:14px;border:none;border-radius:10px;cursor:pointer;color:var(--pri);background:rgba(59,130,246,.1)" onclick="showInvoice('${t.id}')">🧾</button>`:''}
      </div>`:''}
    </div>`;
  };

  // ── الواجهة النهائية ──
  const unpaidHTML = unpaidDebts.length
    ? `<div style="padding:10px 16px 4px;font-size:14px;font-weight:800;color:var(--red)">
         🔴 الديون المعلقة (${unpaidDebts.length})
       </div>
       ${unpaidDebts.map(t => buildTxCard(t, true)).join('')}`
    : `<div style="text-align:center;padding:24px;color:var(--grn);font-size:16px;font-weight:700">
         ✅ لا توجد ديون معلقة
       </div>`;

  const paidToggleId = 'paid-section-' + custId.slice(0,8);
  const paidHTML = paidDebts.length ? `
    <div style="padding:8px 16px;margin-top:8px">
      <button onclick="var el=document.getElementById('${paidToggleId}');
        var btn=this;
        if(el.style.display==='none'){el.style.display='block';btn.textContent='🟢 إخفاء المسدَّد (${paidDebts.length})';}
        else{el.style.display='none';btn.textContent='🟢 عرض المسدَّد (${paidDebts.length})'}"
        style="width:100%;padding:12px;border:1.5px solid rgba(16,185,129,.3);border-radius:10px;
        background:rgba(16,185,129,.07);color:var(--grn);font-size:15px;font-weight:700;cursor:pointer">
        🟢 عرض المسدَّد (${paidDebts.length})
      </button>
      <div id="${paidToggleId}" style="display:none;margin-top:8px">
        ${paidDebts.map(t => buildTxCard(t, false)).join('')}
      </div>
    </div>` : '';

  document.getElementById('stmt-txlist').innerHTML = unpaidHTML + paidHTML;
}

// ================================================================
// تقارير اليوم — ملخص بالكلام العادي + ورقة دفتر + نصائح ذكية
// ================================================================

function genAdvice(data) {
  const {
    newDebts, dayPayments, custMap, allTx,
    collectedAmt, newDebtAmt, isToday
  } = data;
  const advices = [];

  // ── تحليل كل زبون جديد ──
  newDebts.forEach(t => {
    const c = custMap[t.customer_id] || {};
    const name = c.name || 'الزبون';
    const amt  = Number(t.amount||0);

    // كل سجلات هذا الزبون
    const hx = allTx.filter(x => x.customer_id === t.customer_id && !x.is_partial_payment);
    const isNew = hx.length <= 1;
    const totalOwed = hx.filter(x=>x.status==='غير مدفوع')
      .reduce((s,x)=>s+Number(x.amount||0),0);

    if (isNew && amt > 100) {
      advices.push({
        type:'danger',
        icon:'⚠️',
        shake:true,
        text:`<b>${name}</b> زبون جديد ودَينه <b>${amt.toFixed(2)} ${CUR}</b> — لا يوجد تاريخ دفع سابق، تأكد من وجود ضمان أو كفيل.`
      });
    } else if (isNew) {
      advices.push({
        type:'warning',
        icon:'👋',
        text:`<b>${name}</b> زبون جديد — راقبه جيداً في الدفعة الأولى لأنها تكشف طبيعته.`
      });
    } else if (totalOwed > 500) {
      advices.push({
        type:'danger',
        icon:'🚨',
        shake:true,
        text:`تراكمت ديون <b>${name}</b> لتصل إلى <b>${totalOwed.toFixed(2)} ${CUR}</b> — الرصيد خطير، لا تزد قبل أن يسدّد.`
      });
    }
  });

  // ── تحليل الزبائن الذين دفعوا ──
  const payerIds = [...new Set(dayPayments.map(t=>t.customer_id))];
  payerIds.forEach(id => {
    const c = custMap[id] || {};
    const name = c.name||'الزبون';
    const paid = dayPayments.filter(p=>p.customer_id===id)
      .reduce((s,p)=>s+Number(p.amount||0),0);
    const remaining = allTx.filter(t=>t.customer_id===id&&t.status==='غير مدفوع'&&!t.is_partial_payment)
      .reduce((s,t)=>{
        const pp=allTx.filter(p=>p.partial_payment_parent_id===t.id)
          .reduce((ss,p)=>ss+Number(p.amount||0),0);
        return s+Math.max(0,Number(t.amount||0)-pp);
      },0);
    if (remaining <= 0) {
      advices.push({type:'good',icon:'🎉',text:`<b>${name}</b> سدّد كامل دَينه — زبون ممتاز يستحق الثقة والاستمرار معه.`});
    } else {
      advices.push({type:'info',icon:'👍',text:`<b>${name}</b> دفع ${paid.toFixed(2)} ${CUR} اليوم — تبقى عليه ${remaining.toFixed(2)} ${CUR}.`});
    }
  });

  // ── نصيحة عامة عن اليوم ──
  if (newDebts.length===0 && dayPayments.length===0 && isToday) {
    const hasOldDebts = allTx.some(t => {
      if (t.is_partial_payment || t.status === 'مدفوع') return false;
      return (Date.now() - new Date(t.created_at||Date.now()).getTime()) / 86400000 > 7;
    });
    advices.push({type:'info',icon:'💡',text:
      hasOldDebts
        ? 'لم تُسجّل أي معاملات اليوم — يوم هادئ في الأعمال طبيعي، لكن لا تنسَ متابعة معاملاتك القديمة.'
        : 'لم تُسجّل أي معاملات اليوم — يوم هادئ في الأعمال، استرح!'
    });
  } else if (collectedAmt > newDebtAmt && newDebtAmt > 0) {
    advices.push({type:'good',icon:'🌟',text:`ممتاز — حصّلت أكثر مما أعطيت دَيناً اليوم. هكذا تُبنى الأعمال الناجحة.`});
  } else if (newDebtAmt > 0 && collectedAmt === 0 && isToday) {
    advices.push({type:'warning',icon:'📌',text:`لم تحصّل شيئاً اليوم — حاول الاتصال بزبون واحد على الأقل لتذكيره بدَينه.`});
  }

  // ── تحذير من ديون قديمة ──
  const overdueAll = allTx.filter(t=>{
    if (t.is_partial_payment||t.status==='مدفوع') return false;
    const created = new Date(t.created_at||Date.now());
    const daysDiff = (Date.now()-created.getTime())/86400000;
    return daysDiff > 30;
  });
  if (overdueAll.length > 0 && isToday) {
    const custNames = [...new Set(overdueAll.map(t=>custMap[t.customer_id]?.name||'زبون'))].slice(0,3);
    advices.push({
      type:'danger',
      icon:'⏰',
      shake:true,
      text:`لديك <b>${overdueAll.length} دَين</b> متجاوز 30 يوماً — أبرزها: ${custNames.join('، ')}. الدين الذي يتجاوز شهراً يصعب تحصيله كثيراً.`
    });
  }

  return advices;
}

// ================================================================
// تقارير — التحكم في التبويبات
// ================================================================
let currentRepTab = 'daily';

function switchRepTab(tab) {
  currentRepTab = tab;
  const daily  = document.getElementById('rep-daily-view');
  const totals = document.getElementById('rep-totals-view');
  const nav    = document.getElementById('rep-day-nav');
  const btnD   = document.getElementById('tab-rep-daily');
  const btnT   = document.getElementById('tab-rep-totals');

  if (tab === 'daily') {
    if (daily)  daily.style.display  = 'block';
    if (totals) totals.style.display = 'none';
    if (nav)    nav.style.display    = 'flex';
    if (btnD) { btnD.style.color = 'var(--pri)'; btnD.style.borderBottom = '3px solid var(--pri)'; }
    if (btnT) { btnT.style.color = 'var(--txt3)'; btnT.style.borderBottom = '3px solid transparent'; }
    loadReport();
  } else {
    if (daily)  daily.style.display  = 'none';
    if (totals) totals.style.display = 'block';
    if (nav)    nav.style.display    = 'none';
    if (btnT) { btnT.style.color = 'var(--pri)'; btnT.style.borderBottom = '3px solid var(--pri)'; }
    if (btnD) { btnD.style.color = 'var(--txt3)'; btnD.style.borderBottom = '3px solid transparent'; }
    loadTotalsReport();
  }
}

// ================================================================
// رأس صفحة التقارير — اسم المتجر وشعاره
// ================================================================
function updateRepHeader() {
  if (!SESSION) return;
  const nameEl = document.getElementById('rep-shop-name');
  const logoEl = document.getElementById('rep-shop-logo');
  if (nameEl) nameEl.textContent = SESSION.shop_name || 'دفتر الدين';
  if (logoEl && SESSION.store_logo) {
    if (SESSION.store_logo.startsWith('data:')) {
      logoEl.innerHTML = `<img src="${SESSION.store_logo}"
        style="height:34px;width:34px;object-fit:contain;border-radius:6px">`;
    } else {
      logoEl.textContent = SESSION.store_logo;
    }
  }
}

// ================================================================
// رسم بياني بسيط بـ CSS
// ================================================================
function buildChart(todayDebts, todayPaid, oldPaid, remaining) {
  const max = Math.max(todayDebts, todayPaid + oldPaid, 1);
  const bar = (val, color, label, sub) => {
    const pct = Math.max(4, Math.round((val / max) * 100));
    return `<div style="text-align:center;flex:1">
      <div style="font-size:13px;font-weight:800;color:${color};margin-bottom:4px">
        ${val.toFixed(2)} ${CUR}
      </div>
      <div style="height:${Math.round(pct * 1.2)}px;background:${color};
        border-radius:6px 6px 0 0;margin:0 4px;opacity:.85;
        transition:height .4s ease"></div>
      <div style="font-size:12px;color:var(--txt2);font-weight:700;margin-top:6px;
        line-height:1.4">${label}</div>
      <div style="font-size:11px;color:var(--txt3)">${sub}</div>
    </div>`;
  };
  return `
    <div style="padding:16px 16px 8px">
      <div style="font-size:13px;font-weight:800;color:var(--txt2);margin-bottom:12px;
        text-align:center">نتيجة أعمال اليوم</div>
      <div style="display:flex;align-items:flex-end;gap:4px;
        border-bottom:2px solid var(--brd);padding-bottom:4px;min-height:140px">
        ${bar(todayDebts, '#f59e0b', 'مبيعات اليوم', 'إجمالي الدين')}
        ${bar(todayPaid,  '#10b981', 'محصّل اليوم', 'من مبيعات اليوم')}
        ${bar(remaining,  '#ef4444', 'متبقي اليوم', 'غير مسدَّد')}
        ${bar(oldPaid,    '#818cf8', 'تحصيل قديم', 'من ديون سابقة')}
      </div>
    </div>`;
}

// ================================================================
// تقرير يومي
// ================================================================
async function loadReport() {
  const mid = SESSION.merchant_id;
  const day = repDate;
  const isToday = day === new Date().toISOString().slice(0,10);
  const isYest  = day === new Date(Date.now()-86400000).toISOString().slice(0,10);

  updateRepHeader();

  const dayLabel = isToday ? 'اليوم'
    : isYest ? 'أمس'
    : new Date(day+'T12:00:00').toLocaleDateString('ar-EG',
        {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  const repDateEl = document.getElementById('rep-date');
  if (repDateEl) repDateEl.textContent = dayLabel;

  const allTx  = await db.getAll('transactions').then(all=>all.filter(t=>t.merchant_id===mid));
  const custs  = await db.getAllByIndex('customers','merchant_id',mid);
  const custMap = Object.fromEntries(custs.map(c=>[c.id,c]));

  // كل ديون اليوم (مسددة وغير مسددة)
  const newDebts    = allTx.filter(t=>t.created_at?.slice(0,10)===day && !t.is_partial_payment);
  const newDebtAmt  = newDebts.reduce((s,t)=>s+Number(t.amount||0),0);

  // الدفعات المستلمة اليوم
  const dayPayments = allTx.filter(t=>t.is_partial_payment && t.status==='مدفوع' && t.created_at?.slice(0,10)===day);

  // تصنيف الدفعات: من ديون اليوم vs ديون قديمة
  const today0 = new Date(day+'T00:00:00');
  const todayPaidAmt = dayPayments.filter(t => {
    const parent = allTx.find(x=>x.id===t.partial_payment_parent_id);
    return parent?.created_at?.slice(0,10) === day;
  }).reduce((s,t)=>s+Number(t.amount||0),0);

  const oldPaidAmt = dayPayments.filter(t => {
    const parent = allTx.find(x=>x.id===t.partial_payment_parent_id);
    return parent && parent.created_at?.slice(0,10) !== day;
  }).reduce((s,t)=>s+Number(t.amount||0),0);

  const remaining = Math.max(0, newDebtAmt - todayPaidAmt);

  // ── ورقة الدفتر ──
  const dateStr = new Date(day+'T12:00:00').toLocaleDateString('ar-EG',
    {weekday:'long', year:'numeric', month:'long', day:'numeric'});

  let summaryLines = [];
  if (newDebts.length > 0) {
    const names = [...new Set(newDebts.map(t=>custMap[t.customer_id]?.name||'زبون'))];
    summaryLines.push(names.length===1
      ? `سجّلت ${newDebts.length===1?'معاملة واحدة':newDebts.length+' معاملات'} على <b>${names[0]}</b> بإجمالي <b>${newDebtAmt.toFixed(2)} ${CUR}</b>.`
      : `سجّلت <b>${newDebts.length} معاملات</b> على ${names.length} زبائن بإجمالي <b>${newDebtAmt.toFixed(2)} ${CUR}</b>.`);
  }
  if (dayPayments.length > 0) {
    const pNames = [...new Set(dayPayments.map(t=>custMap[t.customer_id]?.name||'زبون'))];
    const totalCol = todayPaidAmt + oldPaidAmt;
    summaryLines.push(pNames.length===1
      ? `وحصّلت <b>${totalCol.toFixed(2)} ${CUR}</b> من <b>${pNames[0]}</b>${oldPaidAmt>0?` (منها <b>${oldPaidAmt.toFixed(2)} ${CUR}</b> من ديون سابقة)`:'.'}`
      : `وحصّلت <b>${totalCol.toFixed(2)} ${CUR}</b> من ${pNames.length} زبائن${oldPaidAmt>0?` (منها <b>${oldPaidAmt.toFixed(2)} ${CUR}</b> من ديون سابقة)`:''}.`);
  }
  if (summaryLines.length===0) summaryLines.push('لا توجد معاملات في هذا اليوم.');

  const advices = genAdvice({newDebts, dayPayments, custMap, allTx,
    collectedAmt: todayPaidAmt + oldPaidAmt, newDebtAmt, isToday});

  const adviceHTML = advices.map((a,i) => `
    <div class="nb-advice ${a.type}" style="margin-bottom:10px;animation:fadeUp .4s ${.1+i*.12}s both">
      <span class="advice-icon ${a.shake?'shake':''}">${a.icon}</span> ${a.text}
    </div>`).join('');

  // ── الورقة الصفراء ──
  const shop = SESSION.shop_name || 'دفتر الدين';
  const logoHTML = SESSION.store_logo?.startsWith('data:')
    ? `<img src="${SESSION.store_logo}" style="height:36px;width:36px;object-fit:contain;border-radius:6px;vertical-align:middle;margin-left:8px">`
    : `<span style="font-size:28px;vertical-align:middle;margin-left:8px">${SESSION.store_logo||'📒'}</span>`;

  const notebook = `
    <div class="notebook-wrap">
      <div class="notebook">
        <div style="text-align:center;margin-bottom:18px;padding-bottom:12px;
          border-bottom:1px dashed #c8a96e">
          ${logoHTML}
          <span style="font-size:22px;font-weight:900;color:#2c1810;vertical-align:middle">${shop}</span>
          <div style="font-size:19px;font-weight:900;color:#8b5e00;margin-top:8px">${dayLabel === 'اليوم' ? '📅 اليوم' : dayLabel === 'أمس' ? '📅 أمس' : '📅 '+new Date(day+'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'long'})}</div>
          <div style="font-size:13px;color:#8b7355;font-style:italic">${dateStr}</div>
        </div>
        <div style="display:flex;justify-content:center;gap:20px;margin-bottom:16px;
          background:rgba(139,94,0,.08);border-radius:10px;padding:12px">
          <div style="text-align:center">
            <div style="font-size:12px;color:#8b7355;font-weight:700">مبيعات اليوم</div>
            <div style="font-size:22px;font-weight:900;color:#92400e">${newDebtAmt.toFixed(2)} ${CUR}</div>
            <div style="font-size:11px;color:#a16207">${newDebts.length} معاملة</div>
          </div>
          <div style="width:1px;background:#c8a96e"></div>
          <div style="text-align:center">
            <div style="font-size:12px;color:#8b7355;font-weight:700">محصّل اليوم</div>
            <div style="font-size:22px;font-weight:900;color:#065f46">${(todayPaidAmt+oldPaidAmt).toFixed(2)} ${CUR}</div>
            <div style="font-size:11px;color:#047857">${dayPayments.length} دفعة</div>
          </div>
          ${remaining > 0 ? `<div style="width:1px;background:#c8a96e"></div>
          <div style="text-align:center">
            <div style="font-size:12px;color:#8b7355;font-weight:700">متبقي اليوم</div>
            <div style="font-size:22px;font-weight:900;color:#991b1b">${remaining.toFixed(2)} ${CUR}</div>
            <div style="font-size:11px;color:#b91c1c">غير مسدَّد</div>
          </div>` : ''}
        </div>
        <div class="notebook-text">
          ${summaryLines.map(l=>`<p>${l}</p>`).join('')}
        </div>
        ${advices.length>0?`<hr class="notebook-divider">${adviceHTML}`:''}
      </div>
    </div>`;

  // ── الرسم البياني ──
  const chart = (newDebtAmt > 0 || (todayPaidAmt+oldPaidAmt) > 0)
    ? buildChart(newDebtAmt, todayPaidAmt, oldPaidAmt, remaining)
    : '';

  // ── قوائم التفاصيل ──
  const debtsList = newDebts.length ? `
    <div style="padding:4px 16px 8px;font-size:15px;font-weight:800;color:var(--txt2)">
      📋 معاملات اليوم (${newDebts.length})
    </div>
    ${newDebts.map(t=>{
      const c=custMap[t.customer_id]||{};
      const tm=t.created_at?new Date(t.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'';
      const paid=allTx.filter(p=>p.partial_payment_parent_id===t.id).reduce((s,p)=>s+Number(p.amount||0),0);
      const rem=Math.max(0,Number(t.amount)-paid);
      return `<div class="list-item" onclick="openStmt('${t.customer_id}')">
        <div class="li-avatar">${(c.name||'؟')[0]}</div>
        <div class="li-info">
          <div class="li-name">${c.name||'غير معروف'}</div>
          <div class="li-meta">${t.description||'دين'} — ${tm}</div>
        </div>
        <div class="li-right">
          <div class="li-amt" style="color:var(--red)">${Number(t.amount).toFixed(2)} ${CUR}</div>
          <span class="li-status ${rem<=0?'s-paid':paid>0?'s-partial':'s-unpaid'}">
            ${rem<=0?'مسدَّد':paid>0?'جزئي':'معلق'}
          </span>
        </div>
      </div>`;
    }).join('')}` : '';

  const paysList = dayPayments.length ? `
    <div style="padding:8px 16px;font-size:15px;font-weight:800;color:var(--txt2)">
      💰 المدفوعات المستلمة (${dayPayments.length})
    </div>
    ${dayPayments.map(t=>{
      const c=custMap[t.customer_id]||{};
      const tm=t.created_at?new Date(t.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'';
      const parentTx=allTx.find(x=>x.id===t.partial_payment_parent_id);
      const isOld = parentTx?.created_at?.slice(0,10) !== day;
      return `<div class="list-item" onclick="openStmt('${t.customer_id}')">
        <div class="li-avatar" style="background:linear-gradient(135deg,#065f46,#10b981)">${(c.name||'؟')[0]}</div>
        <div class="li-info">
          <div class="li-name">${c.name||'غير معروف'}</div>
          <div class="li-meta">${t.description||'دفعة'} — ${tm}</div>
          ${isOld?`<div style="margin-top:4px"><span style="background:rgba(129,140,248,.2);
            color:#818cf8;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:800">
            تحصيل من دين سابق</span></div>`:''}
        </div>
        <div class="li-right">
          <div class="li-amt" style="color:var(--grn)">+${Number(t.amount).toFixed(2)} ${CUR}</div>
          <span class="li-status s-paid">✓ مُستلم</span>
        </div>
      </div>`;
    }).join('')}` : '';

  document.getElementById('rep-list').innerHTML = notebook + chart + debtsList + paysList;
}

// ================================================================
// تقرير الإجماليات (كامل الفترة)
// ================================================================
async function loadTotalsReport() {
  const mid = SESSION.merchant_id;
  updateRepHeader();

  const allTx  = await db.getAll('transactions').then(all=>all.filter(t=>t.merchant_id===mid));
  const custs  = await db.getAllByIndex('customers','merchant_id',mid);
  const custMap = Object.fromEntries(custs.map(c=>[c.id,c]));

  const allDebts   = allTx.filter(t=>!t.is_partial_payment);
  const allPayments= allTx.filter(t=>t.is_partial_payment && t.status==='مدفوع');

  const totalDebt  = allDebts.reduce((s,t)=>s+Number(t.amount||0),0);
  const totalPaid  = allPayments.reduce((s,t)=>s+Number(t.amount||0),0);
  const totalRem   = Math.max(0, totalDebt - totalPaid);

  const debtorIds  = new Set(allDebts.filter(t=>{
    const paid=allTx.filter(p=>p.partial_payment_parent_id===t.id).reduce((s,p)=>s+Number(p.amount||0),0);
    return Number(t.amount)-paid > 0;
  }).map(t=>t.customer_id));

  const shop = SESSION.shop_name || 'دفتر الدين';
  const logoHTML = SESSION.store_logo?.startsWith('data:')
    ? `<img src="${SESSION.store_logo}" style="height:36px;width:36px;object-fit:contain;border-radius:6px;vertical-align:middle;margin-left:8px">`
    : `<span style="font-size:28px;vertical-align:middle;margin-left:8px">${SESSION.store_logo||'📒'}</span>`;

  const firstDate = allDebts.length
    ? new Date(Math.min(...allDebts.map(t=>new Date(t.created_at||Date.now())))).toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'})
    : '—';

  const content = `
    <div class="notebook-wrap">
      <div class="notebook">
        <div style="text-align:center;margin-bottom:18px;padding-bottom:12px;
          border-bottom:1px dashed #c8a96e">
          ${logoHTML}
          <span style="font-size:22px;font-weight:900;color:#2c1810;vertical-align:middle">${shop}</span>
          <div style="font-size:17px;font-weight:900;color:#8b5e00;margin-top:8px">📊 الإجماليات الكاملة</div>
          <div style="font-size:12px;color:#8b7355;font-style:italic">منذ ${firstDate}</div>
        </div>
        <div style="display:flex;justify-content:center;gap:16px;flex-wrap:wrap;
          background:rgba(139,94,0,.08);border-radius:10px;padding:14px;margin-bottom:16px">
          <div style="text-align:center;min-width:80px">
            <div style="font-size:12px;color:#8b7355;font-weight:700">إجمالي المبيعات</div>
            <div style="font-size:20px;font-weight:900;color:#92400e">${totalDebt.toFixed(2)} ${CUR}</div>
            <div style="font-size:11px;color:#a16207">${allDebts.length} معاملة</div>
          </div>
          <div style="width:1px;background:#c8a96e"></div>
          <div style="text-align:center;min-width:80px">
            <div style="font-size:12px;color:#8b7355;font-weight:700">إجمالي المحصّل</div>
            <div style="font-size:20px;font-weight:900;color:#065f46">${totalPaid.toFixed(2)} ${CUR}</div>
            <div style="font-size:11px;color:#047857">${allPayments.length} دفعة</div>
          </div>
          <div style="width:1px;background:#c8a96e"></div>
          <div style="text-align:center;min-width:80px">
            <div style="font-size:12px;color:#8b7355;font-weight:700">إجمالي المتبقي</div>
            <div style="font-size:20px;font-weight:900;color:#991b1b">${totalRem.toFixed(2)} ${CUR}</div>
            <div style="font-size:11px;color:#b91c1c">${debtorIds.size} زبون مدين</div>
          </div>
        </div>
        <div class="notebook-text">
          <p>منذ البداية سجّلت <b>${allDebts.length} معاملة</b> بإجمالي <b>${totalDebt.toFixed(2)} ${CUR}</b>.</p>
          <p>حصّلت <b>${totalPaid.toFixed(2)} ${CUR}</b> من أصل ذلك${totalPaid>0?` بنسبة <b>${Math.round(totalPaid/totalDebt*100)}%</b>`:''} .</p>
          ${totalRem > 0
            ? `<p>لا يزال <b>${totalRem.toFixed(2)} ${CUR}</b> معلقاً لدى <b>${debtorIds.size} زبون</b>.</p>`
            : `<p>🎉 جميع المعاملات مسدَّدة — ممتاز!</p>`}
        </div>
      </div>
    </div>
    ${buildChart(totalDebt, totalPaid, 0, totalRem)}`;

  document.getElementById('rep-totals-content').innerHTML = content;
}

function openDatePicker() {
  const picker = document.getElementById('rep-date-picker');
  if (!picker) return;
  picker.max = new Date().toISOString().slice(0,10);
  picker.value = repDate;
  picker.style.pointerEvents = 'auto';
  picker.showPicker ? picker.showPicker() : picker.click();
  picker.style.pointerEvents = 'none';
}

function jumpToDate(val) {
  if (!val) return;
  const today = new Date().toISOString().slice(0,10);
  if (val > today) return;
  repDate = val;
  const nextBtn = document.getElementById('rep-next');
  const dt = new Date(val+'T12:00:00');
  const nextDt = new Date(dt); nextDt.setDate(nextDt.getDate()+1);
  const todayDt = new Date(); todayDt.setHours(23,59,59,999);
  if (nextBtn) nextBtn.style.opacity = nextDt > todayDt ? '.3' : '1';
  const hint = document.getElementById('rep-nav-hint');
  const days = Math.round((todayDt - dt) / 86400000);
  if (hint) hint.textContent = days === 0 ? '📅 اضغط لاختيار تاريخ' : days === 1 ? 'أمس' : `منذ ${days} أيام`;
  loadReport();
}

function changeDay(d) {
  const dt = new Date(repDate+'T12:00:00');
  dt.setDate(dt.getDate() + d);
  const today = new Date();
  today.setHours(23,59,59,999);
  if (dt > today) return;
  repDate = dt.toISOString().slice(0,10);
  const nextDt = new Date(dt); nextDt.setDate(nextDt.getDate()+1);
  const nextBtn = document.getElementById('rep-next');
  if (nextBtn) nextBtn.style.opacity = nextDt > today ? '.3' : '1';
  const hint = document.getElementById('rep-nav-hint');
  if (hint) {
    const days = Math.round((today - dt) / 86400000);
    hint.textContent = days === 0 ? '' : days === 1 ? 'أمس' : `منذ ${days} أيام`;
  }
  loadReport();
}

// ================================================================
// بحث ذكي للزبائن في فورم إضافة المعاملة
// ================================================================
let allCustsCache = [];
let pendingNewCustName = '';

async function populateCustomerSelect() {
  if (!SESSION) return;
  allCustsCache = await db.customers.where('merchant_id').equals(SESSION.merchant_id).toArray();
}

// ================================================================
// الاختيارات السريعة لحقل البيان
// ================================================================
const DESC_CHIPS = {
  'بقالة':             ['بضاعة','مواد غذائية','مشروبات','علب ومعلبات','سجائر','أخرى'],
  'خضروات وفاكهة':    ['خضار','فاكهة','خضار وفاكهة','بقدونس وكزبرة','أخرى'],
  'لحوم ودواجن':      ['لحمة','دجاج','كبدة','سمك','لحوم مشكلة','أخرى'],
  'مخبز وحلويات':     ['خبز','حلويات','كعك','معجنات','بسكويت','أخرى'],
  'أدوية وصيدلية':    ['أدوية','مستلزمات طبية','مكملات','مستحضرات تجميل','أخرى'],
  'أدوات ومواد بناء': ['مواد بناء','إسمنت وحديد','دهانات','أدوات','سباكة','كهرباء','أخرى'],
  'ملابس وأقمشة':     ['ملابس','أقمشة','أحذية','إكسسوارات','بدلة','أخرى'],
  'إلكترونيات':       ['جوال','لابتوب','قطع غيار','إكسسوارات','صيانة','أخرى'],
  'مطعم أو مقهى':     ['وجبة','مشروبات','قهوة','وجبة عائلية','حلويات','أخرى'],
  'خدمات':            ['خدمة','صيانة','تصليح','تنظيف','توصيل','أخرى'],
  'أخرى':             ['بضاعة','خدمة','سلفة','أخرى'],
};

function renderDescChips() {
  const chips = document.getElementById('desc-chips');
  if (!chips) return;
  const type = SESSION?.store_type || 'أخرى';
  const list = DESC_CHIPS[type] || DESC_CHIPS['أخرى'];
  chips.innerHTML = list.map(c => `
    <button type="button"
      onclick="setDescChip('${c}')"
      style="padding:7px 14px;border:1.5px solid var(--brd);border-radius:20px;
      background:var(--bg2);color:var(--txt2);font-size:14px;font-weight:700;
      cursor:pointer;transition:all .15s"
      onmouseenter="this.style.background='var(--bg3)';this.style.borderColor='var(--pri)';this.style.color='var(--pri)'"
      onmouseleave="this.style.background='var(--bg2)';this.style.borderColor='var(--brd)';this.style.color='var(--txt2)'">
      ${c}
    </button>`).join('');
}

function setDescChip(val) {
  const desc = document.getElementById('add-desc');
  if (!desc) return;
  if (val === 'أخرى') {
    desc.value = '';
    desc.focus();
    return;
  }
  desc.value = val;
  // تمييز الزر المحدد
  document.querySelectorAll('#desc-chips button').forEach(b => {
    const isActive = b.textContent.trim() === val;
    b.style.background     = isActive ? 'var(--pri)' : 'var(--bg2)';
    b.style.color          = isActive ? '#fff'       : 'var(--txt2)';
    b.style.borderColor    = isActive ? 'var(--pri)' : 'var(--brd)';
  });
}

function filterCustSearch(q) {
  const dropdown = document.getElementById('cust-dropdown');
  const custInput = document.getElementById('add-cust');
  const newConfirm = document.getElementById('new-cust-confirm');
  if (!dropdown) return;

  const query = q.trim();

  if (!query) {
    dropdown.style.display = 'none';
    custInput.value = '';
    if (newConfirm) newConfirm.style.display = 'none';
    return;
  }

  // تصفية الأسماء
  const matches = allCustsCache.filter(c =>
    c.name.includes(query) || (c.phone||'').includes(query)
  );

  if (matches.length > 0) {
    if (newConfirm) newConfirm.style.display = 'none';
    dropdown.innerHTML = matches.map(c => {
      const bal = custBalances[c.id] || 0;
      return `<div onclick="selectCust('${c.id}','${c.name.replace(/'/g,"\'")}','${c.phone||''}')"
        style="padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--brd);
        display:flex;justify-content:space-between;align-items:center"
        onmouseenter="this.style.background='var(--bg3)'"
        onmouseleave="this.style.background=''">
        <div>
          <div style="font-size:16px;font-weight:800;color:var(--txt)">${c.name}</div>
          <div style="font-size:13px;color:var(--txt3);direction:ltr">${c.phone||'بدون رقم'}</div>
        </div>
        ${bal>0
          ? `<div style="font-size:15px;font-weight:900;color:var(--red)">${bal.toFixed(2)} ${CUR}</div>`
          : `<div style="font-size:12px;color:var(--grn);font-weight:700">مسوَّى ✓</div>`}
      </div>`;
    }).join('');
    dropdown.style.display = 'block';
  } else {
    // لا يوجد تطابق
    dropdown.style.display = 'none';
    custInput.value = '';
    pendingNewCustName = query;
    if (newConfirm) newConfirm.style.display = 'block';
  }
}

function selectCust(id, name, phone) {
  document.getElementById('add-cust-search').value = name;
  document.getElementById('add-cust').value = id;
  document.getElementById('add-phone').value = phone;
  document.getElementById('cust-dropdown').style.display = 'none';
  document.getElementById('new-cust-confirm').style.display = 'none';
  document.getElementById('phone-warn-row').style.display = phone ? 'none' : 'block';
}

function hideCustDropdown() {
  const dd = document.getElementById('cust-dropdown');
  if (dd) dd.style.display = 'none';
}

async function confirmNewCust() {
  if (!pendingNewCustName) return;
  const name = pendingNewCustName;
  // إنشاء زبون جديد مؤقتاً
  const id  = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.put('customers', {
    id, merchant_id: SESSION.merchant_id,
    name, phone: '',
    has_whatsapp: false,
    created_at: now
  });
  await addToQueue('add_customer', { local_id: id, name, phone: '', created_at: now });
  allCustsCache.push({ id, name, phone: '' });
  // تحديد الزبون الجديد
  selectCust(id, name, '');
  document.getElementById('new-cust-confirm').style.display = 'none';
  document.getElementById('phone-warn-row').style.display = 'block';
  pendingNewCustName = '';
}

function cancelNewCust() {
  document.getElementById('add-cust-search').value = '';
  document.getElementById('add-cust').value = '';
  document.getElementById('new-cust-confirm').style.display = 'none';
  pendingNewCustName = '';
}


// ================================================================
// التبويبات
// ================================================================
async function showTab(tab) {
  const map = {
    'home':      's-home',
    'customers': 's-customers',
    'add':       's-add',
    'reports':   's-reports'
  };
  showScreen(map[tab]);

  if (tab === 'customers') await renderCustomers();
  if (tab === 'add') {
    await populateCustomerSelect();
    await buildCustBalances();
    renderDescChips();
    renderAmountChips('amount-chips','add-amount');
    renderRecentCusts('add-recent', (id, name) => {
      const cust = allCustsCache.find(c=>c.id===id);
      document.getElementById('add-cust-search').value = name;
      document.getElementById('add-cust').value = id;
      document.getElementById('add-phone').value = cust?.phone||'';
    });
  }
  if (tab === 'reports') {
    currentRepTab = 'daily';
    switchRepTab('daily');
  }
}

// ================================================================
// الإعدادات
// ================================================================
async function showSettings() {
  const pending = await getPendingCount();
  const custs   = await db.getAll('customers').then(a=>a.length);
  const txs     = await db.getAll('transactions').then(a=>a.length);
  document.getElementById('settings-info').innerHTML = `
    <div style="font-size:15px;font-weight:700;margin-bottom:10px">${SESSION?.shop_name||''}</div>
    <div style="font-size:13px;color:var(--txt2);margin-bottom:6px">📞 ${SESSION?.name||''}</div>
    <div style="font-size:13px;color:var(--txt2);margin-bottom:6px">👥 ${custs} زبون محفوظ</div>
    <div style="font-size:13px;color:var(--txt2);margin-bottom:6px">📋 ${txs} معاملة</div>
    <div style="font-size:13px;color:${pending>0?'var(--yel)':'var(--grn)'}">
      ${pending>0?`🟡 ${pending} تغيير في انتظار المزامنة`:'🟢 كل البيانات مزامَنة'}
    </div>`;
}

// ================================================================
// مساعدات
// ================================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 's-settings') showSettings();
}

// ================================================================
// السحب للتنقل بين الشاشات الرئيسية
// ================================================================
(function initSwipe() {
  const TAB_ORDER = ['home','customers','add','reports'];
  const TAB_MAP   = {'home':'s-home','customers':'s-customers','add':'s-add','reports':'s-reports'};
  let swTouchX = 0;
  document.addEventListener('touchstart', e => {
    swTouchX = e.touches[0].clientX;
  }, {passive:true});
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - swTouchX;
    if (Math.abs(dx) < 60) return;
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const currentTab = Object.keys(TAB_MAP).find(k => TAB_MAP[k] === active.id);
    if (!currentTab) return;
    const idx = TAB_ORDER.indexOf(currentTab);
    if (idx < 0) return;
    // السحب لليسار = التالي (عكس RTL)
    const nextIdx = dx < 0
      ? Math.min(idx + 1, TAB_ORDER.length - 1)
      : Math.max(idx - 1, 0);
    if (nextIdx !== idx) showTab(TAB_ORDER[nextIdx]);
  }, {passive:true});
})();

function goBack() { showScreen(prevScreen); }

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function showErr(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

function doLogout() {
  if (confirm('تأكيد تسجيل الخروج؟ ستبقى البيانات على الجهاز')) {
    localStorage.removeItem('session');
    localStorage.removeItem('dd_session');
    SESSION = null;
    PLAN = null;
    showScreen('s-login');
  }
}

// دخول مطور مباشر — للاختبار فقط
async function devLogin() {
  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'login', phone: '+970591234567', pin: '1234' })
    });
    const d = await res.json();
    if (d.ok) {
      SESSION = {
        merchant_id:     d.merchant_id,
        token:           d.token,
        name:            d.name || 'المطور',
        shop_name:       d.shop_name || 'حساب المطور',
        currency:        d.currency || '₪',
        country_code:    d.country_code || 'PS',
        store_logo:      d.store_logo || '🛠️',
        onboarding_done: true,
        agreed_to_terms: true,
        phone:           '+970591234567',
        saved_at:        Date.now()
      };
      CUR = SESSION.currency;
      PLAN = d.plan_info || null;
      localStorage.setItem('dd_session',      JSON.stringify(SESSION));
      localStorage.setItem('session',         JSON.stringify(SESSION));
      localStorage.setItem('onboarding_done', '1');
      localStorage.setItem('terms_agreed',    Date.now().toString());
      await pullFromServer();
      showScreen('s-home');
      await loadHomeData();
      updateSubscriptionUI();
      monitorConnection();
    } else {
      alert('فشل دخول المطور: ' + (d.error||'خطأ'));
    }
  } catch(e) {
    alert('لا يوجد اتصال');
  }
}

// ================================================================
// مبالغ سريعة
// ================================================================
function renderAmountChips(containerId, inputId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const amounts = [5, 10, 20, 50, 100, 200, 500];
  el.innerHTML = amounts.map(a => `
    <button type="button" onclick="setQuickAmount('${inputId}',${a},this)"
      style="padding:7px 14px;border:1.5px solid var(--brd);border-radius:20px;
      background:var(--bg2);color:var(--txt2);font-size:15px;font-weight:800;cursor:pointer">
      ${a}
    </button>`).join('');
}

function setQuickAmount(inputId, val, btn) {
  document.getElementById(inputId).value = val;
  btn.closest('[id$="-chips"],#amount-chips,#quick-amount-chips')
    ?.querySelectorAll('button').forEach(b => {
    b.style.background  = b===btn ? 'var(--pri)' : 'var(--bg2)';
    b.style.color       = b===btn ? '#fff'       : 'var(--txt2)';
    b.style.borderColor = b===btn ? 'var(--pri)' : 'var(--brd)';
  });
}

// ================================================================
// زبائن أخيرون (آخر 5)
// ================================================================
function saveRecentCust(id, name) {
  let recent = JSON.parse(localStorage.getItem('recent_custs')||'[]');
  recent = [{ id, name }, ...recent.filter(r=>r.id!==id)].slice(0, 5);
  localStorage.setItem('recent_custs', JSON.stringify(recent));
}

function renderRecentCusts(containerId, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const recent = JSON.parse(localStorage.getItem('recent_custs')||'[]');
  if (!recent.length) { el.innerHTML=''; return; }
  el.innerHTML = `
    <div style="font-size:12px;color:var(--txt3);font-weight:700;margin-bottom:6px">الأخيرون:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${recent.map(r=>`
        <button type="button" onclick="(${onSelect})('${r.id}','${r.name.replace(/'/g,"\'")}')"
          style="padding:7px 13px;border:1.5px solid rgba(124,58,237,.4);border-radius:20px;
          background:rgba(124,58,237,.08);color:var(--txt);font-size:14px;font-weight:700;cursor:pointer">
          ${r.name}
        </button>`).join('')}
    </div>`;
}

// ================================================================
// الإضافة السريعة (FAB)
// ================================================================
async function openQuickAdd() {
  await populateCustomerSelect();
  document.getElementById('quick-cust-search').value = '';
  document.getElementById('quick-cust-id').value = '';
  document.getElementById('quick-amount').value = '';
  document.getElementById('quick-err').style.display = 'none';
  renderRecentCusts('quick-recent', (id, name) => {
    document.getElementById('quick-cust-search').value = name;
    document.getElementById('quick-cust-id').value = id;
    document.getElementById('quick-cust-dropdown').style.display = 'none';
    document.getElementById('quick-amount').focus();
  });
  renderAmountChips('quick-amount-chips', 'quick-amount');
  openModal('m-quick-add');
  setTimeout(() => document.getElementById('quick-cust-search').focus(), 300);
}

function filterQuickSearch(q) {
  const dd = document.getElementById('quick-cust-dropdown');
  const hiddenId = document.getElementById('quick-cust-id');
  if (!dd) return;
  const query = q.trim();
  if (!query) { dd.style.display='none'; hiddenId.value=''; return; }

  const matches = allCustsCache.filter(c =>
    c.name.includes(query)||(c.phone||'').includes(query));

  if (matches.length) {
    const allTx = [];
    dd.innerHTML = matches.slice(0,6).map(c => {
      const bal = custBalances[c.id] || 0;
      return `<div onclick="selectQuickCust('${c.id}','${c.name.replace(/'/g,"\'")}',this)"
        style="padding:11px 14px;cursor:pointer;border-bottom:1px solid var(--brd);
        display:flex;justify-content:space-between;align-items:center"
        onmouseenter="this.style.background='var(--bg3)'"
        onmouseleave="this.style.background=''">
        <div style="font-size:16px;font-weight:800">${c.name}</div>
        ${bal>0?`<div style="font-size:14px;font-weight:900;color:var(--red)">${bal.toFixed(2)} ${CUR}</div>`
          :'<div style="font-size:12px;color:var(--grn)">مسوَّى</div>'}
      </div>`;
    }).join('');
    dd.style.display = 'block';
  } else {
    dd.style.display='none';
    hiddenId.value='';
  }
}

function selectQuickCust(id, name) {
  document.getElementById('quick-cust-search').value = name;
  document.getElementById('quick-cust-id').value = id;
  document.getElementById('quick-cust-dropdown').style.display = 'none';
  document.getElementById('quick-amount').focus();
}

async function submitQuickDebt() {
  const custId = document.getElementById('quick-cust-id').value;
  const name   = document.getElementById('quick-cust-search').value.trim();
  const amount = parseFloat(document.getElementById('quick-amount').value);
  const err    = document.getElementById('quick-err');

  if (!name)              { showErr(err,'اختر زبوناً'); return; }
  if (!amount||amount<=0) { showErr(err,'أدخل مبلغاً صحيحاً'); return; }

  err.style.display='none';

  let finalCustId = custId;

  // زبون جديد
  if (!finalCustId) {
    finalCustId = crypto.randomUUID();
    const now2 = new Date().toISOString();
    await db.put('customers',{id:finalCustId,merchant_id:SESSION.merchant_id,
      name,phone:'',has_whatsapp:false,created_at:now2});
    await addToQueue('add_customer',{local_id:finalCustId,name,phone:'',created_at:now2});
    allCustsCache.push({id:finalCustId,name,phone:''});
  }

  saveRecentCust(finalCustId, name);

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.put('transactions',{id,merchant_id:SESSION.merchant_id,
    customer_id:finalCustId,amount,description:'بضاعة',
    status:'غير مدفوع',created_at:now});
  await addToQueue('add_transaction',{local_id:id,customer_id:finalCustId,
    amount,description:'بضاعة',created_at:now});

  closeModal('m-quick-add');
  await loadHomeData();
  if (navigator.onLine) doSync();
  else getPendingCount().then(n=>updateSyncBar('pending',n));

  // تنبيه خفيف
  const fab = document.getElementById('fab-btn');
  if (fab) {
    fab.textContent='✅';
    fab.style.background='linear-gradient(135deg,#065f46,#10b981)';
    setTimeout(()=>{fab.textContent='⚡';
      fab.style.background='linear-gradient(135deg,#7c3aed,#a855f7)';},1500);
  }
}

// رصيد كل زبون (يُحسب عند تحميل البيانات)
let custBalances = {};
async function buildCustBalances() {
  if (!SESSION) return;
  const mid  = SESSION.merchant_id;
  const allTx= await db.getAll('transactions').then(a=>a.filter(t=>t.merchant_id===mid));
  const debts= allTx.filter(t=>!t.is_partial_payment);
  custBalances = {};
  debts.forEach(t=>{
    const paid=allTx.filter(p=>p.partial_payment_parent_id===t.id)
      .reduce((s,p)=>s+Number(p.amount||0),0);
    const rem=Math.max(0,Number(t.amount)-paid);
    custBalances[t.customer_id]=(custBalances[t.customer_id]||0)+rem;
  });
}

// ================================================================
// ضغطة طويلة على الدين في الرئيسية لفتح الدفع السريع
// ================================================================
function addLongPressToDebt(el, txId, rem, custId, desc) {
  let timer;
  el.addEventListener('touchstart', ()=>{
    timer = setTimeout(()=>{
      openPayModal(txId, rem, custId, desc);
    }, 600);
  }, {passive:true});
  el.addEventListener('touchend', ()=> clearTimeout(timer), {passive:true});
  el.addEventListener('touchmove', ()=> clearTimeout(timer), {passive:true});
}

// ================================================================
// تشغيل
// ================================================================
// تسجيل Service Worker للعمل بدون إنترنت
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/DaftarEldayen/sw.js', {scope:'/DaftarEldayen/'})
    .then(reg => {
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed') reg.waiting?.postMessage('SKIP_WAITING');
        });
      });
    }).catch(() => {});
}

// ================================================================
// تسجيل مستخدم جديد
// ================================================================
let newMerchantId = null;

async function doRegister() {
  const phone = document.getElementById('reg-phone').value.trim();
  const name  = document.getElementById('reg-name').value.trim();
  const err   = document.getElementById('reg-err');

  if (!phone) { showErr(err, 'أدخل رقم الهاتف'); return; }
  if (!name)  { showErr(err, 'أدخل اسمك'); return; }

  err.style.display = 'none';
  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', phone, name })
    });
    const d = await res.json();
    if (d.error) { showErr(err, d.error); return; }
    if (d.ok && d.need_setup) {
      newMerchantId = d.merchant_id;
      document.getElementById('reg-step1').style.display = 'none';
      document.getElementById('reg-step2').style.display = 'block';
    }
  } catch(e) {
    showErr(err, 'تأكد من الاتصال بالإنترنت');
  }
}

async function doSetPin() {
  const pin1 = document.getElementById('reg-pin1').value.trim();
  const pin2 = document.getElementById('reg-pin2').value.trim();
  const err  = document.getElementById('reg-err');

  if (pin1.length < 4) { showErr(err, 'الرقم السري 4 أرقام على الأقل'); return; }
  if (pin1 !== pin2)   { showErr(err, 'الرقمان غير متطابقين'); return; }

  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_pin', merchant_id: newMerchantId, pin: pin1 })
    });
    const d = await res.json();
    if (d.error) { showErr(err, d.error); return; }
    document.getElementById('inp-phone').value = document.getElementById('reg-phone').value;
    document.getElementById('inp-pin').value   = pin1;
    showScreen('s-login');
    doLogin();
  } catch(e) {
    showErr(err, 'تأكد من الاتصال بالإنترنت');
  }
}

// ================================================================
// نسيت الرقم السري
// ================================================================
let forgotMerchantId = null;

async function doSendOTP() {
  const phone = document.getElementById('fgt-phone').value.trim();
  const err   = document.getElementById('fgt-err');

  if (!phone) { showErr(err, 'أدخل رقم الهاتف'); return; }
  err.style.display = 'none';

  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'gen_otp', phone })
    });
    const d = await res.json();
    if (d.error) { showErr(err, d.error); return; }
    forgotMerchantId = d.merchant_id;
    document.getElementById('fgt-step1').style.display = 'none';
    document.getElementById('fgt-step2').style.display = 'block';
  } catch(e) {
    showErr(err, 'تأكد من الاتصال بالإنترنت');
  }
}

async function doResetPin() {
  const otp = document.getElementById('fgt-otp').value.trim();
  const pin = document.getElementById('fgt-pin').value.trim();
  const err = document.getElementById('fgt-err');

  if (!otp)           { showErr(err, 'أدخل رمز التحقق'); return; }
  if (pin.length < 4) { showErr(err, 'الرقم السري 4 أرقام على الأقل'); return; }

  try {
    const r1 = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_otp', merchant_id: forgotMerchantId, otp })
    });
    const d1 = await r1.json();
    if (d1.error || !d1.ok) { showErr(err, d1.error || 'رمز التحقق غير صحيح'); return; }

    const r2 = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_pin', merchant_id: forgotMerchantId, pin })
    });
    const d2 = await r2.json();
    if (d2.error) { showErr(err, d2.error); return; }

    alert('✅ تم تغيير الرقم السري — ادخل الآن');
    showScreen('s-login');
  } catch(e) {
    showErr(err, 'تأكد من الاتصال بالإنترنت');
  }
}

init();

// ---- متغيرات AI Chat ----
let aiHistory = [];
let aiRecognition = null;
let aiListening = false;
let aiBusy = false;

const AI_SYSTEM = `أنت مساعد ذكي لتاجر فلسطيني لديه دفتر ديون.
قواعد صارمة:
- رد بالعامية الشامية الفلسطينية فقط
- جملة أو جملتين بالحد الأقصى
- استخدم الأداة دائماً قبل الإجابة
- الوحدة شيكل
- لا تتكلم عن أي شيء خارج الديون والزبائن`;

const AI_TOOLS = [
  {
    name: 'query_customer_balance',
    description: 'استعلام عن رصيد ودين زبون معين بالاسم',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'اسم الزبون' }
      },
      required: ['customer_name']
    }
  },
  {
    name: 'get_customer_transactions',
    description: 'عرض تفاصيل معاملات زبون معين — شو اشترى',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string', description: 'اسم الزبون' }
      },
      required: ['customer_name']
    }
  },
  {
    name: 'list_all_debtors',
    description: 'عرض كل الزبائن اللي عليهم دين غير مدفوع',
    input_schema: { type: 'object', properties: {}, required: [] }
  }
];

// ---- قراءة LocalDB بطريقة مرنة ----
async function aiDbGetAll(storeName) {
  try {
    if (window.localDB) {
      if (typeof window.localDB.getAll === 'function')
        return await window.localDB.getAll(storeName);
      if (window.localDB[storeName]) {
        if (typeof window.localDB[storeName].getAll === 'function')
          return await window.localDB[storeName].getAll();
        if (typeof window.localDB[storeName].toArray === 'function')
          return await window.localDB[storeName].toArray();
      }
    }
    if (window.db) {
      if (typeof window.db.getAll === 'function')
        return await window.db.getAll(storeName);
    }
  } catch (e) {
    console.error('aiDbGetAll error:', e);
  }
  return [];
}

// ---- تنفيذ الأدوات ----
async function aiRunTool(name, input) {
  try {
    const mId = window.MERCHANT_ID || window.merchantId || '';

    if (name === 'query_customer_balance') {
      const customers = await aiDbGetAll('customers');
      const found = customers.find(c =>
        (mId === '' || c.merchant_id === mId) &&
        (c.name.includes(input.customer_name) || input.customer_name.includes(c.name))
      );
      if (!found) return { error: true, msg: `ما في زبون اسمه "${input.customer_name}"` };

      const txns = await aiDbGetAll('transactions');
      const mine = txns.filter(t => t.customer_id === found.id);
      const debt = mine.filter(t => t.type === 'debt' || t.type === 'debit')
                       .reduce((s, t) => s + (t.amount || 0), 0);
      const paid = mine.filter(t => t.type === 'payment' || t.type === 'credit')
                       .reduce((s, t) => s + (t.amount || 0), 0);
      return {
        name: found.name,
        balance: debt - paid,
        currency: 'شيكل',
        txn_count: mine.length
      };
    }

    if (name === 'get_customer_transactions') {
      const customers = await aiDbGetAll('customers');
      const found = customers.find(c =>
        (mId === '' || c.merchant_id === mId) &&
        (c.name.includes(input.customer_name) || input.customer_name.includes(c.name))
      );
      if (!found) return { error: true, msg: `ما في زبون اسمه "${input.customer_name}"` };

      const txns = await aiDbGetAll('transactions');
      const mine = txns
        .filter(t => t.customer_id === found.id)
        .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))
        .slice(0, 6);

      return {
        name: found.name,
        transactions: mine.map(t => ({
          type: (t.type === 'debt' || t.type === 'debit') ? 'دين' : 'دفعة',
          amount: t.amount,
          notes: t.notes || t.description || '',
          date: new Date(t.created_at || t.date).toLocaleDateString('ar')
        }))
      };
    }

    if (name === 'list_all_debtors') {
      const customers = await aiDbGetAll('customers');
      const txns = await aiDbGetAll('transactions');

      const debtors = customers
        .filter(c => mId === '' || c.merchant_id === mId)
        .map(c => {
          const mine = txns.filter(t => t.customer_id === c.id);
          const debt = mine.filter(t => t.type === 'debt' || t.type === 'debit')
                           .reduce((s, t) => s + (t.amount || 0), 0);
          const paid = mine.filter(t => t.type === 'payment' || t.type === 'credit')
                           .reduce((s, t) => s + (t.amount || 0), 0);
          return { name: c.name, balance: debt - paid };
        })
        .filter(c => c.balance > 0)
        .sort((a, b) => b.balance - a.balance);

      return { debtors, count: debtors.length };
    }

  } catch (err) {
    return { error: true, msg: 'خطأ في قراءة البيانات: ' + err.message };
  }
  return { error: 'unknown tool' };
}

// ---- API Call ----
async function aiCallAPI(messages) {
  const r = await fetch('https://ziehhwdphavnbmltxnmc.supabase.co/functions/v1/ai-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (window.SESSION?.access_token || '')
    },
    body: JSON.stringify({ messages, system: AI_SYSTEM, tools: AI_TOOLS })
  });
  return r.json();
}

// ---- إضافة رسالة للمحادثة ----
function aiAddMsg(html, cls) {
  const box = document.getElementById('aiMessages');
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
  return d;
}

// ---- إرسال رسالة ----
async function sendAI() {
  const inp = document.getElementById('aiInput');
  const txt = inp.value.trim();
  if (!txt || aiBusy) return;

  inp.value = '';
  aiBusy = true;

  aiAddMsg(txt, 'ai-user-msg');
  const thinking = aiAddMsg('يفكر...', 'ai-think-msg');

  aiHistory.push({ role: 'user', content: txt });

  try {
    let res = await aiCallAPI(aiHistory);

    while (res.stop_reason === 'tool_use') {
      const calls = res.content.filter(b => b.type === 'tool_use');
      aiHistory.push({ role: 'assistant', content: res.content });

      const results = await Promise.all(calls.map(async tc => ({
        type: 'tool_result',
        tool_use_id: tc.id,
        content: JSON.stringify(await aiRunTool(tc.name, tc.input))
      })));

      aiHistory.push({ role: 'user', content: results });
      res = await aiCallAPI(aiHistory);
    }

    const tb = res.content && res.content.find(b => b.type === 'text');
    const reply = (tb && tb.text && tb.text.trim()) ? tb.text : 'ما قدرت أجاوب';
    aiHistory.push({ role: 'assistant', content: res.content });

    thinking.remove();
    aiAddMsg(reply, 'ai-bot-msg');

  } catch (e) {
    thinking.remove();
    aiAddMsg('صار خطأ في الاتصال', 'ai-bot-msg');
  }

  aiBusy = false;
}

// ---- فتح / إغلاق النافذة ----
function openAIChat() {
  const ov = document.getElementById('aiOverlay');
  ov.style.display = 'flex';
  document.getElementById('aiInput').focus();
}

function closeAIChat() {
  document.getElementById('aiOverlay').style.display = 'none';
  if (aiRecognition) aiRecognition.stop();
}

function aiOverlayClick(e) {
  if (e.target === document.getElementById('aiOverlay')) closeAIChat();
}

// ---- الميكروفون ----
function startAIMic(e) {
  if (e) e.preventDefault();
  const supported = 'webkitSpeechRecognition' in window
                 || 'SpeechRecognition' in window;
  if (!supported) {
    document.getElementById('aiMicTxt').textContent = 'استخدم Chrome';
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  aiRecognition = new SR();
  aiRecognition.lang = 'ar-SA';
  aiRecognition.interimResults = true;
  aiRecognition.continuous = true;
  aiRecognition.onstart = () => {
    aiListening = true;
    document.getElementById('aiMicBtn').classList.add('mic-on');
    document.getElementById('aiMicTxt').textContent = 'يسمع...';
    document.getElementById('aiInput').value = '';
  };
  aiRecognition.onresult = (e) => {
    let t = '';
    for (let i = 0; i < e.results.length; i++)
      t += e.results[i][0].transcript;
    document.getElementById('aiInput').value = t;
  };
  aiRecognition.onerror = () => aiStopMic();
  aiRecognition.onend   = () => aiStopMic();
  aiRecognition.start();
}

function stopAIMic() {
  if (aiRecognition) aiRecognition.stop();
  aiStopMic();
  const txt = document.getElementById('aiInput').value.trim();
  if (txt) setTimeout(() => sendAI(), 300);
}
function aiStopMic() {
  aiListening = false;
  document.getElementById('aiMicBtn').classList.remove('mic-on');
  setTimeout(() => { document.getElementById('aiMicTxt').textContent = ''; }, 2000);
}

// ================================================================
// ميكروفون عالمي لكل خانات النص
// ================================================================
let globalMicActive = false;
let globalMicRec = null;
let globalMicTarget = null;

function initGlobalMic() {
  // إضافة أيقونة مايك لكل input text/tel/search
  document.querySelectorAll('input[type="text"],input[type="tel"],input[type="search"],input[type="number"]').forEach(inp => {
    if (inp.dataset.micAdded) return;
    inp.dataset.micAdded = '1';
    const wrap = inp.parentElement;
    const pos = window.getComputedStyle(wrap).position;
    if (pos === 'static') wrap.style.position = 'relative';
    inp.style.paddingLeft = '36px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'position:absolute;left:8px;top:50%;transform:translateY(-50%);' +
      'width:26px;height:26px;background:none;border:none;cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;z-index:5;padding:0;opacity:.5';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
      viewBox="0 0 24 24" fill="none" stroke="#1565c0" stroke-width="2.5">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
    </svg>`;
    btn.addEventListener('mousedown', e => { e.preventDefault(); startGlobalMic(inp, btn); });
    btn.addEventListener('mouseup',   e => { e.preventDefault(); stopGlobalMic(); });
    btn.addEventListener('touchstart', e => { e.preventDefault(); startGlobalMic(inp, btn); }, {passive:false});
    btn.addEventListener('touchend',   e => { e.preventDefault(); stopGlobalMic(); }, {passive:false});
    wrap.appendChild(btn);
  });
}

function startGlobalMic(targetInput, btn) {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) return;
  globalMicTarget = targetInput;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  globalMicRec = new SR();
  globalMicRec.lang = 'ar-SA';
  globalMicRec.interimResults = true;
  globalMicRec.continuous = true;
  globalMicRec.onstart = () => {
    globalMicActive = true;
    btn.style.opacity = '1';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
      viewBox="0 0 24 24" fill="none" stroke="#c62828" stroke-width="2.5">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
    </svg>`;
  };
  globalMicRec.onresult = e => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    globalMicTarget.value = t;
    globalMicTarget.dispatchEvent(new Event('input'));
  };
  globalMicRec.onend = () => {
    globalMicActive = false;
    btn.style.opacity = '.5';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
      viewBox="0 0 24 24" fill="none" stroke="#1565c0" stroke-width="2.5">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="8" y1="22" x2="16" y2="22"/>
    </svg>`;
  };
  globalMicRec.start();
}

function stopGlobalMic() {
  if (globalMicRec) globalMicRec.stop();
}
