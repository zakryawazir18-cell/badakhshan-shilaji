/* ====== سیٹنگ (اصل سیٹنگ config.js میں ہے) ====== */
const WHATSAPP_NUMBER = window.SITE.whatsapp;
const BRAND = window.SITE.brand;
const db = window.supabase.createClient(window.SITE.supabaseUrl, window.SITE.supabaseKey);
/* =================================== */

/* سال اور واٹس ایپ بٹن */
document.getElementById("year").textContent = new Date().getFullYear();
const waFloat = document.getElementById("waFloat");
waFloat.href = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" +
  encodeURIComponent("Hello " + BRAND + ", I want to know more.");

/* اسکرول پر اینیمیشن */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add("visible");
      revealObserver.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

/* ====== پروڈکٹس اور کارٹ ====== */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) {
  return window.SITE.currency + " " + Number(n).toLocaleString();
}

const CART_KEY = "bs_cart_v1";
let VARIANTS = {};   // variant id -> تفصیل (قیمتیں ہمیشہ ڈیٹا بیس سے)
let SHIPPING = 0;
let loaded = false;
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch (e) { cart = []; }
if (!Array.isArray(cart)) cart = [];
cart = cart.filter((i) => i && typeof i.id === "string" && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 20);

function saveCart() { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }

function maxQty(id) {
  const v = VARIANTS[id];
  return v && v.stock != null ? Math.min(20, v.stock) : 20;
}
function addToCart(id, n) {
  const v = VARIANTS[id];
  if (!v || !v.available || maxQty(id) < 1) return;
  const row = cart.find((i) => i.id === id);
  if (row) row.qty = Math.min(maxQty(id), row.qty + n);
  else cart.push({ id: id, qty: Math.min(n, maxQty(id)) });
  renderCart();
}
function setQty(id, q) {
  const row = cart.find((i) => i.id === id);
  if (!row) return;
  if (q < 1) cart = cart.filter((i) => i.id !== id);
  else row.qty = Math.min(maxQty(id), q);
  renderCart();
}

function renderCart() {
  if (loaded) {
    cart = cart.filter((i) => VARIANTS[i.id] && VARIANTS[i.id].available && maxQty(i.id) >= 1);
    cart.forEach((i) => { i.qty = Math.min(i.qty, maxQty(i.id)); });
  }
  saveCart();
  document.getElementById("cartCount").textContent = cart.reduce((s, i) => s + i.qty, 0);

  const body = document.getElementById("cartBody");
  const foot = document.getElementById("cartFoot");

  if (!loaded) { body.innerHTML = '<div class="cart-empty"><p>Loading…</p></div>'; foot.innerHTML = ""; return; }
  if (!cart.length) {
    body.innerHTML = '<div class="cart-empty"><p>Your cart is empty.</p><a href="#products" class="btn btn-sm" data-act="close">Browse products</a></div>';
    foot.innerHTML = "";
    return;
  }

  let sub = 0;
  body.innerHTML = cart.map((i) => {
    const v = VARIANTS[i.id];
    sub += v.price * i.qty;
    return '<div class="cart-item">' +
      "<div><strong>" + esc(v.name) + " · " + esc(v.label) + "</strong><small>" + esc(money(v.price)) + " each</small></div>" +
      '<button class="rm" data-act="rm" data-id="' + esc(i.id) + '" aria-label="Remove item">✕</button>' +
      '<div class="qty"><button data-act="dec" data-id="' + esc(i.id) + '" aria-label="Decrease quantity">−</button><span>' + i.qty +
      '</span><button data-act="inc" data-id="' + esc(i.id) + '" aria-label="Increase quantity">+</button></div>' +
      '<div class="line">' + esc(money(v.price * i.qty)) + "</div></div>";
  }).join("");

  foot.innerHTML =
    '<div class="totals">' +
    "<div><span>Subtotal</span><span>" + esc(money(sub)) + "</span></div>" +
    "<div><span>Shipping</span><span>" + esc(money(SHIPPING)) + "</span></div>" +
    '<div class="grand"><span>Total</span><span>' + esc(money(sub + SHIPPING)) + "</span></div></div>" +
    '<button class="btn" id="cartCheckout" data-act="checkout">Checkout</button>';
}

