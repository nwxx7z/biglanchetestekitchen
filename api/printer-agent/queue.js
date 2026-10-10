const { getSql, cors, send, requireKitchenAuth } = require("../_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { error: "Método não permitido" });
  if (!requireKitchenAuth(req, res)) return;
  try {
    const id = String(req.body?.id || "").slice(0, 120);
    if (!id) return send(res, 400, { error: "ID do pedido obrigatório" });
    const sql = getSql();
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_requested BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_by TEXT`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_until TIMESTAMPTZ`;
    const rows = await sql`
      UPDATE orders
      SET printed = FALSE,
          print_requested = TRUE,
          print_claimed_by = NULL,
          print_claimed_until = NULL
      WHERE id = ${id}
      RETURNING id, number, printed
    `;
    if (!rows.length) return send(res, 404, { error: "Pedido não encontrado" });
    return send(res, 200, { queued: true, order: rows[0] });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "Erro interno" });
  }
};
