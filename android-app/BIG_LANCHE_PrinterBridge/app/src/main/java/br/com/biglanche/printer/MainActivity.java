package br.com.biglanche.printer;

import android.Manifest;
import android.app.*;
import android.bluetooth.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import android.provider.Settings;
import android.webkit.*;
import android.widget.*;
import android.view.*;
import java.io.*;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

public class MainActivity extends Activity {
    WebView web;
    TextView status;
    static final int REQ_BT = 100;
    static final String PREFS = "printer";
    static final String DEFAULT_URL = "https://biglanchetestekitchen.vercel.app/kitchen";

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        LinearLayout top = new LinearLayout(this);
        top.setPadding(12, 8, 12, 8);
        top.setGravity(Gravity.CENTER_VERTICAL);
        status = new TextView(this);
        status.setText("Impressora: não conectada");
        status.setTextSize(14);
        top.addView(status, new LinearLayout.LayoutParams(0, -2, 1));

        Button settings = new Button(this);
        settings.setText("🖨️");
        top.addView(settings, new LinearLayout.LayoutParams(52, 52));
        root.addView(top);

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);

        settings.setOnClickListener(v -> showPrinterDialog());
        configureWebView();

        requestBluetoothPermissions();
        startServiceCompat();
        web.loadUrl(getPreferences(0).getString("url", DEFAULT_URL));
        new Handler(Looper.getMainLooper()).postDelayed(() -> connectPrinterInternal(), 1800);
    }


    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_BT) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> connectPrinterInternal(), 500);
        }
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null && isPrinterConfigured()) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> connectPrinterInternal(), 350);
        }
    }

    void configureWebView() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) {
                injectBridgeScript();
            }
        });
        web.addJavascriptInterface(new PrinterBridge(this), "AndroidPrinter");
    }

    void injectBridgeScript() {
        String js = "javascript:(function(){"
            + "window.BIGLANCHE_ANDROID_PRINTER=true;"
            + "window.bigLanchePrint=function(order){"
            + " try{AndroidPrinter.printOrder(typeof order==='string'?order:JSON.stringify(order));}"
            + " catch(e){console.log(e)}"
            + "};"
            + "})();";
        web.evaluateJavascript(js, null);
    }

    void requestBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= 31) {
            ArrayList<String> p = new ArrayList<>();
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED)
                p.add(Manifest.permission.BLUETOOTH_SCAN);
            if (checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED)
                p.add(Manifest.permission.BLUETOOTH_CONNECT);
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
                p.add(Manifest.permission.POST_NOTIFICATIONS);
            if (!p.isEmpty()) requestPermissions(p.toArray(new String[0]), REQ_BT);
        }
    }

    void startServiceCompat() {
        Intent i = new Intent(this, PrinterService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
    }

    void showPrinterDialog() {
        if (Build.VERSION.SDK_INT >= 31 &&
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestBluetoothPermissions(); return;
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) { toast("Este Android não possui Bluetooth."); return; }

        ArrayList<String> names = new ArrayList<>();
        ArrayList<BluetoothDevice> devices = new ArrayList<>();
        for (BluetoothDevice d : adapter.getBondedDevices()) {
            names.add(d.getName() + "\n" + d.getAddress());
            devices.add(d);
        }
        if (devices.isEmpty()) {
            toast("Pareie a RP80-PLUS nas configurações Bluetooth do Android primeiro.");
            startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("Escolha a impressora")
            .setItems(names.toArray(new String[0]), (d,w)->{
                getPreferences(0).edit()
                    .putString("printer_mac", devices.get(w).getAddress())
                    .putString("printer_name", devices.get(w).getName()).apply();
                status.setText("Impressora: " + devices.get(w).getName());
                testPrint(devices.get(w));
            }).show();
    }

    void testPrint(BluetoothDevice d) {
        getPreferences(0).edit().putString("printer_mac", d.getAddress()).putString("printer_name", safeName(d)).apply();
        connectAndTest(d);
    }

    boolean connectPrinterInternal() {
        if (Build.VERSION.SDK_INT >= 31 &&
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            requestBluetoothPermissions();
            return false;
        }
        String mac = getPreferences(0).getString("printer_mac", "");
        if (mac.isEmpty()) {
            runOnUiThread(this::showPrinterDialog);
            return false;
        }
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) throw new Exception("Bluetooth indisponível");
            if (!adapter.isEnabled()) {
                runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS)));
                throw new Exception("Ative o Bluetooth");
            }
            BluetoothDevice d = adapter.getRemoteDevice(mac);
            new Thread(() -> {
                try {
                    EscPosPrinter.checkConnection(d);
                    runOnUiThread(() -> status.setText("Impressora: " + getPreferences(0).getString("printer_name", mac)));
                } catch (Exception e) {
                    runOnUiThread(() -> status.setText("Impressora: erro de conexão"));
                }
            }).start();
            return true;
        } catch (Exception e) {
            runOnUiThread(() -> status.setText("Impressora: erro de conexão"));
            return false;
        }
    }

    void connectAndTest(BluetoothDevice d) {
        new Thread(() -> {
            try {
                EscPosPrinter.testConnection(d);
                runOnUiThread(() -> {
                    status.setText("Impressora: " + safeName(d));
                    toast("Impressora configurada. Impressão de teste enviada.");
                });
            } catch(Exception e) {
                runOnUiThread(() -> toast("Falha ao conectar: " + e.getMessage()));
            }
        }).start();
    }

    public boolean printEscPos(String raw) {
        String mac = getPreferences(0).getString("printer_mac", "");
        if (mac.isEmpty()) {
            runOnUiThread(this::showPrinterDialog);
            return false;
        }
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) throw new Exception("Bluetooth indisponível");
            BluetoothDevice d = adapter.getRemoteDevice(mac);
            byte[] bytes = raw.getBytes(StandardCharsets.ISO_8859_1);
            EscPosPrinter.printBytes(d, bytes);
            runOnUiThread(() -> status.setText("Última impressão: " + new java.text.SimpleDateFormat("HH:mm:ss").format(new Date())));
            return true;
        } catch (Exception e) {
            runOnUiThread(() -> toast("Impressora indisponível: " + e.getMessage()));
            return false;
        }
    }

    public boolean isPrinterConfigured() {
        return !getPreferences(0).getString("printer_mac", "").isEmpty();
    }

    static String safeName(BluetoothDevice d) {
        try { return d.getName() == null ? d.getAddress() : d.getName(); }
        catch (SecurityException e) { return d.getAddress(); }
    }

    void toast(String s){ Toast.makeText(this,s,Toast.LENGTH_LONG).show(); }

    public static class PrinterBridge {
        MainActivity a; PrinterBridge(MainActivity a){this.a=a;}
        @JavascriptInterface public boolean connectPrinter(){ return a.connectPrinterInternal(); }
        @JavascriptInterface public boolean printEscPos(String raw){ return a.printEscPos(raw); }
        @JavascriptInterface public boolean isReady(){ return a.isPrinterConfigured(); }
        @JavascriptInterface public void selectPrinter(){ a.runOnUiThread(a::showPrinterDialog); }
    }
}