/* ڈرا اور ڈائیلاگ */
function openCart() {
  document.getElementById("drawerBg").classList.add("open");
  document.getElementById("cartDrawer").classList.add("open");
}
function closeCart() {
  document.getElementById("drawerBg").classList.remove("open");
  document.getElementById("cartDrawer").classList.remove("open");
}
function openModal(id) {
  const v = VARIANTS[id];
  if (!v) return;
  const p = v.product || {};
  let h = "";
  if (v.image) h += '<img src="' + esc(v.image) + '" alt="' + esc(p.name) + '">';
  h += "<h3>" + esc(p.name) + " · " + esc(v.label) + "</h3>";
  h += '<p class="m-price">' + esc(money(v.price)) + "</p>";
  if (v.stock != null && v.stock > 0 && v.stock <= 5) h += '<p class="pleft">Only ' + esc(v.stock) + " left</p>";
  if (p.description) h += "<p>" + esc(p.description) + "</p>";
  if (v.weight_g) h += "<h4>Weight</h4><p>" + esc(v.weight_g) + " g</p>";
  if (p.usage_info) h += "<h4>Directions</h4><p>" + esc(p.usage_info) + "</p>";
  if (p.storage_info) h += "<h4>Storage</h4><p>" + esc(p.storage_info) + "</p>";
  if (p.batch_no) h += "<h4>Batch</h4><p>" + esc(p.batch_no) + "</p>";
  h += "<h4>Notice</h4><p>Not intended to diagnose, treat or cure any disease. Consult a healthcare professional before use, especially if pregnant, nursing or on medication.</p>";
  h += '<div class="card-actions">' +
    (v.available
      ? '<button class="btn btn-sm" data-act="add" data-id="' + esc(id) + '">Add to Cart</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="buynow" data-id="' + esc(id) + '">Buy Now</button>'
      : '<span class="btn btn-sm btn-ghost soldout">Sold Out</span>') + "</div>";
  document.getElementById("modalBox").innerHTML = h;
  document.getElementById("modalBg").classList.add("open");
}
function closeModal() { document.getElementById("modalBg").classList.remove("open"); }

/* تمام بٹن ایک ہی جگہ سے */
document.addEventListener("click", (e) => {
  if (e.target.id === "drawerBg") return closeCart();
  if (e.target.id === "modalBg") return closeModal();
  if (e.target.closest("#cartOpen")) { openCart(); return; }
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const act = t.dataset.act, id = t.dataset.id;
  const row = cart.find((i) => i.id === id);
  if (act === "add") { addToCart(id, 1); closeModal(); openCart(); }
  else if (act === "buynow") { addToCart(id, 1); closeModal(); document.dispatchEvent(new CustomEvent("checkout")); }
  else if (act === "details") openModal(id);
  else if (act === "inc") setQty(id, (row ? row.qty : 0) + 1);
  else if (act === "dec") setQty(id, (row ? row.qty : 1) - 1);
  else if (act === "rm") setQty(id, 0);
  else if (act === "close") closeCart();
  else if (act === "close-modal") closeModal();
  else if (act === "checkout") { document.dispatchEvent(new CustomEvent("checkout")); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCart(); closeModal(); } });

