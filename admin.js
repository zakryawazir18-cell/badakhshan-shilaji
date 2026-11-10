const db = window.supabase.createClient(window.SITE.supabaseUrl, window.SITE.supabaseKey);
const $ = (id) => document.getElementById(id);
const money = (n) => window.SITE.currency + " " + Number(n || 0).toLocaleString();

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function say(id, text, bad) { const el = $(id); el.textContent = text; el.className = "msg" + (bad ? " bad" : ""); }
function show(view) {
  $("loginView").classList.toggle("hidden", view !== "login");
  $("appView").classList.toggle("hidden", view !== "app");
}

const PAYKEYS = [
  "pay_cod_on", "pay_jazzcash_on", "pay_jazzcash_title", "pay_jazzcash_no",
  "pay_easypaisa_on", "pay_easypaisa_title", "pay_easypaisa_no",
  "pay_bank_on", "pay_bank_details"
];
const STATUSES = ["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];
const PAYSTAT = ["Pay on delivery", "Awaiting verification", "Paid", "Unpaid", "Refunded"];
const METHOD_NAME = { cod: "Cash on Delivery", jazzcash: "JazzCash", easypaisa: "Easypaisa", bank: "Bank Transfer" };

let loadedOnce = false;
let lastOrderCount = null;
let orderTimer = null;
const BASE_TITLE = document.title;

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.22].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = t ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
    });
  } catch (e) {}
}

async function pollOrders() {
  const { count, error } = await db.from("orders").select("id", { count: "exact", head: true });
  if (error || count == null) return;
  if (lastOrderCount !== null && count > lastOrderCount) {
    const n = count - lastOrderCount;
    beep();
    $("newOrderText").textContent = n + (n === 1 ? " new order received" : " new orders received");
    $("newOrderBar").classList.remove("hidden");
    document.title = "(" + n + ") New order! | Admin";
    loadOrders(); loadOverview();
  }
  lastOrderCount = count;
}

$("newOrderGo").addEventListener("click", () => {
  $("newOrderBar").classList.add("hidden");
  document.title = BASE_TITLE;
  const b = document.querySelector('#tabs button[data-tab="orders"]');
  if (b) b.click();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && $("newOrderBar").classList.contains("hidden")) document.title = BASE_TITLE;
});
function loadAll() {
  if (loadedOnce) return;
  loadedOnce = true;
  loadOverview(); loadProduct(); loadSettings(); loadPayments();
  loadReels(); loadOrders(); loadInquiries();  pollOrders();
  if (!orderTimer) orderTimer = setInterval(pollOrders, 30000);
}

async function checkAdmin() {
  const { data: s } = await db.auth.getSession();
  if (!s.session) { show("login"); return false; }
  const { data, error } = await db.rpc("is_admin");
  if (error || data !== true) {
    await db.auth.signOut();
    show("login");
    $("loginErr").textContent = "This account is not an administrator.";
    return false;
  }
  $("who").textContent = s.session.user.email;
  show("app");
  loadAll();
  return true;
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("loginBtn");
  $("loginErr").textContent = "";
  btn.disabled = true;
  const { error } = await db.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
  btn.disabled = false;
  if (error) { $("loginErr").textContent = "Wrong email or password."; return; }
  $("password").value = "";
  checkAdmin();
});

$("logoutBtn").addEventListener("click", async () => {
  await db.auth.signOut();
  loadedOnce = false;
  show("login");
});

$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (!b) return;
  document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
  document.querySelectorAll("[data-panel]").forEach((p) =>
    p.classList.toggle("hidden", p.dataset.panel !== b.dataset.tab));
});

async function loadOverview() {
  const [all, pending, inq, rows] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "Pending"),
    db.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "New"),
    db.from("orders").select("total,status").neq("status", "Cancelled").limit(5000)
  ]);
  $("stOrders").textContent = all.error ? "—" : all.count;
  $("stPending").textContent = pending.error ? "—" : pending.count;
  $("stInq").textContent = inq.error ? "—" : inq.count;
  $("stSales").textContent = rows.error ? "—" : money((rows.data || []).reduce((s, r) => s + Number(r.total), 0));
}

/* ====== پروڈکٹ ====== */
let PRODUCT = null;
let PRODUCTS = [];

