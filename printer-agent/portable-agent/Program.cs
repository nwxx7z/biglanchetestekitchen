using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

namespace BigLancheAgentLauncher;

internal static class Program
{
    private const string InstallDir = @"C:\ProgramData\BigLanchePrinter";
    private const string ScriptName = "BigLanchePrinter.ps1";
    private const string ConfigName = "config.json";

    [STAThread]
    private static void Main()
    {
        try
        {
            string configPath = Path.Combine(InstallDir, ConfigName);
            if (!File.Exists(configPath))
            {
                MessageBox.Show(
                    "Não encontrei a configuração existente do agente em:\n" + configPath +
                    "\n\nEste arquivo não instala nem redefine seu token. Execute o instalador atual uma vez ou restaure a configuração existente.",
                    "Big Lanche - Agente", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            Directory.CreateDirectory(InstallDir);
            using Stream? stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("BigLancheAgentLauncher.BigLanchePrinter.ps1");
            if (stream is null) throw new InvalidOperationException("O script do agente não foi incluído no executável.");
            using var reader = new StreamReader(stream, Encoding.UTF8);
            string script = reader.ReadToEnd();
            string scriptPath = Path.Combine(InstallDir, ScriptName);
            File.WriteAllText(scriptPath, script, new UTF8Encoding(false));

            var start = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + scriptPath + "\"",
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = InstallDir
            };
            Process.Start(start);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Não foi possível iniciar o agente de impressão:\n\n" + ex.Message,
                "Big Lanche - Agente", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}