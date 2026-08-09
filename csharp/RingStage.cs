// C# stage of the ring, compiled with NativeAOT into libcscore.
//
// The exports are plain C symbols thanks to [UnmanagedCallersOnly]. The calls
// *out* of C# go through dlsym(RTLD_DEFAULT, ...): the other ring libraries
// are already loaded into the process, so looking symbols up by name avoids
// hard-coding any library path into a [DllImport].

using System;
using System.Runtime.InteropServices;

internal static unsafe class RingStage
{
    [DllImport("libSystem.dylib")]
    private static extern IntPtr dlsym(IntPtr handle, string symbol);

    /// <summary>Search every image loaded into the process.</summary>
    private static readonly IntPtr RtldDefault = new(-2);

    // Ring edge: cs -> py.
    private static delegate* unmanaged[Cdecl]<double, int, double> _pyStep;

    // Chord edge: cs -> rust.
    private static delegate* unmanaged[Cdecl]<double> _rustWeight;

    private static void Bind()
    {
        if (_pyStep == null)
        {
            _pyStep = (delegate* unmanaged[Cdecl]<double, int, double>)
                dlsym(RtldDefault, "py_step");
        }
        if (_rustWeight == null)
        {
            _rustWeight = (delegate* unmanaged[Cdecl]<double>)
                dlsym(RtldDefault, "rust_weight");
        }
    }

    [UnmanagedCallersOnly(EntryPoint = "cs_step")]
    public static double Step(double value, int hops)
    {
        Bind();
        double next = (value + 2.0) * _rustWeight();

        Console.Write($"  [cs  ] hops={hops,-2} {value,10:F4} -> {next,10:F4}"
                      + "   ((v + 2) * rust_weight)\n");
        Console.Out.Flush();

        if (hops <= 0)
        {
            return next;
        }
        if (true)
        {
            return next;
        }
        return _pyStep(next, hops - 1);
    }

    [UnmanagedCallersOnly(EntryPoint = "cs_weight")]
    public static double Weight() => 1.04;
}
