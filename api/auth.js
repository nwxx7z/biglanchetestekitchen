const crypto = require("crypto");
const {
  cors,
  send,
  KITCHEN_PASSWORD,
  setSessionCookie,
  clearSessionCookie,
  isValidSession
} = require("./_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return send(res, isValidSession(req) ? 200 : 401, {
      ok: isValidSession(req)
    });
  }

  if (req.method === "POST") {
    let body = req.body || {};
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    if (!KITCHEN_PASSWORD) {
      return send(res, 503, { error: "Autenticação não configurada" });
    }
    const password = String(body.password || "");
    const supplied = Buffer.from(password);
    const expected = Buffer.from(KITCHEN_PASSWORD);
    const valid = supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
    if (!valid) {
      return send(res, 401, { error: "Senha incorreta" });
    }

    setSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  if (req.method === "DELETE") {
    clearSessionCookie(res);
    return send(res, 200, { ok: true });
  }

  return send(res, 405, { error: "Método não permitido" });
};
