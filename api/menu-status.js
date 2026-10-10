const { getSql, cors, send, requireKitchenAuth } = require("./_lib");

const CATALOG = [
  "SPAS12",
  "AUG",
  "PARAFAL",
  "SKS",
  "LANÇA GRANADAS",
  "SVD",
  "K98",
  "VECTOR",
  "THOMPSON",
  "CARAPINA",
  "MAG-7",
  "MAC-10",
  "BIZON",
  "G-36 (CAMARÃO)",
  "AN-94 (CHARQUE)",
  "M500 (COSTELA)",
  "BIG LANCHE",
  "MP5",
  "UMP",
  "VSS",
  "SCAR",
  "XM8",
  "P90",
  "AK-47",
  "M4A1",
  "AWM",
  "MP40",
  "FAMAS",
  "M60",
  "Cachorro quente de carne",
  "Cachorro quente de frango",
  "Cachorro quente misto",
  "Combo petiscos",
  "Combo hambúrguer",
  "Combo 03",
  "Batatas fritas 250g",
  "Batata gourmet de calabresa",
  "Batata gourmet de strogonoff",
  "Batata gourmet de carne de sol",
  "Filé com fritas",
  "Espetinho de carne",
  "Espetinho de frango",
  "Coca cola Júnior",
  "Água mineral sem gás 500ml",
  "Água mineral com gás 500ml",
  "Guaraná júnior",
  "Guaraná 1 litro",
  "Coca cola 1 Litro",
  "Coca cola 1 litro zero",
  "Pepsi 1L",
  "Guaraná 2 litros",
  "Coca cola 2 litros",
  "Guaraná lata",
  "Guaraná lata zero",
  "Coca lata",
  "Coca lata zero",
  "Fanta uva lata",
  "Soda lata",
  "Pepsi lata",
  "Suco sem leite 500ml",
  "H2O",
  "Suco com leite 500ml",
  "Suco de laranja natural 500ml",
  "Vitamina de açaí",
  "Vitamina de guaraná",
  "Milkshake",
  "Red Bull 250ml",
  "Monster 473ml",
  "Sukita",
  "Spaten long neck",
  "Stella long neck",
  "Budweiser long neck",
  "Corona long neck",
  "Spaten lata",
  "Stella lata",
  "Budweiser lata",
  "Pudim",
  "Bolo com recheio",
  "Bolo só com cobertura",
  "Mousse",
  "Tortilete",
  "Empada (frango com catupiry)",
  "Tapioca de carne de sol com queijo",
  "Tapioca de camarão",
  "Tapioca de frango com queijo",
  "Tapioca de presunto e queijo",
  "Tapioca de muçarela",
  "Tapioca de queijo coalho",
  "Tapioca de coco",
  "Tapioca de coco e queijo",
  "Tapioca de coco com leite condensado",
  "Tapioca romeu e julieta",
  "Tapioca de Nutella",
  "Tapioca de banana com queijo",
  "Mini pizza de muçarela",
  "Mini pizza de calabresa",
  "Mini pizza de frango com catupiry",
  "Mini pizza de carne de sol",
  "Mini pizza 3 queijos",
  "Mini pizza mista",
  "Pastel de queijo",
  "Pastel misto completo",
  "Pastel de frango completo",
  "Pastel de carne de sol completo",
  "Pastel de carne moída completo",
  "Pastel de frango com carne moída completo",
  "Pastel de pizza",
  "Pastel de carne moída com carne de sol completo",
  "Pastel de frango com carne de sol completo",
  "Pastel de camarão completo",
  "Pastel de Nutella",
  "Pastel mistão"
];

function cleanMap(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const name of CATALOG) {
    if (source[name] === false) out[name] = false;
  }
  return out;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const sql = getSql();

    await sql`
      ALTER TABLE store_settings
      ADD COLUMN IF NOT EXISTS menu_availability JSONB NOT NULL DEFAULT '{}'::jsonb
    `;

    if (req.method === "GET") {
      const rows = await sql`
        SELECT menu_availability AS "menuAvailability"
        FROM store_settings
        WHERE id = 1
        LIMIT 1
      `;
      return send(res, 200, {
        catalog: CATALOG,
        unavailable: cleanMap(rows[0]?.menuAvailability)
      });
    }

    if (req.method !== "PATCH") {
      return send(res, 405, { error: "Método não permitido" });
    }

    if (!requireKitchenAuth(req, res)) return;

    const name = String(req.body?.name || "").trim();
    const available = req.body?.available !== false;

    if (!CATALOG.includes(name)) {
      return send(res, 400, { error: "Item inválido" });
    }

    const rows = await sql`
      SELECT menu_availability AS "menuAvailability"
      FROM store_settings
      WHERE id = 1
      LIMIT 1
    `;
    const current = cleanMap(rows[0]?.menuAvailability);
    if (available) delete current[name];
    else current[name] = false;

    await sql`
      INSERT INTO store_settings (id, mode, menu_availability, updated_at)
      VALUES (1, 'auto', ${JSON.stringify(current)}::jsonb, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        menu_availability = EXCLUDED.menu_availability,
        updated_at = NOW()
    `;

    return send(res, 200, { unavailable: current });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: "Erro interno", detail: error.message });
  }
};
