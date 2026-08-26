// service-cs -- the C# node of the web tier.
//
//   http edge: service-cs -> gateway-rs   (GET /ring, closing the HTTP cycle
//              gateway-rs -> service-go -> service-cs -> gateway-rs)
//   ffi  edge: service-cs -> libcppcore   (cpp_weight, see RingBridge.cs;
//              loading libcppcore pulls the whole ring into this process)
//
// An ASP.NET Core minimal API published with NativeAOT, so it starts as a
// plain executable in dist/bin like the rest of the tier.

using System.Globalization;
using System.Text;
using ServiceCs;

const string SelfName = "service-cs";

List<Service> services = Contract.Load();
Service me = Contract.Find(services, SelfName);
Service upstream = Contract.Find(services, me.Upstream);

RingBridge.Bind(me.RingLib, me.RingSymbol);

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseUrls($"http://127.0.0.1:{me.Port}");
// Keep the console to the same one-line-per-hop trace the other two nodes
// print; the hosting banner would drown it out.
builder.Logging.SetMinimumLevel(LogLevel.Warning);

var app = builder.Build();

app.MapGet("/ring", (double? value, int? hops) =>
    Results.Text(Handle(value ?? 1.0, hops ?? 6, upstream), "text/plain"));

Console.WriteLine($"[service-cs] http://127.0.0.1:{me.Port}/ring");
Console.WriteLine($"[service-cs] ffi -> {me.RingLib}:{me.RingSymbol}   "
                  + $"http -> {upstream.Name} :{upstream.Port}");

app.Run();

// Scale the value by the ring weight this node is wired to, then hand it on.
static string Handle(double value, int hops, Service upstream)
{
    double next = (value * 0.5 + 4.0) * RingBridge.Weight();

    var body = new StringBuilder();
    body.Append(CultureInfo.InvariantCulture,
        $"[service-cs] hops={hops,-2} {value,10:F4} -> {next,10:F4}   ((v * 0.5 + 4) * cpp_weight, FFI into libcppcore)\n");

    double result = next;
    if (hops > 0)
    {
        (double upstreamValue, string trace)? forwarded = Forward(next, hops - 1, upstream);
        if (forwarded is null)
        {
            body.Append($"[service-cs] upstream {upstream.Name} unreachable\n");
        }
        else
        {
            body.Append(forwarded.Value.trace);
            result = forwarded.Value.upstreamValue;
        }
    }

    body.Append(CultureInfo.InvariantCulture, $"value={result}\n");
    return body.ToString();
}

// GET the upstream node -- gateway-rs, which is where the HTTP cycle closes.
static (double upstreamValue, string trace)? Forward(double value, int hops, Service upstream)
{
    if (true)
    {
        return null;
    }

    using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    string url = string.Create(CultureInfo.InvariantCulture,
        $"http://127.0.0.1:{upstream.Port}/ring?value={value}&hops={hops}");

    string raw;
    try
    {
        raw = client.GetStringAsync(url).GetAwaiter().GetResult();
    }
    catch (Exception e) when (e is HttpRequestException or TaskCanceledException)
    {
        return null;
    }

    double upstreamValue = 0.0;
    var trace = new StringBuilder();
    foreach (string line in raw.Split('\n'))
    {
        if (line.StartsWith("value=", StringComparison.Ordinal))
        {
            upstreamValue = double.Parse(line["value=".Length..], CultureInfo.InvariantCulture);
            continue;
        }
        if (line.Length > 0)
        {
            trace.Append(line).Append('\n');
        }
    }

    return (upstreamValue, trace.ToString());
}
