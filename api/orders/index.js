const { getSql, cors, send, normalize, makeId, requireKitchenAuth } = require("../_lib");

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const sql = getSql();

    if (req.method === "GET") {
      if (!requireKitchenAuth(req, res)) return;
      const rows = await sql`
        SELECT
          id,
          number,
          status,
          printed,
          created_at AS "createdAt",
          cart,
          delivery,
          payment,
          notes,
          total
        FROM orders
        ORDER BY created_at DESC
        LIMIT 100
      `;
      return send(res, 200, rows);
    }

    if (req.method === "POST") {
      const data = normalize(req.body || {});
      if (!data.cart.length) return send(res, 400, { error: "Pedido vazio" });

      const numberRows = await sql`SELECT COALESCE(MAX(number), 1000) + 1 AS next_number FROM orders`;
      const number = Number(numberRows[0].next_number);
      const id = makeId();

      const rows = await sql`
        INSERT INTO orders (id, number, status, printed, cart, delivery, payment, notes, total)
        VALUES (
          ${id}, ${number}, 'new', false,
          ${JSON.stringify(data.cart)}::jsonb,
          ${JSON.stringify(data.delivery)}::jsonb,
          ${data.payment}, ${data.notes}, ${data.total}
        )
        RETURNING
          id, number, status, printed,
          created_at AS "createdAt",
          cart, delivery, payment, notes, total
      `;
      return send(res, 201, rows[0]);
    }

    return send(res, 405, { error: "Método não permitido" });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "Erro interno", detail: error.message });
  }
};
