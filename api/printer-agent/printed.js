const crypto = require("crypto");
const { getSql, cors, send } = require("../_lib");

function validToken(req) {
  const configured = String(process.env.PRINTER_AGENT_TOKEN || "");
  const supplied = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!configured || !supplied) return false;
  const a = Buffer.from(supplied), b = Buffer.from(configured);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Printer-Agent-Id");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!validToken(req)) return send(res, 401, { error: "Agente não autorizado" });
  if (req.method !== "POST") return send(res, 405, { error: "Método não permitido" });

  try {
    const id = String(req.body?.id || "").slice(0, 120);
    const agentId = String(req.body?.agentId || req.headers?.["x-printer-agent-id"] || "").trim().slice(0, 100);
    if (!id || !agentId) return send(res, 400, { error: "ID do pedido e identificação do agente são obrigatórios" });

    const sql = getSql();
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_requested BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_by TEXT`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_until TIMESTAMPTZ`;

    const rows = await sql`
      UPDATE orders
      SET printed = TRUE,
          print_requested = FALSE,
          print_claimed_by = NULL,
          print_claimed_until = NULL
      WHERE id = ${id}
        AND printed = FALSE
        AND print_claimed_by = ${agentId}
      RETURNING id, number, printed
    `;
    if (!rows.length) return send(res, 409, { error: "Reserva não encontrada ou pertence a outra instância; pedido não foi confirmado." });
    return send(res, 200, rows[0]);
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "Erro interno", detail: error.message });
  }
};
