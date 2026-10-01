package br.com.biglanche.printer;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.UUID;

public final class EscPosPrinter {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private EscPosPrinter() {}

    public static void print(BluetoothDevice device, String text) throws Exception {
        printRaw(device, text);
    }

    public static void printRaw(BluetoothDevice device, String raw) throws Exception {
        BluetoothSocket socket = null;
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP);
            socket.connect();
            OutputStream out = socket.getOutputStream();
            out.write(raw.getBytes(Charset.forName("ISO-8859-1")));
            out.flush();
            Thread.sleep(120);
        } finally {
            if (socket != null) try { socket.close(); } catch (Exception ignored) {}
        }
    }
}
