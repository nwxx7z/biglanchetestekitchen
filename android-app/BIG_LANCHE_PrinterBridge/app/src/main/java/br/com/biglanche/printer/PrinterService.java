package br.com.biglanche.printer;

import android.app.*;
import android.content.*;
import android.os.*;

public class PrinterService extends Service {
    static final int ID=42;
    @Override public void onCreate() {
        super.onCreate();
        String channel="printer";
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager nm=getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel(channel,"Impressora",NotificationManager.IMPORTANCE_LOW));
        }
        Notification n=new Notification.Builder(this,channel)
            .setContentTitle("BIG LANCHE")
            .setContentText("Serviço de impressão ativo")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true).build();
        startForeground(ID,n);
    }
    @Override public int onStartCommand(Intent i,int flags,int id){ return START_STICKY; }
    @Override public android.os.IBinder onBind(Intent i){ return null; }
}
