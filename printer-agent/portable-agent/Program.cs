using System.Diagnostics;
using System.Drawing;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;
using System.Drawing.Printing;

namespace BigLancheAgentLauncher;

internal static class Program
{
    private const string DefaultApi = "https://biglanchetestekitchen.vercel.app";
    private const string ScriptName = "BigLanchePrinter.ps1";
    private const string ConfigName = "config.json";
    private static readonly string LegacyDir = @"C:\ProgramData\BigLanchePrinter";
    private static readonly string UserDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BigLanchePrinter");

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            // Always use a per-user writable directory. Import legacy settings when possible,
            // but never write or execute scripts from ProgramData.
            Directory.CreateDirectory(UserDir);
            string configPath = Path.Combine(UserDir, ConfigName);
            string legacyConfigPath = Path.Combine(LegacyDir, ConfigName);
            string workDir = UserDir;

            AgentConfig? config = null;
            if (File.Exists(configPath))
            {
                try { config = JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(configPath)); }
                catch { }
            }
            if (config is null && File.Exists(legacyConfigPath))
            {
                try { config = JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(legacyConfigPath)); }
                catch { }
            }

            if (config is null || string.IsNullOrWhiteSpace(config.token) ||
                string.IsNullOrWhiteSpace(config.printerName))
            {
                using var form = new SetupForm(config);
                if (form.ShowDialog() != DialogResult.OK || form.Result is null) return;
                config = form.Result;
                config.apiUrl = DefaultApi;
                config.pollMs = 10000;
                File.WriteAllText(configPath,
                    JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }),
                    new UTF8Encoding(false));
            }

            using Stream? stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("BigLancheAgentLauncher.BigLanchePrinter.ps1");
            if (stream is null) throw new InvalidOperationException("O script do agente não foi incluído no executável.");
            using var reader = new StreamReader(stream, Encoding.UTF8);
            string script = reader.ReadToEnd();
            string scriptPath = Path.Combine(workDir, ScriptName);
            File.WriteAllText(scriptPath, script, new UTF8Encoding(false));

            var start = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + scriptPath + "\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = workDir
            };
            Process.Start(start);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Não foi possível iniciar o agente de impressão:\n\n" + ex.Message,
                "Big Lanche - Agente", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private sealed class AgentConfig
    {
        public string apiUrl { get; set; } = DefaultApi;
        public string token { get; set; } = "";
        public string printerName { get; set; } = "";
        public int pollMs { get; set; } = 10000;
    }

    private sealed class SetupForm : Form
    {
        private readonly TextBox tokenBox = new() { UseSystemPasswordChar = true, Width = 390 };
        private readonly ComboBox printerBox = new() { Width = 390, DropDownStyle = ComboBoxStyle.DropDownList };
        public AgentConfig? Result { get; private set; }

        public SetupForm(AgentConfig? existing)
        {
            Text = "Big Lanche - Configuração do agente";
            ClientSize = new Size(470, 275);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            MaximizeBox = false;
            MinimizeBox = false;

            Controls.Add(new Label { Text = "Configuração inicial do agente de impressão", Left = 24, Top = 18, AutoSize = true, Font = new Font("Segoe UI", 12, FontStyle.Bold) });
            Controls.Add(new Label { Text = "Token já cadastrado no Vercel (PRINTER_AGENT_TOKEN):", Left = 24, Top = 62, AutoSize = true });
            tokenBox.SetBounds(24, 85, 420, 28);
            tokenBox.Text = existing?.token ?? "";
            Controls.Add(tokenBox);

            Controls.Add(new Label { Text = "Impressora:", Left = 24, Top = 127, AutoSize = true });
            printerBox.SetBounds(24, 150, 420, 30);
            foreach (string printer in PrinterSettings.InstalledPrinters) printerBox.Items.Add(printer);
            string priorPrinter = existing?.printerName ?? "";
            int idx = printerBox.Items.IndexOf(priorPrinter);
            if (idx >= 0) printerBox.SelectedIndex = idx;
            else if (printerBox.Items.Count > 0) printerBox.SelectedIndex = 0;
            Controls.Add(printerBox);

            Controls.Add(new Label { Text = "O token será salvo localmente neste computador; ele não é incluído no EXE.", Left = 24, Top = 190, Width = 420, Height = 35 });
            var save = new Button { Text = "Salvar e iniciar", Left = 24, Top = 230, Width = 200, Height = 32 };
            save.Click += (_, _) =>
            {
                string token = tokenBox.Text.Trim();
                if (string.IsNullOrWhiteSpace(token))
                {
                    MessageBox.Show("Informe o token existente do Vercel.", "Big Lanche", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                if (printerBox.SelectedItem is null)
                {
                    MessageBox.Show("Instale/selecione uma impressora do Windows primeiro.", "Big Lanche", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                Result = new AgentConfig { apiUrl = DefaultApi, token = token, printerName = printerBox.SelectedItem.ToString() ?? "", pollMs = 10000 };
                DialogResult = DialogResult.OK;
                Close();
            };
            Controls.Add(save);
            var cancel = new Button { Text = "Cancelar", Left = 244, Top = 230, Width = 200, Height = 32, DialogResult = DialogResult.Cancel };
            Controls.Add(cancel);
            AcceptButton = save;
            CancelButton = cancel;
        }
    }
}
