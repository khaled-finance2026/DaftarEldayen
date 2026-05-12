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

function setStoreLogo(emoji) {
  currentSetupLogo = emoji;
  const preview = document.getElementById('setup-logo-preview');
  if (preview) preview.textContent = emoji;
  document.querySelectorAll('.logo-btn').forEach(b => {
    b.classList.remove('active');
    if (b.textContent.trim() === emoji) b.classList.add('active');
  });
}

function onCountryChange() {
  const sel = document.getElementById('setup-country');
  const opt = sel.options[sel.selectedIndex];
  // عرض العملة
  const sym = opt.dataset.sym || '₪';
  const existing = document.getElementById('currency-hint');
  if (existing) existing.textContent = `العملة: ${sym}`;
}

function acceptTermsAndSetup() {
  // حفظ الموافقة محلياً
  localStorage.setItem('terms_agreed', Date.now().toString());
  showScreen('s-setup-shop');
  // تعبئة الرقم كواتساب افتراضياً
  if (SESSION?.phone) {
    document.getElementById('setup-wa').value = SESSION.phone;
  }
  // تفعيل الشعار الافتراضي
  setStoreLogo('🏪');
}

async function saveShopSetup() {
  const shop  = document.getElementById('setup-shop').value.trim();
  const owner = document.getElementById('setup-owner').value.trim();
  const country = document.getElementById('setup-country').value;
  const city  = document.getElementById('setup-city').value.trim();
  const email = document.getElementById('setup-email').value.trim();
  const wa    = document.getElementById('setup-wa').value.trim();
  const type  = document.getElementById('setup-type').value;
  const err   = document.getElementById('setup-err');

  if (!shop)  { err.textContent='أدخل اسم المتجر'; err.style.display='block'; return; }
  if (!owner) { err.textContent='أدخل اسمك'; err.style.display='block'; return; }
  err.style.display='none';

  // تحديث العملة
  const sel = document.getElementById('setup-country');
  const opt = sel.options[sel.selectedIndex];
  const sym = opt.dataset.sym || SESSION?.currency || '₪';

  // حفظ في الجلسة المحلية فوراً
  SESSION.shop_name    = shop;
  SESSION.name         = owner;
  SESSION.currency     = sym;
  SESSION.store_logo   = currentSetupLogo;
  SESSION.country_code = country;
  SESSION.onboarding_done = true;
  SESSION.agreed_to_terms = true;
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
          action:   'save_profile',
          tok:       SESSION.token,
          shop_name: shop,
          owner_name: owner,
          country_code: country,
          currency_sym: sym,
          store_type: type,
          store_logo: currentSetupLogo,
          city, email, whatsapp: wa,
          agreed: true
        })
      });
    } catch(e) {}
  } else {
    // حفظ في قائمة المزامنة
    await addToQueue('save_profile', {
      shop_name: shop, owner_name: owner,
      country_code: country, currency_sym: sym,
      store_type: type, store_logo: currentSetupLogo,
      city, email, whatsapp: wa, agreed: true
    });
  }

  // انتقل للشاشة الرئيسية
  document.getElementById('shop-name').textContent = shop;
  showScreen('s-home');
  await loadHomeData();
  updateSubscriptionUI();
  monitorConnection();
  if (navigator.onLine) setTimeout(doSync, 1000);
  checkLongPending();
  setInterval(checkLongPending, 30*60*1000);
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

  // شريط التقدم للعملاء
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
        <span>عدد العملاء</span>
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

  // تحذير قرب الحد
  if (p.max_customers!==-1 && p.cust_count >= p.max_customers*0.9) {
    const warn = document.getElementById('pending-warn');
    if (warn && warn.style.display==='none') {
      warn.style.display='block';
      warn.style.background='rgba(217,119,6,.9)';
      warn.innerHTML=`⚠️ وصلت لـ ${p.cust_count} من أصل ${p.max_customers} عميل — <b>ارقِّ خطتك قبل الامتلاء</b>`;
    }
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
          <li>✅ حتى 200 عميل</li>
          <li>✅ إرسال كشف الحساب للعميل</li>
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
          <li>✅ عملاء غير محدودين</li>
          <li>✅ كل التاريخ منذ البداية</li>
          <li>⭐ أولوية في الدعم</li>
        </ul>
      </div>
    </div>
    <a href="https://wa.me/970591234567?text=أريد الاشتراك في دفتر الدين" target="_blank"
      style="display:block;text-align:center;padding:14px;background:linear-gradient(135deg,#065f46,#10b981);
      border-radius:12px;color:#fff;font-size:16px;font-weight:800;text-decoration:none;margin-bottom:8px">
      📲 اشترك الآن عبر واتساب
    </a>
    <div style="text-align:center;font-size:12px;color:var(--txt3);margin-top:8px">
      14 يوم تجريبي مجاني عند الاشتراك لأول مرة
    </div>`;
  openModal('m-contact');
}

// فحص الحد قبل إضافة عميل
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
// إرسال كشف الحساب للعميل
// ================================================================
let stmtCustomer = null;

async function sendStatementToCustomer() {
  if (!currentCustomer) return;
  const cust = await db.get('customers', currentCustomer) || {};
  const txs  = await db.getAllByIndex('transactions','customer_id',currentCustomer);
  stmtCustomer = cust;
  const debts    = txs.filter(t=>!t.is_partial_payment);
  const totalPaid= txs.filter(t=>t.is_partial_payment&&t.status==='مدفوع')
    .reduce((s,t)=>s+Number(t.amount||0),0);
  const totalDebt= debts.reduce((s,t)=>s+Number(t.amount||0),0);
  const bal = totalDebt - totalPaid;
  const date= new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const shop= SESSION.shop_name||'دفتر الدين';

  const rows = debts.map(t=>{
    const paid=txs.filter(p=>p.partial_payment_parent_id===t.id)
      .reduce((s,p)=>s+Number(p.amount||0),0);
    const rem=Math.max(0,Number(t.amount)-paid);
    const dt=t.created_at?new Date(t.created_at).toLocaleDateString('ar-EG',
      {day:'numeric',month:'short',year:'numeric'}):'';
    return `<tr><td style="padding:10px 8px;font-size:14px">${t.description||'دين'}</td>
      <td style="padding:10px 8px;font-size:13px;color:#64748b;text-align:center">${dt}</td>
      <td style="padding:10px 8px;font-size:14px;font-weight:700;color:#dc2626;text-align:left">${Number(t.amount).toFixed(2)} ${CUR}</td>
      <td style="padding:10px 8px;font-size:14px;font-weight:800;color:${rem<=0?'#16a34a':'#b45309'};text-align:left">${rem<=0?'✓ مسدَّد':rem.toFixed(2)+' '+CUR}</td>
    </tr>`;
  }).join('');

  document.getElementById('stmt-send-content').innerHTML=`<div id="stmt-print" style="direction:rtl;font-family:Arial,sans-serif;background:#fff;color:#111;padding:18px;border-radius:12px">
    <div style="text-align:center;border-bottom:2px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px">
      <div style="font-size:20px;font-weight:900;color:#1e40af">📒 ${shop}</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px">كشف حساب</div></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;background:#f8fafc;border-radius:8px;padding:10px 12px">
      <div><div style="font-size:13px;color:#64748b">العميل</div>
        <div style="font-size:17px;font-weight:800">${cust.name||'—'}</div>
        <div style="font-size:14px;color:#3b82f6;direction:ltr">${cust.phone||''}</div></div>
      <div style="text-align:left"><div style="font-size:13px;color:#64748b">التاريخ</div>
        <div style="font-size:14px;font-weight:700">${date}</div></div></div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <thead><tr style="background:#1e293b;color:#fff">
        <th style="padding:9px 8px;text-align:right;font-size:13px">البيان</th>
        <th style="padding:9px 8px;text-align:center;font-size:13px">التاريخ</th>
        <th style="padding:9px 8px;text-align:left;font-size:13px">المبلغ</th>
        <th style="padding:9px 8px;text-align:left;font-size:13px">المتبقي</th>
      </tr></thead>
      <tbody>${rows}</tbody></table>
    <div style="background:${bal>0?'#fef2f2':'#f0fdf4'};border-radius:10px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:15px;font-weight:700;color:${bal>0?'#991b1b':'#166534'}">${bal>0?'الرصيد المتبقي عليك':'الحساب مسوَّى ✓'}</div>
      <div style="font-size:22px;font-weight:900;color:${bal>0?'#dc2626':'#16a34a'}">${bal>0?bal.toFixed(2)+' '+CUR:'0.00 '+CUR}</div></div>
    <div style="text-align:center;margin-top:12px;font-size:12px;color:#94a3b8">شكراً لتعاملكم — ${shop}</div>
  </div>`;
  openModal('m-stmt-send');
}

function buildStmtText() {
  if(!stmtCustomer) return '';
  const el=document.getElementById('stmt-send-content');
  const trows=el.querySelectorAll('tbody tr');
  const bal=el.querySelector('[style*="font-size:22px"]');
  let txt=`📒 *كشف حساب — ${SESSION.shop_name||'دفتر الدين'}*\n`;
  txt+=`━━━━━━━━━━━━━━━━━━\n`;
  txt+=`👤 *${stmtCustomer.name}*\n`;
  txt+=`📅 ${new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'})}\n`;
  txt+=`━━━━━━━━━━━━━━━━━━\n`;
  trows.forEach(r=>{
    const c=r.querySelectorAll('td');
    if(c.length>=4) txt+=`• ${c[0].textContent.trim()} — متبقي: ${c[3].textContent.trim()}\n`;
  });
  txt+=`━━━━━━━━━━━━━━━━━━\n`;
  if(bal) txt+=`💰 *الرصيد: ${bal.textContent.trim()}*\n`;
  txt+=`شكراً لتعاملكم 🙏`;
  return txt;
}

function sendStmtWhatsapp(){
  const phone=(stmtCustomer?.phone||'').replace(/[^0-9]/g,'');
  const txt=buildStmtText();
  window.open(phone?`https://wa.me/${phone}?text=${encodeURIComponent(txt)}`:`https://wa.me/?text=${encodeURIComponent(txt)}`,'_blank');
}
function sendStmtEmail(){
  const txt=buildStmtText();
  window.open(`mailto:?subject=${encodeURIComponent('كشف حساب — '+(stmtCustomer?.name||''))}&body=${encodeURIComponent(txt)}`,'_blank');
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
// إدارة الفاتورة المفصلة
// ================================================================
function toggleInvoice() {
  const sec = document.getElementById('inv-section');
  const btn = document.getElementById('inv-toggle-btn');
  const isOpen = sec.classList.contains('open');
  if (!isOpen) {
    sec.classList.add('open');
    btn.innerHTML = '✕ إلغاء الفاتورة المفصلة';
    btn.style.borderColor = 'rgba(239,68,68,.5)';
    btn.style.color = 'var(--red)';
    if (invRows.length === 0) addInvRow();
  } else {
    sec.classList.remove('open');
    btn.innerHTML = '🧾 إضافة فاتورة مفصلة (اختياري)';
    btn.style.borderColor = 'rgba(59,130,246,.4)';
    btn.style.color = 'var(--pri)';
    invRows = [];
  }
}

function addInvRow() {
  const id = Date.now();
  invRows.push({ id, desc:'', qty:1, price:0 });
  renderInvTable();
}

function delInvRow(id) {
  invRows = invRows.filter(r => r.id !== id);
  renderInvTable();
  calcInvTotal();
}

function updateInvRow(id, field, val) {
  const r = invRows.find(r => r.id === id);
  if (r) {
    r[field] = field === 'desc' ? val : (parseFloat(val) || 0);
    if (field !== 'desc') calcInvTotal();
    // تحديث خلية الإجمالي
    const totEl = document.getElementById('row-tot-' + id);
    if (totEl) totEl.textContent = (r.qty * r.price).toFixed(2);
  }
}

function renderInvTable() {
  const tbody = document.getElementById('inv-rows');
  tbody.innerHTML = invRows.map(r => `
    <tr>
      <td><input class="inv-inp" value="${r.desc}" placeholder="بضاعة..."
        oninput="updateInvRow(${r.id},'desc',this.value)"></td>
      <td><input class="inv-inp" type="number" value="${r.qty}" min="0.01" step="0.01"
        oninput="updateInvRow(${r.id},'qty',this.value)"></td>
      <td><input class="inv-inp" type="number" value="${r.price}" min="0" step="0.01"
        oninput="updateInvRow(${r.id},'price',this.value)"></td>
      <td id="row-tot-${r.id}" style="font-weight:800;font-size:14px;color:var(--txt)">
        ${(r.qty * r.price).toFixed(2)}
      </td>
      <td><button class="del-row" onclick="delInvRow(${r.id})">✕</button></td>
    </tr>`).join('');
  calcInvTotal();
}

function calcInvTotal() {
  const total = invRows.reduce((s,r) => s + (r.qty * r.price), 0);
  document.getElementById('inv-total-display').textContent = total.toFixed(2) + ' ' + CUR;
  // تعبئة حقل المبلغ تلقائياً
  if (total > 0) {
    document.getElementById('add-amount').value = total.toFixed(2);
  }
  return total;
}

// ================================================================
// عرض ومشاركة الفاتورة
// ================================================================
function buildInvoiceHTML(tx, cust, items) {
  const date = tx.created_at
    ? new Date(tx.created_at).toLocaleDateString('ar-EG',
        {year:'numeric',month:'long',day:'numeric'})
    : new Date().toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const total = items.reduce((s,r) => s + (Number(r.qty)*Number(r.price)), 0);

  return `<div id="inv-print" style="direction:rtl;font-family:Arial,sans-serif;
    background:#fff;color:#111;padding:20px;border-radius:12px">
    <div style="text-align:center;border-bottom:2px solid #e2e8f0;padding-bottom:14px;margin-bottom:14px">
      <div style="font-size:22px;font-weight:900;color:#1e40af">📒 دفتر الدين</div>
      <div style="font-size:13px;color:#64748b;margin-top:4px">فاتورة مبيعات</div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;
      background:#f8fafc;border-radius:8px;padding:12px">
      <div>
        <div style="font-size:13px;color:#64748b">العميل</div>
        <div style="font-size:17px;font-weight:800">${cust.name||'—'}</div>
        <div style="font-size:14px;color:#3b82f6;direction:ltr">${cust.phone||''}</div>
      </div>
      <div style="text-align:left">
        <div style="font-size:13px;color:#64748b">التاريخ</div>
        <div style="font-size:15px;font-weight:700">${date}</div>
        <div style="font-size:12px;color:#64748b">${tx.description||''}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:12px">
      <thead>
        <tr style="background:#1e293b;color:#fff">
          <th style="padding:10px 8px;text-align:right;font-size:13px">البيان</th>
          <th style="padding:10px 8px;text-align:center;font-size:13px">الكمية</th>
          <th style="padding:10px 8px;text-align:center;font-size:13px">السعر</th>
          <th style="padding:10px 8px;text-align:left;font-size:13px">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((r,i) => `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
          <td style="padding:9px 8px;font-size:14px;font-weight:600">${r.desc||'—'}</td>
          <td style="padding:9px 8px;text-align:center;font-size:14px">${r.qty}</td>
          <td style="padding:9px 8px;text-align:center;font-size:14px">${Number(r.price).toFixed(2)}</td>
          <td style="padding:9px 8px;text-align:left;font-size:14px;font-weight:800">
            ${(Number(r.qty)*Number(r.price)).toFixed(2)} ${CUR}
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="background:#1e40af;color:#fff;border-radius:10px;padding:14px 16px;
      display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:16px;font-weight:700">الإجمالي الكلي</div>
      <div style="font-size:24px;font-weight:900">${total.toFixed(2)} ${CUR}</div>
    </div>
    <div style="text-align:center;margin-top:14px;font-size:12px;color:#94a3b8">
      شكراً لتعاملكم معنا
    </div>
  </div>`;
}

async function showInvoice(txId) {
  const tx   = await db.get('transactions', txId);
  if (!tx || !tx.invoice_items?.length) return;
  const cust = await db.get('customers', tx.customer_id) || {};
  currentInvoice = { tx, cust };
  document.getElementById('inv-print').innerHTML =
    buildInvoiceHTML(tx, cust, tx.invoice_items).replace('<div id="inv-print"','<div');
  openModal('m-invoice');
}

function buildInvoiceText(tx, cust, items) {
  const date = new Date(tx.created_at||Date.now())
    .toLocaleDateString('ar-EG',{year:'numeric',month:'long',day:'numeric'});
  const total = items.reduce((s,r) => s + Number(r.qty)*Number(r.price), 0);
  let txt = `📒 *دفتر الدين — فاتورة*\n`;
  txt += `───────────────────\n`;
  txt += `👤 العميل: ${cust.name||'—'}\n`;
  txt += `📅 التاريخ: ${date}\n`;
  if (tx.description) txt += `📝 البيان: ${tx.description}\n`;
  txt += `───────────────────\n`;
  items.forEach(r => {
    txt += `• ${r.desc} × ${r.qty} × ${Number(r.price).toFixed(2)} = ${(Number(r.qty)*Number(r.price)).toFixed(2)} ${CUR}\n`;
  });
  txt += `───────────────────\n`;
  txt += `💰 *الإجمالي: ${total.toFixed(2)} ${CUR}*\n`;
  txt += `───────────────────\n`;
  txt += `شكراً لتعاملكم 🙏`;
  return txt;
}

function shareInvoiceWhatsapp() {
  if (!currentInvoice) return;
  const { tx, cust } = currentInvoice;
  const txt  = buildInvoiceText(tx, cust, tx.invoice_items || []);
  const phone = (cust.phone||'').replace(/[^0-9]/g,'');
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(txt)}`
    : `https://wa.me/?text=${encodeURIComponent(txt)}`;
  window.open(url, '_blank');
}

function shareInvoiceEmail() {
  if (!currentInvoice) return;
  const { tx, cust } = currentInvoice;
  const txt   = buildInvoiceText(tx, cust, tx.invoice_items || []);
  const subj  = encodeURIComponent('فاتورة — ' + (cust.name||'') );
  const body  = encodeURIComponent(txt);
  window.open(`mailto:?subject=${subj}&body=${body}`,'_blank');
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

function updateSyncBar(state, pending=0) {
  const bar = document.getElementById('sync-bar');
  const txt = document.getElementById('sync-txt');
  bar.className = 'sync-bar';
  const lastSync = getLastSyncText();
  if (state === 'online') {
    bar.classList.add('sync-online');
    txt.innerHTML = '🟢 متصل' + lastSync;
  } else if (state === 'offline') {
    bar.classList.add('sync-offline');
    const pndTxt = pending > 0 ? ` — ${pending} تغيير معلق` : '';
    txt.innerHTML = '🔴 غير متصل' + pndTxt + lastSync;
  } else if (state === 'syncing') {
    bar.classList.add('sync-pending');
    txt.innerHTML = '🔄 جاري المزامنة...';
  } else if (state === 'pending') {
    bar.classList.add('sync-pending');
    txt.innerHTML = `🟡 ${pending} تغيير في انتظار النت` + lastSync;
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
// إضافة عميل
// ================================================================
async function submitNewCustomer() {
  if (!checkCanAddCustomer()) return; // فحص حد الخطة
  const name  = document.getElementById('nc-name').value.trim();
  const phone = document.getElementById('nc-phone').value.trim();
  const err   = document.getElementById('addcust-err');

  if (!name)  { showErr(err, 'أدخل الاسم'); return; }
  if (!phone) { showErr(err, 'رقم الهاتف مطلوب'); return; }

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
// إضافة دين
// ================================================================
async function submitDebt() {
  const invSection = document.getElementById('inv-section');
  const hasInvoice = invSection.classList.contains('open') && invRows.length > 0;
  const invoiceItems = hasInvoice ? invRows.map(r=>({
    desc: r.desc, qty: r.qty, price: r.price
  })) : null;

  // إذا يوجد فاتورة مفصلة احسب المجموع منها
  if (hasInvoice) {
    const invTotal = invRows.reduce((s,r) => s + r.qty * r.price, 0);
    if (invTotal > 0) document.getElementById('add-amount').value = invTotal.toFixed(2);
  }

  const custId = document.getElementById('add-cust').value;
  const phone  = document.getElementById('add-phone').value.trim();
  const amount = parseFloat(document.getElementById('add-amount').value);
  const desc   = document.getElementById('add-desc').value.trim();
  const err    = document.getElementById('add-err');

  if (!custId)       { showErr(err, 'اختر عميلاً'); return; }
  if (!phone)        { showErr(err, 'رقم الهاتف مطلوب'); return; }
  if (!amount || amount <= 0) { showErr(err, 'أدخل مبلغاً صحيحاً'); return; }

  // تحديث هاتف العميل إن تغير
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
  // تصفير الفاتورة
  invRows = [];
  const invSec = document.getElementById('inv-section');
  const invBtn = document.getElementById('inv-toggle-btn');
  invSec.classList.remove('open');
  invBtn.innerHTML = '🧾 إضافة فاتورة مفصلة (اختياري)';
  invBtn.style.borderColor = 'rgba(59,130,246,.4)';
  invBtn.style.color = 'var(--pri)';

  alert('✅ تم حفظ الدين محلياً');
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
          <div class="sub">${pending.length} دين غير مسدَّد</div>
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
            <div class="val" style="color:var(--yel)">${debtorCount}</div>
            <div class="lbl">${partialCount > 0 ? `مدين (${partialCount} جزئي)` : 'عميل مدين'}</div>
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
      '<div class="empty"><div class="em-icon">📒</div><p>لا توجد ديون معلقة</p></div>';
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
    return `<div class="list-item" onclick="openStmt('${t.customer_id}')">
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
// رسم قائمة العملاء
// ================================================================
async function renderCustomers(filter='') {
  custSearchQ = filter;
  const mid   = SESSION.merchant_id;
  let custs   = await db.getAllByIndex('customers','merchant_id',mid);
  const allTx = await db.getAll('transactions').then(all=>all.filter(t=>t.merchant_id===mid));

  if (filter) custs = custs.filter(c =>
    c.name.includes(filter) || (c.phone||'').includes(filter));

  // حساب بيانات كل عميل للفرز
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
    document.getElementById('cust-list').innerHTML =
      '<div class="empty"><div class="em-icon">👥</div><p>لا يوجد عملاء — اضغط + لإضافة عميل</p></div>';
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
          : '<span class="li-status s-paid">سوي ✓</span>'}
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

async function filterCustomers(q) { await renderCustomers(q); }

// ================================================================
// كشف حساب عميل
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

  // ── تحليل كل عميل جديد ──
  newDebts.forEach(t => {
    const c = custMap[t.customer_id] || {};
    const name = c.name || 'العميل';
    const amt  = Number(t.amount||0);

    // كل سجلات هذا العميل
    const hx = allTx.filter(x => x.customer_id === t.customer_id && !x.is_partial_payment);
    const isNew = hx.length <= 1;
    const totalOwed = hx.filter(x=>x.status==='غير مدفوع')
      .reduce((s,x)=>s+Number(x.amount||0),0);

    if (isNew && amt > 100) {
      advices.push({
        type:'danger',
        icon:'⚠️',
        shake:true,
        text:`<b>${name}</b> عميل جديد ودَينه <b>${amt.toFixed(2)} ${CUR}</b> — لا يوجد تاريخ دفع سابق، تأكد من وجود ضمان أو كفيل.`
      });
    } else if (isNew) {
      advices.push({
        type:'warning',
        icon:'👋',
        text:`<b>${name}</b> عميل جديد — راقبه جيداً في الدفعة الأولى لأنها تكشف طبيعته.`
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

  // ── تحليل العملاء الذين دفعوا ──
  const payerIds = [...new Set(dayPayments.map(t=>t.customer_id))];
  payerIds.forEach(id => {
    const c = custMap[id] || {};
    const name = c.name||'العميل';
    const paid = dayPayments.filter(p=>p.customer_id===id)
      .reduce((s,p)=>s+Number(p.amount||0),0);
    const remaining = allTx.filter(t=>t.customer_id===id&&t.status==='غير مدفوع'&&!t.is_partial_payment)
      .reduce((s,t)=>{
        const pp=allTx.filter(p=>p.partial_payment_parent_id===t.id)
          .reduce((ss,p)=>ss+Number(p.amount||0),0);
        return s+Math.max(0,Number(t.amount||0)-pp);
      },0);
    if (remaining <= 0) {
      advices.push({type:'good',icon:'🎉',text:`<b>${name}</b> سدّد كامل دَينه — عميل ممتاز يستحق الثقة والاستمرار معه.`});
    } else {
      advices.push({type:'info',icon:'👍',text:`<b>${name}</b> دفع ${paid.toFixed(2)} ${CUR} اليوم — تبقى عليه ${remaining.toFixed(2)} ${CUR}.`});
    }
  });

  // ── نصيحة عامة عن اليوم ──
  if (newDebts.length===0 && dayPayments.length===0 && isToday) {
    advices.push({type:'info',icon:'💡',text:`لم تُسجّل أي معاملات اليوم — يوم هادئ في الأعمال طبيعي، لكن لا تنسَ متابعة الديون القديمة.`});
  } else if (collectedAmt > newDebtAmt && newDebtAmt > 0) {
    advices.push({type:'good',icon:'🌟',text:`ممتاز — حصّلت أكثر مما أعطيت دَيناً اليوم. هكذا تُبنى الأعمال الناجحة.`});
  } else if (newDebtAmt > 0 && collectedAmt === 0 && isToday) {
    advices.push({type:'warning',icon:'📌',text:`لم تحصّل شيئاً اليوم — حاول الاتصال بعميل واحد على الأقل لتذكيره بدَينه.`});
  }

  // ── تحذير من ديون قديمة ──
  const overdueAll = allTx.filter(t=>{
    if (t.is_partial_payment||t.status==='مدفوع') return false;
    const created = new Date(t.created_at||Date.now());
    const daysDiff = (Date.now()-created.getTime())/86400000;
    return daysDiff > 30;
  });
  if (overdueAll.length > 0 && isToday) {
    const custNames = [...new Set(overdueAll.map(t=>custMap[t.customer_id]?.name||'عميل'))].slice(0,3);
    advices.push({
      type:'danger',
      icon:'⏰',
      shake:true,
      text:`لديك <b>${overdueAll.length} دَين</b> متجاوز 30 يوماً — أبرزها: ${custNames.join('، ')}. الدين الذي يتجاوز شهراً يصعب تحصيله كثيراً.`
    });
  }

  return advices;
}

async function loadReport() {
  const mid = SESSION.merchant_id;
  const day = repDate;
  const isToday = day === new Date().toISOString().slice(0,10);
  const isYest  = day === new Date(Date.now()-86400000).toISOString().slice(0,10);

  const dayLabel = isToday ? 'اليوم'
    : isYest ? 'أمس'
    : new Date(day+'T12:00:00').toLocaleDateString('ar-EG',
        {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  document.getElementById('rep-date').textContent = dayLabel;

  const allTx  = await db.getAll('transactions').then(all=>all.filter(t=>t.merchant_id===mid));
  const custs  = await db.getAllByIndex('customers','merchant_id',mid);
  const custMap = Object.fromEntries(custs.map(c=>[c.id,c]));

  const newDebts   = allTx.filter(t=>t.created_at?.slice(0,10)===day&&!t.is_partial_payment);
  const dayPayments= allTx.filter(t=>t.is_partial_payment&&t.status==='مدفوع'&&t.created_at?.slice(0,10)===day);
  const newDebtAmt = newDebts.reduce((s,t)=>s+Number(t.amount||0),0);
  const collectedAmt=dayPayments.reduce((s,t)=>s+Number(t.amount||0),0);
  const payerIds   = [...new Set(dayPayments.map(t=>t.customer_id))];

  // ── بطاقتا الأرقام ──
  const stats = `<div class="stat-mini-row" style="padding:0 16px;margin-bottom:12px">
    <div class="stat-mini yellow" style="flex-direction:column;align-items:flex-start;gap:4px">
      <div style="font-size:13px;color:var(--txt2);font-weight:700">ديون جديدة</div>
      <div style="font-size:1.6em;font-weight:900;color:${newDebtAmt>0?'var(--yel)':'var(--txt3)'}">
        ${newDebtAmt.toFixed(2)} ${CUR}</div>
      <div style="font-size:12px;color:var(--txt3)">${newDebts.length} دين</div>
    </div>
    <div class="stat-mini green" style="flex-direction:column;align-items:flex-start;gap:4px">
      <div style="font-size:13px;color:var(--txt2);font-weight:700">محصّل</div>
      <div style="font-size:1.6em;font-weight:900;color:var(--grn)">
        ${collectedAmt.toFixed(2)} ${CUR}</div>
      <div style="font-size:12px;color:var(--txt3)">${dayPayments.length} دفعة</div>
    </div>
  </div>`;

  // ── بناء ملخص اليوم بالكلام العادي ──
  let summaryLines = [];
  if (newDebts.length > 0) {
    const names = [...new Set(newDebts.map(t=>custMap[t.customer_id]?.name||'عميل'))];
    if (names.length===1) summaryLines.push(`سجّلت ${newDebts.length===1?'دَيناً واحداً':newDebts.length+' ديون'} على <b>${names[0]}</b> بإجمالي <b>${newDebtAmt.toFixed(2)} ${CUR}</b>.`);
    else summaryLines.push(`سجّلت <b>${newDebts.length} ديون</b> على ${names.length} عملاء بإجمالي <b>${newDebtAmt.toFixed(2)} ${CUR}</b>.`);
  }
  if (dayPayments.length > 0) {
    const pNames = payerIds.map(id=>custMap[id]?.name||'عميل');

    // حساب كم من التحصيل من ديون قديمة
    const oldPayments = dayPayments.filter(t => {
      const parent = allTx.find(x=>x.id===t.partial_payment_parent_id);
      if (!parent?.created_at) return false;
      const today0 = new Date(); today0.setHours(0,0,0,0);
      return new Date(parent.created_at) < today0;
    });
    const oldAmt = oldPayments.reduce((s,t)=>s+Number(t.amount||0),0);

    if (pNames.length===1) summaryLines.push(`وحصّلت <b>${collectedAmt.toFixed(2)} ${CUR}</b> من <b>${pNames[0]}</b>${oldAmt>0?' (منها <b>'+oldAmt.toFixed(2)+' '+CUR+'</b> من ديون سابقة)':''}.`);
    else summaryLines.push(`وحصّلت <b>${collectedAmt.toFixed(2)} ${CUR}</b> من ${pNames.length} عملاء${oldAmt>0?' (منها <b>'+oldAmt.toFixed(2)+' '+CUR+'</b> من ديون سابقة)':''}.`);
  }
  if (summaryLines.length===0) summaryLines.push('لا توجد معاملات في هذا اليوم.');

  // ── توليد النصائح الذكية ──
  const advices = genAdvice({newDebts,dayPayments,custMap,allTx,collectedAmt,newDebtAmt,isToday});

  const adviceHTML = advices.map((a,i) => `
    <div class="nb-advice ${a.type}" style="margin-bottom:10px;animation:fadeUp .4s ${.1+i*.12}s both">
      <span class="advice-icon ${a.shake?'shake':''}">${a.icon}</span> ${a.text}
    </div>`).join('');

  // ── ورقة الدفتر ──
  const dateStr = new Date(day+'T12:00:00').toLocaleDateString('ar-EG',
    {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const notebook = `
    <div class="notebook-wrap">
      <div class="notebook">
        <div class="notebook-date">${dateStr}</div>
        <div class="notebook-text">
          ${summaryLines.map(l=>`<p>${l}</p>`).join('')}
        </div>
        ${advices.length>0?`<hr class="notebook-divider">${adviceHTML}`:''}
      </div>
    </div>`;

  // ── قوائم التفاصيل ──
  const debtsList = newDebts.length ? `
    <div style="padding:4px 16px 8px;font-size:14px;font-weight:800;color:var(--txt2)">
      📋 الديون المضافة
    </div>
    ${newDebts.map(t=>{
      const c=custMap[t.customer_id]||{};
      const tm=t.created_at?new Date(t.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'';
      return `<div class="list-item" onclick="openStmt('${t.customer_id}')">
        <div class="li-avatar">${(c.name||'؟')[0]}</div>
        <div class="li-info">
          <div class="li-name">${c.name||'غير معروف'}</div>
          <div class="li-phone">${c.phone||''}</div>
          <div class="li-meta">${t.description||'دين'} — ${tm}</div>
        </div>
        <div class="li-right">
          <div class="li-amt" style="color:var(--red)">${Number(t.amount).toFixed(2)} ${CUR}</div>
          <span class="li-status s-unpaid">جديد</span>
        </div>
      </div>`;
    }).join('')}` : '';

  const paysList = dayPayments.length ? `
    <div style="padding:8px 16px;font-size:14px;font-weight:800;color:var(--txt2)">
      💰 المدفوعات المستلمة
    </div>
    ${dayPayments.map(t=>{
      const c=custMap[t.customer_id]||{};
      const tm=t.created_at?new Date(t.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'';

      // البحث عن الدين الأصلي وحساب عمره
      const parentTx = allTx.find(x=>x.id===t.partial_payment_parent_id);
      const parentDate = parentTx?.created_at ? new Date(parentTx.created_at) : null;
      const today0 = new Date(); today0.setHours(0,0,0,0);
      const daysOld = parentDate ? Math.floor((today0 - new Date(parentDate.toDateString())) / 86400000) : 0;

      let ageBadge = '';
      if (daysOld >= 60) {
        ageBadge = `<div style="margin-top:5px;display:flex;align-items:center;gap:5px">
          <span style="background:rgba(167,139,250,.2);color:#a78bfa;border-radius:6px;
            padding:3px 8px;font-size:12px;font-weight:800">
            🏆 تحصيل قديم منذ ${daysOld} يوم
          </span>
        </div>`;
      } else if (daysOld >= 30) {
        ageBadge = `<div style="margin-top:5px">
          <span style="background:rgba(251,191,36,.15);color:#fbbf24;border-radius:6px;
            padding:3px 8px;font-size:12px;font-weight:800">
            ⏰ دَين عمره ${daysOld} يوماً
          </span>
        </div>`;
      } else if (daysOld >= 7) {
        ageBadge = `<div style="margin-top:5px">
          <span style="background:rgba(99,102,241,.15);color:#818cf8;border-radius:6px;
            padding:3px 8px;font-size:12px;font-weight:800">
            📅 دَين من ${daysOld === 7 ? 'أسبوع' : daysOld + ' أيام'}
          </span>
        </div>`;
      } else if (daysOld > 0) {
        ageBadge = `<div style="margin-top:5px">
          <span style="background:rgba(148,163,184,.1);color:var(--txt3);border-radius:6px;
            padding:3px 8px;font-size:12px;font-weight:700">
            📌 دَين من ${daysOld === 1 ? 'أمس' : daysOld + ' أيام'}
          </span>
        </div>`;
      }
      // daysOld === 0 = دين اليوم نفسه → لا شيء

      return `<div class="list-item" onclick="openStmt('${t.customer_id}')">
        <div class="li-avatar" style="background:linear-gradient(135deg,#065f46,#10b981)">${(c.name||'؟')[0]}</div>
        <div class="li-info" style="min-width:0">
          <div class="li-name">${c.name||'غير معروف'}</div>
          <div class="li-phone">${c.phone||''}</div>
          <div class="li-meta">${t.description||'دفعة'} — ${tm}</div>
          ${ageBadge}
        </div>
        <div class="li-right">
          <div class="li-amt" style="color:var(--grn)">+${Number(t.amount).toFixed(2)} ${CUR}</div>
          <span class="li-status s-paid">✓ مُستلم</span>
        </div>
      </div>`;
    }).join('')}` : '';

  document.getElementById('rep-stats').innerHTML = stats;
  document.getElementById('rep-list').innerHTML  = notebook + debtsList + paysList;
}
function changeDay(d) {
  const dt = new Date(repDate+'T12:00:00');
  dt.setDate(dt.getDate() + d);
  const today = new Date();
  today.setHours(23,59,59,999);
  if (dt > today) return;
  repDate = dt.toISOString().slice(0,10);
  // تعطيل زر الأمام إذا وصلنا لليوم
  const nextDt = new Date(dt); nextDt.setDate(nextDt.getDate()+1);
  const nextBtn = document.getElementById('rep-next');
  if (nextBtn) nextBtn.style.opacity = nextDt > today ? '.3' : '1';
  // تلميح
  const hint = document.getElementById('rep-nav-hint');
  if (hint) {
    const days = Math.round((today - dt) / 86400000);
    hint.textContent = days === 0 ? '' : days === 1 ? 'أمس' : `منذ ${days} أيام`;
  }
  loadReport();
}

// ================================================================
// إعداد قائمة العملاء في فورم الدين
// ================================================================
async function populateCustomerSelect() {
  if (!SESSION) return;
  const custs = await db.customers.where('merchant_id').equals(SESSION.merchant_id).toArray();
  const sel   = document.getElementById('add-cust');
  sel.innerHTML = '<option value="">اختر عميلاً...</option>' +
    custs.map(c => `<option value="${c.id}" data-phone="${c.phone||''}">${c.name}</option>`).join('');

  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    const phone = opt?.dataset?.phone || '';
    document.getElementById('add-phone').value = phone;
    document.getElementById('phone-warn-row').style.display = phone ? 'none' : (sel.value ? 'block' : 'none');
  };
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
  if (tab === 'add')       await populateCustomerSelect();
  if (tab === 'reports')   await loadReport();
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
    <div style="font-size:13px;color:var(--txt2);margin-bottom:6px">👥 ${custs} عميل محفوظ</div>
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

init();
