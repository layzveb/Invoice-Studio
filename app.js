/* Invoice Studio — localStorage application */
(() => {
  'use strict';
  const DB_VERSION = 2;
  const STORAGE_KEY = 'invoiceStudio.database';
  const DRAFT_KEY = 'invoiceStudio.currentDraft';
  const CATEGORIES = ['Автоматика','Термостаты','Электрика','Расходные материалы','Запчасти для котлов','Теплоносители','Услуги'];
  const STATUS = {draft:'Черновик',sent:'Отправлен',prepaid:'Предоплата внесена',paid:'Оплачен',cancelled:'Отменён'};
  const $ = id => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0,10);
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const n = value => Math.round((Number(value) || 0) * 100) / 100;
  const money = value => new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n(value)) + ' ₽';
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const clone = x => JSON.parse(JSON.stringify(x));

  const seedCatalog = () => [
    {id:uid('cat'),name:'Контроллер MyHeat GO!+',sku:'',category:'Автоматика',supplier:'',unit:'шт.',cost:0,markup:0,price:22500,description:''},
    {id:uid('cat'),name:'Комнатный термостат MyHeat (чёрный)',sku:'',category:'Термостаты',supplier:'',unit:'шт.',cost:0,markup:0,price:9500,description:''},
    {id:uid('cat'),name:'Расходный материал',sku:'',category:'Расходные материалы',supplier:'',unit:'компл.',cost:0,markup:0,price:3000,description:''},
    {id:uid('cat'),name:'Выключатель трёхпозиционный 1P 16A Dekraft',sku:'',category:'Электрика',supplier:'',unit:'шт.',cost:0,markup:0,price:1000,description:''},
    {id:uid('cat'),name:'IEK UNION Mini, корпус пластиковый КМПн-2 IP20',sku:'',category:'Электрика',supplier:'',unit:'шт.',cost:0,markup:0,price:200,description:''},
    {id:uid('cat'),name:'Теплообменник ГВС вторичный, 16 пластин, 156 мм для котлов BAXI',sku:'',category:'Запчасти для котлов',supplier:'',unit:'шт.',cost:0,markup:0,price:4500,description:''},
    {id:uid('cat'),name:'Замена вторичного теплообменника',sku:'',category:'Услуги',supplier:'',unit:'усл.',cost:0,markup:0,price:3000,description:''},
    {id:uid('cat'),name:'Антифриз −35 °C (пропиленгликоль), 10 л',sku:'',category:'Теплоносители',supplier:'',unit:'шт.',cost:0,markup:0,price:2000,description:''}
  ];
  const defaults = () => ({version:DB_VERSION,catalog:seedCatalog(),invoices:[],settings:{businessName:'ИП Захаров Иван Дмитриевич',inn:'470321872619',initials:'Захаров И.Д.',logo:'',signature:'',seal:''}});
  let db;
  let current;
  let editingCatalogId = null;
  let toastTimer;

  function loadDb(){
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      const parsed=raw&&JSON.parse(raw);
      if(parsed && Array.isArray(parsed.catalog) && Array.isArray(parsed.invoices) && parsed.settings){
        const migrated={...parsed,version:DB_VERSION};
        migrated.invoices=migrated.invoices.map(normalizeInvoice);
        localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));
        return migrated;
      }
    } catch(e) { console.warn('Не удалось прочитать базу Invoice Studio',e); }
    const fresh=defaults(); localStorage.setItem(STORAGE_KEY,JSON.stringify(fresh)); return fresh;
  }
  function saveDb(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(db)); }
  function freshInvoice(){ return {id:null,number:'',date:today(),paymentUrl:'',comment:'',items:[],status:'draft',prepaymentApplied:false,prepaymentDate:'',fullPaymentApplied:false,fullPaymentDate:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; }
  function normalizeInvoice(x){
    const base=freshInvoice(); const v={...base,...x};
    v.items=Array.isArray(v.items)?v.items.map(i=>({id:i.id||uid('line'),name:String(i.name||''),sku:String(i.sku||''),category:String(i.category||''),unit:String(i.unit||'шт.'),qty:Math.max(0,Number(i.qty)||0),price:Math.max(0,Number(i.price)||0)})):[];
    v.prepaymentApplied=Boolean(x.prepaymentApplied || x.status==='prepaid' || (Number(x.prepaymentAmount)||0)>0);
    v.fullPaymentApplied=Boolean(x.fullPaymentApplied || x.status==='paid');
    if(v.fullPaymentApplied) v.status='paid'; else if(v.prepaymentApplied) v.status='prepaid'; else v.status=STATUS[x.status]?x.status:'draft';
    return v;
  }
  function loadDraft(){ try { const d=JSON.parse(localStorage.getItem(DRAFT_KEY)); return d?normalizeInvoice(d):freshInvoice(); } catch(e){return freshInvoice();} }
  function saveDraft(){ current.updatedAt=new Date().toISOString(); localStorage.setItem(DRAFT_KEY,JSON.stringify(current)); $('draftState').textContent='Черновик сохранён локально'; }
  function showToast(text){ const el=$('toast'); el.textContent=text; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),3200); }
  function invoiceTotal(inv=current){ return n(inv.items.reduce((sum,item)=>sum + n(item.qty)*n(item.price),0)); }
  function materialTotal(inv=current){ return n(inv.items.filter(item=>item.category!=='Услуги').reduce((sum,item)=>sum+n(item.qty)*n(item.price),0)); }
  function prepaymentAmount(inv=current){ return inv.prepaymentApplied ? materialTotal(inv) : 0; }
  function remainingAmount(inv=current){ return inv.fullPaymentApplied ? 0 : Math.max(0,n(invoiceTotal(inv)-prepaymentAmount(inv))); }
  function plural(n0,forms){ const x=Math.abs(n0)%100, y=x%10; return x>10&&x<20?forms[2]:y>1&&y<5?forms[1]:y===1?forms[0]:forms[2]; }
  function wordsNumber(num, forms){ const ones=['','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемь','девятнадцать']; ones[18]='восемнадцать'; const fem=['','одна','две','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать']; const tens=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто']; const hundreds=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот']; const groups=[['', '', ''],['тысяча','тысячи','тысяч'],['миллион','миллиона','миллионов'],['миллиард','миллиарда','миллиардов']]; if(!num)return 'ноль'; const parts=[]; let group=0; while(num>0){const tri=num%1000;if(tri){const arr=[]; if(Math.floor(tri/100))arr.push(hundreds[Math.floor(tri/100)]);const tail=tri%100;if(tail<20)arr.push((group===1?fem:ones)[tail]);else{arr.push(tens[Math.floor(tail/10)]);if(tail%10)arr.push((group===1?fem:ones)[tail%10]);}if(group)arr.push(groups[group][tri%100>10&&tri%100<20?2:tri%10===1?0:tri%10>1&&tri%10<5?1:2]);parts.unshift(arr.filter(Boolean).join(' '));}num=Math.floor(num/1000);group++;}return parts.join(' '); }
  function amountWords(amount){ const rub=Math.floor(Math.max(0,Number(amount)||0)); const kop=Math.round(((Number(amount)||0)-rub)*100); const rubForms=['рубль','рубля','рублей']; return `${wordsNumber(rub).replace(/^./,x=>x.toUpperCase())} ${rubForms[rub%100>10&&rub%100<20?2:rub%10===1?0:rub%10>1&&rub%10<5?1:2]} ${String(kop).padStart(2,'0')} копеек`; }
  window.InvoiceStudioAmountWords=amountWords;
  function suggestCategory(name){const s=name.toLowerCase();if(/myheat|zont|ectocontrol|контроллер/.test(s))return'Автоматика';if(/термостат/.test(s))return'Термостаты';if(/выключатель|автомат|корпус|iek|dekraft/.test(s))return'Электрика';if(/теплообменник|baxi/.test(s))return'Запчасти для котлов';if(/антифриз|пропиленгликоль/.test(s))return'Теплоносители';if(/замена|монтаж|настройка|пусконаладка/.test(s))return'Услуги';return'Расходные материалы';}
  function statusClass(status){return `status status-${status}`;}
  function fillCategorySelects(){['catalogCategory','catalogCategoryFilter'].forEach(id=>{const el=$(id), prior=el.value; el.innerHTML=(id==='catalogCategoryFilter'?'<option value="">Все категории</option>':'')+CATEGORIES.map(x=>`<option value="${x}">${x}</option>`).join('');el.value=prior;});}
  function setAssetPreview(id,data,letter){const el=$(id);if(data){el.innerHTML=`<img alt="Предпросмотр" src="${data}">`;el.classList.remove('monogram');}else{el.textContent=letter; if(id==='logoPreview')el.classList.add('monogram');}}
  function renderSettings(){ $('settingBusinessName').value=db.settings.businessName; $('settingInn').value=db.settings.inn; $('settingInitials').value=db.settings.initials; setAssetPreview('logoPreview',db.settings.logo,'IS');setAssetPreview('signaturePreview',db.settings.signature,'—');setAssetPreview('sealPreview',db.settings.seal,'—'); }
  function syncFields(){ $('invoiceNumber').value=current.number;$('invoiceDate').value=current.date;$('paymentUrl').value=current.paymentUrl;$('clientComment').value=current.comment;$('invoiceStatus').value=current.status;$('prepaymentCheck').checked=current.prepaymentApplied;$('fullPaymentCheck').checked=current.fullPaymentApplied;$('prepaymentDate').value=current.prepaymentDate;$('fullPaymentDate').value=current.fullPaymentDate;$('prepaymentCheck').disabled=current.fullPaymentApplied;$('prepaymentDate').disabled=!current.prepaymentApplied||current.fullPaymentApplied;$('fullPaymentDate').disabled=!current.fullPaymentApplied; }
  function renderInvoice(){
    syncFields();
    const tbody=$('invoiceItemsBody');tbody.innerHTML=current.items.map((item,index)=>`<tr data-id="${item.id}"><td><span class="item-name">${escapeHtml(item.name)}</span>${item.sku?`<span class="item-sku">арт. ${escapeHtml(item.sku)}</span>`:''}<span class="item-category">${escapeHtml(item.category||'Без категории')}</span></td><td>${escapeHtml(item.unit)}</td><td><input class="line-qty" data-index="${index}" type="number" min="0.001" step="0.001" value="${item.qty}"></td><td><input class="line-price" data-index="${index}" type="number" min="0" step="0.01" value="${item.price}"></td><td class="line-sum">${money(n(item.qty)*n(item.price))}</td><td><button class="remove-btn" data-index="${index}" title="Удалить позицию" aria-label="Удалить позицию">×</button></td></tr>`).join('');
    $('emptyInvoice').hidden=current.items.length>0;
    const total=invoiceTotal(); const matTotal=materialTotal(); const prepaid=prepaymentAmount(); const balance=remainingAmount();
    $('invoiceTotal').textContent=money(total);$('totalWords').textContent=amountWords(total);$('itemCountText').textContent=`${current.items.length} ${plural(current.items.length,['позиция','позиции','позиций'])}`;
    $('prepaymentCalculated').textContent=money(matTotal);$('paymentBalance').textContent=current.fullPaymentApplied?'—':money(balance);
    $('invoiceStatusBadge').className=statusClass(current.status);$('invoiceStatusBadge').textContent=STATUS[current.status];$('sideInvoiceId').textContent=current.id?`ID: ${current.id}`:'Новый черновик';$('invoiceFormTitle').textContent=current.id?`Счёт № ${current.number||'без номера'}`:'Параметры счёта';
    $('paymentSummary').textContent=current.fullPaymentApplied ? 'Счёт оплачен полностью.' : current.prepaymentApplied ? `Зачтена предоплата за материалы: ${money(prepaid)}. К оплате остались услуги.` : 'Предоплата ещё не отмечена.';
  }
  function updateCurrentFromControls(){
    current.number=$('invoiceNumber').value.trim();current.date=$('invoiceDate').value||today();current.paymentUrl=$('paymentUrl').value.trim();current.comment=$('clientComment').value.trim();
    const selected=$('invoiceStatus').value;
    if(selected==='draft'||selected==='sent'||selected==='cancelled'){current.status=selected; if(!current.prepaymentApplied&&!current.fullPaymentApplied) current.status=selected;}
  }
  function setPrepayment(enabled){current.prepaymentApplied=enabled;if(enabled){current.fullPaymentApplied=false;current.prepaymentDate=current.prepaymentDate||today();current.status='prepaid';}else{current.prepaymentDate='';current.status='draft';}renderInvoice();saveDraft();}
  function setFullPayment(enabled){current.fullPaymentApplied=enabled;if(enabled){current.prepaymentApplied=true;current.prepaymentDate=current.prepaymentDate||today();current.fullPaymentDate=current.fullPaymentDate||today();current.status='paid';}else{current.fullPaymentDate='';current.status=current.prepaymentApplied?'prepaid':'draft';}renderInvoice();saveDraft();}
  function renderCatalog(){const q=$('catalogListSearch').value.trim().toLowerCase(),cat=$('catalogCategoryFilter').value;const list=db.catalog.filter(i=>!cat||i.category===cat).filter(i=>!q||[i.name,i.sku,i.category,i.supplier,i.description].join(' ').toLowerCase().includes(q));$('catalogCount').textContent=`${list.length} ${plural(list.length,['позиция','позиции','позиций'])}`;$('catalogGrid').innerHTML=list.map(item=>`<article class="card catalog-item" data-id="${item.id}" tabindex="0"><div class="catalog-top"><span class="category-tag">${escapeHtml(item.category)}</span><span class="sku">${item.sku?`арт. ${escapeHtml(item.sku)}`:'без артикула'}</span></div><h3>${escapeHtml(item.name)}</h3><div class="catalog-details">${escapeHtml(item.unit||'шт.')} · ${item.supplier?escapeHtml(item.supplier):'поставщик не указан'}</div><div class="catalog-price">${money(item.price)}</div></article>`).join('')||'<div class="empty-state card">Ничего не найдено. Создайте новую позицию.</div>';}
  function renderSearch(){const q=$('catalogSearch').value.trim().toLowerCase();const box=$('catalogResults');if(!q){box.innerHTML='';box.classList.remove('show');return;}const list=db.catalog.filter(i=>[i.name,i.sku,i.category].join(' ').toLowerCase().includes(q)).slice(0,8);box.innerHTML=list.map(i=>`<button class="result-item" data-id="${i.id}"><span><strong>${escapeHtml(i.name)}</strong><small>${escapeHtml(i.category)}${i.sku?` · арт. ${escapeHtml(i.sku)}`:''}</small></span><span class="result-price">${money(i.price)}</span></button>`).join('')||'<div class="empty-state">Ничего не найдено в каталоге.</div>';box.classList.add('show');}
  function renderHistory(){const q=$('historySearch').value.trim().toLowerCase(),filter=$('historyStatusFilter').value;const list=[...db.invoices].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).filter(i=>(!filter||i.status===filter)&&(!q||`${i.number} ${i.items.map(x=>x.name).join(' ')}`.toLowerCase().includes(q)));$('historyBody').innerHTML=list.map(i=>{const total=invoiceTotal(i),balance=remainingAmount(i);return `<tr class="history-row history-row-${i.status}"><td class="history-number">№ ${escapeHtml(i.number||'без номера')}<small>${escapeHtml(i.id)}</small></td><td>${escapeHtml(i.date||'—')}</td><td>${i.items.length}</td><td>${money(total)}</td><td><span class="${statusClass(i.status)}">${STATUS[i.status]}</span></td><td>${i.fullPaymentApplied?'—':money(balance)}</td><td><div class="history-actions"><button class="small-btn" data-open="${i.id}">Открыть</button><button class="small-btn" data-pdf="${i.id}">PDF</button></div></td></tr>`;}).join('');$('emptyHistory').hidden=list.length>0;}
  function renderAll(){renderInvoice();renderCatalog();renderHistory();renderSettings();}
  function addCatalogItem(id){const source=db.catalog.find(i=>i.id===id);if(!source)return;current.items.push({id:uid('line'),name:source.name,sku:source.sku||'',category:source.category||'',unit:source.unit||'шт.',qty:1,price:n(source.price)});$('catalogSearch').value='';renderSearch();renderInvoice();saveDraft();showToast('Позиция добавлена в счёт.');}
  function openCatalogDialog(id=null){editingCatalogId=id;const item=id?db.catalog.find(x=>x.id===id):null;$('catalogDialogTitle').textContent=item?'Редактировать позицию':'Новая позиция';$('catalogItemId').value=item?.id||'';$('catalogName').value=item?.name||'';$('catalogSku').value=item?.sku||'';$('catalogCategory').value=item?.category||'Расходные материалы';$('catalogSupplier').value=item?.supplier||'';$('catalogUnit').value=item?.unit||'шт.';$('catalogCost').value=item?.cost||'';$('catalogMarkup').value=item?.markup||'';$('catalogPrice').value=item?.price??'';$('catalogDescription').value=item?.description||'';$('deleteCatalogBtn').hidden=!item;$('catalogDialog').showModal();}
  function saveCatalogForm(){const name=$('catalogName').value.trim();const category=$('catalogCategory').value;const price=n($('catalogPrice').value);if(!name||!category||price<0){showToast('Заполните наименование, категорию и цену.');return;}const record={id:editingCatalogId||uid('cat'),name,sku:$('catalogSku').value.trim(),category,supplier:$('catalogSupplier').value.trim(),unit:$('catalogUnit').value.trim()||'шт.',cost:Math.max(0,n($('catalogCost').value)),markup:n($('catalogMarkup').value),price,description:$('catalogDescription').value.trim()};if(editingCatalogId){db.catalog=db.catalog.map(x=>x.id===editingCatalogId?record:x);}else db.catalog.push(record);saveDb();renderCatalog();renderSearch();$('catalogDialog').close();showToast('Каталог сохранён.');}
  function saveInvoice(){updateCurrentFromControls();if(!current.number){showToast('Укажите номер счёта перед сохранением.');$('invoiceNumber').focus();return;}if(!current.items.length){showToast('Добавьте хотя бы одну позицию.');return;}if(!current.id)current.id=uid('inv');current.updatedAt=new Date().toISOString();const index=db.invoices.findIndex(i=>i.id===current.id);if(index>=0)db.invoices[index]=clone(current);else db.invoices.push(clone(current));saveDb();saveDraft();renderAll();showToast(`Счёт № ${current.number} сохранён.`);}
  function openInvoice(id){const found=db.invoices.find(i=>i.id===id);if(!found)return;current=normalizeInvoice(clone(found));saveDraft();activateView('invoice');renderInvoice();showToast('Счёт открыт для редактирования.');}
  function activateView(view){document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('pageTitle').textContent={invoice:'Новый счёт',catalog:'Каталог',history:'История счетов',settings:'Настройки'}[view];document.querySelector('.sidebar').classList.remove('open');if(view==='catalog')renderCatalog();if(view==='history')renderHistory();if(view==='settings')renderSettings();}
  function validateImport(value){if(!value||typeof value!=='object'||!Array.isArray(value.catalog)||!Array.isArray(value.invoices)||!value.settings||typeof value.settings!=='object')throw new Error('Структура файла не соответствует Invoice Studio.');if(!value.catalog.every(x=>x&&typeof x.name==='string'&&typeof x.category==='string')||!value.invoices.every(x=>x&&Array.isArray(x.items)))throw new Error('В JSON отсутствуют обязательные поля каталога или счетов.');return {version:DB_VERSION,catalog:value.catalog.map(x=>({...x,id:x.id||uid('cat'),price:Math.max(0,n(x.price)),cost:Math.max(0,n(x.cost)),markup:n(x.markup),unit:x.unit||'шт.'})),invoices:value.invoices.map(normalizeInvoice),settings:{businessName:String(value.settings.businessName||'ИП Захаров Иван Дмитриевич'),inn:String(value.settings.inn||''),initials:String(value.settings.initials||''),logo:String(value.settings.logo||''),signature:String(value.settings.signature||''),seal:String(value.settings.seal||'')}};}
  function downloadJson(){const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`InvoiceStudio_export_${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);showToast('Экспорт данных скачан.');}
  function readImage(file, key) {
  if (!file) return;

  const allowed = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml'
  ]);

  if (!allowed.has(file.type)) {
    showToast('Выберите PNG, JPG, WebP или SVG.');
    return;
  }

  const reader = new FileReader();

  reader.onerror = () => {
    showToast('Не удалось прочитать файл изображения.');
  };

  reader.onload = async () => {
    const oldValue = db.settings[key] || '';

    try {
      let dataUrl = String(reader.result || '');

      if (!dataUrl.startsWith('data:image/')) {
        throw new Error('Некорректный файл изображения.');
      }

      if (file.type !== 'image/svg+xml') {
        dataUrl = await compactImage(dataUrl, file.type, key);
      }

      db.settings[key] = dataUrl;

      // Если квота превышена, setItem бросит исключение.
      // Его поймает catch ниже.
      saveDb();

      renderSettings();

      if (file.type === 'image/jpeg') {
        showToast('Изображение сохранено. JPG не поддерживает прозрачность.');
      } else {
        showToast('Изображение сохранено в настройках.');
      }
    } catch (error) {
      db.settings[key] = oldValue;
      renderSettings();
      console.error('Не удалось сохранить изображение:', error);

      if (error.name === 'QuotaExceededError') {
        showToast(
          'В localStorage не хватает места. Экспортируйте данные и загрузите изображение меньшего размера.'
        );
      } else {
        showToast(`Ошибка изображения: ${error.message}`);
      }
    }
  };

  reader.readAsDataURL(file);
}

function compactImage(dataUrl, mimeType, key) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onerror = () => {
      reject(new Error('Не удалось открыть изображение.'));
    };

    image.onload = () => {
      const maxSide = key === 'logo' ? 700 : 1100;
      const scale = Math.min(
        1,
        maxSide / Math.max(image.naturalWidth, image.naturalHeight)
      );

      const canvas = document.createElement('canvas');

      canvas.width = Math.max(
        1,
        Math.round(image.naturalWidth * scale)
      );

      canvas.height = Math.max(
        1,
        Math.round(image.naturalHeight * scale)
      );

      const context = canvas.getContext('2d');

      if (!context) {
        reject(new Error('Браузер не смог создать Canvas.'));
        return;
      }

      context.drawImage(
        image,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // PNG сохраняет прозрачность. WebP тоже поддерживает её.
      // JPG оставляем JPG и не выдаём его за прозрачный.
      const outputType = mimeType === 'image/jpeg'
        ? 'image/jpeg'
        : 'image/webp';

      resolve(canvas.toDataURL(outputType, 0.82));
    };

    image.src = dataUrl;
  });}
  function setupEvents(){
    document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>activateView(btn.dataset.view)));$('menuToggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
    ['invoiceNumber','invoiceDate','paymentUrl','clientComment'].forEach(id=>$(id).addEventListener('input',()=>{updateCurrentFromControls();renderInvoice();saveDraft();}));
    $('invoiceStatus').addEventListener('change',()=>{if(current.prepaymentApplied||current.fullPaymentApplied){renderInvoice();showToast('Статус оплаты изменяется галочками ниже.');return;}updateCurrentFromControls();renderInvoice();saveDraft();});
    $('prepaymentCheck').addEventListener('change',e=>setPrepayment(e.target.checked));$('fullPaymentCheck').addEventListener('change',e=>setFullPayment(e.target.checked));$('prepaymentDate').addEventListener('input',()=>{current.prepaymentDate=$('prepaymentDate').value;saveDraft();});$('fullPaymentDate').addEventListener('input',()=>{current.fullPaymentDate=$('fullPaymentDate').value;saveDraft();});
    $('catalogSearch').addEventListener('input',renderSearch);$('catalogResults').addEventListener('click',e=>{const btn=e.target.closest('[data-id]');if(btn)addCatalogItem(btn.dataset.id);});document.addEventListener('click',e=>{if(!e.target.closest('.catalog-search'))$('catalogResults').classList.remove('show');});
    $('invoiceItemsBody').addEventListener('input',e=>{const index=Number(e.target.dataset.index);if(e.target.classList.contains('line-qty'))current.items[index].qty=Math.max(0,Number(e.target.value)||0);if(e.target.classList.contains('line-price'))current.items[index].price=Math.max(0,n(e.target.value));renderInvoice();saveDraft();});$('invoiceItemsBody').addEventListener('click',e=>{const b=e.target.closest('.remove-btn');if(b){current.items.splice(Number(b.dataset.index),1);renderInvoice();saveDraft();}});
    $('addManualBtn').addEventListener('click',()=>{ $('manualForm').reset();$('manualUnit').value='усл.';$('manualQty').value='1';$('manualDialog').showModal();});$('saveManualBtn').addEventListener('click',e=>{e.preventDefault();const name=$('manualName').value.trim(),price=n($('manualPrice').value),qty=Number($('manualQty').value);if(!name||price<0||!qty){showToast('Заполните наименование, количество и цену.');return;}current.items.push({id:uid('line'),name,sku:$('manualSku').value.trim(),category:'Услуги',unit:$('manualUnit').value.trim()||'усл.',qty:Math.max(.001,qty),price});$('manualDialog').close();renderInvoice();saveDraft();});
    $('saveInvoiceBtn').addEventListener('click',saveInvoice);$('newInvoiceBtn').addEventListener('click',()=>{if(confirm('Очистить текущий черновик? Несохранённые изменения будут потеряны.')){current=freshInvoice();localStorage.removeItem(DRAFT_KEY);renderInvoice();showToast('Создан новый черновик.');}});
    $('pdfBtn').addEventListener('click',async()=>{updateCurrentFromControls();if(!current.items.length){showToast('Добавьте хотя бы одну позицию для PDF.');return;}if(!window.InvoicePdf){showToast('Не найден pdf-generator.js. Проверьте файлы проекта.');return;}try{$('pdfBtn').disabled=true;$('pdfBtn').textContent='Формирование PDF…';await window.InvoicePdf.generate(current,db.settings);showToast('PDF скачивается.');}catch(err){console.error(err);showToast(`Не удалось сформировать PDF: ${err.message}`);}finally{$('pdfBtn').disabled=false;$('pdfBtn').textContent='⇩ Скачать PDF';}});
    $('newCatalogItemBtn').addEventListener('click',()=>openCatalogDialog());$('catalogGrid').addEventListener('click',e=>{const item=e.target.closest('.catalog-item');if(item)openCatalogDialog(item.dataset.id);});$('catalogGrid').addEventListener('keydown',e=>{if(e.key==='Enter'){const item=e.target.closest('.catalog-item');if(item)openCatalogDialog(item.dataset.id);}});$('catalogListSearch').addEventListener('input',renderCatalog);$('catalogCategoryFilter').addEventListener('change',renderCatalog);$('catalogName').addEventListener('blur',()=>{if(!editingCatalogId&&!$('catalogCategory').value)$('catalogCategory').value=suggestCategory($('catalogName').value);});$('catalogCost').addEventListener('input',()=>{$('catalogPrice').value=n(Number($('catalogCost').value)*(1+Number($('catalogMarkup').value||0)/100));});$('catalogMarkup').addEventListener('input',()=>{$('catalogPrice').value=n(Number($('catalogCost').value||0)*(1+Number($('catalogMarkup').value)/100));});$('saveCatalogBtn').addEventListener('click',e=>{e.preventDefault();saveCatalogForm();});$('deleteCatalogBtn').addEventListener('click',()=>{if(editingCatalogId&&confirm('Удалить эту позицию из каталога?')){db.catalog=db.catalog.filter(x=>x.id!==editingCatalogId);saveDb();renderCatalog();$('catalogDialog').close();showToast('Позиция удалена.');}});
    $('historySearch').addEventListener('input',renderHistory);$('historyStatusFilter').addEventListener('change',renderHistory);$('historyBody').addEventListener('click',async e=>{const open=e.target.closest('[data-open]'),pdf=e.target.closest('[data-pdf]');if(open)openInvoice(open.dataset.open);if(pdf){const inv=db.invoices.find(x=>x.id===pdf.dataset.pdf);if(inv)try{await window.InvoicePdf.generate(inv,db.settings);}catch(err){showToast(`Ошибка PDF: ${err.message}`);}}});
    ['settingBusinessName','settingInn','settingInitials'].forEach(id=>$(id).addEventListener('input',()=>{db.settings.businessName=$('settingBusinessName').value.trim();db.settings.inn=$('settingInn').value.trim();db.settings.initials=$('settingInitials').value.trim();saveDb();}));$('logoInput').addEventListener('change',e=>readImage(e.target.files[0],'logo'));$('signatureInput').addEventListener('change',e=>readImage(e.target.files[0],'signature'));$('sealInput').addEventListener('change',e=>readImage(e.target.files[0],'seal'));document.querySelectorAll('[data-clear-asset]').forEach(b=>b.addEventListener('click',()=>{db.settings[b.dataset.clearAsset]='';saveDb();renderSettings();}));
    $('exportBtn').addEventListener('click',downloadJson);$('importInput').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{const parsed=validateImport(JSON.parse(r.result));if(!confirm('Импорт заменит все текущие локальные данные. Продолжить?'))return;db=parsed;saveDb();current=freshInvoice();saveDraft();renderAll();showToast('Данные успешно импортированы.');}catch(err){showToast(`Импорт отклонён: ${err.message}`);}};r.readAsText(file,'utf-8');e.target.value='';});$('resetDemoBtn').addEventListener('click',()=>{if(confirm('Сбросить все локальные данные и восстановить демонстрационный каталог? Это нельзя отменить.')){db=defaults();current=freshInvoice();saveDb();saveDraft();fillCategorySelects();renderAll();showToast('Демонстрационные данные восстановлены.');}});
  }
  document.addEventListener('DOMContentLoaded',()=>{db=loadDb();current=loadDraft();fillCategorySelects();setupEvents();renderAll();});
})();
