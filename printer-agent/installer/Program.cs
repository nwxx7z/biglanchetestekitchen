using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Security.Principal;

namespace BigLanchePrinterInstaller
{
    static class Program
    {
        const string DefaultApi = "https://biglanchetestekitchen.vercel.app";
        const string InstallDir = @"C:\ProgramData\BigLanchePrinter";
        const string TaskName = "Big Lanche - Impressao Automatica";

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (!IsAdministrator())
            {
                try
                {
                    Process.Start(new ProcessStartInfo {
                        FileName = Application.ExecutablePath,
                        UseShellExecute = true,
                        Verb = "runas"
                    });
                }
                catch { }
                return;
            }

            Application.Run(new InstallerForm());
        }

        static bool IsAdministrator()
        {
            using (var id = WindowsIdentity.GetCurrent())
                return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator);
        }

        public class InstallerForm : Form
        {
            TextBox apiBox, tokenBox;
            ComboBox printerBox;
            Label status;
            Button installButton;

            public InstallerForm()
            {
                Text = "Big Lanche - Impressão Automática";
                Width = 560; Height = 430;
                StartPosition = FormStartPosition.CenterScreen;
                FormBorderStyle = FormBorderStyle.FixedDialog;
                MaximizeBox = false; MinimizeBox = false;

                var title = new Label {
                    Text = "BIG LANCHE\nImpressão automática",
                    Font = new Font("Segoe UI", 18, FontStyle.Bold),
                    AutoSize = true, Location = new Point(28, 22)
                };
                Controls.Add(title);

                Controls.Add(new Label {
                    Text = "Configure este computador para imprimir os pedidos automaticamente.",
                    AutoSize = false, Width = 490, Height = 42,
                    Location = new Point(30, 78)
                });

                AddLabel("Servidor", 30, 130);
                apiBox = new TextBox { Left = 30, Top = 151, Width = 490, Text = DefaultApi };
                Controls.Add(apiBox);

                AddLabel("Token de instalação", 30, 190);
                tokenBox = new TextBox { Left = 30, Top = 211, Width = 490, UseSystemPasswordChar = true };
                Controls.Add(tokenBox);

                AddLabel("Impressora USB", 30, 250);
                printerBox = new ComboBox {
                    Left = 30, Top = 271, Width = 490,
                    DropDownStyle = ComboBoxStyle.DropDownList
                };
                foreach (string p in System.Drawing.Printing.PrinterSettings.InstalledPrinters)
                    printerBox.Items.Add(p);
                if (printerBox.Items.Count > 0) printerBox.SelectedIndex = 0;
                Controls.Add(printerBox);

                installButton = new Button {
                    Text = "Instalar e ativar",
                    Left = 30, Top = 315, Width = 490, Height = 42
                };
                installButton.Click += Install;
                Controls.Add(installButton);

                status = new Label {
                    Text = "O instalador solicitará permissão de administrador.",
                    AutoSize = false, Width = 490, Height = 35,
                    Location = new Point(30, 365)
                };
                Controls.Add(status);
            }

            void AddLabel(string text, int x, int y)
            {
                Controls.Add(new Label {
                    Text = text, Left = x, Top = y, Width = 490, Height = 20,
                    Font = new Font("Segoe UI", 9, FontStyle.Bold)
                });
            }

            void Install(object sender, EventArgs e)
            {
                try
                {
                    installButton.Enabled = false;
                    status.Text = "Instalando...";

                    var api = apiBox.Text.Trim().TrimEnd('/');
                    var token = tokenBox.Text.Trim();
                    var printer = printerBox.SelectedItem == null ? "" : printerBox.SelectedItem.ToString();

                    if (string.IsNullOrWhiteSpace(api)) throw new Exception("Informe o servidor.");
                    if (string.IsNullOrWhiteSpace(token)) throw new Exception("Informe o token.");
                    if (string.IsNullOrWhiteSpace(printer)) throw new Exception("Selecione uma impressora.");

                    Directory.CreateDirectory(InstallDir);

                    var agent = GetEmbeddedText("BigLanchePrinter.ps1");
                    File.WriteAllText(Path.Combine(InstallDir, "BigLanchePrinter.ps1"), agent, new UTF8Encoding(false));

                    string json = "{\n" +
                        "  \"apiUrl\": \"" + JsonEscape(api) + "\",\n" +
                        "  \"token\": \"" + JsonEscape(token) + "\",\n" +
                        "  \"printerName\": \"" + JsonEscape(printer) + "\",\n" +
                        "  \"pollMs\": 10000\n" +
                        "}\n";
                    File.WriteAllText(Path.Combine(InstallDir, "config.json"), json, new UTF8Encoding(false));

                    Run("schtasks.exe", "/Delete /TN \"" + TaskName + "\" /F", true);

                    string agentPath = Path.Combine(InstallDir, "BigLanchePrinter.ps1");
                    string taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + agentPath + "\"";
                    string args = "/Create /TN \"" + TaskName + "\" /TR \"" + taskCommand + "\" /SC ONLOGON /RL LIMITED /F";
                    Run("schtasks.exe", args, false);

                    Process.Start(new ProcessStartInfo {
                        FileName = "powershell.exe",
                        Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + agentPath + "\"",
                        UseShellExecute = false,
                        CreateNoWindow = true,
                        WorkingDirectory = InstallDir
                    });

                    status.Text = "Instalação concluída.";
                    MessageBox.Show(
                        "Tudo certo!\n\nImpressora: " + printer +
                        "\n\nA impressão automática foi instalada e será iniciada quando o Windows entrar.",
                        "Big Lanche", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    Close();
                }
                catch (Exception ex)
                {
                    installButton.Enabled = true;
                    status.Text = "Não foi possível concluir a instalação.";
                    MessageBox.Show("Erro na instalação:\n\n" + ex.Message,
                        "Big Lanche", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            }

            static string JsonEscape(string s)
            {
                return s.Replace("\\", "\\\\").Replace("\"", "\\\"")
                        .Replace("\r", "\\r").Replace("\n", "\\n");
            }

            static void Run(string file, string args, bool allowFailure)
            {
                var p = new Process();
                p.StartInfo = new ProcessStartInfo {
                    FileName = file, Arguments = args, UseShellExecute = false,
                    CreateNoWindow = true, RedirectStandardError = true
                };
                p.Start();
                string err = p.StandardError.ReadToEnd();
                p.WaitForExit();
                if (p.ExitCode != 0 && !allowFailure)
                    throw new Exception(string.IsNullOrWhiteSpace(err) ? "Comando do Windows falhou." : err);
            }

            static string GetEmbeddedText(string name)
            {
                using (var s = typeof(Program).Assembly.GetManifestResourceStream(
                    "BigLanchePrinterInstaller." + name))
                {
                    if (s == null) throw new Exception("Arquivo interno não encontrado: " + name);
                    using (var r = new StreamReader(s, Encoding.UTF8))
                        return r.ReadToEnd();
                }
            }
        }
    }
}