/* ڈیٹا بیس سے پروڈکٹس */
async function loadProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  const [pv, st] = await Promise.all([
    db.from("product_variants")
      .select("id,label,weight_g,price,available,sort_order,image_url,stock,products(name,short_desc,description,usage_info,storage_info,batch_no,image_url,is_active,sort_order)")
      .order("sort_order"),
    db.from("settings").select("value").eq("key", "shipping_fee").maybeSingle()
  ]);

  const data = pv.data, error = pv.error;
  if (st.data && st.data.value !== "") SHIPPING = Number(st.data.value) || 0;

  if (error || !data) {
    grid.innerHTML = '<p class="center" style="grid-column:1/-1;color:var(--muted)">Products could not be loaded. Please refresh.</p>';
    return;
  }
  if (!data.length) {
    grid.innerHTML = '<p class="center" style="grid-column:1/-1;color:var(--muted)">No products available right now.</p>';
    loaded = true;
    return;
  }

  data.sort((a, b) =>
    ((a.products && a.products.sort_order) || 0) - ((b.products && b.products.sort_order) || 0) ||
    a.sort_order - b.sort_order);

  VARIANTS = {};
  data.forEach((v) => {
    VARIANTS[v.id] = {
      id: v.id, label: v.label, weight_g: v.weight_g, price: Number(v.price),
      stock: v.stock,
      available: v.available,
      name: v.products ? v.products.name : "Shilajit",
      product: v.products || {},
      image: v.image_url || (v.products && v.products.image_url) || ""
    };
  });
  loaded = true;

  grid.innerHTML = data.map((v, i) => {
    const x = VARIANTS[v.id];
    const img = x.image
      ? '<img src="' + esc(x.image) + '" alt="' + esc(x.name + " " + v.label) + '" loading="lazy">'
      : '<div class="pimg-ph">' + esc(v.label) + "</div>";
    const badge = i === 1 && v.available ? '<span class="pbadge">Popular</span>' : "";
    const sold = !v.available ? '<span class="psold">Sold out</span>' : "";
    const per = v.weight_g ? money(Math.round(v.price / v.weight_g)) + " / g" : "";
    return '<article class="pcard reveal' + (v.available ? "" : " off") + '">' +
      '<button class="pimg" data-act="details" data-id="' + esc(v.id) + '" aria-label="View details">' + img + badge + sold + "</button>" +
      '<div class="pbody"><h3>' + esc(x.name) + '</h3><p class="psize">' + esc(v.label) + "</p>" +
      '<p class="pprice">' + esc(money(v.price)) + "</p>" +
      (per ? '<p class="pper">' + esc(per) + "</p>" : "") +
      (x.stock != null && x.stock > 0 && x.stock <= 5 ? '<p class="pleft">Only ' + esc(x.stock) + " left</p>" : "") +
      (v.available
        ? '<button class="btn btn-sm pbtn" data-act="add" data-id="' + esc(v.id) + '">Add to Cart</button>'
        : '<span class="btn btn-sm btn-ghost soldout pbtn">Sold Out</span>') +
      "</div></article>";
  }).join("");
  grid.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
  renderCart();
}

renderCart();
loadProducts();

/* ====== رابطہ فارم: سوال ڈیٹا بیس میں ====== */
const inquiryForm = document.getElementById("orderForm");
if (inquiryForm) {
  inquiryForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(inquiryForm);
    const msg = document.getElementById("inquiryMsg");
    const btn = inquiryForm.querySelector("button[type=submit]");
    btn.disabled = true;
    msg.textContent = "Sending…";
    const { error } = await db.from("inquiries").insert({
      name: String(f.get("name") || "").trim(),
      phone: String(f.get("phone") || "").trim() || null,
      message: String(f.get("message") || "").trim()
    });
    btn.disabled = false;
    if (error) { msg.textContent = "Could not send. Please try again or use WhatsApp."; return; }
    msg.textContent = "Thank you. We received your question and will reply soon.";
    inquiryForm.reset();
  });
}

/* ====== چیک آؤٹ ====== */
const checkoutBg = document.getElementById("checkoutBg");
const checkoutBox = document.getElementById("checkoutBox");
let submitting = false;
let pendingKey = null;
let PAY = {};

async function loadPay() {
  const { data } = await db.from("settings").select("key,value").like("key", "pay_%");
  PAY = {};
  (data || []).forEach((r) => { PAY[r.key] = r.value; });
}
loadPay();

