/* Invoice Studio — PDF, исправленная таблица и обработка изображений.
   Зависимости: локальные jsPDF UMD, jspdf-autotable, QRCode.js,
   assets/fonts/DejaVuSans.base64.js и DejaVuSans-Bold.base64.js. */
window.InvoicePdf = (() => {
  'use strict';
  const W=210,H=297,L=18,R=192,CW=R-L;
  const COLOR={ink:[23,48,59],muted:[100,123,133],navy:[20,78,106],blue:[20,127,168],cyan:[54,198,204],line:[207,227,232],white:[255,255,255],rowOdd:[255,255,255],rowEven:[233,244,248]};
  let fontPromise;
  const number=x=>Number(x)||0;
  const pennies=x=>Math.round((number(x)+Number.EPSILON)*100);
  const invoiceTotal=inv=>(inv.items||[]).reduce((sum,item)=>sum+pennies(number(item.qty)*number(item.price)),0)/100;
  const money=x=>{const v=pennies(x)/100;return new Intl.NumberFormat('ru-RU',{minimumFractionDigits:Number.isInteger(v)?0:2,maximumFractionDigits:2}).format(v)+' ₽';};
  const safe=x=>String(x||'без_номера').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\s+/g,'_');
  function fill(pdf,c){pdf.setFillColor(...c);}function stroke(pdf,c,w=.2){pdf.setDrawColor(...c);pdf.setLineWidth(w);}
  function line(pdf,x1,y1,x2,y2,c,w=.2){stroke(pdf,c,w);pdf.line(x1,y1,x2,y2);}
  function text(pdf,s,x,y,size,weight='normal',c=COLOR.ink,opt={}){pdf.setFont('DejaVu',weight);pdf.setFontSize(size);pdf.setTextColor(...c);pdf.text(String(s),x,y,opt);}
  function textWidth(pdf,s,size,weight='normal'){pdf.setFont('DejaVu',weight);pdf.setFontSize(size);return pdf.getTextWidth(String(s));}
  function wrap(pdf,s,width,size,weight='normal'){pdf.setFont('DejaVu',weight);pdf.setFontSize(size);return pdf.splitTextToSize(String(s),width);}
  function box(pdf,x,y,w,h,r,bg,border=COLOR.line){fill(pdf,bg);stroke(pdf,border,.25);pdf.roundedRect(x,y,w,h,r,r,'FD');}
  function triangle(pdf,points,color){fill(pdf,color);pdf.triangle(...points,'F');}
  function script(path){return new Promise((ok,no)=>{const e=document.createElement('script');e.src=path;e.onload=ok;e.onerror=()=>no(new Error('Нет локального файла '+path));document.head.appendChild(e);});}
  async function fonts(){if(!fontPromise)fontPromise=(async()=>{const f=window.InvoiceStudioFonts||(window.InvoiceStudioFonts={});if(!f.regular)await script('assets/fonts/DejaVuSans.base64.js');if(!f.bold)await script('assets/fonts/DejaVuSans-Bold.base64.js');if(!f.regular||!f.bold)throw Error('Файлы шрифтов не содержат InvoiceStudioFonts.regular / bold');return f;})().catch(e=>{fontPromise=null;throw e;});return fontPromise;}
  function registerFonts(pdf,f){pdf.addFileToVFS('DejaVuSans.ttf',f.regular);pdf.addFont('DejaVuSans.ttf','DejaVu','normal');pdf.addFileToVFS('DejaVuSans-Bold.ttf',f.bold);pdf.addFont('DejaVuSans-Bold.ttf','DejaVu','bold');}
  function dateRu(raw){const m=String(raw||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return raw||'—';const names=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];return +m[2]>0&&+m[2]<13?`${+m[3]} ${names[+m[2]-1]} ${m[1]} г.`:raw;}
  function amountWords(amount){if(typeof window.InvoiceStudioAmountWords==='function')return window.InvoiceStudioAmountWords(amount);const a=['','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];const f=[...a];f[1]='одна';f[2]='две';const t=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];const h=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];const forms=[['','',''],['тысяча','тысячи','тысяч'],['миллион','миллиона','миллионов'],['миллиард','миллиарда','миллиардов']];const ending=x=>x%100>10&&x%100<15?2:x%10===1?0:x%10>1&&x%10<5?1:2;let rub=Math.floor(Math.max(0,pennies(amount))/100),kop=pennies(amount)%100,n=rub,g=0,result=[];while(n&&g<forms.length){const v=n%1000;if(v){const parts=[h[Math.floor(v/100)]],tail=v%100;if(tail<20)parts.push((g===1?f:a)[tail]);else{parts.push(t[Math.floor(tail/10)]);parts.push((g===1?f:a)[tail%10]);}if(g)parts.push(forms[g][ending(v)]);result.unshift(parts.filter(Boolean).join(' '));}n=Math.floor(n/1000);g++;}let words=result.join(' ')||'ноль';return `${words[0].toUpperCase()+words.slice(1)} ${['рубль','рубля','рублей'][ending(rub)]} ${String(kop).padStart(2,'0')} копеек`;}
  async function loadImage(raw){if(!raw)return null;let data=raw;if(/^data:image\/svg\+xml/i.test(raw)){const svg=await new Promise((ok,no)=>{const image=new Image();image.onload=()=>ok(image);image.onerror=()=>no(Error('Некорректный SVG'));image.src=raw;});const canvas=document.createElement('canvas');canvas.width=Math.max(svg.naturalWidth||0,700);canvas.height=Math.max(svg.naturalHeight||0,700);canvas.getContext('2d').drawImage(svg,0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/png');}return new Promise((ok,no)=>{const image=new Image();image.onload=()=>ok({data,w:image.naturalWidth||image.width,h:image.naturalHeight||image.height,type:/^data:image\/png/i.test(data)?'PNG':/^data:image\/webp/i.test(data)?'WEBP':'JPEG'});image.onerror=()=>no(Error('Некорректное изображение'));image.src=data;});}
  function logoForPdf(image) {
    if (!image) return null;

    const canvas = document.createElement('canvas');
    const size = 600;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Не удалось подготовить логотип для PDF');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    return new Promise((resolve, reject) => {
      const source = new Image();

      source.onload = () => {
        const scale = Math.min(
          size / source.naturalWidth,
          size / source.naturalHeight
        );

        const width = source.naturalWidth * scale;
        const height = source.naturalHeight * scale;

        ctx.drawImage(
          source,
          (size - width) / 2,
          (size - height) / 2,
          width,
          height
        );

        const png = canvas.toDataURL('image/png');

        resolve({
          data: png,
          w: size,
          h: size,
          type: 'PNG'
        });
      };

      source.onerror = () => {
        reject(new Error('Не удалось преобразовать логотип для PDF'));
      };

      source.src = image.data;
    });
  }
  function drawImage(pdf,img,x,y,w,h,rotate=0){if(!img)return;const k=Math.min(w/img.w,h/img.h),dw=img.w*k,dh=img.h*k;pdf.addImage(img.data,img.type,x+(w-dw)/2,y+(h-dh)/2,dw,dh,undefined,'FAST',rotate);}
  function decor(pdf){for(let x=0;x<W;x+=9){line(pdf,x,0,x,37,[252,254,254],.1);line(pdf,x,265,x,H,[252,254,254],.1);}for(let y=0;y<38;y+=9)line(pdf,0,y,W,y,[252,254,254],.1);for(let y=265;y<H;y+=9)line(pdf,0,y,W,y,[252,254,254],.1);triangle(pdf,[146,0,210,0,210,41],[236,249,252]);triangle(pdf,[173,0,210,0,210,31],[248,253,254]);triangle(pdf,[135,0,154,0,146,22],[243,251,252]);triangle(pdf,[210,96,210,141,189,118],[249,253,254]);triangle(pdf,[0,162,16,185,0,208],[247,252,253]);triangle(pdf,[210,219,210,241,190,219],[247,252,253]);triangle(pdf,[0,259,54,297,0,297],[235,249,252]);triangle(pdf,[21,297,50,268,73,297],[248,252,253]);triangle(pdf,[165,297,210,262,210,297],[238,250,252]);[[161,36,205,14],[177,42,208,25],[0,274,40,259],[20,281,65,297],[166,258,208,282]].forEach(p=>line(pdf,...p,[219,242,247],.18));[[169,16],[201,33],[183,42],[204,99],[6,165],[204,203],[9,262],[55,291],[191,269]].forEach(([x,y])=>{fill(pdf,[252,255,255]);stroke(pdf,[124,195,212],.16);pdf.circle(x,y,.8,'FD');});}
  function gradient(pdf,x,y,w){for(let i=0;i<100;i++){const t=i/99,lerp=(a,b,p)=>Math.round(a+(b-a)*p),rgb=t<.55?[lerp(20,54,t/.55),lerp(127,198,t/.55),lerp(168,204,t/.55)]:[lerp(54,255,(t-.55)/.45),lerp(198,255,(t-.55)/.45),lerp(204,255,(t-.55)/.45)];line(pdf,x+w*i/100,y,x+w*(i+1)/100+.06,y,rgb,.8);}}
  function header(pdf,invoice,settings,logo){box(pdf,18,17.5,28,28,3.8,COLOR.white,[104,185,200]);if(logo)drawImage(pdf,logo,20,19.5,24,24);else text(pdf,'IS',32,33.5,13,'bold',COLOR.blue,{align:'center'});const heading=`Счёт на оплату № ${invoice.number||'—'}`;let size=18.5,parts=wrap(pdf,heading,67,size,'bold');while(parts.length>2&&size>14){size-=.5;parts=wrap(pdf,heading,67,size,'bold');}parts.slice(0,2).forEach((part,i)=>text(pdf,part,57,27.5+i*8.2,size,'bold'));text(pdf,`от ${dateRu(invoice.date)}`,57,parts.length>1?43.4:38.3,9.3,'normal',COLOR.muted);line(pdf,129,21.3,129,39.1,COLOR.cyan,.45);const company=wrap(pdf,settings.businessName||'ИП Захаров Иван Дмитриевич',59,8.5,'bold');company.slice(0,2).forEach((part,i)=>text(pdf,part,190,28.2+i*4.5,8.5,'bold',COLOR.ink,{align:'right'}));text(pdf,`ИНН ${settings.inn||'470321872619'}`,190,company.length>1?39.2:34.5,8.4,'normal',COLOR.muted,{align:'right'});gradient(pdf,L,55,CW);text(pdf,'Перечень оборудования, материалов и работ.',L,68,9.5,'normal',[72,99,110]);text(pdf,'Оплата производится по ссылке или QR-коду в нижней части документа.',L,73.2,9.5,'normal',[72,99,110]);}
  function continuePage(pdf,invoice){decor(pdf);text(pdf,`Счёт на оплату № ${invoice.number||'—'} — продолжение`,L,15.5,10,'bold');gradient(pdf,L,19,CW);}
  function table(pdf,invoice){
    const rows=invoice.items.map((item,index)=>[String(index+1),(item.name||'—')+(item.sku?`\nАрт.: ${item.sku}`:''),`${String(item.qty??1).replace('.',',')} ${item.unit||'шт.'}`,money(item.price),money(number(item.qty)*number(item.price))]);
    const pageBounds=new Map();
    pdf.autoTable({startY:80,head:[['№','Товары / услуги','Количество','Цена','Сумма']],body:rows,theme:'plain',showHead:'everyPage',rowPageBreak:'avoid',margin:{left:L,right:W-R,top:24,bottom:16},
      styles:{font:'DejaVu',fontStyle:'normal',fontSize:9.5,textColor:COLOR.ink,lineWidth:0,cellPadding:{top:3.1,bottom:3.1,left:2.1,right:2.1},valign:'middle',overflow:'linebreak',minCellHeight:11.3},
      headStyles:{font:'DejaVu',fontStyle:'bold',fontSize:8.3,textColor:COLOR.white,fillColor:COLOR.navy,minCellHeight:10},
      columnStyles:{0:{cellWidth:9,halign:'center',textColor:COLOR.muted},1:{cellWidth:79,fontStyle:'normal'},2:{cellWidth:28,halign:'center'},3:{cellWidth:29,halign:'center'},4:{cellWidth:29,halign:'center'}},
      didParseCell:hook=>{if(hook.section==='body'){hook.cell.styles.fontStyle='normal';hook.cell.styles.fillColor=hook.row.index%2===0?COLOR.rowOdd:COLOR.rowEven;}},
      willDrawCell:hook=>{
        if(hook.section==='head'){
          // Рисуем скруглённую шапку ДО текста. Вместо прямоугольного фона первой/последней ячейки.
          if(hook.column.index===0){const first=hook.cell,headX=first.x,headY=first.y,headH=first.height;fill(pdf,COLOR.navy);pdf.roundedRect(headX,headY,CW,headH,2.6,2.6,'F');pdf.rect(headX,headY+2.6,CW,headH-2.6,'F');}
          hook.cell.styles.fillColor=false;
        }
      },
      didDrawCell:hook=>{if(hook.section==='body'&&hook.column.index===0){const p=pdf.getCurrentPageInfo().pageNumber,bottom=hook.cell.y+hook.cell.height;const existing=pageBounds.get(p)||{top:hook.cell.y,bottom};existing.top=Math.min(existing.top,hook.cell.y);existing.bottom=Math.max(existing.bottom,bottom);pageBounds.set(p,existing);line(pdf,L,bottom,R,bottom,[213,231,235],.17);}},
      didDrawPage:hook=>{if(hook.pageNumber>1)continuePage(pdf,invoice);}
    });
    const last=pdf.getNumberOfPages(),finalY=pdf.lastAutoTable.finalY;
    // Обводка только по внешнему периметру всей таблицы; шапка уже скруглена под тем же радиусом.
    for(let p=1;p<=last;p++){const bounds=pageBounds.get(p);if(!bounds)continue;pdf.setPage(p);const top=p===1?80:24;stroke(pdf,COLOR.line,.25);pdf.roundedRect(L,top,CW,Math.max(10,bounds.bottom-top),2.6,2.6,'S');}
    pdf.setPage(last);return finalY;
  }
  function totalHeight(pdf,invoice){return Math.max(24,18.5+wrap(pdf,amountWords(invoiceTotal(invoice)),163,9.3).length*4.4);}
  function drawTotal(pdf,invoice,y){const amount=invoiceTotal(invoice),parts=wrap(pdf,amountWords(amount),163,9.3),h=totalHeight(pdf,invoice);box(pdf,L,y,CW,h,3,[239,251,253],[184,223,231]);const label='ИТОГО К ОПЛАТЕ:';text(pdf,label,23.5,y+9.4,10.4,'bold',[88,115,126]);const x=23.5+textWidth(pdf,label,10.4,'bold')+3;let fs=17;while(x+textWidth(pdf,money(amount),fs,'bold')>186&&fs>11)fs-=.5;text(pdf,money(amount),x,y+9.6,fs,'bold',COLOR.blue);line(pdf,23.5,y+14,186.5,y+14,[185,209,215],.24);parts.forEach((s,i)=>text(pdf,s,23.5,y+19+i*4.4,9.3));return y+h;}
  function commentHeight(pdf,s){return Math.max(18,12.5+wrap(pdf,s,163,9.1).length*4.4);}
  function drawComment(pdf,s,y){const parts=wrap(pdf,s,163,9.1),h=commentHeight(pdf,s);box(pdf,L,y,CW,h,2.5,[251,254,254],[217,232,235]);text(pdf,'Комментарий',23,y+7,11.3,'bold',COLOR.blue);parts.forEach((part,i)=>text(pdf,part,23,y+12+i*4.4,9.1,'normal',[75,99,108]));return y+h;}
  function qrImage(url){const div=document.createElement('div');new window.QRCode(div,{text:url,width:256,height:256,correctLevel:window.QRCode.CorrectLevel.M});const canvas=div.querySelector('canvas');if(canvas)return canvas.toDataURL('image/png');const img=div.querySelector('img');if(img?.src?.startsWith('data:'))return img.src;throw Error('QR не создан');}
  function paymentHeight(pdf,url){return Math.max(38,22+wrap(pdf,url,124,10.1,'bold').length*5.2);}
  function drawPayment(pdf,url,y){const h=paymentHeight(pdf,url);box(pdf,L,y,40,38,3,[248,252,253],[172,217,225]);pdf.addImage(qrImage(url),'PNG',23,y+4,30,30);text(pdf,'Оплата по ссылке или QR-коду',65,y+17,11,'bold');line(pdf,65,y+19,R,y+19,[185,209,215],.24);wrap(pdf,url,124,10.1,'bold').forEach((part,i)=>{const yy=y+26+i*5.2;pdf.setFont('DejaVu','bold');pdf.setFontSize(10.1);pdf.setTextColor(...COLOR.blue);pdf.textWithLink(part,65,yy,{url});line(pdf,65,yy+1,65+textWidth(pdf,part,10.1,'bold'),yy+1,COLOR.blue,.17);});return y+h;}
  function sign(pdf,settings,signature,seal,top){const base=top+28;text(pdf,settings.initials||'Захаров И.Д.',L,base-7,12.8,'bold',[86,111,120]);text(pdf,'Индивидуальный предприниматель',L,base-2,7.6,'normal',[86,111,120]);line(pdf,L,base,73,base,[185,209,215],.22);if(signature)drawImage(pdf,signature,68,base-28,28,28);if(seal)drawImage(pdf,seal,91,base-32,42,42,15);}
  function newPage(pdf){pdf.addPage();decor(pdf);return 25;}
  function fit(pdf,y,height,limit=261){return y+height<=limit?y:newPage(pdf);}
  async function createPdf(invoice,settings={}){if(!window.jspdf?.jsPDF)throw Error('jsPDF не загружена');if(typeof window.QRCode!=='function')throw Error('QRCode.js не загружена');if(!Array.isArray(invoice?.items)||!invoice.items.length)throw Error('Нет позиций');const f=await fonts(),pdf=new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true,putOnlyUsedFonts:true});registerFonts(pdf,f);if(typeof pdf.autoTable!=='function')throw Error('jspdf-autotable не загружена');const [logo,signature,seal]=await Promise.all(['logo','signature','seal'].map(async key=>{try{return await loadImage(settings[key]);}catch(error){console.warn('Изображение не вставлено:',key,error);return null;}}));const preparedLogo = logo ? await logoForPdf(logo) : null;decor(pdf);header(pdf,invoice,settings,preparedLogo);let y=table(pdf,invoice)+5;const comment=String(invoice.comment||'').trim(),url=String(invoice.paymentUrl||'').trim();y=fit(pdf,y,totalHeight(pdf,invoice));y=drawTotal(pdf,invoice,y)+7;if(comment){y=fit(pdf,y,commentHeight(pdf,comment));y=drawComment(pdf,comment,y)+8;}if(url){y=fit(pdf,y,paymentHeight(pdf,url),257);y=drawPayment(pdf,url,y)+8;}if(y<=249)sign(pdf,settings,signature,seal,251);else{y=fit(pdf,y,44,289);sign(pdf,settings,signature,seal,Math.max(y+1,250));}return pdf;}
  return {createPdf,generate:async(invoice,settings)=>{const pdf=await createPdf(invoice,settings);pdf.save(`Счёт_№${safe(invoice.number)}_от_${safe(invoice.date)}.pdf`);}};
})();
