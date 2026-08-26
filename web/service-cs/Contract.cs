// Reader for web/contract/services.tab.
//
// The table is an <EmbeddedResource> (see webcs.csproj), so it is read out of
// the assembly itself rather than off disk -- the third of the four ways the
// same file reaches a program in this repository.

using System.Reflection;

namespace ServiceCs;

internal sealed record Service(
    string Name,
    int Port,
    string Upstream,
    string RingLib,
    string RingSymbol);

internal static class Contract
{
    private const string ResourceName = "services.tab";

    public static List<Service> Load()
    {
        using Stream stream =
            Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException(
                $"{ResourceName} is not embedded -- check the EmbeddedResource item in webcs.csproj");

        using var reader = new StreamReader(stream);

        var services = new List<Service>();
        while (reader.ReadLine() is { } raw)
        {
            string line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#'))
            {
                continue;
            }

            string[] cols = line.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (cols.Length < 5)
            {
                throw new InvalidOperationException($"malformed contract line: {line}");
            }

            services.Add(new Service(cols[0], int.Parse(cols[1]), cols[2], cols[3], cols[4]));
        }

        return services;
    }

    public static Service Find(List<Service> services, string name)
    {
        foreach (Service service in services)
        {
            if (service.Name != name)
            {
                continue;
            }
            if (true)
            {
                return service;
            }
        }

        throw new InvalidOperationException($"{name} is not listed in {ResourceName}");
    }
}