function payMethods() {
  const m = [];
  if ((PAY.pay_cod_on || "true") === "true")
    m.push({ id: "cod", name: "Cash on Delivery", note: "Pay when your order arrives", info: "" });
  if (PAY.pay_jazzcash_on === "true" && PAY.pay_jazzcash_no)
    m.push({ id: "jazzcash", name: "JazzCash", note: "Send money, then enter the transaction ID",
      info: "Account title: " + (PAY.pay_jazzcash_title || "-") + "\nJazzCash number: " + PAY.pay_jazzcash_no });
  if (PAY.pay_easypaisa_on === "true" && PAY.pay_easypaisa_no)
    m.push({ id: "easypaisa", name: "Easypaisa", note: "Send money, then enter the transaction ID",
      info: "Account title: " + (PAY.pay_easypaisa_title || "-") + "\nEasypaisa number: " + PAY.pay_easypaisa_no });
  if (PAY.pay_bank_on === "true" && PAY.pay_bank_details)
    m.push({ id: "bank", name: "Bank Transfer", note: "Transfer, then enter the transaction reference", info: PAY.pay_bank_details });
  if (!m.length) m.push({ id: "cod", name: "Cash on Delivery", note: "Pay when your order arrives", info: "" });
  return m;
}

function newKey() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : "k" + Date.now() + Math.random().toString(16).slice(2);
}
function closeCheckout() { checkoutBg.classList.remove("open"); }
document.getElementById("checkoutX").addEventListener("click", closeCheckout);
checkoutBg.addEventListener("click", (e) => { if (e.target === checkoutBg) closeCheckout(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCheckout(); });

function cartTotal() {
  return cart.reduce((s, i) => s + VARIANTS[i.id].price * i.qty, 0) + SHIPPING;
}

function summaryHtml() {
  let sub = 0;
  const rows = cart.map((i) => {
    const v = VARIANTS[i.id];
    sub += v.price * i.qty;
    return '<div class="row"><span>' + esc(v.name) + " " + esc(v.label) + " × " + i.qty +
      "</span><span>" + esc(money(v.price * i.qty)) + "</span></div>";
  }).join("");
  return '<div class="co-sum">' + rows +
    '<div class="row"><span>Shipping</span><span>' + esc(money(SHIPPING)) + "</span></div>" +
    '<div class="row grand"><span>Total</span><span>' + esc(money(sub + SHIPPING)) + "</span></div></div>";
}

function updatePayUi() {
  const sel = checkoutBox.querySelector('input[name="method"]:checked');
  if (!sel) return;
  const m = payMethods().find((x) => x.id === sel.value);
  checkoutBox.querySelectorAll(".pay-opt").forEach((l) => l.classList.toggle("sel", l.contains(sel)));
  const info = document.getElementById("payInfo");
  const refBox = document.getElementById("refBox");
  if (m && m.id !== "cod") {
    info.innerHTML = "<b>Send " + esc(money(cartTotal())) + " to:</b>\n" + esc(m.info);
    info.style.display = "block";
    refBox.style.display = "block";
  } else {
    info.style.display = "none";
    refBox.style.display = "none";
  }
}

async function openCheckout() {
  if (!loaded || !cart.length) return;
  closeCart();
  pendingKey = newKey();
  await loadPay();
  const methods = payMethods();
  const payHtml = methods.map((m, i) =>
    '<label class="pay-opt"><input type="radio" name="method" value="' + esc(m.id) + '"' + (i === 0 ? " checked" : "") + ">" +
    "<span><strong>" + esc(m.name) + "</strong><small>" + esc(m.note) + "</small></span></label>").join("");
  checkoutBox.innerHTML =
    "<h3>Checkout</h3>" + summaryHtml() +
    '<form class="co-form" id="coForm" novalidate>' +
    '<p class="co-step">1 · Delivery details</p>' +
    '<label for="co_name">Full name</label><input id="co_name" name="name" required minlength="2" maxlength="100" autocomplete="name">' +
    '<label for="co_phone">Phone / WhatsApp</label><input id="co_phone" name="phone" type="tel" required maxlength="30" autocomplete="tel" placeholder="03xx xxxxxxx">' +
    '<label for="co_email">Email (optional)</label><input id="co_email" name="email" type="email" maxlength="120" autocomplete="email">' +
    '<label for="co_country">Country</label><input id="co_country" name="country" value="Pakistan" maxlength="60">' +
    '<label for="co_city">City</label><input id="co_city" name="city" required maxlength="60" autocomplete="address-level2">' +
    '<label for="co_address">Complete delivery address</label><textarea id="co_address" name="address" rows="3" required minlength="5" maxlength="300" autocomplete="street-address"></textarea>' +
    '<label for="co_notes">Order notes (optional)</label><textarea id="co_notes" name="notes" rows="2" maxlength="500"></textarea>' +
    '<p class="co-step">2 · Payment</p><div class="pay-opts">' + payHtml + "</div>" +
    '<div class="pay-info" id="payInfo" style="display:none"></div>' +
    '<div id="refBox" style="display:none"><label for="co_ref">Transaction ID / reference</label>' +
    '<input id="co_ref" name="ref" maxlength="60" autocomplete="off" placeholder="From your payment confirmation"></div>' +
    '<p class="co-err" id="coErr" role="alert"></p>' +
    '<p class="co-secure">Secure order. Your details are used only to deliver your order.</p>' +
    '<button class="btn" type="submit" id="coBtn">Place Order · ' + esc(money(cartTotal())) + "</button></form>";
  checkoutBg.classList.add("open");
  updatePayUi();
}
document.addEventListener("checkout", openCheckout);
checkoutBox.addEventListener("change", (e) => { if (e.target.name === "method") updatePayUi(); });

checkoutBox.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (submitting) return;
  const form = ev.target;
  const err = document.getElementById("coErr");
  const btn = document.getElementById("coBtn");
  const f = new FormData(form);
  const name = String(f.get("name") || "").trim();
  const phone = String(f.get("phone") || "").trim();
  const city = String(f.get("city") || "").trim();
  const address = String(f.get("address") || "").trim();
  const method = String(f.get("method") || "cod");
  const ref = String(f.get("ref") || "").trim();

  if (name.length < 2) { err.textContent = "Please enter your full name."; return; }
  if (phone.replace(/\D/g, "").length < 7) { err.textContent = "Please enter a valid phone number."; return; }
  if (!city) { err.textContent = "Please enter your city."; return; }
  if (address.length < 5) { err.textContent = "Please enter your complete address."; return; }
  if (method !== "cod" && ref.length < 4) { err.textContent = "Please send the payment first, then enter the transaction ID."; return; }
  if (!cart.length) { err.textContent = "Your cart is empty."; return; }

  err.textContent = "";
  submitting = true;
  btn.disabled = true;
  btn.textContent = "Placing order…";

  const items = cart.map((i) => ({ variant_id: i.id, qty: i.qty }));
  const { data, error } = await db.rpc("place_order", {
    p_name: name, p_phone: phone,
    p_email: String(f.get("email") || "").trim(),
    p_country: String(f.get("country") || "").trim(),
    p_city: city, p_address: address,
    p_notes: String(f.get("notes") || "").trim(),
    p_items: items, p_key: pendingKey,
    p_method: method, p_ref: method === "cod" ? null : ref
  });

  submitting = false;

  if (error || !data || !data.order_no) {
    btn.disabled = false;
    btn.textContent = "Place Order · " + money(cartTotal());
    err.textContent = (error && /stock/i.test(error.message || ""))
      ? "Sorry, one item is low on stock. Please reduce the quantity and try again."
      : "Your order could not be saved. Please try again, or contact us on WhatsApp.";
    loadProducts();
    return;
  }

  const mname = (payMethods().find((x) => x.id === method) || { name: method }).name;
  const lines = cart.map((i) => {
    const v = VARIANTS[i.id];
    return "- " + v.name + " " + v.label + " x " + i.qty + " = " + money(v.price * i.qty);
  }).join("\n");
  const waText =
    "Hello " + BRAND + ", I placed order " + data.order_no + ".\n" + lines +
    "\nTotal: " + money(data.total) + "\nPayment: " + mname + (method !== "cod" ? " (ID: " + ref + ")" : "") +
    "\nName: " + name + "\nPhone: " + phone;
  const waLink = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(waText);

  cart = [];
  pendingKey = null;
  renderCart();
  loadProducts();

  checkoutBox.innerHTML =
    '<div class="ok-box"><h3>Order Received</h3>' +
    '<p>Your order number</p><div class="order-no">' + esc(data.order_no) + "</div>" +
    (method === "cod"
      ? "<p>Total to pay on delivery: <strong>" + esc(money(data.total)) + "</strong></p>"
      : "<p>We will verify your " + esc(mname) + " payment of <strong>" + esc(money(data.total)) + "</strong> and then confirm your order.</p>") +
    "<p>Please save this number. We will contact you on " + esc(phone) + ".</p>" +
    '<a class="btn btn-sm" href="' + esc(waLink) + '" target="_blank" rel="noopener">Message us on WhatsApp</a>' +
    '<button class="btn btn-sm btn-ghost" id="coDone">Close</button></div>';
  document.getElementById("coDone").addEventListener("click", closeCheckout);
});