async function uploadImage(file, folder) {
  if (file.size > 3 * 1024 * 1024) throw new Error("Image must be under 3 MB.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
  const up = await db.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(up.error.message);
  return db.storage.from("media").getPublicUrl(path).data.publicUrl;
}

async function loadProduct(selectId) {
  const { data, error } = await db.from("products").select("*").order("sort_order").order("created_at");
  if (error) { say("productMsg", "Could not load products.", true); return; }
  PRODUCTS = data || [];
  const sel = $("p_pick");
  sel.innerHTML = PRODUCTS.map((p) =>
    '<option value="' + esc(p.id) + '">' + esc(p.name) + (p.is_active ? "" : " (hidden)") + "</option>").join("");
  const has = PRODUCTS.length > 0;
  $("productCard").classList.toggle("hidden", !has);
  $("variantCard").classList.toggle("hidden", !has);
  if (!has) { PRODUCT = null; return; }
  const want = selectId || (PRODUCT && PRODUCT.id) || PRODUCTS[0].id;
  sel.value = PRODUCTS.some((p) => p.id === want) ? want : PRODUCTS[0].id;
  fillProduct();
}

function fillProduct() {
  PRODUCT = PRODUCTS.find((p) => p.id === $("p_pick").value) || null;
  if (!PRODUCT) return;
  $("p_name").value = PRODUCT.name || "";
  $("p_short").value = PRODUCT.short_desc || "";
  $("p_desc").value = PRODUCT.description || "";
  $("p_usage").value = PRODUCT.usage_info || "";
  $("p_storage").value = PRODUCT.storage_info || "";
  $("p_batch").value = PRODUCT.batch_no || "";
  $("p_active").value = PRODUCT.is_active ? "true" : "false";
  const pv = $("p_preview");
  if (PRODUCT.image_url) { pv.src = PRODUCT.image_url; pv.classList.remove("hidden"); }
  else { pv.removeAttribute("src"); pv.classList.add("hidden"); }
  $("p_image").value = "";
  loadVariants();
}

$("p_pick").addEventListener("change", fillProduct);

$("p_image").addEventListener("change", () => {
  const f = $("p_image").files[0];
  if (!f) return;
  $("p_preview").src = URL.createObjectURL(f);
  $("p_preview").classList.remove("hidden");
});

$("pNew").addEventListener("click", async () => {
  const name = (prompt("New product name?") || "").trim();
  if (!name) return;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
  const { data, error } = await db.from("products").insert({ slug: slug, name: name, sort_order: PRODUCTS.length + 1 }).select().single();
  if (error) { say("productMsg", "Could not add product: " + error.message, true); return; }
  say("productMsg", "Product added. Now add its sizes below.");
  loadProduct(data.id);
});

$("pDel").addEventListener("click", async () => {
  if (!PRODUCT) return;
  if (!confirm('Delete "' + PRODUCT.name + '" and all its sizes? Past orders are kept.')) return;
  const { error } = await db.from("products").delete().eq("id", PRODUCT.id);
  if (error) { say("productMsg", "Delete failed: " + error.message, true); return; }
  PRODUCT = null;
  say("productMsg", "Product deleted.");
  loadProduct();
});

$("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!PRODUCT) { say("productMsg", "Product not loaded yet. Refresh the page.", true); return; }
  const btn = $("productBtn");
  btn.disabled = true;
  say("productMsg", "Saving…");
  try {
    let imageUrl = PRODUCT.image_url;
    const file = $("p_image").files[0];
    if (file) imageUrl = await uploadImage(file, "products");
    const { error } = await db.from("products").update({
      name: $("p_name").value.trim(),
      short_desc: $("p_short").value.trim() || null,
      description: $("p_desc").value.trim() || null,
      usage_info: $("p_usage").value.trim() || null,
      storage_info: $("p_storage").value.trim() || null,
      batch_no: $("p_batch").value.trim() || null,
      is_active: $("p_active").value === "true",
      image_url: imageUrl
    }).eq("id", PRODUCT.id);
    if (error) throw new Error(error.message);
    say("productMsg", "Saved.");
    loadProduct(PRODUCT.id);
  } catch (err) {
    say("productMsg", "Save failed: " + err.message, true);
  }
  btn.disabled = false;
});

