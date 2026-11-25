// Visual comum das páginas que o cliente abre: a proposta (/proposta/…) e a página do cliente (/pedido/…).
// Mudar aqui muda as duas.
// Link para o cliente deixar uma avaliação da Enat no Google.
export const REVIEW_URL = 'https://g.page/r/CXozASQ10Lr2EBI/review';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9Z"/></svg>';
// Pedido de avaliação no fim das páginas que o cliente abre.
export const reviewCard = (url = REVIEW_URL) => `<section class="card review"><div class="stars" aria-label="5 estrelas">${STAR.repeat(5)}</div><h2>Já trabalhámos consigo?</h2><p class="muted">A sua opinião ajuda outras famílias da região a escolher com confiança. Leva menos de um minuto: toque no botão, escolha as estrelas e, se quiser, escreva duas palavras sobre o nosso trabalho.</p><a class="btn ghost" href="${url}" target="_blank" rel="noopener">Deixar a minha avaliação no Google</a></section>`;
export const BASE_CSS = `#nl-badge-frame,[id^="nl-badge"]{display:none!important}
:root{--bg:#f2f2f7;--card:#fff;--ink:#0b0d12;--mute:#6b7080;--line:#e6e7ec;--chip:#ececf1;--blue:#0666eb;--green:#13a05a;--red:#e5484d;--sun:#e8a317;--hero1:#0a0f1f;--hero2:#16307a;--tint:#f5f8ff;--warn:#fff6e0;--warnb:#f3d48a;--warnt:#6b4c00;--okbg:#eefaf3;--okb:#bfe6cf;--shadow:0 1px 2px rgba(10,15,31,.05),0 8px 24px rgba(10,15,31,.06)}
@media (prefers-color-scheme:dark){:root{--bg:#000;--card:#16171b;--ink:#f5f6f8;--mute:#8d93a1;--line:#26282e;--chip:#26282e;--blue:#3d8bff;--green:#35c97f;--red:#ff6b70;--hero1:#10162b;--hero2:#1e3f9e;--tint:#1b2233;--warn:#2a2210;--warnb:#4d3c12;--warnt:#f3d48a;--okbg:#10231a;--okb:#1d4a33;--shadow:none;color-scheme:dark}}
[hidden]{display:none!important}*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;background:var(--bg)}
body{margin:0 auto;background:var(--bg);color:var(--ink);font:400 16px/1.45 -apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;padding:0 16px calc(110px + env(safe-area-inset-bottom,0px));max-width:600px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:calc(16px + env(safe-area-inset-top,0px)) 2px 16px}
.logo{display:inline-flex;align-items:center;background:#fff;border-radius:16px;padding:7px 12px;box-shadow:0 0 0 .5px rgba(10,15,31,.06),0 4px 14px rgba(10,15,31,.08)}.logo img{display:block;height:34px;width:auto;border-radius:8px}
.logo.sm{border-radius:11px;padding:5px 8px;box-shadow:0 0 0 .5px rgba(10,15,31,.06)}.logo.sm img{height:22px;border-radius:5px}
.tag{font-size:12px;font-weight:600;letter-spacing:.02em;color:var(--mute);background:var(--chip);padding:6px 11px;border-radius:20px;white-space:nowrap;font-variant-numeric:tabular-nums}
.owner{background:var(--warn);border:1px solid var(--warnb);color:var(--warnt);border-radius:14px;padding:10px 12px;font-size:14px;margin-bottom:12px}.owner button{background:none;border:0;color:var(--blue);font:inherit;font-weight:600;padding:0;cursor:pointer;text-decoration:underline}
.welcome{display:flex;flex-direction:column;gap:4px;background:var(--tint);border:1.5px solid color-mix(in srgb,var(--blue) 30%,var(--line));border-radius:18px;padding:14px;margin-bottom:12px;font-size:14.5px}.welcome .btn{margin-top:8px}
.hero{background:linear-gradient(150deg,var(--hero1) 0%,var(--hero2) 100%);color:#fff;border-radius:26px;padding:24px 22px 22px;position:relative;overflow:hidden;box-shadow:0 14px 34px rgba(10,15,31,.22);isolation:isolate}
.hero::before{content:"";position:absolute;z-index:-1;left:-40%;bottom:-70%;width:120%;height:120%;border-radius:50%;background:radial-gradient(circle,rgba(61,139,255,.35),rgba(61,139,255,0) 65%)}
.hero::after{content:"";position:absolute;z-index:-1;right:-70px;top:-70px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(232,163,23,.45),rgba(232,163,23,0) 68%)}
.kicker{display:inline-block;margin:0;font-size:12px;font-weight:600;letter-spacing:.04em;color:#fff;background:rgba(255,255,255,.12);padding:4px 10px;border-radius:20px}
.hero h1{margin:12px 0 6px;font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-.02em}.lead{margin:0 0 18px;color:rgba(255,255,255,.78);font-size:15px}.lead b{color:#fff;font-weight:600}
.person{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:12px}.person img,.initials{width:56px;height:56px;border-radius:50%;object-fit:cover;flex:none;background:rgba(255,255,255,.16)}
.initials{display:grid;place-items:center;font-weight:700;font-size:19px}.person b{display:block;font-size:16.5px}.person small{color:rgba(255,255,255,.68);font-size:13px}
.reach{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.reach .btn{flex:1 1 140px}
.total{background:var(--tint);border-radius:18px;padding:16px 18px;display:flex;flex-direction:column;margin:12px 0}
.total small{color:var(--mute);font-size:13px}.total b{font-size:36px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.15}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;border-radius:16px;padding:15px 16px;font:inherit;font-size:17px;font-weight:600;text-decoration:none;cursor:pointer;background:var(--blue);color:#fff;transition:transform .12s,opacity .15s;-webkit-tap-highlight-color:transparent}.btn:active{transform:scale(.98)}
.btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.btn.sm{padding:11px 14px;font-size:15.5px;border-radius:14px}
.btn.light{background:#fff;color:#0b0d12}.btn.glass{background:rgba(255,255,255,.14);color:#fff}.btn.ghost{background:var(--chip);color:var(--ink)}.btn.go{background:var(--green)}.btn:disabled{opacity:.6;cursor:default}
.card{background:var(--card);border-radius:22px;padding:20px;margin-top:14px;box-shadow:var(--shadow)}
.card h1{margin:0 0 6px;font-size:22px;letter-spacing:-.01em}.card h2{margin:0 0 10px;font-size:20px;font-weight:700;letter-spacing:-.01em}.card h3{margin:18px 0 8px;font-size:16px}.muted{color:var(--mute);margin:0 0 16px;font-size:14.5px}.fine{color:var(--mute);font-size:12.5px;margin:6px 0 0}
.intro{margin:0 0 14px;font-size:15px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:0 0 14px}.facts div{background:var(--tint);border-radius:14px;padding:10px 12px}.facts b{display:block;font-size:20px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}.facts small{color:var(--mute);font-size:12.5px}.facts.pv{margin:14px 0 0}
ul.creds,ul.benefits,ul.incl,ul.kit,ul.steps{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.creds li{display:flex;gap:10px;align-items:flex-start}.creds svg,.incl svg{flex:none;width:22px;height:22px;fill:none;stroke:var(--green);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.creds b,.benefits b{display:block;font-size:15px;font-weight:600}.creds small,.benefits small{display:block;color:var(--mute);font-size:13.5px}
.benefits li{padding-left:14px;border-left:3px solid var(--blue)}
.incl li{display:flex;gap:10px;align-items:center;font-size:15px}
.kit li{display:flex;justify-content:space-between;gap:10px;font-size:14.5px;padding-bottom:8px;border-bottom:1px solid var(--line)}.kit em{font-style:normal;color:var(--mute);white-space:nowrap}
.steps li{display:flex;justify-content:space-between;gap:10px;font-size:15px}.steps span{font-variant-numeric:tabular-nums}.price .muted{margin:14px 0}
.team{display:block;width:100%;border-radius:16px;margin-top:14px;aspect-ratio:16/10;object-fit:cover}
.works{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 10px}.works figure{margin:0}.shots{display:flex;gap:6px;overflow-x:auto;scroll-snap-type:x mandatory;border-radius:14px;scrollbar-width:none}.shots::-webkit-scrollbar{display:none}.shots img{flex:0 0 100%;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;scroll-snap-align:start}.shots.many img{flex-basis:100%;width:100%}.works figcaption{padding:6px 2px 0}.works figcaption b{display:block;font-size:13.5px;font-weight:600;line-height:1.25}.works figcaption small{display:block;color:var(--mute);font-size:12px}
.link{display:inline-flex;align-items:center;gap:6px;margin-top:14px;color:var(--blue);font-weight:600;font-size:15px;text-decoration:none;background:none;border:0;padding:0;cursor:pointer;font-family:inherit}.link svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2}
.options{display:grid;gap:8px}
.opt{display:flex;align-items:center;gap:14px;text-align:left;width:100%;background:var(--card);border:1.5px solid var(--line);border-radius:18px;padding:12px 14px;font:inherit;color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s,transform .12s;-webkit-tap-highlight-color:transparent}.opt:active{transform:scale(.99)}
.opt svg{flex:none;width:42px;height:42px;padding:10px;border-radius:50%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;background:var(--chip);color:var(--blue)}
.opt b{display:block;font-size:16px;font-weight:600}.opt small{display:block;color:var(--mute);font-size:13.5px}
.opt:hover{border-color:color-mix(in srgb,var(--blue) 35%,var(--line))}.opt[aria-checked=true]{border-color:var(--blue);background:var(--tint);box-shadow:0 0 0 3px color-mix(in srgb,var(--blue) 14%,transparent)}
.o-adjudicar{border-color:color-mix(in srgb,var(--green) 45%,var(--line));padding:16px 14px}.o-adjudicar b{font-size:17.5px}.o-adjudicar svg{background:var(--green);color:#fff}.o-adjudicar[aria-checked=true]{border-color:var(--green);background:var(--okbg);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 14%,transparent)}
.o-nao svg{color:var(--mute)}.opt:disabled{opacity:.55;cursor:default}
.ask{margin-top:12px;border-top:1px solid var(--line);padding-top:14px}.ask .reach{flex-direction:column}
form{margin-top:16px}#fields{border-top:1px solid var(--line);padding-top:6px}form ul{margin:0 0 10px;padding-left:20px;font-size:14.5px}form li{margin:3px 0}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip input{position:absolute;opacity:0;pointer-events:none}.chip span{display:inline-block;padding:9px 13px;border-radius:20px;border:1.5px solid var(--line);font-size:14.5px;cursor:pointer}.chip input:checked+span{border-color:var(--blue);background:var(--tint);font-weight:600}.chip input:focus-visible+span{outline:2px solid var(--blue);outline-offset:2px}
.check{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;font-weight:600;margin:4px 0 14px}.check input{width:20px;height:20px;margin:1px 0 0;accent-color:var(--green)}
.field{display:block;margin-top:14px}.field span{display:block;font-size:14px;font-weight:600;margin-bottom:6px}textarea{width:100%;border:1.5px solid var(--line);border-radius:14px;padding:11px 13px;font:inherit;resize:vertical;background:var(--card);color:var(--ink)}textarea:focus{outline:none;border-color:var(--blue)}
.error{color:var(--red);font-size:14px;min-height:1px;margin:8px 0}
.answer{display:flex;gap:12px;align-items:flex-start;background:var(--tint);border-radius:16px;padding:12px 14px;margin:0 0 14px}.answer:empty{display:none}.answer small{display:block;color:var(--mute);font-size:13.5px}
.dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:7px;background:var(--blue)}.a-adjudicar .dot{background:var(--green)}.a-rejeitar .dot{background:var(--red)}.a-revisao .dot,.a-pensar .dot,.a-mais_tarde .dot{background:var(--sun)}
.thanks{margin-top:16px;background:var(--okbg);border:1px solid var(--okb);border-radius:16px;padding:14px;font-size:15px}.thanks small{display:block;color:var(--mute);margin-top:6px}
.pay{display:flex;flex-direction:column;gap:2px;margin-top:10px;padding:12px;border-radius:12px;background:var(--card);border:1px solid var(--line);font-size:14px}.iban{font-variant-numeric:tabular-nums;user-select:all}
.other{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--card);border:1.5px solid var(--line);border-radius:16px;padding:12px 14px;margin-top:8px;text-decoration:none;color:var(--ink)}.other small{display:block;color:var(--mute);font-size:13.5px}.other em{font-style:normal;font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
details{border-top:1px solid var(--line);padding:12px 0}details:first-of-type{border-top:0}summary{cursor:pointer;font-weight:600;font-size:15px}details p{margin:8px 0 0;color:var(--mute);font-size:14.5px}
footer{display:flex;gap:12px;align-items:center;margin:28px 4px 0;color:var(--mute);font-size:13px}footer p{margin:0}footer b{color:var(--ink);font-weight:600}footer a{color:var(--blue)}
.bar{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;gap:8px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));background:color-mix(in srgb,var(--bg) 82%,transparent);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);border-top:1px solid var(--line);transition:transform .2s}
.bar .btn{padding:13px 10px;font-size:16px}.bar .go{flex:1.3}.bar.away{transform:translateY(110%)}
@media (min-width:640px){.bar{left:50%;right:auto;width:600px;transform:translateX(-50%);border-radius:20px 20px 0 0;border:1px solid var(--line)}.bar.away{transform:translate(-50%,110%)}}
.sheet{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}.sheet[hidden]{display:none}
.sheet-in{background:var(--card);width:100%;max-width:600px;border-radius:24px 24px 0 0;padding:22px 18px calc(18px + env(safe-area-inset-bottom,0px));display:grid;gap:8px;animation:up .25s ease-out}.sheet-in>b{font-size:20px}.sheet-in .muted{margin:0 0 6px}.sheet-in .link{justify-content:center;margin:6px 0 0}
@keyframes up{from{transform:translateY(30%);opacity:0}}
:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.sheet-in{animation:none}.bar{transition:none}}
@media (min-width:560px){.hero{padding:30px 30px 26px}.hero h1{font-size:32px}.card{padding:24px}}
.review{text-align:center}.review .stars{display:flex;justify-content:center;gap:4px;margin:2px 0 8px}.review .stars svg{width:24px;height:24px;fill:#f5b301;stroke:none}.review .muted{margin:0 0 14px}
.greviews{display:grid;gap:10px;margin-top:14px}.greviews figure{margin:0;background:var(--tint);border-radius:14px;padding:12px 14px}.gst{color:#f5b301;letter-spacing:2px;font-size:15px}.greviews blockquote{margin:4px 0 6px;font-size:14.5px;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}.greviews blockquote.none{color:var(--mute);font-style:italic}.greviews figcaption{color:var(--mute);font-size:13px;display:flex;align-items:center;gap:8px;min-width:0}.greviews figcaption span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gav{flex:none;width:28px;height:28px;border-radius:50%;object-fit:cover;display:grid;place-items:center;background:var(--card);color:var(--ink);font-weight:700;font-size:13px;overflow:hidden}
`;