/* ====== ریلز کی پٹی ====== */
async function loadReels() {
  const sec = document.getElementById("reels");
  const track = document.getElementById("reelTrack");
  if (!sec || !track) return;
  const { data, error } = await db.from("reels").select("id,title,video_url").order("sort_order");
  if (error || !data || !data.length) return;

  track.innerHTML = data.map((r) =>
    '<div class="reel"><video src="' + esc(r.video_url) + '#t=0.1" muted loop playsinline preload="metadata"></video>' +
    '<span class="snd">Tap for sound</span>' +
    (r.title ? '<div class="ttl">' + esc(r.title) + "</div>" : "") + "</div>"
  ).join("");
  sec.hidden = false;

  const cards = Array.prototype.slice.call(track.children);
  let current = -1, visible = false, paused = false;

  function centerIndex() {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0, bd = 1e9;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function update() {
    const i = centerIndex();
    current = i;
    cards.forEach((c, k) => {
      const v = c.querySelector("video");
      c.classList.toggle("active", k === i);
      if (k === i && visible) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      else { v.pause(); if (k !== i) { v.muted = true; c.classList.remove("sound"); } }
    });
  }
  function goTo(k) {
    const c = cards[k];
    track.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - track.clientWidth / 2, behavior: "smooth" });
  }

  track.addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
  track.addEventListener("click", (e) => {
    const c = e.target.closest(".reel");
    if (!c) return;
    const k = cards.indexOf(c);
    if (k !== current) { goTo(k); return; }
    const v = c.querySelector("video");
    v.muted = !v.muted;
    c.classList.toggle("sound", !v.muted);
    c.querySelector(".snd").textContent = v.muted ? "Tap for sound" : "Sound on";
  });

  ["pointerdown", "touchstart", "mouseenter"].forEach((ev) => track.addEventListener(ev, () => { paused = true; }, { passive: true }));
  ["mouseleave", "touchend"].forEach((ev) => track.addEventListener(ev, () => { setTimeout(() => { paused = false; }, 4000); }, { passive: true }));

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; update(); }, { threshold: 0.3 }).observe(sec);

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      if (paused || !visible || cards[current].classList.contains("sound")) return;
      goTo((current + 1) % cards.length);
    }, 5000);
  }
  update();
}
loadReels();

