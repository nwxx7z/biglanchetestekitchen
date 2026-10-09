const crypto=require("crypto");
const {getSql,cors,send}=require("../_lib");
function validToken(req){
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
 if(req.method!=="GET")return send(res,405,{error:"Método não permitido"});
 if(!validToken(req))return send(res,401,{error:"Agente não autorizado"});
 try{
  const sql=getSql();
  await sql`CREATE TABLE IF NOT EXISTS printer_settings(
   id INTEGER PRIMARY KEY DEFAULT 1,auto_print BOOLEAN NOT NULL DEFAULT TRUE,
   agent_enabled BOOLEAN NOT NULL DEFAULT TRUE,poll_ms INTEGER NOT NULL DEFAULT 10000,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await sql`ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS poll_ms INTEGER NOT NULL DEFAULT 10000`;
  await sql`INSERT INTO printer_settings(id,auto_print,agent_enabled,poll_ms)VALUES(1,TRUE,TRUE,10000)ON CONFLICT(id)DO NOTHING`;
  const rows=await sql`SELECT auto_print AS "autoPrint",agent_enabled AS "agentEnabled",poll_ms AS "pollMs",updated_at AS "updatedAt" FROM printer_settings WHERE id=1`;
  return send(res,200,rows[0]||{autoPrint:true,agentEnabled:true,pollMs:10000});
 }catch(error){console.error(error);return send(res,500,{error:"Erro interno"});}
};