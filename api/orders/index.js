const { getSql, cors, send, requireKitchenAuth } = require("../_lib");
const {
  products: PRODUCTS,
  PRODUCTS_BY_NAME,
  addons: ADDONS,
  deliveryFees: DELIVERY_FEES,
  deliveryLocalFees: DELIVERY_LOCAL_FEES,
  juiceFlavors: JUICE_FLAVORS,
  milkshakeFlavors: MILKSHAKE_FLAVORS
} = require("../_catalog");
const crypto = require("crypto");

// Limite por IP por instância (sem criar tabela nova no Neon).
// A contagem de pedidos persistidos abaixo também aplica um teto global por minuto.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_PER_WINDOW = 8;
const recentByIp = new Map();

function brasiliaMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === "hour")?.value || 0);
  const m = Number(parts.find(p => p.type === "minute")?.value || 0);
  return h * 60 + m;
}

function automaticOpen() {
  const now = brasiliaMinutes();
  return now >= (17 * 60 + 30) && now <= (23 * 60 + 45);
}

function clientKey(req) {
  const ip = String(req.headers?.["x-real-ip"] || req.headers?.["x-forwarded-for"] || "unknown")
    .split(",")[0].trim().slice(0, 100);
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function checkRateLimit(req) {
  const now = Date.now();
  if (recentByIp.size > 5000) {
    for (const [key, times] of recentByIp) {
      const fresh = times.filter(t => now - t < RATE_WINDOW_MS);
      if (fresh.length) recentByIp.set(key, fresh);
      else recentByIp.delete(key);
    }
  }
  const key = clientKey(req);
  const times = (recentByIp.get(key) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_LIMIT_PER_WINDOW) return false;
  times.push(now);
  recentByIp.set(key, times);
  return true;
}

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function parseLegacyAddons(name) {
  const match = String(name || "").match(/\\s\\(adicionais? de (.+)\\)$/i);
  if (!match) return [];
  const text = match[1];
  const parts = [];
  const re = /(\\d+)\\s*x\\s+(.+?)(?=,\\s*\\d+\\s*x\\s+|\\s+e\\s+\\d+\\s*x\\s+|$)/giu;
  let item;
  while ((item = re.exec(text)) !== null) {
    parts.push({ name: item[2].trim(), quantity: Number(item[1]) });
  }
  return parts;
}

function findProduct(item) {
  const id = String(item?.productId || "").trim();
  if (id && PRODUCTS[id]) return { product: PRODUCTS[id], id, legacyName: "" };

  // Compatibilidade com páginas antigas ainda abertas em cache.
  const submittedName = String(item?.name || "").trim();
  const found = PRODUCTS_BY_NAME.find(p =>
    submittedName === p.name || submittedName.startsWith(p.name + " (")
  );
  if (!found) throw badRequest("Um item do pedido não foi reconhecido. Atualize o cardápio e tente novamente.");
  return { product: found, id: found.id, legacyName: submittedName };
}

function normalizeAddons(item, product, legacyName) {
  const submitted = Array.isArray(item?.additions) && item.additions.length
    ? item.additions
    : parseLegacyAddons(legacyName);
  if (!submitted.length) return [];
  if (!product.addonGroup || !ADDONS[product.addonGroup]) {
    throw badRequest("Um adicional não é válido para este item. Atualize o cardápio e tente novamente.");
  }
  if (submitted.length > 30) throw badRequest("Quantidade de adicionais inválida.");
  return submitted.map(addon => {
    const rawName = String(addon?.name || "").trim();
    const canonicalName = Object.keys(ADDONS[product.addonGroup]).find(
      name => name.toLocaleLowerCase("pt-BR") === rawName.toLocaleLowerCase("pt-BR")
    );
    const quantity = Number(addon?.quantity ?? addon?.qty ?? 1);
    if (!canonicalName || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw badRequest("Um adicional do pedido não é válido. Atualize o cardápio e tente novamente.");
    }
    return {
      name: canonicalName,
      quantity,
      price: Number(ADDONS[product.addonGroup][canonicalName].price)
    };
  });
}

function formatJoin(parts) {
  if (parts.length < 2) return parts.join("");
  return parts.slice(0, -1).join(", ") + " e " + parts[parts.length - 1];
}

function normalizeAndPriceOrder(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("Dados do pedido inválidos.");
  }
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 32768) {
    throw badRequest("Pedido muito grande. Reduza as observações e tente novamente.", 413);
  }
  if (!Array.isArray(body.cart) || body.cart.length < 1 || body.cart.length > 50) {
    throw badRequest("Pedido vazio ou com itens demais.");
  }

  let totalCents = 0;
  const cart = body.cart.map(item => {
    const { product, legacyName } = findProduct(item);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      throw badRequest("Quantidade inválida no pedido.");
    }

    let flavor = String(item?.flavor || "").trim();
    if (product.kind === "suco") {
      if (!JUICE_FLAVORS.includes(flavor)) {
        // Compatibilidade com pedidos antigos cujo sabor só estava no nome.
        const legacyFlavor = legacyName.match(/\\(sabor:\\s*([^)]+)\\)/i)?.[1]?.trim() || "";
        flavor = legacyFlavor;
      }
      if (!JUICE_FLAVORS.includes(flavor)) throw badRequest("Escolha um sabor válido para o suco.");
    } else if (product.kind === "milkshake") {
      if (!MILKSHAKE_FLAVORS.includes(flavor)) {
        const legacyFlavor = legacyName.match(/\\(sabor:\\s*([^)]+)\\)/i)?.[1]?.trim() || "";
        flavor = legacyFlavor;
      }
      if (!MILKSHAKE_FLAVORS.includes(flavor)) throw badRequest("Escolha um sabor válido para o milk-shake.");
    } else if (flavor) {
      throw badRequest("Sabor inválido para um dos itens.");
    }

    const additions = normalizeAddons(item, product, legacyName);
    const baseCents = Math.round(Number(product.price) * 100);
    const addonsCents = additions.reduce((sum, addon) => sum + Math.round(addon.price * 100) * addon.quantity, 0);
    totalCents += (baseCents + addonsCents) * quantity;

    const flavorSuffix = flavor ? ` (sabor: ${flavor})` : "";
    const additionsSuffix = additions.length
      ? ` (adicional${additions.length > 1 ? "es" : ""} de ${formatJoin(additions.map(a => `${a.quantity}x ${a.name.toLowerCase()}`))})`
      : "";
    const note = String(item?.note || "").trim();
    if (note.length > 300) throw badRequest("Uma observação do item ultrapassou o limite permitido.");
    return {
      name: product.name + flavorSuffix + additionsSuffix,
      quantity,
      price: Number(product.price),
      note,
      // O nome já inclui os adicionais, como antes; manter a lista vazia evita duplicá-los na cozinha/recibo.
      additions: []
    };
  });

  const rawDelivery = body.delivery && typeof body.delivery === "object" ? body.delivery : {};
  let city = String(rawDelivery.city || "").trim();
  let locality = String(rawDelivery.locality || "").trim();

  if (city.startsWith("São Bento · ")) {
    const cityLocality = city.slice("São Bento · ".length).trim();
    if (locality && locality !== cityLocality) throw badRequest("O local de entrega não confere.");
    locality = cityLocality;
    city = "São Bento";
  }

  let deliveryFee = 0;
  let displayCity = city;
  if (city === "São Bento") {
    if (!locality || !Object.prototype.hasOwnProperty.call(DELIVERY_LOCAL_FEES, locality)) {
      throw badRequest("Selecione um local válido de entrega em São Bento.");
    }
    deliveryFee = Number(DELIVERY_LOCAL_FEES[locality]);
    displayCity = "São Bento · " + locality;
  } else if (Object.prototype.hasOwnProperty.call(DELIVERY_FEES, city)) {
    deliveryFee = Number(DELIVERY_FEES[city]);
    if (locality) throw badRequest("O local informado não corresponde à cidade selecionada.");
  } else {
    throw badRequest("Selecione uma cidade de entrega válida.");
  }

  const address = String(rawDelivery.address || "").trim();
  if (address.length > 500) throw badRequest("O endereço é muito longo.");
  if (city !== "Retirada no local" && !address) {
    throw badRequest("Informe o endereço de entrega.");
  }

  const payment = String(body.payment || "").trim();
  const validPayment = payment === "Pix" || payment === "Cartão na entrega" ||
    /^Dinheiro(?: · (?:Sem troco|Troco solicitado|Troco para R\\s?\$[\\s\\u00a0]?[0-9.,]+))?$/u.test(payment);
  if (!validPayment) throw badRequest("Selecione uma forma de pagamento válida.");

  totalCents += Math.round(deliveryFee * 100);
  const clientTotal = Number(body.total);
  if (!Number.isFinite(clientTotal) || clientTotal < 0 ||
      Math.round(clientTotal * 100) !== totalCents) {
    throw badRequest("O valor do pedido foi atualizado. Atualize o cardápio e confira o carrinho antes de enviar.", 409);
  }

  return {
    cart,
    delivery: { city: displayCity, fee: deliveryFee, address },
    payment: payment.slice(0, 80),
    notes: String(body.notes || "").trim().slice(0, 1000),
    total: totalCents / 100
  };
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      if (!requireKitchenAuth(req, res)) return;
      const sql = getSql();
      const rows = await sql`
        SELECT id, number, status, printed, created_at AS "createdAt",
               cart, delivery, payment, notes, total
        FROM orders
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return send(res, 200, rows);
    }

    if (req.method === "DELETE") {
      if (!requireKitchenAuth(req, res)) return;
      const status = String(req.query?.status || "").toLowerCase();
      if (status !== "ready") {
        return send(res, 400, { error: "A exclusão em lote só permite status ready" });
      }
      const sql = getSql();
      const rows = await sql`
        DELETE FROM orders WHERE status = 'ready' RETURNING id
      `;
      return send(res, 200, { ok: true, deleted: rows.length });
    }

    if (req.method !== "POST") {
      return send(res, 405, { error: "Método não permitido" });
    }

    if (!checkRateLimit(req)) {
      res.setHeader("Retry-After", "600");
      return send(res, 429, { error: "Muitos pedidos enviados deste endereço. Aguarde alguns minutos e tente novamente." });
    }

    const data = normalizeAndPriceOrder(req.body || {});
    const sql = getSql();

    const settingsRows = await sql`
      SELECT mode FROM store_settings WHERE id = 1 LIMIT 1
    `;
    const mode = String(settingsRows[0]?.mode || "auto");
    const open = mode === "open" ? true : mode === "closed" ? false : automaticOpen();
    if (!open) {
      return send(res, 403, {
        error: "Pedidos encerrados",
        mode,
        schedule: { start: "17:30", end: "23:45", timezone: "America/Sao_Paulo" }
      });
    }

    const volumeRows = await sql`
      SELECT COUNT(*)::int AS count
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '1 minute'
    `;
    if (Number(volumeRows[0]?.count || 0) >= 60) {
      res.setHeader("Retry-After", "60");
      return send(res, 429, { error: "A loja está recebendo muitos pedidos neste momento. Aguarde um minuto e tente novamente." });
    }

    const numberRows = await sql`
      SELECT COALESCE(MAX(number), 1000) + 1 AS next_number FROM orders
    `;
    const number = Number(numberRows[0].next_number);
    const id = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}`;

    const rows = await sql`
      INSERT INTO orders (id, number, status, printed, cart, delivery, payment, notes, total)
      VALUES (
        ${id}, ${number}, 'new', false,
        ${JSON.stringify(data.cart)}::jsonb,
        ${JSON.stringify(data.delivery)}::jsonb,
        ${data.payment}, ${data.notes}, ${data.total}
      )
      RETURNING id, number, status, printed, created_at AS "createdAt",
                cart, delivery, payment, notes, total
    `;
    return send(res, 201, rows[0]);
  } catch (error) {
    if (error?.statusCode) return send(res, error.statusCode, { error: error.message });
    console.error(error);
    return send(res, 500, { error: "Erro interno" });
  }
};