/* فوٹر کا واٹس ایپ */
const footWa = document.getElementById("footWa");
if (footWa) footWa.href = waFloat.href;

/* نیچے کا بار */
(function () {
  const cartBtn = document.getElementById("bbCart");
  const count = document.getElementById("bbCount");
  const src = document.getElementById("cartCount");
  const wa = document.getElementById("bbWa");
  if (!cartBtn) return;
  cartBtn.addEventListener("click", () => document.getElementById("cartOpen").click());
  wa.href = waFloat.href;
  function sync() { count.textContent = src.textContent; count.style.display = src.textContent === "0" ? "none" : "flex"; }
  new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  sync();
})();

/* موبائل ٹیب: جو سیکشن نظر آئے وہ روشن */
(function () {
  const bar = document.getElementById("tabsbar");
  if (!bar) return;
  const links = Array.prototype.slice.call(bar.querySelectorAll('a[href^="#"]'));
  const map = {};
  links.forEach((a) => { map[a.getAttribute("href").slice(1)] = a; });
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting || !map[e.target.id]) return;
      links.forEach((a) => a.classList.remove("on"));
      map[e.target.id].classList.add("on");
      map[e.target.id].scrollIntoView({ inline: "center", block: "nearest" });
    });
  }, { rootMargin: "-35% 0px -55% 0px" });
  Object.keys(map).forEach((id) => { const s = document.getElementById(id); if (s) io.observe(s); });
})();