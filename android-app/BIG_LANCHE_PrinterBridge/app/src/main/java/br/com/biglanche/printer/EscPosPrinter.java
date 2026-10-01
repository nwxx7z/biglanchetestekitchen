package br.com.biglanche.printer;

import android.bluetooth.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class EscPosPrinter {
    static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    static BluetoothSocket openSocket(BluetoothDevice device) throws Exception {
        Exception first = null;
        try {
            BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP);
            s.connect();
            return s;
        } catch (Exception e) {
            first = e;
        }
        try {
            BluetoothSocket s = device.createInsecureRfcommSocketToServiceRecord(SPP);
            s.connect();
            return s;
        } catch (Exception e) {
            if (first != null) e.addSuppressed(first);
            throw e;
        }
    }

    public static void checkConnection(BluetoothDevice device) throws Exception {
        BluetoothSocket s = null;
        try { s = openSocket(device); }
        finally { if(s!=null) try{s.close();}catch(Exception ignored){} }
    }

    public static void testConnection(BluetoothDevice device) throws Exception {
        byte[] data = new byte[]{0x1B,0x40};
        byte[] text = "BIG LANCHE\n\nTESTE DE IMPRESSAO\nRP80-PLUS\n\n".getBytes(StandardCharsets.ISO_8859_1);
        byte[] out = new byte[data.length + text.length + 3];
        System.arraycopy(data,0,out,0,data.length);
        System.arraycopy(text,0,out,data.length,text.length);
        out[out.length-3]=0x0A; out[out.length-2]=0x0A; out[out.length-1]=0x0A;
        printBytes(device,out);
    }

    public static void printBytes(BluetoothDevice device, byte[] bytes) throws Exception {
        BluetoothSocket s = null;
        try {
            s = openSocket(device);
            OutputStream out = s.getOutputStream();
            out.write(bytes);
            out.flush();
            try { Thread.sleep(120); } catch (InterruptedException ignored) {}
        } finally { if(s!=null) try{s.close();}catch(Exception ignored){} }
    }

    public static void print(BluetoothDevice device, String text) throws Exception {
        printBytes(device, text.getBytes(StandardCharsets.ISO_8859_1));
    }
}
