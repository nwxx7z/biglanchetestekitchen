const { getSql, cors, send, requireKitchenAuth } = require("./_lib");

const MODES = new Set(["auto", "open", "closed"]);

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

  return now >= (18 * 60 + 30) &&
         now <= (23 * 60 + 30);
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // Consultar status da loja
    if (req.method === "GET") {
      const sql = getSql();

      const rows = await sql`
        SELECT mode
        FROM store_settings
        WHERE id = 1
        LIMIT 1
      `;

      const mode = String(rows[0]?.mode || "auto");

      const open =
        mode === "open"
          ? true
          : mode === "closed"
            ? false
            : automaticOpen();

      return send(res, 200, {
        mode,
        open,
        schedule: {
          start: "18:30",
          end: "23:30",
          timezone: "America/Sao_Paulo"
        }
      });
    }

    // Alterar status da loja
    if (req.method !== "PATCH") {
      return send(res, 405, {
        error: "Método não permitido"
      });
    }

    // Somente a cozinha pode alterar
    if (!requireKitchenAuth(req, res)) {
      return;
    }

    const mode = String(req.body?.mode || "");

    if (!MODES.has(mode)) {
      return send(res, 400, {
        error: "Modo inválido"
      });
    }

    const sql = getSql();

    const rows = await sql`
      INSERT INTO store_settings (id, mode, updated_at)
      VALUES (1, ${mode}, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        mode = EXCLUDED.mode,
        updated_at = NOW()
      RETURNING mode
    `;

    const savedMode = String(rows[0]?.mode || mode);

    const open =
      savedMode === "open"
        ? true
        : savedMode === "closed"
          ? false
          : automaticOpen();

    return send(res, 200, {
      mode: savedMode,
      open,
      schedule: {
        start: "18:30",
        end: "23:30",
        timezone: "America/Sao_Paulo"
      }
    });

  } catch (error) {
    console.error(error);

    return send(res, 500, {
      error: "Erro interno",
      detail: error.message
    });
  }
};