/* ====== سائز، قیمت، تصویر، اسٹاک ====== */
function parseStock(raw) {
  if (raw === "") return null;
  const n = Math.floor(Number(raw));
  if (!isFinite(n) || n < 0) throw new Error("Enter a valid stock number.");
  return n;
}

async function loadVariants() {
  if (!PRODUCT) return;
  const { data, error } = await db.from("product_variants").select("*").eq("product_id", PRODUCT.id).order("sort_order");
  if (error) { say("variantMsg", "Could not load sizes.", true); return; }
  $("variantRows").innerHTML = (data || []).map((v) =>
    '<tr data-id="' + esc(v.id) + '">' +
    "<td>" + (v.image_url
      ? '<img src="' + esc(v.image_url) + '" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;display:block;margin-bottom:6px">'
      : '<small style="color:var(--muted)">Uses main image</small>') +
    '<input class="v-img" type="file" accept="image/jpeg,image/png,image/webp" style="padding:6px;font-size:.75rem;min-width:140px"></td>' +
    '<td><input class="v-label" value="' + esc(v.label) + '" maxlength="30" style="min-width:80px"></td>' +
    '<td><input class="v-weight" type="number" min="0" value="' + esc(v.weight_g == null ? "" : v.weight_g) + '" style="min-width:80px"></td>' +
    '<td><input class="v-price" type="number" min="0" step="1" value="' + esc(v.price) + '" style="min-width:100px"></td>' +
    '<td><input class="v-stock" type="number" min="0" step="1" placeholder="not counted" value="' + esc(v.stock == null ? "" : v.stock) + '" style="min-width:90px"></td>' +
    '<td><select class="v-avail"><option value="true"' + (v.available ? " selected" : "") + '>In stock</option>' +
    '<option value="false"' + (!v.available ? " selected" : "") + '>Sold out</option></select></td>' +
    '<td style="white-space:nowrap"><button class="btn" data-save="' + esc(v.id) + '">Save</button> ' +
    (v.image_url ? '<button class="btn ghost" data-clr="' + esc(v.id) + '">Clear image</button> ' : "") +
    '<button class="btn ghost" data-del="' + esc(v.id) + '">Delete</button></td></tr>'
  ).join("") || '<tr><td colspan="7">No sizes yet. Add one below.</td></tr>';
}

$("variantRows").addEventListener("click", async (e) => {
  const sv = e.target.closest("button[data-save]");
  const dl = e.target.closest("button[data-del]");
  const cl = e.target.closest("button[data-clr]");

  if (sv) {
    const tr = sv.closest("tr");
    const price = Number(tr.querySelector(".v-price").value);
    const weight = tr.querySelector(".v-weight").value;
    const label = tr.querySelector(".v-label").value.trim();
    if (!label) { say("variantMsg", "Size name cannot be empty.", true); return; }
    if (!isFinite(price) || price < 0) { say("variantMsg", "Enter a valid price.", true); return; }
    sv.disabled = true;
    try {
      const stock = parseStock(tr.querySelector(".v-stock").value);
      const upd = {
        label: label,
        weight_g: weight === "" ? null : Number(weight),
        price: price,
        stock: stock,
        available: stock === 0 ? false : tr.querySelector(".v-avail").value === "true"
      };
      const file = tr.querySelector(".v-img").files[0];
      if (file) upd.image_url = await uploadImage(file, "variants");
      const { error } = await db.from("product_variants").update(upd).eq("id", sv.dataset.save);
      if (error) throw new Error(error.message);
      say("variantMsg", "Saved.");
      loadVariants();
    } catch (err) {
      say("variantMsg", "Save failed: " + err.message, true);
    }
    sv.disabled = false;
  }

  if (cl) {
    const { error } = await db.from("product_variants").update({ image_url: null }).eq("id", cl.dataset.clr);
    say("variantMsg", error ? "Failed: " + error.message : "Image cleared.", !!error);
    if (!error) loadVariants();
  }

  if (dl) {
    if (!confirm("Delete this size? Past orders are kept.")) return;
    const { error } = await db.from("product_variants").delete().eq("id", dl.dataset.del);
    say("variantMsg", error ? "Delete failed: " + error.message : "Deleted.", !!error);
    if (!error) loadVariants();
  }
});

