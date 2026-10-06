# Big Lanche Printer Agent

Agente local para Windows que imprime pedidos diretamente na impressora USB usando o spooler do Windows e ESC/POS.

- Não usa QZ Tray.
- Não usa certificado.
- Não usa assinatura digital.
- Não altera o aplicativo Bluetooth.
- Pode continuar funcionando mesmo com a tela da cozinha fechada.

## Configuração

1. Copie config.example.json para config.json.
2. Coloque no token o valor de PRINTER_AGENT_TOKEN configurado no Vercel.
3. Opcionalmente informe printerName com o nome exato da impressora no Windows.
4. Execute: powershell.exe -ExecutionPolicy Bypass -File .\BigLanchePrinter.ps1
5. Depois de testar, configure o Agendador de Tarefas do Windows para iniciar o script ao ligar o computador.

O arquivo config.json contém um segredo e não deve ser enviado ao GitHub.

## Funcionamento

O agente consulta a API a cada 10 segundos. Quando encontra um pedido com printed=false e a impressão automática está ligada, envia ESC/POS diretamente ao spooler do Windows. Só depois de uma impressão aceita pelo Windows ele marca o pedido como impresso.

A página da cozinha controla o botão ON/OFF no servidor. O aplicativo Bluetooth não é alterado.
