const { neon } = require("@neondatabase/serverless");

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  return neon(url);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function send(res, status, data) {
  cors(res);
  res.status(status).json(data);
}

function normalize(x = {}) {
  if (typeof x === "string") {
    try { x = JSON.parse(x); } catch { x = {}; }
  }
  if (Buffer.isBuffer(x)) {
    try { x = JSON.parse(x.toString("utf8")); } catch { x = {}; }
  }
  if (!x || typeof x !== "object") x = {};
  return {
    cart: (Array.isArray(x.cart) ? x.cart : []).slice(0, 50).map(i => ({
      name: String(i.name || "Item").slice(0, 120),
      quantity: Math.max(1, Math.min(999, Number(i.quantity) || 1)),
      price: Math.max(0, Number(i.price) || 0),
      note: String(i.note || "").slice(0, 300),
      additions: (Array.isArray(i.additions) ? i.additions : []).slice(0, 30).map(a => ({
        name: String(a.name || "").slice(0, 100),
        price: Math.max(0, Number(a.price) || 0),
        quantity: Math.max(1, Math.min(99, Number(a.quantity) || 1))
      }))
    })),
    delivery: {
      city: String(x.delivery?.city || "").slice(0, 80),
      fee: Math.max(0, Number(x.delivery?.fee) || 0),
      address: String(x.delivery?.address || "").slice(0, 500)
    },
    payment: String(x.payment || "").slice(0, 80),
    notes: String(x.notes || "").slice(0, 1000),
    total: Math.max(0, Number(x.total) || 0)
  };
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

module.exports = { getSql, cors, send, normalize, makeId };