$("vAdd").addEventListener("click", async () => {
  if (!PRODUCT) return;
  const label = $("v_label").value.trim();
  const price = Number($("v_price").value);
  const weight = $("v_weight").value;
  if (!label) { say("variantMsg", "Enter a size name.", true); return; }
  if ($("v_price").value === "" || !isFinite(price) || price < 0) { say("variantMsg", "Enter a valid price.", true); return; }
  const btn = $("vAdd");
  btn.disabled = true;
  try {
    const stock = parseStock($("v_stock").value);
    let imageUrl = null;
    const file = $("v_img").files[0];
    if (file) imageUrl = await uploadImage(file, "variants");
    const cnt = await db.from("product_variants").select("id", { count: "exact", head: true }).eq("product_id", PRODUCT.id);
    const { error } = await db.from("product_variants").insert({
      product_id: PRODUCT.id, label: label,
      weight_g: weight === "" ? null : Number(weight),
      price: price, stock: stock, available: stock !== 0,
      image_url: imageUrl, sort_order: (cnt.count || 0) + 1
    });
    if (error) throw new Error(error.message);
    $("v_label").value = ""; $("v_weight").value = ""; $("v_price").value = "";
    $("v_stock").value = ""; $("v_img").value = "";
    say("variantMsg", "Size added.");
    loadVariants();
  } catch (err) {
    say("variantMsg", "Could not add: " + err.message, true);
  }
  btn.disabled = false;
});

/* ====== سیٹنگز ====== */
async function loadSettings() {
  const { data, error } = await db.from("settings").select("key,value");
  if (error) { say("settingsMsg", "Could not load settings.", true); return; }
  const m = {};
  (data || []).forEach((r) => { m[r.key] = r.value; });
  $("s_ship").value = m.shipping_fee || "0";
  $("s_cur").value = m.currency || "";
  $("s_wa").value = m.whatsapp_number || "";
  $("s_mail").value = m.business_email || "";
}

$("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ship = Number($("s_ship").value);
  if (!isFinite(ship) || ship < 0) { say("settingsMsg", "Enter a valid shipping fee.", true); return; }
  const rows = [
    { key: "shipping_fee", value: String(ship) },
    { key: "currency", value: $("s_cur").value.trim() },
    { key: "whatsapp_number", value: $("s_wa").value.trim() },
    { key: "business_email", value: $("s_mail").value.trim() }
  ];
  const { error } = await db.from("settings").upsert(rows, { onConflict: "key" });
  say("settingsMsg", error ? "Save failed: " + error.message : "Saved.", !!error);
});

/* ====== ادائیگی کے طریقے ====== */
async function loadPayments() {
  const { data, error } = await db.from("settings").select("key,value").in("key", PAYKEYS);
  if (error) { say("payMsg", "Could not load payment settings.", true); return; }
  const m = {};
  (data || []).forEach((r) => { m[r.key] = r.value; });
  PAYKEYS.forEach((k) => { if (m[k] != null) $(k).value = m[k]; });
}

$("payForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  for (const m of ["jazzcash", "easypaisa"]) {
    if ($("pay_" + m + "_on").value === "true" && !$("pay_" + m + "_no").value.trim()) {
      say("payMsg", "Enter the account number for " + m + " or turn it off.", true); return;
    }
  }
  if ($("pay_bank_on").value === "true" && !$("pay_bank_details").value.trim()) {
    say("payMsg", "Enter bank details or turn it off.", true); return;
  }
  const rows = PAYKEYS.map((k) => ({ key: k, value: String($(k).value || "").trim() }));
  const { error } = await db.from("settings").upsert(rows, { onConflict: "key" });
  say("payMsg", error ? "Save failed: " + error.message : "Saved.", !!error);
});

/* ====== ریلز ====== */
async function loadReels() {
  const { data, error } = await db.from("reels").select("*").order("sort_order").order("created_at");
  if (error) { say("reelMsg", "Could not load reels.", true); return; }
  $("reelRows").innerHTML = (data || []).map((r) =>
    '<tr data-id="' + esc(r.id) + '">' +
    '<td><video src="' + esc(r.video_url) + '#t=0.1" muted playsinline preload="metadata" style="width:70px;border-radius:8px"></video></td>' +
    '<td><input class="r-title" value="' + esc(r.title || "") + '" maxlength="80" style="min-width:120px"></td>' +
    '<td><input class="r-order" type="number" value="' + esc(r.sort_order) + '" style="min-width:70px"></td>' +
    '<td><select class="r-active"><option value="true"' + (r.is_active ? " selected" : "") + '>Shown</option>' +
    '<option value="false"' + (!r.is_active ? " selected" : "") + '>Hidden</option></select></td>' +
    '<td style="white-space:nowrap"><button class="btn" data-rsave="' + esc(r.id) + '">Save</button> ' +
    '<button class="btn ghost" data-rdel="' + esc(r.id) + '" data-url="' + esc(r.video_url) + '">Delete</button></td></tr>'
  ).join("") || '<tr><td colspan="5">No reels yet.</td></tr>';
}

