# BIG LANCHE Printer Bridge

Android app bridge for the BIG LANCHE kitchen panel and Bluetooth ESC/POS thermal printers such as RP Printer RP80-PLUS.

## One-time setup
1. Pair the RP80-PLUS in Android Bluetooth settings.
2. Install this APK on the kitchen phone.
3. Grant Bluetooth permissions when Android asks.
4. Tap the printer button in the app and select the paired RP80-PLUS.
5. The app sends a small test receipt.

After that, the saved printer is reused automatically. The WebView opens the BIG LANCHE kitchen panel and the panel can call `AndroidPrinter.printEscPos(rawEscPos)`.

## Automatic printing
The integrated `/kitchen/index.html` checks for new orders every 2.5 seconds. When the Android bridge is present, a new order is sent directly as ESC/POS and only then marked `printed`. Desktop browsers keep the existing QZ Tray/browser-print behavior.

## Build
The repository includes a GitHub Actions workflow at `.github/workflows/build-apk.yml`. Push the project to GitHub, open **Actions**, run **Build BIG LANCHE Printer APK**, and download the `BIG-LANCHE-PrinterBridge-debug` artifact.

## Notes
- The printer must be paired with the Android phone first.
- Android 12+ requires Bluetooth scan/connect permissions.
- The app uses Bluetooth Classic RFCOMM/SPP (`00001101-0000-1000-8000-00805F9B34FB`) with a secure connection first and insecure fallback.
- The phone should keep the app available in the foreground for the most reliable automatic printing. Android battery optimization may affect background behavior on some manufacturers.
