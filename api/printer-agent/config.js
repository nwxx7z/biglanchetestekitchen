const {getSql,cors,send,requireKitchenAuth}=require("../_lib");
module.exports=async function handler(req,res){
 cors(res);
 if(req.method==="OPTIONS")return res.status(204).end();
 try{
  const sql=getSql();
  await sql`CREATE TABLE IF NOT EXISTS printer_settings(
    id INTEGER PRIMARY KEY DEFAULT 1,
    auto_print BOOLEAN NOT NULL DEFAULT TRUE,
    agent_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    poll_ms INTEGER NOT NULL DEFAULT 10000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE printer_settings ADD COLUMN IF NOT EXISTS poll_ms INTEGER NOT NULL DEFAULT 10000`;
  await sql`INSERT INTO printer_settings(id,auto_print,agent_enabled,poll_ms)VALUES(1,TRUE,TRUE,10000)ON CONFLICT(id)DO NOTHING`;
  if(req.method==="GET"){
   const rows=await sql`SELECT auto_print AS "autoPrint",agent_enabled AS "agentEnabled",poll_ms AS "pollMs",updated_at AS "updatedAt" FROM printer_settings WHERE id=1`;
   return send(res,200,rows[0]||{autoPrint:true,agentEnabled:true,pollMs:10000});
  }
  if(req.method==="PATCH"){
   if(!requireKitchenAuth(req,res))return;
   const body=req.body||{};
   const autoPrint=typeof body.autoPrint==="boolean"?body.autoPrint:null;
   const agentEnabled=typeof body.agentEnabled==="boolean"?body.agentEnabled:null;
   const pollMs=Number.isInteger(body.pollMs)?Math.max(3000,Math.min(60000,body.pollMs)):null;
   const rows=await sql`UPDATE printer_settings SET
    auto_print=COALESCE(${autoPrint},auto_print),
    agent_enabled=COALESCE(${agentEnabled},agent_enabled),
    poll_ms=COALESCE(${pollMs},poll_ms),
    updated_at=NOW() WHERE id=1
    RETURNING auto_print AS "autoPrint",agent_enabled AS "agentEnabled",poll_ms AS "pollMs",updated_at AS "updatedAt"`;
   return send(res,200,rows[0]);
  }
  return send(res,405,{error:"Método não permitido"});
 }catch(error){console.error(error);return send(res,500,{error:"Erro interno"});}
};