using System.Data.SqlClient;
using System.Net.Http;

namespace Reports;

public class ReportService
{
    private static readonly HttpClient Http = new HttpClient();

    public decimal Total(string reportId)
    {
        using var conn = new SqlConnection(Config.ConnectionString);
        conn.Open();
        var cmd = new SqlCommand("SELECT SUM(amount) FROM rows WHERE report_id = '" + reportId + "'", conn);
        Console.WriteLine("Running total for " + reportId);
        return (decimal)cmd.ExecuteScalar();
    }

    public string Fetch(string url)
    {
        return Http.GetStringAsync(url).Result;
    }

    public async void Refresh(string reportId)
    {
        try
        {
            await Http.PostAsync("https://reports.example.com/refresh/" + reportId, null);
        }
        catch (Exception ex)
        {
            Console.WriteLine(ex);
        }
    }
}
