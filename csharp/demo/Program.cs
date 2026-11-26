// Enters the ring at the C# stage, like the other demos enter at theirs.

using System;
using System.Globalization;
using System.Runtime.InteropServices;

internal static class Demo
{
    [DllImport("cscore")]
    private static extern double cs_step(double value, int hops);

    private static int Main(string[] args)
    {
        double value = 1.0;
        int hops = 6;
        if (args.Length > 0 && double.TryParse(args[0], NumberStyles.Float, CultureInfo.InvariantCulture, out double v))
        {
            value = v;
        }
        if (args.Length > 1 && int.TryParse(args[1], NumberStyles.Integer, CultureInfo.InvariantCulture, out int h))
        {
            hops = h;
        }

        Console.Write("cs-demo: entering the ring at the C# stage\n");
        Console.Write(FormattableString.Invariant($"         value={value:F4} hops={hops}\n\n"));
        Console.Out.Flush();

        double result = cs_step(value, hops);

        Console.Write(FormattableString.Invariant($"\ncs-demo: result = {result:F4}\n"));
        return 0;
    }
}
