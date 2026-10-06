const crypto = require("crypto");
const { getSql, cors, send } = require("../_lib");

function validToken(req) {
  const configured = String(process.env.PRINTER_AGENT_TOKEN || "");
  const header = String(req.headers?.authorization || "");
  const supplied = header.replace(/^Bearer\s+/i, "").trim();
  if (!configured || !supplied) return false;
  const a = Buffer.from(supplied), b = Buffer.from(configured);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!validToken(req)) return send(res, 401, { error: "Agente não autorizado" });
  try {
    const sql = getSql();
    await sql`CREATE TABLE IF NOT EXISTS printer_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      auto_print BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_requested BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`INSERT INTO printer_settings (id, auto_print)
      VALUES (1, TRUE) ON CONFLICT (id) DO NOTHING`;
    const settings = await sql`SELECT auto_print AS "autoPrint" FROM printer_settings WHERE id=1`;
    if (!settings[0]?.autoPrint) return send(res, 200, { enabled:false, orders:[] });
    const orders = await sql`SELECT id,number,status,printed,created_at AS "createdAt",
      cart,delivery,payment,notes,total FROM orders
      WHERE printed=FALSE AND (SELECT auto_print FROM printer_settings WHERE id=1) = TRUE OR (printed=FALSE AND print_requested=TRUE) ORDER BY created_at ASC LIMIT 20`;
    return send(res, 200, { enabled:true, orders });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error:"Erro interno", detail:error.message });
  }
};