$("reelForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = $("r_video").files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { say("reelMsg", "Video must be under 10 MB.", true); return; }
  const btn = $("reelBtn");
  btn.disabled = true;
  say("reelMsg", "Uploading… please wait.");
  const ext = file.type === "video/webm" ? "webm" : "mp4";
  const path = "reels/" + Date.now() + "." + ext;
  const up = await db.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) { say("reelMsg", "Upload failed: " + up.error.message, true); btn.disabled = false; return; }
  const url = db.storage.from("media").getPublicUrl(path).data.publicUrl;
  const cnt = await db.from("reels").select("id", { count: "exact", head: true });
  const ins = await db.from("reels").insert({
    title: $("r_title").value.trim() || null,
    video_url: url,
    sort_order: (cnt.count || 0) + 1
  });
  btn.disabled = false;
  if (ins.error) { say("reelMsg", "Saved video but could not add reel: " + ins.error.message, true); return; }
  $("reelForm").reset();
  say("reelMsg", "Reel uploaded.");
  loadReels();
});

$("reelRows").addEventListener("click", async (e) => {
  const s = e.target.closest("button[data-rsave]");
  const d = e.target.closest("button[data-rdel]");
  if (s) {
    const tr = s.closest("tr");
    const { error } = await db.from("reels").update({
      title: tr.querySelector(".r-title").value.trim() || null,
      sort_order: Number(tr.querySelector(".r-order").value) || 0,
      is_active: tr.querySelector(".r-active").value === "true"
    }).eq("id", s.dataset.rsave);
    say("reelMsg", error ? "Save failed: " + error.message : "Saved.", !!error);
  }
  if (d) {
    if (!confirm("Delete this reel permanently?")) return;
    const { error } = await db.from("reels").delete().eq("id", d.dataset.rdel);
    if (error) { say("reelMsg", "Delete failed: " + error.message, true); return; }
    const p = (d.dataset.url.split("/media/")[1] || "").split("?")[0];
    if (p) await db.storage.from("media").remove([p]);
    say("reelMsg", "Deleted.");
    loadReels();
  }
});

/* ====== آرڈرز ====== */
function waPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = "92" + d.slice(1);
  return d;
}

