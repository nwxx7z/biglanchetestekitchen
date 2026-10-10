const crypto = require("crypto");
const catalog = require("./order-catalog.json");

const normalizeKey = value => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

const itemByName = new Map(catalog.items.map(item => [normalizeKey(item.name), item]));
const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function parseAddons(text, group) {
  if (!text) return { total: 0, items: [] };
  if (!group || !catalog.addons[group]) throw new Error("Adicionais não permitidos para este item.");

  const allowed = new Map(catalog.addons[group].map(([name, price]) => [normalizeKey(name), Number(price)]));
  const parts = text.split(/,\s*|\s+e\s+(?=\d+\s*x\s+)/i).map(part => part.trim()).filter(Boolean);
  if (!parts.length) throw new Error("Lista de adicionais inválida.");

  let total = 0;
  const items = [];
  for (const part of parts) {
    const match = part.match(/^(\d{1,2})\s*x\s+(.+)$/i);
    if (!match) throw new Error("Formato de adicional inválido.");
    const quantity = Number(match[1]);
    const name = match[2].trim();
    const price = allowed.get(normalizeKey(name));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 30 || price === undefined) {
      throw new Error("Adicional inválido.");
    }
    total += price * quantity;
    items.push({ name, quantity, price });
  }
  return { total: roundMoney(total), items };
}

function priceOrder(input) {
  if (!input || !Array.isArray(input.cart) || input.cart.length < 1 || input.cart.length > 50) {
    throw new Error("Pedido vazio ou com quantidade de itens inválida.");
  }

  const cart = [];
  let subtotal = 0;

  for (const raw of input.cart) {
    const suppliedName = String(raw?.name || "").trim().slice(0, 400);
    if (!suppliedName) throw new Error("Item sem nome.");

    const addonMatch = suppliedName.match(/\s+\(adicionais? de (.+)\)$/i);
    const addonText = addonMatch ? addonMatch[1] : "";
    let baseAndFlavor = addonMatch ? suppliedName.slice(0, addonMatch.index).trim() : suppliedName;
    const flavorMatch = baseAndFlavor.match(/\s+\(sabor:\s*([^)]+)\)$/i);
    const flavor = flavorMatch ? flavorMatch[1].trim() : "";
    const baseName = flavorMatch ? baseAndFlavor.slice(0, flavorMatch.index).trim() : baseAndFlavor;
    const item = itemByName.get(normalizeKey(baseName));
    if (!item) throw new Error("Um dos itens não existe no cardápio.");

    if (flavor) {
      if (item.kind === "suco" && !catalog.juiceFlavors.some(x => normalizeKey(x) === normalizeKey(flavor))) {
        throw new Error("Sabor de suco inválido.");
      }
      if (item.kind === "milkshake" && !catalog.milkshakeFlavors.some(x => normalizeKey(x) === normalizeKey(flavor))) {
        throw new Error("Sabor de milkshake inválido.");
      }
      if (item.kind !== "suco" && item.kind !== "milkshake") {
        throw new Error("Este item não aceita seleção de sabor.");
      }
    }

    const quantity = Number(raw.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw new Error("Quantidade inválida.");
    }

    const additions = parseAddons(addonText, item.addonGroup);
    const unitPrice = roundMoney(item.price + additions.total);
    subtotal += unitPrice * quantity;
    cart.push({
      name: suppliedName,
      quantity,
      price: unitPrice,
      note: String(raw.note || "").slice(0, 300),
      additions: []
    });
  }

  const deliveryInput = input.delivery || {};
  const city = String(deliveryInput.city || "").trim().slice(0, 120);
  const locality = String(deliveryInput.locality || "").trim().slice(0, 120);
  const address = String(deliveryInput.address || "").trim().slice(0, 500);
  const cityBase = city.split(" · ")[0].trim();
  const saoBentoFees = new Map([
    ["Rua da pista", 3],
    ["Rua da praia", 3],
    ["Rua de trás", 3],
    ["Concórdia", 4],
    ["Depois da rua da discoteca", 4],
    ["Pousada", 4],
    ["ALTO DO CUSCUZ", 4],
    ["Depois do loteamento do jura", 5],
    ["Maruim", 5],
    ["Sítio passagem", 6]
  ]);

  let deliveryFee;
  if (cityBase === "Retirada no local") {
    deliveryFee = 0;
  } else if (cityBase === "São Bento") {
    if (!locality || !saoBentoFees.has(locality) || (city.includes(" · ") && city !== `São Bento · ${locality}`)) {
      throw new Error("Selecione um local de entrega válido em São Bento.");
    }
    deliveryFee = saoBentoFees.get(locality);
  } else {
    const fixedFees = new Map([
      ["Maragogi", 10],
      ["Japaratinga", 10],
      ["Bairro Salgado depois do resort", 5]
    ]);
    if (!fixedFees.has(cityBase) || city !== cityBase) throw new Error("Cidade de entrega inválida.");
    deliveryFee = fixedFees.get(cityBase);
  }

  if (cityBase !== "Retirada no local" && !address) {
    throw new Error("Informe o endereço de entrega.");
  }

  const payment = String(input.payment || "").trim();
  if (!["Pix", "Dinheiro", "Cartão na entrega"].includes(payment)) {
    throw new Error("Forma de pagamento inválida.");
  }

  const total = roundMoney(subtotal + deliveryFee);
  return {
    cart,
    delivery: { city, locality, fee: deliveryFee, address },
    payment,
    notes: String(input.notes || "").slice(0, 1000),
    total
  };
}

async function checkOrderRateLimit(sql, req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || String(req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "unknown");
  const pepper = String(process.env.KITCHEN_PASSWORD || process.env.PRINTER_AGENT_TOKEN || "biglanche-rate-limit");
  const ipHash = crypto.createHmac("sha256", pepper).update(ip).digest("hex");
  const bucket = Math.floor(Date.now() / (5 * 60 * 1000));

  await sql`
    CREATE TABLE IF NOT EXISTS order_rate_limits (
      ip_hash TEXT PRIMARY KEY,
      bucket BIGINT NOT NULL,
      hits INTEGER NOT NULL
    )
  `;

  const rows = await sql`
    INSERT INTO order_rate_limits (ip_hash, bucket, hits)
    VALUES (${ipHash}, ${bucket}, 1)
    ON CONFLICT (ip_hash) DO UPDATE
    SET bucket = EXCLUDED.bucket,
        hits = CASE
          WHEN order_rate_limits.bucket = EXCLUDED.bucket THEN order_rate_limits.hits + 1
          ELSE 1
        END
    RETURNING hits
  `;

  return Number(rows[0]?.hits || 0) <= 8;
}

module.exports = { priceOrder, checkOrderRateLimit };
