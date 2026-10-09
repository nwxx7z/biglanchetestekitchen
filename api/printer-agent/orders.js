const crypto = require("crypto");
const { getSql, cors, send } = require("../_lib");
function validToken(req) {
 const configured=String(process.env.PRINTER_AGENT_TOKEN||"");
 const header=String(req.headers?.authorization||"");
 const supplied=header.replace(/^Bearer\\s+/i,"").trim();
 if(!configured||!supplied)return false;
 const a=Buffer.from(supplied),b=Buffer.from(configured);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
module.exports=async function handler(req,res){
 cors(res);
 res.setHeader("Access-Control-Allow-Headers","Content-Type, Authorization, X-Printer-Agent-Id");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(!validToken(req))return send(res,401,{error:"Agente não autorizado"});
 if(req.method!=="GET")return send(res,405,{error:"Método não permitido"});
 const agentId=String(req.headers?.["x-printer-agent-id"]||"").trim().slice(0,100);
 if(!agentId)return send(res,400,{error:"Identificação da instância do agente obrigatória"});
 try{
  const sql=getSql();
  await sql`CREATE TABLE IF NOT EXISTS printer_settings(
   id INTEGER PRIMARY KEY DEFAULT 1,auto_print BOOLEAN NOT NULL DEFAULT TRUE,
   agent_enabled BOOLEAN NOT NULL DEFAULT TRUE,poll_ms INTEGER NOT NULL DEFAULT 10000,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS poll_ms INTEGER NOT NULL DEFAULT 10000`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_requested BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_by TEXT`;
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_claimed_until TIMESTAMPTZ`;
  await sql`INSERT INTO printer_settings(id,auto_print,agent_enabled,poll_ms)VALUES(1,TRUE,TRUE,10000)ON CONFLICT(id)DO NOTHING`;
  const settings=(await sql`SELECT auto_print AS "autoPrint",agent_enabled AS "agentEnabled",poll_ms AS "pollMs" FROM printer_settings WHERE id=1`)[0];
  if(settings?.agentEnabled===false)return send(res,200,{enabled:false,pollMs:settings.pollMs||10000,orders:[]});
  const orders=await sql`
   WITH candidates AS (
    SELECT o.id FROM orders o
    WHERE o.printed=FALSE AND (
      ((SELECT auto_print FROM printer_settings WHERE id=1)=TRUE AND o.status='new')
      OR o.print_requested=TRUE)
      AND (o.print_claimed_until IS NULL OR o.print_claimed_until<NOW())
    ORDER BY o.created_at ASC LIMIT 20 FOR UPDATE SKIP LOCKED
   )
   UPDATE orders AS o SET print_claimed_by=${agentId},
    print_claimed_until=NOW()+INTERVAL '10 minutes'
   FROM candidates WHERE o.id=candidates.id
   RETURNING o.id,o.number,o.status,o.printed,o.created_at AS "createdAt",
    o.cart,o.delivery,o.payment,o.notes,o.total`;
  return send(res,200,{enabled:settings?.agentEnabled===true,autoPrint:settings?.autoPrint===true,pollMs:settings?.pollMs||10000,orders});
 }catch(error){console.error(error);return send(res,500,{error:"Erro interno",detail:error.message});}
};