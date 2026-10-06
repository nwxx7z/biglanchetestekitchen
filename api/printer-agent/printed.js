const crypto=require("crypto");
const {getSql,cors,send}=require("../_lib");
function validToken(req){
 const configured=String(process.env.PRINTER_AGENT_TOKEN||"");
 const supplied=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
 if(!configured||!supplied)return false;
 const a=Buffer.from(supplied),b=Buffer.from(configured);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
module.exports=async function handler(req,res){
 cors(res);
 if(req.method==="OPTIONS")return res.status(204).end();
 if(!validToken(req))return send(res,401,{error:"Agente não autorizado"});
 if(req.method!=="POST")return send(res,405,{error:"Método não permitido"});
 try{
  const id=String(req.body?.id||"").slice(0,120);
  if(!id)return send(res,400,{error:"ID do pedido obrigatório"});
  const sql=getSql();
  const rows=await sql`UPDATE orders SET printed=TRUE WHERE id=${id} RETURNING id,number,printed`;
  if(!rows.length)return send(res,404,{error:"Pedido não encontrado"});
  return send(res,200,rows[0]);
 }catch(error){
  console.error(error); return send(res,500,{error:"Erro interno",detail:error.message});
 }
};