async function loadOrders() {
  const { data, error } = await db.from("orders").select("*, order_items(*)")
    .order("created_at", { ascending: false }).limit(200);
  if (error) { say("orderMsg", "Could not load orders.", true); return; }
  const f = $("orderFilter").value;
  const rows = (data || []).filter((o) => !f || o.status === f);
  $("ordersBody").innerHTML = rows.map((o) => {
    const items = (o.order_items || []).map((i) =>
      esc(i.product_name) + " " + esc(i.variant_label) + " × " + esc(i.qty) + " = " + esc(money(i.unit_price * i.qty))
    ).join("<br>");
    const opts = STATUSES.map((s) => "<option" + (s === o.status ? " selected" : "") + ">" + s + "</option>").join("");
    const popts = PAYSTAT.map((s) => "<option" + (s === o.payment_status ? " selected" : "") + ">" + s + "</option>").join("");
    const mname = METHOD_NAME[o.payment_method] || o.payment_method;
    return "<tr>" +
      "<td><strong>" + esc(o.order_no) + "</strong><br><small>" + esc(new Date(o.created_at).toLocaleString()) + "</small></td>" +
      "<td>" + esc(o.customer_name) + "<br><small>" + esc(o.phone) + "</small></td>" +
      "<td>" + esc(o.city || "") + "</td>" +
      "<td>" + esc(money(o.total)) + "<br><small>" + esc(mname) + " · " + esc(o.payment_status) + "</small></td>" +
      '<td><select class="o-status" data-oid="' + esc(o.id) + '">' + opts + "</select></td>" +
      '<td><button class="btn ghost" data-oview="1">Details</button></td></tr>' +
      '<tr class="hidden"><td colspan="6">' +
      "<p><strong>Address:</strong> " + esc(o.address) + ", " + esc(o.city || "") + ", " + esc(o.country || "") + "</p>" +
      "<p><strong>Items:</strong><br>" + items + "</p>" +
      "<p>Subtotal " + esc(money(o.subtotal)) + " · Shipping " + esc(money(o.shipping)) + " · <strong>Total " + esc(money(o.total)) + "</strong></p>" +
      "<p><strong>Payment:</strong> " + esc(mname) + (o.payment_ref ? " · Ref/ID: <strong>" + esc(o.payment_ref) + "</strong>" : "") + "</p>" +
      '<label>Payment status</label><select class="o-pay" data-oid="' + esc(o.id) + '" style="max-width:260px">' + popts + "</select>" +
      (o.email ? "<p><strong>Email:</strong> " + esc(o.email) + "</p>" : "") +
      (o.notes ? "<p><strong>Notes:</strong> " + esc(o.notes) + "</p>" : "") +
      '<p style="margin-top:12px"><a class="btn" style="display:inline-block;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/' +
      esc(waPhone(o.phone)) + "?text=" + encodeURIComponent("Hello " + o.customer_name + ", about your order " + o.order_no) +
      '">WhatsApp customer</a></p></td></tr>';
  }).join("") || '<tr><td colspan="6">No orders.</td></tr>';
}

$("orderFilter").addEventListener("change", loadOrders);

$("ordersBody").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-oview]");
  if (!b) return;
  b.closest("tr").nextElementSibling.classList.toggle("hidden");
});

$("ordersBody").addEventListener("change", async (e) => {
  const s = e.target.closest("select.o-status");
  const p = e.target.closest("select.o-pay");
  if (s) {
    s.disabled = true;
    const { error } = await db.from("orders").update({ status: s.value }).eq("id", s.dataset.oid);
    s.disabled = false;
    say("orderMsg", error ? "Status update failed: " + error.message : "Status updated.", !!error);
    if (!error) { loadOverview(); if (PRODUCT) loadVariants(); }
  }
  if (p) {
    p.disabled = true;
    const { error } = await db.from("orders").update({ payment_status: p.value }).eq("id", p.dataset.oid);
    p.disabled = false;
    say("orderMsg", error ? "Payment update failed: " + error.message : "Payment status updated.", !!error);
  }
});

/* ====== سوالات ====== */
async function loadInquiries() {
  const { data, error } = await db.from("inquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (error) { say("inqMsg", "Could not load inquiries.", true); return; }
  $("inqBody").innerHTML = (data || []).map((q) =>
    "<tr><td>" + esc(new Date(q.created_at).toLocaleString()) + "</td>" +
    "<td>" + esc(q.name) + (q.phone ? "<br><small>" + esc(q.phone) + "</small>" : "") + "</td>" +
    '<td style="min-width:200px;white-space:pre-wrap">' + esc(q.message) + "</td>" +
    '<td><select class="q-status" data-qid="' + esc(q.id) + '">' +
    ["New", "Done"].map((s) => "<option" + (s === q.status ? " selected" : "") + ">" + s + "</option>").join("") + "</select></td>" +
    "<td>" + (q.phone ? '<a class="btn ghost" style="text-decoration:none;display:inline-block" target="_blank" rel="noopener" href="https://wa.me/' +
      esc(waPhone(q.phone)) + '">WhatsApp</a>' : "") + "</td></tr>"
  ).join("") || '<tr><td colspan="5">No inquiries.</td></tr>';
}

$("inqBody").addEventListener("change", async (e) => {
  const s = e.target.closest("select.q-status");
  if (!s) return;
  const { error } = await db.from("inquiries").update({ status: s.value }).eq("id", s.dataset.qid);
  say("inqMsg", error ? "Update failed: " + error.message : "Updated.", !!error);
  if (!error) loadOverview();
});

db.auth.onAuthStateChange((evt) => {  clearInterval(orderTimer); orderTimer = null; lastOrderCount = null;
  if (evt === "SIGNED_OUT") { loadedOnce = false; show("login"); }
});
checkAdmin();