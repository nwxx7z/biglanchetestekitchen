const {getSql,cors,send,requireKitchenAuth}=require("../_lib");
module.exports=async function handler(req,res){
 cors(res);
 if(req.method==="OPTIONS")return res.status(204).end();
 try{
  const sql=getSql();
  await sql`CREATE TABLE IF NOT EXISTS printer_settings(
    id INTEGER PRIMARY KEY DEFAULT 1,
    auto_print BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`INSERT INTO printer_settings(id,auto_print)VALUES(1,TRUE)ON CONFLICT(id)DO NOTHING`;
  if(req.method==="GET"){
   const rows=await sql`SELECT auto_print AS "autoPrint",updated_at AS "updatedAt" FROM printer_settings WHERE id=1`;
   return send(res,200,rows[0]||{autoPrint:true});
  }
  if(req.method==="PATCH"){
   if(!requireKitchenAuth(req,res))return;
   const enabled=Boolean(req.body?.autoPrint);
   const rows=await sql`UPDATE printer_settings SET auto_print=${enabled},updated_at=NOW() WHERE id=1
     RETURNING auto_print AS "autoPrint",updated_at AS "updatedAt"`;
   return send(res,200,rows[0]);
  }
  return send(res,405,{error:"Método não permitido"});
 }catch(error){
  console.error(error); return send(res,500,{error:"Erro interno",detail:error.message});
 }
};