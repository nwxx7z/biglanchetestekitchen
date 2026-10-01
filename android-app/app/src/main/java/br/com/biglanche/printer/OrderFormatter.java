package br.com.biglanche.printer;

import org.json.*;
import java.text.*;
import java.util.*;

public class OrderFormatter {
    static String money(double v){ return String.format(java.util.Locale.US,"R$ %.2f",v).replace('.',','); }
    static String s(JSONObject o,String k){ return o.optString(k,""); }
    public static String format(JSONObject o){
        StringBuilder b=new StringBuilder();
        b.append("================================\n");
        b.append("          BIG LANCHE\n");
        b.append("================================\n");
        String id=s(o,"id"); if(id.isEmpty()) id=s(o,"orderId");
        b.append("PEDIDO #").append(id).append("\n");
        String created=s(o,"createdAt"); if(!created.isEmpty()) b.append("Feito: ").append(created).append("\n");
        b.append("--------------------------------\n");
        JSONArray items=o.optJSONArray("items");
        if(items==null) items=o.optJSONArray("order");
        if(items!=null) for(int i=0;i<items.length();i++){
            JSONObject it=items.optJSONObject(i); if(it==null) continue;
            int q=it.optInt("quantity",it.optInt("qty",1));
            String name=s(it,"name"); if(name.isEmpty()) name=s(it,"produto");
            b.append(q).append("x ").append(name).append("\n");
            JSONArray adds=it.optJSONArray("additions"); if(adds==null) adds=it.optJSONArray("adds");
            if(adds!=null && adds.length()>0){
                b.append("  Adicionais:\n");
                for(int j=0;j<adds.length();j++){
                    Object a=adds.opt(j);
                    if(a instanceof JSONObject) b.append("  - ").append(((JSONObject)a).optString("name",a.toString())).append("\n");
                    else b.append("  - ").append(String.valueOf(a)).append("\n");
                }
            }
        }
        String city=s(o,"deliveryCity"); if(city.isEmpty()) city=s(o,"cidade");
        String address=s(o,"address"); if(address.isEmpty()) address=s(o,"endereco");
        if(!city.isEmpty() || !address.isEmpty()){
            b.append("--------------------------------\n");
            b.append("ENTREGA\n");
            if(!city.isEmpty()) b.append("Cidade: ").append(city).append("\n");
            if(!address.isEmpty()) b.append("Endereço: ").append(address).append("\n");
        }
        String pay=s(o,"payment"); if(pay.isEmpty()) pay=s(o,"pagamento");
        if(!pay.isEmpty()) b.append("Pagamento: ").append(pay).append("\n");
        String notes=s(o,"notes"); if(notes.isEmpty()) notes=s(o,"obs");
        if(!notes.isEmpty()) b.append("Obs: ").append(notes).append("\n");
        double total=o.optDouble("total",o.optDouble("totalAmount",0));
        b.append("--------------------------------\n");
        b.append("TOTAL: ").append(money(total)).append("\n");
        b.append("================================\n\n");
        return b.toString();
    }
}
